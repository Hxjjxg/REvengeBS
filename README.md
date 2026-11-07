# REvengeBS

Frida agent for **Brawl Stars v68.250** (official, arm64). Not BSD.

An explicit CN V70 port is included; gameplay validation is still pending.

The optional [turnshot feature](docs/TURNSHOT.md) fires a predicted normal attack
when an unobstructed in-range enemy turns or slows. It is awaiting device testing.

<p align="center">
  <a href="https://discord.gg/ZksZaUeDbW"><img src="https://img.shields.io/badge/Discord-join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

## Test / download

Join the Discord or you get nothing: **https://discord.gg/ZksZaUeDbW**

The app is here. This repo is the agent source only.

## Build

```
npm install frida-compile
npx frida-compile agent/index.js -o dist/agent.js -B iife
```

Offsets in `agent/core/offsets.js` are RVAs for that exact `libg.so`. Other versions won't work.

## CN V70 runtime (partial port)

Build the explicit V70 entry point separately from the V68 default:

```
npx frida-compile agent/cnv70.js -o tmp/cnv70-agent.js -B iife
```

Call `start()` after loading. `runtimeprofile()` reports mapped features available for testing and their validation status. All features start disabled. `observescanner(true)` enables read-only scanner observation; `scannerstatus()` returns tick/sample/error status. All 16 source feature paths have V70 integrations, including their scanner, command, UI and frame-rate dependencies; private-match behavior remains unverified. Do not use the V68 build with the CN client.

For the agreed private friendly/practice test, the single-connection runner can load both runtime and signing observation:

```
G:\frida16\.venv\Scripts\python.exe tools/cnv70_runtime.py --duration 120 --signing-bundle tmp/cnv70-diagnostic-signing.js --output tmp/cnv70-private-match.jsonl
```

The signing bundle must be built first using the diagnostic command below, with its output path set to `tmp/cnv70-diagnostic-signing.js`. The runner bounds attach/observation/cleanup and enables no gameplay features by default. See [port status and evidence](docs/CNV70_PORT.md) for remaining work and the successful on-device startup smoke test.

## CN V70 diagnostic entry point

`agent/cnv70-diagnostic.js` builds an isolated endpoint monitor that does not initialize the v68 game offsets or gameplay hooks. Build it with:

```
npx frida-compile agent/cnv70-diagnostic.js -o dist/cnv70-diagnostic.js -B iife
```

After loading the script, call `start()` to opt in to checking established TCP connections, `endpoint()` to read the captured endpoint, and `stop()` to stop polling and detach diagnostic hooks. It reports a matching endpoint through the Frida message channel. Endpoint attribution still requires correlation with the game's own connection.

For the agreed private friendly/practice match, `startsigning(limit = 20)` installs a read-only check of naturally generated inputs. `SIGNING_CHECK` reports type, sequence and X/Y; when signing is enabled it also reports whether the native token matches the recovered calculation. Otherwise it reports `hash disabled` or `no battle`. It does not report keys or create commands. The limit is 1–4096 inputs; the runtime runner requests 4096 for a full round. Stop with `stopsigning()` / `stop()`. The hook checks the live V70 getter signature before installing. `observescanner(true)` includes projectile observation with gameplay features disabled.

Run the 29 runtime, signing, camera, hook-lifecycle, movement and frame-rate tests with `node --test tests/cnv70-runtime.test.mjs tests/cnv70-signing.test.mjs tests/cnv70-diagnostic-lifecycle.test.mjs tests/cnv70-speedhack.test.mjs tests/cnv70-fpsunlock.test.mjs tests/cnv70-camera-lifecycle.test.mjs`. See [the live-code research log](docs/CNV70_RUNTIME.md) for recovered layouts, snapshot reproduction, and remaining runtime validation.

## License

See `LICENSE`. No resell, no rehost, no commercial use.
