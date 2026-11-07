# CN V70 port research log

## Scope and current state

This port targets the arm64 CN V70 client in the local workspace `G:\Brawlstars-CN-V70`. The reference agent in this repository targets official Brawl Stars v68.250. Its README explicitly states that its RVAs apply only to that exact `libg.so`; v68 values are leads for matching functions, not valid V70 addresses. The exact RevengeBS v68 reference binary is present at `original-history-i64/libg_REvenge_v68.so` (AArch64, image size `0x13447e8`, 46,267 functions), and the offsets in `agent/core/offsets.js` resolve meaningfully in that binary.

Reference agent areas inventoried so far:

- Runtime core: `core/offsets.js`, `core/functions.js`, `core/scanner.js`, `core/commands.js`, `core/egl.js`, CSV/data table and SC string helpers.
- Gameplay features: aimbot, autododge, camera, chat spam, ESP, FPS display/unlock, gradient cosmetics, hold-shoot, IP grabber, killaura, pin, spectator, speedhack, spinner, and spray.
- Shared helpers: combat, aim lead, dodge profiles/kinds, and wall/visibility cache.

Porting any feature requires validating its function addresses, object layouts, and runtime assumptions against the CN V70 binary. An explicit partial V70 runtime, isolated diagnostic entry point, and read-only probes are present. Several gameplay paths have mapped integrations, but none has passed a private-match test. The latest integrated-runtime checkpoints and evidence documents below supersede earlier unresolved entries.

## V70 binary evidence

Source artifacts in the workspace:

| Artifact | SHA-256 | Size |
|---|---|---:|
| `apk/10040714_com.tencent.tmgp.supercell.brawlstars_a4540874_70.19.2_seGNKd.apk` | `28CFE1C8BA3F25FB273ED0D0F0290F1E2CBEF071CC2C7380D7FEB32EC877183F` | 2,155,686,393 bytes |
| `lib/arm64-v8a/CNV70libg.so` | `9555B29E432CE8E478BCDBDA37008DA1A757B4EA6F37454A1EA69D2D627243C5` | 33,125,304 bytes |
| `lib/arm64-v8a/CNV70libg.so.i64` | `1E4553F618A90D7F7A36E0253FAC5EE38F7CAEEEA2D6A23260426B013FD96D47` | 332,257,410 bytes |

IDA Pro MCP opened the V70 IDB as session `9119f77b` and surveyed it on 2026-11-07. It reports AArch64, image base `0x0`, image size `0x2024748`, 64,945 functions (10,194 named), 51,417 strings, and 19 segments. This matches the extracted library hash above.

IDA's headless standard survey reports 802 ELF imports. The import view includes network APIs (`socket`, `connect`, `recvfrom`, `sendto`), file APIs (`fopen`, `fread`, `fwrite`), thread APIs (`pthread_create`, `pthread_join`), and `__register_atfork`. The survey's coarse `crypto` category is noisy (it includes OpenGL shader calls); no direct OpenSSL import appeared in the returned category sample. This import summary is the V70 survey evidence; game function anchors remain a separate analysis task.

The companion `libtprt.so` IDB is symbolized enough to expose `JNI_OnLoad` at `0x2c44c`, hook bridge/stub labels, and named imported libc APIs; its IDA survey reports 2,718 functions, 423 named. These symbols identify the companion library's JNI and hook boundaries, not game logic methods in stripped `libg.so`. Game-function matches must therefore be labeled as signature/diff/xref hypotheses unless dynamically confirmed.

## Device and verification

ADB sees device serial `PJ696HEY9DNRLFFQ`, product/model `PGJM10` (OPPO). Frida 16.7.19 connected to Gadget through `adb forward tcp:27042 tcp:27042`. The running CN client exposed `libg.so` at `0x75a8080000` (mapped size 33,697,792 bytes), `libtprt.so` at `0x75bd016000`, and `libtersafe.so` at `0x75bea93000`; Frida enumerated these modules successfully. This verifies instrumentation connectivity and module identity; no port feature has been exercised in a match yet.

Initially the CN package `com.tencent.tmgp.supercell.brawlstars` launched as PID `14887`, but Frida attach failed with `unable to connect to remote frida-server: closed`. Inspection found the target disabled (`enabled: false`, delay `0`) and Gadget `on_load: wait`. Per the pasted instructions, the CN target is now enabled with `start_up_delay_ms: 4000`, and Gadget uses `on_load: resume`. Original configs are backed up at `/data/local/tmp/re.zyg.fri/config.json.pre-cnv70` and `/data/local/tmp/re.zyg.fri/libgadget.config.pre-cnv70.bak`.

IDA xrefs from the V70 string `LogicGameObjectManager::addGameObject() Object with ID %d already added` at `0x334db3` lead to `sub_192F6C8` at `0x192f6c8` (size `0x5f4`). A preliminary CN V68-to-V70 comparison maps this to CN V68 `sub_13DCD80` at similarity `0.88686`, confidence `0.97970` (BinDiff call-reference algorithm). The direct Revenge V68-to-V70 BinDiff is now available at the path below; runtime structure correlation is still required.

## Exact Revenge V68 to CN V70 function map

The direct BinDiff result is `analysis/bindiff-revenge-result/libg_REvenge_v68.snapshot_vs_CNV70libg.snapshot.BinDiff`. It matched 42,842 of 46,870 primary functions; overall similarity is 55.7452% and confidence 95.3427%. These are match scores, not proof of semantics; each candidate below was checked against V70 decompilation where noted.

| Revenge V68 source key | CN V70 candidate RVA | Evidence / confidence |
|---|---:|---|
| `BattleMode_getInstance` `0x9BB5E8` | `0x16FE760` | Similarity 0.9268, confidence 0.9890; decomp follows the same state-5 active-mode flow. |
| `LogicBattleModeClient_getOwnCharacter` `0xC239B0` | `0x1A20700` | Similarity 1.0, confidence 0.9933; reads manager at `this+0x28`, own ID at `this+0x100`, then calls manager lookup. |
| `LogicBattleModeClient_getOwnPlayerTeam` `0xC23608` | `0x1A20358` | Exact getter reads `+0xE4`; adjacent own-index getter and matching following function, plus team-resolution callers, confirm this. Reject tiny-function BinDiff candidate `0x1A1FF10` (`+0xEC`). |
| `LogicBattleModeClient_getOwnPlayerIndex` `0xC23600` | `0x1A20350` | Similarity 1.0, confidence 0.9047; V70 decomp returns the 32-bit field at `this+0xE0`. |
| `LogicGameObjectManagerClient_findGameObject` `0xB61CA4` | `0x192D3F0` | Similarity 1.0, confidence 0.9933; iterates the manager array with count `+0xC`, stride 8, and filters ID/type. |
| `LogicBattleModeClient_setClientPredictionMoveTo` `0xC23B14` | `0x1A20864` | Similarity 1.0, confidence 0.9890. |
| `ClientInputManager_addInput` `0x7EFC30` | `0xF2CA40` | Similarity 1.0, confidence 0.9933. |
| `BattleScreen_activateSkill` `0x85CE88` | `0x14EC88C` | Similarity 0.9869, confidence 0.9905. |
| `BattleScreen_update` `0x59C74C` | `0xC60C40` | Similarity 0.8894, confidence 0.9789; large per-frame handler. |
| Legacy `handleJoystick` `0x5BABA0` | Rejected | Both source and V70 `0xD30B70` create a popup/container. The legacy label does not identify joystick input. |
| Speedhack `GameScreen__getLogicBattle` `0x87AA4C` | `0x15141BC` | Similarity 1.0, confidence 0.9047; both return the nested logic-battle pointer at context `+0x8F8/+0x9A0`, then `+0x28`. |
| Speedhack pathfinder `0xC6B2C0` | `0x1A87474` | Similarity 1.0, confidence 0.9933; both have the same 8-argument contract and compare candidate paths by squared distance. |
| Speedhack state predicate `0xB3284C` | `0x18EFDB4` | Similarity 0.9914, confidence 0.9928; matching state/eligibility checks and branch structure. Its V70 data-access helper target remains unresolved separately. |
| Speedhack main-character global getter `0x86F3E8` | `0x14FE170` | Similarity 1.0, confidence 0.9047; both return the main-character global pointer. |
| Speedhack movement drain `0xB32EC0` | `0x18F0728` | BinDiff's `0xDC18A0` pairing is rejected. The V70 function has the same 5-argument movement/state-update shape; `0x1A1E198` calls it with the same register roles as the v68 `0xC21A5C` caller, and corresponding helper calls also match. Strong static candidate; runtime behavior remains untested. |
| `LogicProjectileData_getRadius` `0xAFB170` | `0x18A5040` | Similarity 1.0, confidence 0.9047; V70 scalar field is `this+0x130`. |
| `LogicProjectileData_getSpeed` `0xAFB0F0` | `0x18A4FC0` | BinDiff's best tiny-function match is ambiguous, but adjacent projectile-data getters confirm the semantic mapping: v68 speed/radius fields are `+0xD4/+0xE0`, while V70 speed/radius are `+0x124/+0x130` (both shift by `+0x50`). |
| `LogicCharacterData_getSpeed` `0xAB3C40` | `0x1841618` | Similarity 1.0, confidence 0.9047; V70 decomp returns the 32-bit field at `this+0x26C`. |
| `LogicCharacterData_getCollisionRadius` `0xAB3E8C` | `0x184182C` | Similarity 1.0, confidence 0.9047; V70 scalar field is `this+0x2AC`. |
| Generic game-object data accessor (V68 manager helper `0xB6AEF4`) | `0x1937DD8` | Both return the pointer at `this+0x20`; their respective addGameObject paths use the result to classify/store objects. This does not resolve the separate client accessor `LogicGameObjectClient_getData` at V68 `0xB5E12C` (`+0x10`). |
| `LogicGameObjectClient_getData` `0xB5E12C` | `0x1928320` | Live code and IDA reconstruction return `this+0x10`; exact V68/V70 state-predicate and constructor callers establish the client data role. Packaged bytes are transformed at runtime, explaining the earlier missing function boundary. |
| `LogicGameObjectClient_getGlobalID` `0xB5E3F8` | `0x192869C` | Live client getter returns `this+0x8` and is used by client manager lookup. `0x1937DE0` is the separate generic-manager getter with the same field offset; `0x18A5458` (`+0x228`) remains rejected. |
| `LogicGameObjectClient_getX/Y/Z` `0xB5E44C/454/45C` | `0x19286F0/6F8/700` | Live instructions return `this+0x30/+0x34/+0x40`; paired and triple coordinate caller patterns identify semantics. Restored in the IDA database and decompiled. The earlier `0x18A5470/5488/5490` candidates remain rejected. |
| `BattleScreen__updateCameraParameters` `0x8572D4` | rejected `0x14FDB00` | Similarity 0.0205/confidence 0.0884. V70 candidate decompiles as accessory-button eligibility logic and has one UI caller; it is not a camera updater. Camera offsets remain unmapped. |

Several matches are expressly rejected: the source tick RVA `0xC21A5C` maps poorly (`0.0317` similarity / `0.2227` confidence) to a V70 vector append routine, and `getGameObjects` maps to a nullsub in the source IDB. The client-specific data/position getters have since been recovered from live code. The battle tick remains a candidate until observed in a private match. BinDiff against the packaged code is incomplete evidence because millions of executable bytes change at runtime.

### Object and projectile field layout findings

Exact V68 decompilation confirms game-object positions at `+0x30/+0x34/+0x38`, owner index at `+0x3C`, and team at `+0x40`. The source scanner's `+0xD0` dead-flag label was later found to describe a pointer-array field. Live V70 client code instead uses X/Y/Z at `+0x30/+0x34/+0x40`. Its team-resolution helper at `0x1928710` indexes an owner/player list using `+0x44` and falls back to `+0x48` for the raw team. The native character alive predicate at `0x18EE794` checks signed health `+0xCC > 0`. These are instruction/caller findings, not yet observed match object values. See [CNV70_RUNTIME.md](CNV70_RUNTIME.md) for runtime provenance and exact instructions.

Live code now confirms projectile speed/radius data at `+0x124/+0x130`, target X/Y at `+0x1F4/+0x1F8`, inherited owner/team at `+0x44/+0x48`, and character-body reference at `+0x420`. Old projectile field `+0x1D4` migrates to `+0x20C`, but the scanner's angle-in-degrees interpretation remains unproven. The source's `speedBuff=+0x1FC` label instead traces to LifeSteal; native V70 current-speed code reads `+0x250`. Projectile indirect/data-name semantics still require analysis. See [CNV70_RUNTIME.md](CNV70_RUNTIME.md) for the supporting paths and distinctions between field identity and meaning.

### FPS and label dependencies

An independent audit of the FPS and UI dependencies found no accepted V70 replacement for `FramerateManager__setSegment`, `FramerateManager__setLimit`, or `GameMain__update`; the strong-looking `setSegment` BinDiff row is a tiny wrapper with unrelated behavior. The V68 target-FPS global at `0x12EFA28` has no validated V70 equivalent, so FPS unlock remains unported. Strong static matches exist for `ResourceManager__isResourceLoaded` at V70 `0x8D0A30` and `DropGUIContainer__ctorFromExport` at `0xBAD4DC` (the latter stores its clip at `+0x80`), but text-field access/set, stage/global access, allocation, SCString ABI, and the display update tick are unresolved. These two matches alone are insufficient to enable the FPS display.

Speedhack-specific gaps: `GameMain__update` `0x4D0224` has a weak update-shaped lead at `0x14750D4` (0.213/0.507) but remains unresolved. Coordinate accessors have since been recovered from live code, but the `flipByte` global at `0x12EE608` still has no accepted V70 mapping. These gaps and missing match verification prevent enabling the speedhack feature.

Independent caller analysis gives a stronger semantic tick candidate than the BinDiff pairing: V70 `sub_17060F4` updates elapsed-time state and calls `sub_1A1E198` with the logic-battle object (`this+0x28`) and two frame-time values. `sub_1A1E198` has a `(this, float, float)` signature, is 6,800 bytes, and walks the object manager. It is a likely V70 `LogicBattleModeClient_update` implementation, but remains a candidate until the on-device probe observes it during a private match. A read-only Frida probe is available at `tools/cnv70_probe.py`; it samples the manager pointer, array count, and up to six object IDs, vtable pointers, and raw candidate field values, then detaches after ten calls.

Headless Hex-Rays decompilation of `sub_192F6C8` confirms the main manager array layout used by RevengeBS: array pointer at manager `+0x0`, capacity at `+0x8`, count at `+0xC`, and 8-byte object-pointer stride. The array is sorted by a virtual object-ID accessor. It also obtains an object category through a vtable call at byte offset `0x48`, assigns a generated ID, and tracks category-specific arrays/counters. This statically confirms the `ObjectManager_objectsArray`, `ObjectManager_count`, and `ObjectManager_ptrStride` constants from v68, but does not validate the manager pointer's location in `BattleMode`, object fields such as team/position, or the client tick hook.

The exact V68 manager insertion routine `sub_B63B00` and V70 `sub_192F6C8` are structurally equivalent add/sort/deduplicate paths. The v68 path calls `sub_B6AEFC` (ID at object `+0x8`) and `sub_B6AEF4` (pointer at `+0x20`); V70 calls `sub_1937DE0` (ID at `+0x8`) and `sub_1937DD8` (pointer at `+0x20`). This confirms the generic accessors separately from the client functions. Live code later confirmed the client getter at `0x1928320`, also reading `+0x10` like V68 `sub_B5E12C`.

Decompilation of V70 `sub_1937DE0` confirms it returns the 32-bit field at object `+0x8`. Its role in the manager's matching insertion path verifies the generic game-object ID getter mapping. The adjacent `sub_1937DD8` returns a pointer at `+0x20` and maps to the generic V68 manager helper. The client-specific data getter was settled separately using the live snapshot.

Runtime byte validation on the connected client confirmed the IDA RVAs are based at the live `libg.so` module base `0x75a8080000`: bytes at `base + 0x192f6c8` matched headless IDA (`81 03 00 b4 ff 43 01 d1 fd 7b 01 a9 f8 5f 02 a9`), and bytes at `base + 0x1937de0` matched (`00 08 40 b9 c0 03 5f d6`). This verifies address-base correspondence, not execution of either hook in a match.

## Frida attachment check (2026-11-07)

The local Python environment at `G:\frida16\.venv` successfully attached to the running Gadget with `tools/cnv70_probe.py`. It emitted `ready` for `libg.so + 0x1A1E198` at runtime address `0x75a9a9e198`, with module base `0x75a8080000` and mapped size `33,697,792` bytes. The first probe remained installed for several seconds but emitted no `tick` event; it was then detached cleanly. A screenshot and UI check on 2026-11-07 show the client in its home lobby with an event popup, confirming that this was not an in-match test. The probe was extended to snapshot the manager pointer/count and up to six objects' vtable, ID, and raw words at candidate offsets `+0x3C/+0x40/+0xD0/+0x120/+0x234/+0x238`. Those values are diagnostics only, not validated field names or layouts.

The current IDA MCP V70 session `9119f77b` is healthy, with Hex-Rays, string caches, and automatic analysis ready. It was opened from the analyzed library whose original hash is listed above. Selected client-getter bytes were subsequently restored in the analysis database from the live snapshot; the packaged input ELF was not changed.

Live byte checks confirmed the earlier loaded APK library and module base at several untransformed anchors. A later read in Gadget PID `28834` found `libg.so + 0x1A1E198` begins with the same normal function prologue as the IDB. An earlier check had observed an indirect-branch stub pointing at unmapped address `0x76ff5a5700`, but that state was not reproducible and is not treated as an established redirection. That process later exited; stale probes were stopped. A new process, PID `2118`, was launched for the executable snapshot below. A private-match run is still needed to confirm the tick and sample live objects.

## Live executable recovery

Rooted memory reads from relaunched PID `2118`, module base `0x75A8C20000`, captured `.text` and `.plt` into `G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so`. The source hash still matches the packaged ELF above. The snapshot SHA-256 is `C85A93BF497D912A1DA7DB2BC315E8C8F9A8207557D330B4313015C0C3139624`; 5,527,753 `.text` bytes differ, while `.plt` is unchanged. Only executable sections were replaced; the other sections are the original static ELF data. This is an analysis artifact, not a deployable library.

The snapshot resolved the client data and position getters that were missing from the packaged IDB. Seven getter functions were annotated and reconstructed through IDA MCP. The database backup before those changes is `analysis/runtime/CNV70libg.before-live-getters.i64`; the saved analysis copy is `analysis/runtime/CNV70libg.live-getters.i64`. Details and a reproduction command are in [CNV70_RUNTIME.md](CNV70_RUNTIME.md).

## Isolated V70 endpoint monitor

`agent/cnv70-diagnostic.js` is a separate entry point around the version-independent endpoint reader. Its RPC `start`, `endpoint`, and `stop` methods do not call the main agent's V68-specific startup. `frida-compile` successfully built it as `tmp/cnv70-diagnostic.js` after clearing invalid proxy environment variables for that command. The bundle contains the endpoint reader and does not contain the V68 battle-tick or CSV initialization. A live Gadget smoke test returned `start: true` and `stop: true`; no endpoint was reported while the phone was locked, so endpoint parsing against an active game connection remains unverified.

## Latest private-device evidence (2026-11-07)

The user also reports speedhack, local spectator and BrawlTV displays work.
Pin/spray remain unresolved: current carry counts/slots may differ. Per explicit
user instruction record that finding only; do not modify pin/spray or the
deferred FPS discrepancy during remaining feature tests.

The user reports aimbot, holdshoot, attack-only killaura, spinner and autododge
working with successful cleanup. FPS unlock/FPS display also operate, but the
overlay reads around 120 while the developer refresh display reads 90. The user
explicitly defers fixing this discrepancy. All six saved logs have complete
cleanup and no reported agent/scanner errors. Test scope and pending checks:
[feature results](evidence/runtime-observation/feature-tests-20261107.md).

Fixed ESP retest: user reports no problems, including cleanup. The log records
overlay draw activity, 5,307 update calls and complete cleanup. The earlier ESP
unload failure described below is a historical checkpoint for the previous build.

The user confirms camera, FPS label and ESP visuals work in training. ESP cleanup
crashed the game despite successful cleanup RPCs. The raw EGL GOT replacement
retained a script-owned callback after unload; an actual-source fixture reproduced
that ownership defect. The replacement uses a managed Interceptor handle and
explicit detach. All 34 host JavaScript tests pass; fixed ESP display/unload still
requires device retest. [Investigation](evidence/esp-lifecycle/DEBUG.md).

The focused hypercharge follow-up now supplies the previously missing action:
one natural type 17 (`0x11`) input at user activation, X/Y 0/0, no scanner errors
and complete cleanup. [Evidence](evidence/runtime-observation/hypercharge-20261107.md).
Agent-generated activation and signer equality remain unverified.

The subsequent user-operated private round captured 273 natural input events and
48 samples with retained projectiles, with no scanner errors. Ctrl+C cleanup
succeeded. Normal-shot, super and gadget candidate types are present;
hypercharge was not used. See [manual evidence](evidence/runtime-observation/manual-actions-20261107.md).
Feature behavior and signing equality remain unverified.

All 16 feature paths are integrated; earlier unported/locked-screen statements
below are historical checkpoints. The phone has since entered a private friendly
match with bots. Frida captured changing Shelly positions/speed, enemy counts,
10,283 update calls in a three-minute capture, and 20 natural input callbacks.
Combat types and native signing equality remain unverified. Projectile zero
counts were caused by an observation gate tied to disabled autododge, so they do
not establish a projectile-layout failure. The corrected read-only observation
and longer input limit are described in [runtime evidence](CNV70_RUNTIME.md).
No gameplay feature has yet been validated or enabled on the device.

## Next analysis steps (historical checkpoint)

1. Recover game function anchors and runtime object layouts from the V70 IDB; correlate against the v68 reference and older CN IDBs where useful.
2. Compare candidate function bodies with BinExport/BinDiff and record match confidence plus address provenance.
3. Inspect the live V70 process on the connected device and confirm module base and object relationships before turning static hypotheses into Frida offsets.
4. Port the runtime foundation first, then migrate dependent features against observed structure evidence.
5. Build and test the resulting agent on-device; record exact commands, behavior, and any limits here.

## Integrated runtime checkpoint (2026-11-07)

`agent/cnv70.js` now selects an explicit V70 profile before shared-agent startup. It uses recovered V70 functions/fields, never falls back to V68 values, locks the profile before asynchronous native initialization, and verifies two live getter signatures before installing hooks. CSV/data-table initialization uses recovered bindings. Unmapped features report an error when enabled.

The shared scanner uses native data identity, embedded icon ScString, character-instance/data class checks, positive health, current movement speed, body/owner/raw-team fields, and the corrected own-team getter. Indirect-projectile flags use byte reads. The unproven projectile angle field is omitted; target/observed-velocity paths remain available. The shared sender calls the V70 allocator/constructor/inserter and pure signer, storing the token at38. These changes preserve the V68 default profile.

Initial features available for private testing: pin, spray, spinner, camera, autododge. Available does not mean gameplay-validated. Other features still need remaining bindings/semantic checks and integration. Scanner observation and native signing observation create no commands and are the required first match checks.

### Validation and reproduction

- `node --test tests/cnv70-runtime.test.mjs tests/cnv70-signing.test.mjs tests/cnv70-diagnostic-lifecycle.test.mjs`:14 passed.
- `npx --yes frida-compile agent/cnv70.js -o tmp/cnv70-agent.js -B iife`: built successfully (clear invalid proxy variables only in the build process, as needed).
- Bounded single-session runner: `G:\frida16\.venv\Scripts\python.exe -u tools/cnv70_runtime.py --duration 120 --signing-bundle tmp/cnv70-diagnostic-signing.js --output tmp/cnv70-private-match.jsonl`. It starts scanner and signing observation with all features disabled; individual `--feature` arguments are for subsequent private-match tests.
- Live startup smoke after controlled relaunch, PID13248: runtime `start=true`, profile=`cnv70`, signing observer `start=true`, repeated scanner RPC responses, unload/detach completed, exit0. The locked phone produced zero battle ticks and no native signing comparisons. Log: `tmp/cnv70-runtime-smoke-relaunch.jsonl` (local temporary evidence, not committed).

The phone is still locked. The user selected private friendly/practice testing; no public match was started. Actual tick execution, object values, native token equality, movement/pin/spray/camera/autododge behavior, and visual overlay remain outstanding. Full port completion is not claimed.

Detailed native evidence: [scanner/CSV/strings](evidence/cnv70-scanner-native.md), [skills/projectiles](evidence/cnv70-skills-projectiles.md), and [camera/walls/combat](evidence/cnv70-camera-wall.md).

### IDA annotations and extended gameplay bindings

IDA MCP saved an analysis-only backup `analysis/runtime/CNV70libg.before-runtime-profile.i64`, named six accepted team/index/camera/fire/tile/autoshoot functions, attached provenance comments, and saved `analysis/runtime/CNV70libg.runtime-profile.i64`. Both saves succeeded; source ELF and device code were unchanged.

The subsequent native audit resolved the closest-autoshoot-target hook15064EC, activateSkill ABI, and held flags1199/119A/119B. Aimbot, hold-shoot, and ESP now have all their directly used V70 addresses/fields integrated and are available for private testing. Their gameplay validation is still empty. Killaura's hypercharge command and special-skill cases need separate confirmation. Scanner observation now reports errors and invalidates stale outputs after a failed scan; the fixture covers this failure path.

### All feature paths integrated; gameplay verification still pending

All16 source feature paths now have V70 integrations available through the explicit runtime: aimbot, autododge, ESP, spinner, killaura, camera, spray, pin, local BrawlTV/spectator display, chatspam, FPS display/unlock, gradients, hold-shoot, and speedhack. The endpoint monitor is also accessible. This describes mapped code availability, not successful in-game behavior or backend acceptance. `runtimeprofile().gameplayValidated` remains empty. No chat message was sent during the work.

Speedhack uses a complete dedicated V70 profile, including native movement-vector getters, control/frame fields, sequence timing, and movement-drain entry18F0728. The interior instruction18F0F68 is not a function entry. FPS display uses the recovered0x120 allocation size and clip+88, avoiding the legacy0xD0 allocation. FPS unlock uses native initialization guard1F91220, cap+20, captures/restores pre-enable rates, and waits for render-thread swap restoration during unload. If preparation reports pending restoration after its bounded wait, cleanup must be considered incomplete.

Review also closed effective-team resolution: native callers prove1928710 accepts the inner battle pointer supplied to the scanner. Raw team alone is insufficient for owned objects. Fixtures now include allied characters/projectiles whose raw and effective teams differ, failed scans, signing read failures, hash-disabled inputs, ownership transfer, type23 skill commands, and type17 hypercharge commands.

Current host validation:22 tests pass across runtime/signing/diagnostic lifecycle/speedhack/FPS-unlock suites; Python runner/probe compile. Both explicit V70 and default V68 entry points compile. V68/V70 movement fixtures and frame-rate restoration fixtures exercise actual module source. Additional evidence: [social/UI](evidence/cnv70-social-ui.md) and [speedhack](evidence/cnv70-speedhack.md), plus the expanded camera/wall/combat record.

Next required device step: unlock and enter the agreed private friendly/practice match. Start observation with all features off, confirm battle ticks and plausible own/enemy/projectile values, compare natural native signing tokens, and only then exercise individual features. The previous locked-screen smoke confirms Frida/runtime installation only. This full port task remains unfinished until the required device checks are recorded.

Additional runner regression: `python -m unittest discover -s tests -p test_cnv70_runtime.py` passes. It injects failures into feature disable, scanner stop, unload preparation, signing stop and script unload, then verifies all remaining cleanup actions and session detach are still attempted and the result reports incomplete cleanup. This complements the22 passing JavaScript tests; it does not connect to the device.

### Camera cleanup correction and verification gate

Seven actual-source lifecycle tests reproduced and fixed immediate camera cleanup and battle-screen address reuse. Explicit disable/unload now restores the captured camera mode before clearing state. Battle transitions call resetCamera(false) to discard stale pointers without writing into an old screen. The full JavaScript suite now passes29 tests; the Python cleanup test also passes. Investigation: [camera cleanup](evidence/camera-lifecycle/DEBUG.md).

The latest device recheck still reports PID13248 alive, secure keyguard showing, and the screen off. A20-second final-runtime attempt expired before script loading and exited with cleanup completed/no failures; it produced no battle samples. The app was not restarted merely because the observation timed out. The required private-match verification gate remains unmet: own/enemy/projectile values, natural token equality, asset/UI behavior and all feature outcomes remain unverified on-device. No completion claim follows from the host tests.
