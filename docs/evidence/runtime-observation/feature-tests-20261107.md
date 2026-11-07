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

## Deferred FPS discrepancy

The game overlay displays around 120 with noticeable variation during a match,
while the phone's developer refresh-rate display reads 90. These indicators
measure different things: the overlay counts hooked frame/update events, whereas
the developer indicator concerns the display refresh rate. Neither observation
alone establishes 120 distinct frames presented on the panel. The discrepancy
is recorded without assigning a root cause. The user explicitly requests no fix
for now; do not change FPS behavior as part of the next tests.

## Evidence to next test path

The saved logs support successful installation/execution and RPC cleanup. The
user's visual/behavior reports supply the feature outcome evidence. Native token
equality, non-default automatic super/hyper options and untested combinations
remain unverified. Next independent tests: speedhack, pin, spray, local spectator
and local BrawlTV display. Gradient selection needs an explicit catalog choice;
enabling its default empty selection is not a useful visual test.
