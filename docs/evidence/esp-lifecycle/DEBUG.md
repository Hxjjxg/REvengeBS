# ESP unload crash investigation, 2026-11-07

## Observations

The user reports camera, FPS label and ESP visuals work in training, but ESP
cleanup crashes the game. test-esp.jsonl records PID 21998, 1,717 ticks, no scanner
error, prepared ready=true and cleanup completed=true. Those are RPC outcomes,
not evidence of survival after detach. Crash log records PID 21998 SIGSEGV at
19:14:19 on Thread-15, fault 0x18, PC 0x74c2c4f6d0 in an anonymous mapping.
The tombstone is saved locally as tmp/esp-tombstone-02.txt. The game has since
been relaunched into the lobby; do not enter a match during investigation.

## Hypotheses

1. ROOT: dangling NativeCallback in the EGL GOT after unload. egl.js prefers
   patchSwapBuffersGOT, writes _hookCb to a native import slot, and never restores
   that slot. resetESP only clears geometry. Supports unload-only timing and
   anonymous crash location. Exact PC ownership remains unestablished.
   Experiment: actual-source mock installs the hook and simulates script release;
   assert no native import slot still references script-owned callbacks.
2. GL context/state corruption. ESP changes GL state and does not fully restore
   it. Visual operation succeeds, conflicting with failure only on unload.
   Experiment: compare no-draw hook install/unload with drawing enabled.
3. FPS or shared cleanup invalidates a resource used by rendering. FPS ran in the
   same PID earlier, so source and earlier crashes must be considered. resetESP
   frees no native GL objects. Experiment: isolated ESP on a fresh process.

## Experiments

The actual-source lifecycle fixture reproduced the ownership leak: all three
tests failed on the original source, including a slot retaining a script-owned
NativeCallback, no detach handle, and an unsafe GOT fallback when attach fails.
This confirms a concrete lifecycle defect, though the exact device crash PC has
not been symbolized and additional crash causes are not ruled out.

## Fix

Remove raw GOT callback replacement. Use Interceptor.attach, retain its handle,
deduplicate listeners, and explicitly clear listeners/detach before agent
cleanup. A missing attach now fails rather than installing a raw callback.
The fixture covers import ownership, late dispatch, repeated disposal/reinstall,
and attach failure. Device survival and overlay visibility need separate checks.

## Validation and user retest

The user reports the fixed ESP test completed without problems. The saved
tmp/test-esp-fixed.jsonl includes successful Interceptor hook installation,
active overlay updates (for example drawn=3, self=true, 2412x1080), 5,307 update
calls, prepared ready=true and cleanup completed=true. Combined with the user's
post-cleanup survival report this verifies the observed regression on-device.
Other independent feature tests remain outstanding.

All 34 JavaScript tests and the Python cleanup test pass. The V70 and V68 bundles
are rebuilt. A --debug runner switch and successful ESP hook-install log make
the replacement hook observable. This fix removes a demonstrated ownership
defect; the precise tombstone PC remains unsymbolized and device crash resolution
is not yet claimed. Camera/FPS/ESP visuals are user-confirmed on the prior build;
ESP unload is known to fail on that build.

The user will enter training manually and run:

```powershell
Set-Location G:\Repo\REvengeBS
adb forward tcp:27042 tcp:27042
& G:\frida16\.venv\Scripts\python.exe -u tools/cnv70_runtime.py `
  --duration 60 --debug --feature esp --output tmp/test-esp-fixed.jsonl
```

Verify overlay visibility, wait for cleanup or Ctrl+C once, then keep playing for
at least 15 seconds. Report whether the same game process survives and the
overlay disappears. The host cleanup result alone does not prove survival.
