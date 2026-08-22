import Phaser from 'phaser';
import { EVENT_TYPE, createGameEvent } from '../../game/game-events.js';

/**
 * MeteorTargetingSystem — handles meteor strike targeting, preview,
 * and impact.  Only active when state.meteorTargeting is true.
 *
 * Workflow:
 *   1. Player clicks a tower while in meteor targeting mode.
 *   2. System shows a preview circle (the impact zone).
 *   3. Player clicks anywhere on the map to confirm the strike point.
 *   4. System emits METEOR_TARGETED → after a short delay emits METEOR_IMPACTED.
 */
export default class MeteorTargetingSystem extends Phaser.Scene {
  constructor() {
    super('MeteorTargetingSystem');
    this.previewCircle = null;
    this.impactCircle = null;
    this.impactTimer = null;
    this.targetingActive = false;
    this.previewActive = false;
    this.impactPoint = null;
    this.tower = null;
    this.emitter = null;
    this.impactRadius = 80; // px — the strike zone radius
  }

  setEmitter(emitter) {
    this.emitter = emitter;
  }

  /**
   * Called from PlaygroundScene when meteorTargeting is toggled on/off
   */
  setTargetingActive(active) {
    this.targetingActive = active;
    if (!active) {
      this.clearPreview();
      this.clearImpact();
    }
  }

  /**
   * Start targeting mode — player must select a tower first
   */
  startTargeting(tower) {
    if (!this.targetingActive) return;
    this.tower = tower;
    this.previewActive = true;
    // Highlight the selected tower
    if (this.tower.sprite && this.tower.sprite.setTint) {
      this.tower.sprite.setTint(0xffff00);
    }
    // Show preview of impact zone
    const worldX = this.tower.sprite?.x ?? tower.worldX;
    const worldY = this.tower.sprite?.y ?? tower.worldY;
    this.showPreview(worldX, worldY);
  }

  /**
   * Show a semi-transparent preview circle at the given point
   */
  showPreview(x, y) {
    if (this.previewCircle) {
      this.previewCircle.destroy();
    }
    this.previewCircle = this.add.circle(x, y, this.impactRadius, 0xff4400, 0.3);
    this.previewCircle.setStrokeStyle(3, 0xff6600);
    // Pulsing animation
    this.tweens.add({
      targets: this.previewCircle,
      alpha: 0.5,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    // Also show a dashed ring
    const ring = this.add.graphics();
    ring.lineStyle(2, 0xff6600, 0.6);
    ring.strokeCircle(x, y, this.impactRadius);
    ring.setAlpha(0.6);
    this.tweens.add({
      targets: ring,
      alpha: 0.9,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });
    this.previewCircle._ring = ring;
  }

  /**
   * Player has confirmed the strike point — emit METEOR_TARGETED
   * then schedule impact after delay
   */
  confirmStrike(pointX, pointY) {
    if (!this.tower || !this.targetingActive) return;
    this.clearPreview();

    this.impactPoint = { x: pointX, y: pointY };
    const radius = this.impactRadius;

    // Emit targeting event
    if (this.emitter) {
      const targetingEvent = {
        type: EVENT_TYPE.METEOR_TARGETED,
        payload: {
          x: pointX,
          y: pointY,
          radius,
          towerId: this.tower.id || 'unknown',
        },
        at: this.emitter.getTime(),
      };
      this.emitter.emit(EVENT_TYPE.METEOR_TARGETED, targetingEvent);
    }

    // Visual: show impact zone (slightly larger, red flash)
    const impactCircle = this.add
      .circle(pointX, pointY, radius * 1.2, 0xff0000, 0.4)
      .setStrokeStyle(4, 0xff4400);
    this.tweens.add({
      targets: impactCircle,
      alpha: 0.7,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 400,
      yoyo: true,
      repeat: 1,
    });
    this.impactCircle = impactCircle;

    // Schedule actual impact after short delay
    const impactDelay = 600; // ms — gives player time to see the preview
    this.impactTimer = this.time.delayedCall(impactDelay, () => {
      this.resolveImpact(pointX, pointY, radius);
    });
  }

  /**
   * Resolve meteor impact — emit METEOR_IMPACTED and clean up
   */
  resolveImpact(x, y, radius) {
    this.clearImpact();

    // Visual: impact explosion
    const explosion = this.add
      .circle(x, y, radius * 0.8, 0xffaa00, 0.6)
      .setStrokeStyle(6, 0xffffff);
    this.tweens.add({
      targets: explosion,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 300,
      onComplete: () => explosion.destroy(),
    });
    // Particles
    const particles = this.add.particles(x, y, 'portal', {
      speed: { min: 50, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      blendMode: 'ADD',
      lifespan: 500,
      tint: [0xff4400, 0xffaa00, 0xff0000],
      quantity: 30,
    });
    this.tweens.add({
      targets: particles,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        particles.destroy();
      },
    });

    // Emit impact event
    if (this.emitter) {
      const impactEvent = {
        type: EVENT_TYPE.METEOR_IMPACTED,
        payload: {
          x,
          y,
          radius,
        },
        at: this.emitter.getTime(),
      };
      this.emitter.emit(EVENT_TYPE.METEOR_IMPACTED, impactEvent);
    }
    this.impactPoint = null;
  }

  clearPreview() {
    if (this.previewCircle) {
      if (this.previewCircle._ring) this.previewCircle._ring.destroy();
      this.previewCircle.destroy();
      this.previewCircle = null;
    }
    this.previewActive = false;
  }

  clearImpact() {
    if (this.impactTimer) {
      this.impactTimer.remove();
      this.impactTimer = null;
    }
    if (this.impactCircle) {
      this.impactCircle.destroy();
      this.impactCircle = null;
    }
  }

  destroy() {
    super.destroy();
    this.clearPreview();
    this.clearImpact();
    if (this.impactTimer) this.impactTimer.remove();
  }
}
