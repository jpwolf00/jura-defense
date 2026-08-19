// Chrono Charge — the time-travel hook.
// A leak "costs" you time: the meter fills. At a full charge you can REWIND
// the last REWIND_SECONDS of enemy progress (they retrace; no revives).

export const REWIND_SECONDS = 4;
const FRAME_INTERVAL = 1 / 15; // snapshot cadence
const MAX_CHARGE = 100;
const COOLDOWN = 8;            // seconds before you may rewind again

const LEAK_CHARGE = {
  raptor: 35, hadro: 35, trice: 45, anky: 50, pterano: 40, trex: 100,
};

export class ChronoCharge {
  constructor() {
    this.charge = 0;
    this.frames = [];          // ring of snapshots
    this.frameTimer = 0;
    this.cooldown = 0;
  }

  get full()  { return this.charge >= MAX_CHARGE; }
  get ready() { return this.full && this.cooldown <= 0 && this.frames.length > 1; }
  get pct()   { return Math.min(1, this.charge / MAX_CHARGE); }

  onLeak(enemy) {
    this.charge = Math.min(MAX_CHARGE, this.charge + (LEAK_CHARGE[enemy.type] || 20));
  }

  // Snapshot live enemy + tower state for rewind.
  tick(dt, enemies, towers) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.frameTimer += dt;
    if (this.frameTimer >= FRAME_INTERVAL) {
      this.frameTimer = 0;
      const frame = {
        t: REWIND_SECONDS, // seconds-old label, refreshed below
        enemies: enemies.filter(e => !e.dead).map(e => ({ id: e.uid, dist: e.dist, hp: e.hp })),
        towers: towers.map(t => ({ idx: towers.indexOf(t), cooldown: t.cooldown })),
      };
      this.frames.push(frame);
      // keep only frames from the last REWIND_SECONDS
      this._prune();
    }
  }

  _prune() {
    // drop frames older than REWIND_SECONDS (approx by count, cadence is fixed)
    const keep = Math.ceil(REWIND_SECONDS / FRAME_INTERVAL) + 1;
    if (this.frames.length > keep) this.frames.splice(0, this.frames.length - keep);
  }

  // Rewind: every live enemy retraces to its position ~REWIND_SECONDS ago.
  // Dead enemies stay dead (it's a rewind, not a resurrection).
  // In-flight projectiles (fired in the "future" we're undoing) are cancelled.
  activate(enemies, towers, fx, projectiles) {
    const old = this.frames[0];
    if (!old || old.enemies.length === 0) return false;
    const byId = new Map(old.enemies.map(e => [e.id, e]));
    let moved = 0;
    for (const e of enemies) {
      if (e.dead) continue;
      const snap = byId.get(e.uid);
      if (snap) {
        e.dist = snap.dist;
        e.hp = Math.min(e.hp, snap.hp); // never heal above its old HP
        e._sync();
        e.slowUntil = 0;
        e.slowFactor = 1;
        moved++;
      }
    }
    for (const t of towers) t.cooldown = 0;
    if (projectiles) projectiles.length = 0;
    this.frames = [];
    this.charge = 0;
    this.cooldown = COOLDOWN;
    if (fx) {
      fx.rewindFlash();
    }
    return moved > 0;
  }
}
