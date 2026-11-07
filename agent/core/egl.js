var _swapListeners = [];
var _swapHooked = false;
var _swapInterval = null;
var _swapHandle = null;

function _eglFromMaps()
{
    try
    {
        const text = File.readAllText("/proc/self/maps");
        for (const line of text.split("\n"))
        {
            if (!/\/libEGL\.so(?:\.\d+)?$/i.test(line)) continue;
            const start = line.split("-")[0];
            const mod = Process.findModuleByAddress(ptr("0x" + start));
            if (mod) return mod;
        }
    }
    catch (_)
    {}
    return null;
}

export function findEglExport(name)
{
    const modules = [];
    for (const so of ["libEGL.so", "libEGL.so.1"])
    {
        try
        {
            const mod = Process.findModuleByName(so);
            if (mod) modules.push(mod);
        }
        catch (_)
        {}
    }
    try
    {
        for (const mod of Process.enumerateModules())
        {
            if (/libEGL(?:\.so(?:\.\d+)?)?$/i.test(mod.name)) modules.push(mod);
        }
    }
    catch (_)
    {}
    const mapped = _eglFromMaps();
    if (mapped) modules.push(mapped);
    for (const mod of modules)
    {
        try
        {
            const address = mod.findExportByName(name);
            if (address) return address;
        }
        catch (_)
        {}
    }
    try
    {
        const address = Module.findExportByName(null, name);
        if (address) return address;
    }
    catch (_)
    {}
    return null;
}

export function findSwapBuffers()
{
    return findEglExport("eglSwapBuffers");
}

function _dispatchSwap(dpy, surface)
{
    for (let i = 0; i < _swapListeners.length; i++)
    {
        try
        {
            _swapListeners[i](dpy, surface);
        }
        catch (_)
        {}
    }
}

export function setSwapInterval(dpy, interval)
{
    if (!dpy || dpy.isNull()) return false;
    if (!_swapInterval)
    {
        const address = findEglExport("eglSwapInterval");
        if (!address) return false;
        _swapInterval = new NativeFunction(address, "int", ["pointer", "int"]);
    }
    try
    {
        _swapInterval(dpy, interval | 0);
        return true;
    }
    catch (_)
    {
        return false;
    }
}

export function attachSwapBuffers(eglReal, onSwap)
{
    try
    {
        _swapHandle = Interceptor.attach(eglReal,
        {
            onEnter(args)
            {
                onSwap(args[0], args[1]);
            }
        });
        return true;
    }
    catch (_)
    {
        return false;
    }
}

export function hookSwapBuffers(onSwap)
{
    if (typeof onSwap === "function" && !_swapListeners.includes(onSwap)) _swapListeners.push(onSwap);
    if (_swapHooked) return true;
    const swapBuffers = findSwapBuffers();
    if (!swapBuffers) return false;
    _swapHooked = attachSwapBuffers(swapBuffers, _dispatchSwap);
    return _swapHooked;
}

export function disposeSwapBuffers()
{
    _swapListeners.length = 0;
    if (_swapHandle !== null)
    {
        _swapHandle.detach();
        _swapHandle = null;
    }
    _swapHooked = false;
}
