import Phaser from 'phaser';
import { SPRITES, spriteImage } from '../../js/sprites.js';
import { MOTION_PROFILES } from '../../js/enemy.js';

function toColor(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  return 0xffffff;
}

export default class EnemySprite extends Phaser.GameObjects.Container {
  constructor(scene, enemy, parent = null) {
    super(scene);
    this.enemy = enemy;
    
    // Ground shadow (ellipse)
    this.shadow = scene.add.ellipse(0, 0, 40, 12, 0x000000, 0.32);
    
    // Main sprite (will be set when image loads)
    this.sprite = null;
    this._spriteKey = enemy.t.sprite;
    this._img = null;
    
    // Load sprite image
    if (this._spriteKey) {
      spriteImage(this._spriteKey, (img) => {
        this._img = img;
        this._createSprite();
      });
    }
    
    // HP bar
    this.hpBarBg = scene.add.rectangle(0, -40, 32, 4, 0x101820, 0.8);
    this.hpBar = scene.add.rectangle(-16, -40, 32, 3, 0x86e07b, 1).setOrigin(0, 0.5);
    
    // Armor badge (for armored enemies)
    this.armorBadge = null;
    this.armorText = null;
    this._lastArmorValue = enemy.armor; // Cache to avoid per-frame redraw
    if (enemy.armor > 0) {
      this.armorBadge = scene.add.graphics();
      this.armorText = scene.add.text(0, 0, String(enemy.armor), {
        fontSize: '8px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this._drawArmorBadge(); // Initial draw
    }
    
    // Slow ring indicator
    this.slowRing = scene.add.circle(0, 0, enemy.radius + 4, 0x5ac8d8, 0)
      .setStrokeStyle(2, 0x5ac8d8);
    
    // Add all children to container
    const children = [this.shadow];
    if (this.sprite) children.push(this.sprite);
    if (this.armorBadge) children.push(this.armorBadge);
    if (this.armorText) children.push(this.armorText);
    children.push(this.hpBarBg, this.hpBar, this.slowRing);
    this.add(children);
    
    scene.add.existing(this);
    this.setVisible(false);
    
    // Touch-safe hit area
    const eHitR = Math.max(enemy.radius, 16);
    this._hitArea = new Phaser.Geom.Circle(0, 0, eHitR);
    this.setInteractive(this._hitArea, Phaser.Geom.Circle.Contains);
    
    if (parent) {
      parent.add(this);
    }
    
    // Animation state
    this._animPhase = 0;
    this._animClock = 0;
  }
  
  _createSprite() {
    if (!this._img || this.sprite) return;
    
    const meta = SPRITES[this._spriteKey];
    if (!meta) return;
    
    // Create texture from loaded image
    const textureKey = `enemy_${this._spriteKey}_${this.enemy.uid}`;
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
    this.sprite.setOrigin(0.5, 1); // Bottom-center anchor
    this.add(this.sprite);
  }

  _drawArmorBadge() {
    if (!this.armorBadge) return;
    const badgeX = 24;
    const badgeY = -40;
    this.armorBadge.clear();
    this.armorBadge.fillStyle(0xd4a017, 1);
    this.armorBadge.lineStyle(1, 0x8a6010, 1);
    this.armorBadge.beginPath();
    this.armorBadge.moveTo(badgeX, badgeY - 5);
    this.armorBadge.lineTo(badgeX + 5, badgeY - 3);
    this.armorBadge.lineTo(badgeX + 5, badgeY + 1);
    this.armorBadge.lineTo(badgeX, badgeY + 5);
    this.armorBadge.lineTo(badgeX - 5, badgeY + 1);
    this.armorBadge.lineTo(badgeX - 5, badgeY - 3);
    this.armorBadge.closePath();
    this.armorBadge.fillPath();
    this.armorBadge.strokePath();
    this.armorText.setPosition(badgeX, badgeY);
  }

  syncFromEnemy() {
    const enemy = this.enemy;
    if (enemy.dead) { this.setVisible(false); return; }
    this.setVisible(true);
    this.setPosition(enemy.x, enemy.y);
    
    const isSlowed = enemy.slowUntil > performance.now();
    const isFlashing = enemy.hitFlash > 0;
    
    // Update sprite appearance
    if (this.sprite) {
      const meta = SPRITES[this._spriteKey];
      const motion = MOTION_PROFILES[enemy.type];
      
      // Calculate sprite size (proportional to threat)
      const r = enemy.radius;
      const h = Math.max(r * 4.5, 62);
      const aspect = meta.w / meta.h;
      const w = h * aspect;
      
      // Apply motion profile
      const phase = this._animPhase;
      const step = Math.sin(phase);
      const bob = Math.abs(step) * r * motion.bob;
      const squash = 1 - Math.abs(step) * motion.squash;
      const tilt = step * motion.tilt;
      
      // Position sprite with bob
      this.sprite.setPosition(0, -bob);
      this.sprite.setScale((w / meta.w) * (1 + Math.abs(step) * motion.squash * 0.45), (h / meta.h) * squash);
      this.sprite.setRotation(tilt);
      
      // Facing flip (sprites face left by default)
      const flipX = enemy.flip;
      this.sprite.setFlipX(flipX < 0);
      
      // Tint for slow/hit flash
      if (isFlashing) {
        this.sprite.setTint(isSlowed ? 0x5ac8d8 : 0xffffff);
      } else if (isSlowed) {
        this.sprite.setTint(0x5ac8d8);
      } else {
        this.sprite.clearTint();
      }
    }
    
    // Update shadow
    const shadowW = Math.max(40, enemy.radius * 2.5);
    const shadowH = Math.max(12, enemy.radius * 0.6);
    this.shadow.setSize(shadowW, shadowH);
    this.shadow.setPosition(0, enemy.flying ? 20 : 8);
    
    // Update HP bar
    const ratio = Math.max(0, Math.min(1, enemy.maxHp ? enemy.hp / enemy.maxHp : 0));
    this.hpBar.setSize(32 * ratio, 3);
    this.hpBar.setFillStyle(ratio > 0.4 ? 0x86e07b : 0xd0563f);
    
    // Update armor badge (only redraw when value changes)
    if (this.armorBadge && this.armorText) {
      const currentArmor = this.enemy.armor;
      if (currentArmor !== this._lastArmorValue) {
        this._lastArmorValue = currentArmor;
        this.armorText.setText(String(currentArmor));
        this._drawArmorBadge();
      }
    }
    
    // Update slow ring
    if (isSlowed) {
      this.slowRing.setAlpha(0.45);
      this.slowRing.setRadius(enemy.radius + 4);
    } else {
      this.slowRing.setAlpha(0);
    }
    
    // Advance animation clock
    this._animClock += 16; // ~60fps
    const motion = MOTION_PROFILES[enemy.type];
    this._animPhase = (this._animClock / 1000) * motion.rate * enemy.speed * 0.05;
  }

  getEnemyUid() { return this.enemy.uid; }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    super.destroy(true);
  }
}
