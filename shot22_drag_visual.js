const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);

  const invBox = await page.$eval('[data-resumen-sub="inversiones"]', el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
  await page.mouse.move(invBox.x, invBox.y);
  await page.mouse.down();
  await page.mouse.move(invBox.x - 100, invBox.y, {steps:8});
  await page.waitForTimeout(80);
  await page.screenshot({ path: 'shot22_dragging_visual.png' });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot22_after_drag_visual.png' });

  await context.close();
  await browser.close();
})();
