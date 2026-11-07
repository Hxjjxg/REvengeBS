# Camera cleanup investigation

## Observations

The current camera module captures the native default and writes mode 3 or 6 in its camera callback. `resetCamera()` clears the public screen cache only. Both feature disable and `prepareUnload()` call it; restoration currently occurs only on a later native callback with `state.camera` false. Battle transitions also call the same reset function and must remain safe when the old screen has already been freed.

Environment: Windows host, Node actual-source module mock, current repository revision `ac5ac29`. No device writes are part of this investigation.

## Hypotheses

1. **Root hypothesis: cleanup drops the cached screen without restoring its mode.** Supports: the reset has no native write and the only restore is in the callback. Conflicts: a later callback while disabled would restore successfully. Test: apply a mode through the real source callback, reset, and inspect the mock native field without another callback.
2. **The saved default is incorrect.** Supports: retained capture metadata survives a reset. Conflicts: first callback reads the native field before any mode write. Test: compare disable followed by another callback with the original mode.
3. **Restoration is skipped because the native pointer is already unreadable.** Supports: battle transitions can invalidate the previous screen. Conflicts: the reported unload can happen while the screen remains live. Test: reproduce with a fully readable screen, then separately invalidate the old pointer during a cache-only battle reset.

## Experiments

The reproduction executes the actual camera source with mocked Frida pointer storage and captured Interceptor callback. It changes no production lines. The decisive experiment applies a camera mode and calls reset without a subsequent native camera callback. A second sequence disables the feature and executes the callback to distinguish missing cleanup from a bad default.

Baseline actual-source regression run: 6 tests, 5 failures. Disable retained native mode 3 instead of 0, mode 6 instead of 2, and mode 3 instead of 1. Unload with the feature still enabled retained 3 instead of captured 2. A cache-only reset followed by address reuse restored the old battle's 0 instead of the new battle's 2. Unreadable-pointer reset did not throw. This confirms missing synchronous restoration and independently confirms retained capture metadata can cross battle boundaries. No production lines changed before these failures were recorded.

## Root Cause

Reset clears the screen cache without restoring its applied mode or invalidating the captured default, leaving native mode changes behind on unload and reusing old defaults when a new battle reuses an address.

## Fix

Use `resetCamera(restore = true)` for feature disable/unload: restore only the currently tracked screen when it matches the captured screen and a mode was applied, catch unreadable pointers, then clear screen/default/applied metadata. The return value is true only when the restore write succeeded. Battle transitions use `resetCamera(false)` to clear metadata without accessing a potentially freed old screen. The parent agent made that single main-entry call-site adjustment. Regression checks cover immediate disable/unload, repeated resets, unreadable pointers, and battle transition address reuse.

Validation: `node --test tests/cnv70-camera-lifecycle.test.mjs` passes all 7 tests against the actual feature source. It covers V70 camera field `+0x9C4`, both supported modes 3 and 6, and V68 field `+0x90C`. The ordinary disable callback also restores the original mode, rejecting H2 as the cause of the immediate-cleanup failure. The readable-pointer failures reject H3 as a necessary condition. The parent integrated the patch and ran all 29 JavaScript tests plus the Python cleanup test successfully; no device writes or gameplay checks were performed.
