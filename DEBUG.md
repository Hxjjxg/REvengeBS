# Debug: CN V70 Frida attach

## Observations

- Host: Windows, Frida 16.7.19 under `G:\frida16\.venv`; Android device `PJ696HEY9DNRLFFQ` (OPPO PGJM10).
- CN app package `com.tencent.tmgp.supercell.brawlstars` launches and main process PID `14887` was observed.
- `frida-ps -Uai` lists helper processes but not the app's main process.
- `frida -U -p 14887` fails with the exact error `unable to connect to remote frida-server: closed`.
- `/data/local/tmp/re.zyg.fri/config.json` has the CN package target disabled and `start_up_delay_ms` set to `0`; injected library is `/data/local/tmp/re.zyg.fri/libgadget.so`.
- `/data/local/tmp/re.zyg.fri/libgadget.config.so` listens on `127.0.0.1:27042` and has `on_load: wait`.
- Original configs were preserved on-device at `/data/local/tmp/re.zyg.fri/config.json.pre-cnv70` and `/data/local/tmp/re.zyg.fri/libgadget.config.pre-cnv70.bak`.

## Hypotheses

### H1: ZygiskFrida never injects the game target (root hypothesis)
- Supports: target is explicitly `enabled: false`.
- Conflicts: none observed.
- Test: back up the two target config files, enable only the CN target with `start_up_delay_ms: 4000`, set Gadget `on_load` to `resume`, relaunch, then check for Gadget mapping and its listener.

### H2: Gadget is injected but its `wait` startup state prevents the app or endpoint from becoming usable
- Supports: Gadget config says `on_load: wait`; user reports injection instability and asks for resume behavior.
- Conflicts: app currently launches normally, though the target is disabled.
- Test: in the same controlled relaunch, use `on_load: resume` and check app responsiveness plus Gadget listener availability.

### H3: Frida host transport is pointed at the wrong endpoint
- Supports: `-U` reports a closed frida-server connection, while Gadget is configured to listen on localhost port 27042.
- Conflicts: the target is disabled, so there is no evidence Gadget is actually listening.
- Test: after H1/H2 configuration, inspect device listener state and connect explicitly to the Gadget endpoint rather than assuming `-U` is the correct transport.

## Experiments

Changed only the CN target values (`enabled: true`, `start_up_delay_ms: 4000`) and Gadget `on_load` (`resume`). The Gadget file required `cp --remove-destination`; ordinary overwrite and rename were denied. After force-stop/relaunch, Frida 16.7.19 connected through `adb forward tcp:27042 tcp:27042`. `frida-ps -H 127.0.0.1:27042` returned PID `28834` named `Gadget`, and a Frida script enumerated `libg.so` at `0x75a8080000` (mapped size 33,697,792), `libtprt.so` at `0x75bd016000`, and `libtersafe.so` at `0x75bea93000`. The app remained available after Gadget loaded.

## Root Cause

The game target was disabled in ZygiskFrida, so the app had no Gadget endpoint for Frida to attach to; its `on_load: wait` setting was also unsuitable for the requested nonblocking delayed startup.

## Fix

Enabled the CN target with the requested 4000 ms delay and changed Gadget `on_load` to `resume`. The live Frida handshake and module enumeration succeeded. Original configs remain backed up on-device for rollback.

## Debug: V70 battle-update probe has no callback

### Observations

- Current Frida 16.7.19 attach to the running Gadget succeeded through the configured TCP forward. `tools/cnv70_probe.py` emitted `ready` for `libg.so + 0x1A1E198` at runtime address `0x75a9a9e198`, with module base `0x75a8080000` and size `33,697,792` bytes.
- The probe remained attached for several seconds without a `tick` or `read_error` message, then was detached cleanly. The ready event proves script load and address resolution; it does not prove the target function executes.
- ADB reports app PID `28834` in the resumed `GameAppTencent` activity. The UI hierarchy exposes only a game surface and does not establish whether a match is active.
- A device screenshot later showed the home lobby with a promotional event dialog over it. This confirms the earlier probe was run outside a battle.
- The offline V70 IDB is healthy with Hex-Rays and string caches ready, but reports `auto_analysis_ready: false`. Static analysis shows `sub_17060F4` calls `sub_1A1E198` with a `(this, float, float)` signature and the latter traverses manager state. This makes it a plausible match-update function, not a runtime-confirmed one.

### Hypotheses

#### H1: The app was not in an active match (root cause for this no-callback run)
- Supports: the screenshot shows the home lobby and promotional event dialog, not battle gameplay.
- Conflicts: none for this run; this does not establish whether the candidate function is the correct battle callback.
- Test: attach the same read-only probe after entering the private friendly/practice match and wait for up to five calls.

#### H2: `0x1A1E198` is not the repeating in-match callback
- Supports: the BinDiff match for the v68 tick RVA was rejected; the candidate was inferred from one caller and a large function that traverses manager state.
- Conflicts: `sub_17060F4` updates elapsed time and directly calls it with frame-time values.
- Test: in a confirmed match, attach probes to the candidate and caller entry `0x17060F4` separately, one at a time.

#### H3: The loaded client has a global module-base or version mismatch (rejected)
- Supports: the first 16 bytes at `0x1A1E198` differ from the IDB.
- Conflicts: bytes at `0x192F6C8`, `0x1937DE0`, and `0x17060F4` match the IDB at the same RVAs; Frida reports the expected module path and base.
- Test: compare additional unchanged anchors only if later evidence contradicts the current image identity.

#### H4: Runtime code at `0x1A1E198` is redirected to an out-of-module address
- Supports: live bytes are `50 00 00 58 00 02 1f d6 00 57 5a ff 76 00 00 00`, an LDR/BR stub followed by pointer `0x76ff5a5700`; Frida finds no module or memory range for that address, though a byte read there returns another indirect-branch sequence.
- Conflicts: no evidence yet that this redirection prevents `Interceptor.attach` at the entry from observing calls.
- Test: in a private match, hook the entry and a minimal callback to see whether the stub address is reached; do not treat the out-of-module address as a verified function target.

#### H5: The callback is reached but Frida message delivery is failing
- Supports: no callback message arrived.
- Conflicts: the same script delivered its `ready` message, and no `read_error` or script-destroyed event was reported.
- Test: the next in-match run should also emit a counter from a minimal callback with no memory reads.

### Experiments

- Loaded the existing five-hit probe without modifying its code. Result: `ready` delivered, no callback or memory-read event observed, then clean manual detach. This is inconclusive because active-match state was unknown.
- Compared live bytes with the headless IDB. The expected V70 image matches at `0x192F6C8`, `0x1937DE0`, and `0x17060F4`; only `0x1A1E198` is replaced by the indirect branch stub above. This rejects a global base/version mismatch and identifies a local runtime redirection.
- Next experiment: after entering a private match, rerun the probe unchanged. A `tick` event with a plausible manager pointer/count confirms H1; no event keeps H1 unproven and moves the investigation to H2/H4/H5.

### Root Cause

The probe ran on the home lobby, so no battle-update callback was expected. The correctness of `0x1A1E198` as the in-match update hook remains unconfirmed.
