# CN V70 camera, wall cache, combat, and frame evidence

Verified 2026-11-07. All function and table addresses are module RVAs; object offsets are relative to their owning object. These findings establish native code and layout correspondence. They do not establish successful gameplay operation.

V70 changes the wall dimensions, camera hook, camera matrices, firing wrapper, aiming fields, and skill command table. In particular, skill kind 5 maps to command **23**, whereas V68 used **18**. The packaged V70 import names and low-confidence BinDiff matches must not be treated as semantic proof.

## Scope and provenance

The scope is the local compatibility port authorized in the conversation, including root reads of the connected Android device. Gameplay is restricted to private friendly/practice matches. This audit sent no game commands, wrote no target memory, installed no hooks, and modified no shared IDA database. No separate case scope file was supplied to this subtask. Report flavor: null, ordinary binary reverse engineering.

| Evidence | Source | Provenance |
|---|---|---|
| E-01 | `G:\Brawlstars-CN-V70\original-history-i64\libg_REvenge_v68.so` | Exact Revenge V68 reference; SHA256 `c56c2882a31d4b6a1f5355672b115ae38f67776a4c1ec41198c1ef7ca16c1407`. Selected instruction ranges were read directly. SkillClient pseudocode was also checked through the headless IDA MCP worker on port 2870. |
| E-02 | `G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so` | Decoded executable snapshot, SHA256 `c85a93bf497d912a1da7db2bc315e8c8f9a8207557d330b4313015c0c3139624`. Captured from PID 2118 at 2026-11-07 00:55:56 UTC. Only executable sections were replaced; other packaged sections remain unsuitable as decoded runtime data. |
| E-03 | `G:\Brawlstars-CN-V70\analysis\bindiff-revenge-result\libg_REvenge_v68.snapshot_vs_CNV70libg.snapshot.BinDiff` | Candidate generation. Every accepted mapping below was checked against instructions and caller context. |
| E-04 | Root `/proc/12226/mem` reads, device `PJ696HEY9DNRLFFQ` | V70 module base `0x75B0A49000`. Bounded reads during this audit matched E-02 for camera, tile, firing, and selected skill routines. ASLR addresses and PID describe this capture only. |
| E-05 | Root read of module RVA `0x3B0670`, 16 bytes | Decoded skill command table: `01000000010000000000000017000000`, or unsigned integers `[1, 1, 0, 23]`. Matches the separately captured decoded rodata window `CNV70.rodata-3ad000.bin`. |
| E-06 | Root `/proc/13248/mem` reads, device `PJ696HEY9DNRLFFQ` | Fresh process after restart, module base `0x75A9895000`. Frame-manager, GameMain, closest-target and held-flag ranges matched E-02. The frame-manager object and Stage global were zero/null at this capture. |
| E-07 | Local VM regression harness `tests/cnv70-fpsunlock.test.mjs` | Five behavioral tests exercise initialization guards, native segment ordering, restoration, disposal, and V68 compatibility. These tests use simulated pointers and hooks, without attaching to the game. |

## F-01: Wall cache mappings

Status: validated native layout. Confidence: high. Category: reverse_algo. Severity: n/a_re. Evidence: E-01–E-04. Location: TileMap, LogicTile, and LogicTileData.

| Source name | V68 | V70 | Evidence |
|---|---:|---:|---|
| `LogicBattleModeClient__getTileMap` | `C23930` | `1A20680` | Both load pointer `[x0+F8]` and return. |
| `LogicTile__setData` | `A51D84` | `17D64F4` | Preserves tile in X19 and new data in X20; reads old data `[tile]`, checks blocksMovement, stores new pointer `[tile]`, refreshes derived flags. |
| `LogicTileMap_getTile` | `A53734` | `17D8014` | Bounds-checks X/Y; computes `width*y+x`; loads tile pointer from array with stride 8. V70 adds a flat-index bound check. |
| `TileMap_Width` | `+C4` | `+D4` | `17D8014: ldr w9,[x0,#D4]`. |
| `TileMap_Height` | `+C8` | `+D8` | `17D802C: ldr w10,[x0,#D8]`. |
| `TileMap_TilesArray` | `+20` | `+20` | `17D8050: ldr x8,[x0,#20]`; `17D8054: ldr x0,[x8,w9,uxtw #3]`. |
| TileMap flat-array count | Not used by cache | `+EC` | `17D8044..17D804C` rejects `index >= count`. This is additional native validation, not the tile array pointer. |
| LogicTile data pointer | `+0` | `+0` | `17D6508` reads old data and `17D6520` stores new data. |
| `TileTypeData_BlocksMovement` | `+56` | `+56` | `18DD69C: ldrb w0,[x0,#56]; ret`. |
| `TileTypeData_BlocksProjectiles` | `+57` | `+57` | `18DD6D8: ldrb w0,[x0,#57]; ret`. |
| `LogicTileData__blocksMovement` | `B21718` | `18DD69C` | Used directly by the V70 setData routine. |
| `LogicTileData__blocksProjectiles` | `B21720` | `18DD6D8` | Independent byte accessor confirms the packed U16 cache read. |

The existing cache algorithm can retain row-major indexing, pointer stride 8, and its U16 read at TileData `+56`. Its dimension offsets and setData hook must change. The extra native flat-count check supports checking `width*height <= tileMap.readS32(+EC)` before a bulk read if that validation is added. Active-match tile values, destruction/replacement behavior, and cache invalidation timing still require private-match observation.

## F-02: Camera hook and ESP matrices

Status: validated native correspondence. Confidence: high. Category: reverse_algo. Severity: n/a_re. Evidence: E-01–E-04. Location: BattleScreen.

| Source name / role | V68 | V70 |
|---|---:|---:|
| `BattleScreen__updateCameraParameters` | `8572D4` | `14E6528` |
| `BattleScreen_cameraMode` | `+90C` | `+9C4` |
| `BattleScreen_screenWidth`, float | `+8E4` | `+964` |
| `BattleScreen_screenHeight`, float | `+8E8` | `+968` |
| Camera projection matrix, 64 bytes | `+7C8` | `+848` |
| Camera view matrix, 64 bytes | `+808` | `+888` |
| `BattleScreen_viewMatrix` used by ESP, combined matrix | `+848` | **`+8C8`** |

The source's `BattleScreen_viewMatrix` name refers to the combined projection/view matrix consumed by ESP. V70 `+848` is the projection matrix and would be the wrong replacement for that source field.

The V70 entry retains the original `(BattleScreen*, float dt)` calling shape: `14E655C` saves S0 and `14E656C` preserves X0 as X19. It calls dimension getters `A23DE8/A23DF4`, stores floats at `+964/+968`, computes the same aspect ratio and field-of-view constants as V68, obtains own-character context, then updates the matrices. Two caller pairs independently support the mapping: V68 camera calls at `8565A8/85EC44`; V70 calls at `14E555C/14EE334`.

Key V70 instructions:

```asm
14E6588  str   s0, [x19,#964]
14E65A8  str   s0, [x19,#968]
14E6770  ldr   w8, [x19,#9C4]
14E6778  cmp   w8, #5
14E6780  cmp   w8, #3
14E688C  add   x20, x19, #848
14E7970  stp   q0, q1, [x20]          ; projection
14E798C  add   x21, x19, #848
14E79A4  stp   q0, q1, [x21,#40]     ; view
14E79B4  add   x1, x21, #40
14E79B8  add   x2, x21, #80
14E79BC  mov   x0, x20
14E79C0  bl    A1CFA0                 ; matrix product into +8C8
14E79C4  ldp   q0, q1, [x21,#80]
```

The low-score BinDiff candidate `14FDB00` is rejected: it is a small flag/predicate routine rather than a camera/matrix updater. V70's native camera explicitly groups modes 3 and 5 where V68 grouped 3 and 4. Source mode values 3 and 6 must therefore be checked visually in a private match; this audit does not assign a new semantic name to mode 6. The native skill activation routine independently recognizes modes using mask `0x68` and maximum mode 6 at `14EC8A4..14EC8CC`.

## F-03: Firing and skill helpers

Status: validated native correspondence for the entries below. Confidence: high. Category: reverse_algo. Severity: n/a_re. Evidence: E-01, E-02, E-04, E-05. Location: BattleScreen and SkillData.

| Source name / role | V68 | V70 | Evidence |
|---|---:|---:|---|
| `BattleScreen_fireWrapperFn` | `85D09C` | `14ECAAC` | Same `(screen, own)` arguments; singleton/player lookup, own skill resolution, hyper-aware data selection, and tail-call to native activation. |
| `BattleScreen_aimX` | `+F7C` | `+11CC` | New helper `15053FC` reads at `1505444`. |
| `BattleScreen_aimY` | `+F80` | `+11D0` | Helper reads at `1505448`. |
| `BattleScreen_aimTargetId` | `+EE4` | `+1124` | `14ECB38: ldr w6,[x19,#1124]` before activation. |
| `BattleScreen_activateSkill` | `85CE88` | `14EC88C` | Wrapper tail branch `14ECB58`; validates skill and stages activation. |
| `LogicCharacterClient_hyperActive` | `+31E` | `+34E` | Wrapper `14ECB00` and activation `14EC9A4` pass this byte to selected-data accessor. |
| `LogicCharacterClient__getSkillAt` | `B31970` | `18EEC70` | Count `+EC`, pointer array `+E0`, stride 8. |
| `LogicCharacterClient__getWeaponSkill` | `B319F8` | `18EED38` | Calls base-data getter then reads CharacterData `+328`. Returns SkillData. |
| `LogicSkillClient__getData` | `B7AD4C` | `19499FC` | Base `[skill]`, skill flags `+22/+26`, alternate pointer getter, and selector-kind logic all match. |
| `LogicSkillClient__canActivate` | `B7AECC` | `1949C38` | Three-argument ABI retained; charge and bonus/player branches match. V70 adds data-flag checks described below. |
| `LogicSkillData_kind` | `+1AC` | `+2CC` | Selected-data getter and native command-type mapper both load this field. |
| `LogicSkillData__getLinkedSkill` | `B0EB8C` | `18BDEB8` | Loads pointer at SkillData `+1B0`. |
| Linked-skill selection behavior | CSV accessor in source | cached integer `+21C` | `150A91C..150A92C` compares against 3 before branching to linked-skill getter. |
| `SkillCommandTypeTable` | `184720` | `3B0670` | Native mapper `150A8E8`, decoded table E-05. |
| `ClientInput_skillData` | `+40` | `+40` | `150A980: str x24,[x20,#40]`. |

V70 extracts the old wrapper's coordinate logic into `15053FC`. That helper either returns the screen aim fields as a packed X/Y pair or derives a direction-relative point from own/body position, preserving the old conditional behavior. The wrapper forwards coordinates in W1/W2, own in X3, SkillClient in X4, constant 1 in W5, and target ID in W6 to `14EC88C`.

`1949C38` reads data byte `+348`; that path checks own slot-0 skill and its charge. This redirect corresponds to V68 data byte `+238` and is retained behavior. The additional V70 branch uses data byte `+35F` and calls `1949E14` to derive a charge requirement. The ordinary kind-1 path still compares SkillClient `+1C` against 999. Calling the mapped native accessor preserves the new charge-cost check; replacing it with the old pseudocode would omit that check. X1 is a player pointer and X2 is the character. The source's null player argument remains subject to the native bonus-skill branch, which returns false when a player is required but absent.

The native mapper `150A8E8` reads `kind`, subtracts 2, returns zero outside indices 0–3, and indexes the four unsigned values at `3B0670`:

| Skill kind | V68 input type | V70 input type |
|---:|---:|---:|
| 2 | 1 | 1 |
| 3 | 1 | 1 |
| 4 | 0 | 0 |
| 5 | 18 | **23** |

Native creator `150A938` allocates 72 bytes, calls `19CAA04`, writes SkillData at `+40`, constructs X/Y at `+C/+10`, and calls signer `150AA54`. Its ordinary aiming path subtracts the own/body world position; additional native branches retain absolute coordinates and command flags. This observation does not establish that every direct `castSkill()` use in the source reproduces every native special case.

The companion [skill/projectile evidence](cnv70-skills-projectiles.md) covers constructor-backed adapters for casting range (`+27C`), attack interval (`+298`), and behavior (`+21C`). Native accessor entry points were not established for those three fields, so poor BinDiff getter matches must not be bound as callable functions. Hypercharge command type `0x11` is supported by F-04 below; every special skill behavior remains untested.

## P-01: Wall-cache data flow

Path type: callflow. Evidence: E-01–E-04. Finding: F-01.

1. Obtain battle client, then call `1A20680` to read its TileMap pointer at `+F8`.
2. Read dimensions at TileMap `+D4/+D8` and tile-pointer array at `+20`.
3. Index `width*y+x`, stride 8; native getter `17D8014` independently proves this arrangement.
4. Read each tile's data pointer at `+0`; read blocking bytes at data `+56/+57`.
5. Observe `17D64F4` to invalidate after tile-data replacement. Gameplay timing and values remain untested.

## P-02: Camera and fire data flow

Path type: callflow. Evidence: E-01, E-02, E-04, E-05. Findings: F-02, F-03.

1. Camera entry `14E6528` receives BattleScreen in X0; reads mode `+9C4`, updates screen dimensions, and produces the combined matrix at `+8C8`.
2. Source firing fields map to `+11CC/+11D0/+1124`; wrapper `14ECAAC` selects the own weapon SkillClient/data and calls coordinate helper `15053FC`.
3. Wrapper tail-calls `14EC88C`, which invokes `1949C38` and stages native skill activation.
4. Native send path `14FC640` selects command type through `150A8E8`, then calls `150A7F8`; creator `150A938` constructs and signs the command before insertion at `F2CA40`.

Residual limitation: no active-match object values, visual camera behavior, firing result, or backend acceptance were observed in this audit.

## Root byte verification and reproduction

The following ranges read from E-04 matched E-02 byte for byte. Hashes are SHA256 of the individual ranges, not entire functions.

| Start | Length | SHA256 |
|---:|---:|---|
| `14E6528` | `1580` | `3000d83e65ce5eecf891c4e9edc2626ee6190088083a2dec47092e62dcf3464c` |
| `17D8014` | `54` | `65822876db42cabaff223a44bd3a77ac5e22b5f511a850376c02c8278409def4` |
| `17D64F4` | `104` | `fca42ff22a0fce9231a95dab3539491e1bfd7446ce2d08d02c12fa1110287b8e` |
| `1A20680` | `8` | `81b62fa6a1a870c829bdf76121c96f6ff955d1a4fc1251895a9bbca984d10dc2` |
| `18DD69C` | `44` | `3eca160f293825527d89fb19444c2b5ca999b0276fb02099ee7c97f0e81b15c5` |
| `14ECAAC` | `E0` | `84827bec0384a1164b19f92248e37f194372bb1f421d49579e0f5cc33556fd7e` |
| `15053FC` | `BC` | `cd93389955f739bec639752155e2d270039073c7059150f061a6fcf745c57b59` |
| `150A8E8` | `28` | `c3a8deafe654b5c3bdd2e1f5a2d90c9da16054b6ae6d5369c71286da4518b8df` |
| `19499FC` | `60` | `5b27fa3c6c19b083944a05f572d946fd504c41ca7bd204ab78459f8dd4af3d33` |
| `1949C38` | `1DC` | `d0d81c8d880f105f97f07c09159bf133d3debad9c4e97d16f492224d91774807` |

Run this offline Python snippet with `pyelftools` and `capstone` installed to reproduce selected instruction evidence without relying on packaged IDA function boundaries:

```python
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN

path = r"G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so"
regions = [(0x14E6528, 0x80), (0x14E7940, 0xA0),
           (0x17D8014, 0x54), (0x17D64F4, 0x40),
           (0x18DD69C, 8), (0x18DD6D8, 8),
           (0x14ECAAC, 0xE0), (0x15053FC, 0xBC),
           (0x150A8E8, 0x28), (0x150A910, 0x28)]
with open(path, "rb") as stream:
    elf = ELFFile(stream)
    disassembler = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
    for address, length in regions:
        segment = next(s for s in elf.iter_segments()
                       if s["p_type"] == "PT_LOAD"
                       and s["p_vaddr"] <= address < s["p_vaddr"] + s["p_filesz"])
        stream.seek(segment["p_offset"] + address - segment["p_vaddr"])
        for insn in disassembler.disasm(stream.read(length), address):
            print(hex(insn.address), insn.mnemonic, insn.op_str)
```

For live comparison, use the existing read-only `tools/cnv70_code_snapshot.py::read_root_memory(serial,pid,base+rva,length)` helper after resolving the current PID and APK-mapped module base. The capture PID/base above must not be reused after a restart.

Timeline: E-02 was captured at 00:55:56 UTC; this audit compared the exact V68 reference, inspected headless IDA MCP skill routines, validated E-04/E-05 through root reads, and recorded the findings by 01:52 UTC on 2026-11-07. No end-to-end gameplay claim follows from these checks.

## F-04: Held controls, closest target, and hypercharge

Status: validated native correspondence. Confidence: high. Category: reverse_algo. Severity: n/a_re. Evidence: E-01, E-02, E-06. Location: BattleScreen and native input construction.

| Source field/function | V68 | V70 | Proof |
|---|---:|---:|---|
| `autoFireHeld` | `+F49` | `+1199` | `14F5EA8` sets X28 to screen+1000; `14F602C` loads byte `[x28+199]`. |
| `attackJoyHeld` | `+F4A` | `+119A` | `14F6034` loads byte `[x28+19A]`. |
| `ultiJoyHeld` | `+F4B` | `+119B` | `14F6038` loads byte `[x28+19B]`; independent load/reset at `14F5F24/14F5F3C`. |
| `getClosestTargetForAutoshoot` | `876EB0` | `15064EC` | All four V68 autoshoot caller sites `862554/862584/862870/8628BC` map to V70 calls `14F27C0/14F27F4/14F2A74/14F2AC0`. |

Closest-target selection retains body/character selection, trigonometric calculations, player context, and projectile filtering. V70 adds a ninth stack argument. The current source hook replaces the return pointer in `onLeave`; this mapping does not authorize introducing an eight-argument NativeFunction call. The weak BinDiff candidate `14FD800` is rejected.

Native helper `C5D0E8` proves the no-payload hypercharge command type. It allocates 72 bytes at `C5D108`, sets W1 to `0x11` at `C5D110`, and invokes constructor `19CAA04` at `C5D118`. The remainder adds no skill payload; `C5D87C` sets the token at `+38`, and the helper resolves the input manager through singleton `+58` before tail-inserting at `F2CA40`. HUD caller `C5B154` gates this path with byte HUD+864. The V68 counterpart constructs the same type at `59871C/598724`. This supports the source `sendCommand(0x11, null)` representation; no command was sent by this audit.

## F-05: GameMain and frame-manager layout

Status: validated native code/layout, lifecycle behavior tested locally. Confidence: high. Category: reverse_algo. Severity: n/a_re. Evidence: E-01, E-02, E-06, E-07.

| Source role | V68 | V70 | Evidence |
|---|---:|---:|---|
| `GameMain__update` | `4D0224` | `B3FA7C` | Same LCG constants `C28F5C29/051EB850`, rotate/check block at `B3FB08..B3FB28`; pause bytes/counter move from `+E8/+E9/+EC` to `+C0/+C1/+C4`. |
| Frame-manager object / target FPS double | `12EFA28` | `1F911F8` | Constructor `A230D0` initializes five doubles at `+0/+8/+10/+18/+20` to 60. |
| C++ initialization guard | — | `1F91220` | Native callers use an acquire byte load followed by bit-0 test. |
| Segment selector | `EA3C5C` | `A233AC` | Indexes `[manager + segment*8 + 8]`, then tail-calls target setter `A230E8`. |
| Cap field | `+148` | **`+20`** | Cap setter `A23494`: `str d0,[x0,#20]; ret`. |
| Target setter | — | `A230E8` | Stores D0 at manager+0, with native display-refresh selection logic. |

The weak GameMain candidate `14750D4` is a callee of the real updater (`B3FAF8`), so it is not a frame-count hook. The weak frame-limit candidate `92166C` is also rejected. The V68 `EA4160` routine contains per-frame waiting/timing logic; no equivalent large V70 routine was established. The compatibility key `FramerateManager__setLimit` names V70's small cap setter `A23494`, which requires reapplying the cap on return because its original store follows hook entry.

The live object was zero at E-06, making initialization guards necessary. The V70 FPS-unlock implementation requires guard bit 0 and finite positive target/cap values before changing values or adding an EGL hook. It saves both values before a segment hook changes native arguments, uses cap offset `+20`, and restores the captured values on disable. Its EGL hook is lazy: disabled startup does not alter the swap interval. Once interval 0 has been applied, disable/disposal requests interval 1 on the next render-thread swap and then detaches the swap hook. This restores the implementation's standard interval-1 setting; it does not capture arbitrary preexisting EGL interval state.

`disposeFpsUnlock()` clears keeper timers, detaches manager hooks, restores manager values, and reports `pendingSwapRestore`/`pendingTargetRestore`. A caller must let pending render cleanup finish before script unload. Local E-07 tests cover disabled/uninitialized startup and invalid values; delayed initialization with original-value capture before segment selection; disable plus one restoring swap; disposal plus pending-cleanup reporting; and the V68 `+148`/60 FPS fallback with a rapid toggle. These tests establish lifecycle behavior in the harness, not achievable device refresh rate or native-call correctness at runtime.

## F-06: FPS label native UI dependencies

Status: validated static correspondence; asset availability and rendering untested. Confidence: high for the listed instructions. Category: reverse_algo. Severity: n/a_re. Evidence: E-01, E-02.

| Role | V68 | V70 | Proof |
|---|---:|---:|---|
| Resource lookup | `C85F54` | `8D0A30` | Path lookup returns a resource pointer; raw C-string plus integer ABI retained. |
| DropGUIContainer constructor | `50DA1C` | `BAD4DC` | Corresponding base initialization and exported movie-clip loading; stores loaded clip at `BAD5B0`. |
| DropGUIContainer allocation | `D0` bytes | **`120` bytes** | Allocation callers `BD4350/C78218` load W0 with `120` before allocation/constructor. Constructor stores through `+118`. |
| Loaded movie clip | `+80` | **`+88`** | Constructor store at `BAD5B0`. |
| MovieClip named text-field lookup | `CB5F14` | `996A14` | Calls generic name lookup `9952B4`, tests virtual type predicate at slot `+88`, returns original child only for a text field. |
| TextField setter | — | `948D44` | Sibling lookup/setter `996A74` invokes the same name lookup then this setter. |
| Stage singleton global | `12F3CC0` | `1F91CE0` | Getter/initializer `94F558` loads the global, allocates `E58` if null, calls `94D6B0`, then stores it. |
| Stage child container | `+A8` | **`+90`** | Stage constructor allocates Sprite at `94D998`, constructs it at `94D9A8`, stores pointer at `94D9B0`. |
| Stage addChild | `CCC9BC` | `95019C` | Loads Stage+90, tail-branches to Sprite addChild `94B270`. |
| DisplayObject X/Y | `+20/+24` | `+20/+24` | Position setter `94C57C` stores S0/S1 together at `+20`. |
| DisplayObject scale X/Y | `+10/+1C` | `+10/+1C` | Base constructor `94C3F4`, vector initialization at `94C424`. |
| DisplayObject visible | `+8` | `+8` | Base constructor sets byte to 1 at `94C408`. |

Native Stage neighbor `9501B4` independently retains the old `CCC9C4` touch-bounds control flow, with bounds moving from `+8C/+90` to `+84/+88` and the touch list from `+308/+310` to `+2F8/+300`. This distinguishes the accepted Stage wrapper from rejected candidate `1545DAC` and unrelated wrapper `C9CF94` using object+ D8. The text-field lookup is accepted despite a weak BinDiff score because its delegated child lookup and type predicate establish the relevant semantics.

The FPS module now allocates using `DropGUIContainer_size`, with a missing-size guard for CN V70; using the old 208-byte allocation would underallocate an object whose constructor writes through `+118`. The source still requests `sc/ui.sc`, export `damage_number`, child `txt`, and returns without displaying when Stage/resource/movie clip/text field is absent. E-06 Stage was null. The asset names, label appearance, update cadence, and gameplay behavior require runtime observation in the permitted private friendly/practice mode.

## Additional root range checks

E-06 matched E-02 for the following bounded ranges (lengths in hexadecimal):

| Start | Length | SHA256 |
|---:|---:|---|
| `A230D0` | `18` | `c4858e9e3af2233100211c77eb127f9225f063fc70d58ecfca91ba0b8087cea1` |
| `A233AC` | `18` | `bcd6c5b7f78e8015179e412f02fa9ed3f83e83647387ddf79ed0ef3952a233d7` |
| `A23494` | `8` | `2dc03a8717580745f8cddb3f6aefbc6d4f33a1384b213b32a0f2d01c030cf1ae` |
| `B3FA7C` | `180` | `a294a7d1c1b340b565063c2d7ccbcf4825fbec6e769435f9a92482fad047046d` |
| `15064EC` | `128` | `70c86e2dd74090dae4e685c73acaeb17656b885758f95c26a401af3588081bfe` |
| `14F5E70` | `1D0` | `4183eac5d292fe8dd2f3da1d4bd311a256d68bb097107c379ee97ca0896fe93a` |

## P-03: FPS frame hook and UI path

Path type: callflow/lifecycle. Evidence: E-01, E-02, E-06, E-07. Findings: F-05, F-06.

1. Observe `B3FA7C` for frame samples. Check Stage global `1F91CE0` and resource lookup `8D0A30` before label construction.
2. Allocate `120` bytes, construct via `BAD4DC`, load movie clip from `+88`, and resolve `txt` via `996A14`.
3. Attach through Stage `95019C`; update text with `948D44` using the existing game-string wrapper.
4. For FPS unlock, check initialization guard and capture positive finite target/cap before selecting the unlocked segment or writing either double.
5. On disable/unload, restore captured manager values and complete any render-thread swap-interval restoration before unloading the script.

Validation command: `node --test tests/cnv70-fpsunlock.test.mjs` (5/5 pass). Runtime feature enablement, native UI calls, and achieved FPS remain outside this static/local-test result.
