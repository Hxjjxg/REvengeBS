import
{
    initCSV
}
from "./core/csv.js";
import
{
    initDataTables
}
from "./core/dataTables.js";
import
{
    initFunctions
}
from "./core/functions.js";
import
{
    libg
}
from "./core/libs.js";
import
{
    offsets,
    selectOffsetProfile,
    lockOffsetProfile
}
from "./core/offsets.js";
import
{
    initScanner,
    resetScannerCache,
    updateScanner,
    scanData
}
from "./core/scanner.js";
import
{
    resetAimbot,
    setAimbotOptions,
    setupAimbot,
    updateAimbot
}
from "./features/aimbot.js";
import
{
    resetAutododge,
    setAutododgeOptions,
    setupAutododge,
    updateAutododge
}
from "./features/autododge.js";
import
{
    resetSpinner,
    setSpinnerOptions,
    setupSpinner
}
from "./features/spinner.js";
import
{
    ensureCameraMode,
    resetCamera,
    setCameraOptions,
    setupCamera
}
from "./features/camera.js";
import
{
    resetChatSpam,
    setChatSpamOptions,
    setupChatSpam,
    startChatSpam,
    stopChatSpam
}
from "./features/chatspam.js";
import
{
    enableESP,
    resetESP,
    setESPOptions,
    setupESP,
    updateESP
}
from "./features/esp.js";
import
{
    resetFps,
    setFpsOptions,
    setupFps
}
from "./features/fps.js";
import
{
    resetFpsUnlock,
    disposeFpsUnlock,
    setupFpsUnlock
}
from "./features/fpsunlock.js";
import
{
    resetCombat,
    setupCombat
}
from "./helpers/combat.js";
import
{
    resetHoldShoot,
    setHoldShootOptions,
    updateHoldShoot
}
from "./features/holdshoot.js";
import
{
    getServerIP,
    resetIPGrabber,
    setupIPGrabber
}
from "./features/ipgrabber.js";
import
{
    resetKillaura,
    setKillauraOptions,
    updateKillaura
}
from "./features/killaura.js";
import
{
    applyGradientAll,
    listGradients,
    resetGradient,
    setGradientOptions,
    setupGradient
}
from "./features/gradient.js";
import
{
    resetPin,
    setPinOptions,
    setupPin,
    updatePin
}
from "./features/pin.js";
import
{
    resetSpectator,
    setBrawlTvOptions,
    setSpecOptions,
    setupSpectator
}
from "./features/spectator.js";
import
{
    resetSpray,
    setSprayOptions,
    setupSpray,
    updateSpray
}
from "./features/spray.js";
import
{
    resetSpeedhack,
    setupSpeedhack,
    updateSpeedhack
}
from "./features/speedhack.js";
import
{
    FLAG_AIMBOT,
    FLAG_AUTODODGE,
    FLAG_ESP,
    FLAG_HOLDSHOOT,
    FLAG_KILLAURA,
    FLAG_PIN,
    FLAG_SPINNER,
    FLAG_SPRAY,
    FLAG_SPEEDHACK,
    getFlags,
    setState,
    setupSafe,
    state
}
from "./utils/flags.js";
import
{
    logInfo,
    resetLogCounters,
    setLoggingEnabled
}
from "./utils/logger.js";
import
{
    maybeRefreshWallCache,
    watchTileChanges,
    notifyBattleModeChanged
}
from "./utils/wallCache.js";

var _ACTIVE_MASK = FLAG_AIMBOT | FLAG_AUTODODGE | FLAG_ESP | FLAG_SPINNER | FLAG_KILLAURA | FLAG_SPRAY | FLAG_PIN | FLAG_HOLDSHOOT | FLAG_SPEEDHACK;
var _AIM_OR_KILL = FLAG_AIMBOT | FLAG_KILLAURA;
var _setupBase = null;
var _setupReady = false;
var _setupDone = {};
var _observeScanner = false;
var _battleTickCount = 0;
// Intermediate port availability; these require real private-match validation.
const _cnv70Features = new Set([
    "pin", "spray", "spinner", "camera", "autododge", "esp", "aimbot", "holdshoot", "killaura",
    "speedhack", "fps", "fpsunlock", "gradient", "brawltv", "spec", "chatspam"
]);
var _modules = {
    camera:
    {
        setup: setupCamera
    },
    gradient:
    {
        setup: setupGradient
    },
    autododge:
    {
        setup: setupAutododge
    },
    spinner:
    {
        setup: setupSpinner
    },
    aimbot:
    {
        setup: setupAimbot
    },
    combat:
    {
        setup: setupCombat,
        needs: "camera"
    },
    esp:
    {
        setup: setupESP,
        needs: "camera"
    },
    spectator:
    {
        setup: setupSpectator
    },
    chatspam:
    {
        setup: setupChatSpam
    },
    pin:
    {
        setup: setupPin
    },
    spray:
    {
        setup: setupSpray
    },
    speedhack:
    {
        setup: setupSpeedhack
    },
    fps:
    {
        setup: setupFps
    },
    fpsunlock:
    {
        setup: setupFpsUnlock
    },
    ipgrabber:
    {
        setup: setupIPGrabber
    }
};
var _moduleByFeature = {
    camera: "camera",
    gradient: "gradient",
    autododge: "autododge",
    spinner: "spinner",
    aimbot: "aimbot",
    killaura: "combat",
    holdshoot: "combat",
    esp: "esp",
    brawltv: "spectator",
    spec: "spectator",
    chatspam: "chatspam",
    pin: "pin",
    spray: "spray",
    speedhack: "speedhack",
    fps: "fps",
    fpsunlock: "fpsunlock",
    ipgrabber: "ipgrabber"
};

function setupModule(name)
{
    const module = _modules[name];
    if (!module || !_setupReady || _setupDone[name]) return;
    if (module.needs) setupModule(module.needs);
    if (setupSafe(name, () => module.setup(_setupBase))) _setupDone[name] = true;
}

function applyOptions(feature, setter, opts)
{
    setter(opts);
    logInfo(feature + " options", opts);
}

function setupFeature(feature)
{
    if (offsets.Runtime_profile === "cnv70" && !_cnv70Features.has(feature) && feature !== "ipgrabber")
        throw new Error("CN V70 mapping incomplete for feature: " + feature);
    setupModule(_moduleByFeature[feature]);
}

function setupEnabledFeatures()
{
    for (const feature of Object.keys(_moduleByFeature))
    {
        if (state[feature]) setupFeature(feature);
    }
}

function startAgent()
{
    return libg().then((base) =>
    {
        if (offsets.Runtime_profile === "cnv70")
        {
            if (Process.arch !== "arm64" || Process.pointerSize !== 8)
                throw new Error("CN V70 requires arm64");
            const signatures = [
                [offsets.LogicGameObjectClient_getData, [0x00, 0x08, 0x40, 0xf9, 0xc0, 0x03, 0x5f, 0xd6]],
                [offsets.LogicBattleModeClient_getOwnPlayerTeam, [0x00, 0xe4, 0x40, 0xb9, 0xc0, 0x03, 0x5f, 0xd6]]
            ];
            for (const [rva, expected] of signatures)
            {
                const bytes = new Uint8Array(base.add(rva).readByteArray(expected.length));
                if (!expected.every((byte, i) => bytes[i] === byte))
                    throw new Error("CN V70 live signature mismatch at 0x" + rva.toString(16));
            }
        }
        _setupBase = base;
        initFunctions(base);
        if (["CSVRow__getValueAt", "CSVRow__getIntegerValueAt", "CSVRow__getName", "ResourceManager__getCSV"]
            .every(key => typeof offsets[key] === "number")) initCSV(base);
        initDataTables(base);
        initScanner(base);
        watchTileChanges(base);
        _setupReady = true;
        logInfo("agent started",
        {
            base: String(base),
            arch: Process.arch,
            pointerSize: Process.pointerSize,
            profile: offsets.Runtime_profile || "v68"
        });
        setupEnabledFeatures();
        let lastBM = null;
        Interceptor.attach(base.add(offsets.LogicBattleModeClient_update),
        {
            onEnter(args)
            {
                try
                {
                    const bm = args[0];
                    if (!bm || bm.isNull()) return;
                    _battleTickCount++;
                    if (!lastBM || !lastBM.equals(bm))
                    {
                        lastBM = bm;
                        resetAimbot();
                        resetAutododge();
                        resetSpinner();
                        resetESP();
                        resetCamera();
                        resetSpray();
                        resetPin();
                        resetKillaura();
                        resetSpectator();
                        resetFps();
                        resetHoldShoot();
                        resetSpeedhack();
                        resetCombat();
                        resetGradient();
                        resetScannerCache();
                        resetLogCounters();
                        notifyBattleModeChanged(bm);
                        logInfo("battle reset",
                        {
                            bm: String(bm)
                        });
                    }
                    const f = getFlags();
                    const now = Date.now();
                    if ((f & _ACTIVE_MASK) === 0 && !_observeScanner) return;
                    updateScanner(bm, now);
                    if (offsets.Runtime_profile === "cnv70" && scanData.lastUpdate !== now) return;
                    maybeRefreshWallCache(bm, now);
                    if (f & _AIM_OR_KILL) updateAimbot(now);
                    if (f & FLAG_KILLAURA) updateKillaura(now);
                    if (f & FLAG_AUTODODGE) updateAutododge();
                    if (f & FLAG_ESP) updateESP();
                    if (f & FLAG_SPRAY) updateSpray(now);
                    if (f & FLAG_PIN) updatePin(now);
                    if (f & FLAG_HOLDSHOOT) updateHoldShoot(now);
                    if (f & FLAG_SPEEDHACK) updateSpeedhack(now);
                }
                catch (e)
                {
                    try
                    {
                        send(
                        {
                            type: "ERROR",
                            code: 3,
                            text: `battle tick: ${e && e.message ? e.message : e}`
                        });
                    }
                    catch (__)
                    {}
                }
            }
        });
        return true;
    });
}
var _started = false;
var _startPromise = null;
var _onEnable = {
    esp: enableESP,
    chatspam: startChatSpam,
    gradient: applyGradientAll
};
var _onDisable = {
    aimbot: resetAimbot,
    autododge: resetAutododge,
    spinner: resetSpinner,
    esp: resetESP,
    camera: resetCamera,
    killaura: resetKillaura,
    spray: resetSpray,
    pin: resetPin,
    brawltv: resetSpectator,
    spec: resetSpectator,
    chatspam: stopChatSpam,
    holdshoot: resetHoldShoot,
    speedhack: resetSpeedhack,
    fpsunlock: resetFpsUnlock,
    gradient: applyGradientAll
};
rpc.exports = {
    ping()
    {
        return true;
    },
    start(options)
    {
        if (options && options.profile) selectOffsetProfile(options.profile);
        lockOffsetProfile();
        if (offsets.Runtime_profile === "cnv70")
            for (const feature of Object.keys(state))
                if (state[feature] && !_cnv70Features.has(feature))
                    throw new Error("CN V70 mapping incomplete for feature: " + feature);
        if (_started) return true;
        if (_startPromise) return _startPromise;
        _startPromise = startAgent().then(() =>
        {
            _started = true;
            return true;
        }).catch((error) =>
        {
            _startPromise = null;
            try
            {
                send(
                {
                    type: "ERROR",
                    code: 1,
                    text: `agent start: ${error && error.message ? error.message : error}`
                });
            }
            catch (_)
            {}
            throw error;
        });
        return _startPromise;
    },
    togglefeature(feature, value)
    {
        if (!(feature in state)) return;
        const enabled = !!value;
        if (enabled && offsets.Runtime_profile === "cnv70" && !_cnv70Features.has(feature))
            throw new Error("CN V70 mapping incomplete for feature: " + feature);
        setState(feature, enabled);
        logInfo("toggle " + feature + " = " + enabled,
        {
            feature,
            enabled,
            flags: getFlags(),
            module: _moduleByFeature[feature] || null
        });
        if (enabled && feature === "camera") ensureCameraMode();
        if (enabled) setupFeature(feature);
        const hook = enabled ? _onEnable[feature] : _onDisable[feature];
        if (hook) hook();
    },
    prepareUnload()
    {
        for (const feature of Object.keys(state)) setState(feature, false);
        _observeScanner = false;
        resetAimbot();
        resetAutododge();
        resetSpinner();
        resetESP();
        resetCamera();
        resetSpray();
        resetPin();
        resetKillaura();
        resetSpectator();
        resetChatSpam();
        resetFps();
        resetFpsUnlock();
        resetHoldShoot();
        resetSpeedhack();
        resetCombat();
        resetGradient();
        resetIPGrabber();
        const deadline = Date.now() + 2000;
        return new Promise(resolve =>
        {
            const check = () =>
            {
                const pending = disposeFpsUnlock();
                const ready = !pending.pendingSwapRestore && !pending.pendingTargetRestore;
                if (ready || Date.now() >= deadline) resolve({ ready, ...pending });
                else setTimeout(check, 16);
            };
            check();
        });
    },
    getserverip()
    {
        setupFeature("ipgrabber");
        return getServerIP();
    },
    runtimeprofile()
    {
        return { profile: offsets.Runtime_profile || "v68",
            availableForTesting: offsets.Runtime_profile === "cnv70" ? Array.from(_cnv70Features) : Object.keys(_moduleByFeature),
            gameplayValidated: offsets.Runtime_profile === "cnv70" ? [] : null };
    },
    scannerstatus()
    {
        return { ticks: _battleTickCount, observing: _observeScanner,
            lastUpdate: scanData.lastUpdate, lastError: scanData.lastError, x: scanData.myX, y: scanData.myY,
            team: scanData.myTeamId, playerIndex: scanData.myPlayerIndex,
            speed: scanData.mySpeed, brawler: scanData.myBrawlerName,
            enemies: scanData.enemies.length, projectiles: scanData.liveProjectiles };
    },
    observescanner(value)
    {
        _observeScanner = !!value;
        return _observeScanner;
    },
    setautododgeopts(opts)
    {
        applyOptions("autododge", setAutododgeOptions, opts);
    },
    setespopts(opts)
    {
        applyOptions("esp", setESPOptions, opts);
    },
    setaimbotopts(opts)
    {
        applyOptions("aimbot", setAimbotOptions, opts);
    },
    setkillauraopts(opts)
    {
        applyOptions("killaura", setKillauraOptions, opts);
    },
    setcameraopts(opts)
    {
        applyOptions("camera", setCameraOptions, opts);
    },
    setsprayopts(opts)
    {
        applyOptions("spray", setSprayOptions, opts);
    },
    setpinopts(opts)
    {
        applyOptions("pin", setPinOptions, opts);
    },
    setspinneropts(opts)
    {
        applyOptions("spinner", setSpinnerOptions, opts);
    },
    setbrawltvopts(opts)
    {
        applyOptions("brawltv", setBrawlTvOptions, opts);
    },
    setspecopts(opts)
    {
        applyOptions("spec", setSpecOptions, opts);
    },
    setchatspamopts(opts)
    {
        applyOptions("chatspam", setChatSpamOptions, opts);
    },
    setholdshootopts(opts)
    {
        applyOptions("holdshoot", setHoldShootOptions, opts);
    },
    setfpsopts(opts)
    {
        applyOptions("fps", setFpsOptions, opts);
    },
    setgradientopts(opts)
    {
        applyOptions("gradient", setGradientOptions, opts);
    },
    listgradients()
    {
        setupFeature("gradient");
        return listGradients();
    },
    setdebug(value)
    {
        setLoggingEnabled(value);
    }
};
