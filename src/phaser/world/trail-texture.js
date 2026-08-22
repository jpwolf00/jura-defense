/**
 * trail-texture.js — organic, terrain-integrated trail rendering for the
 * defense route. Replaces the flat two-stroke vector path with a layered,
 * spline-smoothed ribbon that reads as a worn dirt trail:
 *
 *   1. Soft shoulder halo (terrain-blending gradient edge)
 *   2. Wide dirt base with per-segment width wobble
 *   3. Curved spline centerline (Catmull-Rom through waypoints)
 *   4. Mottled patches (dirt/sand/pebble tone variation along the trail)
 *   5. Worn ruts (two darker parallel lines following the curve)
 *   6. Edge scatter (grass tufts / pebbles breaking the boundary)
 *
 * Gameplay contract is untouched: WAYPOINTS/SLOTS data, slot hit areas and
 * enemy movement all continue to use the exact same coordinates.
 */
import { WAYPOINTS } from '../../js/path.js';

// ── Spline utilities ─────────────────────────────────────────────────────

/** Catmull-Rom interpolation producing a densely-sampled polyline. */
export function smoothWaypoints(waypoints, samplesPerSegment = 24) {
  if (!waypoints || waypoints.length < 2) return [];
  const pts = waypoints.map(([x, y]) => ({ x, y }));
  // Duplicate endpoints so the curve passes through the first/last points.
  const p0 = pts[0], pn = pts[pts.length - 1];
  const ext = [p0, ...pts, pn];
  const out = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const a = ext[i - 1], b = ext[i], c = ext[i + 1], d = ext[i + 2];
    for (let t = 0; t < samplesPerSegment; t++) {
      const s = t / samplesPerSegment;
      const s2 = s * s, s3 = s2 * s;
      out.push({
        x: 0.5 * ((2 * b.x) + (-a.x + c.x) * s +
          (2 * a.x - 5 * b.x + 4 * c.x - d.x) * s2 +
          (-a.x + 3 * b.x - 3 * c.x + d.x) * s3),
        y: 0.5 * ((2 * b.y) + (-a.y + c.y) * s +
          (2 * a.y - 5 * b.y + 4 * c.y - d.y) * s2 +
          (-a.y + 3 * b.y - 3 * c.y + d.y) * s3),
      });
    }
  }
  out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
  return out;
}

/** Deterministic PRNG so renders are stable frame-to-frame. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Perpendicular unit normal at point i of the polyline. */
function normalAt(pts, i) {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  const dx = next.x - prev.x, dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

// ── Palette ──────────────────────────────────────────────────────────────
const TRAIL_PALETTE = {
  shoulder: 0x866f47,   // dusty transition into terrain
  base: 0xa8895b,       // packed dirt
  mottleLight: 0xc2a56e, // dry sand patches
  mottleDark: 0x8a6d42,  // damp/worn dirt patches
  rut: 0x74592f,        // wheel/foot ruts
  pebble: 0xb59a68,
};

/**
 * Draw the organic trail onto a Phaser Graphics object.
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Graphics} g target graphics
 * @param {Object} [options]
 * @param {number} [options.baseWidth=46] average dirt width in px
 * @param {number} [options.seed] deterministic variation seed
 */
export function drawOrganicTrail(scene, g, options = {}) {
  const baseWidth = options.baseWidth ?? 46;
  const rand = mulberry32(options.seed ?? 20260822);
  const pts = smoothWaypoints(WAYPOINTS, 20);
  if (pts.length < 2) return;

  // ── 1. Soft shoulder: wide, low-alpha strokes that fade into terrain ──
  for (const [w, alpha] of [[baseWidth + 34, 0.10], [baseWidth + 20, 0.16], [baseWidth + 10, 0.22]]) {
    g.lineStyle(w, TRAIL_PALETTE.shoulder, alpha);
    strokePolyline(g, pts);
  }

  // ── 2. Dirt base with width wobble (drawn as overlapping quads) ──
  g.fillStyle(TRAIL_PALETTE.base, 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const nA = normalAt(pts, i), nB = normalAt(pts, i + 1);
    const wobA = 1 + (rand() - 0.5) * 0.22;
    const wobB = 1 + (rand() - 0.5) * 0.22;
    const halfA = (baseWidth / 2) * wobA, halfB = (baseWidth / 2) * wobB;
    const a = pts[i], b = pts[i + 1];
    g.fillPoints([
      { x: a.x + nA.x * halfA, y: a.y + nA.y * halfA },
      { x: b.x + nB.x * halfB, y: b.y + nB.y * halfB },
      { x: b.x - nB.x * halfB, y: b.y - nB.y * halfB },
      { x: a.x - nA.x * halfA, y: a.y - nA.y * halfA },
    ], true);
  }

  // ── 3. Mottled patches along the trail ──
  const step = 7;
  for (let i = 2; i < pts.length - 2; i += step) {
    const p = pts[i];
    const n = normalAt(pts, i);
    const off = (rand() - 0.5) * baseWidth * 0.55;
    const rx = p.x + n.x * off, ry = p.y + n.y * off;
    const light = rand() > 0.5;
    g.fillStyle(light ? TRAIL_PALETTE.mottleLight : TRAIL_PALETTE.mottleDark, 0.30 + rand() * 0.18);
    g.fillEllipse(rx, ry, 14 + rand() * 20, 9 + rand() * 12);
  }

  // ── 4. Worn ruts: two darker parallel curves at ±35% half-width ──
  for (const side of [-1, 1]) {
    const rutPts = pts.map((p, i) => {
      const n = normalAt(pts, i);
      const jit = (rand() - 0.5) * 3;
      return { x: p.x + n.x * side * baseWidth * 0.18 + jit, y: p.y + n.y * side * baseWidth * 0.18 };
    });
    for (const [w, alpha] of [[5, 0.28], [2.5, 0.38]]) {
      g.lineStyle(w, TRAIL_PALETTE.rut, alpha);
      strokePolyline(g, rutPts);
    }
  }

  // ── 5. Pebbles scattered on the trail surface ──
  for (let i = 0; i < pts.length; i += 11) {
    const p = pts[i];
    const n = normalAt(pts, i);
    const off = (rand() - 0.5) * baseWidth * 0.7;
    g.fillStyle(TRAIL_PALETTE.pebble, 0.5 + rand() * 0.3);
    g.fillCircle(p.x + n.x * off, p.y + n.y * off, 1.5 + rand() * 2.2);
  }
}

/** Stroke a dense polyline as small connected segments (avoids huge path ops). */
function strokePolyline(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.strokePath();
}

/**
 * Edge scatter — grass tufts / small stones straddling the trail boundary.
 * Called separately so it can be added ABOVE the trail but BELOW towers.
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Graphics} g
 * @param {Object} [options]
 */
export function drawTrailEdgeScatter(scene, g, options = {}) {
  const baseWidth = options.baseWidth ?? 46;
  const rand = mulberry32((options.seed ?? 20260822) ^ 0x9e3779b9);
  const pts = smoothWaypoints(WAYPOINTS, 14);
  for (let i = 1; i < pts.length - 1; i += 3) {
    const p = pts[i];
    const n = normalAt(pts, i);
    const side = rand() > 0.5 ? 1 : -1;
    const dist = (baseWidth / 2 + 2) + rand() * 14;
    const x = p.x + n.x * side * dist;
    const y = p.y + n.y * side * dist;
    if (rand() > 0.42) {
      // grass tuft — 3 blades fanning outward
      const tint = [0x527d42, 0x3c7a3c, 0x5e8c48][Math.floor(rand() * 3)];
      g.lineStyle(1.6, tint, 0.85);
      for (let b = -1; b <= 1; b++) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + b * 3 + (rand() - 0.5) * 2, y - 6 - rand() * 5);
        g.strokePath();
      }
    } else {
      // small stone cluster
      g.fillStyle(0x8a8578, 0.75);
      g.fillCircle(x, y, 1.8 + rand() * 1.8);
      g.fillStyle(0x6f6a5e, 0.6);
      g.fillCircle(x + 3, y + 1.5, 1.2 + rand() * 1.2);
    }
  }
}
