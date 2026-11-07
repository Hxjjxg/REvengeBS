import json
import threading

import frida


DEVICE = "127.0.0.1:27042"
TICK_RVA = 0x1A1E198

AGENT = r"""
const game = Process.getModuleByName("libg.so");
let hits = 0;
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
        if (++hits > 10) return;

        try {
            const self = args[0];
            const manager = self.add(0x28).readPointer();
            const array = manager.readPointer();
            const count = manager.add(0x0c).readU32();
            const objects = [];

            for (let i = 0; i < Math.min(count, 6); i++) {
                const object = array.add(i * 8).readPointer();
                objects.push({
                    pointer: object.toString(),
                    vtable: safePointer(object),
                    id: safeU32(object.add(8)),
                    candidateFields: {
                        ownerIndex_3c: safeU32(object.add(0x3c)),
                        team_40: safeU32(object.add(0x40)),
                        state_d0: safeU32(object.add(0xd0)),
                        offset_120: safeU32(object.add(0x120)),
                        offset_234: safeU32(object.add(0x234)),
                        offset_238: safeU32(object.add(0x238))
                    }
                });
            }

            send({event: "tick", hit: hits, self: self.toString(),
                manager: manager.toString(), array: array.toString(),
                count: count, sample: objects});
        } catch (error) {
            send({event: "read_error", hit: hits, error: String(error)});
        }

        if (hits === 10) listener.detach();
    }
});

send({event: "ready", address: game.base.add(TICK_RVA).toString(),
    moduleBase: game.base.toString(), moduleSize: game.size});
""".replace("TICK_RVA", hex(TICK_RVA))


def main():
    device = frida.get_device_manager().add_remote_device(DEVICE)
    processes = device.enumerate_processes()
    target = next((p for p in processes if p.name == "Gadget"), None)
    if target is None:
        raise RuntimeError("Frida Gadget process not found; check the running CN client")

    session = device.attach(target.pid)
    script = session.create_script(AGENT)
    script.on("message", lambda message, data: print(json.dumps(message, ensure_ascii=True), flush=True))
    script.load()

    print("Probe attached. Press Ctrl+C to detach.", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        script.unload()
        session.detach()


if __name__ == "__main__":
    main()
