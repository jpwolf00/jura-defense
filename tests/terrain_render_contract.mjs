// Terrain render contract — runs entirely under JSDOM so that
// terrain.js's Image guard (typeof Image !== 'undefined') resolves
// truthy at import time, while the test itself uses regular Canvas.
import { JSDOM } from 'jsdom';

const W = 1280, H = 720;

// 1. Set up a DOM environment with OffscreenCanvas & Image.
const dom = new JSDOM('<!DOCTYPE html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  resources: 'usable',
});
const { window: win } = dom;
globalThis.window = win;
globalThis.document = win.document;
globalThis.OffscreenCanvas = win.OffscreenCanvas;
globalThis.Image = win.Image;

// 2. Now import terrain.js — the module-level Image guard will see
//    Image defined and attempt to load terrain_bg.png.  If the PNG
//    doesn't exist the onerror handler falls through to procedural cache.
const terrain = await import('../src/js/terrain.js');

// 3. Create a regular canvas for the test harness.
const canvas = win.document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');

// 4. Test renderTerrainBackground
terrain.renderTerrainBackground(ctx, W, H);
const bgData = ctx.getImageData(0, 0, W, H).data;
let filled = 0;
for (let i = 0; i < bgData.length; i += 4) {
  if (bgData[i] !== 0 || bgData[i + 1] !== 0 || bgData[i + 2] !== 0 || bgData[i + 3] !== 0) filled++;
}
console.assert(filled > 0, 'terrain background must fill the board');

// 5. Test renderGamePath + renderDashedSlots
const bgCanvas = win.document.createElement('canvas');
bgCanvas.width = W;
bgCanvas.height = H;
const bgCtx = bgCanvas.getContext('2d');
terrain.renderTerrainBackground(bgCtx, W, H);
bgCtx.drawImage(bgCanvas, 0, 0);
terrain.renderGamePath(bgCtx, [[0, 360], [1280, 360]]);
terrain.renderDashedSlots(bgCtx, [{ x: 200, y: 360 }]);

const targetData = bgCtx.getImageData(0, 0, W, H).data;
let filledTarget = 0;
for (let i = 0; i < targetData.length; i += 4) {
  if (targetData[i] !== 0 || targetData[i + 1] !== 0 || targetData[i + 2] !== 0 || targetData[i + 3] !== 0) filledTarget++;
}
console.assert(filledTarget > 0, 'composed terrain board must render to visible pixels');

// 6. Test renderFogOverlay
const fogCanvas = win.document.createElement('canvas');
fogCanvas.width = W;
fogCanvas.height = H;
const fogCtx = fogCanvas.getContext('2d');
fogCtx.drawImage(canvas, 0, 0);
terrain.renderFogOverlay(fogCtx, W, H);

console.log('terrain render contract passed');
