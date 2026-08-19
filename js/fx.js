// Lightweight particle + effect system (pulses, explosions, screen shake, floaters).

export class FX {
  constructor() {
    this.pulses = [];
    this.explosions = [];
    this.particles = [];
    this.floaters = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.rewind = 0;
  }

  pulse(x, y, r) {
    this.pulses.push({ x, y, r0: r * 0.3, r, t: 0, dur: 0.35 });
  }

  explosion(x, y, r) {
    this.explosions.push({ x, y, r, t: 0, dur: 0.6 });
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 260;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, dur: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 5,
        color: Math.random() > 0.5 ? '#ffb060' : '#e05a30',
        grav: 200,
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 90;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        t: 0, dur: 0.8 + Math.random() * 0.6,
        size: 8 + Math.random() * 14,
        color: '#3a3a3a',
        grav: -20, smoke: true,
      });
    }
  }

  // Death burst: dramatic explosion on enemy kill
  death(x, y, color, radius) {
    // body fragments
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 180;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        t: 0, dur: 0.6 + Math.random() * 0.4,
        size: 2 + Math.random() * 4,
        color: color,
        grav: 150,
      });
    }
    // glow burst
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 60;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        t: 0, dur: 0.5 + Math.random() * 0.3,
        size: 4 + Math.random() * 6,
        color: '#ffffff',
        grav: -30, smoke: true,
      });
    }
    this.shake(0.15);
  }

  hit(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 150;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, dur: 0.3,
        size: 1.5 + Math.random() * 2.5,
        color,
        grav: 80,
      });
    }
  }

  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, t: 0, dur: 0.9 });
  }

  shake(seconds, mag = 12) {
    this.shakeT = Math.max(this.shakeT, seconds);
    this.shakeMag = mag;
  }

  update(dt) {
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.rewind > 0) this.rewind = Math.max(0, this.rewind - dt / 0.9);
    this.pulses = this.pulses.filter(p => (p.t += dt) < p.dur);
    this.explosions = this.explosions.filter(e => (e.t += dt) < e.dur);
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
    // pulses
    for (const p of this.pulses) {
      const k = p.t / p.dur;
      ctx.save();
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.strokeStyle = '#58c8a0';
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r0 + (p.r - p.r0) * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // explosions
    for (const e of this.explosions) {
      const k = e.t / e.dur;
      ctx.save();
      ctx.globalAlpha = 0.8 * (1 - k);
      ctx.strokeStyle = '#ff8a3c';
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.fillStyle = '#ffce6a';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 0.5 * (1 - k), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // particles
    for (const p of this.particles) {
      const k = 1 - p.t / p.dur;
      ctx.save();
      ctx.globalAlpha = p.smoke ? 0.35 * k : 0.9 * k;
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
