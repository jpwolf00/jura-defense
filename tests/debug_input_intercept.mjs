// Debug script to check what's receiving the click
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

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  
  // Listen for console messages
  page.on('console', (msg) => {
    console.log('PAGE:', msg.text());
  });
  
  await page.goto(`http://127.0.0.1:${port}/phaser.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Add debug listeners to check what's receiving clicks
  await page.evaluate(() => {
    const contract = globalThis.__juraTouchContract;
    const pauseBtn = contract.actionButtons.pause;
    
    // Add a global pointer listener
    const canvas = document.querySelector('canvas');
    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      console.log(`DOM pointerdown at (${x}, ${y})`);
    });
    
    // Try to access the Phaser game instance and add a listener
    if (window.game && window.game.scene) {
      const scene = window.game.scene.scenes.find(s => s.key === 'PlaygroundScene');
      if (scene && scene.input) {
        scene.input.on('pointerdown', (pointer) => {
          console.log(`Phaser pointerdown at (${pointer.x}, ${pointer.y})`);
          
          // Check what game objects are at this position
          const children = scene.children.list;
          for (const child of children) {
            if (child.input && child.input.hitArea) {
              const bounds = child.getBounds();
              if (pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
                  pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height) {
                console.log(`Hit object at (${bounds.x}, ${bounds.y}, ${bounds.width}x${bounds.height})`);
              }
            }
          }
        });
      }
    }
  });

  // Get button position
  const pausePos = await page.evaluate(() => {
    const contract = globalThis.__juraTouchContract;
    return { x: contract.actionButtons.pause.x, y: contract.actionButtons.pause.y };
  });
  console.log(`\nClicking at (${pausePos.x}, ${pausePos.y})...`);
  
  await page.mouse.click(pausePos.x, pausePos.y);
  await page.waitForTimeout(200);

  // Check state
  const state = await page.evaluate(() => {
    const contract = globalThis.__juraTouchContract;
    return {
      paused: contract.pause.state().paused,
      label: contract.pause.state().label,
    };
  });
  console.log('State after click:', state);

  await page.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
