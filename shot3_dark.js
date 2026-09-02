const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 900, height: 950 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);

  await page.click('button[data-filter="pendientes"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot3_dark_pendientes.png' });

  await page.click('button[data-filter="porcobrar"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot3_dark_porcobrar.png' });

  await page.click('button[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot3_dark_balance.png', fullPage: true });

  await page.click('button[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  await page.click('#fab-add');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot3_dark_newtx.png' });

  console.log('ERRORS', errors);
  await browser.close();
})();
