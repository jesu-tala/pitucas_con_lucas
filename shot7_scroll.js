const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 900, height: 950 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);
  const t3 = await page.$('button[data-tx="t3"]');
  await t3.click();
  await page.waitForTimeout(300);
  const marcarBtn = await page.$('[data-action="porcobrar"]');
  await marcarBtn.click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('sheet-content').scrollTop = 900; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot7_scrolled_cobro_block.png' });
  await browser.close();
})();
