import Phaser from 'phaser';

function toColor(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  return 0xffffff;
}

export default class EnemySprite extends Phaser.GameObjects.Container {
  constructor(scene, enemy, parent = null) {
    super(scene);
    this.enemy = enemy;
    this.body = scene.add.circle(0, 0, enemy.radius, toColor(enemy.t.color));
    this.hpBarBg = scene.add.rectangle(0, -enemy.radius - 6, 32, 4, 0x101820, 0.8);
    this.hpBar = scene.add.rectangle(-16, -enemy.radius - 6, 32, 3, 0x86e07b, 1).setOrigin(0, 0.5);
    this.add([this.hpBarBg, this.hpBar, this.body]);
    scene.add.existing(this);
    this.setVisible(false);
    // ── Touch-safe hit area ──────────────────────────────────────────
    // Ensure enemy containers are tap-able even when small.
    const eHitR = Math.max(enemy.radius, 16); // ≥ 32 px diameter
    this._hitArea = new Phaser.Geom.Circle(0, 0, eHitR);
    this.setInteractive(this._hitArea, Phaser.Geom.Circle.Contains);
    if (parent) {
      parent.add(this);
    }
  }

  syncFromEnemy() {
    const enemy = this.enemy;
    if (enemy.dead) { this.setVisible(false); return; }
    this.setVisible(true);
    this.setPosition(enemy.x, enemy.y);
    if (!enemy.flying) this.setRotation(enemy.heading);
    const color = enemy.hitFlash > 0 ? 0xffffff
      : enemy.slowUntil > performance.now() ? 0x5ac8d8
      : toColor(enemy.t.color);
    this.body.setFillStyle(color, 1);
    const ratio = Math.max(0, Math.min(1, enemy.maxHp ? enemy.hp / enemy.maxHp : 0));
    this.hpBar.setSize(32 * ratio, 3);
  }

  getEnemyUid() { return this.enemy.uid; }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    // Container.destroy(true) removes this from scene and its children
    // (body, hpBar, hpBarBg were added via this.add() so they are auto-destroyed).
    super.destroy(true);
  }
}
