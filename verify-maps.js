import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  
  // Map 1 - dismiss onboarding
  const page1 = await context.newPage();
  await page1.goto('http://localhost:5176/?map=1');
  await page1.waitForTimeout(1000);
  // Click "Start Expedition" button to dismiss onboarding
  await page1.click('button:has-text("Start Expedition")');
  await page1.waitForTimeout(2000);
  await page1.screenshot({ path: 'map1-terrain.png' });
  
  // Map 2 - dismiss onboarding
  const page2 = await context.newPage();
  await page2.goto('http://localhost:5176/?map=2');
  await page2.waitForTimeout(1000);
  await page2.click('button:has-text("Start Expedition")');
  await page2.waitForTimeout(2000);
  await page2.screenshot({ path: 'map2-terrain.png' });
  
  await browser.close();
  console.log('Terrain screenshots captured: map1-terrain.png, map2-terrain.png');
})();
