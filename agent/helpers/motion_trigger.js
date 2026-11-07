// Position windows avoid treating repeated render frames as sudden stops.
export function createMotionTrigger()
{
    const tracks = new Map();
    return {
        reset() { tracks.clear(); },
        update(enemies, now)
        {
            const seen = new Set();
            const events = [];
            for (const enemy of enemies)
            {
                if (enemy.kind !== "player" || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) continue;
                const id = String(enemy.gid);
                seen.add(id);
                const old = tracks.get(id);
                if (!old || now <= old.time || now - old.time > 250)
                {
                    tracks.set(id, { x: enemy.x, y: enemy.y, time: now, velocity: null });
                    continue;
                }
                const dt = now - old.time;
                if (dt < 80) continue;
                const vx = (enemy.x - old.x) * 1000 / dt;
                const vy = (enemy.y - old.y) * 1000 / dt;
                const speed = Math.hypot(vx, vy);
                const previous = old.velocity;
                const velocity = speed <= 2400 ? { vx, vy, speed } : null;
                tracks.set(id, { x: enemy.x, y: enemy.y, time: now, velocity });
                if (!previous || !velocity || previous.speed < 200) continue;
                const cosine = speed > 100 ? (previous.vx * vx + previous.vy * vy) / (previous.speed * speed) : 1;
                const turned = speed > 100 && cosine < Math.cos(Math.PI / 6);
                const slowed = previous.speed - speed >= 150 && speed <= previous.speed * 0.7;
                if (turned || slowed) events.push({ ...enemy, vx, vy, reason: turned ? "turn" : "slow" });
            }
            for (const id of tracks.keys()) if (!seen.has(id)) tracks.delete(id);
            return events;
        }
    };
}

export function predictMotionShot(myX, myY, enemy, projectileSpeed)
{
    if (!(projectileSpeed > 0)) return null;
    const dx = enemy.x - myX, dy = enemy.y - myY;
    const a = enemy.vx ** 2 + enemy.vy ** 2 - projectileSpeed ** 2;
    const b = 2 * (dx * enemy.vx + dy * enemy.vy);
    const c = dx * dx + dy * dy;
    let time;
    if (c === 0) time = 0;
    else if (Math.abs(a) < 1e-6) time = b < 0 ? -c / b : NaN;
    else
    {
        const disc = b * b - 4 * a * c;
        const roots = disc >= 0 ? [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)] : [];
        time = Math.min(...roots.filter(t => t >= 0));
    }
    if (!Number.isFinite(time) || time > 1) return null;
    return { x: enemy.x + enemy.vx * time, y: enemy.y + enemy.vy * time };
}
