// Phaser ability bridge (P2-06 slice).
//
// Wraps the renderer-neutral MeteorCall and ChronoCharge from src/js/
// and exposes them to Phaser scenes. Handles targeting state, telegraph
// presentation, and availability indicators without duplicating the
// Canvas ability rules. The actual blast/rewind mechanics live in the
// Canvas classes; this bridge only drives them from Phaser and publishes
// a small runtime contract for tests and HUDs.

import { MeteorCall, METEOR } from '../js/meteor.js';
import { ChronoCharge } from '../js/chrono.js';
import { EVENT_TYPE } from '../game/game-events.js';

export class AbilityBridge {
  // options:
  //   controller: game controller for emitting events
  //   scene: Phaser scene for rendering telegraphs
  //   enemies: array of live enemies (passed to meteor blast)
  //   towers: array of live towers (passed to chrono rewind)
  //   projectiles: array of live projectiles (cleared on rewind)
  //   fx: FX instance for visual effects
  constructor(options = {}) {
    this.controller = options.controller || null;
    this.scene = options.scene || null;
    this.enemies = options.enemies || [];
    this.towers = options.towers || [];
    this.projectiles = options.projectiles || [];
    this.fx = {
      explosion() {},
      shake() {},
      scorch() {},
      rewindFlash() {},
      ...(options.fx || {}),
    };
    this._audio = options.audio || null;
    this._fxSystem = options.fxSystem || null;

    this.meteor = new MeteorCall();
    this.chrono = new ChronoCharge();

    this.meteorTargeting = false;
    this.meteorReticle = null;
    this.meteorShadow = null;
    this.meteorRock = null;
    this.meteorTrail = null;

    this.chronoMeter = null;
    this.chronoReady = false;

    // Test hooks: track reticle and target positions for regression assertions
    this._reticlePos = { x: 0, y: 0 };
    this._lastImpactPos = null;

    this._createPresentation();
  }

  _createPresentation() {
    if (!this.scene) return;

    // Meteor targeting reticle (hidden until targeting starts)
    this.meteorReticle = this.scene.add.graphics().setDepth(100);
    this.meteorReticle.setVisible(false);

    // Meteor telegraph shadow (grows during fall)
    this.meteorShadow = this.scene.add.graphics().setDepth(99);
    this.meteorShadow.setVisible(false);

    // Falling meteor rock
    this.meteorRock = this.scene.add.graphics().setDepth(101);
    this.meteorRock.setVisible(false);

    // Fire trail behind meteor
    this.meteorTrail = this.scene.add.graphics().setDepth(100);
    this.meteorTrail.setVisible(false);

    // P3-05: track last meteor target for impact FX
    this._lastMeteorTarget = null;

    // Chrono charge meter (top-right HUD)
    this.chronoMeter = this.scene.add.graphics().setDepth(200);
  }

  // Start meteor targeting mode (player can click to place target)
  startMeteorTargeting() {
    if (!this.meteor.ready) return false;
    this.meteorTargeting = true;
    this.meteorReticle?.setVisible(true);
    return true;
  }

  // Cancel meteor targeting without firing
  cancelMeteorTargeting() {
    this.meteorTargeting = false;
    this.meteorReticle?.setVisible(false);
  }

  // Update reticle position during targeting
  updateMeteorReticle(x, y) {
    if (!this.meteorTargeting || !this.meteorReticle) return;
    this._reticlePos = { x, y };
    this.meteorReticle.clear();
    this.meteorReticle.lineStyle(2, 0xe0a458, 0.35);
    this.meteorReticle.strokeCircle(x, y, METEOR.radius);
  }

  // Fire meteor at target coordinates
  fireMeteor(x, y) {
    if (!this.meteorTargeting) return false;
    const fired = this.meteor.fire(x, y);
    if (fired) {
      this.meteorTargeting = false;
      this.meteorReticle?.setVisible(false);
      this._lastMeteorTarget = { x, y };
      this._lastImpactPos = { x, y };
      // P3-05: FX + audio
      this._fxSystem?.meteorTelegraph(x, y);
      this._audio?.play('fx-meteorTelegraph');
      if (this.controller) {
        this.controller.emit(EVENT_TYPE.METEOR_TARGETED, { x, y });
      }
      this._meteorWasFalling = true;
    }
    return fired;
  }

  // Activate chrono rewind (if ready)
  activateChrono() {
    if (!this.chrono.ready) return false;
    const activated = this.chrono.activate(this.enemies, this.towers, this.fx, this.projectiles);
    // P3-05: FX + audio
    if (activated) {
      const target = this.enemies.length ? this.enemies[0] : null;
      if (target) {
        this._fxSystem?.chronoRing(target.x, target.y);
      }
      this._audio?.play('fx-chronoActivate');
    }
    if (activated && this.controller) {
      this.controller.emit(EVENT_TYPE.CHRONO_REWOUND, {});
    }
    return activated;
  }

  // Call every frame from Phaser scene update
  update(dt) {
    // Update meteor cooldown and telegraph
    this.meteor.update(dt, this.enemies, this.fx, null);

    // Check if meteor just impacted — trigger FX + audio on impact
    if (this._meteorWasFalling && !this.meteor.target) {
      // Impact position is the last stored target (meteor.fire clears it)
      if (this._lastMeteorTarget) {
        this._fxSystem?.meteorImpact(this._lastMeteorTarget.x, this._lastMeteorTarget.y);
        this._audio?.play('fx-meteorImpact');
        this._fxSystem?.shake(0.01, 200);
      }
      if (this.controller) {
        this.controller.emit(EVENT_TYPE.METEOR_IMPACTED, {});
      }
    }
    this._meteorWasFalling = !!this.meteor.target;

    // Update chrono charge from enemy leaks (handled externally via onLeak)
    // and cooldown
    this.chrono.tick(dt, this.enemies, this.towers);

    // Update presentation
    this._updateMeteorPresentation();
    this._updateChronoPresentation();
  }

  _updateMeteorPresentation() {
    if (!this.scene || !this.meteor.target) {
      this.meteorShadow?.setVisible(false);
      this.meteorRock?.setVisible(false);
      this.meteorTrail?.setVisible(false);
      return;
    }

    const { x, y, t } = this.meteor.target;
    const prog = Math.min(1, t / METEOR.telegraph);

    // Telegraph shadow (grows)
    this.meteorShadow.setVisible(true);
    this.meteorShadow.clear();
    const shadowR = 12 + (METEOR.radius * 0.55 - 12) * prog;

    // Radial gradient shadow
    this.meteorShadow.fillStyle(0x000000, 0.55 * (1 - prog * 0.3));
    this.meteorShadow.fillCircle(x, y, shadowR);
    this.meteorShadow.lineStyle(2, 0xff8a3c, 0.35 * prog);
    this.meteorShadow.strokeCircle(x, y, shadowR * 0.85);

    // Impact reticle (dashed circle)
    this.meteorShadow.lineStyle(3, 0xe0a458, 0.5 + 0.4 * prog);
    this.meteorShadow.strokeCircle(x, y, METEOR.radius);

    // Crosshair ticks
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const inner = METEOR.radius - 14;
      const outer = METEOR.radius - 2;
      this.meteorShadow.lineBetween(
        x + Math.cos(a) * inner, y + Math.sin(a) * inner,
        x + Math.cos(a) * outer, y + Math.sin(a) * outer
      );
    }

    // Falling meteor rock
    const mx = x + (1 - prog) * 160;
    const my = y - (1 - prog) * 420;
    const size = 10 + 14 * prog;

    this.meteorRock.setVisible(true);
    this.meteorRock.clear();
    this.meteorRock.fillStyle(0x5a4636, 1);
    this.meteorRock.fillCircle(mx, my, size);
    this.meteorRock.lineStyle(3, 0xe07a3a, 1);
    this.meteorRock.strokeCircle(mx, my, size);

    // Fire trail
    this.meteorTrail.setVisible(true);
    this.meteorTrail.clear();
    this.meteorTrail.lineStyle(6, 0xffb450, 0.7 * prog);
    this.meteorTrail.lineBetween(mx - 18, my - 130, mx, my);
  }

  _updateChronoPresentation() {
    if (!this.scene || !this.chronoMeter) return;

    this.chronoMeter.clear();
    const pct = this.chrono.pct;
    const ready = this.chrono.ready;

    // Charge bar (top-right)
    const barX = 1100;
    const barY = 20;
    const barW = 140;
    const barH = 24;

    // Background
    this.chronoMeter.fillStyle(0x000000, 0.6);
    this.chronoMeter.fillRect(barX, barY, barW, barH);

    // Fill
    const fillColor = ready ? 0x6fe3c1 : 0x4a7a6a;
    this.chronoMeter.fillStyle(fillColor, 0.9);
    this.chronoMeter.fillRect(barX + 2, barY + 2, (barW - 4) * pct, barH - 4);

    // Border
    const borderColor = ready ? 0x6fe3c1 : 0x3a5a4a;
    this.chronoMeter.lineStyle(2, borderColor, 1);
    this.chronoMeter.strokeRect(barX, barY, barW, barH);

    // Label
    this.chronoMeter.fillStyle(0xffffff, 1);
    this.chronoMeter.fillRect(barX + 6, barY + 6, 2, barH - 12);

    this.chronoReady = ready;
  }

  // Notify chrono of an enemy leak (charges the meter)
  onEnemyLeak(enemy) {
    this.chrono.onLeak(enemy);
  }

  // Runtime state for tests and HUDs
  state() {
    return {
      meteor: {
        charges: this.meteor.charges,
        maxCharges: METEOR.maxCharges,
        cooldown: this.meteor.cooling,
        targeting: this.meteorTargeting,
        ready: this.meteor.ready,
        hasTarget: !!this.meteor.target,
        reticlePos: this._reticlePos,
        lastImpactPos: this._lastImpactPos,
      },
      chrono: {
        charge: this.chrono.charge,
        pct: this.chrono.pct,
        ready: this.chrono.ready,
        cooldown: this.chrono.cooldown,
      },
    };
  }

  dispose() {
    this.meteorReticle?.destroy();
    this.meteorShadow?.destroy();
    this.meteorRock?.destroy();
    this.meteorTrail?.destroy();
    this.chronoMeter?.destroy();
  }
}

// Install a global runtime contract handle so tests and HUDs can read it
// without importing the module. Matches the project's existing
// __jura*Contract pattern.
export function installAbilityBridgeContract(bridge) {
  const contract = {
    get meteorCharges() { return bridge.meteor.charges; },
    get meteorMaxCharges() { return METEOR.maxCharges; },
    get meteorCooldown() { return bridge.meteor.cooling; },
    get meteorTargeting() { return bridge.meteorTargeting; },
    get meteorReady() { return bridge.meteor.ready; },
    get chronoCharge() { return bridge.chrono.charge; },
    get chronoPct() { return bridge.chrono.pct; },
    get chronoReady() { return bridge.chrono.ready; },
    get chronoCooldown() { return bridge.chrono.cooldown; },
    state: () => bridge.state(),
    startMeteorTargeting: () => bridge.startMeteorTargeting(),
    cancelMeteorTargeting: () => bridge.cancelMeteorTargeting(),
    fireMeteor: (x, y) => bridge.fireMeteor(x, y),
    activateChrono: () => bridge.activateChrono(),
    onEnemyLeak: (enemy) => bridge.onEnemyLeak(enemy),
    update: (dt) => bridge.update(dt),
    dispose: () => bridge.dispose(),
  };
  globalThis.__juraAbilityBridge = contract;
  return contract;
}
