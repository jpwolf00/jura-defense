import { pointAt, headingAt, PATH_LENGTH, WAYPOINTS } from './path.js';
import { spriteImage, SPRITES } from './sprites.js';

export const ENEMY_TYPES = {
  raptor:  { hp: 34,  speed: 120, reward: 6,  radius: 15, color: '#7fa05a', name: 'Velociraptor', sprite: 'dino_raptor' },
  hadro:   { hp: 55,  speed: 70,  reward: 9,  radius: 18, color: '#b9a24a', name: 'Hadrosaur', sprite: 'dino_hadro' },
  trice:   { hp: 160, speed: 48,  reward: 22, radius: 24, color: '#8a6b4a', name: 'Triceratops', armor: 4, sprite: 'dino_trice' },
  anky:    { hp: 220, speed: 42,  reward: 26, radius: 24, color: '#6b6f5a', name: 'Ankylosaurus', armor: 8, sprite: 'dino_anky' },
  pterano: { hp: 48,  speed: 95,  reward: 12, radius: 16, color: '#7a5aa0', name: 'Pteranodon', flying: true, freeFly: true, sprite: 'dino_pterano' },
  trex:    { hp: 620, speed: 40,  reward: 80, radius: 30, color: '#a04a3a', name: 'T-Rex', armor: 6, sprite: 'dino_trex' },
};

// Strictly 2D motion: each generated image remains the same locked side-view
// raster. Profiles move it like a paper puppet, never asking a video model to
// invent a new camera angle, lighting setup, or anatomy between frames.
export const MOTION_PROFILES = {
  raptor:  { bob: 0.16, squash: 0.065, tilt: 0.045, tail: 0.085, flap: 0,    rate: 2.8 },
  hadro:   { bob: 0.11, squash: 0.050, tilt: 0.025, tail: 0.055, flap: 0,    rate: 1.65 },
  trice:   { bob: 0.09, squash: 0.075, tilt: 0.018, tail: 0.030, flap: 0,    rate: 1.25 },
  anky:    { bob: 0.07, squash: 0.085, tilt: 0.016, tail: 0.095, flap: 0,    rate: 1.05 },
  pterano: { bob: 0.05, squash: 0.020, tilt: 0.025, tail: 0.035, flap: 0.18, rate: 3.2 },
  trex:    { bob: 0.20, squash: 0.100, tilt: 0.035, tail: 0.060, flap: 0,    rate: 1.0 },
};

// Negative distance keeps burst-spawned followers off-path until their turn.
export function spawnOffset(order, spacing = 55) {
  return order === 0 ? 0 : -order * spacing;
}

export class Enemy {
  constructor(type, waveScale) {
    const t = ENEMY_TYPES[type];
    this.type = type;
    this.uid = Enemy._nextUid++;
    this.t = t;
    this.dist = 0;
    this.maxHp = Math.round(t.hp * waveScale);
    this.hp = this.maxHp;
    this.speed = t.speed;
    this.baseSpeed = t.speed;
    this.reward = t.reward;
    this.radius = t.radius;
    this.armor = t.armor || 0;
    this.flying = !!t.flying;
    // Free-flying: the joke enemy. Ignores the path, beelines at the rig.
    this.freeFly = !!t.freeFly;
    if (this.freeFly) {
      this.flyStart = { x: -40, y: 140 };
      this.flyEnd = { x: 1280, y: 660 };
    }
    this.x = 0; this.y = 0;
    this.heading = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.dead = false;
    this.reached = false;
    this.hitFlash = 0;
    // animation clock
    this.animT = Math.random() * 100;
    this._img = null;
    if (t.sprite) spriteImage(t.sprite, (i) => { this._img = i; });
    this._sync();
  }

  _sync() {
    if (this.freeFly) {
      const a = this.flyStart, b = this.flyEnd;
      const total = Math.hypot(b.x - a.x, b.y - a.y);
      const d = Math.max(0, Math.min(this.dist, total));
      this.x = a.x + (b.x - a.x) * (d / total);
      this.y = a.y + (b.y - a.y) * (d / total);
      this.heading = Math.atan2(b.y - a.y, b.x - a.x);
      return;
    }
    const p = pointAt(this.dist);
    this.x = p.x; this.y = p.y;
    this.heading = headingAt(this.dist);
  }

  // Path length used for "reached the rig" (free-fly is its own straight line).
  get pathLength() {
    if (this.freeFly) {
      return Math.hypot(this.flyEnd.x - this.flyStart.x, this.flyEnd.y - this.flyStart.y);
    }
    return PATH_LENGTH;
  }

  update(dt, now) {
    // slow effect
    let spd = this.baseSpeed;
    if (this.slowUntil > now) spd *= this.slowFactor;
    this.dist += spd * dt;
    if (this.dist >= this.pathLength) {
      this.reached = true;
      this.dead = true;
    }
    this._sync();
    this.animT += dt * spd * 0.05;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  // returns true if this hit killed it
  damage(amount) {
    const eff = Math.max(1, amount - this.armor);
    this.hp -= eff;
    this.hitFlash = 0.12;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; return true; }
    return false;
  }

  applySlow(factor, duration) {
    this.slowFactor = factor;
    this.slowUntil = Math.max(this.slowUntil, performance.now() + duration * 1000);
  }

  draw(ctx) {
    // Followers wait off-path until their queued negative distance reaches 0.
    if (this.dist < 0) return;
    const t = this.t;
    const r = this.radius;
    // Visible sprite size: crop the real dino bounds out of the 96×96 frame
    // and draw it much larger so it reads clearly instead of as a tiny blob.
    const meta = t.sprite ? SPRITES[t.sprite] : null;
    const hasSprite = !!(this._img && this._img.complete && this._img.naturalWidth && meta);
    const aspect = hasSprite ? meta.w / meta.h : 1;
    const h = hasSprite ? Math.max(r * 4.5, 62) : Math.max(r * 2.6, 36);
    const w = h * aspect;
    ctx.save();
    ctx.translate(this.x, this.y);

    // ground shadow: grounds units on the path and separates them from bg art
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, this.flying ? h * 0.30 : h * 0.10, w * 0.46, Math.max(4, w * 0.13), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // flying shadow (for fliers) + offset body upward
    if (this.flying) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.35, w * 0.40, Math.max(4, w * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.translate(0, -h * 0.35);
    }

    const img = this._img;
    if (hasSprite) {
      // A stable single side-view sprite receives only 2D transforms.
      const motion = MOTION_PROFILES[this.type];
      const phase = this.animT * motion.rate;
      const step = Math.sin(phase);
      const bob = Math.abs(step) * r * motion.bob;
      const squash = 1 - Math.abs(step) * motion.squash;
      const tilt = step * motion.tilt;
      const tailPulse = Math.sin(phase + Math.PI / 2) * motion.tail;
      ctx.save();
      // Source images face left; mirror only for direction of travel.
      const flip = Math.cos(this.heading) > 0 ? -1 : 1;
      ctx.scale(flip, 1);
      ctx.translate(0, -bob);
      ctx.rotate(tilt);
      const flapScale = motion.flap > 0 ? 1 + Math.sin(phase) * motion.flap : 1;
      ctx.scale(1 + Math.abs(step) * motion.squash * 0.45, squash * flapScale);
      if (this.hitFlash > 0) ctx.filter = 'brightness(2.2)';
      // 9-arg drawImage: crop the real sprite bounds (ox,oy,w,h) out of the
      // 96×96 frame and draw it bottom-aligned to the ground point.
      ctx.drawImage(img, meta.ox ?? 0, meta.oy ?? 0, meta.w, meta.h, -w / 2, -h, w, h);

      // A small stable directional motion cue; this is deliberately 2D and
      // sits behind the sprite, so it cannot alter the dino's perspective.
      if (!this.flying && Math.abs(step) > 0.35) {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#d6b37c';
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.beginPath();
        ctx.moveTo(-w * 0.45, -h * 0.13);
        ctx.lineTo(-w * (0.45 + tailPulse), -h * 0.10);
        ctx.stroke();
      }
      if (motion.flap > 0) {
        // Pteranodon: a faint cyan air trail reinforces its 2D wing beat.
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#9ed8dc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -h * 0.55, w * 0.46, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // --- vector fallback (placeholder art until sprite loads) ---
      ctx.rotate(this.heading);
      // body
      ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : t.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // head
      ctx.beginPath();
      ctx.arc(r * 0.85, -r * 0.1, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // tail
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(-r * 1.8, -r * 0.3);
      ctx.lineTo(-r * 1.5, r * 0.2);
      ctx.closePath();
      ctx.fill();
      // legs (walk cycle)
      const step = Math.sin(this.animT) * r * 0.3;
      ctx.strokeStyle = this.hitFlash > 0 ? '#fff' : shade(t.color, -25);
      ctx.lineWidth = r * 0.25;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, r * 0.5);
      ctx.lineTo(-r * 0.3 - step, r * 1.1);
      ctx.moveTo(r * 0.4, r * 0.5);
      ctx.lineTo(r * 0.4 + step, r * 1.1);
      ctx.stroke();
      // armor ridge for armored types
      if (this.armor) {
        ctx.strokeStyle = shade(t.color, -40);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, -0.6, 0.6);
        ctx.stroke();
      }
    }
    ctx.restore();

    // HP bar (positioned above the larger sprite)
    const barW = Math.max(this.radius * 2, w * 0.55);
    const ratio = this.hp / this.maxHp;
    const barY = this.y - h - 12;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(this.x - barW / 2, barY, barW, 5);
    ctx.fillStyle = ratio > 0.4 ? '#6fbf73' : '#d0563f';
    ctx.fillRect(this.x - barW / 2, barY, barW * ratio, 5);
  }
}

// Stable per-enemy identity so Chrono Charge can match snapshots across a rewind.
Enemy._nextUid = 1;

function shade(hex, amt) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}