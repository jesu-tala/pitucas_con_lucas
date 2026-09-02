const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('file://' + path.join(__dirname, 'opciones-diseno.html'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'opciones_full.png', fullPage: true });
  console.log('ERRORS', errors);
  await browser.close();
})();
