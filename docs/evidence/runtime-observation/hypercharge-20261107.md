# Private hypercharge observation, 2026-11-07

## Evidence E-hyper-01

The user reports completing the requested private hypercharge activation test.
The read-only runtime and signing observer started successfully on PID 24252;
the profile reports no gameplay features validated. No feature flags were passed.

- Artifact: `tmp/cnv70-hypercharge.jsonl` (local repository artifact).
- SHA-256: `4212068092D9E552FDB8052DA6C92FCDA07BCD5D2DE1E688B1FD0352427B4579`.
- 108 events; 34 scanner samples; 2,292 battle-update calls.
- 67 natural input callbacks: type 2 ×58, type 17 ×1, type 5 ×1,
  type 1 ×1, type 0 ×5, type 4 ×1.
- Input #22: commandType 17, sequence 0, X/Y 0/0.
- The subsequent type 5, type 1 and five type 0 events are consistent with
  super controls and normal shots after activation; counts alone do not prove
  a one-to-one mapping to successful actions.
- All 67 callbacks reported `hash disabled`; no token equality checks occurred.
- No scanner errors or other diagnostic messages were reported.
- Zero sampled retained projectiles in this run; earlier private capture already
  observed retained projectiles. This run does not establish projectile behavior.
- Final events: interrupted, prepared ready=true, cleanup completed=true with
  no failures, stopped.

## Finding and next path

F-hyper-01: The user-reported activation together with E-hyper-01 supports the
recovered natural hypercharge command type 17 (`0x11`) and its zero X/Y payload.
It does not establish that the agent-generated hypercharge command is accepted,
that generated-input features work, or that the recovered signer matches native
signed inputs. No identical hypercharge observation needs to be repeated.

## Reproduction

With Gadget running and the private bot room open, run from the repository root:

```powershell
& G:\frida16\.venv\Scripts\python.exe -u tools/cnv70_runtime.py `
  --duration 300 `
  --signing-bundle tmp/cnv70-diagnostic-signing.js `
  --output tmp/cnv70-hypercharge.jsonl
```

Wait for successful observer startup, enter the private match, charge and
activate hypercharge, then shoot and use super. Ctrl+C once and wait for cleanup.
