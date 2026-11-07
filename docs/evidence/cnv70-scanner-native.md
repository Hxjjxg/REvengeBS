# CN V70 scanner and data ABI evidence

Observed on 2026-11-07. This document records native code and ELF relocation evidence for the scanner port. These results establish layouts and callable interfaces; they do not claim that the gameplay scanner has passed a private-match test.

The work was limited to the supplied V68/V70 binaries, existing IDA databases through MCP, and the previously captured executable snapshot. No gameplay commands or additional device interaction were performed for this analysis. The authorized gameplay validation mode is a private friendly/practice match. General binary survey/import evidence is in [CNV70_PORT.md](../CNV70_PORT.md).

## Artifacts and interpretation

| Evidence | Artifact | SHA-256 |
|---|---|---|
| E-source | `G:\Brawlstars-CN-V70\original-history-i64\libg_REvenge_v68.so` | `C56C2882A31D4B6A1F5355672B115AE38F67776A4C1EC41198C1EF7CA16C1407` |
| E-live | `G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so` | `C85A93BF497D912A1DA7DB2BC315E8C8F9A8207557D330B4313015C0C3139624` |
| E-diff | `analysis\bindiff-revenge-result\libg_REvenge_v68.snapshot_vs_CNV70libg.snapshot.BinDiff`, under the binary workspace | Used to select candidates; instruction/caller evidence below determines acceptance |

All addresses are RVAs relative to `libg.so`. E-live contains captured executable sections over the packaged ELF. Its relocation metadata remains useful for identifying vtable entries. It is not a complete dump of initialized data or decrypted strings. Some packaged IDA ranges remain transformed, so a failed decompile is not evidence that a live function is absent. The read-only disassembly reproduction at the end uses E-live directly.

## Scanner object layout

| Meaning | V70 RVA or field | Evidence |
|---|---:|---|
| Client getData | `0x1928320` | Live `LDR X0,[X0,#0x10]; RET`; matched character/type callers |
| Client global ID | `0x192869C` | Live `LDR W0,[X0,#8]; RET` |
| Client X/Y/Z | `0x19286F0` / `0x19286F8` / `0x1928700` | Live loads from `+0x30` / `+0x34` / `+0x40`; paired rendering callers |
| Client XY vector | `0x1928708` | Live `ADD X0,X0,#0x30`; distance/path callers use result and result+4 |
| Owner index / raw team | `+0x44` / `+0x48` | Team resolver and rendering helpers |
| Team resolver | `0x1928710` | Resolves owner through the player array, then falls back to raw team `+0x48` |
| Character vtable | `0x1EB1570` | Constructor `0x18EAE2C`, store at `0x18EAE5C` |
| Own/predicted character vtable | `0x1EB15D0` | Constructor `0x18F0578` calls the character constructor, then stores this vtable at `0x18F0598` |
| Character alive predicate | `0x18EE794` | Signed `+0xCC > 0`; both character vtables use this function at slot `+0x30` |
| Character health | `+0xCC` | Serializer and native alive predicate |
| Character current movement speed | `+0x250` | Serializer, movement prediction, and source camera comparison against base data speed |
| Character body pointer | `+0x420` | Matched deserializer finds an object by ID/kind and stores its pointer |
| Projectile instance vtable | `0x1EB1BC8` | Constructor/factory and relocation evidence from the projectile analysis |
| Projectile target X/Y | `+0x1F4` / `+0x1F8` | Getters `0x193CDDC` / `0x193CDE4`, rendering, parser and copy routines |

E-effective-team-caller: The second argument of `0x1928710` is the inner battle logic itself, whose first fields contain the player pointer array at `+0` and count at `+0xC`. This is proven by two independent live native callers, rather than inferred from the field shape. Helper `0xBF0374` obtains the outer singleton with `BL 0x16FE760` at `0xBF0388`, loads inner logic with `LDR X0,[X0,#0x28]` at `0xBF038C`, and calls own-team getter `0x1A20358`. It then repeats the singleton lookup at `0xBF0398`, loads `LDR X1,[X0,#0x28]` at `0xBF039C`, restores the object into X0 at `0xBF03A0`, and calls `0x1928710` at `0xBF03A4` before comparing the returned team with the own team.

Native closest-autoshoot-target routine independently executes `BL 0x16FE760` at `0x15068E4`, `LDR X1,[X0,#0x28]` at `0x15068E8`, `MOV X0,X21` at `0x15068EC`, and `BL 0x1928710` at `0x15068F0`. Consequently the shared scanner can call `resolveTeam(object,bm)` using its inner update argument directly. The resolver checks owner index `object+0x44` against the inner player count, loads that player from the array, and obtains its effective team through `0x1A4EB20`. It falls back to raw `object+0x48` when the logic pointer, owner, player, or effective team is unavailable. Reading raw `+0x48` alone does not reproduce native team classification for owned characters/projectiles.

E-character-alive: V68 character vtable `0x1209930` slot `+0x30` points to `0xB3148C`, which tests signed health at `+0xAC`. V68 deserializer `0xB2EDE8` stores serialized field `0x7C` into `+0xAC`. V70 `0x18EBD00` stores field `0x80` into `+0xCC`; `0x18EBD14` reads that field and branches on whether it is positive. Live predicate:

```asm
18EE794  LDR  W8, [X0,#0xCC]
18EE798  CMP  W8, #0
18EE79C  CSET W0, GT
18EE7A0  RET
```

Relocations at `0x1EB15A0` and `0x1EB1600` point to this predicate. The matched effect callers V68 `0x54FDB8` and V70 `0xBF3BE4` gate on virtual slot `+0x30` before rendering effects.

E-character-speed/body: V68 serializes current speed to `+0x234`; camera `0x8572D4` subtracts the character-data speed from that value. V70 serialization stores current speed at `0x18ED664` into `+0x250`; movement routine `0x18F0728` reads it at `0x18F0F68`, clamps negatives and uses it for predicted movement. V70 body resolution calls `0x192D3F0` at `0x18EBB30` and stores the resulting pointer at `0x18EBB3C` into `+0x420`, matching V68's `+0x3E8` field.

Do not migrate these older field names literally:

- V68 `GameObj_deadFlag = +0xD0` is an array pointer, as shown by constructor/reset/destructor behavior; it is not a death flag.
- V68 `LogicCharacterClientOwn_speedBuff = +0x1FC` belongs to the LifeSteal buff aggregate. The data loader's `LifeSteal` field feeds that aggregate. It is not movement speed.
- V70 `+0x40` is Z. Team moved to `+0x48`.

## Recognizing character and projectile data

| Meaning | V70 value | Native evidence |
|---|---:|---|
| Character data vtable | `0x1EACA50` | Constructor `0x1840640` installs it at `0x184066C` |
| Projectile data vtable | `0x1EAF720` | Constructor `0x18A0720` installs it at `0x18A0740` |
| Character data base speed | getter `0x1841618`, field `+0x26C` | Live scalar getter and matched speed callers |
| Character data collision radius | getter `0x184182C`, field `+0x2AC` | Live scalar getter and rendering/collision callers |
| Character data type | `+0x304` | Parser `0x1840AC0` assigns `Hero`, `Her0`, NPC and other type values |
| Character effective type getter | `0x18EB5E0` | Uses cached object `+0xC8` if nonnegative; otherwise reads data `+0x304` |
| Hero-type predicate | `0x18414EC` | Takes an integer type; true for `0` or `26` |

E-data-class: Character data constructor `0x1840640` calls the common data base constructor and initializes the large character-data layout. Its vtable's destructor entries are `0x1847EA4` and `0x18480BC`; entries at `0x1EACA60` and `0x1EACA70` lead into character reset/load routines. Parser `0x1840AC0` recognizes strings including `Hero`, `Her0`, `Npc_Boss`, and `Minion_FollowOwner`, and emits `Character has invalid type!` for unsupported values. V70 native deserialization at `0x18EB6B8` calls getData, loads `+0x304`, and calls `0x18414EC`, independently confirming the hero discriminator ABI.

Projectile data relocation entries are:

| Slot address | Target | Role |
|---|---:|---|
| `0x1EAF720` | `0x18A56A0` | Destructor |
| `0x1EAF728` | `0x18A5794` | Deleting destructor |
| `0x1EAF730` | `0x18A094C` | Reset path |
| `0x1EAF740` | `0x18A0970` | Data loader |

The exact V68 character data constructor at `0xAAFC18` installs `0x12063F0`. The existing source profile's configured character data vtable `0x1206000` is stale for that exact binary. Its projectile data constructor `0xAF6DCC` installs the configured `0x12080A0`.

## Names and ScString ABI

| Meaning | V70 RVA or offset | Evidence |
|---|---:|---|
| LogicData getName | `0x1854B90` | Loads row pointer `data+8`, then branches to CSVRow getName `0x8E4020` |
| IconSWF ScString | data `+0x30` | Common data loader `0x1854A50` reads CSV `IconSWF` |
| IconExportName ScString | data `+0x40` | Same loader reads `IconExportName`; fallback `ExportName` also writes here |
| Icon string heap pointer | data `+0x48` | ScString `+8` member within embedded string at `+0x40` |
| ScString length | `+4`, signed 32-bit | Constructor, copy and resource lookup paths |
| ScString storage | `+8` | Inline bytes if length `<8`, otherwise a heap pointer |
| ScString size | `16` | Adjacent constructor fields, stack objects, and copy routines |
| C-string constructor | `0xA175C8` | Computes length, stores `+4`, selects inline/heap storage at `+8` |
| Destructor | `0xA174A8` | Matched V68 `0xE9768C` and native string cleanup callers |
| Copy constructor | `0xA17648` | Explicit length/storage branches; used by data and CSV callers |

E-name-string: V68 `0xAC44F0` and V70 `0x1854B90` have the same load-and-tail-call structure. Their helper functions V68 `0xCF734C` and V70 `0x8E4020` extract CSV table/row data and return the name ScString. V70 `0x1854B98` copies this returned value using `0xA17648`, confirming the return type.

The common loader stores `IconExportName` into the embedded ScString at `+0x40` at instruction `0x1854AA8`. Reading a pointer at data `+0x48` works for `hero_icon_*`, because those names exceed seven bytes. `readScString(data.add(0x40))` also handles short or empty icon names correctly. CSV row names returned by getName and icon export names are distinct values; the native integer hero predicate avoids relying on an icon prefix to exclude NPCs.

## CSV initialization dependencies

`initCSV` is a JavaScript initializer. The addresses it binds are:

| Binding | Exact V68 | V70 | ABI |
|---|---:|---:|---|
| CSVRow getName | `0xCF734C` | `0x8E4020` | pointer(row) -> ScString pointer |
| CSVRow getValueAt | `0xCF73CC` | `0x8E44CC` | pointer(row), int(column) -> ScString pointer |
| CSVRow getIntegerValueAt | `0xCF73BC` | `0x8E44BC` | pointer(row), int(column) -> int |
| CSVRow getBooleanValueAt | `0xCF73AC` | `0x8E44AC` | pointer(row), int(column) -> boolean value |
| CSVTable getColumnIndexByName | `0xCF7BCC` | `0x8E2078` | pointer(table), C-string name -> int |
| ResourceManager getCSV | `0xC87D5C` | `0x8D2980` | ScString pointer -> table holder pointer |

E-csv-row: V70 row wrappers load `table = [row]` and `rowIndex = [row+8]`. The value wrapper tail-calls `0x8E1F54`, and the integer wrapper tail-calls `0x8E20D4`; the supplied column remains in W1. `0x8E1F54` returns the embedded 16-byte ScString for that column and row, using the table's column array at `+0x38`.

E-csv-resource: V70 `0x8D2980` decodes the incoming ScString using the same `<8` storage rule as V68 `0xC87D5C`, looks up the resource at `0x8D0A30`, checks resource type `3`, ensures loading via `0x8D88C4`, and returns `[[resource+0x90]+8]`. The older resource field is `+0x88`. The low BinDiff similarity of this function does not invalidate the match: its added resource-type check accounts for changed control flow, while argument decoding and the returned resource payload agree.

The returned holder must be dereferenced once to get the CSVTable. Native caller `0xB435A4` constructs `csv_client/client_globals.csv`, calls `0x8D2980`, then calls `0x8E0FA8`, whose complete implementation is `LDR X0,[X0]; RET`. The existing `loadCSV` holder dereference therefore remains appropriate. Unknown or unloaded filenames must not be used to assume this native wrapper is null-safe; its type-rejection path still reaches resource access code.

E-csv-layout: CSVTable row array `+0x48`, row count `+0x54`, and pointer stride `8` remain valid. Appending a row at `0x8E23A8` reads count `+0x54`, reads array `+0x48`, increments count, and stores the row pointer using `index*8`. Native name lookup at `0x8E2410` reads the same count/array pair. CSVRow contains table pointer `+0`, row index `+8`.

## Data table initialization dependencies

`initDataTables` only saves the module base in JavaScript. It does not call a native initialization routine. Its two native dependencies are:

| Item | Exact V68 | V70 |
|---|---:|---:|
| Global table pointer array, slot zero | `0x12F0AA8` | `0x2003828` |
| Find-by-name virtual slot | `+0x30` | `+0x30` |

E-data-tables: Source post-load/cleanup routine `0xAD0BE0` uses base `0x12F0978` and begins walking pointer offsets at `0x138`, placing table index one at `0x12F0AB0` and slot zero at `0x12F0AA8`. Its matched V70 routine `0x18708A8` uses X27 = `0x2003688`. The filtered path computes `X27 + index*8`, then loads the table at `+0x1A0`, with index starting at one. The unfiltered path begins at byte offset `0x1A8`. Both establish the same slot-zero base `0x2003828`. V70's traversal ends before index `0xC8`.

Native initialization calls through table vtable slot `+0x30` with a ScString name and a null third argument, preserving the ABI used by `findDataByName(table, name)`. This establishes the array and lookup mechanism. It does not establish that every V68 numeric table index is unchanged: in particular, `GRADIENT_TABLE_INDEX = 46` needs its own table identity check before cosmetic code uses it.

## LogicBattleModeClient fields and accessors

Keep outer BattleMode and inner LogicBattleModeClient pointers separate. `BattleMode_getInstance` returns the outer object. Rendering callers obtain the inner logic pointer from outer `+0x28`. `GameScreen_getLogicBattle` at `0x15141BC` returns `[[screen+0x9A0]+0x28]`.

| Inner logic field | V70 offset | Evidence |
|---|---:|---|
| Player pointer array | `+0` | Team resolver reads indexed player entries |
| Player count | `+0xC` | Resolver checks owner index against this count |
| Client object manager | `+0x28` | Constructor `0x1A1DA1C`, own-character getter `0x1A20700` |
| Own player index | `+0xE0` | Getter `0x1A20350`; exact V68 getter `0xC23600` uses the same field |
| Own team | `+0xE4` | Getter `0x1A20358`; exact V68 getter `0xC23608` uses the same field; native resolver comparisons |
| Tile map | `+0xF8` | Getter `0x1A20680`; constructor creates it at `0x1A1DB4C` |
| Own object ID | `+0x100` | Getter `0x1A20700` passes it to findGameObject |
| Predicted move X/Y | `+0x10C` / `+0x110` | Setter `0x1A20864` |
| Predicted move argument flag | `+0x114` | Setter writes its fourth argument as a byte |
| Prediction update flag | `+0xAC` | Same setter writes byte `1` |
| Game mode variation | `+0x124` | Rendering callers pass this field to game-mode classification helpers |

Relevant callable RVAs:

| Function | V70 RVA |
|---|---:|
| BattleMode getInstance | `0x16FE760` |
| LogicBattleModeClient constructor | `0x1A1DA1C` |
| LogicBattleModeClient update candidate | `0x1A1E198` |
| Get own player index / team | `0x1A20350` / `0x1A20358` |
| Get tile map / own character | `0x1A20680` / `0x1A20700` |
| Set client prediction move-to | `0x1A20864` |
| Object manager findGameObject | `0x192D3F0` |
| GameScreen getLogicBattle | `0x15141BC` |

E-team-correction: `0x1A1FF10` reads `+0xEC` and is not the own-team getter. The earlier tiny-function BinDiff match from V68 `0xC23608` to `0x1A1FF10` is rejected. V70 `0x1A20350`/`0x1A20358` and the following full function at `0x1A20360` preserve the V68 neighboring sequence `0xC23600`/`0xC23608`/`0xC23610`. Native rendering functions `0xBB1960` and `0xBB1A4C` compare `0x1928710(object, logic)` against `0x1A20358(logic)`.

The object manager's pointer array `+0`, count `+0xC`, and pointer stride `8` match the established scanner accessor path. Runtime probing should validate manager bounds and object/data vtables before reading class-specific members.

## Applying the findings

Finding F-scanner-layout is supported by E-live, E-character-alive, E-character-speed/body and E-data-class. It permits implementing character recognition, alive gating, coordinates, body resolution and speed reads with the fields above. Check both base and own-character vtables; requiring identical vtables for linked character objects can exclude a valid subclass.

Finding F-string-csv is supported by E-name-string, E-csv-row, E-csv-resource and E-csv-layout. It permits binding `initCSV`, reading CSV names and icon export names, and retaining the existing holder dereference and CSV row layout.

Finding F-data-tables is supported by E-data-tables. It permits binding the V70 global table array and virtual lookup ABI. Individual numeric table identities remain separate validation work.

Finding F-team is supported by E-team-correction. Use inner logic `+0xE4` or its native getter, and use the native team resolver where owner-based team overrides matter.

The validation path is a bounded, read-only probe during a private friendly/practice match: locate own ID through the manager, verify class/data vtables and coordinates, observe health across damage/respawn, and compare current speed to base data speed. Failed reads should not consume the successful-sample budget, and selecting only the first few manager entries cannot establish projectile or own-character coverage. No such gameplay completion claim is made here.

## Reproducing the native excerpts

Run in PowerShell with Python, pyelftools and Capstone installed. This reads the two existing artifacts; it does not attach to the device or modify an IDB.

```powershell
@'
from pathlib import Path
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN

root = Path(r'G:\Brawlstars-CN-V70')
samples = {
    root / 'original-history-i64/libg_REvenge_v68.so': [
        (0xC23600, 0x20), (0xAD0BE0, 0x80), (0xAC44F0, 8)
    ],
    root / 'analysis/runtime/CNV70libg.live-2118.so': [
        (0x18EE794, 16), (0x1840640, 0x30), (0x18A0720, 0x28),
        (0x1854B90, 8), (0x1854A50, 0x60), (0xA175C8, 0x80),
        (0x8E44AC, 0x30), (0x8D2980, 0x60), (0x8E0FA8, 8),
        (0x18708A8, 0xD4), (0x1A20350, 0x20), (0x1A20700, 0x14),
        (0x1A20864, 0x20)
    ]
}
decoder = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
for path, regions in samples.items():
    print(path)
    with path.open('rb') as source:
        elf = ELFFile(source)
        segments = list(elf.iter_segments())
        for address, size in regions:
            segment = next(s for s in segments if s['p_type'] == 'PT_LOAD'
                           and s['p_vaddr'] <= address
                           < s['p_vaddr'] + s['p_filesz'])
            source.seek(segment['p_offset'] + address - segment['p_vaddr'])
            for ins in decoder.disasm(source.read(size), address):
                print(f'{ins.address:08X} {ins.mnemonic} {ins.op_str}')
        relocations = elf.get_section_by_name('.rela.dyn')
        if relocations:
            for relocation in relocations.iter_relocations():
                location = relocation['r_offset']
                if (0x1EACA50 <= location < 0x1EACA80
                        or 0x1EAF720 <= location < 0x1EAF750
                        or location in (0x1EB15A0, 0x1EB1600)):
                    print(f'reloc {location:X} -> {relocation["r_addend"]:X}')
'@ | python -
```
