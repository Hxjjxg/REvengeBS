import
{
    getServerIP,
    resetIPGrabber,
    setupIPGrabber
}
from "./features/ipgrabber.js";

rpc.exports = {
    start()
    {
        setupIPGrabber();
        return true;
    },
    stop()
    {
        resetIPGrabber();
        return true;
    },
    endpoint()
    {
        return getServerIP();
    }
};
