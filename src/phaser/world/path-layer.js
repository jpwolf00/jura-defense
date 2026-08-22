import Phaser from 'phaser';
import { WAYPOINTS, SLOTS, VIEW_W, VIEW_H } from '../../js/path.js';
import { TOWER_TYPES } from '../../js/tower.js';

export default class PathLayer extends Phaser.GameObjects.Container {
  constructor(scene, options = {}) {
    super(scene);
    const parent = options.parent;
    scene.add.existing(this);
    if (parent) {
      parent.add(this);
    }

    // ── Responsive scaling ──────────────────────────────────────────────
    // In RESIZE mode, the canvas dimensions may be smaller than the virtual
    // 1280x720 coordinate space. Scale the entire path layer to fit.
    const canvasW = scene.scale.width;
    const canvasH = scene.scale.height;
    const scaleX = canvasW / VIEW_W;
    const scaleY = canvasH / VIEW_H;
    const scale = Math.min(scaleX, scaleY);
    this.setScale(scale);
    this._pathScale = scale; // expose for coordinate mapping

    // ── Touch-safe sizing ────────────────────────────────────────────────
    // Minimum 48 px diameter for every interactive marker (WCAG 2.5.5).
    // markerRadius is the visual radius; hitRadius is the effective pointer
    // target (px).  A 48 px target means the finger tip overlaps the marker
    // without accidentally hitting a neighbour.
    // After container scaling, the local hit radius must be larger so the
    // world-space hit target remains ≥ 48 px diameter.
    const shoulderWidth = options.shoulderWidth ?? 24;
    const shoulderColor = options.shoulderColor ?? 0x1a1a2e;
    const routeWidth = options.routeWidth ?? 12;
    const routeColor = options.routeColor ?? 0xf5e6c8;
    const markerRadius = options.markerRadius ?? 14;
    const markerColor = options.markerColor ?? 0x4fc3f7;
    const markerStroke = options.markerStroke ?? 0xffffff;
    const minWorldHitRadius = 24; // ≥ 48 px diameter in world/canvas space
    const hitRadius = Math.max(minWorldHitRadius / scale, markerRadius * 2);

    this._slotOccupancy = new Map(); // slotIndex -> tower.type or null
    this._slotMarkers = [];
    this._ghostSprites = []; // preview towers on hover
    this._hoveredSlotIndex = -1;
    this._hoveredTowerType = null;

    const graphics = scene.add.graphics();
    this.add(graphics);
    graphics.lineStyle(shoulderWidth, shoulderColor, 1);
    this._strokePath(graphics, WAYPOINTS);
    graphics.lineStyle(routeWidth, routeColor, 1);
    this._strokePath(graphics, WAYPOINTS);

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const marker = scene.add.arc(slot.x, slot.y, markerRadius, 0, 360);
      this.add(marker);
      marker.setFillStyle(markerColor, 0.85);
      marker.setStrokeStyle(2, markerStroke, 1);
      marker.setData('slotIndex', i);
      // Expand hit area beyond visual radius so the finger tip does not
      // miss a 28 px marker when aiming on a phone screen.
      const hitArea = new Phaser.Geom.Circle(0, 0, hitRadius);
      marker.setInteractive(hitArea, Phaser.Geom.Circle.Contains, { cursor: 'pointer' });
      marker.on('pointerover', () => {
        this._hoveredSlotIndex = i;
        this._emitSlotHover(i);
      });
      marker.on('pointerout', () => {
        this._hoveredSlotIndex = -1;
        this._emitSlotHover(-1);
      });
      marker.on('pointerdown', (pointer) => {
        const idx = marker.getData('slotIndex');
        this.emit('slotclick', { index: idx, x: slot.x, y: slot.y, occupied: this.isSlotOccupied(idx) });
      });
      this._slotMarkers.push(marker);
    }
  }

  _strokePath(graphics, waypoints) {
    if (waypoints.length < 2) return;
    graphics.beginPath();
    graphics.moveTo(waypoints[0][0], waypoints[0][1]);
    for (let i = 1; i < waypoints.length; i++) graphics.lineTo(waypoints[i][0], waypoints[i][1]);
    graphics.strokePath();
  }

  getWaypoints() { return WAYPOINTS.map(([x, y]) => [x, y]); }
  getSlots() { return SLOTS.map((slot) => ({ ...slot })); }
  getSlotOccupancy() { return new Map(this._slotOccupancy); }
  isSlotOccupied(index) { return this._slotOccupancy.has(index) && this._slotOccupancy.get(index) !== null; }
  occupySlot(index, towerType) { this._slotOccupancy.set(index, towerType); }
  clearSlot(index) { this._slotOccupancy.delete(index); }

  getHoveredSlot() {
    if (this._hoveredSlotIndex < 0) return null;
    return { index: this._hoveredSlotIndex, ...SLOTS[this._hoveredSlotIndex], occupied: this.isSlotOccupied(this._hoveredSlotIndex) };
  }

  setHoverTowerType(type) {
    this._hoveredTowerType = type;
    this._renderGhosts();
  }

  _emitSlotHover(index) {
    this.emit('slothover', index >= 0 ? { index, ...SLOTS[index], occupied: this.isSlotOccupied(index) } : null);
  }

  _renderGhosts() {
    // Remove old ghost towers
    this._ghostSprites.forEach((g) => this.remove(g, true, true));
    this._ghostSprites = [];
    if (!this._hoveredTowerType) return;
    const hovered = this.getHoveredSlot();
    if (!hovered || hovered.occupied) return;
    const t = TOWER_TYPES[this._hoveredTowerType];
    if (!t) return;
    
    // Get current money from wave bridge
    const money = globalThis.__juraWaveBridge?.state()?.money ?? 0;
    const canAfford = money >= t.cost;
    
    // Range ring — green if affordable, red if not
    const ringColor = canAfford ? color(t.color) : 0xff3333;
    const ringAlpha = canAfford ? 0.15 : 0.08;
    const ring = this.scene.add.circle(hovered.x, hovered.y, t.range, ringColor, ringAlpha);
    ring.setDepth(10);
    this.add(ring);
    this._ghostSprites.push(ring);
    
    // Tower silhouette — ghost tower shape
    const silhouette = this.scene.add.graphics();
    silhouette.setDepth(11);
    
    // Draw tower shape (simplified version of tower sprite)
    const size = 20;
    const half = size / 2;
    const alpha = canAfford ? 0.6 : 0.3;
    
    silhouette.fillStyle(color(t.color), alpha);
    
    // Draw based on tower type shape
    if (this._hoveredTowerType === 'tranq') {
      silhouette.fillRect(hovered.x - half, hovered.y - half, size, size);
    } else if (this._hoveredTowerType === 'fence') {
      silhouette.beginPath();
      silhouette.moveTo(hovered.x, hovered.y - half);
      silhouette.lineTo(hovered.x - half, hovered.y + half * 0.5);
      silhouette.lineTo(hovered.x + half, hovered.y + half * 0.5);
      silhouette.closePath();
      silhouette.fillPath();
    } else if (this._hoveredTowerType === 'drone') {
      silhouette.beginPath();
      silhouette.moveTo(hovered.x, hovered.y - half);
      silhouette.lineTo(hovered.x + half, hovered.y);
      silhouette.lineTo(hovered.x, hovered.y + half);
      silhouette.lineTo(hovered.x - half, hovered.y);
      silhouette.closePath();
      silhouette.fillPath();
    } else if (this._hoveredTowerType === 'heli') {
      silhouette.fillCircle(hovered.x, hovered.y, half);
    } else if (this._hoveredTowerType === 'chrono') {
      const r = half * 0.9;
      silhouette.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = hovered.x + Math.cos(a) * r;
        const py = hovered.y + Math.sin(a) * r;
        if (i === 0) silhouette.moveTo(px, py);
        else silhouette.lineTo(px, py);
      }
      silhouette.closePath();
      silhouette.fillPath();
    }
    
    // Outline
    silhouette.lineStyle(2, canAfford ? 0xffffff : 0xff3333, 0.8);
    silhouette.strokeCircle(hovered.x, hovered.y, half + 2);
    
    this.add(silhouette);
    this._ghostSprites.push(silhouette);
    
    // Cost label
    const costLabel = this.scene.add.text(hovered.x, hovered.y + half + 8, `$${t.cost}`, {
      fontSize: '12px',
      color: canAfford ? '#e0a458' : '#ff3333',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    this.add(costLabel);
    this._ghostSprites.push(costLabel);
  }

  highlightSlot(index, color, alpha = 0.6) {
    if (this._slotMarkers[index]) {
      this._slotMarkers[index].setFillStyle(color, alpha);
    }
  }

  resetSlotHighlight(index) {
    if (this._slotMarkers[index]) {
      this._slotMarkers[index].setFillStyle(0x4fc3f7, 0.85);
    }
  }
}

function color(value) {
  return typeof value === 'number' ? value : Number.parseInt(String(value).replace('#', ''), 16);
}
