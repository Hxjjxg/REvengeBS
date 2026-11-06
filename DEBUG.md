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
