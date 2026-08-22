import Phaser from 'phaser';
import PathLayer from './world/path-layer.js';
import TerrainLayer from './world/terrain-layer.js';
import { Enemy } from '../js/enemy.js';
import EnemySprite from './entities/enemy-sprite.js';
import { Tower } from '../js/tower.js';
import TowerSprite from './entities/tower-sprite.js';
import CombatBridge from './combat-bridge.js';
import { AbilityBridge, installAbilityBridgeContract } from './ability-bridge.js';
import { WaveBridge, installWaveBridgeContract } from './wave-bridge.js';
import { TOWER_TYPES } from '../js/tower.js';
import FXSystem, { addFXSystem } from './systems/FXSystem.js';
import AudioSystem, { addAudioSystem } from './systems/AudioSystem.js';
import { HUDPanel } from './ui/hud-panel.js';
import { TowerShelf } from './ui/tower-shelf.js';
import { TowerInspectionPanel, OnboardingOverlay } from './ui/overlay-ui.js';

export default class PlaygroundScene extends Phaser.Scene {
  constructor() { super('PlaygroundScene'); }

  // ── Responsive UI helpers ──────────────────────────────────────────────
  //
  // The canonical canvas is 1280×720.  When the browser resizes to a narrow
  // or portrait viewport the Phaser config switches to RESIZE mode, so
  // scene.scale.width/height reflect actual viewport pixels.
  //
  // `uiScale` is the factor to multiply HUD sizes by so font/text elements
  // stay legible on small screens.  Values < 1 shrink; > 1 grow (the latter
  // never happens because we cap at 1).
  // ────────────────────────────────────────────────────────────────────────

  _uiScale() {
    const s = Math.min(this.scale.width / 1280, this.scale.height / 720, 1);
    return Math.max(s, 0.35); // never smaller than 0.35×
  }

  _isPortrait() {
    return this.scale.width / this.scale.height < 1;
  }

  _isNarrow() {
    return this.scale.width < 900 || this.scale.height < 600;
  }

  // Position a HUD text element relative to the canvas with a margin
  // that scales with uiScale.
  _hudPos(xRatio, yRatio) {
    const padX = 20 * this._uiScale();
    const padY = 20 * this._uiScale();
    return {
      x: xRatio > 0 ? padX : this.scale.width * xRatio + padX,
      y: this.scale.height * yRatio + padY,
    };
  }

  _hudText(xRatio, yRatio, text, style) {
    return this.add.text(this._hudPos(xRatio, yRatio).x, this._hudPos(xRatio, yRatio).y, text, style)
      .setScrollFactor(0)
      .setDepth(50);
  }

  create() {
    // P3-01: accept map=1 or map=2 via URL query param (default=1)
    const mapNum = Number(new URLSearchParams(globalThis.location.search).get('map')) || 1;
    const terrainLayer = new TerrainLayer(this, { map: mapNum });
    globalThis.__juraTerrainLayer = terrainLayer;
    globalThis.__juraTerrainContract = { seed: terrainLayer.getSeed(), layout: terrainLayer.getLayout() };
    const pathLayer = new PathLayer(this);
    this._pathLayer = pathLayer; // store for update() access
    globalThis.__juraPathLayerContract = {
      waypoints: pathLayer.getWaypoints(),
      slots: pathLayer.getSlots(),
    };
    pathLayer.getSlots().slice(0, 3).forEach(({ x, y }, index) => {
      this.add.text(x - 7, y - 12, String.fromCharCode(65 + index), { fontSize: '20px', color: '#ffffff' });
    });

    // Tower selection state
    this._selectedTowerSprite = null;
    globalThis.__juraSelectedTowerContract = null;

    // P3-05: Register FX + Audio plugins
    this.fxSystem = addFXSystem(this);
    this.audioSystem = addAudioSystem(this);
    globalThis.__juraFXSystem = this.fxSystem;
    globalThis.__juraAudioSystem = this.audioSystem;
    // S07: Respect persisted mute state across scene transitions
    const persistedMute = globalThis.__juraMuted ?? false;
    globalThis.__juraAudioSystem.setGlobalMute(persistedMute);

    // S06: Unlock audio on first user gesture (required by browsers)
    this.input.once('pointerdown', () => {
      this.audioSystem?.unlock();
    });
    this.input.keyboard?.once('keydown', () => {
      this.audioSystem?.unlock();
    });

    // S07: Mute toggle button — press the icon in the action bar
    this._muted = persistedMute;

    const demoTower = new Tower('tranq', 180, 250);
    this._demoTowerSprite = new TowerSprite(this, demoTower);
    this._demoTowerSprite.setSelected(true);
    this._selectedTowerSprite = this._demoTowerSprite;
    globalThis.__juraTowerContract = this._demoTowerSprite.getTowerState();
    globalThis.__juraSelectedTowerContract = this._demoTowerSprite.getTowerState();
    this._demoTowerSprite.on('selected', (sprite) => {
      // Deselect any previously selected tower
      if (this._selectedTowerSprite && this._selectedTowerSprite !== sprite) {
        this._selectedTowerSprite.setSelected(false);
      }
      if (sprite.selected) {
        this._selectedTowerSprite = sprite;
      } else {
        this._selectedTowerSprite = null;
      }
      const state = sprite.getTowerState();
      globalThis.__juraSelectedTowerContract = sprite.selected ? state : null;
    });

    // ============================================================
    // P2-05: Tower placement slice
    // ============================================================
    this._towerTypeKeys = Object.keys(TOWER_TYPES);
    this._selectedTowerTypeIndex = 0;
    this._placedTowers = [demoTower]; // all placed towers (including demo)
    this._towerSpriteList = [this._demoTowerSprite];

    // Mark the demo tower's slot as occupied (slot 0 = path.js SLOTS[0])
    // We need to find which slot the demo tower occupies
    this._demoTowerSlotIndex = -1;
    for (let i = 0; i < pathLayer.getSlots().length; i++) {
      if (demoTower.x === pathLayer.getSlots()[i].x && demoTower.y === pathLayer.getSlots()[i].y) {
        this._demoTowerSlotIndex = i;
        pathLayer.occupySlot(i, demoTower.type);
        break;
      }
    }

    // Placement contract — authoritative state, preview-only
    globalThis.__juraPlacementContract = {
      selectedType: this._towerTypeKeys[0],
      occupiedSlots: {},
      towerStates: this._getTowerStates(),
    };

    // Wire path-layer slot clicks
    pathLayer.on('slotclick', (data) => this._onSlotClick(data));
    pathLayer.on('slothover', (data) => this._onSlotHover(data));

    // Keyboard: T to cycle tower type
    this.input.keyboard.addKey('T').on('down', () => this._cycleTowerType());

    // Keyboard: R to remove selected tower's slot (sell)
    this.input.keyboard.addKey('R').on('down', () => this._sellSelected());

    // Keyboard: U to upgrade selected tower (P2-08)
    this.input.keyboard.addKey('U').on('down', () => this._upgradeSelected());

    const demoEnemy = new Enemy('raptor', 1);
    demoEnemy.dist = 420;
    demoEnemy._sync();
    const demoEnemySprite = new EnemySprite(this, demoEnemy);
    demoEnemySprite.syncFromEnemy();
    let lastTowerType = null;
    this.combatBridge = new CombatBridge({
      towers: [demoTower],
      enemies: [demoEnemy],
      towerSprites: [this._demoTowerSprite],
      enemySprites: [demoEnemySprite],
      fxSystem: this.fxSystem,
      audio: this.audioSystem,
      towerFireCB: (type, x, y) => {
        this.audioSystem?.play('tower-' + type);
        this.fxSystem?.muzzleFlash(x, y, type);
      },
      hitCB: (x, y, status, damage) => {
        this.audioSystem?.play('combat-' + status);
        this.fxSystem?.hitFlash(x, y, status, damage);
      },
      killCB: (x, y, species) => {
        this.audioSystem?.play('combat-kill');
        this.fxSystem?.deathExplosion(x, y, species);
      },
      slowCB: (x, y) => {
        this.audioSystem?.play('combat-slow');
        this.fxSystem?.slowRipple(x, y);
      },
    });
    globalThis.__juraCombatBridge = this.combatBridge;

    // P2 slice: Phaser wave bridge driven by the renderer-neutral controller
    this.waveBridge = new WaveBridge({
      spawnEnemy: (enemy) => {
        const enemySprite = new EnemySprite(this, enemy);
        enemySprite.setPosition(enemy.x, enemy.y);
        enemySprite.setVisible(true);
        enemySprite.syncFromEnemy();
        this.combatBridge.enemies.push(enemy);
        this.combatBridge.enemySprites.push(enemySprite);
      },
      onWaveCleared: (nextWave) => {
        // Hook for HUD updates, sound, etc.
      },
      audio: this.audioSystem,
      fxSystem: this.fxSystem,
    });
    this.combatBridge.onEnemyGone = (uid, enemy) => this.waveBridge?.reportEnemyGone(uid, enemy);
    installWaveBridgeContract(this.waveBridge);
    globalThis.__juraWaveBridgeInstance = this.waveBridge;

    // P2-06 slice: Phaser ability bridge for Meteor/Chrono
    this.abilityBridge = new AbilityBridge({
      controller: this.waveBridge.controller,
      scene: this,
      enemies: this.combatBridge.enemies,
      towers: this.combatBridge.towers,
      projectiles: this.combatBridge.projectiles,
      fx: this.combatBridge.fx,
      fxSystem: this.fxSystem,
      audio: this.audioSystem,
    });
    installAbilityBridgeContract(this.abilityBridge);
    globalThis.__juraAbilityBridgeInstance = this.abilityBridge;

    // Wire pointer input for meteor targeting
    this.input.on('pointerdown', (pointer) => {
      // Don't fire meteor if the click landed on a UI button
      const hitObjects = this.input.hitTestPointer(pointer);
      const hitUI = hitObjects.some(obj => obj.input && obj.input.enabled);
      if (!hitUI && this.abilityBridge?.meteorTargeting) {
        this.abilityBridge.fireMeteor(pointer.x, pointer.y);
      }
    });
    this.input.on('pointermove', (pointer) => {
      this.abilityBridge?.updateMeteorReticle(pointer.x, pointer.y);
    });

    // ── S05: Integrated HUD Panel (authoritative source for lives/money/wave/speed) ──
    this.hudPanel = new HUDPanel(this);
    this.hudPanel.attachTo(this.add.container(0, 0));
    this.hudPanel.paintBackground();
    globalThis.__juraHUDPanel = this.hudPanel;

    // ── S05: Tower Shelf (bottom bar for tower selection) ──
    this.towerShelf = new TowerShelf(this);
    this.towerShelf.build(this._towerTypeKeys, { money: 0 });
    globalThis.__juraTowerShelf = this.towerShelf;

    // ── S05: Tower Inspection Panel (contextual upgrade/sell UI) ──
    this.inspectionPanel = new TowerInspectionPanel(this);
    globalThis.__juraInspectionPanel = this.inspectionPanel;

    // Wire scene callbacks for inspection panel actions
    this._onUpgrade = () => this._upgradeSelected();
    this._onSell = () => this._sellSelected();
    this._onTowerTypeSelect = (type) => {
      const idx = this._towerTypeKeys.indexOf(type);
      if (idx >= 0) {
        this._selectedTowerTypeIndex = idx;
        this._pathLayer.setHoverTowerType(type);
        this.towerShelf.setSelectedType(type);
      }
    };

    // ── Action buttons — responsive layout at bottom of canvas ──────────
    //
    // Narrow viewports (< 600px): 2 rows (3 top, 2 bottom)
    // Wide viewports: single centered row
    // All buttons fully inside 0..scale.width, minimum 48x48 (WCAG 2.5.5)
    // ────────────────────────────────────────────────────────────────────
    const isNarrowLayout = this.scale.width < 600;
    const uiScale = this._uiScale();
    const btnH = Math.max(48, 50 * uiScale);
    const btnGap = Math.max(8, 16 * uiScale);
    
    let btnW, btnStartX, btnY, row2Y;
    
    if (isNarrowLayout) {
      // 2-row layout: 3 buttons top, 2 buttons bottom
      // btnStartX is the CENTER of the first button
      btnW = Math.max(48, (this.scale.width - 2 * btnGap) / 3);
      const totalRow1W = 3 * btnW + 2 * btnGap;
      const row1LeftEdge = (this.scale.width - totalRow1W) / 2;
      btnStartX = row1LeftEdge + btnW / 2;
      btnY = this.scale.height * 0.85;
      row2Y = btnY + btnH + btnGap;
    } else {
      // Single row layout: all 5 buttons centered
      // btnStartX is the CENTER of the first button
      btnW = Math.max(72, (this.scale.width * 0.85 - 4 * btnGap) / 5);
      const totalW = 5 * btnW + 4 * btnGap;
      const leftEdge = (this.scale.width - totalW) / 2;
      btnStartX = leftEdge + btnW / 2;
      btnY = this.scale.height * 0.9;
      row2Y = btnY;
    }

    // Helper: create a touch-safe button with explicit hit area
    const makeBtn = (x, y, w, h, fill, stroke) => {
      const hitArea = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
      const rect = this.add.rectangle(x, y, w, h, fill)
        .setStrokeStyle(2, stroke)
        .setInteractive(hitArea, Phaser.Geom.Rectangle.Contains, { useHandCursor: true })
        .setDepth(200); // Above onboarding panel (depth 100-103)
      return rect;
    };
    const makeText = (x, y, text, fs) => {
      return this.add.text(x, y, text, {
        fontSize: `${Math.max(12, fs * uiScale)}px`, color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201); // Above button backgrounds
    };

    // Start Waves button
    const startBtn = makeBtn(btnStartX, btnY, btnW, btnH, 0x2a5a3a, 0x6fe3c1);
    this._startBtnText = makeText(startBtn.x, startBtn.y, 'Start Waves', 18);
    startBtn.on('pointerdown', () => {
      this.waveBridge.controller.start();
    });
    startBtn.on('pointerover', () => startBtn.setFillStyle(0x3a7a4a));
    startBtn.on('pointerout', () => startBtn.setFillStyle(0x2a5a3a));

    // Pause button
    const pauseX = btnStartX + btnW + btnGap;
    const pauseBtn = makeBtn(pauseX, btnY, btnW, btnH, 0x4a4a4a, 0xffffff);
    this._pauseBtnText = makeText(pauseX, pauseBtn.y, '⏸ Pause', 16);
    pauseBtn.on('pointerdown', () => {
      this.waveBridge.controller.pauseToggle();
      const state = this.waveBridge.state();
      this._pauseBtnText.setText(state.paused ? '▶ Resume' : '⏸ Pause');
    });
    pauseBtn.on('pointerover', () => pauseBtn.setFillStyle(0x5a5a5a));
    pauseBtn.on('pointerout', () => pauseBtn.setFillStyle(0x4a4a4a));

    // P2-06: Meteor button
    const meteorX = btnStartX + 2 * (btnW + btnGap);
    const meteorBtn = makeBtn(meteorX, btnY, btnW, btnH, 0x5a3a2a, 0xe0a458);
    this.meteorBtnText = makeText(meteorX, meteorBtn.y, '☄️ Meteor', 16);
    meteorBtn.on('pointerdown', () => {
      if (this.abilityBridge?.meteorTargeting) {
        this.abilityBridge.cancelMeteorTargeting();
        this.meteorBtnText.setText('☄️ Meteor');
      } else if (this.abilityBridge?.startMeteorTargeting()) {
        this.meteorBtnText.setText('☄️ [AIM]');
      }
    });
    meteorBtn.on('pointerover', () => meteorBtn.setFillStyle(0x7a4a3a));
    meteorBtn.on('pointerout', () => meteorBtn.setFillStyle(0x5a3a2a));

    // P2-06: Chrono button (row 2 in narrow layout)
    let chronoX, chronoY;
    if (isNarrowLayout) {
      // Center 2 buttons in row 2
      const totalRow2W = 2 * btnW + btnGap;
      const row2LeftEdge = (this.scale.width - totalRow2W) / 2;
      chronoX = row2LeftEdge + btnW / 2;
      chronoY = row2Y;
    } else {
      chronoX = btnStartX + 3 * (btnW + btnGap);
      chronoY = btnY;
    }
    const chronoBtn = makeBtn(chronoX, chronoY, btnW, btnH, 0x2a3a5a, 0x6fe3c1);
    this.chronoBtnText = makeText(chronoX, chronoY, '⏳ Rewind', 16);
    chronoBtn.on('pointerdown', () => {
      if (this.abilityBridge?.activateChrono()) {
        this.chronoBtnText.setText('⏳ ACTIVATED');
        this.time.delayedCall(800, () => this.chronoBtnText.setText('⏳ Rewind'));
      }
    });
    chronoBtn.on('pointerover', () => chronoBtn.setFillStyle(0x3a4a7a));
    chronoBtn.on('pointerout', () => chronoBtn.setFillStyle(0x2a3a5a));

    // Speed button (row 2 in narrow layout)
    let speedX, speedY;
    if (isNarrowLayout) {
      // Second button in row 2
      const totalRow2W = 2 * btnW + btnGap;
      const row2LeftEdge = (this.scale.width - totalRow2W) / 2;
      speedX = row2LeftEdge + btnW + btnGap + btnW / 2;
      speedY = row2Y;
    } else {
      speedX = btnStartX + 4 * (btnW + btnGap);
      speedY = btnY;
    }
    const speedBtn = makeBtn(speedX, speedY, btnW, btnH, 0x5a2a5a, 0xe0a458);
    this._speedBtnText = makeText(speedX, speedY, '1× Speed', 16);
    speedBtn.on('pointerdown', () => {
      const currentSpeed = this.waveBridge.timeScale;
      const newSpeed = currentSpeed === 1 ? 2 : 1;
      this.waveBridge.controller.setSpeed(newSpeed);
      this._speedBtnText.setText(`${newSpeed}× Speed`);
    });
    speedBtn.on('pointerover', () => speedBtn.setFillStyle(0x7a3a7a));
    speedBtn.on('pointerout', () => speedBtn.setFillStyle(0x5a2a5a));

    globalThis.__juraTouchContract = {
      minimumTarget: 48,
      layout: isNarrowLayout ? 'two-row' : 'single-row',
      actionButtons: {
        start_waves: { x: startBtn.x, y: startBtn.y, width: btnW, height: btnH, row: 1 },
        pause: { x: pauseBtn.x, y: pauseBtn.y, width: btnW, height: btnH, row: 1 },
        meteor: { x: meteorBtn.x, y: meteorBtn.y, width: btnW, height: btnH, row: 1 },
        chrono: { x: chronoBtn.x, y: chronoBtn.y, width: btnW, height: btnH, row: isNarrowLayout ? 2 : 1 },
        speed: { x: speedBtn.x, y: speedBtn.y, width: btnW, height: btnH, row: isNarrowLayout ? 2 : 1 },
      },
      pause: {
        bounds: { min: 1, max: 2 },
        state: () => ({
          paused: this.waveBridge.paused,
          label: this._pauseBtnText.text,
        }),
      },
      speed: {
        bounds: { min: 1, max: 2 },
        state: () => ({
          timeScale: this.waveBridge.timeScale,
          label: this._speedBtnText.text,
        }),
      },
      slotHitDiameter: 48,
      onboardingDismissMinimum: 44,
    };

    globalThis.__juraEnemySpriteContract = {
      uid: demoEnemySprite.getEnemyUid(),
      visible: demoEnemySprite.visible,
      x: demoEnemySprite.x,
      y: demoEnemySprite.y,
    };
    const walker = this.add.sprite(1180, 80, 'raptorWalk', 0).setScale(0.9);
    this.anims.create({ key: 'raptor-walk', frames: this.anims.generateFrameNumbers('raptorWalk', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    walker.play('raptor-walk');

    // Debug text — only shown when ?debug=1 query param is present
    const isDebug = new URLSearchParams(globalThis.location.search).get('debug') === '1';
    if (isDebug) {
      this.add.text(20, 20, 'Jura Defense Phaser Scale Spike', { fontSize: '28px', color: '#00ff88' });
      this.pointerText = this.add.text(20, 60, 'Pointer: (0, 0)', { fontSize: '18px', color: '#ffffff' });
    }
    this.input.on('pointermove', (pointer) => {
      if (this.pointerText) {
        this.pointerText.setText(`Pointer: (${Math.round(pointer.x)}, ${Math.round(pointer.y)})`);
      }
      globalThis.__juraPhaserPointer = { x: pointer.x, y: pointer.y };
    });

    // P3-02: First-run onboarding guidance panel
    this._createOnboardingPanel();

    // P3-03: Onboarding contract — exposed for tests and external inspectors
    this._installOnboardingContract();
  }

  // ---- P3-02: Onboarding panel -------------------------------------------
  //
  // Compact, dismissible, positioned so it does not obscure:
  //   • the path / route corridor (runs through the middle of the map)
  //   • tower slots (along the path)
  //   • the bottom HUD row (Start Waves / Meteor / Chrono buttons at y≈660)
  //   • the wave state HUD (top-left, y≈120)
  //   • the tower-type selector (top-right, y≈120)
  //
  // The panel sits in the left column between the wave HUD and the bottom
  // button row, anchored at (20, 160). It uses the same primitive styling
  // as the existing HUD texts (black translucent background, white body,
  // amber accent for the title, 14px font).

  // ---- P3-02: Onboarding panel -------------------------------------------
  //
  // Compact, dismissible, positioned so it does not obscure:
  //   • the path / route corridor (runs through the middle of the map)
  //   • tower slots (along the path)
  //   • the bottom HUD row (action buttons)
  //   • the wave state HUD (top-left)
  //   • the tower-type selector (top-right)
  //
  // Desktop / landscape: left-column panel at (20, 160).
  // Portrait / narrow: top-center modal overlay so text remains readable
  // without covering the route corridor.
  // ────────────────────────────────────────────────────────────────────────

  _createOnboardingPanel() {
    const uiScale = this._uiScale();
    const isPortrait = this._isPortrait();
    const isNarrow = this._isNarrow();

    // On narrow/portrait viewports the panel becomes a compact left-side
    // overlay positioned below the title/HUD area (y=90) so it does not
    // overlap the title, pointer text, wave HUD, or tower-type selector.
    // Uses a 2-column layout to keep vertical extent minimal while
    // preserving all required action keys.
    if (isPortrait || isNarrow) {
      // In portrait the logical Phaser canvas is wider than the viewport and
      // the route begins across the upper-left area. Keep the guide below the
      // top HUD/route while leaving the bottom action row usable.
      const x = 8;
      const y = 500;
      const w = Math.min(260, Math.max(220, this.scale.width * 0.65));
      const h = 150;

      this._onboardingBg = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0.85)
        .setStrokeStyle(1, 0xe0a458)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(100);

      const fsTitle = Math.max(10, 13 * uiScale);
      const fsBody = Math.max(8, 11 * uiScale);

      this._onboardingTitle = this.add.text(x + 8, y + 6, 'Quick Guide', {
        fontSize: `${fsTitle}px`,
        color: '#e0a458',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(101);

      // 2-column layout: left column = placement/controls, right = abilities
      const colW = (w - 20) / 2;
      const leftLines = [
        '• Click slot → place',
        '• T cycle type',
        '• U upgrade  R sell',
        '• Start Waves ↓',
      ];
      const rightLines = [
        '• Space pause',
        '• F speed 1×/2×',
        '• ☄️ Meteor (M)',
        '• ⏳ Chrono rewind',
      ];

      this._onboardingBody = this.add.text(x + 8, y + 6 + fsTitle + 4, leftLines.join('\n'), {
        fontSize: `${fsBody}px`,
        color: '#ffffff',
        lineSpacing: 1,
      }).setScrollFactor(0).setDepth(101);

      this._onboardingBodyRight = this.add.text(x + 8 + colW + 4, y + 6 + fsTitle + 4, rightLines.join('\n'), {
        fontSize: `${fsBody}px`,
        color: '#ffffff',
        lineSpacing: 1,
      }).setScrollFactor(0).setDepth(101);

      // Tip line below columns
      this._onboardingTip = this.add.text(x + 8, y + h - 22, 'Tip: hover slot to preview', {
        fontSize: `${Math.max(7, 10 * uiScale)}px`,
        color: '#aaaaaa',
        fontStyle: 'italic',
      }).setScrollFactor(0).setDepth(101);

      // ── Touch-safe dismiss button ────────────────────────────────────
      // Minimum 48 px touch target (WCAG 2.5.5).  Ensure the button is
      // large enough for a finger tap even when the panel is narrow.
      const dismissW = Math.max(48, 60 * uiScale);
      const dismissH = Math.max(48, 18 * uiScale);
      const dismissX = x + w - dismissW - 6;
      const dismissY = y + 4;
      const dismissHitArea = new Phaser.Geom.Rectangle(0, 0, dismissW, dismissH);
      this._onboardingDismissBg = this.add.rectangle(
        dismissX + dismissW / 2, dismissY + dismissH / 2,
        dismissW, dismissH, 0x2a5a3a,
      ).setStrokeStyle(1, 0x6fe3c1).setScrollFactor(0).setDepth(102)
        .setInteractive(dismissHitArea, Phaser.Geom.Rectangle.Contains, { useHandCursor: true });
      this._onboardingDismissText = this.add.text(
        dismissX + dismissW / 2, dismissY + dismissH / 2, '✕', {
          fontSize: `${Math.max(9, 11 * uiScale)}px`, color: '#ffffff',
        }
      ).setOrigin(0.5).setScrollFactor(0).setDepth(103);

      this._onboardingDismissBg.on('pointerover', () => this._onboardingDismissBg.setFillStyle(0x3a7a4a));
      this._onboardingDismissBg.on('pointerout', () => this._onboardingDismissBg.setFillStyle(0x2a5a3a));
      this._onboardingDismissBg.on('pointerdown', () => this._dismissOnboarding('click'));
    } else {
      // Desktop: left-column panel
      const x = 20;
      const y = 160;
      const w = 320 * uiScale;
      const h = 250 * uiScale;

      this._onboardingBg = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0.82)
        .setStrokeStyle(1, 0xe0a458)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(100);

      this._onboardingTitle = this.add.text(x + 12, y + 10, 'First Run — Quick Guide', {
        fontSize: `${Math.max(11, 15 * uiScale)}px`,
        color: '#e0a458',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(101);

      const bodyLines = [
        '• Click a glowing slot to place the selected tower.',
        '• T cycle tower type (Tranq / Cannon / Frost / Sniper).',
        '• U upgrade the selected tower.',
        '• R sell the selected tower (refund).',
        '• Start Waves bottom-center button — begins the assault.',
        '• Pause Space key or the ⏸ button.',
        '• Speed F toggles 1× / 2×.',
        '• Meteor ☄️ button (or M) — aim, then click to call down.',
        '• Chrono ⏳ button — rewind the last 4 seconds.',
        '',
        'Tip: hover a free slot to preview range before placing.',
      ];
      this._onboardingBody = this.add.text(x + 12, y + 34, bodyLines.join('\n'), {
        fontSize: `${Math.max(9, 13 * uiScale)}px`,
        color: '#ffffff',
        lineSpacing: 2,
      }).setScrollFactor(0).setDepth(101);

      const dismissW = Math.max(48, 70 * uiScale);
      const dismissH = Math.max(48, 22 * uiScale);
      const dismissX = x + w - dismissW - 8;
      const dismissY = y + 8;
      const dismissHitArea = new Phaser.Geom.Rectangle(0, 0, dismissW, dismissH);
      this._onboardingDismissBg = this.add.rectangle(
        dismissX + dismissW / 2, dismissY + dismissH / 2,
        dismissW, dismissH, 0x2a5a3a,
      ).setStrokeStyle(1, 0x6fe3c1).setScrollFactor(0).setDepth(102)
        .setInteractive(dismissHitArea, Phaser.Geom.Rectangle.Contains, { useHandCursor: true });
      this._onboardingDismissText = this.add.text(
        dismissX + dismissW / 2, dismissY + dismissH / 2, 'Got it ✕', {
          fontSize: `${Math.max(10, 12 * uiScale)}px`, color: '#ffffff',
        }
      ).setOrigin(0.5).setScrollFactor(0).setDepth(103);

      this._onboardingDismissBg.on('pointerover', () => this._onboardingDismissBg.setFillStyle(0x3a7a4a));
      this._onboardingDismissBg.on('pointerout', () => this._onboardingDismissBg.setFillStyle(0x2a5a3a));
      this._onboardingDismissBg.on('pointerdown', () => this._dismissOnboarding('click'));
    }

    // Esc also dismisses — only when the panel is visible
    this._onboardingEscHandler = (event) => {
      if (event.key === 'Escape' && this._onboardingVisible) {
        this._dismissOnboarding('esc');
      }
    };
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('keydown', this._onboardingEscHandler);
    }

    this._onboardingVisible = true;
    this._onboardingDismissed = false;
    this._onboardingDismissReason = null;
  }

  _dismissOnboarding(reason) {
    if (!this._onboardingVisible) return;
    this._onboardingVisible = false;
    this._onboardingDismissed = true;
    this._onboardingDismissReason = reason || 'unknown';

    if (this._onboardingBg) this._onboardingBg.destroy();
    if (this._onboardingTitle) this._onboardingTitle.destroy();
    if (this._onboardingBody) this._onboardingBody.destroy();
    if (this._onboardingBodyRight) this._onboardingBodyRight.destroy();
    if (this._onboardingTip) this._onboardingTip.destroy();
    if (this._onboardingDismissBg) this._onboardingDismissBg.destroy();
    if (this._onboardingDismissText) this._onboardingDismissText.destroy();

    if (typeof globalThis.removeEventListener === 'function' && this._onboardingEscHandler) {
      globalThis.removeEventListener('keydown', this._onboardingEscHandler);
    }

    // Keep the contract live but reflect the dismissed state
    if (globalThis.__juraOnboardingContract) {
      globalThis.__juraOnboardingContract.visible = false;
      globalThis.__juraOnboardingContract.dismissed = true;
      globalThis.__juraOnboardingContract.dismissReason = this._onboardingDismissReason;
    }
  }

  // ---- P3-03: Onboarding contract ---------------------------------------
  //
  // Exposes a minimal, stable surface for tests and external inspectors:
  //   { visible, dismissed, dismissReason, requiredActionKeys }
  //
  // `requiredActionKeys` enumerates every control the panel must explain —
  // a regression guard that the panel covers the full slice brief.

  _installOnboardingContract() {
    const requiredActionKeys = Object.freeze([
      'select_slot',        // click a glowing slot to place a tower
      'tower_type_cycle',   // T
      'upgrade',            // U
      'sell',               // R
      'start_waves',        // Start Waves button
      'pause',              // Space / pause button
      'speed',              // F (1x/2x)
      'meteor',             // Meteor button / M
      'chrono',             // Chrono / Rewind button
    ]);

    globalThis.__juraOnboardingContract = {
      visible: this._onboardingVisible,
      dismissed: this._onboardingDismissed,
      dismissReason: this._onboardingDismissReason,
      requiredActionKeys,
      // Test hook — programmatically dismiss without simulating a click
      dismiss: (reason) => this._dismissOnboarding(reason || 'contract'),
    };
  }

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.combatBridge?.step(dt);
    if (this.combatBridge) globalThis.__juraCombatState = this.combatBridge.getState();
    this.waveBridge?.update(delta);
    this.abilityBridge?.update(dt * (this.waveBridge?.timeScale || 1));

    // ── S05: Update integrated HUD systems ──
    if (this.hudPanel) {
      this.hudPanel.update();
    }
    if (this.towerShelf && this.waveBridge) {
      const state = this.waveBridge.state();
      this.towerShelf.update({ money: state.money });
    }
    if (this.inspectionPanel && this._selectedTowerSprite) {
      const towerState = this._selectedTowerSprite.getTowerState();
      this.inspectionPanel.show(towerState);
    } else if (this.inspectionPanel) {
      this.inspectionPanel.hide();
    }

    // Refresh placement contract every frame for live inspection
    if (globalThis.__juraPlacementContract) {
      globalThis.__juraPlacementContract.selectedType = this._towerTypeKeys[this._selectedTowerTypeIndex];
      globalThis.__juraPlacementContract.occupiedSlots = this._getOccupiedSlots();
      globalThis.__juraPlacementContract.towerStates = this._getTowerStates();
    }
  }

  // ---- P2-05: Tower placement helper methods ----

  _towerTypeLabel() {
    const key = this._towerTypeKeys[this._selectedTowerTypeIndex];
    const t = TOWER_TYPES[key];
    const money = this.waveBridge?.controller.getState().money ?? 0;
    const canAfford = money >= t.cost;
    const costStr = canAfford ? `${t.cost}` : `[${t.cost}]`;
    return `Tower type: ${t.name} (T=cycle)  [cost: ${costStr}]  Money: ${money}`;
  }

  _getTowerStates() {
    return this._towerSpriteList.map((s) => s.getTowerState());
  }

  // Store pathLayer for access from update()
  _pathLayer = null;

  _getOccupiedSlots() {
    const slots = this._pathLayer.getSlots();
    const result = {};
    const occ = this._pathLayer.getSlotOccupancy();
    occ.forEach((type, idx) => {
      if (type) {
        result[idx] = { ...slots[idx], towerType: type };
      }
    });
    return result;
  }

  _cycleTowerType() {
    this._selectedTowerTypeIndex = (this._selectedTowerTypeIndex + 1) % this._towerTypeKeys.length;
    const newType = this._towerTypeKeys[this._selectedTowerTypeIndex];
    this._pathLayer.setHoverTowerType(newType);
    if (this.towerShelf) {
      this.towerShelf.setSelectedType(newType);
    }
  }

  _onSlotClick(data) {
    const { index, x, y, occupied } = data;
    if (occupied) {
      // Clicking an occupied slot: deselect any other tower, select this one
      const towerIdx = this._placedTowers.findIndex((t) => t.x === x && t.y === y);
      if (towerIdx !== -1) {
        const sprite = this._towerSpriteList[towerIdx];
        // Deselect all
        this._towerSpriteList.forEach((s) => s.setSelected(false));
        sprite.setSelected(true);
      }
      return;
    }
    // Place a tower at the empty slot — economy-gated via the active controller
    const key = this._towerTypeKeys[this._selectedTowerTypeIndex];
    const cost = TOWER_TYPES[key].cost;
    const description = `place ${key} at slot ${index}`;

    // Try to spend via the renderer-neutral controller. If funds are
    // insufficient the controller throws and we reject with no state mutation.
    try {
      this.waveBridge.controller.spendMoney(cost, description);
    } catch (_err) {
      // Insufficient funds — flash red to signal rejection, no placement
      this._pathLayer.highlightSlot(index, 0xff3333, 0.5);
      this.time.delayedCall(300, () => this._pathLayer.resetSlotHighlight(index));
      return;
    }

    // Spend succeeded — commit placement
    const tower = new Tower(key, x, y);
    this._placedTowers.push(tower);
    this._pathLayer.occupySlot(index, key);
    const sprite = new TowerSprite(this, tower);
    this._towerSpriteList.push(sprite);
    this.combatBridge.towers.push(tower);
    this.combatBridge.towerSprites.push(sprite);

    // Auto-select the newly placed tower
    this._towerSpriteList.forEach((s) => s.setSelected(false));
    sprite.setSelected(true);
    this._selectedTowerSprite = sprite;
    globalThis.__juraSelectedTowerContract = sprite.getTowerState();

    // P3-05: FX + audio for tower placement
    this._pathLayer.highlightSlot(index, 0x00ff88, 0.5);
    this.time.delayedCall(300, () => this._pathLayer.resetSlotHighlight(index));
    this.fxSystem?.placeConfirm(x, y);
    this.audioSystem?.play('ui-place');
  }

  _onSlotHover(data) {
    if (data) {
      if (!data.occupied) {
        this._pathLayer.setHoverTowerType(this._towerTypeKeys[this._selectedTowerTypeIndex]);
      } else {
        this._pathLayer.setHoverTowerType(null);
      }
    } else {
      this._pathLayer.setHoverTowerType(null);
    }
  }

  _sellSelected() {
    if (!this._selectedTowerSprite) return;
    const sprite = this._selectedTowerSprite;
    const tower = sprite.tower;
    // Find which tower this is
    const towerIdx = this._placedTowers.findIndex((t) => t === tower);
    if (towerIdx === -1) return;

    // Refund via the renderer-neutral controller. sellValue() returns a
    // positive integer; refundMoney expects a negative integer.
    const refund = -tower.sellValue();
    const description = `sell ${tower.type} at (${tower.x}, ${tower.y})`;
    try {
      this.waveBridge.controller.refundMoney(refund, description);
    } catch (_err) {
      // Refund failed (shouldn't happen with valid sellValue); bail without
      // mutating placement state.
      return;
    }

    // Find the slot index
    for (let i = 0; i < this._pathLayer.getSlots().length; i++) {
      if (tower.x === this._pathLayer.getSlots()[i].x && tower.y === this._pathLayer.getSlots()[i].y) {
        this._pathLayer.clearSlot(i);
        break;
      }
    }
    // Remove from arrays
    this._placedTowers.splice(towerIdx, 1);
    this._towerSpriteList.splice(this._towerSpriteList.indexOf(sprite), 1);
    sprite.destroy();
    const cbIdx = this.combatBridge.towers.indexOf(tower);
    if (cbIdx !== -1) this.combatBridge.towers.splice(cbIdx, 1);
    const csIdx = this.combatBridge.towerSprites.indexOf(sprite);
    if (csIdx !== -1) this.combatBridge.towerSprites.splice(csIdx, 1);
    this._selectedTowerSprite = null;
    globalThis.__juraSelectedTowerContract = null;

    // P3-05: FX + audio for tower sell
    this.fxSystem?.sellConfirm(tower.x, tower.y);
    this.audioSystem?.play('ui-sell');
  }

  _upgradeSelected() {
    if (!this._selectedTowerSprite) return;
    const sprite = this._selectedTowerSprite;
    const tower = sprite.tower;

    // Guard: max level check before any spend
    if (!tower.canUpgrade()) {
      // Flash red to signal rejection
      this._pathLayer.highlightSlot(
        this._placedTowers.indexOf(tower),
        0xff3333,
        0.5
      );
      this.time.delayedCall(300, () => {
        const idx = this._placedTowers.indexOf(tower);
        if (idx !== -1) this._pathLayer.resetSlotHighlight(idx);
      });
      return;
    }

    // Spend via the renderer-neutral controller
    const cost = tower.upgradeCost();
    const description = `upgrade ${tower.type} at (${tower.x}, ${tower.y}) to L${tower.level + 1}`;
    try {
      this.waveBridge.controller.spendMoney(cost, description);
    } catch (_err) {
      // Insufficient funds — flash red, no mutation
      const idx = this._placedTowers.indexOf(tower);
      if (idx !== -1) {
        this._pathLayer.highlightSlot(idx, 0xff3333, 0.5);
        this.time.delayedCall(300, () => this._pathLayer.resetSlotHighlight(idx));
      }
      return;
    }

    // Spend succeeded — commit upgrade
    const result = tower.upgrade();
    if (!result.success) {
      // Should never happen given canUpgrade() guard, but handle defensively
      // Refund the money back
      this.waveBridge.controller.refundMoney(-cost, `refund failed upgrade ${tower.type}`);
      return;
    }

    // Update sprite state
    sprite.syncFromTower();
    globalThis.__juraSelectedTowerContract = sprite.getTowerState();

    // P3-05: FX + audio for tower upgrade
    this.fxSystem?.placeConfirm(tower.x, tower.y);
    this.audioSystem?.play('ui-place');

    // Flash green to signal success
    const idx = this._placedTowers.indexOf(tower);
    if (idx !== -1) {
      this._pathLayer.highlightSlot(idx, 0x00ff88, 0.5);
      this.time.delayedCall(300, () => this._pathLayer.resetSlotHighlight(idx));
    }
  }

  // ---- End P2-05 ----
}
