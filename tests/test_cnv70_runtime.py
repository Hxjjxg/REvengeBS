import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class RuntimeCleanupTest(unittest.TestCase):
    def test_rpc_and_unload_failures_do_not_skip_remaining_cleanup(self):
        actions = []

        def fail(name):
            actions.append(name)
            raise RuntimeError("Injected RPC/transport failure")

        class Cancellation:
            def __enter__(self):
                return self

            def __exit__(self, *unused):
                return False

            def cancel(self):
                pass

        class Script:
            is_destroyed = False

            def __init__(self, name):
                self.name = name
                self.exports_sync = SimpleNamespace(
                    start=lambda options: True,
                    runtimeprofile=lambda: {"profile": "cnv70"},
                    observescanner=lambda enabled: None if enabled else fail("stop_scanner"),
                    togglefeature=lambda feature, enabled: None if enabled else fail("disable_pin"),
                    prepare_unload=lambda: fail("prepare_unload"),
                    startsigning=lambda: True,
                    stop=lambda: fail("stop_signing"),
                )

            def on(self, *unused):
                pass

            def load(self):
                actions.append("load_" + self.name)

            def unload(self):
                if self.name == "agent":
                    fail("unload_agent")
                actions.append("unload_signing")

        class Session:
            is_detached = False

            def __init__(self):
                self.names = iter(["agent", "signing"])

            def on(self, event, callback):
                # End the observation loop immediately; exercise real cleanup.
                callback()

            def create_script(self, source):
                return Script(next(self.names))

            def detach(self):
                actions.append("detach")

        device = SimpleNamespace(enumerate_processes=lambda: [SimpleNamespace(name="Gadget", pid=123)],
                                 attach=lambda pid: Session())
        fake_frida = SimpleNamespace(Cancellable=Cancellation,
            OperationCancelledError=type("OperationCancelledError", (Exception,), {}),
            get_device_manager=lambda: SimpleNamespace(add_remote_device=lambda address: device))
        path = Path(__file__).resolve().parents[1] / "tools" / "cnv70_runtime.py"
        spec = importlib.util.spec_from_file_location("cnv70_runner_under_test", path)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frida": fake_frida}):
            spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory) / "agent.js"
            bundle.write_text("// fixture", encoding="utf-8")
            argv = [str(path), "--bundle", str(bundle), "--signing-bundle", str(bundle), "--feature", "pin"]
            output = io.StringIO()
            with patch.object(sys, "argv", argv), contextlib.redirect_stdout(output):
                module.main()
        self.assertEqual(actions, ["load_agent", "load_signing", "disable_pin", "stop_scanner",
                                   "prepare_unload", "stop_signing", "unload_signing", "unload_agent", "detach"])
        events = [json.loads(line) for line in output.getvalue().splitlines()]
        cleanup = next(event for event in events if event["event"] == "cleanup")
        self.assertFalse(cleanup["completed"])
        self.assertEqual(len(cleanup["failures"]), 5)
        self.assertEqual(events[-1]["event"], "stopped")


if __name__ == "__main__":
    unittest.main()
