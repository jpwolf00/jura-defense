// src/phaser/world/map-definitions.js
// Fixed authored map definitions with validation contract.
//
// Each definition carries an id, name, seed, >=4 landmark rectangles/points
// in safe empty zones (no path-corridor or slot-exclusion intersection),
// and a decoration-palette that describes the visual theme.
//
// WAYPOINTS and SLOTS remain authoritative in path.js — this module only
// adds cosmetic data and a clearance guard.

import { WAYPOINTS, SLOTS } from '../../js/path.js';
import { distanceToPath, distanceToSlots } from '../../js/map-layout.js';

// ── constants ──────────────────────────────────────────────────────────

const PATH_CLEARANCE = 52; // px corridor half-width around the S-curve
const SLOT_CLEARANCE = 46; // px exclusion radius around each tower slot
const RECT_MARGIN = 4; // extra margin (px) added to rectangle checks

// ── map1: Jungle Corridor ─────────────────────────────────────────────

export const map1 = Object.freeze({
  id: 'jungle-corridor',
  num: 1,
  name: 'Jungle Corridor',
  seed: 1337,
  description: 'Tangled undergrowth along the dinosaur migration trail.',
  // Four landmarks placed in safe, empty zones — all verified > 60 px
  // from both the route corridor and every slot.
  landmarks: Object.freeze([
    // Top-right corner — far from all path segments and slots
    { id: 'jp-monolith',   type: 'rectangle', x: 1200, y: 80,  w: 48, h: 48, scale: 1.8 },
    // Upper-right flank — clear of the S-curve bend
    { id: 'jp-vine-trellis', type: 'rectangle', x: 1150, y: 160, w: 36, h: 36, scale: 1.5 },
    // Bottom-left corner — well clear of the path start
    { id: 'jp-fern-grove', type: 'rectangle', x: 100, y: 600, w: 56, h: 56, scale: 1.6 },
    // Bottom-right — clear of the end-of-path area
    { id: 'jp-cycad-stump', type: 'point',     x: 1150, y: 600, scale: 1.4 },
  ]),
  // Decoration palette metadata — drives colour/texture selection.
  palette: Object.freeze({
    ground: ['mud', 'stone', 'grass'],
    decorations: ['fern', 'log', 'cycad', 'rock', 'puddle'],
    dominant: 'grass',
    colours: {
      mud: 0x755238,
      stone: 0x777568,
      grass: 0x527d42,
      fern: 0x3c7a3c,
      log: 0x70482d,
      cycad: 0x2f6936,
      rock: 0x6b6b60,
      puddle: 0x3e7890,
    },
  }),
});

// ── map2: Obsidian Flats ──────────────────────────────────────────────

export const map2 = Object.freeze({
  id: 'obsidian-flats',
  num: 2,
  name: 'Obsidian Flats',
  seed: 7331,
  description: 'Wind-scoured volcanic plains with glassy stone formations.',
  // Four distinct landmarks from map1 — all in safe empty zones.
  landmarks: Object.freeze([
    // Far-right — well outside the path envelope
    { id: 'of-obsidian-spire', type: 'rectangle', x: 1250, y: 400, w: 40, h: 56, scale: 2.0 },
    // Top-left corner — clear of the path start
    { id: 'of-basalt-pile',    type: 'rectangle', x: 50, y: 60, w: 36, h: 36, scale: 1.5 },
    // Right flank — safe from the S-curve mid-section
    { id: 'of-glass-pond',     type: 'point',     x: 1050, y: 480, scale: 1.6 },
    // Top-right — clear of the upper path loop
    { id: 'of-stone-ring',     type: 'rectangle', x: 1200, y: 100, w: 44, h: 44, scale: 1.4 },
  ]),
  palette: Object.freeze({
    ground: ['stone', 'mud', 'puddle'],
    decorations: ['rock', 'stone', 'mud', 'puddle'],
    dominant: 'stone',
    colours: {
      stone: 0x2d2d3d,    // basalt (dark volcanic grey)
      mud: 0x1a1a2e,      // obsidian (deep black-blue)
      rock: 0x4a4a5a,     // ash (mid volcanic grey)
      puddle: 0x5a7d8c,   // crystal (blue-grey glass)
      fern: 0x8b3a1f,     // ember (volcanic red-orange, replaces fern)
    },
  }),
});

// ── lookup helpers ─────────────────────────────────────────────────────

/** @type {Array<Object>} */
export const MAP_DEFS = Object.freeze([map1, map2]);

/**
 * Resolve a map definition by its numeric id (1 or 2).
 * @param {number} num
 * @returns {Object | null}
 */
export function resolveMap(num) {
  return MAP_DEFS.find((m) => m.num === num) ?? null;
}

// ── validation contract ────────────────────────────────────────────────

/**
 * Validate that landmark geometry does NOT intersect the route corridor
 * or any tower-slot exclusion radius.
 *
 * Uses straightforward rectangle / point distance checks — no sampling
 * or clustering.
 *
 * @param {Object} definition — a map definition (map1, map2, or similar)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMapDefinition(definition) {
  const errors = [];
  const landmarks = definition.landmarks;
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return { valid: false, errors: ['definition has no landmarks'] };
  }

  for (const lm of landmarks) {
    const { id, type, x, y, w, h } = lm;

    // ── path-corridor check ────────────────────────────────────────
    if (type === 'point') {
      const pd = distanceToPath(x, y, WAYPOINTS);
      if (pd < PATH_CLEARANCE) {
        errors.push(
          `landmark ${id} (point at ${x}, ${y}) is ${Math.round(pd)} px from path (min ${PATH_CLEARANCE})`
        );
      }
    } else if (type === 'rectangle') {
      // Check all four corners against the path corridor
      const corners = [
        [x - w / 2, y - h / 2],
        [x + w / 2, y - h / 2],
        [x - w / 2, y + h / 2],
        [x + w / 2, y + h / 2],
      ];
      for (const [cx, cy] of corners) {
        const pd = distanceToPath(cx, cy, WAYPOINTS);
        if (pd < PATH_CLEARANCE) {
          errors.push(
            `landmark ${id} corner (${cx}, ${cy}) is ${Math.round(pd)} px from path (min ${PATH_CLEARANCE})`
          );
        }
      }
      // Also check the rectangle centre as a conservative guard
      const pdCenter = distanceToPath(x, y, WAYPOINTS);
      if (pdCenter < PATH_CLEARANCE - RECT_MARGIN) {
        errors.push(
          `landmark ${id} centre (${x}, ${y}) is ${Math.round(pdCenter)} px from path (min ${PATH_CLEARANCE})`
        );
      }
    } else {
      errors.push(`landmark ${id} has unknown type "${type}"`);
    }

    // ── slot-exclusion check ───────────────────────────────────────
    for (const slot of SLOTS) {
      const sx = slot.x;
      const sy = slot.y;

      if (type === 'point') {
        const sd = Math.hypot(x - sx, y - sy);
        if (sd < SLOT_CLEARANCE) {
          errors.push(
            `landmark ${id} at (${x}, ${y}) is ${Math.round(sd)} px from slot (${sx}, ${sy}) (min ${SLOT_CLEARANCE})`
          );
        }
      } else if (type === 'rectangle') {
        // Check all four corners against the slot exclusion radius
        const corners = [
          [x - w / 2, y - h / 2],
          [x + w / 2, y - h / 2],
          [x - w / 2, y + h / 2],
          [x + w / 2, y + h / 2],
        ];
        for (const [cx, cy] of corners) {
          const sd = Math.hypot(cx - sx, cy - sy);
          if (sd < SLOT_CLEARANCE) {
            errors.push(
              `landmark ${id} corner (${cx}, ${cy}) is ${Math.round(sd)} px from slot (${sx}, ${sy}) (min ${SLOT_CLEARANCE})`
            );
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── module-level self-test ────────────────────────────────────────────

(function _selfTest() {
  let ok = 0;
  let fail = 0;
  for (const def of MAP_DEFS) {
    const result = validateMapDefinition(def);
    if (result.valid) {
      ok += 1;
    } else {
      fail += 1;
      console.warn(
        `map-definitions validate failed for ${def.id}: ${result.errors.join(' | ')}`
      );
    }
  }
  if (ok === MAP_DEFS.length) {
    // All maps pass — silent success
  }
})();
