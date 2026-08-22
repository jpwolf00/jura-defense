import Phaser from 'phaser';
import { SPRITES } from '../../js/sprites.js';

function toColor(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  return 0xffffff;
}

// Map snake_case sprite ids (from TOWER_TYPES) to camelCase Phaser texture keys
const SPRITE_KEY_MAP = {
  tower_tranq: 'towerTranq',
  tower_drone: 'towerDrone',
  tower_aoe: 'towerAoe',
  tower_chrono: 'towerChrono',
};

export default class TowerSprite extends Phaser.GameObjects.Container {
  constructor(scene, tower, parent = null) {
    super(scene, tower.x, tower.y);
    this.tower = tower;
    this.selected = false;

    // Resolve sprite metadata and Phaser texture key
    const meta = tower.t.sprite ? SPRITES[tower.t.sprite] : null;
    const texKey = tower.t.sprite ? SPRITE_KEY_MAP[tower.t.sprite] : null;
    const hasTexture = texKey && scene.textures.exists(texKey);
    const aspect = (meta && meta.h > 0) ? meta.w / meta.h : 1;

    // Display size: towers are ~26px base radius, scale up for readability
    const baseSize = 26;
    const displayH = hasTexture ? baseSize * 3.0 : baseSize * 2;
    const displayW = displayH * aspect;
    this._baseW = displayW;
    this._baseH = displayH;
    this._hasTexture = hasTexture;
    this._texKey = texKey;
    this._meta = meta;

    // Ground shadow (grounds turret on board)
    this.groundShadow = scene.add.ellipse(0, baseSize * 0.55, baseSize * 2.2, baseSize * 0.8, 0x000000, 0.30);

    // Base plate (always visible, so build square reads clearly)
    this.basePlate = scene.add.rectangle(0, 0, baseSize * 2, baseSize * 2, 0x243029)
      .setStrokeStyle(this.selected ? 3 : 2, this.selected ? 0xe0a458 : 0x3a4a3f);

    // Main sprite image or fallback vector
    if (hasTexture) {
      this.sprite = scene.add.image(0, 0, texKey);
      const srcW = scene.textures.get(texKey).getSourceImage().width;
      const srcH = scene.textures.get(texKey).getSourceImage().height;
      this._srcScaleX = displayW / srcW;
      this._srcScaleY = displayH / srcH;
      this.sprite.setScale(this._srcScaleX, this._srcScaleY);
      this.sprite.setOrigin(0.5, 1); // bottom-center
    } else {
      // Vector fallback (circle + barrel)
      this.sprite = scene.add.container(0, 0);
      const core = scene.add.circle(0, 0, baseSize * 0.62, toColor(tower.t.color));
      const barrel = scene.add.rectangle(baseSize * 0.5, 0, baseSize + 8, 7, toColor(tower.t.color));
      this.sprite.add([core, barrel]);
      this._barrel = barrel;
      this._srcScaleX = 1;
      this._srcScaleY = 1;
    }

    // Range ring (visible when selected)
    this.rangeRing = scene.add.circle(0, 0, tower.range)
      .setStrokeStyle(1.5, toColor(tower.t.color), 0.4)
      .setFillStyle(toColor(tower.t.color), 0.14)
      .setAlpha(0);

    // Level pips (small gold dots showing upgrade level) - more visible
    this.levelPips = [];
    for (let i = 0; i < 5; i++) {
      const pip = scene.add.circle(-baseSize + 6 + i * 9, baseSize - 7, 3.2, 0xe0a458)
        .setStrokeStyle(1, 0x8a6010);
      this.levelPips.push(pip);
    }

    // Assemble container children in draw order
    const children = [this.groundShadow, this.basePlate, this.sprite, this.rangeRing, ...this.levelPips];
    this.add(children);

    scene.add.existing(this);

    // Touch-safe hit area (min 64px diameter for reliable tapping)
    const hitRadius = 32;
    this.setSize(baseSize * 2, baseSize * 2).setDepth(20);
    const hitArea = new Phaser.Geom.Circle(0, 0, hitRadius);
    this.setInteractive(hitArea, Phaser.Geom.Circle.Contains, { cursor: 'pointer' });

    this.on('pointerover', () => {
      this.setScale(this.selected ? 1.15 : 1.07);
    });
    this.on('pointerout', () => {
      this.setScale(1);
    });
    this.on('pointerdown', () => {
      this.selected = !this.selected;
      this.syncFromTower();
      this.emit('selected', this);
    });

    this.syncFromTower();
  }

  syncFromTower() {
    const tower = this.tower;
    if (!tower || !tower.t) return;
    this.setPosition(tower.x, tower.y);

    // Rotate sprite/barrel to aim at target
    const aim = tower.target ? tower.angle : (tower.restAngle || 0);
    if (this._hasTexture && this.sprite.type === 'Image') {
      // Rotate entire sprite (baked-in weapon aims at target)
      if (tower.t.barrelAngle !== undefined) {
        this.sprite.rotation = aim - tower.t.barrelAngle;
      }
      // Flash on fire
      if (typeof this.sprite.setTint === 'function') {
        if (tower.flash > 0) {
          this.sprite.setTint(0xffffff);
        } else {
          this.sprite.clearTint();
        }
      }
    } else if (this._barrel) {
      // Vector fallback: rotate barrel only
      this._barrel.setRotation(aim);
    }

    // Range ring visibility
    this.rangeRing.setRadius(tower.range);
    this.rangeRing.setAlpha(this.selected ? 1 : 0);

    // Level pips (show only up to current level)
    for (let i = 0; i < this.levelPips.length; i++) {
      this.levelPips[i].setVisible(i < tower.level);
    }

    // Base plate selection highlight
    this.basePlate.setStrokeStyle(this.selected ? 3 : 2, this.selected ? 0xe0a458 : 0x3a4a3f);

    this.setAlpha(tower.dead ? 0 : 1);
  }

  setSelected(selected) {
    this.selected = Boolean(selected);
    this.syncFromTower();
    return this;
  }

  getTowerType() { return this.tower.type; }
  getTowerState() {
    return { type: this.tower.type, level: this.tower.level, x: this.tower.x, y: this.tower.y, selected: this.selected };
  }
}
