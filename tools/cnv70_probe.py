import json
import threading

import frida


DEVICE = "127.0.0.1:27042"
TICK_RVA = 0x1A1E198

AGENT = r"""
const game = Process.getModuleByName("libg.so");
let hits = 0;
let listener = null;

listener = Interceptor.attach(game.base.add(TICK_RVA), {
    onEnter(args) {
        if (++hits > 5) return;

        try {
            const self = args[0];
            const manager = self.add(0x28).readPointer();
            const array = manager.readPointer();
            const count = manager.add(0x0c).readU32();
            const objects = [];

            for (let i = 0; i < Math.min(count, 4); i++) {
                const object = array.add(i * 8).readPointer();
                objects.push({pointer: object.toString(), id: object.add(8).readU32()});
            }

            send({event: "tick", hit: hits, self: self.toString(),
                manager: manager.toString(), array: array.toString(),
                count: count, sample: objects});
        } catch (error) {
            send({event: "read_error", hit: hits, error: String(error)});
        }

        if (hits === 5) listener.detach();
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
