// Phaser interaction parity contract — end-to-end browser test.
//
// Exercises the full interaction flow at desktop (FIT mode) and mobile
// (RESIZE mode) viewports with correct canvas coordinate mapping:
//   1. Start a wave
//   2. Place a tower through an actual slot click
//   3. Upgrade the tower (keyboard 'U')
//   4. Sell the tower (keyboard 'R')
//   5. Toggle Pause and Speed
//   6. Exercise Meteor targeting/cancel or impact
//   7. Verify Chrono readiness/state without inventing values
//
// Coordinate mapping:
//   • FIT mode (desktop): game coords (1280x720) → CSS coords via canvas rect
//   • RESIZE mode (mobile): game coords = CSS coords directly
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

// Convert Phaser game-world coords to DOM CSS pixel coordinates.
// RESIZE mode: game coords already equal CSS pixels (canvas === viewport).
// FIT mode: game is 1280×720, scaled to fit the canvas rect. Must use the
// actual canvas bounding rect to get the correct scale factor and any
// top/left offset (Phaser centers the canvas in FIT).
async function gameToCssCoords(page, gameX, gameY) {
  return page.evaluate(({ gx, gy }) => {
    const rc = globalThis.__juraResponsiveContract;
    const isResize = rc && rc.mode === 'RESIZE';

    if (isResize) {
      // RESIZE mode: canvas = viewport, but path layer applies a scale transform
      // to fit 1280x720 virtual coords into the smaller viewport.
      // Apply the same scale: Math.min(canvasW/1280, canvasH/720)
      const scale = Math.min(rc.w / 1280, rc.h / 720);
      return { x: gx * scale, y: gy * scale };
    }

    // FIT mode: map from 1280x720 virtual coords to CSS pixels
    const canvasEl = document.querySelector('canvas');
    if (!canvasEl) return { x: gx, y: gy };
    const rect = canvasEl.getBoundingClientRect();

    const x = gx * (rect.width / 1280) + rect.left;
    const y = gy * (rect.height / 720) + rect.top;
    return { x, y };
  }, { gx: gameX, gy: gameY });
}

// Get button bounds in CSS coordinates
async function getPhaserButtonBounds(page) {
  return page.evaluate(() => {
    const c = globalThis.__juraTouchContract;
    if (!c || !c.actionButtons) return null;
    const rc = globalThis.__juraResponsiveContract;
    const isResize = rc && rc.mode === 'RESIZE';

    const canvasEl = document.querySelector('canvas');
    const rect = canvasEl ? canvasEl.getBoundingClientRect() : null;

    const buttons = {};
    for (const [name, b] of Object.entries(c.actionButtons)) {
      let x = b.x, y = b.y;
      if (isResize) {
        // RESIZE mode: button positions are already in game/CSS coords
        // (scene uses this.scale.width which equals viewport in RESIZE)
        // No transformation needed.
      } else if (rect) {
        // FIT mode: map from 1280x720 virtual coords to CSS pixels
        x = b.x * (rect.width / 1280) + rect.left;
        y = b.y * (rect.height / 720) + rect.top;
      }
      buttons[name] = { x, y, width: b.width, height: b.height };
    }
    return buttons;
  });
}

// Wait for contracts to be ready
async function waitForContracts(page, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => {
      return !!(globalThis.__juraTouchContract &&
                globalThis.__juraPathLayerContract &&
                globalThis.__juraPlacementContract);
    });
    if (ready) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

// Get slot positions in game coords
async function getSlotPositions(page) {
  return page.evaluate(() => {
    const slots = globalThis.__juraPathLayerContract?.slots;
    return slots ? slots.map(s => ({ x: s.x, y: s.y })) : [];
  });
}

// Get placement contract state
async function getPlacementState(page) {
  return page.evaluate(() => {
    const pc = globalThis.__juraPlacementContract;
    if (!pc) return null;
    return {
      selectedType: pc.selectedType,
      occupiedSlots: pc.occupiedSlots,
      towerStates: pc.towerStates,
    };
  });
}

// Get wave bridge state
async function getWaveState(page) {
  return page.evaluate(() => {
    return globalThis.__juraWaveBridge?.state();
  });
}

// Get ability bridge state
async function getAbilityState(page) {
  return page.evaluate(() => {
    return globalThis.__juraAbilityBridge?.state();
  });
}

// ── run per viewport ──────────────────────────────────────────────────────

const viewports = [
  { name: 'desktop', width: 1340, height: 800, mode: 'FIT' },
  { name: 'mobile',  width: 390,  height: 844, mode: 'RESIZE' },
];

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  browser = await chromium.launch();

  for (const vp of viewports) {
    console.log(`\n${vp.name} (${vp.mode} mode): testing full interaction flow…`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${vp.name} console: ${m.text()}`); });

    try {
      await page.goto(`http://127.0.0.1:${port}/phaser.html?scene=playground`, { waitUntil: 'networkidle' });

      // Wait for contracts
      const contractsReady = await waitForContracts(page);
      if (!contractsReady) {
        errors.push(`${vp.name}: contracts not ready within timeout`);
        continue;
      }

      // Dismiss onboarding panel
      await page.evaluate(() => {
        globalThis.__juraOnboardingContract?.dismiss('test');
      });
      await page.waitForTimeout(200);

      // Get button bounds
      const buttons = await getPhaserButtonBounds(page);
      if (!buttons) {
        errors.push(`${vp.name}: no button bounds`);
        continue;
      }

      // Get slot positions
      const slots = await getSlotPositions(page);
      if (slots.length < 2) {
        errors.push(`${vp.name}: insufficient slots`);
        continue;
      }

      // ── 1. Start wave ─────────────────────────────────────────────────
      console.log(`  1. Starting wave…`);
      let waveState = await getWaveState(page);
      assert.equal(waveState.phase, 'INTRO', `${vp.name}: initial phase must be INTRO`);

      await page.mouse.click(buttons.start_waves.x, buttons.start_waves.y);
      await page.waitForTimeout(300);

      waveState = await getWaveState(page);
      assert.equal(waveState.phase, 'PLAYING', `${vp.name}: phase must be PLAYING after start`);
      console.log(`  ✓ Wave started (phase: ${waveState.phase})`);

      // ── 2. Place tower via slot click ─────────────────────────────────
      console.log(`  2. Placing tower at slot 1…`);
      // Pause first to prevent enemy kills from awarding money during placement test
      await page.mouse.click(buttons.pause.x, buttons.pause.y);
      await page.waitForTimeout(100);
      waveState = await getWaveState(page);
      assert.equal(waveState.paused, true, `${vp.name}: must be paused for placement test`);

      const slot1 = slots[1]; // slot 0 is occupied by demo tower
      const slot1Css = await gameToCssCoords(page, slot1.x, slot1.y);

      let placementBefore = await getPlacementState(page);
      const occupiedBefore = Object.keys(placementBefore.occupiedSlots).length;
      const moneyBeforePlace = waveState.money;

      // Resume briefly to place, then pause again
      await page.mouse.click(buttons.pause.x, buttons.pause.y);
      await page.waitForTimeout(50);
      await page.mouse.click(slot1Css.x, slot1Css.y);
      await page.waitForTimeout(50);
      // Pause immediately after placement
      await page.mouse.click(buttons.pause.x, buttons.pause.y);
      await page.waitForTimeout(100);

      const placementAfter = await getPlacementState(page);
      const occupiedAfter = Object.keys(placementAfter.occupiedSlots).length;
      assert.equal(occupiedAfter, occupiedBefore + 1, `${vp.name}: slot must be occupied after click`);

      // Verify money decreased
      waveState = await getWaveState(page);
      assert.ok(waveState.money < moneyBeforePlace, `${vp.name}: money must decrease after placement (${moneyBeforePlace} → ${waveState.money})`);
      console.log(`  ✓ Tower placed (occupied slots: ${occupiedBefore} → ${occupiedAfter}, money: ${moneyBeforePlace} → ${waveState.money})`);

      // ── 3. Upgrade tower (keyboard 'U') ───────────────────────────────
      console.log(`  3. Upgrading tower…`);
      const moneyBeforeUpgrade = waveState.money;

      // The newly placed tower should be auto-selected; game is paused
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      waveState = await getWaveState(page);
      assert.ok(waveState.money < moneyBeforeUpgrade, `${vp.name}: money must decrease after upgrade (${moneyBeforeUpgrade} → ${waveState.money})`);

      // Verify tower level increased
      const placementAfterUpgrade = await getPlacementState(page);
      const towerStates = placementAfterUpgrade.towerStates;
      const newTower = towerStates.find(t => t.x === slot1.x && t.y === slot1.y);
      assert.ok(newTower, `${vp.name}: tower must exist at slot 1`);
      assert.equal(newTower.level, 2, `${vp.name}: tower must be level 2 after upgrade`);
      console.log(`  ✓ Tower upgraded to L${newTower.level} (money: ${moneyBeforeUpgrade} → ${waveState.money})`);

      // ── 4. Sell tower (keyboard 'R') ──────────────────────────────────
      console.log(`  4. Selling tower…`);
      const moneyBeforeSell = waveState.money;

      await page.keyboard.press('r');
      await page.waitForTimeout(200);

      const placementAfterSell = await getPlacementState(page);
      const occupiedAfterSell = Object.keys(placementAfterSell.occupiedSlots).length;
      assert.equal(occupiedAfterSell, occupiedAfter - 1, `${vp.name}: slot must be cleared after sell`);

      waveState = await getWaveState(page);
      assert.ok(waveState.money > moneyBeforeSell, `${vp.name}: money must increase after sell (refund)`);
      console.log(`  ✓ Tower sold (occupied slots: ${occupiedAfter} → ${occupiedAfterSell}, money: ${moneyBeforeSell} → ${waveState.money})`);

      // ── 5. Toggle Pause ───────────────────────────────────────────────
      console.log(`  5. Toggling Pause…`);
      // Currently paused from above; resume first
      waveState = await getWaveState(page);
      if (waveState.paused) {
        await page.mouse.click(buttons.pause.x, buttons.pause.y);
        await page.waitForTimeout(100);
      }
      waveState = await getWaveState(page);
      assert.equal(waveState.paused, false, `${vp.name}: must not be paused initially`);

      await page.mouse.click(buttons.pause.x, buttons.pause.y);
      await page.waitForTimeout(100);

      waveState = await getWaveState(page);
      assert.equal(waveState.paused, true, `${vp.name}: must be paused after click`);
      assert.equal(waveState.phase, 'PAUSED', `${vp.name}: phase must be PAUSED`);

      await page.mouse.click(buttons.pause.x, buttons.pause.y);
      await page.waitForTimeout(100);

      waveState = await getWaveState(page);
      assert.equal(waveState.paused, false, `${vp.name}: must be resumed after second click`);
      assert.equal(waveState.phase, 'PLAYING', `${vp.name}: phase must be PLAYING after resume`);
      console.log(`  ✓ Pause toggled (PLAYING → PAUSED → PLAYING)`);

      // ── 6. Toggle Speed ───────────────────────────────────────────────
      console.log(`  6. Toggling Speed…`);
      // Pause to prevent interference from enemy kills during speed test
      await page.mouse.click(buttons.pause.x, buttons.pause.y);
      await page.waitForTimeout(100);

      waveState = await getWaveState(page);
      assert.equal(waveState.timeScale, 1, `${vp.name}: initial speed must be 1×`);

      await page.mouse.click(buttons.speed.x, buttons.speed.y);
      await page.waitForTimeout(100);

      waveState = await getWaveState(page);
      assert.equal(waveState.timeScale, 2, `${vp.name}: speed must be 2× after click`);

      await page.mouse.click(buttons.speed.x, buttons.speed.y);
      await page.waitForTimeout(100);

      waveState = await getWaveState(page);
      assert.equal(waveState.timeScale, 1, `${vp.name}: speed must restore to 1× after second click`);
      console.log(`  ✓ Speed toggled (1× → 2× → 1×)`);

      // ── 7. Meteor targeting/cancel ────────────────────────────────────
      console.log(`  7. Exercising Meteor…`);
      // Resume game for meteor test
      waveState = await getWaveState(page);
      if (waveState.paused) {
        await page.mouse.click(buttons.pause.x, buttons.pause.y);
        await page.waitForTimeout(100);
      }

      let abilityState = await getAbilityState(page);
      assert.equal(abilityState.meteor.targeting, false, `${vp.name}: must not be targeting initially`);
      assert.equal(abilityState.meteor.ready, true, `${vp.name}: meteor must be ready`);

      // Click meteor button to start targeting
      const meteorBtn = buttons.meteor;
      await page.mouse.click(meteorBtn.x, meteorBtn.y);
      await page.waitForTimeout(200);

      abilityState = await getAbilityState(page);
      assert.equal(abilityState.meteor.targeting, true, `${vp.name}: must be targeting after button click`);

      // Capture telegraph screenshot
      await page.screenshot({ path: `meteor-telegraph-${vp.name}.png` });
      console.log(`  ✓ Captured telegraph screenshot`);

      // Click meteor button again to cancel
      await page.mouse.click(meteorBtn.x, meteorBtn.y);
      await page.waitForTimeout(100);

      abilityState = await getAbilityState(page);
      assert.equal(abilityState.meteor.targeting, false, `${vp.name}: targeting must cancel after second click`);
      console.log(`  ✓ Meteor targeting started and cancelled`);

      // Now fire meteor at a location
      await page.mouse.click(meteorBtn.x, meteorBtn.y);
      await page.waitForTimeout(100);

      abilityState = await getAbilityState(page);
      assert.equal(abilityState.meteor.targeting, true, `${vp.name}: must be targeting`);

      // Click on canvas to fire
      const fireX = 640;
      const fireY = 360;
      const fireCss = await gameToCssCoords(page, fireX, fireY);
      await page.mouse.click(fireCss.x, fireCss.y);
      await page.waitForTimeout(100);

      abilityState = await getAbilityState(page);
      assert.equal(abilityState.meteor.targeting, false, `${vp.name}: targeting must end after fire`);
      assert.equal(abilityState.meteor.hasTarget, true, `${vp.name}: meteor must have target after fire`);
      console.log(`  ✓ Meteor fired at (${fireX}, ${fireY})`);

      // Wait for impact
      await page.waitForTimeout(2000);
      abilityState = await getAbilityState(page);
      assert.equal(abilityState.meteor.hasTarget, false, `${vp.name}: meteor target must clear after impact`);
      
      // Capture impact screenshot
      await page.screenshot({ path: `meteor-impact-${vp.name}.png` });
      console.log(`  ✓ Meteor impacted`);
      console.log(`  ✓ Captured impact screenshot`);

      // ── 8. Verify Chrono state ────────────────────────────────────────
      console.log(`  8. Verifying Chrono state…`);
      abilityState = await getAbilityState(page);

      // Chrono starts not ready (charge=0, pct=0) — but may have charged from leaks
      assert.equal(typeof abilityState.chrono.ready, 'boolean', `${vp.name}: chrono.ready must be boolean`);
      assert.equal(typeof abilityState.chrono.charge, 'number', `${vp.name}: chrono.charge must be number`);
      assert.equal(typeof abilityState.chrono.pct, 'number', `${vp.name}: chrono.pct must be number`);
      assert.equal(typeof abilityState.chrono.cooldown, 'number', `${vp.name}: chrono.cooldown must be number`);
      console.log(`  ✓ Chrono state verified (ready: ${abilityState.chrono.ready}, charge: ${abilityState.chrono.charge}, pct: ${abilityState.chrono.pct})`);

      console.log(`${vp.name}: PASS`);
      await page.close();
    } catch (e) {
      errors.push(`${vp.name}: ${e.message || e}`);
      console.log(`${vp.name}: FAIL — ${e.message}`);
      await page.close();
    }
  }

  // ── results ───────────────────────────────────────────────────────────
  const result = {
    success: errors.length === 0,
    errors,
    checks: [
      'wave-start',
      'tower-placement-via-slot-click',
      'tower-upgrade-via-keyboard',
      'tower-sell-via-keyboard',
      'pause-toggle',
      'speed-toggle',
      'meteor-targeting-cancel',
      'meteor-fire-impact',
      'chrono-state-verification',
      'viewports: desktop (FIT), mobile (RESIZE)',
      'canvas-coordinate-mapping',
    ],
  };
  console.log('\n' + JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (error) {
  errors.push(`fatal: ${error.stack || error}`);
  console.log(JSON.stringify({ success: false, errors }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
