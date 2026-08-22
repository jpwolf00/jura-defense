/**
 * Tower Shelf — bottom bar of tower-type selection buttons.
 *
 * Each slot shows: tower icon (shape + color), name, cost, and current level.
 * Selected tower has a bright outline; too-expensive towers are dimmed.
 * Clicking a slot sets the player's build type on the scene.
 *
 * P3-06: Tower types are distinguishable without color alone — each uses a
 *        unique shape (square, triangle, diamond, circle, hexagon) so color
 *        blindness or contrast issues do not obscure tower identity.
 *
 * All objects are Phaser primitives; none are DOM.
 * Destroyed on scene shutdown via scene.events.once('shutdown').
 */

import Phaser from 'phaser';
import { TOWER_TYPES } from '../../js/tower.js';

const SLOT_W = 90;  // px
const SLOT_H = 64;  // px
const SLOT_PAD = 10;
const SLOT_Y_RATIO = 0.92; // 92% down from top of canvas
const SLOT_GAP = 8;

const ACCENT_COLORS = {
  tranq: 0x66bb6a,
  fence: 0xffeb3b,
  drone: 0x42a5f5,
  heli:  0xef5350,
  chrono:0xab47bc,
};

// P3-06: Shape identifiers per tower type so types are distinguishable
// without relying on color alone.
const TOWER_SHAPES = {
  tranq:  'square',    // 4 sides — blocky, stable
  fence:  'triangle',  // 3 sides — pointed up
  drone:  'diamond',   // 4 sides rotated — agile
  heli:   'circle',    // round — orbital
  chrono: 'hexagon',   // 6 sides — complex
};

/**
 * Draw a solid shape (fill only) inside the given Graphics,
 * centred at (0, 0). The shape is drawn in `color`.
 */
function drawShape(graphics, shape, size, color) {
  const half = size / 2;
  switch (shape) {
    case 'square':
      graphics.fillRect(-half, -half, size, size);
      break;
    case 'triangle': {
      const h = size * 0.866; // sqrt(3)/2
      graphics.beginPath();
      graphics.moveTo(0, -half);
      graphics.lineTo(-half, h * 0.5);
      graphics.lineTo(half, h * 0.5);
      graphics.closePath();
      graphics.fillPath();
      break;
    }
    case 'diamond': {
      graphics.beginPath();
      graphics.moveTo(0, -half);
      graphics.lineTo(half, 0);
      graphics.lineTo(0, half);
      graphics.lineTo(-half, 0);
      graphics.closePath();
      graphics.fillPath();
      break;
    }
    case 'circle':
      graphics.fillCircle(0, 0, half);
      break;
    case 'hexagon': {
      const r = half * 0.9;
      graphics.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) graphics.moveTo(px, py);
        else graphics.lineTo(px, py);
      }
      graphics.closePath();
      graphics.fillPath();
      break;
    }
    default:
      graphics.fillCircle(0, 0, half);
  }
}

export class TowerShelf {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this._scene = scene;
    this._group = scene.add.container(0, 0);
    this._group.setScrollFactor(0).setDepth(70);
    this._slots = []; // [{container, bg, icon, shape, nameText, costText, selected}]
    this._selectedType = null;
    this._active = false;
  }

  /* ── helpers ──────────────────────────────────────────────────────── */

  _makeSlot(index) {
    const scene = this._scene;
    const s = scene._uiScale?.() ?? 1;
    const sw = SLOT_W * s;
    const sh = SLOT_H * s;
    const totalW = this._slots.length * (sw + SLOT_GAP) + SLOT_GAP;
    const startX = Math.max(10, (scene.scale.width - totalW) / 2);
    const x = startX + index * (sw + SLOT_GAP) + sw / 2;
    const y = scene.scale.height * SLOT_Y_RATIO;

    const bg = scene.add.rectangle(x, y, sw, sh, 0x17231d, 0.85)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setStrokeStyle(2, 0x3a4a3f, 0.6)
      .setInteractive(new Phaser.Geom.Rectangle(-sw / 2, -sh / 2, sw, sh), Phaser.Geom.Rectangle.Contains);

    const container = scene.add.container(x, y);
    container.add(bg);

    bg.on('pointerover', () => {
      slotData._hovered = true;
      if (!slotData.selected) bg.setTint(0x2a3a30);
    });
    bg.on('pointerout', () => {
      slotData._hovered = false;
      bg.clearTint();
      if (slotData.selected) {
        bg.setStrokeStyle(3, 0x6fe3c1);
      }
    });
    bg.on('pointerdown', () => {
      const type = slotData.type;
      if (type && scene._onTowerTypeSelect) {
        scene._onTowerTypeSelect(type);
      }
    });

    const slotData = {
      type: null,
      bg,
      container,
      icon: null,
      shape: null,       // P3-06: shape identifier for accessibility
      nameText: null,
      costText: null,
      selected: false,
      x, y, w: sw, h: sh,
    };
    this._slots.push(slotData);
    scene.events.once('shutdown', () => {
      container.destroy();
      bg.off();
    });
    return slotData;
  }

  /* ── public API ───────────────────────────────────────────────────── */

  /** Populate the shelf with all tower types. */
  build(types, state) {
    const scene = this._scene;
    this._slots = [];

    for (const type of types) {
      const data = this._makeSlot(types.indexOf(type));
      data.type = type;
      const tt = TOWER_TYPES[type];
      if (!tt) continue;

      const s = scene._uiScale?.() ?? 1;
      const sw = data.w;
      const sh = data.h;
      const ui = Math.max(0.4, s);

      // P3-06: Icon uses shape + color (not color only)
      const iconSize = 24 * ui;
      const shapeName = TOWER_SHAPES[type] || 'circle';
      const icon = scene.add.graphics().setScrollFactor(0).setDepth(71);
      drawShape(icon, shapeName, iconSize, ACCENT_COLORS[type] || 0xffffff);
      data.icon = icon;
      data.shape = shapeName;

      // P3-06: Subtle outline ring for contrast at any scale
      const outline = scene.add.graphics().setScrollFactor(0).setDepth(70);
      outline.lineStyle(2 * ui, 0x000000, 0.4);
      outline.fillCircle(0, 0, iconSize * 0.7);
      data.outline = outline;

      // Name
      const nameText = scene.add.text(0, -6 * ui, tt.name, {
        fontSize: `${Math.max(10, 12 * ui)}px`,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }).setScrollFactor(0).setDepth(71);
      data.nameText = nameText;

      // Cost
      const costText = scene.add.text(0, 10 * ui, `$${tt.cost}`, {
        fontSize: `${Math.max(10, 12 * ui)}px`,
        color: '#e0a458',
        stroke: '#000000',
        strokeThickness: 2,
      }).setScrollFactor(0).setDepth(71);
      data.costText = costText;

      data.container.add([icon, outline, nameText, costText]);
    }
  }

  /** Update shelf appearance based on current game state. */
  update(state) {
    const canAfford = (cost) => state.money >= cost;

    for (const data of this._slots) {
      if (!data.type) continue;
      const tt = TOWER_TYPES[data.type];
      if (!tt) continue;

      const affordable = canAfford(tt.cost);
      const isSelected = this._selectedType === data.type;
      const isHovered = data._hovered;

      // Visual state: occupied/free/hovered/invalid/selected
      if (isSelected) {
        // Selected state: bright cyan outline, full opacity
        data.bg.setStrokeStyle(3, 0x6fe3c1);
        data.bg.setAlpha(1);
        data.bg.setFillStyle(0x2a3a30, 0.95);
      } else if (isHovered && affordable) {
        // Hovered state: highlighted, slightly brighter
        data.bg.setStrokeStyle(2, 0x6fe3c1, 0.8);
        data.bg.setAlpha(0.95);
        data.bg.setFillStyle(0x1f2f25, 0.9);
      } else if (!affordable) {
        // Invalid/unaffordable state: dimmed, red-tinted border
        data.bg.setStrokeStyle(2, 0x5a2020, 0.6);
        data.bg.setAlpha(0.4);
        data.bg.setFillStyle(0x17231d, 0.5);
      } else {
        // Free/available state: normal appearance
        data.bg.setStrokeStyle(2, 0x3a4a3f, 0.6);
        data.bg.setAlpha(0.85);
        data.bg.setFillStyle(0x17231d, 0.85);
      }

      // Icon + outline: keep shape visible, dim if unaffordable
      if (data.icon) {
        data.icon.setAlpha(affordable ? 1 : 0.35);
      }
      if (data.outline) {
        data.outline.setAlpha(affordable ? 0.4 : 0.08);
      }

      // Name + cost: dim if unaffordable
      if (data.nameText) {
        data.nameText.setAlpha(affordable ? 1 : 0.45);
        data.nameText.setColor(isSelected ? '#6fe3c1' : '#ffffff');
      }
      if (data.costText) {
        data.costText.setAlpha(affordable ? 1 : 0.45);
        // S07: Add text cue for unaffordable — show "✕" prefix when can't afford
        const costPrefix = affordable ? '' : '✕ ';
        data.costText.setText(`${costPrefix}$${tt.cost}`);
        data.costText.setColor(affordable ? '#e0a458' : '#666666');
      }
    }
  }

  /** Set the selected tower type (called by scene on player click). */
  setSelectedType(type) {
    this._selectedType = type;
  }

  /** Get current selected type. */
  getSelectedType() {
    return this._selectedType;
  }

  /** Get shelf slot positions for contract exposure. */
  getSlots() {
    return this._slots.map(d => ({ type: d.type, x: d.x, y: d.y, w: d.w, h: d.h }));
  }

  /** Destroy all objects owned by this shelf. */
  destroy() {
    if (this._group) this._group.destroy();
    this._slots = [];
    this._active = false;
  }
}
