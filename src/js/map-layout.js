// Deterministic seeded terrain placement metadata.
// Rendering remains separate so maps can vary without changing gameplay geometry.

const PATH_CLEARANCE = 52;
const SLOT_CLEARANCE = 46;
const DECORATION_SPACING = 64;
const MARGIN = 30;
const GROUND_KINDS = ['mud', 'stone', 'grass'];
const DECORATION_KINDS = ['rock', 'fern', 'log', 'cycad', 'puddle'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToPath(x, y, waypoints) {
  let nearest = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    nearest = Math.min(nearest, distanceToSegment(x, y, a[0], a[1], b[0], b[1]));
  }
  return nearest;
}

function distanceToSlots(x, y, slots) {
  let nearest = Infinity;
  for (const slot of slots) nearest = Math.min(nearest, Math.hypot(x - slot.x, y - slot.y));
  return nearest;
}

function distanceToPlaced(x, y, placed) {
  let nearest = Infinity;
  for (const item of placed) nearest = Math.min(nearest, Math.hypot(x - item.x, y - item.y));
  return nearest;
}

function randomItem(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function makeItem(rng, kind, x, y, zIndex) {
  return {
    x,
    y,
    kind,
    rotation: rng() * Math.PI * 2,
    scale: 0.8 + rng() * 0.6,
    zIndex,
  };
}

export function generateMapLayout(seed, waypoints, slots, width = 1280, height = 720) {
  const rng = mulberry32(seed);
  const ground = [];
  const decorations = [];
  const minX = MARGIN;
  const minY = MARGIN;
  const maxX = width - MARGIN;
  const maxY = height - MARGIN;
  const isOpen = (x, y) => (
    distanceToPath(x, y, waypoints) >= PATH_CLEARANCE &&
    distanceToSlots(x, y, slots) >= SLOT_CLEARANCE
  );

  const groundTarget = 18 + Math.floor(rng() * 11);
  for (let attempts = 0; ground.length < groundTarget && attempts < 4000; attempts++) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    if (isOpen(x, y)) ground.push(makeItem(rng, randomItem(rng, GROUND_KINDS), x, y, 1));
  }

  for (let attempts = 0; decorations.length < 42 && attempts < 8000; attempts++) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    if (!isOpen(x, y) || distanceToPlaced(x, y, decorations) < DECORATION_SPACING) continue;
    decorations.push(makeItem(rng, randomItem(rng, DECORATION_KINDS), x, y, 2));
  }

  return { seed, ground, decorations };
}

export { distanceToPath, distanceToSlots };
