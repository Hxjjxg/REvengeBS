# Private-match observation, 2026-11-07

## Observations

PID 18930 accepted Frida runtime and diagnostic attachment. A 180-second capture
recorded 178 scanner samples and 10,283 update calls. Own Shelly coordinates and
speed changed during user play. Twenty natural input callbacks all reported
`hash disabled or no battle`; the old diagnostic omitted command fields in that
branch. Subsequent idle rounds produced no input callbacks. No token equality or
individual attack type has been verified. All sessions reported complete cleanup.

## Hypotheses and experiments

1. Projectile observation is feature-gated. Source inspection confirms the scanner
   clears its projectile map every tick unless `state.autododge` is true. This
   explains zero output with features disabled; it does not prove native projectile
   hooks work. Add an independent read-only observation flag and test its gating.
2. The command hook address is wrong. Twenty callbacks in the first user-played
   capture conflict with this; record command fields on the next active capture.
3. Signing is disabled in private mode or its battle field is incorrect. Both
   remain possible: the old combined skip message does not distinguish them.
   Split the reported reasons and retain command fields regardless of signing.
4. The input callback limit expires during movement. The first user capture hit
   all 20 callbacks quickly. Use an explicit bounded larger limit for a full round.

## Conclusions

Projectile zero counts from these observation-only runs are inconclusive because
of the proven feature gate. The old logs cannot identify shot, super, gadget or
hyper commands retroactively. Screenshots captured active gameplay; Android's
`screenrecord` executable was unavailable, so no gameplay video was captured.
