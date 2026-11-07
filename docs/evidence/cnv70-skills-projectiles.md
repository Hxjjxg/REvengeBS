# CN V70 skill and projectile mapping evidence

Verified on 2026-11-07. Addresses below are module RVAs. This records static semantic checks against decoded runtime bytes; it does not establish successful gameplay behavior.

## Scope and artifacts

The scope is the local CN V70 compatibility port and private friendly/practice testing authorized in the conversation. This document covers scanner dependencies and projectile layout. No case scope file was supplied to this subtask.

| Evidence | Source | Observation |
|---|---|---|
| E-01 | `G:\Brawlstars-CN-V70\original-history-i64\libg_REvenge_v68.so.i64` | Authoritative Revenge V68 baseline; read through a temporary headless IDA MCP session. |
| E-02 | `G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so` | Live decoded executable snapshot; SHA256 `c85a93bf497d912a1da7db2bc315e8c8f9a8207557d330b4313015c0c3139624`. |
| E-03 | `G:\Brawlstars-CN-V70\analysis\bindiff-revenge-result\libg_REvenge_v68.snapshot_vs_CNV70libg.snapshot.BinDiff` | Candidate generation only; instruction semantics and caller context determine acceptance. |

The different baseline under `analysis\bindiff-v68-v70` must not substitute for E-01. Packaged V70 bytes differ substantially from the live executable snapshot, so packaged database data/code classifications are not proof of live behavior.

## F-01: Skill and scanner accessors

Status: validated statically. Confidence: high. Evidence: E-01, E-02, E-03. Category: reverse_algo. Gameplay validation remains separate.

| Source helper | V68 RVA | V70 RVA | Verified behavior / field change |
|---|---:|---:|---|
| SkillData projectile at index | `B0E5EC` | `18BD84C` | Signed count at `+64`, pointer array at `+58`, unchanged. Returns null if count is not greater than index. Caller must supply a nonnegative index. |
| Character skill at slot | `B31970` | `18EEC70` | Pointer array `+C0` → `+E0`; count `+CC` → `+EC`. Same indexed lookup. |
| Character weapon SkillData | `B319F8` | `18EED38` | Calls base data getter then reads CharacterData pointer `+260` → `+328`. |
| SkillClient selected data | `B7AD4C` | `19499FC` | Base data `[skill+0]`; skill byte flags `+22` and `+26` unchanged. Explicit hyper argument uses bit 0. Selector integer on SkillData `+1AC` → `+2CC`. |
| Alternate SkillData getter | `B0E934` | `18BDB3C` | Pointer `+208` → `+320`; live instruction is `ldr x0,[x0,#0x320]; ret`. |
| Character linked carryable | `B31D3C` | `18EF274` | V70 takes `(character,battle)`; null battle returns null. Character link identifier `+2B0` → `+2E0`. |
| ProjectileData spawn area | `AFB254` | `18A51F4` | Pointer `+128` → `+188`. |
| ProjectileData beam flag | `AFB2A4` | `18A5244` | Byte `+189` → `+1E9`; use boolean/byte semantics. |
| AreaEffectData radius | `A98614` | `182FA9C` | 32-bit integer `+12C` → `+164`. |
| AreaEffectData active time, milliseconds | `A9860C` | `182FA94` | 32-bit integer `+124` → `+15C`; caller-confirmed. |

For selected skill data, the alternate must exist and either `(base.kind & ~1) == 2` or skill byte `+26` must be set before selecting the alternate. A poor BinDiff score for `19499FC` does not invalidate the matching flow.

The linked-carryable loop obtains the object vector from `battle+28` through `19292A0`, filters virtual type slot `+28` for type 0, calls base data getter `1928320` and predicate `18423D4`, then compares the character link against GID getter `192869C` transformed by `197FCC4`.

## F-02: Indirect projectiles use a byte

Status: validated statically. Confidence: high. Evidence: E-01 and E-02. Location: ProjectileData `+108` in V70. Category: reverse_algo.

The old scanner's U32 read at `+B8` does not reflect the native field width. V68 rendering uses `ldrb` at `53A7EC` and `53AC9C`. The corresponding live V70 rendering function starts at `BD7228`; instructions `BD7E74` and `BD83C8` both load a byte from ProjectileData `+108`.

The first pair shares the distinctive sequence using floating constants 1.0 and 0.6, a square root, addition, and the same downstream call shape. The second pair independently confirms the field. Read `data.add(0x108).readU8()` and interpret nonzero as true.

## F-03: Projectile instances

Status: validated statically. Confidence: high for the listed fields. Evidence: E-01, E-02. Category: reverse_algo.

| Operation / field | V70 RVA / offset | Evidence |
|---|---:|---|
| Constructor | `193C78C` | Factory allocates `0x238` bytes and passes data in X1 to the constructor. |
| Logical reset | `193C804` | Reset operation, not the C++ destructor. |
| Deserializer | `193C878` | Instance vtable slot `+20`. |
| Data getter | `193CC00` | Tail branches to base data getter `1928320`. |
| Copy | `193CD40` | Copies source prediction coordinates `+230/+234` to destination `+30/+34`. |
| Target X / Y getters | `193CDDC` / `193CDE4` | Instance 32-bit fields `+1F4/+1F8`. |
| Instance vtable | `1EB1BC8` | Type getter at slot `+28` is `193CC04`, returning 1. |
| C++ destructors | `193CE60` / `193CF0C` | Vtable slots `+0/+8`. |
| Inherited data / GID | `+10` / `+8` | Base object accessors. |
| X / Y / Z | `+30/+34/+40` | Base object accessors. |
| Owner / raw team | `+44/+48` | Base object fields. |
| ProjectileData speed | getter `18A4FC0`, field `+124` | 32-bit load. |
| ProjectileData radius | getter `18A5040`, field `+130` | 32-bit load. |
| ProjectileData rendering | getter `18A5264`, field `+114` | 32-bit load. |

The old angle field's apparent successor at `+20C` is not confirmed to hold degrees. Renderer comparisons against values 1 and 2 are insufficient to establish angular units. Do not promote it to a degree-valued angle.

## P-01: Lifetime and indirect-flag verification

Path type: callflow. Start: skill projectile selection. Goal: establish scanner field meanings from independent consumers. Findings: F-01, F-02.

1. E-01: V68 `8C6030..8C6040` selects SkillData projectile index 0, calls spawn-area getter, then active-time getter, and converts milliseconds by dividing by 1000.
2. E-02: V70 `15AEFB8..15AEFC8` calls `18BD84C` with index 0, `18A51F4`, then `182FA94`, followed by the same divide-by-1000 conversion.
3. E-01/E-02: V68 `51E510` and V70 `BE4A94` independently compare that lifetime against 2000 (`0x7D0`) within matching global-object/data-flag logic.
4. E-01/E-02: The two rendering pairs above load the indirect flag with `ldrb`, establishing both its new offset and width.

Residual limitation: these checks establish native layout and caller semantics, not runtime safety of all callers or end-to-end feature operation.

## Reproduce the byte checks

Use IDA MCP `get_bytes` against E-01 for old decoded bytes; the standalone old ELF does not provide equivalent decoded instruction bytes for these checks. For E-02, the following read-only script prints the relevant instructions without relying on packaged IDA function boundaries:

```python
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN

path = r"G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so"
regions = [(0x18BD84C, 0x20), (0x18BDB3C, 8),
           (0x182FA94, 0x10), (0x15AEFB4, 0x40),
           (0xBE4A88, 0x20), (0xBD7E6C, 0x20), (0xBD83C0, 0x18)]
with open(path, "rb") as stream:
    elf = ELFFile(stream)
    disassembler = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
    for address, size in regions:
        for segment in elf.iter_segments():
            if (segment["p_type"] == "PT_LOAD"
                    and segment["p_vaddr"] <= address
                    < segment["p_vaddr"] + segment["p_filesz"]):
                stream.seek(segment["p_offset"] + address - segment["p_vaddr"])
                for insn in disassembler.disasm(stream.read(size), address):
                    print(hex(insn.address), insn.mnemonic, insn.op_str)
                break
```

The automatic active-time candidate `168F768` is rejected: its live code dereferences `+8` and branches to an unrelated helper. No shared IDA patches were used to obtain these conclusions.

## F-04: Combat data moved to cached fields

Status: validated statically. Confidence: high. Evidence: E-01 and E-02. Category: reverse_algo. These are field mappings; an unrelated native getter with the same small instruction body is not an accepted function match.

| Source accessor | Exact V68 behavior | Verified V70 equivalent |
|---|---|---|
| `getCastingRange`, `B0E384` | Reads CSV integer column global `1241DE0` from row `[data+8]`. | Read 32-bit field `data+27C`. Header `CastingRange` at `3087FE` is resolved at `18BF1B8` and stored as column `1EEAD28` at `18BF1C8`. Constructor `18BE4F4` reads that column, calls integer reader `18552F0`, and stores the result at `18BE500` into `+27C`. |
| `getMsBetweenAttacks`, `B0E698` | Reads CSV integer column global `1241D24`; header initializer `B0CD30` names `MsBetweenAttacks`. | Read 32-bit field `data+298`. Header bytes at `34FC0A`, XOR `58`, decode exactly to `MsBetweenAttacks` including the terminating null. Resolver `18BF394` stores column `1EEAD44` at `18BF3A4`. Constructor `18BE580` reads that column, calls `18552F0`, and stores `+298` at `18BE58C`. |
| Source `getBehaviour`, `B0EB7C` | Reads CSV `SkillChangeType`, not the separately named `BehaviorType` column. Global `1241E08`; header initializer `B0D920`. | Read parsed enum `data+21C`. Header `SkillChangeType` at `344C29` resolves to column `1EEACD8` at `18BEC28`. Constructor `18BE31C` reads it through `1855204`, parses through `18C0630`, and stores `+21C` at `18BE330`. |
| `getLinkedSkill`, `B0EB8C` | Pointer getter at `+158`. | `18BDEB8`: `ldr x0,[x0,#0x1B0]; ret`. |
| `isImmuneOrUntargetable`, `B32474` | Conditional special-type predicate, status bytes, and helper check. | `18EF9AC`: matching control flow. Relevant character byte fields `+228/+386/+143/+147` become `+248/+3BE/+164/+168`; special type integer `+23C` becomes `+258`. |
| `canActivate`, `B7AECC` | Boolean `(skill,player,character)`; ordinary kind 1 tests charge `skill+1C > 999`. | `1949C38`: same argument roles and ordinary charge test. SkillData redirect byte `+238` becomes `+348`; new byte `+35F` enables a cost calculation through `1949E14`. |

The source names do not establish semantics by themselves. In particular, selecting linked skills must use the SkillChangeType enum at `+21C`, while skill command kind remains a separate integer at `+2CC`.

The second `canActivate` argument is a player pointer, as established by the old null-player diagnostic. Passing null for the source's ordinary weapon-slot check is compatible with the kind-1 early return; bonus kind 5 requires a player and returns false when null. The new native implementation should be retained for its charge-cost behavior rather than reconstructing every branch in JavaScript.

## F-05: CharacterData identity is not a byte at +18

Status: validated statically. Confidence: high. Evidence: E-01 and E-02. Category: reverse_algo.

The source scanner reads `CharData_brawlerId = 0x18` with `readU8`. Both baselines show that `+18` is a cached name pointer:

- E-01: base data initializer `AC43B0` calls CSV row name getter `CF734C` and stores its pointer result at `AC4494` into `data+18`.
- E-02: base data initializer `1854A50` calls row name getter `8E4020` and stores its pointer result at `1854B34` into `data+18`; the alternate path stores a fallback pointer at `1854B1C`.

The full native data global ID is a 32-bit integer at `+20`, returned by `1854B80`. Helper `1854B88` loads that integer then branches to `197FCC4` to extract its instance ID. Use the full ID as an identity/cache key or apply the native conversion when an instance ID is required. Reading the low byte of the name pointer produces neither identity.

## Constructor and reset clarification

At `19288E4`, the projectile factory allocates `0x238` bytes, moves its saved data pointer into X1 at `19288EC`, and calls `193C78C` at `19288F4`. Constructor `193C78C` forwards X1 to base constructor `19281DC`; the base saves X1 in X20 and stores it into `this+10` at `1928234`. Thus the constructor's second native argument is the data pointer.

`193C804` resets logical state and clears target/prediction fields after calling base reset `19285D4`. It is suitable as a cache-invalidation lifecycle hook. It is not proof of memory deallocation; actual C++ destructor entries remain `193CE60` and `193CF0C`.
