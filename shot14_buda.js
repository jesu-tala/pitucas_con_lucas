const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 420, height: 700 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-resumen-sub="inversiones"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelector('[data-edit-platform="buda"]').scrollIntoView({block:'center'}); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot14_buda_card.png' });
  await browser.close();
})();
