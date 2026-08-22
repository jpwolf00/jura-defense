// P3-01: Author map definitions.
//
// Each authored map specifies decorative regions and landmark regions seeded
// from the existing map-layout helpers (path.js waypoints + slots). The route
// and slots stay authoritative — this module only adds visual flavour and
// a clearance validation contract that ensures regions do not encroach on
// the path or tower slots.
//
// The two maps are genuinely distinct:
//   map 1 = "Jungle Corridor"  — green, fern, log, cycad palette
//   map 2 = "Obsidian Flats"   — stone, rock, mud, puddle palette
//
// Usage:
//   import { MAP_DEFS, validateMap } from './author-maps.js';
//   const def = MAP_DEFS[mapNumber];
//   const errors = validateMap(def);
//   if (errors.length === 0) { /* use def */ }

import { WAYPOINTS, SLOTS } from '../path.js';
import { distanceToPath, distanceToSlots } from '../map-layout.js';

// ── constants ──────────────────────────────────────────────────────────

const MIN_PATH_DIST = 52;  // same as PATH_CLEARANCE in map-layout.js
const MIN_SLOT_DIST = 46;  // same as SLOT_CLEARANCE

// ── map definitions ────────────────────────────────────────────────────

/**
 * @typedef {Object} Region
 * @property {string} id  unique slug (e.g. "fern-nook")
 * @property {string} kind one of the decoration kinds from map-layout.js
 * @property {number} cx  region centre virtual-x
 * @property {number} cy  region centre virtual-y
 * @property {number} r   region radius (clustering radius)
 * @property {number} n   how many decorations to place in this region
 */

/**
 * @typedef {Object} Landmark
 * @property {string} id  unique slug (e.g. "monolith")
 * @property {string} kind decoration kind (larger visual element)
 * @property {number} x   position
 * @property {number} y   position
 * @property {number} scale 1.2 – 2.0
 */

/**
 * @typedef {Object} AuthorMap
 * @property {number}  num             map identifier (1 or 2)
 * @property {string}  name            human-readable name
 * @property {string}  description     one-line pitch
 * @property {number}  seed            deterministic seed (reuses map-layout mulberry32)
 * @property {Region[]}  regions        decorative regions
 * @property {Landmark[]} landmarks     landmark decorations
 */

/** @type {AuthorMap[]} */
export const MAP_DEFS = Object.freeze([
  // map 1 — "Jungle Corridor" (default; existing behaviour)
  Object.freeze({
    num: 1,
    name: 'Jungle Corridor',
    description: 'Tangled undergrowth along the dinosaur migration trail.',
    seed: 1337,
    regions: Object.freeze([
      // Top-left foliage cluster (far from path at y=140)
      { id: 'fern-nw',   kind: 'fern',  cx: 70,   cy: 50,  r: 35, n: 8  },
      // Bottom-left log pile (corner, far from path and slots)
      { id: 'log-sw',    kind: 'log',   cx: 55,   cy: 610, r: 45, n: 6  },
      // Left-edge fern grove (below path at y=380, above path at y=560)
      { id: 'fern-mid',  kind: 'fern',  cx: 80,   cy: 462, r: 30, n: 7  },
      // Bottom-mid cycad patch (below path at y=560, far from slot at 680,650)
      { id: 'cycad-s',   kind: 'cycad', cx: 790,  cy: 680, r: 25, n: 9  },
      // Far right-side ferns (far from path at x=980)
      { id: 'fern-ne',   kind: 'fern',  cx: 1180, cy: 70,  r: 40, n: 7  },
      // Bottom-right foliage (far right, far from path at 1080→1320 x 660)
      { id: 'fern-se',   kind: 'fern',  cx: 1220, cy: 560, r: 20, n: 10 },
      // Top-right cycads (far right, no overlap with fern-ne)
      { id: 'cycad-ne',  kind: 'cycad', cx: 1200, cy: 170, r: 35, n: 5  },
    ]),
    landmarks: Object.freeze([
      { id: 'jungle-monolith', kind: 'cycad',  x: 60,   y: 200,  scale: 1.8 },
      { id: 'moss-ruin',       kind: 'log',    x: 1150, y: 380,  scale: 1.5 },
    ]),
  }),

  // map 2 — "Obsidian Flats" (distinct visual palette)
  Object.freeze({
    num: 2,
    name: 'Obsidian Flats',
    description: 'Wind-scoured volcanic plains with glassy stone formations.',
    seed: 7331,
    regions: Object.freeze([
      // Top-left stone scatter (corner, far from path)
      { id: 'stone-nw',   kind: 'stone',  cx: 50,   cy: 50,  r: 30, n: 10 },
      // Bottom-left mud patches (far from path at y=380 and slots)
      { id: 'mud-sw',     kind: 'mud',    cx: 55,   cy: 630, r: 35, n: 8  },
      // Mid-left puddles (left edge, below path at y=380)
      { id: 'puddle-mid', kind: 'puddle', cx: 60,   cy: 470, r: 30, n: 6  },
      // Bottom-mid rock cluster (below path at y=560, far from slot at 680,650)
      { id: 'rock-s',     kind: 'rock',   cx: 800,  cy: 680, r: 20, n: 9  },
      // Top-right stone field (far right, far from path)
      { id: 'stone-ne',   kind: 'stone',  cx: 1180, cy: 50,  r: 40, n: 8  },
      // Bottom-right mud/rock mix (far right, safe from path)
      { id: 'mud-se',     kind: 'mud',    cx: 1170, cy: 550, r: 25, n: 7  },
      // Mid-right puddles (safe, away from path and slots)
      { id: 'puddle-mr',  kind: 'puddle', cx: 1280, cy: 250, r: 25, n: 5  },
      // Top-mid stone (far above path at y=140)
      { id: 'stone-mid',  kind: 'stone',  cx: 700,  cy: 50,  r: 35, n: 7  },
    ]),
    landmarks: Object.freeze([
      { id: 'obsidian-spire',  kind: 'rock',   x: 60,    y: 300, scale: 2.0 },
      { id: 'glass-pond',      kind: 'puddle', x: 1180,  y: 140, scale: 1.6 },
    ]),
  }),
]);

// ── lookup helpers ─────────────────────────────────────────────────────

/**
 * Resolve a map definition by its numeric id.
 * @param {number} num
 * @returns {AuthorMap | null}
 */
export function resolveMap(num) {
  return MAP_DEFS.find((m) => m.num === num) ?? null;
}

// ── clearance validation contract ──────────────────────────────────────

/**
 * Validate that every region and landmark in a map has safe clearance
 * from the path and tower slots. Returns an array of error strings
 * (empty = valid).
 *
 * @param {AuthorMap} map
 * @returns {string[]}
 */
export function validateMap(map) {
  const errors = [];

  for (const region of map.regions) {
    // Sample the region perimeter (8 directions) + centre
    const samples = [
      [region.cx, region.cy],
      [region.cx + region.r, region.cy],
      [region.cx - region.r, region.cy],
      [region.cx, region.cy + region.r],
      [region.cx, region.cy - region.r],
      [region.cx + region.r * 0.7, region.cy + region.r * 0.7],
      [region.cx - region.r * 0.7, region.cy + region.r * 0.7],
      [region.cx + region.r * 0.7, region.cy - region.r * 0.7],
      [region.cx - region.r * 0.7, region.cy - region.r * 0.7],
    ];

    for (const [sx, sy] of samples) {
      const pd = distanceToPath(sx, sy, WAYPOINTS);
      if (pd < MIN_PATH_DIST) {
        errors.push(
          `region ${region.id}: centre (${sx}, ${sy}) is ${Math.round(pd)}px from path (min ${MIN_PATH_DIST})`
        );
      }
      for (const slot of SLOTS) {
        const sd = Math.hypot(sx - slot.x, sy - slot.y);
        if (sd < MIN_SLOT_DIST) {
          errors.push(
            `region ${region.id}: centre (${sx}, ${sy}) is ${Math.round(sd)}px from slot (${slot.x}, ${slot.y}) (min ${MIN_SLOT_DIST})`
          );
        }
      }
    }

    // Also check region-to-region overlap
    for (const other of map.regions) {
      if (other.id === region.id) continue;
      const d = Math.hypot(region.cx - other.cx, region.cy - other.cy);
      if (d < region.r + other.r) {
        errors.push(
          `region ${region.id}: overlaps region ${other.id} (dist ${Math.round(d)}, sum r ${region.r + other.r})`
        );
      }
    }
  }

  // Check landmarks against path and slots
  for (const lm of map.landmarks) {
    const pd = distanceToPath(lm.x, lm.y, WAYPOINTS);
    if (pd < MIN_PATH_DIST) {
      errors.push(
        `landmark ${lm.id}: (${lm.x}, ${lm.y}) is ${Math.round(pd)}px from path (min ${MIN_PATH_DIST})`
      );
    }
    for (const slot of SLOTS) {
      const sd = Math.hypot(lm.x - slot.x, lm.y - slot.y);
      if (sd < MIN_SLOT_DIST) {
        errors.push(
          `landmark ${lm.id}: (${lm.x}, ${lm.y}) is ${Math.round(sd)}px from slot (${slot.x}, ${slot.y}) (min ${MIN_SLOT_DIST})`
        );
      }
    }
  }

  return errors;
}

/**
 * Return true if all regions in a map have safe clearance.
 * @param {AuthorMap} map
 * @returns {boolean}
 */
export function isMapValid(map) {
  return validateMap(map).length === 0;
}

/**
 * Given a map number, return [valid, mapDef, errors].
 * @param {number} num
 * @returns {[true, AuthorMap, string[]] | [false, null, string[]]}
 */
export function validateMapNumber(num) {
  const def = resolveMap(num);
  if (!def) {
    return [false, null, [`${num} is not a recognised map`]];
  }
  const errors = validateMap(def);
  return errors.length === 0 ? [true, def, []] : [false, def, errors];
}

// ── region expansion to decoration list ────────────────────────────────

import { generateMapLayout } from '../map-layout.js';

/**
 * Expand a map definition into the full decoration list that
 * TerrainLayer can consume. Merges the seeded layout with the
 * authored regions and landmarks.
 *
 * @param {AuthorMap} map
 * @returns {{ seed: number, ground: Array, decorations: Array, landmarks: Array }}
 */
export function expandMap(map) {
  const layout = generateMapLayout(map.seed, WAYPOINTS, SLOTS, 1280, 720);

  // Augment layout decorations with authored region decorations
  const rng = mulberry32(map.seed);

  // Helper to place decorations inside a region
  function placeInRegion(region) {
    const items = [];
    for (let i = 0; i < region.n; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * region.r * 0.7;
      const x = region.cx + Math.cos(angle) * dist;
      const y = region.cy + Math.sin(angle) * dist;
      items.push({
        x: Math.round(x),
        y: Math.round(y),
        kind: region.kind,
        rotation: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.6,
        zIndex: 2,
        _regionId: region.id,
      });
    }
    return items;
  }

  // Collect authored decorations
  const authoredDecorations = [];
  for (const region of map.regions) {
    authoredDecorations.push(...placeInRegion(region));
  }

  // Landmarks
  const landmarks = map.landmarks.map((lm) => ({
    x: lm.x,
    y: lm.y,
    kind: lm.kind,
    rotation: rng() * Math.PI * 2,
    scale: lm.scale,
    zIndex: 3,
    _landmark: true,
  }));

  return {
    mapNum: map.num,
    seed: map.seed,
    ground: layout.ground,
    decorations: authoredDecorations,
    landmarks,
    regionCount: map.regions.length,
    landmarkCount: map.landmarks.length,
  };
}

// Mulberry32 PRNG — same algorithm as map-layout.js for consistency
function mulberry32(a) {
  let seed = a >>> 0;
  return function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── module-level self-test (runs once on import) ───────────────────────
(function _selfTest() {
  let ok = 0;
  let fail = 0;
  for (const map of MAP_DEFS) {
    const errs = validateMap(map);
    if (errs.length === 0) {
      ok += 1;
    } else {
      fail += 1;
      console.warn(`P3-01 validateMap failed for map ${map.num}:`, errs);
    }
  }
  if (ok === MAP_DEFS.length) {
    // All maps valid — nothing to report
  }
})();
