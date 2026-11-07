import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../agent/features/camera.js", import.meta.url), "utf8")
    .replace(/import\s*\{[^}]*\}\s*from\s*"[^"]+";/gs, "")
    .replace(/export function /g, "function ") +
    "\nthis.api = { setupCamera, resetCamera, setCameraOptions, getBattleScreen, getBattleScreenTs };";

function fixture(field = 0x9c4)
{
    const memory = new Map();
    const writes = [];
    let callback;
    let attempts = 0;
    class Pointer
    {
        constructor(address) { this.address = address; }
        add(offset) { return new Pointer(this.address + offset); }
        equals(other) { return this.address === other.address; }
        isNull() { return this.address === 0; }
        readS32()
        {
            if (!memory.has(this.address)) throw new Error("unmapped camera");
            return memory.get(this.address);
        }
        writeS32(value)
        {
            attempts++;
            if (!memory.has(this.address)) throw new Error("unmapped camera");
            memory.set(this.address, value);
            writes.push([this.address, value]);
        }
    }
    const state = { camera: false };
    const context = {
        state, logInfo() {},
        offsets: { BattleScreen__updateCameraParameters: 0x14e6528, BattleScreen_cameraMode: field },
        Interceptor: { attach(_, callbacks) { callback = callbacks.onEnter; } }
    };
    vm.runInNewContext(source, context);
    context.api.setupCamera(new Pointer(0));
    return {
        api: context.api, state, memory, writes,
        get attempts() { return attempts; },
        screen(address, mode) { memory.set(address + field, mode); return new Pointer(address); },
        tick(screen) { callback([screen]); },
        mode(screen) { return memory.get(screen.address + field); },
        invalidate(screen) { memory.delete(screen.address + field); }
    };
}

for (const [field, mode, initial] of [[0x9c4, 3, 0], [0x9c4, 6, 2], [0x90c, 3, 1]])
{
    test(`disable restores ${initial} from mode ${mode} before another native callback (field ${field.toString(16)})`, () =>
    {
        const f = fixture(field), screen = f.screen(0x10000, initial);
        f.api.setCameraOptions({ mode }); f.state.camera = true; f.tick(screen);
        assert.equal(f.mode(screen), mode);
        f.state.camera = false; f.api.resetCamera();
        assert.equal(f.mode(screen), initial);
        assert.equal(f.api.getBattleScreen(), null);
        assert.equal(f.api.getBattleScreenTs(), 0);
    });
}

test("unload restores immediately even while the feature flag remains enabled", () =>
{
    const f = fixture(), screen = f.screen(0x10000, 2);
    f.state.camera = true; f.tick(screen); f.api.resetCamera();
    assert.equal(f.mode(screen), 2);
    const attempts = f.attempts;
    f.api.resetCamera();
    assert.equal(f.attempts, attempts, "repeated reset must not revisit the old pointer");
});

test("battle reset writes nothing and recaptures defaults when a screen address is reused", () =>
{
    const f = fixture(), screen = f.screen(0x10000, 0);
    f.state.camera = true; f.tick(screen);
    f.invalidate(screen);
    const attempts = f.attempts;
    f.api.resetCamera(false);
    assert.equal(f.attempts, attempts, "battle reset must not touch a freed old screen");
    f.screen(screen.address, 2); f.tick(screen);
    f.state.camera = false; f.tick(screen);
    assert.equal(f.mode(screen), 2, "same-address new battle must capture its own default");
});

test("cleanup tolerates an unreadable screen and never revisits it", () =>
{
    const f = fixture(), screen = f.screen(0x10000, 0);
    f.state.camera = true; f.tick(screen); f.invalidate(screen);
    assert.equal(f.api.resetCamera(), false, "unreadable storage must not report restoration");
    const attempts = f.attempts;
    assert.equal(f.api.getBattleScreen(), null);
    f.api.resetCamera();
    assert.equal(f.attempts, attempts);
});

test("ordinary native disable callback still restores the captured default", () =>
{
    const f = fixture(), screen = f.screen(0x10000, 2);
    f.state.camera = true; f.tick(screen);
    f.state.camera = false; f.tick(screen);
    assert.equal(f.mode(screen), 2);
});
