// Meteor Call — the super weapon. A small asteroid is yanked from orbit.
// Limited charges + cooldown. Big radial blast + knockback + fire ring VFX.

export const METEOR = {
  maxCharges: 3,
  cooldown: 18,        // seconds between calls
  telegraph: 1.5,       // seconds of fall before impact
  radius: 170,          // blast radius (px)
  damage: 260,
  knockback: 120,       // px pushed back along path
  screenShake: 0.5,     // seconds
};

export class MeteorCall {
  constructor() {
    this.charges = METEOR.maxCharges;
    this.cooling = 0;
    this.target = null;   // { x, y, t }
  }

  get ready() {
    return this.charges > 0 && this.cooling <= 0 && !this.target;
  }

  fire(x, y) {
    if (!this.ready) return false;
    this.charges--;
    this.cooling = METEOR.cooldown;
    this.target = { x, y, t: 0, impacted: false };
    return true;
  }

  update(dt, enemies, fx, game) {
    if (this.cooling > 0) this.cooling = Math.max(0, this.cooling - dt);
    if (!this.target) return;
    this.target.t += dt;

    if (!this.target.impacted && this.target.t >= METEOR.telegraph) {
      this.target.impacted = true;
      this._blast(enemies, fx, game);
      this.target = null;
    }
  }

  _blast(enemies, fx, game) {
    fx.explosion(this.target.x, this.target.y, METEOR.radius);
    fx.shake(METEOR.screenShake);
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.target.x, e.y - this.target.y);
      if (d <= METEOR.radius) {
        // knockback: push back along the path
        e.dist = Math.max(0, e.dist - METEOR.knockback * (1 - d / METEOR.radius));
        e.damage(METEOR.damage);
      }
    }
  }

  draw(ctx) {
    if (this.cooling > 0 && this.charges < METEOR.maxCharges) {
      // subtle cooldown ring on the HUD button is handled in HUD
    }
    if (!this.target) return;
    const { x, y, t } = this.target;
    const prog = Math.min(1, t / METEOR.telegraph);

    // growing target reticle
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * prog;
    ctx.strokeStyle = '#e0a458';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(x, y, METEOR.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // crosshair
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (METEOR.radius - 14), y + Math.sin(a) * (METEOR.radius - 14));
      ctx.lineTo(x + Math.cos(a) * (METEOR.radius - 2), y + Math.sin(a) * (METEOR.radius - 2));
      ctx.stroke();
    }

    // falling meteor: descends from top of screen toward target
    const mx = x + (1 - prog) * 160;
    const my = y - (1 - prog) * 420;
    const size = 10 + 14 * prog;
    // fire trail
    const grd = ctx.createLinearGradient(mx, my - 120, mx, my);
    grd.addColorStop(0, 'rgba(255,140,40,0)');
    grd.addColorStop(1, 'rgba(255,180,80,0.7)');
    ctx.strokeStyle = grd;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(mx - 18, my - 130);
    ctx.lineTo(mx, my);
    ctx.stroke();
    // rock
    ctx.fillStyle = '#5a4636';
    ctx.beginPath();
    ctx.arc(mx, my, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e07a3a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}
