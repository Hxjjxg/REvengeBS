import
{
    getServerIP,
    resetIPGrabber,
    setupIPGrabber
}
from "./features/ipgrabber.js";
import { libg } from "./core/libs.js";
import { computeCNV70Token } from "./core/cnv70-signing.js";
import { CNV70 } from "./core/cnv70-layout.js";

let signingListener = null;
let signingStart = null;
let signingGeneration = 0;

function stopSigning()
{
    signingGeneration++;
    signingStart = null;
    if (signingListener !== null)
    {
        signingListener.detach();
        signingListener = null;
    }
}

async function installSigning(generation, limit)
{
    if (signingListener !== null) return true;
    if (Process.arch !== "arm64" || Process.pointerSize !== 8)
        throw new Error("The CN V70 signing probe requires arm64");
    const base = await libg();
    if (generation !== signingGeneration) return false;
    if (signingListener !== null) return true;
    const expected = [0x00, 0x08, 0x40, 0xf9, 0xc0, 0x03, 0x5f, 0xd6];
    const actual = new Uint8Array(base.add(CNV70.functions.LogicGameObjectClient_getData).readByteArray(expected.length));
    if (!expected.every((value, i) => actual[i] === value))
        throw new Error("CN V70 live client getter signature mismatch");
    const getBattle = new NativeFunction(base.add(CNV70.functions.BattleMode_getInstance), "pointer", []);
    let hits = 0;
    const listener = Interceptor.attach(base.add(CNV70.functions.ClientInputManager_addInput), {
        onEnter(args)
        {
            if (++hits > limit) return;
            try
            {
                const command = args[1];
                const commandType = command.add(CNV70.fields.ClientInput_type).readU32();
                const sequence = command.add(CNV70.fields.ClientInput_sequence).readU32();
                const x = command.add(CNV70.fields.ClientInput_x).readS32();
                const y = command.add(CNV70.fields.ClientInput_y).readS32();
                const battle = getBattle();
                if (battle.isNull() || battle.add(CNV70.fields.BattleMode_hashEnabled).readU8() === 0)
                {
                    send({ type: "SIGNING_CHECK", hit: hits, commandType, sequence, x, y,
                        skipped: battle.isNull() ? "no battle" : "hash disabled" });
                }
                else
                {
                    const key = new Uint8Array(battle.add(CNV70.fields.BattleMode_hashKey).readByteArray(16));
                    const data = new Uint8Array(command.add(4).readByteArray(16));
                    const expectedToken = computeCNV70Token(key, data);
                    send({ type: "SIGNING_CHECK", hit: hits, commandType, sequence, x, y,
                        matches: expectedToken === command.add(CNV70.fields.ClientInput_token).readU32() });
                }
            }
            catch (error)
            {
                send({ type: "SIGNING_CHECK", hit: hits, error: String(error) });
            }
            if (hits === limit && signingListener === listener) stopSigning();
        }
    });
    signingListener = listener;
    return true;
}

function startSigning(limit = 20)
{
    if (!Number.isInteger(limit) || limit < 1 || limit > 4096)
        throw new Error("Input observation limit must be an integer from 1 to 4096");
    if (signingListener !== null) return Promise.resolve(true);
    if (signingStart !== null) return signingStart;
    const pending = installSigning(signingGeneration, limit).finally(() =>
    {
        if (signingStart === pending) signingStart = null;
    });
    signingStart = pending;
    return pending;
}

rpc.exports = {
    start()
    {
        setupIPGrabber();
        return true;
    },
    stop()
    {
        resetIPGrabber();
        stopSigning();
        return true;
    },
    startsigning: startSigning,
    stopsigning()
    {
        stopSigning();
        return true;
    },
    endpoint()
    {
        return getServerIP();
    }
};
