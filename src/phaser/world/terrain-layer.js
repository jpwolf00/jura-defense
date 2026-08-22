import Phaser from 'phaser';
import { generateMapLayout } from '../../js/map-layout.js';
import { WAYPOINTS, SLOTS } from '../../js/path.js';
import { MAP_DEFS, expandMap } from '../../js/maps/author-maps.js';
import { resolveMap, validateMapDefinition } from './map-definitions.js';

// Fallback palette — used only when a map definition has no palette.
const FALLBACK_COLORS = {
  mud: 0x755238, stone: 0x777568, grass: 0x527d42,
  rock: 0x6b6b60, fern: 0x3c7a3c, log: 0x70482d,
  cycad: 0x2f6936, puddle: 0x3e7890,
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

/**
 * Resolve the colour table for a map definition.
 * Prefers the authored palette from map-definitions.js, falls back to the
 * global table.
 *
 * @param {Object|null} mapDef  map definition from map-definitions.js
 * @returns {Object}  colour key → 0xRRGGBB
 */
export function resolvePalette(mapDef) {
  if (mapDef?.palette?.colours) return mapDef.palette.colours;
  return FALLBACK_COLORS;
}

/**
 * Pick a palette colour key for an authored landmark.
 * Cycles through the map's decoration palette so each landmark gets a
 * distinct but theme-consistent colour.
 */
export function landmarkColourKey(mapDef, landmark) {
  const decos = mapDef?.palette?.decorations;
  if (!decos || decos.length === 0) return 'rock';
  const landmarks = mapDef.landmarks || [];
  const idx = landmarks.indexOf(landmark);
  return decos[(idx < 0 ? 0 : idx) % decos.length];
}

/**
 * Compute a darkened background tint from the map's dominant palette colour.
 */
export function backgroundTint(mapDef) {
  const pal = mapDef?.palette;
  if (!pal) return 0x263525;
  const hex = pal.colours?.[pal.dominant];
  if (hex === undefined) return 0x263525;
  const r = ((hex >> 16) & 0xff) * 0.25;
  const g = ((hex >> 8) & 0xff) * 0.25;
  const b = (hex & 0xff) * 0.25;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/**
 * TerrainLayer — renders terrain for an authored map.
 *
 * @param {Phaser.Scene} scene
 * @param {Object} options
 * @param {number} [options.map=1]  map number (1 = Jungle Corridor, 2 = Obsidian Flats)
 * @param {number} [options.width=1280]
 * @param {number} [options.height=720]
 */
export default class TerrainLayer extends Phaser.GameObjects.Container {
  constructor(scene, { map = 1, width = 1280, height = 720, parent = null } = {}) {
    super(scene);
    scene.add.existing(this);
    if (parent) {
      parent.add(this);
    }

    this._mapNum = map;

    // Resolve authored map (author-maps.js) for regions/decorations
    const def = MAP_DEFS.find((m) => m.num === map) ?? MAP_DEFS[0];
    this.seed = def.seed;

    // Resolve map-definitions.js for landmarks + palette
    const mapDef = resolveMap(map);
    if (mapDef) {
      const valResult = validateMapDefinition(mapDef);
      if (!valResult.valid) {
        console.warn(`TerrainLayer: map ${map} validation failed:`, valResult.errors);
      }
    }

    // Palette: map-definitions colours take priority over the global table
    const palette = resolvePalette(mapDef);

    // Generate base layout (ground patches)
    const layout = clone(generateMapLayout(this.seed, WAYPOINTS, SLOTS, width, height));

    // Expand with legacy authored decorations
    const expanded = expandMap(def);

    // Build authored landmark render descriptors from map-definitions.
    // These carry geometry (w/h/type) so the renderer can draw them faithfully.
    const authoredLandmarks = (mapDef?.landmarks || []).map((landmark, index) => ({
      x: landmark.x,
      y: landmark.y,
      scale: landmark.scale || 1,
      rotation: 0,
      zIndex: 3,
      kind: landmarkColourKey(mapDef, landmark),
      landmarkId: landmark.id,
      landmarkType: landmark.type,
      landmarkSize: landmark.type === 'rectangle' ? { w: landmark.w, h: landmark.h } : null,
      authoredIndex: index,
      _isAuthoredLandmark: true,
    }));

    // Merge: authored region decorations + authored landmarks from expandMap
    // + authored landmarks from map-definitions (the new presentation layer).
    // Procedural layout.ground is drawn separately below.
    const allDecorations = [
      ...expanded.decorations,
      ...expanded.landmarks,
      ...authoredLandmarks,
    ];

    // Background tint reflects the map palette
    const background = scene.add.graphics();
    background.fillStyle(backgroundTint(mapDef), 1);
    background.fillRect(0, 0, width, height);
    this.add(background);

    this.drawItems(layout.ground, palette);
    this.drawItems(allDecorations, palette);

    // Expose contract data for browser-side verification
    this._palette = palette;
    this._authoredLandmarks = authoredLandmarks;
  }

  /**
   * Draw a list of decoration items using the supplied palette.
   * Authored landmarks render with geometry reflecting their type/size.
   */
  drawItems(items, palette) {
    const colors = palette || FALLBACK_COLORS;
    for (const item of items) {
      const g = this.scene.add.graphics();
      const color = colors[item.kind] ?? FALLBACK_COLORS[item.kind] ?? 0x777777;
      g.setPosition(item.x, item.y);
      g.setRotation(item.rotation);
      g.setScale(item.scale);

      if (item._isAuthoredLandmark) {
        this._drawAuthoredLandmark(g, item, color);
      } else if (item.kind === 'mud' || item.kind === 'stone' || item.kind === 'grass' || item.kind === 'puddle') {
        g.fillStyle(color, item.kind === 'puddle' ? 0.65 : 0.32);
        g.fillEllipse(0, 0, item.kind === 'puddle' ? 28 : 46, item.kind === 'puddle' ? 14 : 28);
      } else if (item.kind === 'rock') {
        g.fillStyle(color, 0.9);
        g.fillTriangle(-13, 8, 13, 8, 1, -12);
      } else if (item.kind === 'log') {
        g.fillStyle(color, 0.9);
        g.fillRoundedRect(-17, -5, 34, 10, 4);
      } else {
        // fern, cycad, etc. — triangular fronds
        g.fillStyle(color, 0.9);
        for (let i = -2; i <= 2; i++) {
          g.fillTriangle(i * 4 - 2, 8, i * 4 + 2, 8, i * 4, -8 - Math.abs(i) * 2);
        }
      }
      g.setDepth(item.zIndex || 0);
      this.add(g);
    }
  }

  /**
   * Render an authored landmark with geometry that reflects its type and size.
   * Uses only Phaser primitives — no external asset imports.
   */
  _drawAuthoredLandmark(g, item, color) {
    if (item.landmarkType === 'rectangle' && item.landmarkSize) {
      const { w, h } = item.landmarkSize;
      const rad = Math.min(w, h) * 0.18;
      // Main body — filled rounded rectangle at authored w/h
      g.fillStyle(color, 0.85);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, rad);
      // Top highlight for depth
      g.fillStyle(0xffffff, 0.1);
      g.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.35, 3);
      // Border stroke
      g.lineStyle(1.5, color, 0.55);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, rad);
    } else {
      // point — filled circle with outer ring
      const r = 10;
      g.fillStyle(color, 0.85);
      g.fillCircle(0, 0, r);
      g.lineStyle(1.5, color, 0.5);
      g.strokeCircle(0, 0, r + 4);
    }
  }

  getLayout() {
    return { seed: this.seed, mapNum: this._mapNum };
  }

  getSeed() { return this.seed; }

  getMapNumber() { return this._mapNum; }

  /** Expose the resolved palette for contract checks. */
  getPalette() { return { ...this._palette }; }

  /** Expose authored landmark descriptors for contract checks. */
  getAuthoredLandmarks() { return this._authoredLandmarks.map((l) => ({ ...l })); }
}
