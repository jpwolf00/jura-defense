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
import { WaveCountdown, TowerInspectionPanel } from './ui/overlay-ui.js';

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

    // ── P3-04: UI/HUD modules ─────────────────────────────────────────
    this.hudPanel    = new HUDPanel(this);
    this.towerShelf  = new TowerShelf(this);
    this.waveCountdown = new WaveCountdown(this);
    this.inspectionPanel = new TowerInspectionPanel(this);

    // Tower-shelf callback: called when player picks a tower type from shelf
    this._onTowerTypeSelect = (type) => {
      const idx = this._towerTypeKeys.indexOf(type);
      if (idx >= 0) {
        this._selectedTowerTypeIndex = idx;
        this._towerTypeText.setText(this._towerTypeLabel());
        this._pathLayer.setHoverTowerType(type);
      }
    };

    // Upgrade / sell callbacks for inspection panel
    this._onUpgrade = () => this._upgradeSelected();
    this._onSell    = () => this._sellSelected();

    // ── P3-05: Register FX + Audio plugins ────────────────────────────
    this.fxSystem = addFXSystem(this);
    this.audioSystem = addAudioSystem(this);
    globalThis.__juraFXSystem = this.fxSystem;
    globalThis.__juraAudioSystem = this.audioSystem;
    globalThis.__juraAudioSystem.setGlobalMute(false);

    // S06: Unlock audio on first user gesture (browser requirement)
    this._audioUnlocked = false;
    this._unlockAudio = () => {
      if (!this._audioUnlocked) {
        this.audioSystem?.unlock();
        this._audioUnlocked = true;
      }
    };
    this.input.once('pointerdown', this._unlockAudio);
    this.input.keyboard?.once('keydown', this._unlockAudio);

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
        // P3-04: Show inspection panel
        this.inspectionPanel.show(sprite.tower);
      } else {
        this._selectedTowerSprite = null;
        // P3-04: Hide inspection panel
        this.inspectionPanel.hide();
      }
      const state = sprite.getTowerState();
      globalThis.__juraSelectedTowerContract = sprite.selected ? state : null;
      this._updateTowerHud();
    });

    // ============================================================
    // P2-05: Tower placement slice
    // ============================================================
    this._towerTypeKeys = Object.keys(TOWER_TYPES);
    this._selectedTowerTypeIndex = 0;
    this._placedTowers = [demoTower]; // all placed towers (including demo)
    this._towerSpriteList = [this._demoTowerSprite];

    // ── P3-04: Build tower shelf and HUD panel ────────────────────────
    // Shelf must be built after _towerTypeKeys is set
    this.towerShelf.build(this._towerTypeKeys, {});
    this.hudPanel.paintBackground(0x17231d, 0.85, 14, 6);
    this.hudPanel.attachTo(this.hudPanel._group);

    // ── P3-04: Tower shelf event handler (replaces keyboard-only type cycle) ──
    // Also wire tower shelf selection into the tower sprite selection flow
    const scene = this;
    this.towerShelf._slots.forEach((slot) => {
      slot.bg?.on('pointerdown', () => {
        if (slot.type) {
          this._selectedTowerTypeIndex = this._towerTypeKeys.indexOf(slot.type);
          this._towerTypeText.setText(this._towerTypeLabel());
          this._pathLayer.setHoverTowerType(slot.type);
        }
      });
    });

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

    // Tower type selector: press T to cycle through types
    // Responsive: top-right, 10% from right edge.
    const uiScale = this._uiScale();
    this._towerTypeText = this.add.text(
      this.scale.width * 0.92, 120 * uiScale, '', {
        fontSize: `${Math.max(12, 14 * uiScale)}px`,
        color: '#e0a458',
        backgroundColor: '#000000cc',
        padding: { x: 8, y: 6 },
      }
    ).setScrollFactor(0).setOrigin(1, 0);
    this._towerTypeText.setText(this._towerTypeLabel());

    // Placement HUD: shows preview cost + instructions
    // Responsive: bottom-left, scales with uiScale.
    this.placementHud = this.add.text(20, 560 * uiScale, '', {
      fontSize: `${Math.max(10, 14 * uiScale)}px`,
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 8, y: 6 }, align: 'left',
    }).setScrollFactor(0);
    this.placementHud.setText('Place: click empty slot. T=cycle type. U=upgrade. R=sell. Hover to preview.');
    this._slotHoverText = this.add.text(20, 590 * uiScale, '', {
      fontSize: `${Math.max(9, 13 * uiScale)}px`,
      color: '#e0a458',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0);

    // Wire path-layer slot clicks
    pathLayer.on('slotclick', (data) => this._onSlotClick(data));
    pathLayer.on('slothover', (data) => this._onSlotHover(data));

    // Keyboard: T to cycle tower type
    this.input.keyboard.addKey('T').on('down', () => this._cycleTowerType());

    // Keyboard: R to remove selected tower's slot (sell)
    this.input.keyboard.addKey('R').on('down', () => this._sellSelected());

    // Keyboard: U to upgrade selected tower (P2-08)
    this.input.keyboard.addKey('U').on('down', () => this._upgradeSelected());

    // Tower inspection HUD — below placement HUD (responsive)
    this.towerHud = this.add.text(20, (560 + 70) * uiScale, '', {
      fontSize: `${Math.max(10, 14 * uiScale)}px`,
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 8, y: 6 },
      align: 'left',
    }).setScrollFactor(0);
    this._updateTowerHud();

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
      hitCB: (x, y, status) => {
        // Map renderer-neutral status to AudioSystem sound keys
        const audioKey = status === 'normal' ? 'combat-hit' : 'combat-' + status;
        this.audioSystem?.play(audioKey);
        this.fxSystem?.hitFlash(x, y, status);
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

    // Wire pointer input for meteor targeting.
    // Guard against the double-fire problem: the Meteor button's own
    // pointerdown handler calls startMeteorTargeting(), then the scene's
    // global pointerdown fires for the *same* pointer and sees targeting
    // === true, calling fireMeteor() immediately.  A per-frame flag
    // (_skipMeteorPointer) prevents the global handler from firing on the
    // same frame the button started targeting.
    //
    // S02 fix: Convert pointer coords to world coords so the ability-bridge
    // always receives game coords (0..1280, 0..720) regardless of scale mode.
    this._skipMeteorPointer = false;
    this.input.on('pointerdown', (pointer) => {
      if (this._skipMeteorPointer) { this._skipMeteorPointer = false; return; }
      if (this.abilityBridge?.meteorTargeting) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.abilityBridge.fireMeteor(worldPoint.x, worldPoint.y);
      }
    });
    this.input.on('pointermove', (pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.abilityBridge?.updateMeteorReticle(worldPoint.x, worldPoint.y);
    });

    // Ability status display — top-left, below wave HUD
    // Shows only ability-specific info (meteor/chrono) since HUDPanel handles lives/money/wave/speed
    this.abilityHudText = this.add.text(20, 120 * uiScale, '', {
      fontSize: `${Math.max(10, 14 * uiScale)}px`,
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0);

    // ── Action buttons — responsive layout at bottom of canvas ──────────
    //
    // Narrow viewports (< 600px): 2 rows (3 top, 2 bottom)
    // Wide viewports: single centered row
    // All buttons fully inside 0..scale.width, minimum 48x48 (WCAG 2.5.5)
    // ────────────────────────────────────────────────────────────────────
    const isNarrowLayout = this.scale.width < 600;
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
      const ab = this.abilityBridge;
      if (ab?.meteorTargeting) {
        ab.cancelMeteorTargeting();
        this.meteorBtnText.setText('☄️ Meteor');
      } else if (ab?.startMeteorTargeting()) {
        this.meteorBtnText.setText('☄️ [AIM]');
        // Prevent the scene's global pointerdown from firing fireMeteor()
        // on the same pointer event that started targeting.
        this._skipMeteorPointer = true;
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

    // Keyboard: M toggles mute (when not in meteor targeting mode)
    this.input.keyboard.addKey('M').on('down', () => {
      if (!this.abilityBridge?.meteorTargeting) {
        this._toggleMute();
      }
    });

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

    // Debug text gated behind query param ?debug=1
    const debugMode = new URLSearchParams(globalThis.location.search).get('debug') === '1';
    if (debugMode) {
      this.add.text(20, 20, 'Jura Defense Phaser Scale Spike', { fontSize: '28px', color: '#00ff88' });
      this.pointerText = this.add.text(20, 60, 'Pointer: (0, 0)', { fontSize: '18px', color: '#ffffff' });
      this.input.on('pointermove', (pointer) => {
        if (this.pointerText) {
          this.pointerText.setText(`Pointer: (${Math.round(pointer.x)}, ${Math.round(pointer.y)})`);
        }
        globalThis.__juraPhaserPointer = { x: pointer.x, y: pointer.y };
      });
    } else {
      // Still track pointer for contract, just don't render debug text
      this.input.on('pointermove', (pointer) => {
        globalThis.__juraPhaserPointer = { x: pointer.x, y: pointer.y };
      });
    }

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
    // Check if onboarding has been shown before (persisted flag)
    const hasSeenOnboarding = globalThis.localStorage?.getItem('jura-onboarding-seen') === 'true';
    if (hasSeenOnboarding) {
      // Skip onboarding — install contract but don't show panel
      this._onboardingVisible = false;
      this._onboardingDismissed = true;
      this._installOnboardingContract();
      return;
    }

    const uiScale = this._uiScale();
    const isPortrait = this._isPortrait();
    const isNarrow = this._isNarrow();

    // Onboarding overlay: 5 steps teaching build -> start wave -> meteor -> chrono -> upgrade/sell
    const steps = [
      { title: '1. Build Towers', body: 'Click empty slots to place towers.\nSelect tower type from the shelf below.' },
      { title: '2. Start Waves', body: 'Press the Start Waves button\nto begin the assault.' },
      { title: '3. Meteor Strike', body: 'Click the ☄️ Meteor button,\nthen click to call down a strike.' },
      { title: '4. Chrono Rewind', body: 'Use ⏳ Chrono to rewind\nthe last 4 seconds.' },
      { title: '5. Upgrade & Sell', body: 'Click a tower to select it.\nUpgrade (U) or sell (R) as needed.' },
    ];

    this._onboardingSteps = steps;
    this._onboardingStepIndex = 0;

    // Full-screen overlay background
    const overlayW = this.scale.width;
    const overlayH = this.scale.height;
    this._onboardingOverlayBg = this.add.rectangle(overlayW / 2, overlayH / 2, overlayW, overlayH, 0x000000, 0.7)
      .setScrollFactor(0)
      .setDepth(200);

    // Panel
    const panelW = isPortrait || isNarrow ? Math.min(320, this.scale.width * 0.85) : 400;
    const panelH = isPortrait || isNarrow ? 280 : 240;
    const panelX = overlayW / 2;
    const panelY = overlayH / 2;

    this._onboardingPanelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0x17231d, 0.95)
      .setStrokeStyle(3, 0x6fe3c1)
      .setScrollFactor(0)
      .setDepth(201);

    // Title
    const titleY = panelY - panelH / 2 + 30;
    this._onboardingTitle = this.add.text(panelX, titleY, steps[0].title, {
      fontSize: `${Math.max(16, 22 * uiScale)}px`,
      color: '#e0a458',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

    // Body text
    const bodyY = titleY + 40;
    this._onboardingBody = this.add.text(panelX, bodyY, steps[0].body, {
      fontSize: `${Math.max(12, 15 * uiScale)}px`,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

    // Step indicator
    const stepY = panelY + panelH / 2 - 70;
    this._onboardingStepIndicator = this.add.text(panelX, stepY, `Step 1 of ${steps.length}`, {
      fontSize: `${Math.max(10, 12 * uiScale)}px`,
      color: '#aaaaaa',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

    // Next/Skip buttons
    const btnY = panelY + panelH / 2 - 35;
    const btnW = Math.max(80, 100 * uiScale);
    const btnH = Math.max(40, 44 * uiScale);
    const btnGap = 20;

    // Next button
    const nextBtnX = panelX + btnW / 2 + btnGap / 2;
    this._onboardingNextBg = this.add.rectangle(nextBtnX, btnY, btnW, btnH, 0x2a5a3a)
      .setStrokeStyle(2, 0x6fe3c1)
      .setScrollFactor(0)
      .setDepth(203)
      .setInteractive(new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH), Phaser.Geom.Rectangle.Contains, { useHandCursor: true });
    
    this._onboardingNextText = this.add.text(nextBtnX, btnY, 'Next', {
      fontSize: `${Math.max(12, 14 * uiScale)}px`,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(204);

    this._onboardingNextBg.on('pointerover', () => this._onboardingNextBg.setFillStyle(0x3a7a4a));
    this._onboardingNextBg.on('pointerout', () => this._onboardingNextBg.setFillStyle(0x2a5a3a));
    this._onboardingNextBg.on('pointerdown', () => this._advanceOnboardingStep());

    // Skip button
    const skipBtnX = panelX - btnW / 2 - btnGap / 2;
    this._onboardingSkipBg = this.add.rectangle(skipBtnX, btnY, btnW, btnH, 0x4a4a4a)
      .setStrokeStyle(2, 0x888888)
      .setScrollFactor(0)
      .setDepth(203)
      .setInteractive(new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH), Phaser.Geom.Rectangle.Contains, { useHandCursor: true });
    
    this._onboardingSkipText = this.add.text(skipBtnX, btnY, 'Skip', {
      fontSize: `${Math.max(12, 14 * uiScale)}px`,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(204);

    this._onboardingSkipBg.on('pointerover', () => this._onboardingSkipBg.setFillStyle(0x5a5a5a));
    this._onboardingSkipBg.on('pointerout', () => this._onboardingSkipBg.setFillStyle(0x4a4a4a));
    this._onboardingSkipBg.on('pointerdown', () => this._dismissOnboarding('skip'));

    // Esc also dismisses
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

  _advanceOnboardingStep() {
    if (!this._onboardingVisible || !this._onboardingSteps) return;
    
    this._onboardingStepIndex++;
    
    if (this._onboardingStepIndex >= this._onboardingSteps.length) {
      // Completed all steps
      this._dismissOnboarding('completed');
      return;
    }

    // Update panel content
    const step = this._onboardingSteps[this._onboardingStepIndex];
    this._onboardingTitle.setText(step.title);
    this._onboardingBody.setText(step.body);
    this._onboardingStepIndicator.setText(`Step ${this._onboardingStepIndex + 1} of ${this._onboardingSteps.length}`);

    // Update button text on last step
    if (this._onboardingStepIndex === this._onboardingSteps.length - 1) {
      this._onboardingNextText.setText('Done');
    }
  }

  _dismissOnboarding(reason) {
    if (!this._onboardingVisible) return;
    this._onboardingVisible = false;
    this._onboardingDismissed = true;
    this._onboardingDismissReason = reason || 'unknown';

    // Persist flag so onboarding only shows once
    try {
      globalThis.localStorage?.setItem('jura-onboarding-seen', 'true');
    } catch (_e) {
      // localStorage may not be available in some contexts
    }

    // Destroy overlay elements
    if (this._onboardingOverlayBg) this._onboardingOverlayBg.destroy();
    if (this._onboardingPanelBg) this._onboardingPanelBg.destroy();
    if (this._onboardingTitle) this._onboardingTitle.destroy();
    if (this._onboardingBody) this._onboardingBody.destroy();
    if (this._onboardingStepIndicator) this._onboardingStepIndicator.destroy();
    if (this._onboardingNextBg) this._onboardingNextBg.destroy();
    if (this._onboardingNextText) this._onboardingNextText.destroy();
    if (this._onboardingSkipBg) this._onboardingSkipBg.destroy();
    if (this._onboardingSkipText) this._onboardingSkipText.destroy();

    // Legacy cleanup for old onboarding panel elements
    if (this._onboardingBg) this._onboardingBg.destroy();
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
    
    // Update HUDPanel (authoritative for lives/money/wave/speed)
    this.hudPanel?.update();
    
    // Update ability-only HUD (meteor/chrono status)
    if (this.waveBridge && this.abilityHudText) {
      const ab = this.abilityBridge?.state() || { meteor: {}, chrono: {} };
      this.abilityHudText.setText(
        `☄️ Meteor: ${ab.meteor.charges}/${ab.meteor.maxCharges}  ` +
        `${ab.meteor.targeting ? '[TARGETING]' : ab.meteor.ready ? 'READY' : 'cooling'}\n` +
        `⏳ Chrono: ${Math.round(ab.chrono.pct * 100)}%  ${ab.chrono.ready ? 'READY' : 'charging'}`
      );
    }
    
    // Update tower shelf affordability
    if (this.waveBridge && this.towerShelf) {
      const state = this.waveBridge.state();
      this.towerShelf.update(state);
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
    this._towerTypeText.setText(this._towerTypeLabel());
    this._pathLayer.setHoverTowerType(this._towerTypeKeys[this._selectedTowerTypeIndex]);
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
    this._updateTowerHud();

    // P3-05: FX + audio for tower placement
    this._pathLayer.highlightSlot(index, 0x00ff88, 0.5);
    this.time.delayedCall(300, () => this._pathLayer.resetSlotHighlight(index));
    this.fxSystem?.placeConfirm(x, y);
    this.audioSystem?.play('ui-place');
  }

  _onSlotHover(data) {
    if (data) {
      const t = TOWER_TYPES[this._towerTypeKeys[this._selectedTowerTypeIndex]];
      const slotStr = data.occupied
        ? `[occupied: ${data.towerType || 'tower'}]`
        : `[free — click to place ${t.name}]`;
      this._slotHoverText.setText(
        `Slot ${data.index} (${data.x}, ${data.y}) — ${slotStr}  ` +
        (data.occupied ? `Range: ${t.range}` : `Preview range: ${t.range}  [cost: ${t.cost} preview]`)
      );
      if (!data.occupied) {
        this._pathLayer.setHoverTowerType(this._towerTypeKeys[this._selectedTowerTypeIndex]);
      } else {
        this._pathLayer.setHoverTowerType(null);
      }
    } else {
      this._slotHoverText.setText('');
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
    this._updateTowerHud();

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
    this._updateTowerHud();

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

  /** Toggle audio mute/unmute. */
  _toggleMute() {
    this._muted = !this._muted;
    this.audioSystem?.setGlobalMute(this._muted);
    this._muteBtn?.setText(this._muted ? '🔇' : '🔊');
  }

  // ---- End P2-05 ----

  _updateTowerHud() {
    if (!this._selectedTowerSprite || !this._selectedTowerSprite.selected) {
      this.towerHud.setText('');
      return;
    }
    const t = this._selectedTowerSprite.tower;
    const typeInfo = t.t;
    const canUp = t.canUpgrade();
    const upCost = canUp ? t.upgradeCost() : 0;
    const upStr = canUp ? `[${upCost}] (U)` : 'MAX';
    this.towerHud.setText(
      `▸ ${typeInfo.name} [L${t.level}]\n` +
      `  dmg: ${Math.round(t.dmg)}  range: ${Math.round(t.range)}\n` +
      `  rate: ${typeInfo.rate}s  color: ${typeInfo.color}\n` +
      `  upgrade: ${upStr}  sell: ${t.sellValue()}\n` +
      `  desc: ${typeInfo.desc}\n` +
      `  pos: (${t.x}, ${t.y})`
    );
  }
}
