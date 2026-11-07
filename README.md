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

After loading the script, call `start()` to opt in to checking established TCP connections, `endpoint()` to read the captured endpoint, and `stop()` to stop polling. It reports a matching endpoint through the Frida message channel. This entry point does not port or validate gameplay features.

## License

See `LICENSE`. No resell, no rehost, no commercial use.
