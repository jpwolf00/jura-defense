// Capture screenshots of both maps at desktop and portrait viewports
// to prove they are visibly distinct.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join } from 'path';

const PORT = 8765;
const HOST = 'http://localhost:' + PORT;

// Simple static file server
const server = createServer(async (req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const path = join(process.cwd(), 'dist', url);
  try {
    const data = await readFile(path);
    const ext = path.split('.').pop();
    const types = { html: 'text/html', js: 'application/javascript', css: 'text/css', png: 'image/png', json: 'application/json' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function captureMap(browser, mapNum, viewport, filename) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  
  await page.goto(`${HOST}/phaser.html?map=${mapNum}`);
  
  // Wait for terrain to render (Phaser scene create)
  await page.waitForTimeout(1500);
  
  // Check for console errors
  if (errors.length > 0) {
    console.error(`  ✗ Map ${mapNum} at ${viewport.width}x${viewport.height} has ${errors.length} console errors:`);
    errors.forEach(e => console.error(`    - ${e}`));
  } else {
    console.log(`  ✓ Map ${mapNum} at ${viewport.width}x${viewport.height}: zero console errors`);
  }
  
  await page.screenshot({ path: filename, type: 'png' });
  console.log(`    Saved: ${filename}`);
  
  await context.close();
  return errors.length === 0;
}

async function main() {
  await server.listen(PORT);
  console.log(`Server listening on ${HOST}`);
  
  const browser = await chromium.launch();
  
  const viewports = {
    desktop: { width: 1340, height: 800 },
    portrait: { width: 390, height: 844 },
  };
  
  let allPassed = true;
  
  for (const [name, vp] of Object.entries(viewports)) {
    console.log(`\n[${name.toUpperCase()}]`);
    const pass1 = await captureMap(browser, 1, vp, `terrain-map1-${name}.png`);
    const pass2 = await captureMap(browser, 2, vp, `terrain-map2-${name}.png`);
    allPassed = allPassed && pass1 && pass2;
  }
  
  await browser.close();
  server.close();
  
  if (allPassed) {
    console.log('\n✓ All captures succeeded with zero console errors');
    process.exit(0);
  } else {
    console.log('\n✗ Some captures had console errors');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  server.close();
  process.exit(1);
});
