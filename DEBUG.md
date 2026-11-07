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

## Debug: Repeat diagnostic RPC returned no output

### Observations

- A repeat command attempted to attach to Gadget, load `tmp/cnv70-diagnostic.js`, call `start()`, read `endpoint()`, then call `stop()`; no successful attach or RPC result was captured.
- `exec_command` returned after its default 10-second yield with an empty output string. The returned session metadata was not printed, so the command's completion state was initially unknown.
- A follow-up process query found two Python processes from that invocation still running. Both exact PIDs were stopped; no unrelated process was targeted.
- A broader check found eight older `cnv70_probe.py` clients still waiting. Their exact PIDs were stopped after confirming the game and Gadget were absent; a verification query found no remaining probe processes.
- An earlier saved run of the same diagnostic returned `start: true` and `stop: true`. A separate Frida command still attaches and enumerates Gadget PID `28834`.

### Hypotheses

#### H1: The command was still running because the exec tool yielded at 10 seconds
- Supports: the original call used the default 10-second yield and the Python process remained alive; no exit code or session ID was captured.
- Conflicts: the process remained alive long enough to look stalled, and no RPC result was printed.
- Test: run a minimal Frida attach/load/ping/unload command with a 30-second yield and print the complete command result metadata.

#### H2: The diagnostic's initial `/proc/self/net/tcp` scan blocks inside `start()`
- Supports: the only awaited operation after script load is `start()`, which reads the proc TCP table synchronously.
- Conflicts: the prior diagnostic smoke test returned `start: true` and `stop: true`.
- Test: if minimal RPC succeeds, repeat with the diagnostic and capture its command session ID and final result.

#### H3: The game/Gadget process exited before the minimal ping (root hypothesis)
- Supports: the minimal ping failed with `frida.TransportError: connection closed` during `enumerate_processes`; subsequent ADB checks found no game or Gadget process, while the phone remained at `NotificationShade` with keyguard showing.
- Conflicts: earlier in this turn Frida enumerated Gadget PID `28834`, and the forward still existed on the host.
- Test: after the user unlocks and relaunches the CN client, verify the Gadget PID and device-side listener before retrying the minimal ping.

### Experiments

- No diagnostic code changed. The first repeat did not capture final command metadata, so it is not a reproduced diagnostic failure.
- Minimal experiment: attach to Gadget, load a script that only exports `ping()`, then call it. It failed before attach/script creation with `frida.TransportError: connection closed` during process enumeration (exit code 1).
- Device-side check: host forwarding remained configured and listening, but `adb shell pidof Gadget`, the game process query, and device `/proc/net/tcp*` listener queries returned no Gadget/game PID or port 27042 listener. The current window remained `NotificationShade`; recent logcat had no matching Frida/Gadget crash lines.

### Root Cause

The repeat RPC attempt had no live Gadget/game process behind the still-configured host forward, so Frida could not enumerate a remote process. Why the CN process exited is not established; the diagnostic RPC itself has not been reproduced as faulty.

### Fix

No code fix is justified. Resume testing only after the user unlocks and relaunches the CN client; first confirm the Gadget process and device listener, then run the minimal ping before the diagnostic RPC.

## Debug: Packaged client-getter bytes do not match running code

### Observations and hypotheses

- The original V70 IDB has many code references to `0x1928320`, but no useful function boundary. Raw bytes also obscure the paired coordinate getter region.
- H1: executable protection transforms these regions at runtime. This is supported by recurring encoded instruction bytes and the known difference between valid caller behavior and undecodable targets. Test: compare the same RVA in the running module with the packaged ELF.
- H2: the module base or binary version is wrong. Earlier unchanged anchors matched the IDB, conflicting with a global mismatch. Test: compare unchanged anchors and the ELF header as well as the disputed region.
- H3: tiny-function BinDiff matches selected unrelated scalar getters. Their caller semantics already conflicted with position accessors. Test: compare exact V68/V70 callers and decoded live instructions, rather than accepting a score alone.

### Experiments and conclusion

- Relaunch produced PID `2118`, module base `0x75A8C20000`. A minimal Frida script returned `ping: true` and delivered `1928320 = LDR X0,[X0,#0x10]; RET`, with client X/Y/Z at `19286F0/6F8/700` reading `+0x30/+0x34/+0x40`.
- A subsequent executable snapshot attempt stalled during Frida process enumeration, before reads. It was stopped deliberately to use a different verified read path; no target-process write was attempted.
- Root access independently read the same getter bytes from `/proc/2118/mem`. The full ELF64 header matches the packaged source. A separate executable-only snapshot has 5,527,753 changed `.text` bytes; `.plt` and all non-executable file bytes are unchanged.
- A naive XOR `0x58` decodes some packaged bytes into plausible code, but does not reproduce the runtime getter sequence. It is rejected as a general restoration method.
- Exact caller comparisons corroborate data, ID, coordinates, owner-index `+0x44`, and raw-team `+0x48` semantics. This confirms H1 and rejects H2 for this capture; H3 explains the rejected old scalar matches.

### Analysis changes

The original IDB was backed up before selected getter bytes were restored in the analysis database only. Reconstructed getters were decompiled through MCP, annotated, and saved as a separate IDB copy. The packaged library and device process were not patched. Artifact hashes and reproducible root-capture commands are in `docs/CNV70_RUNTIME.md` and `docs/evidence/cnv70-live-getters.json`.

## Debug: Probe clients survive their useful lifetime

### Root cause and change

The old hook detached after ten callbacks, while Python waited indefinitely on a fresh Event that was never signaled. Device disconnects likewise did not end that wait. The revised probe signals completion after its sample limit or detach, applies a cancellable operation deadline, and bounds cleanup. It also uses the recovered client fields instead of the old owner/team guesses.

### Regression check

`G:\frida16\.venv\Scripts\python.exe -u tools\cnv70_probe.py --duration 3` returned `Probe deadline reached.` followed by `Probe stopped.` and exited with code 0 against the observed stalled Gadget enumeration. A subsequent process query found no `cnv70_probe.py` or snapshot client left running. A private-match sample-limit test remains outstanding.

## V70 command-signing validation checkpoint

Live code and read-only data establish token `+0x38`, the extended type range, and the masks/dispatch constants. The new pure V70 signer passes eight independent Python-hashlib reference tests. The diagnostic compiles and its opt-in `startsigning()` hook compares natural native commands without creating or changing them.

After a controlled relaunch to clear the unresponsive Gadget session, PID `5483` returned `startsigning: true`, `stopsigning: true`, and `stop: true`; script unload and session detach completed. This confirms installation and cleanup only. No `SIGNING_CHECK` command-token result was observed while the device remained locked. Native token equivalence and actual gameplay remain unverified until the private match.

## Debug: Concurrent signing-probe startup

The implementation review reproduced two starts before `libg()` resolves installing two hooks; stop detached only the second handle. A stop before module resolution also allowed a late hook installation. The cause is the listener-only guard before an asynchronous wait. The fix shares the pending start, invalidates pending work with a generation on stop, and checks the generation again after module resolution. Four focused mocked lifecycle tests pass, including both reproduced cases, restart after cancellation, and automatic cleanup at 20 inputs. Together with the eight signing reference tests, all 12 tests pass.

A new Frida client against still-live locked PID `5483` again timed out during enumeration; its bounded smoke harness exited. Following a controlled relaunch and the configured injection delay, the final rebuilt diagnostic on Gadget PID `12226` returned `startsigning: true`, `stopsigning: true`, and `stop: true`, then unloaded/detached. The recurring second-client transport stall remains unexplained; it was not a diagnostic script error. No natural command tokens or in-match objects have been sampled.

## Debug: V70 runtime smoke blocked before script loading

Observed: PID12226 remains alive, root reads work, and device port27042 is listening. A three-second and then a twenty-second bounded run both expire during Frida process enumeration, before script creation or RPC. TCP shows a pending connection and CLOSE_WAIT on Gadget's loopback socket.

Hypotheses: H1 stale Gadget transport/session (supported by recurring second-client stalls and socket state; test controlled relaunch then same harness); H2 V70 runtime startup deadlock (conflicts: startup not reached; test script-load/RPC milestones); H3 missing or exited process/forward (conflicts: PID/listener present; test ADB PID/listener, already passed). No evidence supports changing the runtime code to fix this observation.

Experiment: no code change; use the bounded single-connection harness, first with the existing process (deadline before load), then after one controlled app relaunch. This recovery does not establish why Gadget stalled. It must not be counted as gameplay validation.

## Correction: own-team getter and legacy scanner assumptions

Exact V68 getter C23608 reads E4. V70 1A20358 also reads E4, follows own-index getter1A20350, precedes the matching next function, and appears in native team comparisons. MCP bytes independently confirm both getter sequences. The tiny-function BinDiff1A1FF10 returns EC and is rejected. Other rejected hypotheses were a global structure shift (conflicts with E0 own index) and a version/base mismatch (conflicts with unchanged anchors and exact adjacent callflow).

The V70 adapter uses E4 and the probe now labels EC unresolved. Shared scanner fixtures deliberately set EC=99 while E4=1 and verify team1. The same fixture checks positive health despite nonzero legacy D0, native currentSpeed despite different base speed, proper hero/NPC discrimination, byte-width indirect flags with an adjacent nonzero byte, native data identity rather than pointer low bytes, and sender token38 while preserving34. Fourteen signing/lifecycle/runtime tests pass. These are host regression checks; private-match objects and native token equality remain outstanding.

Recovery result: after the single controlled relaunch, PID13248 accepted the compiled V70 runtime and signing-observer scripts in one session. `start=true`, `startsigning=true`, repeated scanner RPC replies, and cleanup completed with exit0. This rejects runtime-startup deadlock for this build and supports a process/session transport problem in the previous PID. The underlying Gadget second-client stall remains unresolved. Locked-screen zero ticks and zero signing comparisons must not be reported as a match pass.
