// Pause/Speed touch-control contract — browser-playwright test.
//
// Covers the Phaser playground-scene touch-safe buttons and the
// Canvas main.js #pauseBtn / #ffwdBtn at desktop and mobile viewports.
//
// Contract invariants (preserved from existing five-button layout):
//   • minimumTarget: 48 px
//   • slotHitDiameter: 48
//   • onboardingDismissMinimum: 44
//   • actionButtons.pause / actionButtons.speed bounds: { min: 1, max: 2 }
//
// Test sequence per viewport:
//   1. Start game (boot)
//   2. Click Pause button once → verify toggle to paused
//   3. Click Pause again → verify toggle to resumed
//   4. Click Speed button once → verify 1×→2×
//   5. Click Speed again → verify 2×→1×
//   6. Re-read __juraTouchContract (Phaser) or DOM (Canvas) to confirm
//      the five-button bounds contract is still intact
//
// IMPORTANT: serves the Vite-built dist/ directory so that Phaser ESM
// specifiers are resolved by the rollup output bundles.

import playwright from '/Users/jasonwolf/.hermes/hermes-agent/node_modules/playwright/index.js';
const { chromium } = playwright;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const errors = [];
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

// Convert Phaser game-world coords (in __juraTouchContract.actionButtons)
// to DOM CSS pixel coordinates for page.mouse.click().
//
// RESIZE mode: game coords already equal CSS pixels (canvas === viewport).
// FIT mode: game is 1280×720, scaled to fit the canvas rect.  Must use the
// actual canvas bounding rect — not window.innerWidth — to get the correct
// scale factor and any top/left offset (Phaser centers the canvas in FIT).
//
// Reads primitive values only inside page.evaluate().
async function getPhaserButtonBounds(page) {
  return page.evaluate(() => {
    const c = globalThis.__juraTouchContract;
    if (!c || !c.actionButtons) return null;
    const rc = globalThis.__juraResponsiveContract;
    const isResize = rc && rc.mode === 'RESIZE';

    // Grab the actual canvas bounding rect (handles FIT letterboxing offsets).
    const canvasEl = document.querySelector('canvas');
    const rect = canvasEl ? canvasEl.getBoundingClientRect() : null;

    const buttons = {};
    for (const [name, b] of Object.entries(c.actionButtons)) {
      let x = b.x, y = b.y;
      if (!isResize && rect) {
        // FIT: canvas.gameW/Canvas.gameH = 1280/720
        x = b.x * (rect.width / 1280) + rect.left;
        y = b.y * (rect.height / 720) + rect.top;
      }
      buttons[name] = { x, y, width: b.width, height: b.height };
    }
    return buttons;
  });
}

// Read pause state from Phaser __juraTouchContract (call inside page.evaluate).
// Returns a primitive boolean (undefined if contract missing).
async function getPhaserPaused(page) {
  return page.evaluate(() => {
    const c = globalThis.__juraTouchContract;
    return c && c.pause ? c.pause.state().paused : undefined;
  });
}

// Read speed state from Phaser __juraTouchContract (call inside page.evaluate).
// Returns a primitive number (undefined if contract missing).
async function getPhaserSpeed(page) {
  return page.evaluate(() => {
    const c = globalThis.__juraTouchContract;
    return c && c.speed ? c.speed.state().timeScale : undefined;
  });
}

// Read the current phase from the wave bridge controller state.
// Returns a primitive string like 'INTRO', 'PLAYING', 'PAUSED', etc.
async function getPhase(page) {
  return page.evaluate(() => {
    return globalThis.__juraWaveBridge?.phase;
  });
}

// Wait until __juraTouchContract is defined (Phaser scene create() finished).
async function waitForPhaserContract(page, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => !!globalThis.__juraTouchContract);
    if (ready) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

// ── run per viewport ──────────────────────────────────────────────────────

const viewports = [
  { name: 'mobile',  width: 390,  height: 844  },
  { name: 'tablet',  width: 1024, height: 600  },
  { name: 'desktop', width: 1340, height: 800  },
];

let browser;
try {
  browser = await chromium.launch();

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${vp.name} console: ${m.text()}`); });

    // ── Phaser test ───────────────────────────────────────────────────
    console.log(`${vp.name}: testing Phaser…`);
    try {
      await page.goto('http://127.0.0.1:4173/phaser.html?scene=playground', { waitUntil: 'networkidle' });

      // Wait for Phaser scene to create __juraTouchContract
      const contractReady = await waitForPhaserContract(page);
      if (!contractReady) { errors.push(`${vp.name} Phaser: no __juraTouchContract within timeout`); continue; }

      const buttons = await getPhaserButtonBounds(page);
      if (!buttons) { errors.push(`${vp.name} Phaser: no __juraTouchContract`); continue; }

      // Verify five-button bounds contract is intact
      const btnNames = ['start_waves', 'pause', 'meteor', 'chrono', 'speed'];
      for (const name of btnNames) {
        assert.ok(buttons[name], `${vp.name} Phaser: missing button ${name}`);
        assert.ok(buttons[name].width >= 48, `${vp.name} Phaser: ${name} width < 48`);
        assert.ok(buttons[name].height >= 48, `${vp.name} Phaser: ${name} height < 48`);
      }

      // Verify initial phase is INTRO
      let phase = await getPhase(page);
      assert.equal(phase, 'INTRO', `${vp.name} Phaser: initial phase must be INTRO`);

      // Start game
      const startBtn = buttons.start_waves;
      await page.mouse.click(startBtn.x, startBtn.y);
      await page.waitForTimeout(300);

      // Verify phase transition: INTRO → PLAYING
      phase = await getPhase(page);
      assert.equal(phase, 'PLAYING', `${vp.name} Phaser: phase must be PLAYING after start (was ${phase})`);

      // ── Pause toggle test ───────────────────────────────────────────
      let pausedBefore = await getPhaserPaused(page);
      assert.equal(pausedBefore, false, `${vp.name} Phaser: should not be paused at start`);

      // Click pause button once → should go to PAUSED
      const pauseBtn = buttons.pause;
      await page.mouse.click(pauseBtn.x, pauseBtn.y);
      await page.waitForTimeout(100);

      let pausedAfter1 = await getPhaserPaused(page);
      assert.equal(pausedAfter1, true, `${vp.name} Phaser: pause should be true after 1 click`);

      // Verify phase is PAUSED
      phase = await getPhase(page);
      assert.equal(phase, 'PAUSED', `${vp.name} Phaser: phase must be PAUSED (was ${phase})`);

      // Click pause button again → should restore to PLAYING
      await page.mouse.click(pauseBtn.x, pauseBtn.y);
      await page.waitForTimeout(100);

      let pausedAfter2 = await getPhaserPaused(page);
      assert.equal(pausedAfter2, false, `${vp.name} Phaser: pause should be false after 2 clicks`);

      // Verify phase transition: PAUSED → PLAYING
      phase = await getPhase(page);
      assert.equal(phase, 'PLAYING', `${vp.name} Phaser: phase must be PLAYING after resume (was ${phase})`);

      // ── Speed toggle test ───────────────────────────────────────────
      let speedBefore = await getPhaserSpeed(page);
      assert.equal(speedBefore, 1, `${vp.name} Phaser: initial speed must be 1×`);

      // Click speed button once → should become 2×
      const speedBtn = buttons.speed;
      await page.mouse.click(speedBtn.x, speedBtn.y);
      await page.waitForTimeout(100);

      let speedAfter1 = await getPhaserSpeed(page);
      assert.equal(speedAfter1, 2, `${vp.name} Phaser: speed must become 2× (click 1)`);

      // Click speed button again → should restore to 1×
      await page.mouse.click(speedBtn.x, speedBtn.y);
      await page.waitForTimeout(100);

      let speedAfter2 = await getPhaserSpeed(page);
      assert.equal(speedAfter2, 1, `${vp.name} Phaser: speed must restore to 1× (click 2)`);

      // Verify speed bounds contract
      const speedBounds = await page.evaluate(() => globalThis.__juraTouchContract?.speed?.bounds);
      assert.equal(speedBounds.min, 1, `${vp.name} Phaser: speed min bound`);
      assert.equal(speedBounds.max, 2, `${vp.name} Phaser: speed max bound`);

      // Verify pause bounds contract
      const pauseBounds = await page.evaluate(() => globalThis.__juraTouchContract?.pause?.bounds);
      assert.equal(pauseBounds.min, 1, `${vp.name} Phaser: pause min bound`);
      assert.equal(pauseBounds.max, 2, `${vp.name} Phaser: pause max bound`);

      console.log(`${vp.name}: Phaser PASS`);

      // ── Canvas test ─────────────────────────────────────────────────
      console.log(`${vp.name}: testing Canvas…`);
      try {
        await page.close();
        const page2 = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        page2.on('pageerror', (e) => errors.push(`${vp.name} Canvas pageerror: ${e.message}`));
        page2.on('console', (m) => { if (m.type() === 'error') errors.push(`${vp.name} Canvas console: ${m.text()}`); });

        await page2.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
        await page2.waitForTimeout(500);

        // Click Start button
        await page2.locator('#startGameBtn').click();
        await page2.waitForTimeout(300);

        const $pauseBtn = page2.locator('#pauseBtn');
        const $ffwdBtn = page2.locator('#ffwdBtn');

        let pauseText = await $pauseBtn.evaluate((el) => el.textContent.trim());
        const speedText = await $ffwdBtn.evaluate((el) => el.textContent.trim());
        assert.match(speedText, /1×/, `${vp.name} Canvas: initial speed must be 1×`);

        // Click pause once → should toggle
        await $pauseBtn.click();
        await page2.waitForTimeout(100);
        let pauseText2 = await $pauseBtn.evaluate((el) => el.textContent.trim());
        assert.notEqual(pauseText2, pauseText, `${vp.name} Canvas: pause must toggle`);

        // Click pause again → should restore
        await $pauseBtn.click();
        await page2.waitForTimeout(100);
        let pauseText3 = await $pauseBtn.evaluate((el) => el.textContent.trim());
        assert.equal(pauseText3, pauseText, `${vp.name} Canvas: pause must restore`);

        // Click speed once → should become 2×
        await $ffwdBtn.click();
        await page2.waitForTimeout(100);
        let speedText2 = await $ffwdBtn.evaluate((el) => el.textContent.trim());
        assert.match(speedText2, /2×/, `${vp.name} Canvas: speed must become 2×`);

        // Click speed again → should restore to 1×
        await $ffwdBtn.click();
        await page2.waitForTimeout(100);
        let speedText3 = await $ffwdBtn.evaluate((el) => el.textContent.trim());
        assert.match(speedText3, /1×/, `${vp.name} Canvas: speed must restore to 1×`);

        const pauseStateCanvas = await page2.evaluate(() => {
          if (!window.__juraState) return null;
          return {
            paused: window.__juraState.paused,
            timeScale: window.__juraState.timeScale,
          };
        });
        assert.ok(pauseStateCanvas, `${vp.name} Canvas: __juraState must exist`);
        assert.ok(pauseStateCanvas.timeScale >= 1 && pauseStateCanvas.timeScale <= 2,
          `${vp.name} Canvas: timeScale within [1,2] bounds`);

        console.log(`${vp.name}: Canvas PASS`);
        await page2.close();
      } catch (e) {
        errors.push(`${vp.name} Canvas: ${e.message || e}`);
        console.log(`${vp.name}: Canvas FAIL`);
        await page.close();
      }

    } catch (e) {
      errors.push(`${vp.name} Phaser: ${e.message || e}`);
      console.log(`${vp.name}: Phaser FAIL`);
      await page.close();
    }
  }

  // ── results ───────────────────────────────────────────────────────────
  const result = {
    success: errors.length === 0,
    errors,
    checks: [
      'phaser-pause-toggle',
      'phaser-speed-toggle',
      'canvas-pause-toggle',
      'canvas-speed-toggle',
      'five-button-bounds-intact',
      'speed-bounds-min-1-max-2',
      'viewports: 390x844, 1024x600, 1340x800',
    ],
  };
  console.log(JSON.stringify(result));
  if (errors.length) process.exitCode = 1;
} catch (error) {
  errors.push(`fatal: ${error.stack || error}`);
  console.log(JSON.stringify({ success: false, errors }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
