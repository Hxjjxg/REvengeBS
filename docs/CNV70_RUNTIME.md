# CN V70 live code and layout evidence

This log supplements CNV70_PORT.md. Findings below combine read-only device bytes, exact Revenge V68 caller comparisons, and IDA reconstruction. No gameplay feature has been validated in a private match.

## Why the packaged IDB was incomplete

The packaged source SHA-256 is `9555B29E432CE8E478BCDBDA37008DA1A757B4EA6F37454A1EA69D2D627243C5`. Its client-getter area does not contain the instructions actually running at the same RVAs. XOR `0x58` decodes some packaged bytes into plausible ARM64 code, but that code does **not** match the runtime getter sequence; it is not an accepted restoration method.

After relaunch with `adb shell am start -n com.tencent.tmgp.supercell.brawlstars/com.supercell.titan.tencent.GameAppTencent`, PID `2118` exposed Gadget and `libg.so` at `0x75A8C20000`. A minimal Frida script returned `ping: true` and delivered getter bytes. A later new client stalled at process enumeration. Root access (`uid=0`, KernelSU context) permitted direct reads through `/proc/2118/mem`, independently reproducing those bytes.

## Executable snapshot

Reproduction, using a **current** PID and module base determined from the running client:

```powershell
python tools/cnv70_code_snapshot.py G:\Brawlstars-CN-V70\lib\arm64-v8a\CNV70libg.so G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so --serial PJ696HEY9DNRLFFQ --pid 2118 --base 0x75a8c20000
```

The utility verifies the live ELF64 header against the source, reads executable sections with rooted ADB, and writes a separate ELF plus JSON metadata. It does not alter process memory. Other sections remain the packaged data, including encoded read-only data and relocation-backed tables. The capture is sequential, not an atomic process snapshot, and may contain runtime instrumentation.

| Artifact | SHA-256 |
|---|---|
| `analysis/runtime/CNV70libg.live-2118.so` | `C85A93BF497D912A1DA7DB2BC315E8C8F9A8207557D330B4313015C0C3139624` |
| Snapshot `.text` (22,058,016 bytes) | `988D19C475BF6C0EB27DD9FCF231E7F406EC0534B510C1C8D899C65E377F7960` |
| Snapshot `.plt` (11,280 bytes) | `06B0D92D39330B3CDECE3E2E3D0C435D48F918A46CA25C731AE4478132FE21A7` |

There are 5,527,753 changed `.text` bytes and zero changed `.plt` bytes. A separate file comparison verified all bytes outside these executable sections remain identical to the source.

The original IDA session `9119f77b` was backed up to `analysis/runtime/CNV70libg.before-live-getters.i64`. Only `0x1928320..0x1928327` and `0x1928694..0x1928777` were then restored in that analysis database. Seven getter entrypoints were defined, annotated with provenance, and named with the analyst prefix `CNV70_Client_`. The resulting IDB copy is `analysis/runtime/CNV70libg.live-getters.i64`. No changes were applied to the packaged ELF or target process.

Headless opens did not provide a usable session; the bundled open script also encountered a missing `structuredContent` property. A separate GUI launch did not register and no new IDA process was present afterward. The existing healthy MCP session supplied the getter decompilations.

## Client object foundation

| Meaning | RVA | Live instruction / field |
|---|---:|---|
| Client data pointer | `0x1928320` | `LDR X0,[X0,#0x10]; RET` |
| Client global ID | `0x192869C` | `LDR W0,[X0,#8]; RET` |
| X | `0x19286F0` | `LDR W0,[X0,#0x30]; RET` |
| Y | `0x19286F8` | `LDR W0,[X0,#0x34]; RET` |
| Z | `0x1928700` | `LDR W0,[X0,#0x40]; RET` |
| XY vector address | `0x1928708` | `ADD X0,X0,#0x30; RET` |
| Team resolver | `0x1928710` | Owner index `+0x44`; fallback raw team `+0x48` |

The data getter appears at matching semantic positions in exact V68 `B3284C/B28C34` and V70 `18EFDB4/18E4E90` callers. X/Y calls are paired in hundreds of rendering/battle callsites. V70 `BB1580` and `BB182C` pass X/Y/Z together to a position helper. The team resolver indexes a supplied owner/player list using `+0x44`, calls `1A4EB20` for the selected owner, and falls back to `+0x48` if the lookup is invalid or returns -1. Its second argument is a list structure, not established as a direct battle pointer.

The generic manager accessors `1937DD8` (data `+0x20`) and `1937DE0` (ID `+8`) are separate functions. The client manager lookup calls `192869C`. They must not be conflated merely because their ID field offsets agree.

Machine-readable bytes, capture provenance, and IDA pseudocode are in [evidence/cnv70-live-getters.json](evidence/cnv70-live-getters.json).

## Character and source-scanner assumptions

The exact V68 body-reference deserialization path calls manager lookup and stores the result at character `+0x3E8`. The corresponding live V70 path calls `192D3F0` at `18EBB30` and stores the result at `+0x420` at `18EBB3C`, including the same null fallback. This is strong field-identity evidence; match values remain unobserved.

Two existing scanner labels are unsupported by their source semantics:

- `GameObj_deadFlag=+0xD0`: source `B320C0/B32A88` free an array at this field and elements using the associated count. A nonzero pointer does not establish that a character is dead.
- `LogicCharacterClientOwn_speedBuff=+0x1FC`: source constructor initializes a status aggregate at `+0xF0`, a nested aggregate at `+0x20`, and its accumulator at `+0xEC`. The contributing data field `+0x10C` is loaded under the string `LifeSteal` in `BA414C/BA4A7C/BA4A9C`. This does not establish a movement-speed increment.

Live V70 movement code provides a stronger current-speed candidate at character `+0x250`: deserialization stores tag `0x115` there at `18ED664`; movement drain `18F0728` reads it at `18F0F68`, clamps it, and uses it in movement-step calculations. Prediction code `18F1660` also requires it to be positive. Exact V68's corresponding deserialized/current-speed field is `+0x234`. Match values remain unobserved.

The native V70 alive predicate at `18EE794` reads signed character health `+0xCC` and returns whether it is greater than zero. Character constructor `18EAE2C` installs vtable `1EB1570`; own/predicted constructor `18F0578` installs `1EB15D0`; both use this predicate at virtual slot `+0x30`. Deserialization at `18EBD00` stores the serialized health field at `+0xCC`, and matched rendering callers use the predicate. This supplies an alive-state gate instead of the old pointer-array test.

## Projectile foundation

| Meaning | V70 |
|---|---:|
| Allocation size | `0x238` |
| Constructor / reset | `0x193C78C / 0x193C804` |
| Deserializer / copy | `0x193C878 / 0x193CD40` |
| Client data accessor | `0x193CC00`, branches to `1928320` |
| Instance vtable RVA | `0x1EB1BC8` |
| Target X/Y fields | `+0x1F4 / +0x1F8` |
| Target X/Y getters | `0x193CDDC / 0x193CDE4` |
| Latest prediction X/Y | `+0x230 / +0x234` |
| Data speed / radius | `0x18A4FC0` (`+0x124`) / `0x18A5040` (`+0x130`) |
| Data rendering | `0x18A5264` (`+0x114`) |

Factory `192878C` allocates 0x238 and calls the ctor with data in X1; base ctor `19281DC` stores it at `+0x10`. The copy routine corresponds to exact V68 `B6F6AC`, and the deserializer to `B6F278`. Rendering update calls the target getters together at `BD7FE8/BD7FF4`.

Packaged ELF relocation entries anchor the ctor-installed vtable slots: `+0/+8` are destructors `193CE60/193CF0C`; `+0x18` is reset `193C804`; `+0x20` is deserialize `193C878`; `+0x28` is kind getter `193CC04` (returns 1). These are instance methods, not the projectile-data vtable.

Old projectile field `+0x1D4` migrates to `+0x20C`, but the renderer compares it against 1 and 2. The scanner's name `Projectile_angle` and degrees interpretation are unproven. Likewise, client `+0x38` is now an owned pointer, not Z. A fixed delta cannot migrate the entire object.

## Command foundation

Live code identifies ctor `19CAA04`, encoder `19CAAFC`, and insertion `F2CA40`. Native callers allocate 0x48 bytes. Type is `+8`, X/Y are `+0xC/+0x10`, and skill-data pointer remains `+0x40`. The sequence is `+0`.

The signer and encoder independently use token `+0x38`, superseding the source script's hardcoded `+0x34`. Native signing supports types through `0x17`. Battle hash-enabled/key remain `+0x70/+0x60`. Exact type constants and masks were recovered from decoded read-only data rather than the packaged snapshot's static data.

Root read-only capture of RVA `0x3AD000`, size `0x10000`, is stored at `analysis/runtime/CNV70.rodata-3ad000.bin`, SHA-256 `9476966E0E9FC4B7F308C043C3C2F643F3E26B33DBF0561221F2ABDA94BC4740`. It includes:

- Inner mask at `3AF710`: `7c4d1aabd7c560bef2e358399485210f`.
- Outer mask at `3B18B0`: `162770c1bdaf0ad498893253feef4b65`.
- Type dispatch bytes at `3BC75E`: `4700151b0c27301e391236090f2d06180321333f242a3c42`.

Dispatch entries select native blocks at `C5EBC4 + entry*4`. Each block loads a constant as four packed 16-bit lanes; their low bytes reconstruct the logical uint32. The masks and logical constants for types 0–22 match exact V68. Type 23 adds `0x5B6C7D8E`; other types use fallback `0xDEADBEEF`. The complete recovered constants and pure computation are implemented in `agent/core/cnv70-signing.js`.

The 20-byte message is the 16 bytes from command `+4` rotated left by four bytes, followed by the little-endian logical type constant. The two SHA-256 blocks use the key XOR the respective 16-byte mask, followed by 48 bytes of `0x36` or `0x5C`. The token is `digest[0] | ((digest[1] & 0x7F) << 8)`, clamped to at least 1. Native rotate/byte-order operations at `C5EE7C/C5EEA4` and token extraction at `C5F2CC..C5F2DC` support this reconstruction.

`tests/cnv70-signing.test.mjs` compares the JavaScript implementation with independent Python `hashlib` vectors for types 0, 2, 9, 22, 23, 24, and unsigned `0xFFFFFFFF`, including a typed-array view with a nonzero byte offset and truncated-input rejection. All eight tests passed. The updated diagnostic bundle compiled with `frida-compile`.

The diagnostic's opt-in `startsigning()` hooks natural calls to `F2CA40`, reads the battle's signing flag/key and command bytes, and reports only whether its calculation matches command `+0x38`. It does not construct, sign, or enqueue commands. It stops after 20 inputs or an explicit stop. Startup uses a shared pending promise and cancellation generation to prevent duplicate or late hooks. Four mocked lifecycle tests cover concurrent starts, stop-before-module-resolution, cancellation/restart, and automatic cleanup; all pass alongside the eight signing tests.

The final rebuilt diagnostic was tested after a controlled relaunch on Gadget PID `12226`: `startsigning()`, `stopsigning()`, and `stop()` each returned `true`, followed by successful unload/detach. A second-client enumeration stall was also reproduced on the preceding still-live locked PID `5483`; its bounded check exited and the reason is not established. No natural input/token check was observed while locked. Pure vectors and hook setup alone do not prove native-token equivalence on the device.

The named import at allocator PLT `1DAFBC0` is misleading in the packaged analysis. Allocation semantics must follow live code, callsites, and the exact V68 match rather than that label.

## Runtime probe lifecycle and remaining test

`agent/core/cnv70-layout.js` holds the recovered partial V70 profile and is used by the signing diagnostic. The legacy V68 entry point does not load it. All profile function RVAs were checked against disassembly of the captured executable; private-match object values remain unverified.

`tools/cnv70_probe.py` reads the recovered data, ID, X/Y/Z, owner, and raw-team fields. It scans a bounded manager window, prioritizes the own object and a projectile, and reads health/current-speed/body or target coordinates only for confirmed instance vtables. It separately reports team accessor `+0xEC` and the raw `+0xE4` value used in team-resolution comparisons. It counts successful samples rather than failed reads, bounds unreasonable manager counts, and exits on sample limit, detach, or a deadline. A `--duration 3` run against the unresponsive Gadget enumeration returned `Probe deadline reached.` and `Probe stopped.` with exit code 0; no probe process remained. Private-match sample completion remains untested.

The phone is still at keyguard. No private friendly/practice match has been entered by this work. The next gameplay gate is to observe the candidate tick `1A1E198`, manager objects, and relationships during the agreed private mode, then migrate scanner-backed features and native command behavior against that evidence.
