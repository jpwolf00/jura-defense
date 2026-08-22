/**
 * HUD Panel — top-right display of lives, money, wave, and speed.
 *
 * Reads from __juraWaveBridge (the WaveBridge contract) every frame.
 * All objects are Phaser primitives; none are DOM.
 * Destroyed on scene shutdown via scene.events.once('shutdown').
 *
 * P3-06: Accessibility — non-color status indicators, readable text,
 *         and a visible mute toggle button for audio control.
 */

import Phaser from 'phaser';

// Tower type accent colors (hex) — mirrors TOWER_TYPES from js/tower.js
const TOWER_COLORS = {
  tranq: '#5aa0c8',
  drone: '#c8b05a',
  fence: '#58c8a0',
  heli:  '#b05858',
  chrono:'#8a58c8',
};

// P3-06: Status indicators that work without color.
// Each status has a text badge, a shape marker, and a color accent.
const STATUS_INDICATORS = {
  lowLives:  { badge: '⚠', color: '#ef5350', label: 'LOW LIVES' },
  lowMoney:  { badge: '$', color: '#e0a458', label: 'LOW FUNDS' },
  paused:    { badge: '⏸', color: '#ffca28', label: 'PAUSED' },
  victory:   { badge: '🏆', color: '#6fbf73', label: 'VICTORY' },
  defeat:    { badge: '💀', color: '#ef5350', label: 'DEFEAT' },
  meteorReady:  { badge: '☄️', color: '#e0a458', label: 'METEOR READY' },
  chronoReady:  { badge: '⏳', color: '#6fe3c1', label: 'REWIND READY' },
  muted:    { badge: '🔇', color: '#9e9e9e', label: 'MUTED' },
  unmuted:  { badge: '🔊', color: '#6fe3c1', label: 'UNMUTED' },
};

export class HUDPanel {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this._scene = scene;
    this._group = scene.add.container(0, 0);
    this._group.setScrollFactor(0).setDepth(60);
    this._active = false;
    // S07: Persist mute state globally across scene transitions
    this._muted = globalThis.__juraMuted ?? false;

    this.livesText  = this._hudLabel('♥ ', 16);
    this.moneyText  = this._hudLabel('$ ', 16);
    this.waveText   = this._hudLabel('WAVE', 14);
    this.speedText  = this._hudLabel('1×', 14);
    this.pauseText  = null;   // optional, created when pause is needed

    // P3-06: Status badge — shows non-color status above the HUD panel.
    this._statusBadge = this._scene.add.text(0, 0, '', {
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(62).setVisible(false);

    // P3-06: Mute button — top-right corner, 48x48 touch target.
    this._muteBtn = this._makeMuteButton();

    // Expose for test contract
    this._group.setData('hud', {
      get lives()     { return this.livesText.text; },
      get money()     { return this.moneyText.text; },
      get wave()      { return this.waveText.text; },
      get speed()     { return this.speedText.text; },
      get muted()     { return this._muted; },
      get statusText(){ return this._statusBadge.text; },
    });
  }

  /** P3-06: Create a mute toggle button with explicit 48px hit area. */
  _makeMuteButton() {
    const scene = this._scene;
    const s = scene._uiScale?.() ?? 1;
    const btnSize = Math.max(48, 48 * s); // WCAG 2.5.5 minimum 48px
    const pad = 8 * s;
    const x = scene.scale.width - pad;
    const y = 10 * s;

    const bg = scene.add.rectangle(x, y, btnSize, btnSize, 0x17231d, 0.85)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setStrokeStyle(2, 0x6fe3c1, 0.4)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, btnSize, btnSize), Phaser.Geom.Rectangle.Contains);

    const icon = scene.add.text(x, y, '🔊', {
      fontSize: `${Math.max(14, 18 * s)}px`,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(62);

    const label = scene.add.text(x, y + btnSize + 4 * s, 'MUTE', {
      fontSize: `${Math.max(9, 10 * s)}px`,
      color: '#9e9e9e',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(62);

    const btn = scene.add.container(x, y);
    btn.add([bg, icon, label]);
    btn.setSize(btnSize, btnSize).setScrollFactor(0);
    btn.setInteractive(new Phaser.Geom.Rectangle(-btnSize / 2, -btnSize / 2, btnSize, btnSize), Phaser.Geom.Rectangle.Contains);

    btn.on('pointerover', () => bg.setTint(0x2a3a30));
    btn.on('pointerout', () => bg.clearTint());
    btn.on('pointerdown', () => {
      this._toggleMute();
    });

    scene.events.once('shutdown', () => { btn.destroy(); });
    return btn;
  }

  /** P3-06: Toggle mute state and update the button icon. */
  _toggleMute() {
    this._muted = !this._muted;
    // S07: Persist mute state globally
    globalThis.__juraMuted = this._muted;
    const icon = this._muteBtn?.children?.[1];
    if (icon) {
      icon.setText(this._muted ? '🔇' : '🔊');
    }
    this._scene.audioSystem?.setGlobalMute(this._muted);
    this._showStatus(this._muted ? STATUS_INDICATORS.muted : STATUS_INDICATORS.unmuted);
    this._scene.time.delayedCall(1500, () => {
      if (!this._muted) this._hideStatus();
    });
  }

  /** P3-06: Show a status badge with a brief flash. */
  _showStatus(indicator) {
    this._statusBadge.setText(`${indicator.badge} ${indicator.label}`);
    this._statusBadge.setColor(indicator.color);
    this._statusBadge.setVisible(true);
  }

  _hideStatus() {
    this._statusBadge.setVisible(false);
  }

  /* ── helpers ──────────────────────────────────────────────────────── */

  _hudLabel(base, fontSize) {
    const s = this._scene._uiScale?.() ?? 1;
    const fs = Math.max(10, fontSize * s);
    const text = this._scene.add.text(0, 0, base, {
      fontSize: `${fs}px`,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(61);
    return text;
  }

  _pos() {
    const ui = this._scene._uiScale?.() ?? 1;
    return {
      x: Math.round(this._scene.scale.width - 220 * ui),
      y: Math.round(130 * ui),
    };
  }

  /* ── rendering ────────────────────────────────────────────────────── */

  /** Position the status badge at top-right of HUD panel. */
  _positionStatusBadge() {
    if (!this._statusBadge || !this._active) return;
    const pos = this._pos();
    const s = this._scene._uiScale?.() ?? 1;
    this._statusBadge.setPosition(pos.x, pos.y - 20 * s);
  }

  /** Attach to a container for background painting (caller paints bg). */
  attachTo(container) {
    const pos = this._pos();
    this._group.setPosition(pos.x, pos.y);
    this._group.add(this.livesText);
    this._group.add(this.moneyText);
    this._group.add(this.waveText);
    this._group.add(this.speedText);
    this._active = true;
    this._positionStatusBadge();
    return this;
  }

  /** Draw a semi-transparent background behind the panel. */
  paintBackground(fill = 0x17231d, alpha = 0.85, padding = 14, radius = 6) {
    const s = this._scene._uiScale?.() ?? 1;
    // Size: ~190px wide, ~50px tall, scaled
    const w = 190 * s + padding * 2;
    const h = 50 * s + padding * 2;
    const pos = this._pos();
    // Already positioned the group at top-right; background at same corner
    this._bg = this._scene.add.rectangle(pos.x, pos.y, w, h, fill, alpha)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(55)
      .setStrokeStyle(2, 0x6fe3c1, 0.4);
    // Use a custom shape for rounded rect (Phaser 3.x)
    this._group?.setDepth(55);
  }

  /** Update all HUD values from the current wave bridge state. */
  update() {
    if (!this._active) return;
    const bridge = globalThis.__juraWaveBridge;
    if (!bridge || !bridge.state) return;
    const st = bridge.state();

    this.livesText.setText(`♥ ${st.lives}`);
    this.livesText.setColor(st.lives <= 5 ? '#ef5350' : '#ffffff');
    this.moneyText.setText(`$ ${st.money}`);
    this.moneyText.setColor('#e0a458');
    this.waveText.setText(`WAVE ${st.waveNumber}/${st.totalWaves}`);
    this.speedText.setText(`${st.timeScale}×`);
    this.speedText.setColor(st.timeScale >= 2 ? '#e0a458' : '#ffffff');
  }

  /** Set pause label on the HUD (called by the scene). */
  setPauseLabel(label) {
    if (!this.pauseText) {
      const s = this._scene._uiScale?.() ?? 1;
      this.pauseText = this._scene.add.text(0, 0, label, {
        fontSize: `${Math.max(10, 14 * s)}px`,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(62);
      this._group?.add(this.pauseText);
    }
    this.pauseText.setText(label);
    this.pauseText.setVisible(true);
  }

  hidePause() {
    if (this.pauseText) this.pauseText.setVisible(false);
  }

  /** Destroy all objects owned by this panel. */
  destroy() {
    if (this._group) this._group.destroy();
    this._active = false;
  }
}
