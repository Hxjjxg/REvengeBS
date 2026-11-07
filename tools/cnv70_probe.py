import argparse
import json
import threading
import time

import frida


DEVICE = "127.0.0.1:27042"
TICK_RVA = 0x1A1E198

AGENT = r"""
const game = Process.getModuleByName("libg.so");
let hits = 0;
let calls = 0;
let listener = null;

function safeU32(address) {
    try {
        return address.readU32();
    } catch (_) {
        return null;
    }
}

function safePointer(address) {
    try {
        return address.readPointer().toString();
    } catch (_) {
        return null;
    }
}

listener = Interceptor.attach(game.base.add(TICK_RVA), {
    onEnter(args) {
        if (hits >= SAMPLE_LIMIT) return;
        calls++;

        try {
            const self = args[0];
            const manager = self.add(0x28).readPointer();
            const array = manager.readPointer();
            const count = manager.add(0x0c).readU32();
            if (count > 10000) throw new Error("Implausible manager count: " + count);
            if (count === 0) return;
            const ownId = safeU32(self.add(0x100));
            const candidates = [];
            const scanned = Math.min(count, 256);
            for (let i = 0; i < scanned; i++) {
                try {
                    const object = array.add(i * 8).readPointer();
                    if (object.isNull()) continue;
                    const vtable = object.readPointer();
                    candidates.push({object, vtable, id: safeU32(object.add(8)),
                        isCharacter: vtable.equals(game.base.add(0x1eb1570)) ||
                            vtable.equals(game.base.add(0x1eb15d0)),
                        isProjectile: vtable.equals(game.base.add(0x1eb1bc8))});
                } catch (_) {}
            }
            const selected = [];
            function select(candidate) {
                if (candidate && selected.length < 6 && !selected.includes(candidate))
                    selected.push(candidate);
            }
            select(candidates.find(c => ownId !== null && c.id === ownId));
            select(candidates.find(c => c.isProjectile));
            candidates.filter(c => c.isCharacter).forEach(select);
            candidates.forEach(select);
            if (selected.length === 0) return;
            const objects = [];

            for (const candidate of selected) {
                const {object, vtable, isCharacter, isProjectile} = candidate;
                objects.push({
                    pointer: object.toString(),
                    vtable: vtable.toString(),
                    id: candidate.id,
                    data: safePointer(object.add(0x10)),
                    x: object.add(0x30).readS32(),
                    y: object.add(0x34).readS32(),
                    z: object.add(0x40).readS32(),
                    ownerIndex: object.add(0x44).readS32(),
                    rawTeam: object.add(0x48).readS32(),
                    character: isCharacter ? {
                        health: object.add(0xcc).readS32(),
                        alive: object.add(0xcc).readS32() > 0,
                        currentSpeed: object.add(0x250).readS32(),
                        body: safePointer(object.add(0x420))
                    } : null,
                    projectile: isProjectile ? {
                        targetX: object.add(0x1f4).readS32(),
                        targetY: object.add(0x1f8).readS32()
                    } : null
                });
            }

            hits++;
            send({event: "tick", hit: hits, calls: calls, self: self.toString(),
                manager: manager.toString(), array: array.toString(),
                ownId: ownId,
                ownPlayerIndex: safeU32(self.add(0xe0)),
                ownTeam: safeU32(self.add(0xec)),
                resolverComparison_e4: safeU32(self.add(0xe4)),
                count: count, scanned: scanned, truncated: scanned < count, sample: objects});
        } catch (error) {
            if (calls <= 3 || calls % 100 === 0)
                send({event: "read_error", calls: calls, error: String(error)});
        }

        if (hits === SAMPLE_LIMIT) {
            listener.detach();
            send({event: "sample_limit", hits: hits});
        }
    }
});

send({event: "ready", address: game.base.add(TICK_RVA).toString(),
    moduleBase: game.base.toString(), moduleSize: game.size});
""".replace("TICK_RVA", hex(TICK_RVA))


def main():
    parser = argparse.ArgumentParser(description="Read-only CN V70 private-match object probe")
    parser.add_argument("--duration", type=float, default=120)
    parser.add_argument("--samples", type=int, default=10)
    args = parser.parse_args()
    if args.duration <= 0 or args.samples <= 0:
        parser.error("Duration and sample count must be positive")
    done = threading.Event()
    session = None
    script = None
    cancellation = frida.Cancellable()
    deadline = threading.Timer(args.duration, cancellation.cancel)
    deadline.daemon = True
    started = time.monotonic()
    deadline.start()

    def on_message(message, data):
        print(json.dumps(message, ensure_ascii=True), flush=True)
        if message.get("payload", {}).get("event") == "sample_limit":
            done.set()

    try:
        with cancellation:
            device = frida.get_device_manager().add_remote_device(DEVICE)
            processes = device.enumerate_processes()
            target = next((p for p in processes if p.name == "Gadget"), None)
            if target is None:
                raise RuntimeError("Frida Gadget process not found; check the running CN client")

            session = device.attach(target.pid)
            session.on("detached", lambda *unused: done.set())
            script = session.create_script(AGENT.replace("SAMPLE_LIMIT", str(args.samples)))
            script.on("message", on_message)
            script.load()
            print("Probe attached; waiting for private-match samples.", flush=True)
            done.wait(max(0, args.duration - (time.monotonic() - started)))
    except frida.OperationCancelledError:
        print("Probe deadline reached.", flush=True)
    except KeyboardInterrupt:
        print("Probe interrupted.", flush=True)
    finally:
        cancellation.cancel()
        deadline.cancel()
        # Cleanup is also bounded when the Gadget transport is unresponsive.
        cleanup = frida.Cancellable()
        cleanup_deadline = threading.Timer(5, cleanup.cancel)
        cleanup_deadline.daemon = True
        cleanup_deadline.start()
        try:
            with cleanup:
                if script is not None and not script.is_destroyed:
                    script.unload()
                if session is not None and not session.is_detached:
                    session.detach()
        except (frida.InvalidOperationError, frida.TransportError, frida.OperationCancelledError):
            pass
        finally:
            cleanup_deadline.cancel()
        print("Probe stopped.", flush=True)


if __name__ == "__main__":
    main()
