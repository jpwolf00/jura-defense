// Particle + effect system: pulses, explosions, impact flashes, screen shake,
// floaters. Uses additive blending ('lighter') for glow so effects read vividly.

export class FX {
  constructor() {
    this.pulses = [];
    this.explosions = [];
    this.flashes = [];      // impact/launch flash rings
    this.shockwaves = [];   // kill shockwave rings
    this.particles = [];
    this.floaters = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.rewind = 0;
  }

  pulse(x, y, r) {
    this.pulses.push({ x, y, r0: r * 0.25, r, t: 0, dur: 0.4 });
  }

  // Small bright impact flash (projectile hit).
  hit(x, y, color) {
    this.flashes.push({ x, y, color, r: 18, t: 0, dur: 0.18 });
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 180;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, dur: 0.25 + Math.random() * 0.15,
        size: 1.5 + Math.random() * 2.5,
        color, grav: 90, glow: true,
      });
    }
  }

  explosion(x, y, r) {
    this.explosions.push({ x, y, r, t: 0, dur: 0.6 });
    this.flashes.push({ x, y, color: '#ffce6a', r: r * 0.9, t: 0, dur: 0.3 });
    this.shockwaves.push({ x, y, r: r * 1.2, t: 0, dur: 0.4 });
    this.shake(0.25, 14);
    const n = 50;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 300;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, dur: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 5,
        color: Math.random() > 0.5 ? '#ffb060' : '#e05a30',
        grav: 200, glow: true,
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 100;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        t: 0, dur: 0.8 + Math.random() * 0.6,
        size: 8 + Math.random() * 16,
        color: '#3a3a3a', grav: -20, smoke: true,
      });
    }
  }

  // Death burst: dramatic explosion on enemy kill.
  death(x, y, color, radius) {
    this.flashes.push({ x, y, color: '#ffffff', r: radius * 1.6, t: 0, dur: 0.22 });
    this.shockwaves.push({ x, y, r: radius * 2.2, t: 0, dur: 0.35 });
    this.shake(0.18, 10);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 220;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        t: 0, dur: 0.6 + Math.random() * 0.4,
        size: 2 + Math.random() * 5,
        color, grav: 150, glow: true,
      });
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 70;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        t: 0, dur: 0.5 + Math.random() * 0.3,
        size: 4 + Math.random() * 7,
        color: '#ffffff', grav: -30, smoke: true,
      });
    }
  }

  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, t: 0, dur: 0.9 });
  }

  shake(seconds, mag = 12) {
    this.shakeT = Math.max(this.shakeT, seconds);
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  update(dt) {
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.rewind > 0) this.rewind = Math.max(0, this.rewind - dt / 0.9);
    this.pulses = this.pulses.filter(p => (p.t += dt) < p.dur);
    this.explosions = this.explosions.filter(e => (e.t += dt) < e.dur);
    this.flashes = this.flashes.filter(f => (f.t += dt) < f.dur);
    this.shockwaves = this.shockwaves.filter(s => (s.t += dt) < s.dur);
    this.particles = this.particles.filter(p => {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.grav || 0) * dt;
      return p.t < p.dur;
    });
    this.floaters = this.floaters.filter(f => {
      f.t += dt;
      f.y -= 30 * dt;
      return f.t < f.dur;
    });
  }

  shakeOffset() {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const k = this.shakeT;
    return {
      x: (Math.random() - 0.5) * this.shakeMag * k,
      y: (Math.random() - 0.5) * this.shakeMag * k,
    };
  }

  draw(ctx) {
    // pulses (aoe rings)
    for (const p of this.pulses) {
      const k = p.t / p.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.strokeStyle = '#58c8a0';
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r0 + (p.r - p.r0) * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // shockwaves (kill/explosion rings)
    for (const s of this.shockwaves) {
      const k = s.t / s.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // flashes (impact glow discs)
    for (const f of this.flashes) {
      const k = f.t / f.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, f.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.9 * (1 - k);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // explosions (fire ring + core)
    for (const e of this.explosions) {
      const k = e.t / e.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 * (1 - k);
      ctx.strokeStyle = '#ff8a3c';
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = '#ffce6a';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 0.5 * (1 - k), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // particles (additive glow for non-smoke)
    for (const p of this.particles) {
      const k = 1 - p.t / p.dur;
      ctx.save();
      if (p.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = p.smoke ? 0.35 * k : 0.95 * k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.smoke ? 1 + (p.t / p.dur) * 2 : k), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // floaters
    for (const f of this.floaters) {
      const k = 1 - f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = f.color;
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    // chrono rewind wash
    if (this.rewind > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 * this.rewind;
      ctx.fillStyle = '#66e0ff';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalAlpha = 0.5 * this.rewind;
      ctx.strokeStyle = 'rgba(200,240,255,0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const x = ((this.rewind * 137 + i * 0.11) % 1) * ctx.canvas.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ctx.canvas.height);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
