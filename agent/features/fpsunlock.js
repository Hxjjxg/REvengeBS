import
{
    findSwapBuffers,
    setSwapInterval
}
from "../core/egl.js";
import
{
    offsets
}
from "../core/offsets.js";
import
{
    state
}
from "../utils/flags.js";
import
{
    logEvery,
    logInfo
}
from "../utils/logger.js";

const UNLOCKED_FPS = 9999;
const DEFAULT_FPS = 60;
const KEEP_MS = 250;

var _base = null;
var _attached = false;
var _mgr = null;
var _keep = null;
var _swaps = 0;
var _hzAt = 0;
var _swapHz = 0;
var _interval = -1;
var _wasOn = false;
var _saved = null;
var _hooks = [];
var _swapHook = null;
var _disposing = false;

function _targetReady()
{
    if (!_base) return false;
    if (offsets.Runtime_profile !== "cnv70") return true;
    const guard = offsets.FramerateManager_initialized;
    if (typeof guard !== "number") return false;
    try
    {
        return (_base.add(guard).readU8() & 1) !== 0;
    }
    catch (_)
    {
        return false;
    }
}

function _readTarget()
{
    if (!_targetReady()) return null;
    try
    {
        return _base.add(offsets.FramerateManager_targetFps).readDouble();
    }
    catch (_)
    {
        return null;
    }
}

function _writeTarget(fps)
{
    if (!_targetReady()) return;
    try
    {
        _base.add(offsets.FramerateManager_targetFps).writeDouble(fps);
    }
    catch (_)
    {}
}

function _writeMgr(mgr, fps)
{
    if (!_targetReady() || !mgr || mgr.isNull()) return;
    try
    {
        const capOffset = typeof offsets.FramerateManager_capOffset === "number" ?
            offsets.FramerateManager_capOffset :
            offsets.Runtime_profile === "cnv70" ? null : 328;
        if (capOffset === null) return;
        mgr.writeDouble(fps);
        mgr.add(capOffset).writeDouble(fps);
    }
    catch (_)
    {}
}

function _apply(fps)
{
    if (!_targetReady()) return;
    const mgr = _mgr || (offsets.Runtime_profile === "cnv70" ?
        _base.add(offsets.FramerateManager_targetFps) : null);
    if (offsets.Runtime_profile === "cnv70" && fps === UNLOCKED_FPS && !_saved)
    {
        try
        {
            const target = _readTarget();
            const cap = mgr.add(offsets.FramerateManager_capOffset).readDouble();
            if (!(target > 0) || !isFinite(target) || !(cap > 0) || !isFinite(cap)) return;
            _saved = { target, cap, mgr };
        }
        catch (_)
        {
            return;
        }
    }
    if (fps === UNLOCKED_FPS) _wasOn = true;
    _writeTarget(fps);
    _writeMgr(mgr, fps);
}

function _restore()
{
    if (offsets.Runtime_profile !== "cnv70")
    {
        _apply(DEFAULT_FPS);
        return;
    }
    if (!_saved || !_targetReady()) return;
    try
    {
        _writeTarget(_saved.target);
        _saved.mgr.writeDouble(_saved.target);
        _saved.mgr.add(offsets.FramerateManager_capOffset).writeDouble(_saved.cap);
        _saved = null;
    }
    catch (_)
    {}
}

function _stopSwapHook()
{
    // Restore on the thread with the EGL context, then remove the hook.
    if (!_swapHook || _interval === 0) return;
    _swapHook.detach();
    _swapHook = null;
    _interval = -1;
}

function _ensureSwapHook()
{
    if (_swapHook || _disposing || !state.fpsunlock) return;
    if (offsets.Runtime_profile === "cnv70")
    {
        _apply(UNLOCKED_FPS);
        if (!_saved) return;
    }
    const swap = findSwapBuffers();
    if (!swap) return;
    _swapHook = Interceptor.attach(swap,
    {
        onEnter(args)
        {
            if (_disposing || !state.fpsunlock)
            {
                if (_interval === 0) setSwapInterval(args[0], 1);
                _interval = -1;
                _stopSwapHook();
                return;
            }
            _swaps++;
            _apply(UNLOCKED_FPS);
            if (_interval !== 0)
            {
                _interval = 0;
                setSwapInterval(args[0], 0);
            }
        }
    });
}

function _sync()
{
    const enabled = !!state.fpsunlock;
    if (enabled)
    {
        _wasOn = true;
        _ensureSwapHook();
    }
    else if (_wasOn || _saved)
    {
        _wasOn = false;
        _restore();
        _stopSwapHook();
        return;
    }
    else return;
    if (_readTarget() !== UNLOCKED_FPS) _apply(UNLOCKED_FPS);
}

function _startKeep()
{
    if (_keep) return;
    _keep = setInterval(function()
    {
        _sync();
        const now = Date.now();
        if (!_hzAt) _hzAt = now;
        if (now - _hzAt >= 1000)
        {
            _swapHz = _swaps;
            _swaps = 0;
            _hzAt = now;
        }
        logEvery(60, "fpsunlock sample",
        {
            enabled: !!state.fpsunlock,
            swapHz: _swapHz,
            target: _readTarget(),
            mgr: _mgr ? 1 : 0
        });
    }, KEEP_MS);
}

export function setupFpsUnlock(base)
{
    if (_attached)
    {
        if (state.fpsunlock)
        {
            _ensureSwapHook();
            _apply(UNLOCKED_FPS);
        }
        else
        {
            _restore();
            _stopSwapHook();
        }
        logInfo("fpsunlock apply",
        {
            enabled: !!state.fpsunlock,
            target: _readTarget()
        });
        return;
    }
    _base = base;
    _disposing = false;
    _hooks.push(Interceptor.attach(base.add(offsets.FramerateManager__setSegment),
    {
        onEnter(args)
        {
            _mgr = args[0];
            if (state.fpsunlock)
            {
                if (offsets.Runtime_profile === "cnv70")
                {
                    _apply(UNLOCKED_FPS);
                    if (!_saved) return;
                }
                args[1] = ptr(2);
            }
        },
        onLeave()
        {
            if (state.fpsunlock) _apply(UNLOCKED_FPS);
        }
    }));
    _hooks.push(Interceptor.attach(base.add(offsets.FramerateManager__setLimit),
    {
        onEnter(args)
        {
            _mgr = args[0];
            if (state.fpsunlock) _apply(UNLOCKED_FPS);
        },
        onLeave()
        {
            // V70 hooks the cap setter, whose original body writes after onEnter.
            if (offsets.Runtime_profile === "cnv70" && state.fpsunlock) _apply(UNLOCKED_FPS);
        }
    }));
    _ensureSwapHook();
    _startKeep();
    _attached = true;
    if (state.fpsunlock) _apply(UNLOCKED_FPS);
    logInfo("fpsunlock attached",
    {
        enabled: !!state.fpsunlock,
        swap: _swapHook ? 1 : 0,
        target: _readTarget()
    });
}

export function resetFpsUnlock()
{
    _wasOn = false;
    _restore();
    _stopSwapHook();
    logInfo("fpsunlock reset",
    {
        target: _readTarget()
    });
}

export function disposeFpsUnlock()
{
    _disposing = true;
    if (_keep)
    {
        clearInterval(_keep);
        _keep = null;
    }
    for (const hook of _hooks) hook.detach();
    _hooks.length = 0;
    _restore();
    _stopSwapHook();
    _attached = false;
    _wasOn = false;
    // If true, let one render-thread swap restore the interval before unloading.
    return { pendingSwapRestore: !!_swapHook, pendingTargetRestore: !!_saved };
}
