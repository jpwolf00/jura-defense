/**
 * Phaser plugin: FXSystem
 *
 * Manages all combat and ability VFX as short-lived Phaser objects with
 * automatic cleanup.  Effects are additive (no clutter) and never obscure
 * the route corridor.
 */
import Phaser from 'phaser';

// Tower-type accent colours (hex) — must match TOWER_TYPES in tower.js
const TOWER_COLORS = {
  tranq: 0x5aa0c8,  // teal/blue
  drone: 0xc8b05a,  // gold/yellow
  fence: 0x58c8a0,  // green/teal
  heli: 0xb05858,   // red
  chrono: 0x8a58c8, // purple
};

export default class FXSystem extends Phaser.Plugins.BasePlugin {
  constructor(scene) {
    super(scene);
    this._registry = [];
    // O(1) lookup for cleanup: obj → registry entry
    this._objToEntry = new Map();
  }

  /* ── helpers ──────────────────────────────────────────────────────── */

  _track(obj, timeoutMs) {
    const entry = { obj, timer: this.scene.time.delayedCall(timeoutMs, () => {
      if (obj && !obj.destroyed && obj.destroy) obj.destroy();
      // O(1) removal via Map instead of O(n) findIndex+splice
      const e = this._objToEntry.get(obj);
      if (e) {
        this._objToEntry.delete(obj);
        const idx = this._registry.indexOf(e);
        if (idx !== -1) this._registry.splice(idx, 1);
      }
    }) };
    this._registry.push(entry);
    this._objToEntry.set(obj, entry);
  }

  /* ── Muzzle flash ─────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y  @param {string} towerType */
  muzzleFlash(x, y, towerType) {
    const color = TOWER_COLORS[towerType] || 0xffffff;
    
    // Distinct firing signatures per tower type
    let size, scaleX, scaleY, duration;
    switch (towerType) {
      case 'tranq':
        size = 12; scaleX = 2.0; scaleY = 2.0; duration = 250;
        break;
      case 'drone':
        size = 8; scaleX = 1.5; scaleY = 1.5; duration = 180;
        break;
      case 'fence':
        size = 24; scaleX = 2.8; scaleY = 2.8; duration = 320;
        break;
      case 'heli':
        size = 16; scaleX = 2.2; scaleY = 2.2; duration = 280;
        break;
      case 'chrono':
        size = 14; scaleX = 2.5; scaleY = 2.5; duration = 300;
        break;
      default:
        size = 10; scaleX = 1.8; scaleY = 1.8; duration = 200;
    }
    
    const flash = this.scene.add.circle(x, y, size, color)
      .setAlpha(0.9)
      .setScrollFactor(0)
      .setDepth(300)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: flash,
      scaleX,
      scaleY,
      alpha: 0,
      duration,
      ease: 'Power2',
      onComplete: () => { flash.destroy(); },
    });
    this._track(flash, duration + 50);
  }

  /* ── Hit flash ────────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y
   *  @param {'normal'|'slow'|'armorBreak'} status
   *  @param {number} damage - optional damage value to scale effect
   */
  hitFlash(x, y, status, damage) {
    const isSlow = status === 'slow';
    const isArmor = status === 'armorBreak';
    const color = isSlow ? 0x00e5ff : isArmor ? 0xff9800 : 0xffffff;
    
    // Scale effect by damage (base radius 14, +1 per 10 damage, capped at 28)
    const damageScale = damage ? Math.min(14 + damage / 10, 28) : 14;
    const radius = isSlow ? 22 : isArmor ? 18 : damageScale;
    const dur = isSlow ? 500 : isArmor ? 400 : 250;

    const ring = this.scene.add.circle(x, y, radius, color)
      .setAlpha(0.8)
      .setStrokeStyle(isSlow ? 3 : 2, color)
      .setScrollFactor(0)
      .setDepth(290);

    this.scene.tweens.add({
      targets: ring,
      scaleX: isSlow ? 4 : 3,
      scaleY: isSlow ? 4 : 3,
      alpha: 0,
      duration: dur,
      ease: 'Cubic.easeOut',
      onComplete: () => { ring.destroy(); },
    });
    this._track(ring, dur + 50);

    if (isArmor) {
      this.damageNumber(x, y - 15, 'ARMOR BROKEN', 0xff9800);
    }
  }

  /* ── Floating damage number ───────────────────────────────────────── */

  /** @param {number} x  @param {number} y  @param {string} text  @param {number} color */
  damageNumber(x, y, text, color) {
    const ui = this.scene._uiScale?.() ?? 1;
    const t = this.scene.add.text(x, y, text, {
      fontSize: `${Math.max(10, 14 * ui)}px`,
      color: '#' + (color ?? 0xffeb3b).toString(16).padStart(6, '0'),
      stroke: '#000000',
      strokeThickness: 2,
    })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(310);

    this.scene.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power1',
      onComplete: () => { t.destroy(); },
    });
    this._track(t, 900);
  }

  /* ── Death explosion ──────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y  @param {string} species */
  deathExplosion(x, y, species) {
    const isBig = species === 'trex';
    const count = isBig ? 24 : species === 'pterano' ? 14 : 8;
    const pSize = isBig ? 8 : 3;
    const dur = isBig ? 700 : 500;

    const emitter = this.scene.add.particles(0, 0, {
      lifespan: dur,
      speed: { min: 30, max: isBig ? 100 : 70 },
      angle: { min: 0, max: 360 },
      scale: { start: pSize, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    });
    emitter.setPosition(x, y);
    emitter.explode(count);
    this.scene.time.delayedCall(dur + 50, () => {
      if (emitter.destroy) emitter.destroy();
    });
    this._track(emitter, dur + 100);

    // Kill confirmation: brief white flash ring (readable without clutter)
    const confirm = this.scene.add.circle(x, y, 12, 0xffffff)
      .setAlpha(0.9)
      .setStrokeStyle(2, 0xffffff)
      .setScrollFactor(0)
      .setDepth(295);

    this.scene.tweens.add({
      targets: confirm,
      scaleX: 2.5,
      scaleY: 2.5,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => { confirm.destroy(); },
    });
    this._track(confirm, 350);
  }

  /* ── Slow ripple ──────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  slowRipple(x, y) {
    const ring = this.scene.add.circle(x, y, 5, 0x00e5ff)
      .setAlpha(0.6)
      .setStrokeStyle(2, 0x00e5ff)
      .setScrollFactor(0)
      .setDepth(280);

    this.scene.tweens.add({
      targets: ring,
      scaleX: 5,
      scaleY: 5,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => { ring.destroy(); },
    });
    this._track(ring, 700);

    // S07: Text cue for slow status (not color-only)
    this.damageNumber(x, y - 20, 'SLOW', 0x00e5ff);
  }

  /* ── Projectile trail ─────────────────────────────────────────────── */

  /** Render a short-lived colored trail for a projectile.
   *  @param {number} x  @param {number} y  @param {string} towerType */
  projectileTrail(x, y, towerType) {
    const color = TOWER_COLORS[towerType] || 0xffffff;
    const trail = this.scene.add.circle(x, y, 3, color)
      .setAlpha(0.5)
      .setScrollFactor(0)
      .setDepth(5) // Below path layer (10) so it never obscures corridor
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: trail,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 150,
      ease: 'Sine.easeOut',
      onComplete: () => { trail.destroy(); },
    });
    this._track(trail, 200);
  }

  /* ── Meteor telegraph ─────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  meteorTelegraph(x, y) {
    // Warning ring - pulses and grows
    const ring = this.scene.add.circle(x, y, 10, 0xff5722)
      .setAlpha(0.8)
      .setStrokeStyle(3, 0xff5722)
      .setScrollFactor(0)
      .setDepth(250);

    this.scene.tweens.add({
      targets: ring,
      scaleX: 6,
      scaleY: 6,
      alpha: 0,
      duration: 1500,
      ease: 'Cubic.easeIn',
      onComplete: () => { ring.destroy(); },
    });
    this._track(ring, 1600);

    // Shadow ellipse - smoothly grows and darkens
    const shadow = this.scene.add.ellipse(x, y, 20, 20, 0x000000)
      .setAlpha(0.3)
      .setScrollFactor(0)
      .setDepth(240);

    this.scene.tweens.add({
      targets: shadow,
      scaleX: 8,
      scaleY: 8,
      alpha: 0.6, // Darkens as meteor approaches
      duration: 1500,
      ease: 'Cubic.easeIn',
      onComplete: () => { shadow.destroy(); },
    });
    this._track(shadow, 1600);

    // Pulsing inner ring for urgency
    const pulse = this.scene.add.circle(x, y, 15, 0xff5722)
      .setAlpha(0.6)
      .setStrokeStyle(2, 0xff5722)
      .setScrollFactor(0)
      .setDepth(251);

    this.scene.tweens.add({
      targets: pulse,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeOut',
      repeat: 1,
      onComplete: () => { pulse.destroy(); },
    });
    this._track(pulse, 1700);
  }

  /* ── Meteor impact ────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  meteorImpact(x, y) {
    // Heavy screen shake first (feels weighty)
    this.scene.cameras.main.shake(300, 0.015);

    // Central flash - bright yellow-white
    const flash = this.scene.add.circle(x, y, 8, 0xffeb3b)
      .setAlpha(1)
      .setScrollFactor(0)
      .setDepth(350)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: flash,
      scaleX: 35,
      scaleY: 35,
      alpha: 0,
      duration: 450,
      ease: 'Power2',
      onComplete: () => { flash.destroy(); },
    });
    this._track(flash, 500);

    // Secondary orange shockwave ring
    const shockwave = this.scene.add.circle(x, y, 20, 0xff6600)
      .setAlpha(0.7)
      .setStrokeStyle(4, 0xff8800)
      .setScrollFactor(0)
      .setDepth(345);

    this.scene.tweens.add({
      targets: shockwave,
      scaleX: 8,
      scaleY: 8,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => { shockwave.destroy(); },
    });
    this._track(shockwave, 650);

    // Fire ring particles - more particles, heavier
    const fire = this.scene.add.particles(0, 0, {
      lifespan: 900,
      speed: { min: 50, max: 140 },
      angle: { min: 0, max: 360 },
      scale: { start: 10, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    });
    fire.setPosition(x, y);
    fire.explode(40);
    this.scene.time.delayedCall(1000, () => {
      if (fire.destroy) fire.destroy();
    });
    this._track(fire, 1050);

    // Scorch mark - lingers ~2s then fades
    this.scorchMark(x, y);
  }

  /* ── Scorch mark ──────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  scorchMark(x, y) {
    const mark = this.scene.add.ellipse(x, y, 60, 60, 0x1a1a1a)
      .setAlpha(0.6)
      .setScrollFactor(0)
      .setDepth(200);

    this.scene.time.delayedCall(2000, () => {
      this.scene.tweens.add({
        targets: mark,
        alpha: 0,
        duration: 1500,
        onComplete: () => { mark.destroy(); },
      });
    });
  }

  /* ── Chrono rewind ring ───────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  chronoRing(x, y) {
    // Clock-wipe effect: rotating ring with clock hands
    const ring = this.scene.add.circle(x, y, 5, 0x66e0ff)
      .setAlpha(0.7)
      .setStrokeStyle(3, 0x66e0ff)
      .setScrollFactor(0)
      .setDepth(290);

    this.scene.tweens.add({
      targets: ring,
      scaleX: 10,
      scaleY: 10,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => { ring.destroy(); },
    });
    this._track(ring, 1100);

    // Clock hands (two lines rotating in opposite directions)
    const hand1 = this.scene.add.line(x, y, 0, 0, 0, -20, 0x66e0ff)
      .setAlpha(0.8)
      .setLineWidth(3)
      .setScrollFactor(0)
      .setDepth(291);

    this.scene.tweens.add({
      targets: hand1,
      angle: -720, // Rotates backward (rewind)
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => { hand1.destroy(); },
    });
    this._track(hand1, 1100);

    const hand2 = this.scene.add.line(x, y, 0, 0, 15, 0, 0x66e0ff)
      .setAlpha(0.8)
      .setLineWidth(3)
      .setScrollFactor(0)
      .setDepth(291);

    this.scene.tweens.add({
      targets: hand2,
      angle: 720, // Rotates forward
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => { hand2.destroy(); },
    });
    this._track(hand2, 1100);

    // Blue tint overlay (brief, distinct from pause)
    const tint = this.scene.add.rectangle(
      this.scene.scale.width / 2,
      this.scene.scale.height / 2,
      this.scene.scale.width,
      this.scene.scale.height,
      0x66e0ff,
      0.15
    )
      .setScrollFactor(0)
      .setDepth(500);

    this.scene.tweens.add({
      targets: tint,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => { tint.destroy(); },
    });
    this._track(tint, 650);
  }

  /* ── Screen shake ─────────────────────────────────────────────────── */

  /** @param {number} intensity  @param {number} duration ms */
  shake(intensity, duration) {
    this.scene.cameras.main.shake(duration, intensity);
  }

  /* ── Tower-place confirmation ─────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  placeConfirm(x, y) {
    const ui = this.scene._uiScale?.() ?? 1;
    const check = this.scene.add.text(x, y - 20, '✓', {
      fontSize: `${Math.max(12, 18 * ui)}px`,
      color: '#66bb6a',
    })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(310);

    this.scene.tweens.add({
      targets: check,
      y: y - 40,
      alpha: 0,
      duration: 400,
      ease: 'Power1',
      onComplete: () => { check.destroy(); },
    });
    this._track(check, 500);
  }

  /* ── Wave-start flash ─────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  waveStartFlash(x, y) {
    const flash = this.scene.add.text(x, y, 'WAVE!', {
      fontSize: `${Math.max(20, 32 * (this.scene._uiScale?.() ?? 1))}px`,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(350)
      .setAlpha(1);

    this.scene.tweens.add({
      targets: flash,
      y: y - 60,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => { flash.destroy(); },
    });
    this._track(flash, 1300);
  }

  /* ── Tower-sell confirmation ──────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  sellConfirm(x, y) {
    const ui = this.scene._uiScale?.() ?? 1;
    const cross = this.scene.add.text(x, y - 20, '✕', {
      fontSize: `${Math.max(12, 18 * ui)}px`,
      color: '#ef5350',
    })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(310);

    this.scene.tweens.add({
      targets: cross,
      y: y - 40,
      alpha: 0,
      duration: 400,
      ease: 'Power1',
      onComplete: () => { cross.destroy(); },
    });
    this._track(cross, 500);
  }

  /* ── Clear all active effects ─────────────────────────────────────── */

  clear() {
    for (const { obj, timer } of this._registry) {
      timer?.removeCallback();
      if (obj && !obj.destroyed && obj.destroy) obj.destroy();
    }
    this._registry.length = 0;
  }
}

/* ── Plugin registration helpers ────────────────────────────────────── */

/** Add FXSystem plugin to a scene (idempotent). */
export function addFXSystem(scene) {
  const fx = new FXSystem(scene);
  fx.scene = scene;
  return fx;
}
