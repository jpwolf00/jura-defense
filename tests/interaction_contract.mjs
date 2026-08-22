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

const text = (page, selector) => page.locator(selector).textContent().then((v) => (v || '').trim());
let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.locator('#startGameBtn').click();

  const pauseBefore = await text(page, '#pauseBtn');
  await page.locator('#pauseBtn').click();
  const pauseAfter = await text(page, '#pauseBtn');
  assert.notEqual(pauseAfter, pauseBefore, 'pause button must change state');
  await page.locator('#pauseBtn').click();
  assert.equal(await text(page, '#pauseBtn'), pauseBefore, 'pause button must restore state');
  await page.keyboard.press(' ');
  assert.notEqual(await text(page, '#pauseBtn'), pauseBefore, 'Space must pause');
  await page.keyboard.press(' ');
  assert.equal(await text(page, '#pauseBtn'), pauseBefore, 'Space must resume');

  assert.match(await text(page, '#ffwdBtn'), /1×/);
  await page.keyboard.press('f');
  assert.match(await text(page, '#ffwdBtn'), /2×/, 'F must enable fast-forward');
  await page.keyboard.press('f');
  assert.match(await text(page, '#ffwdBtn'), /1×/, 'F must restore normal speed');

  await page.locator('#startWaveBtn').click();
  await page.waitForTimeout(150);
  await page.locator('#meteorBtn').click();
  assert.equal(await page.locator('#meteorBtn').evaluate((el) => el.classList.contains('targeting')), true);
  await page.keyboard.press('m');
  assert.equal(await page.locator('#meteorBtn').evaluate((el) => el.classList.contains('targeting')), false);
  assert.doesNotMatch(await text(page, '#info'), /Meteor Call/, 'meteor targeting info must clear on keyboard cancel');
  await page.locator('#meteorBtn').click();
  assert.equal(await page.locator('#meteorBtn').evaluate((el) => el.classList.contains('targeting')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#meteorBtn').evaluate((el) => el.classList.contains('targeting')), false, 'Escape must cancel meteor targeting');
  await page.screenshot({ path: '/tmp/interaction_contract.png' });

  const result = { success: errors.length === 0, errors, checks: ['boot', 'pause/resume', 'fast-forward', 'wave start', 'meteor target/cancel'] };
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
