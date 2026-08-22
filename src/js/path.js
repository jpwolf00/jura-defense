// Path: an S-curve from spawn (left) to the Time Rig (right).
// Defined in a 1280x720 virtual coordinate space; scaled to the canvas.

export const VIEW_W = 1280;
export const VIEW_H = 720;

// S-curve waypoints (virtual coords). Spawn far-left, rig far-right.
export const WAYPOINTS = [
  [-40, 140],
  [300, 140],
  [300, 380],
  [980, 380],
  [980, 150],
  [560, 150],
  [560, 560],
  [1080, 560],
  [1080, 660],
  [1320, 660],
];

// Build a clean segment table with endpoint vectors + cumulative distance.
const segTable = [];
let totalLen = 0;
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const a = WAYPOINTS[i];
  const b = WAYPOINTS[i + 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  segTable.push({ a, b, len, start: totalLen });
  totalLen += len;
}
export const PATH_LENGTH = totalLen;

// Position along path by distance traveled (px).
export function pointAt(dist) {
  const d = Math.max(0, Math.min(dist, totalLen));
  for (let i = segTable.length - 1; i >= 0; i--) {
    const s = segTable[i];
    if (d >= s.start) {
      const t = s.len === 0 ? 0 : (d - s.start) / s.len;
      return {
        x: s.a[0] + (s.b[0] - s.a[0]) * t,
        y: s.a[1] + (s.b[1] - s.a[1]) * t,
      };
    }
  }
  return { x: WAYPOINTS[0][0], y: WAYPOINTS[0][1] };
}

// Heading (radians) at a distance, for sprite orientation.
export function headingAt(dist) {
  const p0 = pointAt(dist);
  const p1 = pointAt(dist + 2);
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

// Tower build slots: hand-placed beside the path.
export const SLOTS = [
  { x: 180, y: 250 }, { x: 420, y: 250 }, { x: 220, y: 470 },
  { x: 420, y: 470 }, { x: 640, y: 270 }, { x: 840, y: 270 },
  { x: 700, y: 470 }, { x: 900, y: 470 }, { x: 680, y: 650 },
  { x: 900, y: 650 }, { x: 1180, y: 300 }, { x: 460, y: 650 },
];
