/**
 * Overlay UI — tower inspection panel, wave countdown, and first-run
 * onboarding overlay.
 *
 * All objects are Phaser primitives; none are DOM.
 * Destroyed on scene shutdown via scene.events.once('shutdown').
 *
 * P3-06: All interactive elements have explicit stroke outlines,
 *        sufficient touch targets (≥ 44 px), and text stroke for
 *        contrast at any scale.
 */

import Phaser from 'phaser';

/* ──────────────────────────────────────────────────────────────────── */
/* Wave Countdown                                                         */
/* ──────────────────────────────────────────────────────────────────── */

export class WaveCountdown {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this._scene = scene;
    this._group = scene.add.container(0, 0);
    this._group.setScrollFactor(0).setDepth(150);
    this._active = false;

    this._bg = scene.add.rectangle(640, 360, 600, 200, 0x000000, 0.5)
      .setScrollFactor(0).setDepth(140);

    this.titleText = scene.add.text(640, 310, '', {
      fontSize: '48px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(151);

    this.timerText = scene.add.text(640, 370, '', {
      fontSize: '36px',
      color: '#e0a458',
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(151);

    this._scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  /** Show countdown for `seconds` before returning to `onComplete`. */
  start(seconds, onComplete) {
    this._active = true;
    this._group.setVisible(true);
    this._bg.setVisible(true);
    this.titleText.setVisible(true);
    this.timerText.setVisible(true);

    let remaining = seconds;
    this.titleText.setText('WAVE INCOMING');
    this.timerText.setText(`${remaining}`);

    this._countdownTimer = this._scene.time.addEvent({
      delay: 1000,
      repeat: seconds - 1,
      callback: () => {
        remaining--;
        this.timerText.setText(`${remaining}`);
      },
      callbackScope: this,
    });

    this._scene.time.delayedCall(seconds * 1000, () => {
      this.stop();
      if (onComplete) onComplete();
    });
  }

  stop() {
    if (this._countdownTimer) {
      this._countdownTimer.removeCallback();
      this._countdownTimer = null;
    }
    this._active = false;
    this._group.setVisible(false);
    this._bg.setVisible(false);
    this.titleText.setVisible(false);
    this.timerText.setVisible(false);
  }

  destroy() {
    if (this._countdownTimer) this._countdownTimer.removeCallback();
    this.stop();
    this._group.destroy();
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/* Tower Inspection Panel                                                 */
/* ──────────────────────────────────────────────────────────────────── */

export class TowerInspectionPanel {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this._scene = scene;
    this._group = scene.add.container(0, 0);
    this._group.setScrollFactor(0).setDepth(120);
    this._visible = false;
    this._slideTween = null;

    // Background panel with P3-06: thicker stroke for contrast
    this._bg = scene.add.rectangle(0, 0, 280, 260, 0x17231d, 0.92)
      .setScrollFactor(0)
      .setStrokeStyle(3, 0x6fe3c1, 0.6);

    this._border = scene.add.rectangle(0, 0, 284, 264, 0x000000, 0)
      .setScrollFactor(0)
      .setStrokeStyle(4, 0x6fe3c1, 0.7);

    // Title
    this.titleText = scene.add.text(0, -110, '', {
      fontSize: '18px',
      color: '#e0a458',
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(121);

    // Stats — P3-06: increased stroke thickness for readability
    this.statsText = scene.add.text(-120, -80, '', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      padding: { x: 6, y: 3 },
    }).setScrollFactor(0).setOrigin(0, 0.5).setDepth(121);

    // Upgrade button — S07: minimum 44px touch target
    this._upgradeBtn = this._makeButton(0, 30, 120, 44, 'UPGRADE', 0x2a5a3a, 0x6fe3c1);
    this._upgradeBtn.on('pointerdown', () => {
      if (this._scene._onUpgrade) this._scene._onUpgrade();
    });
    this._upgradeBtn.on('pointerover', () => this._upgradeBtn.setFillStyle(0x3a7a4a));
    this._upgradeBtn.on('pointerout', () => this._upgradeBtn.setFillStyle(0x2a5a3a));

    // Sell button — S07: minimum 44px touch target
    this._sellBtn = this._makeButton(0, -30, 120, 44, 'SELL', 0x5a2a2a, 0xef5350);
    this._sellBtn.on('pointerdown', () => {
      if (this._scene._onSell) this._scene._onSell();
    });
    this._sellBtn.on('pointerover', () => this._sellBtn.setFillStyle(0x7a3a3a));
    this._sellBtn.on('pointerout', () => this._sellBtn.setFillStyle(0x5a2a2a));

    // Close button (X in top-left) — S07: minimum 44px touch target
    this._closeBtn = scene.add.container(130, -120);
    this._closeBtn.setSize(44, 44).setScrollFactor(0);
    this._closeBg = scene.add.rectangle(0, 0, 44, 44, 0x17231d, 0.7)
      .setStrokeStyle(2, 0xef5350, 0.6);
    this._closeLabel = scene.add.text(0, 0, '✕', {
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this._closeBtn.add([this._closeBg, this._closeLabel]);
    this._closeBtn.setInteractive(new Phaser.Geom.Rectangle(-22, -22, 44, 44), Phaser.Geom.Rectangle.Contains);
    this._closeBtn.on('pointerdown', () => this.hide());
    this._closeBtn.on('pointerover', () => {
      this._closeBg.setTint(0x5a2020);
      this._closeLabel.setColor('#ef5350');
    });
    this._closeBtn.on('pointerout', () => {
      this._closeBg.clearTint();
      this._closeLabel.setColor('#ffffff');
    });

    this._bg.setOrigin(0.5);
    this._border.setOrigin(0.5);
    this._group.add([this._bg, this._border, this.titleText, this.statsText, this._upgradeBtn, this._sellBtn, this._closeBtn]);
    this._group.setVisible(false);

    this._scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  _makeButton(x, y, w, h, text, fill, stroke) {
    const scene = this._scene;
    const btn = scene.add.container(x, y).setSize(w, h).setScrollFactor(0);
    const bg = scene.add.rectangle(0, 0, w, h, fill)
      .setStrokeStyle(2, stroke)
      .setOrigin(0.5);
    const label = scene.add.text(0, 0, text, {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1);
    btn._bg = bg;
    btn.add([bg, label]);
    btn.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    btn.setFillStyle = (...args) => { bg.setFillStyle(...args); return btn; };
    btn.clearTint = () => { bg.clearTint(); return btn; };
    btn.on('pointerover', () => bg.setTint(0xffffff));
    btn.on('pointerout', () => bg.clearTint());
    return btn;
  }

  /** Position and populate the panel for a given tower. */
  show(towerRef) {
    const scene = this._scene;
    const ui = scene._uiScale?.() ?? 1;

    if (!towerRef) {
      this.hide();
      return;
    }

    // Position near the tower but NEVER cover the route corridor or clip edges
    // Route corridor is roughly in the middle third of the screen
    const screenW = scene.scale.width;
    const screenH = scene.scale.height;
    const panelW = 280;
    const panelH = 260;
    
    // Determine if tower is on left or right side of screen
    const towerX = towerRef.x || 0;
    const towerY = towerRef.y || 0;
    
    // Route corridor is approximately between 30% and 70% of screen width
    const routeLeft = screenW * 0.3;
    const routeRight = screenW * 0.7;
    const isTowerInRoute = towerX >= routeLeft && towerX <= routeRight;
    
    // Position panel: if tower is in route area, flip to opposite side
    // Otherwise, place panel on the side closer to the tower
    let px;
    if (isTowerInRoute) {
      // Tower is in route corridor — place panel on opposite side from tower's x position
      px = towerX < screenW / 2 ? screenW - panelW / 2 - 20 * ui : panelW / 2 + 20 * ui;
    } else {
      // Tower is outside route — place panel on same side as tower
      px = towerX < screenW / 2 ? panelW / 2 + 20 * ui : screenW - panelW / 2 - 20 * ui;
    }
    
    // Clamp vertical position to avoid clipping top/bottom edges
    const py = Math.max(panelH / 2 + 10 * ui, Math.min(screenH - panelH / 2 - 10 * ui, towerY));

    this._towerRef = towerRef;
    const tt = towerRef.t;
    const name = tt ? tt.name : 'TOWER';
    const dmg = towerRef.dmg != null ? towerRef.dmg.toFixed(0) : '—';
    const rng = towerRef.range != null ? towerRef.range.toFixed(0) : '—';
    const rate = towerRef.t?.rate != null ? towerRef.t.rate.toFixed(2) : '—';
    const lvl = towerRef.level || 1;

    if (!this._visible) {
      this._group.setVisible(true);
      this._visible = true;
    }

    this._group.setPosition(px, py);

    this.titleText.setText(name);
    this.titleText.setPosition(0, -110);

    this.statsText.setText(`Lv ${lvl}  |  DMG ${dmg}  |  RNG ${rng}  |  ${rate}s`);
    this.statsText.setPosition(-120, -80);

    // Upgrade button
    const canUpgrade = towerRef.canUpgrade?.() || (lvl < 5);
    this._upgradeBtn.setPosition(0, 35);
    this._upgradeBtn.setAlpha(canUpgrade ? 1 : 0.4);
    this._upgradeBtn.children[1].setAlpha(canUpgrade ? 1 : 0.4);
    if (!canUpgrade) {
      this._upgradeBtn.children[1].setText('MAX');
    } else {
      const upgCost = towerRef.upgradeCost?.();
      this._upgradeBtn.children[1].setText(upgCost != null ? `UPG $${upgCost}` : 'UPGRADE');
    }

    // Sell button
    const sellVal = towerRef.sellValue?.();
    this._sellBtn.setPosition(0, -35);
    this._sellBtn.children[1].setText(sellVal != null ? `SELL $${sellVal}` : 'SELL');
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    this._group.setVisible(false);
    if (this._slideTween) {
      this._slideTween.stop();
      this._slideTween = null;
    }
  }

  setTowerRef(tower) {
    this._towerRef = tower;
  }

  destroy() {
    this.hide();
    this._group.destroy();
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/* Onboarding Overlay                                                     */
/* ──────────────────────────────────────────────────────────────────── */

export class OnboardingOverlay {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this._scene = scene;
    this._group = scene.add.container(0, 0);
    this._group.setScrollFactor(0).setDepth(160);
    this._dismissed = false;

    this._bg = scene.add.rectangle(640, 360, 900, 500, 0x000000, 0.55)
      .setScrollFactor(0).setDepth(155);

    this._panel = scene.add.rectangle(640, 340, 500, 320, 0x17231d, 0.95)
      .setScrollFactor(0).setStrokeStyle(3, 0x6fe3c1, 0.6).setDepth(156);

    this.titleText = scene.add.text(640, 210, 'WELCOME TO JURA DEFENSE', {
      fontSize: '24px',
      color: '#e0a458',
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(157);

    this.bodyText = scene.add.text(640, 260, '', {
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'left',
      padding: { x: 10, y: 5 },
    }).setScrollFactor(0).setOrigin(0.5).setDepth(157);

    // P3-06: Dismiss button with explicit stroke border and large touch target
    // Use a container so pointerover/out can tint the background rect.
    this.dismissBtn = scene.add.container(640, 430).setSize(200, 50).setScrollFactor(0);
    this._dismissBtnBg = scene.add.rectangle(0, 0, 200, 50, 0x2a5a3a, 0.9)
      .setStrokeStyle(3, 0x6fe3c1);
    this.dismissLabel = scene.add.text(0, 0, 'BEGIN DEFENSE', {
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.dismissBtn.add([this._dismissBtnBg, this.dismissLabel]);
    this.dismissBtn.setInteractive(new Phaser.Geom.Rectangle(-100, -25, 200, 50), Phaser.Geom.Rectangle.Contains);

    this.dismissBtn.on('pointerdown', () => this.dismiss());
    this.dismissBtn.on('pointerover', () => this._dismissBtnBg.setTint(0x3a7a4a));
    this.dismissBtn.on('pointerout', () => this._dismissBtnBg.clearTint());

    this._group.add([this._bg, this._panel, this.titleText, this.bodyText, this.dismissBtn]);
    this._group.setVisible(true);

    this._scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  dismiss() {
    this._dismissed = true;
    this._group.setVisible(false);
    this._scene.events.emit('onboarding-dismissed');
  }

  isDismissed() {
    return this._dismissed;
  }

  /** Check if this overlay should show (first run, not yet dismissed). */
  shouldShow() {
    return !this._dismissed;
  }

  destroy() {
    this._group.setVisible(false);
    this._group.destroy();
  }
}
