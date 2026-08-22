import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const VIEWPORTS = [
  { name: '1340x800', width: 1340, height: 800 },
  { name: '1024x600', width: 1024, height: 600 },
  { name: '390x844', width: 390, height: 844 },
];

const OUTPUT_DIR = 'docs/quality/captures/pre-polish';
const BASE_URL = 'http://localhost:3999/phaser.html';

mkdirSync(OUTPUT_DIR, { recursive: true });

const consoleLogs = [];

async function captureState(page, stateName, viewportName) {
  const filename = `${viewportName}-${stateName}.png`;
  const filepath = join(OUTPUT_DIR, filename);
  await page.screenshot({ path: filepath, type: 'png' });
  console.log(`Captured: ${filename}`);
  return filepath;
}

async function waitForPhaserReady(page) {
  await page.waitForFunction(() => {
    const phaserDiv = document.getElementById('phaser-game');
    return phaserDiv && phaserDiv.querySelector('canvas');
  }, { timeout: 10000 });
  await page.waitForTimeout(2000);
}

async function captureAllStates() {
  const browser = await chromium.launch({ headless: true });
  
  for (const viewport of VIEWPORTS) {
    console.log(`\n=== Capturing viewport: ${viewport.name} ===`);
    
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    
    const page = await context.newPage();
    
    // Capture console output
    const pageConsoleLogs = [];
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      pageConsoleLogs.push(text);
      consoleLogs.push(`[${viewport.name}] ${text}`);
    });
    
    page.on('pageerror', err => {
      const text = `[pageerror] ${err.message}`;
      pageConsoleLogs.push(text);
      consoleLogs.push(`[${viewport.name}] ${text}`);
    });
    
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForPhaserReady(page);
    
    // 1. Intro/onboarding state
    await captureState(page, 'intro', viewport.name);
    
    // 2. Skip onboarding by clicking skip button (bottom-right area)
    const canvas = await page.locator('#phaser-game canvas');
    const box = await canvas.boundingBox();
    
    if (box) {
      // Skip onboarding - click bottom-right area where skip button should be
      await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.95);
      await page.waitForTimeout(500);
      
      // Click start wave button (bottom-left area)
      await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.9);
      await page.waitForTimeout(2000);
      await captureState(page, 'quiet-build', viewport.name);
      
      // 3. Place multiple towers via slot clicks
      // Click on slot areas (scattered around the map)
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
      await page.waitForTimeout(500);
      
      // Cycle tower type with T key
      await page.keyboard.press('t');
      await page.waitForTimeout(300);
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForTimeout(500);
      
      // Cycle again
      await page.keyboard.press('t');
      await page.waitForTimeout(300);
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3);
      await page.waitForTimeout(500);
      
      // Wait for combat to develop
      await page.waitForTimeout(5000);
      await captureState(page, 'mid-wave-combat', viewport.name);
      
      // 4. Meteor telegraph - press M or click meteor button area
      await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.9);
      await page.waitForTimeout(1000);
      await captureState(page, 'meteor-telegraph', viewport.name);
      
      // Fire meteor at center
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForTimeout(500);
      await captureState(page, 'meteor-impact', viewport.name);
      
      // 5. Tower inspect/upgrade - click on a tower area
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
      await page.waitForTimeout(500);
      await captureState(page, 'tower-inspect', viewport.name);
      
      // Upgrade with U key
      await page.keyboard.press('u');
      await page.waitForTimeout(500);
      await captureState(page, 'tower-upgrade', viewport.name);
    }
    
    // Save console logs for this viewport
    writeFileSync(
      join(OUTPUT_DIR, `console-${viewport.name}.log`),
      pageConsoleLogs.join('\n')
    );
    
    await context.close();
  }
  
  await browser.close();
  
  // Save all console logs
  writeFileSync(join(OUTPUT_DIR, 'console-all.log'), consoleLogs.join('\n'));
  console.log('\n=== Capture complete ===');
}

captureAllStates().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
