import { readFileSync } from 'fs';

const src = readFileSync('/Users/jasonwolf/jura-defense/src/js/sprites.js', 'utf8');

const imagesMatch = src.match(/export const IMAGES = \{(.*?)\n\};/s);
const imgBlock = imagesMatch[1];
const entries = [...imgBlock.matchAll(/"([a-z_]+)": "data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)];

const sprMatch = src.match(/export const SPRITES = \{(.*?)\n\};/s);
const sprBlock = sprMatch[1];
const metaEntries = [...sprBlock.matchAll(/"([a-z_]+)": \{([^}]*)\}/g)];

const meta = {};
for (const m of metaEntries) {
  const id = m[1];
  const body = m[2];
  const w = body.match(/"w":\s*(\d+)/);
  const h = body.match(/"h":\s*(\d+)/);
  const af = body.match(/"anim_frames":\s*(\d+)/);
  const grid = body.match(/"grid":\s*(\d+)/);
  meta[id] = {
    w: w ? +w[1] : null,
    h: h ? +h[1] : null,
    anim_frames: af ? +af[1] : null,
    grid: grid ? +grid[1] : null,
  };
}

console.log('=== SPRITES metadata (w, h, anim_frames, grid) ===');
for (const [id, m] of Object.entries(meta)) {
  console.log(`${id}: w=${m.w} h=${m.h} anim_frames=${m.anim_frames} grid=${m.grid}`);
}

console.log('\n=== Actual PNG dimensions (from decoded base64) ===');
for (const e of entries) {
  const id = e[1];
  const b64 = e[2];
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 24 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const m = meta[id] || {};
    const perFrameW = m.anim_frames ? Math.round(width / m.anim_frames) : null;
    console.log(`${id}: PNG ${width}x${height}  meta w=${m.w} h=${m.h} frames=${m.anim_frames}  -> per-frame ~${perFrameW}x${height}`);
  } else {
    console.log(`${id}: NOT a valid PNG (len=${buf.length})`);
  }
}
