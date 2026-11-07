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

## CN V70 diagnostic entry point

`agent/cnv70-diagnostic.js` builds an isolated endpoint monitor that does not initialize the v68 game offsets or gameplay hooks. Build it with:

```
npx frida-compile agent/cnv70-diagnostic.js -o dist/cnv70-diagnostic.js -B iife
```

After loading the script, call `start()` to opt in to checking established TCP connections, `endpoint()` to read the captured endpoint, and `stop()` to stop polling and detach diagnostic hooks. It reports a matching endpoint through the Frida message channel. Endpoint attribution still requires correlation with the game's own connection.

For the agreed private friendly/practice match, `startsigning()` installs a separate read-only check of naturally generated client inputs. Each `SIGNING_CHECK` message reports whether the native V70 token matches the recovered calculation; it does not report the key or create commands. The check stops after 20 inputs, or through `stopsigning()` / `stop()`. It checks the live V70 getter signature before installing its hook. These diagnostics do not enable gameplay features.

Run the signing and hook-lifecycle tests with `node --test tests/cnv70-signing.test.mjs tests/cnv70-diagnostic-lifecycle.test.mjs`. See [the live-code research log](docs/CNV70_RUNTIME.md) for recovered layouts, snapshot reproduction, and remaining runtime validation.

## License

See `LICENSE`. No resell, no rehost, no commercial use.
