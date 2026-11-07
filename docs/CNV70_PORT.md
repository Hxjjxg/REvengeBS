# CN V70 port research log

## Scope and current state

This port targets the arm64 CN V70 client in the local workspace `G:\Brawlstars-CN-V70`. The reference agent in this repository targets official Brawl Stars v68.250. Its README explicitly states that its RVAs apply only to that exact `libg.so`; v68 values are leads for matching functions, not valid V70 addresses. The exact RevengeBS v68 reference binary is present at `original-history-i64/libg_REvenge_v68.so` (AArch64, image size `0x13447e8`, 46,267 functions), and the offsets in `agent/core/offsets.js` resolve meaningfully in that binary.

Reference agent areas inventoried so far:

- Runtime core: `core/offsets.js`, `core/functions.js`, `core/scanner.js`, `core/commands.js`, `core/egl.js`, CSV/data table and SC string helpers.
- Gameplay features: aimbot, autododge, camera, chat spam, ESP, FPS display/unlock, gradient cosmetics, hold-shoot, IP grabber, killaura, pin, spectator, speedhack, spinner, and spray.
- Shared helpers: combat, aim lead, dodge profiles/kinds, and wall/visibility cache.

Porting any feature requires validating its function addresses, object layouts, and runtime assumptions against the CN V70 binary. No V70 port code has been added yet.

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
| `LogicBattleModeClient_getOwnPlayerTeam` `0xC23608` | `0x1A1FF10` | Similarity 1.0, confidence 0.9526; V70 decomp returns the 32-bit field at `this+0xEC`. |
| `LogicBattleModeClient_getOwnPlayerIndex` `0xC23600` | `0x1A20350` | Similarity 1.0, confidence 0.9047; V70 decomp returns the 32-bit field at `this+0xE0`. |
| `LogicGameObjectManagerClient_findGameObject` `0xB61CA4` | `0x192D3F0` | Similarity 1.0, confidence 0.9933; iterates the manager array with count `+0xC`, stride 8, and filters ID/type. |
| `LogicBattleModeClient_setClientPredictionMoveTo` `0xC23B14` | `0x1A20864` | Similarity 1.0, confidence 0.9890. |
| `ClientInputManager_addInput` `0x7EFC30` | `0xF2CA40` | Similarity 1.0, confidence 0.9933. |
| `BattleScreen_activateSkill` `0x85CE88` | `0x14EC88C` | Similarity 0.9869, confidence 0.9905. |
| `BattleScreen_update` `0x59C74C` | `0xC60C40` | Similarity 0.8894, confidence 0.9789; large per-frame handler. |
| `handleJoystick` `0x5BABA0` | `0xD30B70` | Similarity 0.9579, confidence 0.9627. |
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
| `LogicGameObjectClient_getData` `0xB5E12C` | unresolved | V70 `0x1937DD8` is supported as a generic object data getter, but its V68 manager analogue is `0xB6AEF4`, not this client accessor; the other BinDiff candidate `0x1928320` has no function boundary. Do not assume the client-specific getter mapping. |
| `LogicGameObjectClient_getGlobalID` `0xB5E3F8` | `0x1937DE0` | The V68 getter and generic manager helper both read `this+0x8`; the V70 manager insertion routine sorts and deduplicates through `0x1937DE0`, also reading `this+0x8`. This makes `0x18A5458` (`+0x228`, one code xref) an unrelated scalar getter. |
| `LogicGameObjectClient_getX/Y/Z` `0xB5E44C/454/45C` | unresolved | The tiny-function matches `0x18A5470/5488/5490` each read a plausible scalar field but their callers are effect/data logic without clear spatial use; do not accept these as positions. |

Several matches are expressly rejected: the source tick RVA `0xC21A5C` maps poorly (`0.0317` similarity / `0.2227` confidence) to a V70 vector append routine, and `getGameObjects` maps to a nullsub in the source IDB. The coordinate accessors remain unresolved because their V70 caller contexts do not establish spatial semantics. The client-specific data getter and battle tick also remain unresolved; generic object ID/data accessors are now mapped separately.

### Object and projectile field layout findings

Exact V68 decompilation confirms game-object positions at `+0x30/+0x34/+0x38`, owner index at `+0x3C`, team at `+0x40`, and a byte field at `+0xD0` used by the source dead-state path. V70 candidates `0x18A5470/5488/5490` read `+0x120/+0x234/+0x238`, but caller analysis places their uses in mixed effect/data routines without clear spatial semantics. All three V70 position helpers remain unresolved, as do the V70 team, owner, and dead-state fields; the apparent BinDiff caller match has low structural similarity and cannot justify carrying over V68 offsets.

Projectile data accessors are stronger than projectile instance-layout matches. V70 projectile speed and radius data getters read `+0x124` and `+0x130`, respectively. The projectile client constructor/copy functions have strong counterparts, but their layouts moved: an update/copy routine transfers the corresponding V68 `+0x1F8` field from a source object at `+0x1F8` where the V70 routine reads `+0x230` (560), and neighboring fields also shift. The V68 projectile angle (`+0x1D4`), indirect flag, data-name, and owner-team fields have no accepted V70 mappings. Likewise, the V68 character-body (`+0x3E8`) and speed-buff (`+0x1FC`) assumptions have no confirmed V70 matches. None of these fields should be enabled in a port until caller/class evidence or runtime reads establish them.

### FPS and label dependencies

An independent audit of the FPS and UI dependencies found no accepted V70 replacement for `FramerateManager__setSegment`, `FramerateManager__setLimit`, or `GameMain__update`; the strong-looking `setSegment` BinDiff row is a tiny wrapper with unrelated behavior. The V68 target-FPS global at `0x12EFA28` has no validated V70 equivalent, so FPS unlock remains unported. Strong static matches exist for `ResourceManager__isResourceLoaded` at V70 `0x8D0A30` and `DropGUIContainer__ctorFromExport` at `0xBAD4DC` (the latter stores its clip at `+0x80`), but text-field access/set, stage/global access, allocation, SCString ABI, and the display update tick are unresolved. These two matches alone are insufficient to enable the FPS display.

Speedhack-specific gaps: `GameMain__update` `0x4D0224` has a weak update-shaped lead at `0x14750D4` (0.213/0.507) but remains unresolved. The coordinate helper matches are rejected as position accessors after caller analysis; the `flipByte` global at `0x12EE608` also has no accepted V70 mapping. These gaps prevent enabling the speedhack feature from static results alone.

Independent caller analysis gives a stronger semantic tick candidate than the BinDiff pairing: V70 `sub_17060F4` updates elapsed-time state and calls `sub_1A1E198` with the logic-battle object (`this+0x28`) and two frame-time values. `sub_1A1E198` has a `(this, float, float)` signature, is 6,800 bytes, and walks the object manager. It is a likely V70 `LogicBattleModeClient_update` implementation, but remains a candidate until the on-device probe observes it during a private match. A read-only Frida probe is available at `tools/cnv70_probe.py`; it samples the manager pointer, array count, and up to six object IDs, vtable pointers, and raw candidate field values, then detaches after ten calls.

Headless Hex-Rays decompilation of `sub_192F6C8` confirms the main manager array layout used by RevengeBS: array pointer at manager `+0x0`, capacity at `+0x8`, count at `+0xC`, and 8-byte object-pointer stride. The array is sorted by a virtual object-ID accessor. It also obtains an object category through a vtable call at byte offset `0x48`, assigns a generated ID, and tracks category-specific arrays/counters. This statically confirms the `ObjectManager_objectsArray`, `ObjectManager_count`, and `ObjectManager_ptrStride` constants from v68, but does not validate the manager pointer's location in `BattleMode`, object fields such as team/position, or the client tick hook.

The exact V68 manager insertion routine `sub_B63B00` and V70 `sub_192F6C8` are structurally equivalent add/sort/deduplicate paths. The v68 path calls `sub_B6AEFC` (ID at object `+0x8`) and `sub_B6AEF4` (pointer at `+0x20`); V70 calls `sub_1937DE0` (ID at `+0x8`) and `sub_1937DD8` (pointer at `+0x20`). This confirms `0x1937DE0` as the V70 generic game-object ID getter and `0x1937DD8` as a generic data-pointer accessor. The separate v68 client getter `sub_B5E12C` reads `+0x10`, so its V70 counterpart remains unresolved.

Headless decompilation of V70 `sub_1937DE0` confirms it returns the 32-bit field at object `+0x8`. Its role in the manager's matching insertion path now verifies the generic game-object ID getter mapping. The adjacent `sub_1937DD8` returns a pointer at `+0x20` and maps to the generic V68 manager helper; it does not settle the client-specific data getter.

Runtime byte validation on the connected client confirmed the IDA RVAs are based at the live `libg.so` module base `0x75a8080000`: bytes at `base + 0x192f6c8` matched headless IDA (`81 03 00 b4 ff 43 01 d1 fd 7b 01 a9 f8 5f 02 a9`), and bytes at `base + 0x1937de0` matched (`00 08 40 b9 c0 03 5f d6`). This verifies address-base correspondence, not execution of either hook in a match.

## Frida attachment check (2026-11-07)

The local Python environment at `G:\frida16\.venv` successfully attached to the running Gadget with `tools/cnv70_probe.py`. It emitted `ready` for `libg.so + 0x1A1E198` at runtime address `0x75a9a9e198`, with module base `0x75a8080000` and mapped size `33,697,792` bytes. The first probe remained installed for several seconds but emitted no `tick` event; it was then detached cleanly. A screenshot and UI check on 2026-11-07 show the client in its home lobby with an event popup, confirming that this was not an in-match test. The probe was extended to snapshot the manager pointer/count and up to six objects' vtable, ID, and raw words at candidate offsets `+0x3C/+0x40/+0xD0/+0x120/+0x234/+0x238`. Those values are diagnostics only, not validated field names or layouts.

The current IDA MCP V70 session `9119f77b` is healthy, with Hex-Rays, string caches, and automatic analysis ready. The open V70 IDB is the analyzed library whose hash is listed above.

Live byte checks confirm the loaded APK library and module base: `0x192F6C8`, `0x1937DE0`, and `0x17060F4` match the headless IDB. At `0x1A1E198`, however, the device contains an indirect-branch stub (`LDR X16, #8; BR X16`) pointing to `0x76ff5a5700`, outside any Frida module, while the IDB contains a normal function prologue. The candidate entry is runtime-redirected; the next private-match probe must establish whether the entry hook is still reached before the anonymous target is investigated.

## Isolated V70 endpoint monitor

`agent/cnv70-diagnostic.js` is a separate entry point around the version-independent endpoint reader. Its RPC `start`, `endpoint`, and `stop` methods do not call the main agent's V68-specific startup. `frida-compile` successfully built it as `tmp/cnv70-diagnostic.js` after clearing invalid proxy environment variables for that command. The bundle contains the endpoint reader and does not contain the V68 battle-tick or CSV initialization. A live Gadget smoke test returned `start: true` and `stop: true`; no endpoint was reported while the phone was locked, so endpoint parsing against an active game connection remains unverified.

## Next analysis steps

1. Recover game function anchors and runtime object layouts from the V70 IDB; correlate against the v68 reference and older CN IDBs where useful.
2. Compare candidate function bodies with BinExport/BinDiff and record match confidence plus address provenance.
3. Inspect the live V70 process on the connected device and confirm module base and object relationships before turning static hypotheses into Frida offsets.
4. Port the runtime foundation first, then migrate dependent features against observed structure evidence.
5. Build and test the resulting agent on-device; record exact commands, behavior, and any limits here.
