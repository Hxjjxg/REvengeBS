import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../agent/cnv70-diagnostic.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "");

function createHarness()
{
    let resolveModule;
    const moduleReady = new Promise((resolve) => { resolveModule = resolve; });
    const handles = [];
    const messages = [];
    const signature = Uint8Array.from([0x00, 0x08, 0x40, 0xf9, 0xc0, 0x03, 0x5f, 0xd6]);
    const base = {
        add() { return { readByteArray() { return signature.buffer; } }; }
    };
    const battle = {
        isNull() { return false; },
        add() {
            return {
                readU8() { return 1; },
                readByteArray() { return new Uint8Array(16).buffer; }
            };
        }
    };
    const command = {
        add(offset) {
            return {
                readByteArray() { return new Uint8Array(16).buffer; },
                readU32() { return offset === 0x38 ? 123 : 2; }
            };
        }
    };
    const context = {
        rpc: {},
        Process: { arch: "arm64", pointerSize: 8 },
        Uint8Array,
        libg() { return moduleReady; },
        CNV70: {
            functions: {
                LogicGameObjectClient_getData: 0x1928320,
                BattleMode_getInstance: 0x16fe760,
                ClientInputManager_addInput: 0xf2ca40
            },
            fields: {
                BattleMode_hashEnabled: 0x70,
                BattleMode_hashKey: 0x60,
                ClientInput_type: 8,
                ClientInput_token: 0x38
            }
        },
        NativeFunction: function () { return () => battle; },
        Interceptor: {
            attach(address, callbacks) {
                const handle = {
                    callbacks,
                    active: true,
                    detachCalls: 0,
                    detach() {
                        this.detachCalls++;
                        this.active = false;
                    }
                };
                handles.push(handle);
                return handle;
            }
        },
        computeCNV70Token() { return 123; },
        send(message) { messages.push(message); },
        getServerIP() { return "Not connected"; },
        setupIPGrabber() {},
        resetIPGrabber() {}
    };
    vm.runInNewContext(source, context, { filename: "cnv70-diagnostic.js" });
    return {
        rpc: context.rpc.exports,
        handles,
        messages,
        resolveModule() { resolveModule(base); },
        activeHandles() { return handles.filter((handle) => handle.active); },
        naturalInput(handle) { handle.callbacks.onEnter([null, command]); }
    };
}

test("concurrent signing starts install one hook and stop detaches it", async () =>
{
    const harness = createHarness();
    const first = harness.rpc.startsigning();
    const second = harness.rpc.startsigning();
    assert.equal(harness.handles.length, 0);
    harness.resolveModule();
    await Promise.all([first, second]);
    assert.equal(harness.handles.length, 1, "pending starts must share one installation");
    assert.equal(harness.activeHandles().length, 1);
    harness.rpc.stopsigning();
    assert.equal(harness.activeHandles().length, 0, "no overwritten hook handle may remain installed");
    assert.equal(harness.handles[0].detachCalls, 1);
});

test("stop before libg resolves prevents a late hook installation", async () =>
{
    const harness = createHarness();
    const pending = harness.rpc.startsigning();
    harness.rpc.stopsigning();
    harness.resolveModule();
    await pending;
    assert.equal(harness.handles.length, 0, "a cancelled pending start must not attach afterward");
});

test("a fresh start after cancelling a pending start installs only the new hook", async () =>
{
    const harness = createHarness();
    const cancelled = harness.rpc.startsigning();
    harness.rpc.stop();
    const restarted = harness.rpc.startsigning();
    harness.resolveModule();
    await Promise.all([cancelled, restarted]);
    assert.equal(harness.handles.length, 1);
    assert.equal(harness.activeHandles().length, 1);
    harness.rpc.stop();
    assert.equal(harness.activeHandles().length, 0);
});

test("twenty natural input callbacks detach the signing hook and permit restart", async () =>
{
    const harness = createHarness();
    harness.resolveModule();
    await harness.rpc.startsigning();
    const first = harness.handles[0];
    for (let i = 0; i < 20; i++) harness.naturalInput(first);
    assert.equal(harness.messages.length, 20);
    assert.ok(harness.messages.every((message) => message.type === "SIGNING_CHECK" && message.matches === true));
    assert.equal(first.detachCalls, 1);
    assert.equal(harness.activeHandles().length, 0);
    await harness.rpc.startsigning();
    assert.equal(harness.handles.length, 2);
    assert.equal(harness.activeHandles().length, 1);
    harness.rpc.stopsigning();
    assert.equal(harness.activeHandles().length, 0);
});
