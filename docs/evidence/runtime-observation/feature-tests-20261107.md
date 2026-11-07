# User-operated feature tests, 2026-11-07

## Scope and results

The user tested features individually in training/private bot matches and reports
no problems with aimbot, holdshoot, killaura (default normal attack only), spinner,
autododge, and FPS unlock with FPS display. These results apply to the tested
defaults and situations, not every hero, skill or feature combination.

Each local `tmp/test-{feature}.jsonl` log contains cleanup completed=true with no
failures, no ERROR messages and no error-level agent log entries:

| Feature | Last recorded tick count | User result |
|---|---:|---|
| aimbot | 4287 | Passed |
| holdshoot | 1774 | Passed |
| killaura | 3151 | Passed, default attack-only configuration |
| spinner | 1880 | Passed |
| autododge | 4241 | Passed, final sample retained 10 projectiles |
| fpsunlock + fps | 6020 | Operational, rate discrepancy remains open |

The user earlier confirmed camera, FPS label and ESP display. ESP unloading
crashed on the older build; its corrected build passed the user retest, including
cleanup. See [ESP lifecycle](../esp-lifecycle/DEBUG.md).

## Subsequent user results

The user reports speedhack, local spectator display and local BrawlTV display
work. Pin and spray are not accepted as passed: the user suspects the current
version changed carry counts and slot positions and explicitly requests recording
only, without modifying either implementation. Their layouts remain unresolved.
The FPS discrepancy below is also deferred by explicit user instruction.

The last four single-feature tests are now user-reported passed: gradient,
automatic super, automatic hypercharge and private-room chat. Their saved logs
test-gradient.jsonl, test-auto-super.jsonl, test-auto-hyper.jsonl and test-chat.jsonl
all report cleanup completed=true with no ERROR or error-level entries.
Gradient discovery resolved 45 names and selected FreeOffer. Super and hyper
execution logs contain target resolution/activation attempts; actual success is
supported by the user's outcome report rather than log wording alone. The user
changed the chat preset text to 1234; the run used that text at a 10-second interval.
Preserve this user configuration change.

Tests use runner --options-file (gradient/chatspam/killaura option
objects applied before enabling features) and --gradient-index (zero-based
catalog selection). Presets in tools/test-options isolate automatic super,
automatic hypercharge and slow private-room chat messages.

## Deferred FPS discrepancy details

The game overlay displays around 120 with noticeable variation during a match,
while the phone's developer refresh-rate display reads 90. These indicators
measure different things: the overlay counts hooked frame/update events, whereas
the developer indicator concerns the display refresh rate. Neither observation
alone establishes 120 distinct frames presented on the panel. The discrepancy
is recorded without assigning a root cause. The user explicitly requests no fix
for now; do not change FPS behavior as part of the next tests.

## Evidence to next test path

The saved logs support successful installation/execution and RPC cleanup. The
user's visual/behavior reports supply the feature outcome evidence. Independent
feature tests are complete except explicitly deferred pin/spray and the FPS
discrepancy. Native signed-token equality remains unverified because private
inputs use hash-disabled mode. Combinations and across-match lifecycle still
need a focused private test; do not broaden to public matchmaking.
