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
    parser.add_argument("--feature", action="append", default=[],
                        choices=["pin", "spray", "spinner", "camera", "autododge", "esp", "aimbot", "holdshoot", "killaura",
                                 "speedhack", "fps", "fpsunlock", "gradient", "brawltv", "spec", "chatspam"])
    args = parser.parse_args()
    if args.duration <= 0:
        parser.error("Duration must be positive")
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
            emit("start", pid=target.pid, result=agent.exports_sync.start({"profile": "cnv70"}))
            emit("profile", value=agent.exports_sync.runtimeprofile())
            agent.exports_sync.observescanner(True)
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
