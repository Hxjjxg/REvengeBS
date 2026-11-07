import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Run the actual feature with imported dependencies replaced by strict fixtures.
// Exposing tick/drain avoids real timers or any Frida/device invocation.
const source = readFileSync(new URL("../agent/features/speedhack.js", import.meta.url), "utf8")
    .replace(/import\s*\{[^}]*\}\s*from\s*"[^"]+";/gs, "")
    .replace(/export function /g, "function ") +
    "\nglobalThis.api = { setupSpeedhack, updateSpeedhack, speedHack };";

// Independent native/layout fixtures: a wrong profile address or field must fail.
const fixtures = {
    v68: {
        game: 0x9bb5e8, getLocalChar: 0xc239b0, setPosition: 0xc23b14,
        getChar: 0x87aa4c, pathfind: 0xc6b2c0, diagFlag: 0xb3284c,
        drainMove: 0xb32ec0, getMainChar: 0x86f3e8,
        charDx1: 0x86eed0, charDx2: 0x86eee0,
        charDy1: 0x86eed8, charDy2: 0x86eee8,
        posX: 0xb5e44c, posY: 0xb5e454,
        flipByte: 0x12ee608, gameUpdate: 0x4d0224,
        gameBattle: 0x28, charCtx: 0x10,
        movingCtl: 0x4d8, movingFlag: 0xba,
        resetSpeed: 0xf70, ctrlPtr: 0x9e8,
        currentSpeed: 0x234, battleSequence: 0xb8
    },
    cnv70: {
        game: 0x16fe760, getLocalChar: 0x1a20700, setPosition: 0x1a20864,
        getChar: 0x15141bc, pathfind: 0x1a87474, diagFlag: 0x18efdb4,
        drainMove: 0x18f0728, getMainChar: 0x14fe170,
        charDx1: 0x14fdecc, charDx2: 0x14fdedc,
        charDy1: 0x14fded4, charDy2: 0x14fdee4,
        posX: 0x19286f0, posY: 0x19286f8,
        flipByte: 0x1faad90, gameUpdate: 0xb3fa7c,
        gameBattle: 0x28, charCtx: 0x10,
        movingCtl: 0x4b8, movingFlag: 0xda,
        resetSpeed: 0x11c0, ctrlPtr: 0xb20,
        currentSpeed: 0x250, battleSequence: 0xb8
    }
};

function createHarness(name, runtimeProfile = name)
{
    const fixture = fixtures[name];
    const memory = new Map();
    const calls = [];
    const bindings = new Map();
    const hooks = [];
    const timers = new Map();
    let nextTimer = 0;
    let allocations = 0;
    let now = 1000;

    class Pointer
    {
        constructor(value) { this.value = value; }
        add(offset) {
            assert.ok(Number.isFinite(offset), "unmapped field offset");
            return new Pointer(this.value + offset);
        }
        isNull() { return this.value === 0; }
        read() {
            assert.ok(memory.has(this.value), "unmapped read: " + this.value.toString(16));
            return memory.get(this.value);
        }
        readPointer() { return this.read(); }
        readU8() { return this.read(); }
        readInt() { return this.read(); }
        writeFloat(value) { memory.set(this.value, value); }
        writeS32(value) { memory.set(this.value, value); }
    }

    const base = new Pointer(0x10000000);
    const mode = new Pointer(0x21000000);
    const screen = new Pointer(0x22000000);
    const hud = new Pointer(0x23000000);
    const clip = new Pointer(0x24000000);
    const battle = new Pointer(0x25000000);
    const character = new Pointer(0x26000000);
    const tileMap = new Pointer(0x27000000);
    const malloc = new Pointer(0x30000000);
    const input = new Pointer(0x40000000);
    memory.set(mode.value + fixture.gameBattle, battle);
    memory.set(mode.value + fixture.charCtx, screen);
    memory.set(screen.value + fixture.ctrlPtr, hud);
    memory.set(hud.value + fixture.movingCtl, clip);
    memory.set(clip.value + fixture.movingFlag, 1);
    memory.set(character.value + fixture.currentSpeed, 720);
    memory.set(battle.value + fixture.battleSequence, 123);
    memory.set(base.value + fixture.flipByte, 0);

    const implementations = {
        game: () => mode,
        getLocalChar: b => { assert.equal(b, battle); return character; },
        setPosition: (b, x, y, flag) => {
            assert.equal(b, battle);
            calls.push(["prediction", x, y, flag]);
        },
        getChar: s => { assert.equal(s, screen); return battle; },
        pathfind: (...args) => {
            assert.equal(args.length, 10);
            assert.equal(args[4], tileMap);
            assert.deepEqual(args.slice(6), [1, 0, 0, 1]);
            return 0;
        },
        diagFlag: c => { assert.equal(c, character); return 1; },
        drainMove: (c, tick, interpolation, b, dt) => {
            assert.equal(c, character);
            assert.equal(b, battle);
            calls.push(["drain", tick, interpolation, dt]);
        },
        getMainChar: () => screen,
        charDx1: () => 0, charDx2: () => 1,
        charDy1: () => 0, charDy2: () => 0,
        posX: () => 100, posY: () => 200
    };
    const state = { speedhack: false };
    const scanData = {};
    const context = {
        Date: { now: () => now }, state, scanData,
        offsets: { Runtime_profile: runtimeProfile, ClientInput_x: 12, ClientInput_y: 16 },
        getDodgeDir: () => null,
        logError: (...args) => { throw new Error(JSON.stringify(args)); },
        logEvery() {}, logInfo() {},
        setInterval(fn, ms) { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
        clearInterval(id) { timers.delete(id); },
        Interceptor: { attach(address, callbacks) {
            assert.equal(address.value - base.value, fixture.gameUpdate);
            hooks.push(callbacks);
        } },
        sendCommand(type, fill) {
            assert.equal(type, 2);
            fill(input);
            calls.push(["send", memory.get(input.value + 12), memory.get(input.value + 16)]);
            return true;
        },
        getFunctions: () => ({ LogicBattleModeClient_getTileMap(b) {
            assert.equal(b, battle);
            return tileMap;
        } }),
        Process: { getModuleByName(moduleName) {
            assert.equal(moduleName, "libc.so");
            return { getExportByName(exportName) {
                assert.equal(exportName, "malloc");
                return malloc;
            } };
        } },
        NativeFunction: function(address, returnType, args) {
            if (address.value === malloc.value) return size => {
                assert.equal(size, 16);
                allocations++;
                return new Pointer(0x50000000);
            };
            const rva = address.value - base.value;
            const name = Object.keys(implementations).find(key => fixture[key] === rva);
            assert.ok(name, "unexpected native RVA: " + rva.toString(16));
            bindings.set(name, { returnType, args: Array.from(args) });
            return implementations[name];
        }
    };
    vm.runInNewContext(source, context, { filename: "speedhack.js" });
    return {
        api: context.api, base, state, scanData, bindings, hooks, calls, timers,
        allocations: () => allocations,
        resetValue: () => memory.get(screen.value + fixture.resetSpeed),
        setMoving: value => memory.set(clip.value + fixture.movingFlag, value),
        advance: ms => { now += ms; }
    };
}

for (const profile of ["v68", "cnv70"])
{
    test(profile + " binds its natives and drives prediction, input and drain with its layout", () =>
    {
        const h = createHarness(profile);
        h.api.setupSpeedhack(h.base);
        h.api.updateSpeedhack();
        assert.equal(h.hooks.length, 0, "disabled feature must not attach its frame hook");
        h.state.speedhack = true;
        h.api.updateSpeedhack();
        h.api.speedHack.tick();
        h.api.speedHack.pending = 1;
        h.api.speedHack.drain();
        assert.equal(h.bindings.size, 14);
        assert.equal(h.allocations(), 1);
        assert.equal(h.hooks.length, 1);
        assert.equal(h.resetValue(), 0);
        assert.equal(h.api.speedHack.config.speedOff, fixtures[profile].currentSpeed);
        assert.deepEqual(h.bindings.get("setPosition"), {
            returnType: "void", args: ["pointer", "int", "int", "bool"]
        });
        assert.deepEqual(h.bindings.get("drainMove"), {
            returnType: "void", args: ["pointer", "int", "int", "pointer", "float"]
        });
        assert.deepEqual(h.calls, [
            ["prediction", 172, 200, 1], ["send", 172, 200], ["drain", 2, 460, 0]
        ]);
        h.setMoving(0);
        h.api.speedHack.tick();
        assert.equal(h.calls.length, 3, "released movement frame must suppress a new target");
        h.advance(100);
        h.api.speedHack.tick();
        assert.equal(h.api.speedHack.enabled, false, "stale battle updates must stop movement");
        assert.equal(h.scanData.hackSpeed, 0);
        assert.equal(h.timers.size, 1, "only the feature poll timer remains after stopping");
    });
}

test("unknown profiles fail before allocation or native binding", () =>
{
    for (const profile of ["future-version", "toString"])
    {
        const h = createHarness("cnv70", profile);
        assert.throws(() => h.api.setupSpeedhack(h.base), /No speedhack mappings/);
        assert.equal(h.allocations(), 0);
        assert.equal(h.bindings.size, 0);
        assert.equal(h.timers.size, 0);
    }
});
