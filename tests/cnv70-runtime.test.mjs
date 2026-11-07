import assert from "node:assert/strict";
import test from "node:test";
import { offsets, selectOffsetProfile } from "../agent/core/offsets.js";
import { cnv70Offsets } from "../agent/core/cnv70-offsets.js";
import { computeCNV70Token } from "../agent/core/cnv70-signing.js";

// Exercise the shared scanner and sender against distinct native-layout fixtures.
// Unmapped reads throw, exposing accidental V68 field use.
const regions = [];
let unreadableAddress = null;
class Pointer
{
    constructor(value) { this.value = Number(value); }
    add(offset) {
        if (!Number.isFinite(offset)) throw new Error("Unmapped offset");
        return new Pointer(this.value + offset);
    }
    equals(other) { return this.value === other.value; }
    isNull() { return this.value === 0; }
    toString() { return "0x" + this.value.toString(16); }
    slice(size) {
        if (this.value === unreadableAddress) throw new Error("Injected unreadable memory");
        const region = regions.find(r => this.value >= r.start && this.value + size <= r.start + r.buffer.length);
        if (!region) throw new Error("Unmapped read: " + this);
        return region.buffer.subarray(this.value - region.start, this.value - region.start + size);
    }
    readPointer() { return new Pointer(Number(this.slice(8).readBigUInt64LE())); }
    readU32() { return this.slice(4).readUInt32LE(); }
    readS32() { return this.slice(4).readInt32LE(); }
    readU8() { return this.slice(1)[0]; }
    readByteArray(size) { return Uint8Array.from(this.slice(size)).buffer; }
    readUtf8String(size) { return this.slice(size).toString("utf8"); }
    writeU32(value) { this.slice(4).writeUInt32LE(value >>> 0); }
    writeS32(value) { this.slice(4).writeInt32LE(value); }
    writePointer(value) { this.slice(8).writeBigUInt64LE(BigInt(value.value)); }
    writeByteArray(value) { this.slice(value.byteLength).set(new Uint8Array(value)); }
}
globalThis.ptr = value => new Pointer(value);
globalThis.Process = { pointerSize: 8, arch: "arm64" };
let next = 0x10000;
function allocate(size) {
    const result = ptr(next);
    regions.push({ start: next, buffer: Buffer.alloc(size) });
    next += size + 0x100;
    return result;
}
const base = ptr(0x10000000);
const implementations = new Map();
const bindings = [];
globalThis.NativeFunction = function(address) {
    const rva = address.value - base.value;
    bindings.push(rva);
    return implementations.get(rva) || (() => ptr(0));
};
const { initFunctions } = await import("../agent/core/functions.js");
const { initScanner, updateScanner, observeProjectiles, scanData } = await import("../agent/core/scanner.js");
const { sendCommand } = await import("../agent/core/commands.js");
const { state } = await import("../agent/utils/flags.js");
const { castSkill, activateHypercharge } = await import("../agent/helpers/combat.js");

test("explicit profile has no fallback and locks when natives bind", () => {
    assert.equal(offsets.LogicBattleModeClient_update, 0xc21a5c);
    selectOffsetProfile("cnv70");
    assert.equal(offsets, cnv70Offsets);
    assert.equal(offsets.handleJoystick, undefined);
    assert.equal(offsets.GameObj_deadFlag, undefined);
    assert.equal(offsets.LogicCharacterClientOwn_speedBuff, undefined);
    assert.throws(() => selectOffsetProfile("unknown"));
});

test("V70 scanner and command layouts remain distinct from V68", () => {
    const o = cnv70Offsets;
    const bm = allocate(0x500);
    const manager = allocate(0x20);
    const array = allocate(8 * 8);
    const data = allocate(0x400);
    const projectileData = allocate(0x300);
    const name = Buffer.from("hero_icon_shelly");
    const text = allocate(name.length);
    text.slice(name.length).set(name);
    data.writePointer(base.add(o.VTABLE_CHARACTER_DATA));
    data.add(0x44).writeS32(name.length);
    data.add(0x48).writePointer(text);
    data.add(0x20).writeU32(16000007);
    projectileData.add(0x108).slice(2).set([0, 1]);
    projectileData.writePointer(base.add(o.VTABLE_PROJECTILE_DATA));
    const own = allocate(0x500);
    const alive = allocate(0x500);
    const dead = allocate(0x500);
    const npc = allocate(0x500);
    const other = allocate(0x500);
    [own, alive, dead, npc].forEach((character, i) => {
        character.writePointer(base.add(i ? o.VTABLE_CHARACTER_CLIENT : o.VTABLE_OWN_CHARACTER_CLIENT));
        character.add(8).writeU32(i + 10);
        character.add(0x10).writePointer(data);
        character.add(0x30).writeS32(1000 + i * 300);
        character.add(0x34).writeS32(2000);
        character.add(0x44).writeS32(i);
        character.add(0x48).writeS32(i ? 2 : 1);
        character.add(0xcc).writeS32(i === 2 ? 0 : 100);
        character.add(0xd0).writeU32(0x12345678); // Not a dead flag.
        character.add(0x250).writeS32(900 + i);
        array.add(i * 8).writePointer(character);
    });
    other.writePointer(base.add(0x111111));
    array.add(32).writePointer(other);
    const projectile = allocate(0x238);
    projectile.writePointer(base.add(o.VTABLE_PROJECTILE_CLIENT));
    projectile.add(8).writeU32(100);
    projectile.add(0x10).writePointer(projectileData);
    projectile.add(0x30).writeS32(2000);
    projectile.add(0x34).writeS32(2000);
    projectile.add(0x44).writeS32(1);
    projectile.add(0x48).writeS32(2);
    array.add(40).writePointer(projectile);
    const allied = allocate(0x500);
    allied.writePointer(base.add(o.VTABLE_CHARACTER_CLIENT));
    allied.add(8).writeU32(200);
    allied.add(0x10).writePointer(data);
    allied.add(0xcc).writeS32(100);
    allied.add(0x44).writeS32(4);
    allied.add(0x48).writeS32(2); // Raw team differs from the owning player's team.
    array.add(48).writePointer(allied);
    const alliedShot = allocate(0x238);
    alliedShot.writePointer(base.add(o.VTABLE_PROJECTILE_CLIENT));
    alliedShot.add(8).writeU32(201);
    alliedShot.add(0x10).writePointer(projectileData);
    alliedShot.add(0x44).writeS32(4);
    alliedShot.add(0x48).writeS32(2);
    array.add(56).writePointer(alliedShot);
    manager.writePointer(array);
    manager.add(0xc).writeU32(8);
    bm.add(0x28).writePointer(manager);
    bm.add(0xe4).writeU32(1);
    bm.add(0xec).writeU32(99); // Wrong tiny-getter match.
    const bind = (key, fn) => implementations.set(o[key], fn);
    bind("LogicBattleModeClient_getOwnCharacter", () => own);
    bind("LogicBattleModeClient_getOwnPlayerTeam", p => p.add(0xe4).readU32());
    bind("LogicBattleModeClient__getOwnPlayerIndex", () => 0);
    bind("LogicGameObjectClient_getData", p => p.add(0x10).readPointer());
    bind("LogicGameObjectClient_resolveTeam", (p, battle) => {
        assert.ok(battle.equals(bm));
        return p.equals(allied) || p.equals(alliedShot) ? 1 : p.add(0x48).readU32();
    });
    bind("LogicGameObjectClient_getGlobalID", p => p.add(8).readU32());
    bind("LogicGameObjectClient_getX", p => p.add(0x30).readS32());
    bind("LogicGameObjectClient_getY", p => p.add(0x34).readS32());
    bind("LogicCharacterData_getCollisionRadius", () => 60);
    bind("LogicCharacterData_getSpeed", () => 720);
    bind("LogicCharacterClient_getType", p => p.equals(npc) ? 3 : 0);
    bind("LogicCharacterData_isHeroType", type => type === 0 || type === 26);
    bind("LogicData_getInstanceId", () => 7);
    bind("LogicCharacterClient__getWeaponSkill", () => data);
    bind("LogicSkillData__getProjectileData", () => projectileData);
    bind("LogicProjectileData_getSpeed", () => 3000);
    bind("LogicProjectileData_getRadius", () => 80);
    bind("LogicProjectileData_getRendering", () => 3);
    bind("BattleMode_getInstance", () => bm);
    let command = null;
    let inserted = 0;
    const freed = [];
    bind("operator_new", size => { assert.equal(size, 0x48); command = allocate(size); return command; });
    bind("operator_delete", command => freed.push(command));
    bind("ClientInput_constructor_int", (ci, type) => {
        ci.add(4).writeU32(0x11223344);
        ci.add(8).writeU32(type);
        return ci;
    });
    bind("ClientInputManager_addInput", (mgr, ci) => {
        inserted++;
        assert.ok(mgr.equals(manager));
        assert.ok(ci.equals(command));
    });
    initFunctions(base);
    assert.throws(() => selectOffsetProfile("v68"), /after native initialization/);
    initScanner(base);
    state.autododge = true;
    updateScanner(bm, 1234);
    assert.equal(scanData.lastUpdate, 1234);
    assert.equal(scanData.myTeamId, 1);
    assert.equal(scanData.mySpeed, 900);
    assert.equal(scanData.myBrawlerId, 7);
    assert.equal(scanData.myBrawlerName, "SHELLY");
    assert.equal(scanData.throwsOverWalls, false); // Adjacent byte is nonzero.
    assert.equal(scanData.enemies.length, 2);
    assert.deepEqual(scanData.enemies.map(e => e.kind), ["player", "spawnable"]);
    assert.equal(scanData.enemies[0].moveSpeed, 901);
    assert.equal(scanData.projectiles.length, 1);
    assert.equal(scanData.projectiles[0].isThrower, 0);
    assert.equal(scanData.projectiles[0].angle, null);
    state.autododge = false;
    observeProjectiles(true);
    updateScanner(bm, 1240);
    assert.equal(scanData.projectiles.length, 1, "read-only observation works with autododge disabled");
    assert.equal(state.autododge, false);
    observeProjectiles(false);
    updateScanner(bm, 1241);
    assert.equal(scanData.projectiles.length, 0, "disabling observation clears projectile output");
    state.autododge = true;
    const allowedBindings = new Set(Object.values(o).filter(value => typeof value === "number"));
    assert.ok(bindings.every(rva => allowedBindings.has(rva)), "Every native binding must come from the selected V70 profile");

    // End-to-end sender uses the new signer and +38 token, preserving +34.
    const key = Uint8Array.from({length: 16}, (_, i) => i);
    bm.add(0x58).writePointer(manager);
    bm.add(0x60).writeByteArray(key);
    bm.add(0x70).slice(1)[0] = 1;
    assert.equal(sendCommand(2, ci => {
        ci.add(0xc).writeS32(12345);
        ci.add(0x10).writeS32(-1000);
        ci.add(0x34).writeU32(0xaabbccdd);
    }), true);
    assert.equal(command.add(0x38).readU32(), 29087);
    assert.equal(command.add(0x34).readU32(), 0xaabbccdd);
    assert.equal(command.add(0x38).readU32(), computeCNV70Token(key, new Uint8Array(command.add(4).readByteArray(16))));
    // Live recovered kinds2..5 map to [1,1,0,23]; kind5 changed from V68 type18.
    regions.push({start: base.value + o.SkillCommandTypeTable,
        buffer: Buffer.from("01000000010000000000000017000000", "hex")});
    data.add(o.LogicSkillData_kind).writeS32(5);
    assert.equal(castSkill(data, 1000, 2000, 1400, 1800), true);
    assert.equal(command.add(8).readU32(), 23);
    assert.equal(command.add(0xc).readS32(), 400);
    assert.equal(command.add(0x10).readS32(), -200);
    assert.ok(command.add(0x40).readPointer().equals(data));
    assert.equal(activateHypercharge(), true);
    assert.equal(command.add(8).readU32(), 17);
    assert.ok(command.add(0x40).readPointer().isNull());
    const beforeFailure = inserted;
    unreadableAddress = bm.value + 0x60;
    assert.equal(sendCommand(2), false, "A signing read failure must not enqueue an unsigned command");
    unreadableAddress = null;
    assert.equal(inserted, beforeFailure);
    assert.equal(freed.length, 1);
    assert.ok(freed[0].equals(command));
    assert.equal(sendCommand(2, () => { throw new Error("Fill failed"); }), false);
    assert.equal(freed.length, 2);
    bm.add(0x70).slice(1)[0] = 0;
    assert.equal(sendCommand(2), true, "Hash-disabled zero token is valid");
    assert.equal(command.add(0x38).readU32(), 0);
    assert.equal(freed.length, 2);
    updateScanner(ptr(0), 1235);
    assert.equal(scanData.lastUpdate, 0);
    assert.match(scanData.lastError, /Unmapped/);
    assert.equal(scanData.enemies.length, 0);
    assert.equal(scanData.projectiles.length, 0);
});
