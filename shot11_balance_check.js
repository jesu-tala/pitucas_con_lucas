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
  await page.screenshot({ path: 'shot11_balance_agosto.png' });
  // navigate back a few months
  await page.click('[data-month-nav="-1"]');
  await page.waitForTimeout(150);
  await page.click('[data-month-nav="-1"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot11_balance_junio.png' });
  await browser.close();
})();
