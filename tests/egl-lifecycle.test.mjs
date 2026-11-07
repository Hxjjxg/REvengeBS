import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../agent/core/egl.js", import.meta.url), "utf8")
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, "")
    .replace(/export function /g, "function ") +
    "\nthis.api = { hookSwapBuffers, dispose: typeof disposeSwapBuffers === 'function' ? disposeSwapBuffers : null };";

function fixture({ failAttach = false } = {})
{
    const real = { name: "eglSwapBuffers" };
    let slotValue = real;
    const writes = [];
    const hooks = [];
    class Pointer
    {
        constructor(address) { this.address = address; }
        add(offset) { return new Pointer(this.address + offset); }
        and() { return new Pointer(0x1000); }
        readU32() { return this.address === 0x1100 ? 0x90000000 : 0; }
        readPointer() { return slotValue; }
        compare(other) { return this === other ? 0 : 1; }
        writePointer(value) { writes.push(value); slotValue = value; }
    }
    real.compare = other => other === real ? 0 : 1;
    const context = {
        engineModule: () => ({ enumerateImports: () => [{ name: "eglSwapBuffers", address: new Pointer(0x1100) }] }),
        Process: { pointerSize: 8, findModuleByName: () => ({ findExportByName: () => real }) },
        ptr: value => value instanceof Pointer ? value : new Pointer(Number(value)),
        Memory: { protect() {} },
        NativeFunction: function () { return () => 1; },
        NativeCallback: function (callback) { return { scriptOwned: true, callback }; },
        Interceptor: { attach(address, callbacks) {
            if (failAttach) throw new Error("attach unavailable");
            const handle = { callbacks, detached: false, detach() { this.detached = true; } };
            hooks.push(handle);
            return handle;
        } }
    };
    vm.runInNewContext(source, context);
    return { api: context.api, real, hooks, writes, slot: () => slotValue };
}

test("swap observation leaves native import pointers owned by the game", () =>
{
    const f = fixture();
    assert.equal(f.api.hookSwapBuffers(() => {}), true);
    assert.equal(f.slot(), f.real, "unload must not leave a script-owned callback in the native GOT");
    assert.equal(f.writes.length, 0);
    assert.equal(f.hooks.length, 1);
});

test("swap disposal detaches callbacks, is idempotent and permits reinstall", () =>
{
    const f = fixture();
    let calls = 0;
    const callback = () => { calls++; };
    f.api.hookSwapBuffers(callback);
    f.api.hookSwapBuffers(callback);
    assert.equal(f.hooks.length, 1);
    f.hooks[0].callbacks.onEnter(["display", "surface"]);
    assert.equal(calls, 1);
    assert.equal(typeof f.api.dispose, "function");
    f.api.dispose();
    f.api.dispose();
    assert.equal(f.hooks[0].detached, true);
    f.hooks[0].callbacks.onEnter(["display", "surface"]);
    assert.equal(calls, 1, "a late dispatch must not call disposed listeners");
    f.api.hookSwapBuffers(callback);
    assert.equal(f.hooks.length, 2);
    f.hooks[1].callbacks.onEnter(["display", "surface"]);
    assert.equal(calls, 2);
});

test("unavailable interception fails without installing a raw callback fallback", () =>
{
    const f = fixture({ failAttach: true });
    assert.equal(f.api.hookSwapBuffers(() => {}), false);
    assert.equal(f.slot(), f.real);
    assert.equal(f.writes.length, 0);
});
