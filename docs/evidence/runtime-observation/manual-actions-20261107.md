# User-operated private match, 2026-11-07

## Scope and outcome

The user operated the connected device in the agreed private friendly match,
moving, firing, using super and gadget. The user explicitly did not use
hypercharge. The runner observed with all gameplay features disabled. This
capture establishes natural input and projectile observation; it does not
validate any feature's generated commands or native signing equality.

## Evidence E-manual-01

- Source: `G:\Brawlstars-CN-V70\Text.txt`, user-pasted PowerShell transcript.
- SHA-256: `F5B565F141A9AFE5F5345164C2B6F47118C77CD269B603A0F8F1FE7D39BA68FB`.
- Original JSONL: `tmp/cnv70-manual-actions.jsonl` (local artifact).
- Runtime PID: 24252; profile: cnv70; signing observer startup: true.
- 132 scanner samples; maximum battle-update count: 9,375.
- 52 distinct positions among samples with a nonzero lastUpdate.
- Own character: SHELLY; team: 1; observed speed values: 480, 720, 800.
- 48 samples had tracked projectiles; maximum retained projectile count: 29.
- No reported scanner errors or ERROR messages.

The status reports a retained projectile-map count, not a count of newly fired
shots. It does not expose individual projectile coordinates in this transcript.
The scanner also filters manager capture to opponents. Consequently these counts
must not be equated with the user's own shot count or a validated own-shot path.

## Evidence E-manual-02: native input callbacks

273 natural insertion callbacks were captured. All reported `hash disabled`,
distinct from `no battle`. Command counts were:

| Command type | Count | Interpretation |
|---|---:|---|
| 0 | 16 | Normal-attack candidate, consistent with user actions |
| 1 | 3 | Super candidate, consistent with user actions |
| 2 | 233 | Movement candidate; varying X/Y |
| 5 | 3 | Companion control input; meaning not established here |
| 23 | 6 | Gadget/bonus-skill candidate, consistent with the recovered kind table |
| 24 | 6 | Companion control input; meaning not established here |
| 25 | 6 | Companion control input; meaning not established here |

Examples: type 0 at hit 8 had X/Y 2506/4319; type 1 at hit 108 had
2095/948; type 23 at hit 92 had 2573/4712. All reported sequence values
were zero at insertion entry; this capture does not establish later sequence
assignment semantics. Do not infer action counts from callback counts alone.
Type 17 (the port's hypercharge candidate) was absent, consistent with the user's
statement that hypercharge was not used. No signed-token comparison was possible.

## Evidence E-manual-03: interruption and cleanup

The transcript ends with `interrupted`, `prepared.ready=true`,
`cleanup.completed=true`, an empty failures array, and `stopped`. Ctrl+C therefore
completed the runner's cleanup. The 300-second deadline starts when the runner
starts, not when the match starts, and does not automatically end at match end.
Repeated final scanner state after the last tick is cached data, not new gameplay.

## Findings and next path

F-manual-01: E-manual-01 and E-manual-02 validate that the revised read-only
observer receives gameplay state, retained projectiles and natural command
fields. Another identical movement/shoot/super/gadget capture is unnecessary.

F-manual-02: E-manual-03 validates successful interruption cleanup. No runner
failure is indicated by continuing until the deadline after a match ends.

Next path: inspect the captured command categories and native handling before
any requested feature tests. A later targeted private hypercharge test would
cover the missing action. Gameplay feature behavior and token equality remain
unverified; private hash-disabled inputs cannot establish signing equivalence.

## Reproduction

With the device connected, Gadget running, bundles built, and the private bot
room open, run from the repository root:

```powershell
adb forward tcp:27042 tcp:27042
& G:\frida16\.venv\Scripts\python.exe -u tools/cnv70_runtime.py `
  --duration 300 `
  --signing-bundle tmp/cnv70-diagnostic-signing.js `
  --output tmp/cnv70-manual-actions.jsonl
```

Wait for successful observer startup, enter the private match, then move and use
normal attack, super and gadget. Ctrl+C once after the match and wait for cleanup.
