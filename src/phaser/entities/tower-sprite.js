import Phaser from 'phaser';
import { TOWER_TYPES } from '../../js/tower.js';

function color(value) {
  return typeof value === 'number' ? value : Number.parseInt(String(value).replace('#', ''), 16);
}

export default class TowerSprite extends Phaser.GameObjects.Container {
  constructor(scene, tower, parent = null) {
    super(scene, tower.x, tower.y);
    this.tower = tower;
    this.selected = false;
    this.base = scene.add.circle(0, 0, 24, 0x243029, 1);
    this.ring = scene.add.circle(0, 0, 24, color(tower.t.color), 0.15);
    this.barrel = scene.add.rectangle(16, 0, 25, 7, color(tower.t.color), 1);
    this.core = scene.add.circle(0, 0, 11, color(tower.t.color), 1);
    this.add([this.ring, this.base, this.barrel, this.core]);
    scene.add.existing(this);
    if (parent) {
      parent.add(this);
    }
    // ── Touch-safe hit area ──────────────────────────────────────────
    // Visual size is 52 px; bump interactive target to 64 px diameter so
    // a finger tap reliably hits placed towers on small screens.
    const hitRadius = 32; // 64 px diameter
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

  syncFromTower() {
    const tower = this.tower;
    if (!tower || !tower.t) return;
    this.setPosition(tower.x, tower.y);
    this.barrel.setRotation(tower.target ? tower.angle : tower.restAngle || 0);
    this.ring.setRadius(tower.range / 4);
    this.ring.setAlpha(this.selected ? 0.2 : 0.08);
    this.core.setFillStyle(color(tower.t.color), tower.flash > 0 ? 1 : 0.9);
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
