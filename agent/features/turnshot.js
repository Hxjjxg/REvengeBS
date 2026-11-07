import { createMotionTrigger, predictMotionShot } from "../helpers/motion_trigger.js";
import { scanData } from "../core/scanner.js";
import { state } from "../utils/flags.js";
import { getFunctions } from "../core/functions.js";
import { getBattleScreen, getBattleScreenTs } from "./camera.js";
import { attackIntervalMs, weaponRange, skillDataAt, skillProjectileSpeed, fireAt } from "../helpers/combat.js";
import { losCheck, BLOCKS_PROJECTILES, getWallCacheW, getWallCacheH } from "../utils/wallCache.js";
import { logInfo, logError } from "../utils/logger.js";

const motion = createMotionTrigger();
let lastFire = -Infinity;
export function resetTurnshot() { motion.reset(); lastFire = -Infinity; }

export function updateTurnshot(now)
{
    if (!state.turnshot) return;
    if (!scanData.lastUpdate || now - scanData.lastUpdate > 200)
    {
        resetTurnshot();
        return;
    }
    try
    {
        const events = motion.update(scanData.enemies, now);
        // Other automatic firing modes own the weapon while active.
        if (state.killaura || state.holdshoot || now - lastFire < Math.max(150, attackIntervalMs())) return;
        const screen = getBattleScreen(), own = scanData.ownCharacter;
        if (!screen || screen.isNull() || !own || own.isNull() || now - getBattleScreenTs() > 200 || scanData.hasCarryable) return;
        if (getWallCacheW() <= 0 || getWallCacheH() <= 0) return;
        const range = weaponRange();
        const speed = skillProjectileSpeed(skillDataAt(own, 0));
        const x = scanData.myX, y = scanData.myY;
        events.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
        for (const enemy of events)
        {
            if (Math.hypot(enemy.x - x, enemy.y - y) > range) continue;
            const immune = getFunctions().LogicCharacterClient_isImmuneOrUntargetable;
            if (immune && immune(enemy.ptr)) continue;
            if (!losCheck(x, y, enemy.x, enemy.y, BLOCKS_PROJECTILES)) continue;
            const aim = predictMotionShot(x, y, enemy, speed);
            if (!aim || Math.hypot(aim.x - x, aim.y - y) > range ||
                !losCheck(x, y, aim.x, aim.y, BLOCKS_PROJECTILES)) continue;
            if (fireAt(screen, own, Math.round(aim.x), Math.round(aim.y), enemy.gid))
            {
                lastFire = now;
                logInfo("turnshot fired", { id: enemy.gid, reason: enemy.reason, vx: enemy.vx, vy: enemy.vy, aim });
                break;
            }
        }
    }
    catch (error)
    {
        resetTurnshot();
        logError("turnshot failed", { error: String(error) });
    }
}
