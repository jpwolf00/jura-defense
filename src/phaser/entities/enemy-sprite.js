import Phaser from 'phaser';
import { SPRITES } from '../../js/sprites.js';

function toColor(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  return 0xffffff;
}

// Map snake_case sprite ids (from ENEMY_TYPES) to camelCase Phaser texture keys
const SPRITE_KEY_MAP = {
  dino_raptor: 'dinoRaptor',
  dino_hadro: 'dinoHadro',
  dino_trice: 'dinoTrice',
  dino_anky: 'dinoAnky',
  dino_pterano: 'dinoPterano',
  dino_trex: 'dinoTrex',
};

// Motion profiles for 2D sprite animation (matching canvas renderer)
const MOTION_PROFILES = {
  raptor:  { bob: 0.16, squash: 0.065, tilt: 0.045, flap: 0,    rate: 2.8 },
  hadro:   { bob: 0.11, squash: 0.050, tilt: 0.025, flap: 0,    rate: 1.65 },
  trice:   { bob: 0.09, squash: 0.075, tilt: 0.018, flap: 0,    rate: 1.25 },
  anky:    { bob: 0.07, squash: 0.085, tilt: 0.016, flap: 0,    rate: 1.05 },
  pterano: { bob: 0.05, squash: 0.020, tilt: 0.025, flap: 0.18, rate: 3.2 },
  trex:    { bob: 0.20, squash: 0.100, tilt: 0.035, flap: 0,    rate: 1.0 },
};

export default class EnemySprite extends Phaser.GameObjects.Container {
  constructor(scene, enemy, parent = null) {
    super(scene);
    this.enemy = enemy;

    // Resolve sprite metadata and Phaser texture key
    const meta = enemy.t.sprite ? SPRITES[enemy.t.sprite] : null;
    const texKey = enemy.t.sprite ? SPRITE_KEY_MAP[enemy.t.sprite] : null;
    const hasTexture = texKey && scene.textures.exists(texKey);
    const aspect = (meta && meta.h > 0) ? meta.w / meta.h : 1;

    // Display size: proportional to threat (radius), large enough to read at gameplay scale
    // Threat-based sizing: trex (boss) > trice/anky (armored) > hadro (medium) > raptor (fast) > pterano (flier)
    const r = enemy.radius;
    const threatMultiplier = enemy.type === 'trex' ? 1.35 : 
                             enemy.type === 'trice' || enemy.type === 'anky' ? 1.2 :
                             enemy.type === 'hadro' ? 1.1 : 
                             enemy.type === 'pterano' ? 0.95 : 1.0;
    const baseH = hasTexture ? Math.max(r * 5.2 * threatMultiplier, 72) : Math.max(r * 2.6, 36);
    const baseW = baseH * aspect;
    this._baseW = baseW;
    this._baseH = baseH;
    this._aspect = aspect;
    this._hasTexture = hasTexture;
    this._texKey = texKey;
    this._meta = meta;

    // Ground shadow (grounds unit on path, separates from background)
    this.groundShadow = scene.add.ellipse(
      0, enemy.flying ? baseH * 0.30 : baseH * 0.10,
      baseW * 0.92, Math.max(8, baseW * 0.26),
      0x000000, 0.32
    );

    // Flying shadow (for fliers — separate shadow on ground below the elevated body)
    this.flyingShadow = null;
    if (enemy.flying) {
      this.flyingShadow = scene.add.ellipse(
        0, baseH * 0.35, baseW * 0.80, Math.max(8, baseW * 0.24),
        0x000000, 0.25
      );
    }

    // Main sprite image or fallback circle
    if (hasTexture) {
      // Sprite images face LEFT by convention; origin at bottom-center for ground alignment
      this.sprite = scene.add.image(0, 0, texKey);
      const srcW = scene.textures.get(texKey).getSourceImage().width;
      const srcH = scene.textures.get(texKey).getSourceImage().height;
      this._srcScaleX = baseW / srcW;
      this._srcScaleY = baseH / srcH;
      this.sprite.setScale(this._srcScaleX, this._srcScaleY);
      this.sprite.setOrigin(0.5, 1); // bottom-center
    } else {
      // Vector fallback
      this.sprite = scene.add.circle(0, -r * 0.2, r, toColor(enemy.t.color));
      this._srcScaleX = 1;
      this._srcScaleY = 1;
    }

    // Armor badge: prominent gold shield with armor value, shown for armored enemies
    this.armorBadge = null;
    if (enemy.armor > 0) {
      this.armorBadge = scene.add.container(baseW * 0.45 + 12, -baseH - 6);
      // Shield shape (hexagon) - larger and more prominent
      const shieldBg = scene.add.rectangle(0, 0, 14, 14, 0xd4a017);
      const shieldBorder = scene.add.rectangle(0, 0, 14, 14, 0x8a6010)
        .setStrokeStyle(2, 0x8a6010).setFillStyle(0xd4a017);
      const armorText = scene.add.text(0, 0, String(enemy.armor), {
        fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.armorBadge.add([shieldBg, armorText]);
    }

    // Slow ring: cyan ring around slowed enemies - more prominent
    this.slowRing = scene.add.circle(0, -baseH * 0.4, r + 8)
      .setStrokeStyle(3, 0x5ac8d8).setFillStyle(0x5ac8d8, 0).setAlpha(0);

    // HP bar (positioned above the sprite)
    const barW = Math.max(r * 2, baseW * 0.55);
    this._barW = barW;
    this.hpBarBg = scene.add.rectangle(0, -baseH - 12, barW, 5, 0x000000, 0.5).setOrigin(0.5, 0.5);
    this.hpBar = scene.add.rectangle(-barW / 2, -baseH - 12, barW, 5, 0x6fbf73, 1).setOrigin(0, 0.5);

    // Assemble container children in draw order
    const children = [this.groundShadow];
    if (this.flyingShadow) children.push(this.flyingShadow);
    children.push(this.sprite);
    if (this.armorBadge) children.push(this.armorBadge);
    children.push(this.slowRing);
    children.push(this.hpBarBg, this.hpBar);
    this.add(children);

    scene.add.existing(this);
    this.setVisible(false);

    // Touch-safe hit area (min 32px diameter for reliable tapping)
    const eHitR = Math.max(r, 16);
    this._hitArea = new Phaser.Geom.Circle(0, -baseH * 0.4, eHitR);
    this.setInteractive(this._hitArea, Phaser.Geom.Circle.Contains);

    if (parent) parent.add(this);

    // Animation state
    this._animT = Math.random() * 100;
    this._prevSlowed = false;
  }

  syncFromEnemy() {
    const enemy = this.enemy;
    if (enemy.dead) { this.setVisible(false); return; }
    this.setVisible(true);
    this.setPosition(enemy.x, enemy.y);

    const motion = MOTION_PROFILES[enemy.type] || MOTION_PROFILES.raptor;
    const r = enemy.radius;
    const isSlowed = enemy.slowUntil > performance.now();

    // Advance animation clock
    this._animT += 0.016 * enemy.speed * 0.05;
    const phase = this._animT * motion.rate;
    const step = Math.sin(phase);
    const bob = Math.abs(step) * r * motion.bob;
    const tilt = step * motion.tilt;

    if (this._hasTexture && this.sprite.type === 'Image') {
      // Facing: flip horizontally based on enemy.flip (1 = face left, -1 = face right)
      const flipSign = enemy.flip;
      const squashX = 1 + Math.abs(step) * motion.squash * 0.45;
      const squashY = 1 - Math.abs(step) * motion.squash;
      const flapY = motion.flap > 0 ? 1 + Math.sin(phase) * motion.flap : 1;

      this.sprite.setScale(
        flipSign * this._srcScaleX * squashX,
        this._srcScaleY * squashY * flapY
      );
      // Bob upward and tilt
      this.sprite.y = -bob;
      this.sprite.rotation = tilt;

      // Fliers: elevate body above ground shadow
      if (enemy.flying) {
        this.sprite.y -= this._baseH * 0.35;
      }

      // Tint: hit flash (white) and/or slow (cyan)
      if (typeof this.sprite.setTint === 'function') {
        if (enemy.hitFlash > 0) {
          this.sprite.setTint(0xffffff);
        } else if (isSlowed) {
          this.sprite.setTint(0x5ac8d8);
        } else {
          this.sprite.clearTint();
        }
      }
    }

    // Slow ring visibility - more prominent
    if (isSlowed !== this._prevSlowed) {
      this.slowRing.setAlpha(isSlowed ? 0.6 : 0);
      this._prevSlowed = isSlowed;
    }

    // HP bar
    const ratio = Math.max(0, Math.min(1, enemy.maxHp ? enemy.hp / enemy.maxHp : 0));
    this.hpBar.setSize(this._barW * ratio, 5);
    this.hpBar.setFillStyle(ratio > 0.4 ? 0x6fbf73 : 0xd0563f);
  }

  getEnemyUid() { return this.enemy.uid; }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    super.destroy(true);
  }
}
