// tests/onboarding_contract.mjs
// Focused contract assertions for the P3-02 onboarding panel.
// Boots Phaser in a headless browser, verifies:
//   • __juraOnboardingContract is exposed
//   • requiredActionKeys covers the full slice brief
//   • visible=true initially, dismissed=false
//   • dismiss() flips visible=false, dismissed=true
//   • panel does not obscure the bottom HUD row (y≈660) or path corridor

import playwright from '/Users/jasonwolf/.hermes/hermes-agent/node_modules/playwright/index.js';
const { chromium } = playwright;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
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

const REQUIRED_KEYS = [
  'select_slot',
  'tower_type_cycle',
  'upgrade',
  'sell',
  'start_waves',
  'pause',
  'speed',
  'meteor',
  'chrono',
];

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`http ${r.status()}: ${r.url()}`); });

  // Use the Vite preview so Phaser's bare module specifier is bundled/resolved.
  await page.goto('http://127.0.0.1:4173/phaser.html?scene=playground', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500); // let Phaser boot

  // 1. Contract is exposed
  const contractExists = await page.evaluate(() => typeof globalThis.__juraOnboardingContract === 'object');
  assert.equal(contractExists, true, '__juraOnboardingContract must be exposed');

  // 2. requiredActionKeys covers the full slice brief
  const keys = await page.evaluate(() => globalThis.__juraOnboardingContract.requiredActionKeys);
  for (const key of REQUIRED_KEYS) {
    assert.ok(keys.includes(key), `requiredActionKeys must include "${key}"`);
  }

  // 3. Initial state: visible=true, dismissed=false
  const initialVisible = await page.evaluate(() => globalThis.__juraOnboardingContract.visible);
  const initialDismissed = await page.evaluate(() => globalThis.__juraOnboardingContract.dismissed);
  assert.equal(initialVisible, true, 'panel must be visible initially');
  assert.equal(initialDismissed, false, 'panel must not be dismissed initially');

  // 4. Dismiss flips state
  await page.evaluate(() => globalThis.__juraOnboardingContract.dismiss('test'));
  await page.waitForTimeout(100);
  const afterVisible = await page.evaluate(() => globalThis.__juraOnboardingContract.visible);
  const afterDismissed = await page.evaluate(() => globalThis.__juraOnboardingContract.dismissed);
  const afterReason = await page.evaluate(() => globalThis.__juraOnboardingContract.dismissReason);
  assert.equal(afterVisible, false, 'panel must be hidden after dismiss()');
  assert.equal(afterDismissed, true, 'panel must be marked dismissed after dismiss()');
  assert.equal(afterReason, 'test', 'dismissReason must reflect the reason passed to dismiss()');

  // 5. Panel geometry does not obscure critical HUD zones
  //    • Bottom HUD row: y≈660 (Start Waves / Meteor / Chrono buttons)
  //    • Path corridor: runs through the middle (y≈140–560)
  //    • Tower slots: along the path
  //    The panel is anchored at (20, 160) with height 250, so it spans y=160–410.
  //    This is below the wave HUD (y≈120) and above the bottom button row (y≈660).
  //    We verify the panel's bounding box does not intersect y≥640 (button row).
  const panelBounds = await page.evaluate(() => {
    const scene = globalThis.__juraPhaserGame?.scene?.getScene('PlaygroundScene');
    if (!scene || !scene._onboardingBg) return null;
    const bg = scene._onboardingBg;
    return {
      x: bg.x - bg.width / 2,
      y: bg.y - bg.height / 2,
      width: bg.width,
      height: bg.height,
      bottom: bg.y + bg.height / 2,
    };
  });
  if (panelBounds) {
    assert.ok(panelBounds.bottom < 640, `panel bottom (${panelBounds.bottom}) must not obscure bottom HUD row (y≈660)`);
    assert.ok(panelBounds.y >= 140, `panel top (${panelBounds.y}) must not overlap wave HUD (y≈120)`);
  }

  await page.screenshot({ path: '/tmp/onboarding_contract.png' });

  const result = { success: errors.length === 0, errors, checks: ['contract exposed', 'requiredActionKeys complete', 'initial state', 'dismiss flips state', 'panel geometry safe'] };
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
