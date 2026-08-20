import { spriteImage, SPRITES } from './sprites.js';

export const TOWER_TYPES = {
  tranq:  { name: 'Tranq Cannon',  cost: 90,  range: 170, rate: 0.9,  dmg: 16, color: '#5aa0c8',
            desc: 'Slows target 45% for 2s.', kind: 'single', slow: 0.55, slowDur: 2, sprite: 'tower_tranq', barrelAngle: Math.PI },
  drone:  { name: 'Drone Swarm',   cost: 70,  range: 130, rate: 0.28, dmg: 5,  color: '#c8b05a',
            desc: 'Cheap, rapid-fire.', kind: 'single', sprite: 'tower_drone', barrelAngle: -Math.PI / 2 },
  fence:  { name: 'Volt Fence',    cost: 130, range: 90,  rate: 1.1,  dmg: 14, color: '#58c8a0',
            desc: 'Pulses: hits EVERYTHING in range.', kind: 'aoe', sprite: 'tower_aoe' },
  heli:   { name: 'Heli Gunner',   cost: 220, range: 280, rate: 1.6,  dmg: 48, color: '#b05858',
            desc: 'Long range, heavy hits.', kind: 'single', sprite: null, emoji: '🚁' },
  chrono: { name: 'Chrono Turret', cost: 260, range: 200, rate: 1.4,  dmg: 10, color: '#8a58c8',
            desc: 'Time-dilation: slows 55% for 3s.', kind: 'single', slow: 0.45, slowDur: 3, sprite: 'tower_chrono' },
};

const UPGRADE_COST = 0.8;   // as fraction of base cost per level
const UPGRADE_DMG = 1.5;    // dmg multiplier per level
const MAX_LEVEL = 5;

export class Tower {
  constructor(type, x, y) {
    this.type = type;
    this.t = TOWER_TYPES[type];
    this.x = x; this.y = y;
    this.level = 1;
    this.cooldown = 0;
    this.target = null;
    this.angle = 0;
    this.restAngle = 0;   // barrel resting direction (toward path)
    this.flash = 0;
    this._img = null;
    if (this.t.sprite) spriteImage(this.t.sprite, (i) => { this._img = i; });
  }

  get dmg()  { return this.t.dmg * Math.pow(UPGRADE_DMG, this.level - 1); }
  get range(){ return this.t.range + (this.level - 1) * 14; }
  upgradeCost() { return Math.round(this.t.cost * UPGRADE_COST * this.level); }
  sellValue()   { return Math.round(this.t.cost * 0.6 * this.level); }

  canUpgrade()  { return this.level < MAX_LEVEL; }

  update(dt, enemies, now, projectiles, fx) {
    this.cooldown -= dt;
    if (this.flash > 0) this.flash -= dt;

    // acquire / validate target: farthest along path within range
    if (!this.target || this.target.dead) {
      this.target = null;
      let best = null;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= this.range && (!best || e.dist > best.dist)) best = e;
      }
      this.target = best;
    }

    if (this.target) {
      this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      if (this.cooldown <= 0) {
        this.fire(projectiles, fx, enemies);
        this.cooldown = this.t.rate;
      }
    }
  }

  fire(projectiles, fx, enemies) {
    this.flash = 0.1;
    if (this.t.kind === 'aoe') {
      // instant pulse
      fx.pulse(this.x, this.y, this.range);
      for (const e of enemies) {
        if (e.dead) continue;
        if (e.flying) continue; // ground fence doesn't hit fliers
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= this.range) e.damage(this.dmg);
      }
    } else {
      projectiles.push({
        x: this.x, y: this.y, target: this.target,
        speed: 520,
        dmg: this.dmg,
        color: this.t.color,
        slow: this.t.slow || 1,          // 1 = no slow; <1 = speed factor
        slowDur: this.t.slowDur || 0,
        life: 2,
        trail: [],
      });
    }
  }

  draw(ctx, selected) {
    const s = 26;
    ctx.save();
    ctx.translate(this.x, this.y);

    // ground shadow: grounds the turret on the board
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.55, s * 1.1, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // base plate (always, so the build square reads clearly)
    ctx.fillStyle = '#243029';
    ctx.strokeStyle = selected ? '#e0a458' : '#3a4a3f';
    ctx.lineWidth = selected ? 3 : 2;
    roundRect(ctx, -s, -s, s * 2, s * 2, 8);
    ctx.fill(); ctx.stroke();

    const img = this._img;
    const aim = this.target ? this.angle : this.restAngle;
    if (img && img.complete && img.naturalWidth) {
      const meta = SPRITES[this.t.sprite];
      const aspect = meta.w / meta.h;
      const h = s * 2.6;
      const w = h * aspect;
      ctx.save();
      // Rotate the whole sprite so its baked-in weapon aims at the target.
      // Sprites without a directional barrel (aoe lamp, chrono ring) stay fixed.
      if (this.t.barrelAngle !== undefined) ctx.rotate(aim - this.t.barrelAngle);
      if (this.flash > 0) ctx.filter = 'brightness(1.5)';
      ctx.drawImage(img, meta.ox ?? 0, meta.oy ?? 0, meta.w, meta.h, -w / 2, -h * 0.95, w, h * 0.95);
      ctx.restore();
      // muzzle flash at the tip (in aim direction)
      if (this.flash > 0 && this.t.barrelAngle !== undefined) {
        ctx.save();
        ctx.rotate(aim);
        ctx.globalAlpha = Math.min(1, this.flash * 8);
        ctx.fillStyle = '#fff3c0';
        ctx.shadowColor = '#ffb060';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(s + 10, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Vector fallback (heli, or before sprite loads): base + rotating barrel.
      ctx.save();
      ctx.rotate(aim);
      if (this.flash > 0) {
        ctx.globalAlpha = Math.min(1, this.flash * 8);
        ctx.fillStyle = '#fff3c0';
        ctx.shadowColor = '#ffb060';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(s + 12, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = this.t.color;
      ctx.fillRect(s * 0.2, -3.5, s + 8, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(s * 0.2, -3.5, s * 0.35, 7);
      ctx.fillStyle = this.t.color;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(s + 5, -4.5, 5, 9);
      ctx.restore();
    }

    // level pips
    for (let i = 0; i < this.level; i++) {
      ctx.fillStyle = '#e0a458';
      ctx.beginPath();
      ctx.arc(-s + 6 + i * 8, s - 6, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = this.t.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = this.t.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
