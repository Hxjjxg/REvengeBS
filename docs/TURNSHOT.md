# Fire on a turn or slowdown

`turnshot` is an independent, opt-in automatic normal-attack feature using enemy
positions from the existing battle-update scanner. No new native address or
update hook is required. Device behavior is not yet verified.

Velocity windows are at least 80 ms long; two windows are required before a
trigger. Only player enemies are tracked. Previous speed must exceed 200 units/s.
A direction change greater than 30 degrees, or a speed drop of at least 150
units/s and 30%, generates a candidate. A stopped target is aimed at its current
position; a moving target uses its newly measured velocity and weapon projectile
speed to solve an intercept, capped at one second of flight time. Acceleration
and casting delay are not modeled. This predicts continued observed movement,
not an unknown future input.

Both current target and predicted aim must be inside native weapon range and
pass projectile-wall line-of-sight checks. Missing wall data, invalid projectile
speed, immunity and stale data prevent firing. Invisible/disappeared enemies are
removed; a sample gap over 250 ms or jump faster than 2400 units/s discards
velocity history. The nearest eligible event wins. Ammo is checked through the
existing firing helper; cooldown is at least 150 ms and respects the recovered
attack interval. Events are not queued behind cooldown or walls.

Killaura and holdshoot suppress turnshot firing while active. Test this feature
alone, including without the existing aimbot, which can redirect native shots.
Disable, battle transition and unload clear history and cooldown state.

## Private device test

Use a private bot match with moving opponents and a normal projectile hero.
Stationary training dummies cannot demonstrate this trigger.

```powershell
Set-Location G:\Repo\REvengeBS
adb forward tcp:27042 tcp:27042
& G:\frida16\.venv\Scripts\python.exe -u tools/cnv70_runtime.py `
  --duration 120 --debug --feature turnshot --output tmp/test-turnshot.jsonl
```

Release attack. Observe whether an in-range enemy turning or slowing triggers
a shot in its newly observed direction. Walls and out-of-range enemies must
prevent firing. `turnshot fired` logs give the target, trigger reason, velocity
and aim. A successful native call does not establish a hit or improved hit rate.
After Ctrl+C, verify firing stops and the game survives cleanup.

## Validation

39 JavaScript tests and the Python runner cleanup test pass; V70 and V68 bundles
compile. Five new actual-source/motion tests cover repeated frames, reversal,
slowdown, disappearance/staleness/teleports, prediction, cooldown/reset,
range, current/predicted walls, missing map, immunity and competing fire modes.
Device trigger reliability and prediction accuracy remain unverified.
