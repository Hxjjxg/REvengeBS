# REvengeBS

Frida agent for **Brawl Stars v68.250** (official, arm64). Not BSD.

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

Call `start()` after loading. `runtimeprofile()` reports mapped features available for testing and their validation status. All features start disabled. `observescanner(true)` enables read-only scanner observation; `scannerstatus()` returns tick/sample status. Unmapped features reject enable requests. The shared scanner, movement sender, pin/spray helpers, camera, and autododge have V70 mappings; private-match behavior remains unverified. Do not use the V68 build with the CN client.

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

For the agreed private friendly/practice match, `startsigning()` installs a separate read-only check of naturally generated client inputs. Each `SIGNING_CHECK` message reports whether the native V70 token matches the recovered calculation; it does not report the key or create commands. The check stops after 20 inputs, or through `stopsigning()` / `stop()`. It checks the live V70 getter signature before installing its hook. These diagnostics do not enable gameplay features.

Run the runtime, signing and hook-lifecycle tests with `node --test tests/cnv70-runtime.test.mjs tests/cnv70-signing.test.mjs tests/cnv70-diagnostic-lifecycle.test.mjs`. See [the live-code research log](docs/CNV70_RUNTIME.md) for recovered layouts, snapshot reproduction, and remaining runtime validation.

## License

See `LICENSE`. No resell, no rehost, no commercial use.
