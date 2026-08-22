import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'docs/quality/captures/pre-polish';
const VIEWPORTS = [
  { name: '1340x800', w: 1340, h: 800 },
  { name: '1024x600', w: 1024, h: 600 },
  { name: '390x844', w: 390, h: 844 },
];

const STATES = [
  'intro',
  'quiet-build',
  'mid-wave-combat',
  'meteor-telegraph',
  'meteor-impact',
  'tower-inspect',
  'tower-upgrade',
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function captureViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await context.newPage();
  
  const consoleLog = [];
  page.on('console', msg => consoleLog.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLog.push(`[pageerror] ${err.message}`));
  
  await page.goto('http://localhost:8765/phaser.html');
  await sleep(2000); // wait for preload + create
  
  // INTRO state
  await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-intro.png`) });
  
  // QUIET BUILD: place a few towers
  // Click on tower slots (need to find slot positions)
  const slots = await page.evaluate(() => {
    return globalThis.__juraPathLayerContract?.slots?.slice(0, 5) || [];
  });
  
  if (slots.length > 0) {
    // Click first 3 slots to place towers
    for (let i = 0; i < Math.min(3, slots.length); i++) {
      await page.mouse.click(slots[i].x, slots[i].y);
      await sleep(300);
    }
  }
  await sleep(500);
  await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-quiet-build.png`) });
  
  // MID-WAVE COMBAT: start waves
  // Find start wave button and click
  const touchContract = await page.evaluate(() => globalThis.__juraTouchContract);
  if (touchContract?.buttons?.startWave) {
    const btn = touchContract.buttons.startWave;
    await page.mouse.click(btn.x + btn.width/2, btn.y + btn.height/2);
    await sleep(3000); // let enemies spawn and combat happen
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-mid-wave-combat.png`) });
  
  // METEOR TELEGRAPH: activate meteor
  if (touchContract?.buttons?.meteor) {
    const btn = touchContract.buttons.meteor;
    await page.mouse.click(btn.x + btn.width/2, btn.y + btn.height/2);
    await sleep(500);
    // Click somewhere on map to target
    await page.mouse.click(vp.w / 2, vp.h / 2);
    await sleep(1000); // telegraph phase
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-meteor-telegraph.png`) });
    
    // Wait for impact
    await sleep(2000);
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-meteor-impact.png`) });
  }
  
  // TOWER INSPECT: click on a placed tower
  const towerStates = await page.evaluate(() => globalThis.__juraPlacementContract?.towerStates || []);
  if (towerStates.length > 0) {
    const tower = towerStates[0];
    await page.mouse.click(tower.x, tower.y);
    await sleep(500);
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-tower-inspect.png`) });
    
    // TOWER UPGRADE: click upgrade button if visible
    // Look for upgrade button in inspection panel
    await sleep(500);
    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-tower-upgrade.png`) });
  }
  
  // Write console log
  fs.writeFileSync(
    path.join(OUT_DIR, `console-${vp.name}.log`),
    consoleLog.join('\n')
  );
  
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  
  for (const vp of VIEWPORTS) {
    console.log(`Capturing ${vp.name}...`);
    await captureViewport(browser, vp);
  }
  
  await browser.close();
  console.log('Done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
