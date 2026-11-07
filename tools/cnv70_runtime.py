"""Bounded, single-connection V70 observation/private-match test runner."""

import argparse
import json
from pathlib import Path
import threading
import time

import frida


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, default=Path("tmp/cnv70-agent.js"))
    parser.add_argument("--signing-bundle", type=Path)
    parser.add_argument("--duration", type=float, default=120)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--debug", action="store_true", help="Include agent setup and feature logs")
    parser.add_argument("--options-file", type=Path, help="JSON object of feature option objects")
    parser.add_argument("--gradient-index", type=int, help="Select a gradient by its zero-based catalog index")
    parser.add_argument("--feature", action="append", default=[],
                        choices=["pin", "spray", "spinner", "camera", "autododge", "esp", "aimbot", "holdshoot", "killaura",
                                 "speedhack", "fps", "fpsunlock", "gradient", "brawltv", "spec", "chatspam", "turnshot"])
    args = parser.parse_args()
    if args.duration <= 0:
        parser.error("Duration must be positive")
    setters = {"gradient": "setgradientopts", "chatspam": "setchatspamopts", "killaura": "setkillauraopts"}
    options = json.loads(args.options_file.read_text(encoding="utf-8-sig")) if args.options_file else {}
    if not isinstance(options, dict) or any(key not in setters or not isinstance(value, dict)
                                            for key, value in options.items()):
        parser.error("Options must be an object containing gradient, chatspam or killaura option objects")
    if any(key not in args.feature for key in options):
        parser.error("Each configured feature must also be enabled with --feature")
    if args.gradient_index is not None and (args.gradient_index < 0 or "gradient" not in args.feature):
        parser.error("--gradient-index requires --feature gradient and a nonnegative index")
    # Resolve inputs before connecting; missing builds must not leave a session.
    source = args.bundle.read_text(encoding="utf-8")
    signing_source = args.signing_bundle.read_text(encoding="utf-8") if args.signing_bundle else None
    output = args.output.open("w", encoding="utf-8") if args.output else None
    done = threading.Event()
    cancellation = frida.Cancellable()
    deadline = threading.Timer(args.duration, cancellation.cancel)
    deadline.daemon = True
    session = None
    scripts = []
    agent = None
    signing = None

    def emit(event, **values):
        line = json.dumps({"event": event, **values}, ensure_ascii=True)
        print(line, flush=True)
        if output:
            output.write(line + "\n")
            output.flush()

    def on_message(message, data):
        emit("message", message=message)

    deadline.start()
    started = time.monotonic()
    try:
        with cancellation:
            device = frida.get_device_manager().add_remote_device("127.0.0.1:27042")
            target = next((p for p in device.enumerate_processes() if p.name == "Gadget"), None)
            if target is None:
                raise RuntimeError("Running CN Gadget not found")
            session = device.attach(target.pid)
            session.on("detached", lambda *unused: done.set())
            agent = session.create_script(source)
            scripts.append(agent)
            agent.on("message", on_message)
            agent.load()
            if args.debug:
                agent.exports_sync.setdebug(True)
            emit("start", pid=target.pid, result=agent.exports_sync.start({"profile": "cnv70"}))
            emit("profile", value=agent.exports_sync.runtimeprofile())
            agent.exports_sync.observescanner(True)
            if args.gradient_index is not None:
                catalog = agent.exports_sync.listgradients()
                emit("gradient_catalog", value=catalog)
                if args.gradient_index >= len(catalog):
                    raise ValueError("Gradient index outside the available catalog")
                options["gradient"] = {"name": catalog[args.gradient_index]}
            for feature, feature_options in options.items():
                getattr(agent.exports_sync, setters[feature])(feature_options)
                emit("options", name=feature, value=feature_options)
            if signing_source:
                signing = session.create_script(signing_source)
                scripts.append(signing)
                signing.on("message", on_message)
                signing.load()
                emit("signing_start", result=signing.exports_sync.startsigning(4096))
            # Features are opt-in CLI arguments, used only in a private match.
            for feature in args.feature:
                agent.exports_sync.togglefeature(feature, True)
                emit("feature", name=feature, enabled=True)
            while not done.is_set() and time.monotonic() - started < args.duration:
                emit("scanner", value=agent.exports_sync.scannerstatus())
                done.wait(min(1, max(0, args.duration - (time.monotonic() - started))))
    except frida.OperationCancelledError:
        emit("deadline")
    except KeyboardInterrupt:
        emit("interrupted")
    finally:
        cancellation.cancel()
        deadline.cancel()
        cleanup = frida.Cancellable()
        timer = threading.Timer(5, cleanup.cancel)
        timer.daemon = True
        timer.start()
        cleanup_errors = []

        def attempt(name, action):
            try:
                result = action()
                if name == "prepare_unload":
                    emit("prepared", value=result)
                    if isinstance(result, dict) and result.get("ready") is False:
                        cleanup_errors.append(name)
            except Exception as error:
                cleanup_errors.append(name)
                emit("cleanup_error", action=name, error=type(error).__name__)

        try:
            with cleanup:
                if agent is not None and not agent.is_destroyed:
                    for feature in args.feature:
                        attempt("disable_" + feature, lambda: agent.exports_sync.togglefeature(feature, False))
                    attempt("stop_scanner", lambda: agent.exports_sync.observescanner(False))
                    attempt("prepare_unload", lambda: agent.exports_sync.prepare_unload())
                if signing is not None and not signing.is_destroyed:
                    attempt("stop_signing", lambda: signing.exports_sync.stop())
                for script in reversed(scripts):
                    if not script.is_destroyed:
                        attempt("unload", script.unload)
                if session is not None and not session.is_detached:
                    attempt("detach", session.detach)
                emit("cleanup", completed=not cleanup_errors, failures=cleanup_errors)
        finally:
            timer.cancel()
            emit("stopped")
            if output:
                output.close()


if __name__ == "__main__":
    main()
