import { generateMapLayout } from './map-layout.js';
import { WAYPOINTS, SLOTS } from './path.js';

// Terrain-first board renderer for Jura Defense gameplay.
// Produces a clear, non-photoreal Jurassic battlefield backdrop.

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function smoothstep(t) { t = clamp(t); return t * t * (3 - 2 * t); }

// Deterministic pseudo-random value from coordinates.
function hash(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// Low-frequency grid noise for terrain patch shapes.
function noise2(x, y, scale) {
  const sx = x / scale, sy = y / scale;
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = x0 + 1, y1 = y0 + 1;
  const tx = sx - x0, ty = sy - y0;
  const v00 = hash(x0, y0), v10 = hash(x1, y0), v01 = hash(x0, y1), v11 = hash(x1, y1);
  const a = lerp(v00, v10, smoothstep(tx));
  const b = lerp(v01, v11, smoothstep(tx));
  return lerp(a, b, smoothstep(ty));
}

// Continuous terrain color ramp: a gradient over [0,1] that maps a combined
// height+mix value to a smooth earth-tone palette. No discrete steps, so
// adjacent cells blend and there are no hard "checkerboard" boundaries.
const RAMP = [
  { t: 0.00, c: [64, 62, 48] },   // deep mud / low basin
  { t: 0.18, c: [95, 90, 76] },   // rock shelf
  { t: 0.38, c: [126, 112, 84] }, // sand / eroded flats
  { t: 0.58, c: [111, 95, 72] },  // dirt hardpan
  { t: 0.80, c: [86, 110, 72] },  // dry scrub
  { t: 1.00, c: [68, 102, 60] },  // lush grass
];

function rampColor(t) {
  t = clamp(t);
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i], b = RAMP[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = smoothstep((t - a.t) / (b.t - a.t));
      return [
        Math.round(lerp(a.c[0], b.c[0], k)),
        Math.round(lerp(a.c[1], b.c[1], k)),
        Math.round(lerp(a.c[2], b.c[2], k)),
      ];
    }
  }
  return RAMP[RAMP.length - 1].c;
}

// Combine height + moisture noise into a single continuous terrain value.
function terrainValue(x, y) {
  const h = noise2(x, y, 200);
  const moist = noise2(x + 4000, y + 4000, 260);
  const v = h * 0.62 + moist * 0.38;
  // Flatten the extremes slightly so mid-tones dominate (organic field).
  return v;
}

function rgbStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function shade(c, amt) {
  return [Math.round(clamp(c[0] + amt, 0, 255)), Math.round(clamp(c[1] + amt, 0, 255)), Math.round(clamp(c[2] + amt, 0, 255))];
}

// Static terrain rendered once into an offscreen canvas (8px cells, continuous
// color) then blitted every frame. Continuous colors mean adjacent cells are
// near-identical, so the field reads as organic ground, not a color grid.
let _terrainCache = null;
let _terrainCacheW = 0, _terrainCacheH = 0;
let _terrainPlateReady = false;
let _terrainPlate = null;

// Only attempt Image loading in a browser environment where Image is defined.
// In Node.js / test runners, fall through to the procedural cache.
if (typeof Image !== 'undefined') {
  _terrainPlate = new Image();
  _terrainPlate.onload = () => {
    _terrainPlateReady = true;
    _terrainCache = null;
  };
  _terrainPlate.onerror = () => {
    _terrainPlateReady = false;
    _terrainCache = null;
  };
  _terrainPlate.src = new URL('../assets/terrain_bg.png', import.meta.url).href;
}

function drawLayoutFeatures(c, w, h) {
  const layout = generateMapLayout(1337, WAYPOINTS, SLOTS, 1280, 720);
  const sx = w / 1280, sy = h / 720, scale = Math.min(sx, sy);
  const items = [...layout.ground, ...layout.decorations].sort((a, b) => a.zIndex - b.zIndex);
  for (const item of items) {
    c.save();
    c.translate(item.x * sx, item.y * sy);
    c.rotate(item.rotation);
    c.scale(item.scale * scale, item.scale * scale);
    if (item.kind === 'mud') {
      c.fillStyle = 'rgba(102,70,45,0.13)'; c.beginPath(); c.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2); c.fill();
    } else if (item.kind === 'stone' || item.kind === 'rock') {
      c.fillStyle = 'rgba(80,76,67,0.22)'; c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2); c.fill();
    } else if (item.kind === 'grass' || item.kind === 'fern' || item.kind === 'cycad') {
      c.strokeStyle = 'rgba(54,102,52,0.2)'; c.lineWidth = 1.5; c.beginPath();
      for (let i = -2; i <= 2; i++) { c.moveTo(i * 2, 2); c.lineTo(i * 3, -8 - Math.abs(i)); }
      c.stroke();
    } else if (item.kind === 'log') {
      c.fillStyle = 'rgba(91,62,42,0.22)'; c.fillRect(-11, -3, 22, 6);
    } else if (item.kind === 'puddle') {
      c.fillStyle = 'rgba(66,128,153,0.14)'; c.beginPath(); c.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
}

function makeTerrainCanvas(w, h) {
  const C = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(w, h)
    : document.createElement('canvas');
  C.width = w; C.height = h;
  const c = C.getContext('2d');
  const cell = 8;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cell, y = r * cell;
      const cx = x + cell / 2, cy = y + cell / 2;
      c.fillStyle = rgbStr(rampColor(terrainValue(cx, cy)));
      c.fillRect(x, y, cell, cell);
    }
  }

  // Larger, deterministic ground features make the field read as terrain rather
  // than a low-contrast color wash. This is part of the cached canvas.
  const featureStep = 180;
  for (let fy = 90; fy < h; fy += featureStep) {
    for (let fx = 90; fx < w; fx += featureStep) {
      const n = hash(fx + 700, fy + 900);
      if (n < 0.34) continue;
      const type = Math.floor(n * 9) % 3;
      const rx = 34 + Math.floor(hash(fx + 3, fy + 5) * 28);
      const ry = 20 + Math.floor(hash(fx + 7, fy + 11) * 18);
      c.save();
      c.translate(fx + (n - 0.5) * 34, fy + (hash(fx, fy + 13) - 0.5) * 28);
      c.rotate((n - 0.5) * 0.5);
      c.fillStyle = type === 0
        ? 'rgba(92,126,65,0.16)'
        : type === 1 ? 'rgba(151,111,68,0.15)' : 'rgba(112,110,96,0.17)';
      c.strokeStyle = type === 0
        ? 'rgba(58,87,46,0.16)'
        : type === 1 ? 'rgba(105,72,43,0.16)' : 'rgba(72,72,65,0.16)';
      c.lineWidth = 2;
      c.beginPath();
      for (let v = 0; v < 7; v++) {
        const a = (v / 7) * Math.PI * 2;
        const r = 0.82 + hash(fx + v * 19, fy + v * 23) * 0.3;
        const px = Math.cos(a) * rx * r, py = Math.sin(a) * ry * r;
        if (v === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }

  // Sparse environmental detail — recognizable grass tufts and rocks instead
  // of fine grain, so the field reads as "alive" without looking noisy.
  const decorate = (gx, gy) => {
    const n = hash(gx, gy);
    const v = terrainValue(gx, gy);
    const px = Math.floor(gx), py = Math.floor(gy);
    const base = rampColor(v);
    if (n > 0.965) {
      // grass tuft: a few short blades
      c.strokeStyle = rgbStr(shade([74, 110, 62], Math.floor((n * 977) % 30) - 15));
      c.lineWidth = 1.5;
      c.beginPath();
      for (let b = 0; b < 3; b++) {
        const bx = px + (n * 613 + b * 7) % 10 - 5;
        const by = py + (n * 431 + b * 11) % 10 - 5;
        c.moveTo(bx, by);
        c.lineTo(bx + ((n * 743 + b) % 5) - 2, by - 4 - (n * 5 % 3));
      }
      c.stroke();
    } else if (n > 0.945) {
      // small rock
      c.fillStyle = rgbStr(shade([95, 90, 80], Math.floor((n * 613) % 20) - 10));
      c.beginPath();
      c.ellipse(px, py, 3 + (n * 977) % 3, 2 + (n * 431) % 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.beginPath();
      c.ellipse(px + 1, py + 1, 2, 1.2, 0, 0, Math.PI * 2);
      c.fill();
    } else if (n > 0.935) {
      // Occasional larger landmark rock; deterministic and sparse.
      const radius = 7 + Math.floor(hash(gx + 17, gy + 31) * 6);
      c.fillStyle = rgbStr(shade([88, 84, 72], -4 + Math.floor(n * 12)));
      c.beginPath();
      c.ellipse(px, py, radius, radius * 0.62, -0.15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.beginPath();
      c.ellipse(px + 2, py + 2, radius * 0.62, radius * 0.3, -0.15, 0, Math.PI * 2);
      c.fill();
    }
  };
  for (let gx = 0; gx < w; gx += 24) {
    for (let gy = 0; gy < h; gy += 24) {
      decorate(gx, gy);
    }
  }
  drawLayoutFeatures(c, w, h);
  return C;
}

// Blit the cached terrain backdrop into the supplied canvas context.
export function renderTerrainBackground(ctx, w, h) {
  if (_terrainPlateReady) {
    ctx.drawImage(_terrainPlate, 0, 0, w, h);
    return;
  }
  if (!_terrainCache || _terrainCacheW !== w || _terrainCacheH !== h) {
    _terrainCache = makeTerrainCanvas(w, h);
    _terrainCacheW = w; _terrainCacheH = h;
  }
  ctx.drawImage(_terrainCache, 0, 0, w, h);
}

// Render the winding enemy trail over terrain as a visible earth road.
export function renderGamePath(ctx, waypoints, lineWidth = 52) {
  if (!waypoints || waypoints.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Broad worn base.
  ctx.strokeStyle = '#272017';
  ctx.lineWidth = lineWidth + 8;
  path(ctx, waypoints);
  ctx.stroke();
  // Compact center.
  ctx.strokeStyle = '#3b3222';
  ctx.lineWidth = lineWidth;
  path(ctx, waypoints);
  ctx.stroke();
  // Edge wear line.
  ctx.strokeStyle = 'rgba(224,164,88,0.18)';
  ctx.lineWidth = lineWidth + 12;
  ctx.globalAlpha = 0.55;
  path(ctx, waypoints);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Subtle worn ruts make the route read as a physical trail rather than a
  // flat graphic stroke. Keep them sparse and low contrast for enemy clarity.
  ctx.strokeStyle = 'rgba(48,36,25,0.32)';
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 24]);
  path(ctx, waypoints);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(205,166,103,0.18)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 18]);
  path(ctx, waypoints);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Dashed placement hints that do not dominate the board.
export function renderDashedSlots(ctx, slots) {
  if (!slots || !slots.length) return;
  for (const slot of slots) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#8fa093';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(slot.x - 8, slot.y);
    ctx.lineTo(slot.x + 8, slot.y);
    ctx.moveTo(slot.x, slot.y - 8);
    ctx.lineTo(slot.x, slot.y + 8);
    ctx.stroke();
    ctx.restore();
  }
}

// Light fog to unify layers without burying contrast.
export function renderFogOverlay(ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.fillStyle = '#a8b8aa';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function path(ctx, waypoints) {
  ctx.beginPath();
  ctx.moveTo(waypoints[0][0], waypoints[0][1]);
  for (let i = 1; i < waypoints.length; i++) {
    ctx.lineTo(waypoints[i][0], waypoints[i][1]);
  }
}
