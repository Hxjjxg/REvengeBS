import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createMotionTrigger, predictMotionShot } from "../agent/helpers/motion_trigger.js";

const enemy = (x, y = 0) => ({ gid: "123", kind: "player", x, y, ptr: {} });
test("render repeats do not count as stops; reversal and slowdown trigger once", () => {
    const m = createMotionTrigger();
    assert.equal(m.update([enemy(0)], 1000).length, 0);
    assert.equal(m.update([enemy(64)], 1080).length, 0);
    assert.equal(m.update([enemy(64)], 1088).length, 0);
    assert.equal(m.update([enemy(128)], 1160).length, 0);
    assert.equal(m.update([enemy(64)], 1240)[0].reason, "turn");
    assert.equal(m.update([enemy(32)], 1320)[0].reason, "slow");
    assert.equal(m.update([enemy(32)], 1400)[0].reason, "slow");
    assert.equal(m.update([enemy(32)], 1480).length, 0);
});
test("stale, invisible, respawn and teleport samples cannot create motion events", () => {
    const m = createMotionTrigger();
    m.update([enemy(0)], 1000); m.update([enemy(64)], 1080);
    assert.equal(m.update([enemy(0)], 1500).length, 0);
    m.update([], 1580);
    assert.equal(m.update([enemy(64)], 1660).length, 0);
    assert.equal(m.update([enemy(2000)], 1740).length, 0);
    assert.equal(m.update([enemy(2000)], 1820).length, 0);
    m.reset();
    assert.equal(m.update([enemy(0)], 1900).length, 0);
});
test("intercept follows new velocity, stopped targets stay put and impossible shots are rejected", () => {
    const shot = predictMotionShot(0, 0, { x: 1000, y: 0, vx: 0, vy: 800 }, 4000);
    assert.ok(shot.y > 200 && shot.x === 1000);
    assert.deepEqual(predictMotionShot(0, 0, { x: 1000, y: 0, vx: 0, vy: 0 }, 4000), { x: 1000, y: 0 });
    assert.equal(predictMotionShot(0, 0, { x: 1000, y: 0, vx: 5000, vy: 0 }, 4000), null);
    assert.equal(predictMotionShot(0, 0, { x: 1000, y: 0, vx: 0, vy: 0 }, 0), null);
});

function fixture() {
    const source = readFileSync(new URL("../agent/features/turnshot.js", import.meta.url), "utf8")
        .replace(/^import .*;\s*$/gm, "").replace(/export function /g, "function ") +
        "\nthis.api = { updateTurnshot, resetTurnshot };";
    const shots = [];
    const pointer = { isNull: () => false };
    const c = {
        createMotionTrigger, predictMotionShot, state: { turnshot: true },
        scanData: { lastUpdate: 1000, ownCharacter: pointer, myX: 0, myY: 0, enemies: [] },
        getBattleScreen: () => pointer, getBattleScreenTs: () => c.scanData.lastUpdate,
        attackIntervalMs: () => 200, weaponRange: () => 2000,
        skillDataAt: () => ({}), skillProjectileSpeed: () => 4000,
        fireAt: (...args) => { shots.push(args); return true; },
        getWallCacheW: () => 10, getWallCacheH: () => 10,
        losCheck: () => true, BLOCKS_PROJECTILES: 64,
        getFunctions: () => ({}), logInfo() {}, logError(e) { throw Error(e); }
    };
    vm.runInNewContext(source, c);
    const tick = (x, y, now) => {
        c.scanData.lastUpdate = now;
        c.scanData.enemies = [enemy(x, y)];
        c.api.updateTurnshot(now);
    };
    return { c, shots, tick, prime() { tick(1000, 0, 1000); tick(1064, 0, 1080); } };
}
test("actual feature fires on reversal then respects cooldown and disable/reset", () => {
    const f = fixture(); f.prime(); f.tick(1000, 0, 1160);
    assert.equal(f.shots.length, 1);
    assert.ok(f.shots[0][2] < 1000);
    f.tick(1064, 0, 1240);
    assert.equal(f.shots.length, 1);
    f.c.state.turnshot = false; f.tick(1000, 0, 1320);
    assert.equal(f.shots.length, 1);
    f.c.api.resetTurnshot(); f.c.state.turnshot = true;
    f.tick(1000, 0, 1400);
    assert.equal(f.shots.length, 1);
});
test("range, wall, missing map, immunity and competing fire modes veto shots", () => {
    for (const block of [
        c => { c.weaponRange = () => 500; },
        c => { c.losCheck = () => false; },
        c => { c.getWallCacheW = () => 0; },
        c => { c.getFunctions = () => ({ LogicCharacterClient_isImmuneOrUntargetable: () => true }); },
        c => { c.state.killaura = true; }, c => { c.state.holdshoot = true; },
        c => { c.losCheck = (x, y, tx) => tx === 1000; }
    ]) {
        const f = fixture(); f.prime(); block(f.c); f.tick(1000, 0, 1160);
        assert.equal(f.shots.length, 0);
    }
});
