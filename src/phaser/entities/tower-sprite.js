import Phaser from 'phaser';
import { TOWER_TYPES } from '../../js/tower.js';
import { SPRITES, spriteImage } from '../../js/sprites.js';

function color(value) {
  return typeof value === 'number' ? value : Number.parseInt(String(value).replace('#', ''), 16);
}

export default class TowerSprite extends Phaser.GameObjects.Container {
  constructor(scene, tower, parent = null) {
    super(scene, tower.x, tower.y);
    this.tower = tower;
    this.selected = false;
    
    // Ground shadow
    this.shadow = scene.add.ellipse(0, 14, 52, 18, 0x000000, 0.30);
    
    // Base plate (square)
    this.base = scene.add.rectangle(0, 0, 52, 52, 0x243029, 1)
      .setStrokeStyle(2, 0x3a4a3f);
    
    // Main sprite (loaded async)
    this.sprite = null;
    this._spriteKey = tower.t.sprite;
    this._img = null;
    
    if (this._spriteKey) {
      spriteImage(this._spriteKey, (img) => {
        this._img = img;
        this._createSprite();
      });
    }
    
    // Barrel (for directional towers)
    this.barrel = null;
    if (tower.t.barrelAngle !== undefined) {
      this.barrel = scene.add.rectangle(16, 0, 25, 7, color(tower.t.color), 1);
    }
    
    // Core (accent circle)
    this.core = scene.add.circle(0, 0, 11, color(tower.t.color), 1);
    
    // Range ring (shown when selected)
    this.rangeRing = scene.add.circle(0, 0, tower.range / 4, color(tower.t.color), 0.08)
      .setStrokeStyle(1.5, color(tower.t.color));
    
    // Level pips (up to 5)
    this.levelPips = [];
    for (let i = 0; i < 5; i++) {
      const pip = scene.add.circle(-20 + i * 8, 20, 2.4, 0xe0a458, 1);
      this.levelPips.push(pip);
    }
    
    // Muzzle flash (temporary, created on fire)
    this.muzzleFlash = null;
    
    // Add children in order
    const children = [this.shadow, this.base];
    if (this.sprite) children.push(this.sprite);
    if (this.barrel) children.push(this.barrel);
    children.push(this.core, this.rangeRing, ...this.levelPips);
    this.add(children);
    
    scene.add.existing(this);
    
    // Touch-safe hit area
    const hitRadius = 32;
    const hitArea = new Phaser.Geom.Circle(0, 0, hitRadius);
    this.setSize(52, 52).setDepth(20);
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
  
  _createSprite() {
    if (!this._img || this.sprite) return;
    
    const meta = SPRITES[this._spriteKey];
    if (!meta) return;
    
    const textureKey = `tower_${this._spriteKey}_${this.tower.x}_${this.tower.y}`;
    if (!this.scene.textures.exists(textureKey)) {
      const canvas = document.createElement('canvas');
      canvas.width = meta.w;
      canvas.height = meta.h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        this._img,
        meta.ox ?? 0, meta.oy ?? 0, meta.w, meta.h,
        0, 0, meta.w, meta.h
      );
      this.scene.textures.addCanvas(textureKey, canvas);
    }
    
    this.sprite = this.scene.add.sprite(0, 0, textureKey);
    this.sprite.setOrigin(0.5, 1);
    this.add(this.sprite);
    this.sendToBack(this.sprite);
  }

  syncFromTower() {
    const tower = this.tower;
    if (!tower || !tower.t) return;
    this.setPosition(tower.x, tower.y);
    
    // Update sprite scale based on level
    if (this.sprite) {
      const meta = SPRITES[this._spriteKey];
      const baseH = 52 * 2.6;
      const aspect = meta.w / meta.h;
      const baseW = baseH * aspect;
      
      // Upgrade levels make tower visibly larger (5% per level)
      const levelScale = 1 + (tower.level - 1) * 0.05;
      this.sprite.setScale((baseW / meta.w) * levelScale, (baseH / meta.h) * levelScale);
      
      // Rotate sprite for directional towers
      if (this._spriteKey && tower.t.barrelAngle !== undefined) {
        const aim = tower.target ? tower.angle : tower.restAngle || 0;
        this.sprite.setRotation(aim - tower.t.barrelAngle);
      }
      
      // Flash tint on fire
      if (tower.flash > 0) {
        this.sprite.setTint(0xffffff);
      } else {
        this.sprite.clearTint();
      }
    }
    
    // Rotate barrel for directional towers
    if (this.barrel) {
      const aim = tower.target ? tower.angle : tower.restAngle || 0;
      this.barrel.setRotation(aim);
    }
    
    // Update range ring
    this.rangeRing.setRadius(tower.range / 4);
    this.rangeRing.setAlpha(this.selected ? 0.2 : 0.08);
    
    // Update core
    this.core.setFillStyle(color(tower.t.color), tower.flash > 0 ? 1 : 0.9);
    
    // Update level pips
    for (let i = 0; i < this.levelPips.length; i++) {
      this.levelPips[i].setVisible(i < tower.level);
    }
    
    // Update base stroke for selection
    this.base.setStrokeStyle(this.selected ? 3 : 2, this.selected ? 0xe0a458 : 0x3a4a3f);
    
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
