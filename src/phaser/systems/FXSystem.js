/**
 * Phaser plugin: FXSystem
 *
 * Manages all combat and ability VFX as short-lived Phaser objects with
 * automatic cleanup.  Effects are additive (no clutter) and never obscure
 * the route corridor.
 */
import Phaser from 'phaser';

// Tower-type accent colours (hex)
const TOWER_COLORS = {
  tranq: 0x66bb6a, // green
  fence: 0xffeb3b, // yellow
  drone: 0x42a5f5, // blue
  heli: 0xef5350,  // red
  chrono: 0xab47bc, // purple
};

export default class FXSystem extends Phaser.Plugins.BasePlugin {
  constructor(scene) {
    super(scene);
    this._registry = [];
  }

  /* ── helpers ──────────────────────────────────────────────────────── */

  _track(obj, timeoutMs) {
    this._registry.push({ obj, timer: this.scene.time.delayedCall(timeoutMs, () => {
      if (obj && !obj.destroyed && obj.destroy) obj.destroy();
      const idx = this._registry.findIndex((r) => r.obj === obj);
      if (idx !== -1) this._registry.splice(idx, 1);
    }) });
  }

  /* ── Muzzle flash ─────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y  @param {string} towerType */
  muzzleFlash(x, y, towerType) {
    const color = TOWER_COLORS[towerType] || 0xffffff;
    const size = towerType === 'heli' ? 16 : towerType === 'fence' ? 24 : 10;
    const flash = this.scene.add.circle(x, y, size, color)
      .setAlpha(0.9)
      .setScrollFactor(0)
      .setDepth(300)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: flash,
      scaleX: towerType === 'fence' ? 2.5 : 1.8,
      scaleY: towerType === 'fence' ? 2.5 : 1.8,
      alpha: 0,
      duration: towerType === 'fence' ? 300 : 200,
      ease: 'Power2',
      onComplete: () => { flash.destroy(); },
    });
    this._track(flash, 350);
  }

  /* ── Hit flash ────────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y
   *  @param {'normal'|'slow'|'armorBreak'} status
   */
  hitFlash(x, y, status) {
    const isSlow = status === 'slow';
    const isArmor = status === 'armorBreak';
    const color = isSlow ? 0x00e5ff : isArmor ? 0xff9800 : 0xffffff;
    const radius = isSlow ? 22 : 14;
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
  }

  /* ── Meteor telegraph ─────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  meteorTelegraph(x, y) {
    // Warning ring
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

    // Shadow ellipse
    const shadow = this.scene.add.ellipse(x, y, 20, 20, 0x000000)
      .setAlpha(0.4)
      .setScrollFactor(0)
      .setDepth(240);

    this.scene.tweens.add({
      targets: shadow,
      scaleX: 8,
      scaleY: 8,
      alpha: 0.1,
      duration: 1500,
      ease: 'Cubic.easeIn',
      onComplete: () => { shadow.destroy(); },
    });
    this._track(shadow, 1600);
  }

  /* ── Meteor impact ────────────────────────────────────────────────── */

  /** @param {number} x  @param {number} y */
  meteorImpact(x, y) {
    // Central flash
    const flash = this.scene.add.circle(x, y, 5, 0xffeb3b)
      .setAlpha(1)
      .setScrollFactor(0)
      .setDepth(350)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: flash,
      scaleX: 30,
      scaleY: 30,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => { flash.destroy(); },
    });
    this._track(flash, 450);

    // Fire ring particles
    const fire = this.scene.add.particles(0, 0, {
      lifespan: 800,
      speed: { min: 40, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 8, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    });
    fire.setPosition(x, y);
    fire.explode(30);
    this.scene.time.delayedCall(900, () => {
      if (fire.destroy) fire.destroy();
    });
    this._track(fire, 950);

    // Scorch mark
    this.scorchMark(x, y);

    // Screen shake
    this.scene.cameras.main.shake(200, 0.01);
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
