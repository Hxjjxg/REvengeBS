import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../agent/features/fpsunlock.js", import.meta.url), "utf8")
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, "")
    .replace(/export function /g, "function ") +
    "\nthis.api = { setupFpsUnlock, resetFpsUnlock, disposeFpsUnlock };";

function fixture(profile = "cnv70")
{
    const memory = new Map();
    const writes = [];
    const hooks = [];
    const timers = new Set();
    const intervals = [];
    class Pointer
    {
        constructor(address) { this.address = address; }
        add(offset) { return new Pointer(this.address + offset); }
        isNull() { return this.address === 0; }
        readU8() { return memory.get(this.address) || 0; }
        readDouble() { return memory.get(this.address) || 0; }
        writeDouble(value)
        {
            writes.push([this.address, value]);
            memory.set(this.address, value);
        }
    }
    const state = { fpsunlock: false };
    const context = {
        state,
        offsets: {
            Runtime_profile: profile,
            FramerateManager_initialized: 0x128,
            FramerateManager_targetFps: 0x100,
            FramerateManager_capOffset: profile === "cnv70" ? 0x20 : 0x148,
            FramerateManager__setSegment: 0x20,
            FramerateManager__setLimit: 0x30
        },
        ptr: address => new Pointer(address),
        findSwapBuffers: () => new Pointer(0x900),
        setSwapInterval: (_, interval) => intervals.push(interval),
        logInfo() {},
        logEvery() {},
        setInterval(callback) { timers.add(callback); return callback; },
        clearInterval(callback) { timers.delete(callback); },
        Interceptor: {
            attach(pointer, callbacks)
            {
                const hook = {
                    address: pointer.address, callbacks, detached: false,
                    detach() { this.detached = true; }
                };
                hooks.push(hook);
                return hook;
            }
        }
    };
    vm.runInNewContext(source, context);
    return {
        api: context.api, state, memory, writes, hooks, timers, intervals,
        pointer: address => new Pointer(address),
        start() { context.api.setupFpsUnlock(new Pointer(0)); },
        tick() { for (const callback of timers) callback(); },
        ready(target = 120, cap = 144)
        {
            memory.set(0x128, 1);
            memory.set(0x100, target);
            memory.set(0x120, cap);
        },
        swap()
        {
            const hook = hooks.findLast(item => item.address === 0x900 && !item.detached);
            assert.ok(hook, "expected an active swap hook");
            hook.callbacks.onEnter([new Pointer(1)]);
        }
    };
}

test("disabled startup and uninitialized or invalid targets produce no writes or EGL hook", () =>
{
    const f = fixture();
    f.start();
    assert.equal(f.hooks.length, 2);
    assert.equal(f.writes.length, 0);
    f.state.fpsunlock = true;
    f.tick();
    assert.equal(f.writes.length, 0);
    assert.equal(f.hooks.length, 2);
    for (const target of [0, -1, Infinity, NaN])
    {
        f.ready(target);
        f.tick();
        assert.equal(f.writes.length, 0);
        assert.equal(f.hooks.length, 2);
    }
});

test("delayed initialization captures target and cap before the native segment changes them", () =>
{
    const f = fixture();
    f.start();
    f.state.fpsunlock = true;
    f.tick();
    f.ready(90, 120);
    const segment = f.hooks.find(item => item.address === 0x20).callbacks;
    const args = [f.pointer(0x100), f.pointer(0)];
    segment.onEnter(args);
    assert.equal(args[1].address, 2);
    f.memory.set(0x100, 30); // Native segment selection writes its own target.
    segment.onLeave();
    assert.equal(f.memory.get(0x100), 9999);
    f.state.fpsunlock = false;
    f.tick();
    assert.equal(f.memory.get(0x100), 90);
    assert.equal(f.memory.get(0x120), 120);
    assert.ok(!f.writes.some(([address]) => address === 0x248));
});

test("disable restores captured values and removes the EGL hook after one restoring swap", () =>
{
    const f = fixture();
    f.ready();
    f.start();
    f.state.fpsunlock = true;
    f.tick();
    f.swap();
    assert.deepEqual(f.intervals, [0]);
    f.state.fpsunlock = false;
    f.tick();
    assert.equal(f.memory.get(0x100), 120);
    assert.equal(f.memory.get(0x120), 144);
    f.swap();
    assert.deepEqual(f.intervals, [0, 1]);
    assert.ok(f.hooks.findLast(item => item.address === 0x900).detached);
});

test("disposal restores manager values, clears timers and hooks, and reports pending render cleanup", () =>
{
    const f = fixture();
    f.ready();
    f.state.fpsunlock = true;
    f.start();
    f.swap();
    let result = f.api.disposeFpsUnlock();
    assert.equal(result.pendingSwapRestore, true);
    assert.equal(result.pendingTargetRestore, false);
    assert.equal(f.memory.get(0x100), 120);
    assert.equal(f.memory.get(0x120), 144);
    assert.equal(f.timers.size, 0);
    assert.ok(f.hooks.filter(item => item.address !== 0x900).every(item => item.detached));
    f.swap();
    result = f.api.disposeFpsUnlock();
    assert.equal(result.pendingSwapRestore, false);
    assert.ok(f.hooks.every(item => item.detached));
});

test("V68 keeps its cap offset and restores 60 even when disabled before the first timer", () =>
{
    const f = fixture("v68");
    f.state.fpsunlock = true;
    f.start();
    f.hooks.find(item => item.address === 0x30).callbacks.onEnter([f.pointer(0x100)]);
    assert.equal(f.memory.get(0x248), 9999);
    f.state.fpsunlock = false;
    f.tick();
    assert.equal(f.memory.get(0x100), 60);
    assert.equal(f.memory.get(0x248), 60);
});
