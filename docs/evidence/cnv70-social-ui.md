# CN V70 social messages and decorated UI evidence

Date: 2026-11-07. Scope: read-only ARM64 analysis and bounded root memory reads, with IDA MCP for cross-references and decompilation. No chat, ready, or spectate messages were sent. These mappings establish native identities and layout, not successful feature execution.

## Inputs and limitations

| Input | Identity |
| --- | --- |
| Exact V68 ELF | `G:\Brawlstars-CN-V70\original-history-i64\libg_REvenge_v68.so` |
| V68 SHA-256 | `C56C2882A31D4B6A1F5355672B115AE38F67776A4C1EC41198C1EF7CA16C1407` |
| Live V70 executable snapshot | `G:\Brawlstars-CN-V70\analysis\runtime\CNV70libg.live-2118.so` |
| V70 snapshot SHA-256 | `C85A93BF497D912A1DA7DB2BC315E8C8F9A8207557D330B4313015C0C3139624` |
| Direct BinDiff leads | `analysis\bindiff-revenge-result\libg_REvenge_v68.snapshot_vs_CNV70libg.snapshot.BinDiff` |
| IDA MCP database | `e7b311b8`, adopted V70 GUI database |

Both main libraries are stripped. Addresses below are RVAs relative to the corresponding main library base. The V70 snapshot replaces executable sections only. Its retained strings, jump tables and import labels can remain transformed or misleading. Native instruction checks take precedence over packaged IDA labels; the gradient dispatch table was read separately from the live process.

## Message construction and dispatch

| Dependency | Exact V68 | Confirmed V70 | Evidence |
| --- | --- | --- | --- |
| Scalar allocator trampoline | `0x11A5760` | `0x1DAFBC0` | E-SOC-01 |
| PiranhaMessage constructor | `0xD01BF4` | `0xA129DC` | E-SOC-02 |
| TeamChatMessage constructor | `0xBD33FC` | `0x19B5CAC` | E-SOC-03 |
| TeamChatMessage vtable | `0x120DB90` | `0x1EB7830` | E-SOC-03 |
| Embedded team chat ScString | `+0x90` | `+0x90` | E-SOC-03 |
| Ready default constructor | `0xBD6B50` | `0x19B9820` | E-SOC-04 |
| Ready constructor with three integers | `0xBD6B88` | `0x19B9858` | E-SOC-04 |
| Ready vtable | `0x120E3B0` | `0x1EB8050` | E-SOC-04 |
| Ready integer fields | `+0x90/+0x94/+0x98` | `+0x90/+0x94/+0x98` | E-SOC-04 |
| MessageManager singleton pointer | `0x12EED80` | `0x1FFF188` | E-SOC-05 |
| MessageManager sendMessage | `0x80F37C` | `0x14488E0` | E-SOC-05 |
| StartSpectateMessage constructor | `0xC07AF4` | `0x19F6C80` | E-SOC-06; ABI changed |

**E-SOC-01 — allocator.** V70 callers place an allocation size in W0 before `BL 0x1DAFBC0`, then initialize the returned allocation. The trampoline reads GOT slot `0x1EDB908`. A separate companion-library verification recorded in [cnv70-camera-wall.md](cnv70-camera-wall.md) resolves the live target to `libRoosterNN.so + 0x1C6ACC`, exact dynamic symbol `_Znwm`, with its first 96 bytes equal to the companion ELF. Retained `.rela.plt` labels incorrectly describe this slot as shared weak-count release; using the static `_Znwm` label at a different trampoline is unsafe.

The corresponding scalar deallocator is main-library trampoline `0x1DAFB80`, callable as `void(pointer)`. A separate read-only check in PID `13248`, main base `0x75A9895000`, reads GOT `0x1EDB8E8` as `0x75AF22DB8C`. The allocation GOT above resolves to `0x75AF22DACC`, placing the shared companion base at `0x75AF067000`. The deallocator target is therefore `libRoosterNN.so + 0x1C6B8C`: exact dynamic symbol `_ZdlPv`, symbol size 4, instruction `B 0x3BF70`. The first 48 live bytes equal the companion ELF at that RVA. This proves scalar delete independently of the misleading retained import label `__register_atfork`; no deallocator was invoked during verification. Native derived-message deleting destructors also tailcall this trampoline. The command sender can use it to release an unqueued ClientInput allocation if construction or signing fails.

**E-SOC-02 — message base.** V70 `0xA129DC` installs vtable `0x1DBDAF8`, constructs the byte stream at object `+8` through `0x9743E8`, then stores version and zero at `+0x88`. V68 `0xD01BF4` has the corresponding structure, using vtable `0x1219FB0` and byte-stream constructor `0xCF8A40`.

**E-SOC-03 — team chat identity.** V68 `0xBD34B8` returns message type `14049` (`0x36E1`); V70 `0x19B5D68` returns the same type. V70 relocation `0x1EB7858` points to that getter, placing it at vtable `0x1EB7830 + 0x28`. Constructor `0x19B5CAC` calls the confirmed base constructor with version zero, installs `0x1EB7830`, and tailcalls default ScString constructor `0xA171D4` on `message+0x90`. Encoder `0x19B5CE4` passes that embedded string to byte-stream virtual slot `+0x20`.

Native UI sender `0xCF0DD0`, at `0xCF0F50..0xCF0F80`, allocates `0xA0` bytes, calls `0x19B5CAC`, assigns its prepared string to `+0x90` through `0xA17AAC`, and sends through `[MessageManager singleton]->vtable[+0x18]`. The JavaScript chat module's existing 512-byte allocation is larger than the native allocation. Its two-pointer message-constructor/sender call shapes remain valid. No native message was constructed or sent during this investigation.

**E-SOC-04 — ready identity.** V68 getter `0xBD6C58` and V70 getter `0x19B9928` both return `14358` (`0x3816`). V70 relocation `0x1EB8078` locates the type getter at vtable `0x1EB8050 + 0x28`. Default constructor `0x19B9820` zeroes the three integers. The overloaded constructor `0x19B9858` stores W1/W2/W3 at `+0x90/+0x94/+0x98`; encoder `0x19B98A4` writes them sequentially through `0x9759A0`. The initial BinDiff lead `0x19B5788` has a different field shape and is rejected.

**E-SOC-05 — manager identity and sender.** Initializer `0x1447EF4` allocates `0x2B0`, installs vtable `0x1E6CEE8`, stores the supplied transport at `+0x70`, and publishes the instance at global `0x1FFF188` (`0x144801C`). Relocation `0x1E6CF00` binds its virtual send slot `+0x18` to `0x14488E0`, exactly the slot called by the native team chat sender.

Live sender instructions at `0x14488E0` save X0 as manager and X1 as message, call mode predicate `0x17C4D20`, and check transport readiness using `0xB69304([manager+0x70])`. One mode appends to the manager's pointer array at `+0xF0`, capacity `+0xF8`, count `+0xFC`. The other calls `0xB69318(transport,message)`. The disconnected path invokes message virtual cleanup slots `+0x38`, then `+8`. The corresponding V68 sender uses the same control flow with its older queue fields. This rejects the weak BinDiff lead `0x147486C`.

**E-SOC-06 — spectate ABI warning.** V68 `0xC07AF4(this,longPointer,flag)` installs vtable `0x12112D8`, copies the long pointer into `+0x90`, and stores the flag byte at `+0x98`. V70 `0x19F6C80` installs vtable `0x1EBB260`, performs the corresponding pointer copy through `0x8F1F60`, and additionally stores argument X3 at `+0xA0`. A V70 network-spectate caller must supply the fourth argument; a blind three-argument binding is incomplete. The current spectator-count feature does not invoke this constructor.

## Local spectator count rendering

| Dependency | V68 | Confirmed V70 |
| --- | --- | --- |
| BattleScreen update | `0x59C74C` | `0xC60C40` |
| Spectator widget | screen `+0x3E8` | screen `+0x3C8` |
| Spectator text field | screen `+0x3F8` | screen `+0x3D8` |
| DisplayObject visible | `+8` byte | `+8` byte |
| MovieClip gotoAndStop(index) | `0xCB5070` | `0x995B24` |
| TextField setText(field,ScString) | `0xCE46F0` | `0x948D44` |

**E-UI-01.** Battle update `0xC60C40` reads live spectator count from inner logic `+0x144`. At `0xC61698`, it loads widget `screen+0x3C8`, sets its visible byte, then loads logic flag `+0x14D` into W1 and calls `0x995B24`. That routine stores the requested frame into MovieClip `+0xDA`, checks it against frame count `+0xDE`, updates frame state and stops playback.

**E-UI-02.** When the numeric label helper is absent, `0xC61860` loads the text field from `screen+0x3D8`; `0x177DBB4` wraps that pointer. The update passes the helper and count to `0x177DC4C`, which formats `%i`, dereferences its text field, and calls `0x948D44`. This proves that `+0x3D8` is the numeric spectator label, rather than inferring it from adjacency.

The JavaScript module changes local text and animation frame only. These identities do not establish any change in server-side spectators or broadcast state.

## Gradient and common UI layout

| Dependency | V68 | Confirmed V70 | Evidence |
| --- | --- | --- | --- |
| Name setup decorated | `0x5C1644` | `0xC836F0` | E-UI-03 |
| Name apply decoration | `0x5C16AC` | `0xC83758` | E-UI-03 |
| Convert plain field to decorated | `0x5C11D0` | `0xC832B8` | E-UI-04 |
| Decorated vtable used by name wrapper | `0x11B1E48` | `0x1DCDF90` | E-UI-04 |
| Plain TextField vtable | `0x1218C28` | `0x1DB9EA8` | E-UI-05 |
| Decorated marker | `+0x44 = 726355` | `+0x4C = 726355` | E-UI-04 |
| Text ScString | `+0xE0` | `+0xE8` | E-UI-03/E-UI-05 |
| Gradient pointer | `+0x268` | `+0x270` | E-UI-03 |
| DisplayObject parent | `+0x38` | `+0x40` | E-UI-04 |
| MovieClip predicate virtual slot | `+0x80` | `+0x80` | E-UI-04 |
| Sprite constructor | `0xCC6864` | `0x94AFBC` | E-UI-06 |
| Sprite child count (U16) | `+0x4E` | `+0x56` | E-UI-06 |
| Sprite child array | `+0x50` | `+0x58` | E-UI-06 |
| Stage singleton pointer | `0x12F3CC0` | `0x1F91CE0` | E-UI-07 |
| Gradient table index | `46` | `46` | E-UI-08 |
| GradientData vtable | `0x1206830` | `0x1EACD38` | E-UI-08 |

**E-UI-03.** `0xC836F0(field,text,gradient)` converts through `0xC832B8`, then calls `0xC83758` and returns the decorated field. `0xC83758` invokes `0xC84168`, whose live instructions store X1 to `[X0+0x270]` and dispatch virtual slot `+0x168`. The apply routine copies the old string from `field+0xE8`, calls `0x948D44(field,text)`, compares the old/new strings, and maintains another cached string at `+0x2B0`. Optional particle names come from gradient getters `0x1854260` and `0x1854270`.

**E-UI-04.** `0xC832B8` tests the integer at `field+0x4C` against `726355`. Otherwise it loads `field+0x40`, requires its virtual `+0x80` predicate, allocates `0x2C0` bytes, calls decorated base constructor `0xC83F6C`, installs vtable `0x1DCDF90`, constructs cached text at `+0x2B0`, writes the marker, and replaces/inserts the field through `0xC83C94`. Base decorated constructor installs a different vtable, `0x1DCE110`; the wrapper's final vtable is the one used for the current name-field identity check.

**E-UI-05.** Plain constructor `0x94368C` installs vtable `0x1DB9EA8` and constructs text at `+0xE8`. Setter `0x948D44` compares the supplied ScString with that field, assigns through `0xA17AAC`, and calls dirty/layout routine `0x944324` when it changes. The optional localization/filter branch still converges on assignment to the same embedded string. The initially low-scoring BinDiff text-setter lead is therefore confirmed by native use and exact field behavior.

**E-UI-06.** Sprite constructor `0x94AFBC` follows the exact V68 constructor structure: base DisplayObject call, vtable, packed child-capacity/state fields, child count zeroing, inline child storage, and optional heap storage. At `0x94B004`, `STRH WZR,[X19+0x56]` initializes count; at `0x94B00C`, `[X19+0x58]` points to inline storage `this+0x60`, later replaced by a heap pointer if capacity is larger. Its vtable is `0x1DBA0C8`. The high-scoring but unrelated BinDiff `0xCC6864 -> 0x16DC390` is rejected after instruction comparison.

**E-UI-07.** Stage initializer `0x94F558` checks global `0x1F91CE0`, allocates `0xE58`, calls `0x94D6B0`, and stores the result into that global at `0x94F59C`. This matches V68 singleton initialization `0xCCB318`, rather than a guessed global near other UI state. Stage container offset and Stage addChild are left to the parallel UI evidence owner; they must not be inferred from the source `+0xA8` or the weak BinDiff candidate `0x1545DAC`.

**E-UI-08.** Gradient factory dispatch uses the data-table type integer at `table+0x50`. At `0x1855874`, it subtracts one, reads a halfword from jump table `0x3C1E44`, and branches to `0x1855898 + (halfword << 2)`. A fresh root read at `2026-11-07T02:02:33.906312+00:00`, PID `13248`, validated main-library base `0x75A9895000`, captured `0x18C` bytes from that table. SHA-256: `c357f4baeb7d874499e5be00c1cb87e1ce14ba85de33b476cf34c9934864a1ff`. Entry 45 (type 46) is `0x01A8`, giving branch destination `0x1855F38`.

At `0x1855F38`, the factory allocates `0x60` and calls constructor `0x1853F00`, which installs vtable `0x1EACD38`. Its loader at virtual `+0x20`, `0x1853F70`, initializes the color collection. Column initializer `0x185409C` resolves `Colors`, `Scale`, `ParticleFile`, and `ParticleExportName`. Particle getters used by the decorated text routine resolve those same column globals at `0x1EE9680/0x1EE9684`. This closes the identity chain from gradient rendering to DataTable type 46.

For shared table-base and CSV ABI evidence, see [cnv70-scanner-native.md](cnv70-scanner-native.md). The table array slot zero is `0x2003828`; the gradient table is therefore the pointer slot at `0x2003828 + 46*8`, subject to native initialization being complete.

## Reproduction and remaining validation

Raw executable observations can be reproduced by mapping an RVA through the ELF PT_LOAD segment and disassembling its bytes with Capstone ARM64. Read `.rela.dyn` addends to reconstruct the named vtable slots; do not treat file bytes containing zero pointers as runtime vtables. IDA MCP `decompile` and `xrefs_to` were used to connect callers, constructors and rendering helpers without modifying either database.

The following snippet reproduces the gradient jump-table check after supplying a freshly resolved PID and main-library base. The shown defaults identify this capture only and must be refreshed after restart. The helper reads process memory; it does not write to the target.

```powershell
@'
import sys, struct
sys.path.insert(0, r'G:\Repo\REvengeBS\tools')
from cnv70_code_snapshot import read_root_memory
serial = 'PJ696HEY9DNRLFFQ'
pid = 13248
base = 0x75A9895000
assert read_root_memory(serial, pid, base, 4) == b'\x7fELF'
table = read_root_memory(serial, pid, base + 0x3C1E44, 0x18C)
entry = struct.unpack_from('<H', table, (46 - 1) * 2)[0]
assert entry == 0x1A8
assert 0x1855898 + 4 * entry == 0x1855F38
print('Gradient factory type 46 confirmed')
'@ | python -
```

At the bounded root-read time, both MessageManager `0x1FFF188` and Stage `0x1F91CE0` were NULL. Static layout proof therefore does not establish initialized objects in the current process. No UI mutation, rendering outcome, chat delivery or private battle execution is claimed here. Remaining validation is initialized-object inspection and local UI checks during the authorized private friendly/practice match. Network spectate's extra argument remains a separate binding requirement.

Evidence to finding to implementation path: E-SOC-01..05 establish the allocator, constructors and sender used by `agent/features/chatspam.js`; E-UI-01..02 establish the local fields used by `agent/features/spectator.js`; E-UI-03..08 establish the names, layouts and gradient table used by `agent/features/gradient.js`. These are mapping results for the CN V70 offset profile, with runtime activation handled separately.
