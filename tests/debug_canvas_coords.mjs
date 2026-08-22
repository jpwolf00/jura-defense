// Debug script to inspect canvas coordinates and button positions
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
  { name: 'tablet',  width: 1024, height: 600  },
  { name: 'desktop', width: 1340, height: 800  },
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

    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'no canvas' };
      
      const rect = canvas.getBoundingClientRect();
      const contract = globalThis.__juraTouchContract;
      const responsive = globalThis.__juraResponsiveContract;
      
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        canvas: {
          width: canvas.width,
          height: canvas.height,
          cssWidth: rect.width,
          cssHeight: rect.height,
          left: rect.left,
          top: rect.top,
          scaleX: canvas.width / rect.width,
          scaleY: canvas.height / rect.height,
        },
        responsive: responsive ? {
          mode: responsive.mode,
          w: responsive.w,
          h: responsive.h,
        } : null,
        contract: contract ? {
          layout: contract.layout,
          buttons: Object.fromEntries(
            Object.entries(contract.actionButtons).map(([k, v]) => [k, {
              x: v.x, y: v.y, w: v.width, h: v.height, row: v.row
            }])
          )
        } : null,
      };
    });

    console.log(JSON.stringify(info, null, 2));
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
