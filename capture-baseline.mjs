import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: '1340x800', width: 1340, height: 800 },
  { name: '1024x600', width: 1024, height: 600 },
  { name: '390x844', width: 390, height: 844 },
];

const OUT_DIR = 'docs/quality/captures/pre-polish';
const URL = 'http://localhost:57122/phaser.html';

fs.mkdirSync(OUT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function captureState(page, viewportName, stateName, consoleLog) {
  const filename = `${viewportName}__${stateName}.png`;
  const filepath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: filepath, type: 'png' });
  consoleLog.push(`[${viewportName}/${stateName}] captured -> ${filepath}`);
  return filepath;
}

async function runViewport(viewport) {
  const consoleLog = [];
  console.log(`\n=== Viewport: ${viewport.name} (${viewport.width}x${viewport.height}) ===`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Capture console output
  page.on('console', msg => {
    const line = `[console.${msg.type()}] ${msg.text()}`;
    consoleLog.push(line);
  });
  page.on('pageerror', err => {
    consoleLog.push(`[pageerror] ${err.message}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(2000); // Let game initialize

  // 1. INTRO state (with onboarding visible)
  await captureState(page, viewport.name, 'intro', consoleLog);

  // 2. QUIET BUILD - dismiss onboarding, place some towers
  await page.evaluate(() => {
    // Dismiss onboarding
    if (window.__juraOnboardingContract) {
      window.__juraOnboardingContract.dismiss('test');
    }
  });
  await sleep(500);
  
  // Place multiple towers of different types
  // First, get slot positions
  const slots = await page.evaluate(() => {
    return window.__juraPathLayerContract?.slots || [];
  });
  
  if (slots.length >= 4) {
    // Place towers at different slots
    for (let i = 1; i < Math.min(5, slots.length); i++) {
      // Cycle tower type first
      await page.keyboard.press('t');
      await sleep(100);
      
      // Click on slot
      await page.evaluate((slotIdx) => {
        const slots = window.__juraPathLayerContract?.slots || [];
        if (slots[slotIdx]) {
          const scene = window.__juraTerrainLayer?.scene;
          if (scene && scene.input) {
            // Simulate click on slot
            scene.input.emit('pointerdown', { x: slots[slotIdx].x, y: slots[slotIdx].y });
          }
        }
      }, i);
      await sleep(200);
    }
  }
  
  await captureState(page, viewport.name, 'quiet-build', consoleLog);

  // 3. MID-WAVE COMBAT - start waves and wait for enemies
  await page.evaluate(() => {
    if (window.__juraWaveBridge) {
      window.__juraWaveBridge.start();
    }
  });
  
  // Wait for enemies to spawn and spread out
  await sleep(8000);
  await captureState(page, viewport.name, 'mid-wave-combat', consoleLog);

  // 4. METEOR TELEGRAPH - start meteor targeting
  await page.evaluate(() => {
    if (window.__juraAbilityBridgeInstance) {
      window.__juraAbilityBridgeInstance.startMeteorTargeting();
    }
  });
  await sleep(500); // Telegraph phase
  await captureState(page, viewport.name, 'meteor-telegraph', consoleLog);

  // 5. METEOR IMPACT - fire meteor
  await page.evaluate(() => {
    if (window.__juraAbilityBridgeInstance) {
      // Fire at center of map
      window.__juraAbilityBridgeInstance.fireMeteor(640, 360);
    }
  });
  await sleep(1500); // Impact + explosion
  await captureState(page, viewport.name, 'meteor-impact', consoleLog);

  // 6. TOWER INSPECT - click on a placed tower
  if (slots.length >= 2) {
    await page.evaluate((slotIdx) => {
      const slots = window.__juraPathLayerContract?.slots || [];
      if (slots[slotIdx]) {
        const scene = window.__juraTerrainLayer?.scene;
        if (scene && scene.input) {
          scene.input.emit('pointerdown', { x: slots[slotIdx].x, y: slots[slotIdx].y });
        }
      }
    }, 1);
    await sleep(1000);
    await captureState(page, viewport.name, 'tower-inspect', consoleLog);
  }

  // 7. TOWER UPGRADE - press U to upgrade selected tower
  await page.keyboard.press('u');
  await sleep(1000);
  await captureState(page, viewport.name, 'tower-upgrade', consoleLog);

  // Write console log
  const logPath = path.join(OUT_DIR, `${viewport.name}__console.log`);
  fs.writeFileSync(logPath, consoleLog.join('\n'));
  console.log(`Console log: ${logPath} (${consoleLog.length} lines)`);

  await browser.close();
  return consoleLog;
}

async function main() {
  console.log('Starting pre-polish visual baseline capture...');
  console.log(`Output directory: ${OUT_DIR}`);

  for (const viewport of VIEWPORTS) {
    await runViewport(viewport);
  }

  console.log('\n=== Capture complete ===');
  const files = fs.readdirSync(OUT_DIR);
  console.log(`Total files: ${files.length}`);
  files.forEach(f => console.log(`  ${f}`));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
