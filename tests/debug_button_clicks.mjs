// Debug script to test if buttons receive clicks
import playwright from '/Users/jasonwolf/.hermes/hermes-agent/node_modules/playwright/index.js';
const { chromium } = playwright;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
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

const viewports = [
  { name: 'mobile',  width: 390,  height: 844  },
];

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  browser = await chromium.launch();

  for (const vp of viewports) {
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`http://127.0.0.1:${port}/phaser.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Check initial state
    const initialState = await page.evaluate(() => {
      const contract = globalThis.__juraTouchContract;
      return {
        paused: contract.pause.state().paused,
        timeScale: contract.speed.state().timeScale,
      };
    });
    console.log('Initial state:', initialState);

    // Get button position and canvas info
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      const contract = globalThis.__juraTouchContract;
      const pauseBtn = contract.actionButtons.pause;
      
      return {
        canvas: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          scaleX: canvas.width / rect.width,
          scaleY: canvas.height / rect.height,
        },
        pauseBtn: {
          canvasX: pauseBtn.x,
          canvasY: pauseBtn.y,
          // Convert to CSS viewport coordinates
          cssX: pauseBtn.x / (canvas.width / rect.width) + rect.left,
          cssY: pauseBtn.y / (canvas.height / rect.height) + rect.top,
        }
      };
    });
    console.log('Canvas info:', info.canvas);
    console.log('Pause button:', info.pauseBtn);

    // Try clicking at CSS coordinates
    console.log(`\nClicking at CSS (${info.pauseBtn.cssX}, ${info.pauseBtn.cssY})...`);
    await page.mouse.click(info.pauseBtn.cssX, info.pauseBtn.cssY);
    await page.waitForTimeout(100);

    const afterClick1 = await page.evaluate(() => {
      const contract = globalThis.__juraTouchContract;
      return {
        paused: contract.pause.state().paused,
        label: contract.pause.state().label,
      };
    });
    console.log('After click 1:', afterClick1);

    // Click again
    await page.mouse.click(info.pauseBtn.cssX, info.pauseBtn.cssY);
    await page.waitForTimeout(100);

    const afterClick2 = await page.evaluate(() => {
      const contract = globalThis.__juraTouchContract;
      return {
        paused: contract.pause.state().paused,
        label: contract.pause.state().label,
      };
    });
    console.log('After click 2:', afterClick2);

    await page.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
