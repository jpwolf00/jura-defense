// QA state capture — exercises all required game states for the commercial reference matrix
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join } from 'path';

const PORT = 8766;
const HOST = 'http://localhost:' + PORT;

const server = createServer(async (req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const path = join(process.cwd(), 'dist', url);
  try {
    const data = await readFile(path);
    const ext = path.split('.').pop();
    const types = { html: 'text/html', js: 'application/javascript', css: 'text/css', png: 'image/png' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function captureState(browser, mapNum, viewport, stateName, filename, actions = []) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  
  await page.goto(`${HOST}/phaser.html?map=${mapNum}`);
  await page.waitForTimeout(1500);
  
  // Execute actions to reach desired state
  for (const action of actions) {
    if (action.type === 'wait') {
      await page.waitForTimeout(action.ms);
    } else if (action.type === 'key') {
      await page.keyboard.press(action.key);
    } else if (action.type === 'click') {
      await page.mouse.click(action.x, action.y);
    }
  }
  
  await page.screenshot({ path: filename, type: 'png' });
  console.log(`  ✓ ${stateName}: ${errors.length === 0 ? 'zero errors' : errors.length + ' errors'}`);
  
  await context.close();
  return { filename, errors };
}

async function main() {
  await server.listen(PORT);
  console.log(`Server listening on ${HOST}\n`);
  
  const browser = await chromium.launch();
  const viewport = { width: 1340, height: 800 };
  const results = [];
  
  // State 1: Intro (initial load)
  results.push(await captureState(browser, 1, viewport, 'intro', 'qa-intro.png', []));
  
  // State 2: Quiet build (before waves start)
  results.push(await captureState(browser, 1, viewport, 'quiet-build', 'qa-quiet-build.png', [
    { type: 'wait', ms: 500 }
  ]));
  
  // State 3: Mid-wave combat (start waves, wait for combat)
  results.push(await captureState(browser, 1, viewport, 'mid-wave-combat', 'qa-mid-wave-combat.png', [
    { type: 'key', key: 's' },  // Start waves
    { type: 'wait', ms: 3000 }  // Wait for combat
  ]));
  
  // State 4: Tower inspection
  results.push(await captureState(browser, 1, viewport, 'tower-inspect', 'qa-tower-inspect.png', [
    { type: 'click', x: 400, y: 300 }  // Click a tower slot
  ]));
  
  // State 5: Meteor telegraph
  results.push(await captureState(browser, 1, viewport, 'meteor-telegraph', 'qa-meteor-telegraph.png', [
    { type: 'key', key: 'm' },  // Activate meteor
    { type: 'wait', ms: 500 }
  ]));
  
  await browser.close();
  server.close();
  
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  console.log(`\n✓ Captured ${results.length} states, ${totalErrors} total errors`);
  process.exit(totalErrors === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  server.close();
  process.exit(1);
});
