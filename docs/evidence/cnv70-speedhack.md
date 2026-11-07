# CN V70 speedhack mapping evidence

Verified statically on 2026-11-07. All addresses are libg RVAs. This records the compatibility port of `agent/features/speedhack.js`; successful gameplay behavior has not been established. Device movement was not invoked by this analysis task. Authorized future testing is a private friendly/practice match.

## Evidence sources

| ID | Artifact / method | Use |
|---|---|---|
| E-01 | `G:\Brawlstars-CN-V70\original-history-i64\libg_REvenge_v68.so.i64` | Exact Revenge V68 baseline, read through headless IDA MCP session `revenge68_scanner` using a temporary database copy. |
| E-02 | `G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so` | Decoded live executable bytes; SHA256 `c85a93bf497d912a1da7db2bc315e8c8f9a8207557d330b4313015c0c3139624`. |
| E-03 | `analysis\bindiff-revenge-result\libg_REvenge_v68.snapshot_vs_CNV70libg.snapshot.BinDiff` | Candidate generator only. Several small accessor and large function matches were rejected. |
| E-imports | Native boundary of this feature | Frida resolves libc `malloc` by exported name, using a `uint` size and pointer return. All other native bindings are internal libg RVAs, not exported symbols. The feature adds no network/file/process imports; movement submission uses the existing command sender. This is a feature boundary summary, not a whole-library import survey. |

Use E-01 rather than the alternate baseline in `analysis\bindiff-v68-v70`. Packaged V70 executable bytes and the live decoded bytes differ; the live snapshot is authoritative for this mapping. The snapshot replaces executable sections, so packaged/XOR58 strings may still remain outside those sections.

## F-01: Complete native bindings

Status: statically verified. Confidence: high. Evidence: E-01 and E-02; E-03 supplied candidates. Category: reverse_algo.

| Source binding | V68 RVA | V70 RVA | Contract / evidence |
|---|---:|---:|---|
| `game` | `9BB5E8` | `16FE760` | Active BattleMode singleton: state manager getter `1707E2C`, state 5 predicate `1708D30`, tail getter `1708D20`. Null if unavailable. |
| `getLocalChar` | `C239B0` | `1A20700` | Logic battle -> `[+28]` object manager, own player index `[+100]`, W2=-1, tail `192D3F0`. |
| `setPosition` | `C23B14` | `1A20864` | Prediction target setter on LogicBattleModeClient, not a character position setter. Writes X/Y at `+10C/+110`, byte flag `+114`, dirty byte `+AC`. Native return is unused; bind as void. |
| `getChar` | `87AA4C` | `15141BC` | Actually GameScreen::getLogicBattle: screen pointer `+8F8 -> +9A0`, then mode pointer `+28` unchanged. |
| `pathfind` | `C6B2C0` | `1A87474` | Preserved ten-argument path query, detailed below. |
| `diagFlag` | `B3284C` | `18EFDB4` | Same character movement eligibility chain, low-bit return. Character bytes `14E/228/229/16C -> 171/248/249/194`, integer `170 -> 198`. |
| `drainMove` | `B32EC0` | `18F0728` | `(character, tick, interpolation, battle, float dt)`, verified from native caller `1A1FC04..1A1FC18`. |
| `getMainChar` | `86F3E8` | `14FE170` | Returns BattleScreen singleton, not a logic character. Global `12EF2B8 -> 2000240`. |
| `charDx1` | `86EED0` | `14FDECC` | Float BattleScreen `+A28 -> +B60`. |
| `charDy1` | `86EED8` | `14FDED4` | Float BattleScreen `+A2C -> +B64`. |
| `charDx2` | `86EEE0` | `14FDEDC` | Float BattleScreen `+A20 -> +B58`. |
| `charDy2` | `86EEE8` | `14FDEE4` | Float BattleScreen `+A24 -> +B5C`. |
| `posX` | `B5E44C` | `19286F0` | 32-bit position `+30` unchanged. |
| `posY` | `B5E454` | `19286F8` | 32-bit position `+34` unchanged. |
| `flipByte` (global) | `12EE608` | `1FAAD90` | Packed movement-vector consumer `5B4488 -> C7A800`; direct global byte read and conditional negation. |
| `gameUpdate` | `4D0224` | `B3FA7C` | GameMain update, confirmed by companion feature audit and independent live disassembly. Distinctive pause/state/flag flow and constants `C28F5C29`, `051EB850`, `028F5C28` at `B3FB08..B3FB28`. |

The four float getters are anchored by a real consumer rather than tiny-stub similarity: `C7A844` calls `14FDEDC`, `C7A850` calls `14FDECC`, then subtracts; `C7A860` calls `14FDEE4`, `C7A86C` calls `14FDED4`, then subtracts. `C7A874/C7A87C` load the flip byte at `1FAAD90`. The source's `dx1-dx2` and final negation reproduce that order.

For diagFlag, live code uses data getter `1928320`, CharacterData predicate `1842458`, type getter `18422BC` with type 13 special handling, current type `+C8` or CharacterData `+304`, hero predicate `18414EC`, and final tail `18EE8F4`. This matches the old eligibility structure.

## F-02: Every hardcoded layout dependency

Status: statically verified. Confidence: high. Evidence: E-01 and E-02. Category: reverse_algo.

| Source key | Owner / meaning | V68 | V70 | Native evidence |
|---|---|---:|---:|---|
| `gameBattle` | BattleMode -> logic battle | `28` | `28` | `14F4210` gets BattleMode; `14F4214` loads `+28`; calls logic battle method. Destructor `16FE8AC` independently frees the logic battle from `+28`. |
| `charCtx` | BattleMode -> GameScreen | `10` | `10` | `17033B4` allocates `12C8`, `17033C4` constructs BattleScreen at `14E1E2C`, `17033C8` stores it at mode `+10`. Constructor calls GameScreen base ctor `15140FC` at `14E1E60`. |
| `ctrlPtr` | BattleScreen -> CombatHUD | `9E8` | `B20` | Getter `14FE17C`; loads at `14FDDBC/14FDDE0` feed CombatHUD operations. Movement update `14F41DC` also loads it. |
| `movingCtl` | CombatHUD -> movement MovieClip | `4D8` | `4B8` | Exact move-stick frame setter `5B6EAC -> C7D24C`; live `C7D25C` loads `+4B8`, then calls `995B24` with bool frame. Paired clip `4D0 -> 4B0`; attached decoration `598 -> 590`. |
| `movingFlag` | MovieClip selected frame, low byte | `BA` | `DA` | Exact frame setter `CB5070 -> 995B24`; `995B38` stores a halfword frame at `+DA`. V68 corresponding instruction stores at `+BA`. Move state is frame 0/1, so the existing byte read is sufficient. This is not a general MovieClip boolean field. |
| `resetSpeed` | BattleScreen movement reset accumulator | `F70` | `11C0` | Paired movement update `863B7C -> 14F41B4`: old clears at `864880/8650DC`; live clears at `14F4E08/14F557C` in the same send/prediction branches. |
| `currentSpeed` | LogicCharacterClient current speed | `234` | `250` | Live state reader `18ED664`; drain's speed load at `18F0F68`. |
| `battleSequence` | LogicBattleModeClient prediction sequence | `B8` | `B8` | `1A1F674` reads signed sequence, `1A1F68C..698` divides by 50 to W20; `1A1FB98..BA4` computes remainder*20 to W21. Passed to drain at `1A1FC0C/10`. |

Despite the historical variable names, `mainChar` is a BattleScreen, `controller` is CombatHUD, and `c2` is LogicBattleModeClient. The source's chain `game()+10 -> getChar -> setPosition` therefore passes the logic battle to the prediction setter.

The reset field is a four-byte value zeroed natively; the existing `writeFloat(0)` stores the same zero bits. Source configuration `speedOff` is populated from the selected complete profile only.

## F-03: ABI checks and rejected candidates

The path function's old decompiler prototype undercounts its arguments. Both prologues load arguments 9/10 from the caller stack. V70 uses `sub sp,sp,#70; add fp,sp,#20; ldrb w8,[fp,#50]; ldrb w9,[fp,#58]`, corresponding to original SP and SP+8. It preserves W7, X5 and X4, copies both stack arguments, calls `1A86E04` (old `C6AC50`), and later passes saved W7 to `1A87298` (old `C6B0E4`). Keep the source's ten-argument signature and side/wall-stop result behavior.

The drain function entry `18F0728` has a full stack prologue and saves S0/X3/W2/X0/W1 into its local registers. Native update call `1A1FC04..18` sets S0=frame dt, X0=character, W1=tick, W2=interpolation, X3=battle. `18F0F68` is an interior speed load, not a callable function entry. Helpers `B335D8/B33868 -> 18F1000/18F1290` further match the flow.

Rejected automatic matches:

- `B32EC0 -> DC18A0`: incorrect movement drain.
- `B5E44C/B5E454 -> 18A5470/18A5488`: incorrect position getter candidates.
- Four float stub matches shifted by eight bytes: corrected using vector consumers.
- `4D0224 -> 14750D4`: `14750D4` is a callee of the actual `B3FA7C` update (calls at `B3FAF8/B3FBC8`).
- `863B7C -> 1507E5C`: small eligibility helper, not the movement update.
- Weak constructor `8532BC -> 1792DB0`: use actual BattleScreen construction at `14E1E2C`.

## Implementation and validation boundary

`speedhack.js` now selects complete immutable V68 or CN V70 maps using `offsets.Runtime_profile`. An unknown profile fails before allocation or native binding. CN V70 uses its dedicated constants throughout, including previously inline sequence/current-speed fields. Return type of the prediction setter is void. This subtask does not change runtime feature capabilities; the root integration owns feature availability and private-match validation.

Static mapping resolves every native binding, global and layout dependency used by this source. Runtime direction, collision handling, lifecycle behavior and actual movement outcome still require the authorized private-match test. Neither static confidence nor mock validation establishes server acceptance.

Validation: `tests/cnv70-speedhack.test.mjs` preserves the isolated Node VM harness, exercising the actual feature source for each profile. Independent fixtures verify all 14 native function bindings, the frame hook RVA, field reads and reset write, movement direction with a 720 speed fixture, prediction target `(172,200)` from `(100,200)`, input coordinates, and drain arguments `(tick=2, interpolation=460, dt=0)` for sequence 123. Unmapped reads and unexpected native bindings throw. Tests also cover feature-disabled startup, released movement, stale battle updates, and rejection of unknown profiles before allocation. Run `node --test tests/cnv70-speedhack.test.mjs`. No device-side hook was created by this subtask.

## Reproduction

Read baseline bytes through IDA MCP `get_bytes(database="revenge68_scanner", regions=[{"addr":"0xCB5070","size":320}])`; inspect V70 decoded bytes with ELF segment translation:

```python
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN

with open(r"G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so", "rb") as f:
    elf = ELFFile(f)
    disasm = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
    for va, size in [(0x995B24, 0x70), (0xC7D24C, 0x60),
                     (0x14F41B4, 0x1500), (0x1A1F674, 0x600),
                     (0x18F0728, 0x100), (0x17033B4, 0x20)]:
        for seg in elf.iter_segments():
            if (seg["p_type"] == "PT_LOAD" and
                seg["p_vaddr"] <= va < seg["p_vaddr"] + seg["p_filesz"]):
                f.seek(seg["p_offset"] + va - seg["p_vaddr"])
                for ins in disasm.disasm(f.read(size), va):
                    print(hex(ins.address), ins.mnemonic, ins.op_str)
```
