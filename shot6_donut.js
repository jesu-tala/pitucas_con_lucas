const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('button[data-tab="resumen"]');
    await page.waitForTimeout(250);
    await page.evaluate(() => { document.querySelector('.view-scroll').scrollTop = 600; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot6_${scheme}_donut.png` });

    // also scroll further for full category legend
    await page.evaluate(() => { document.querySelector('.view-scroll').scrollTop = 1400; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot6_${scheme}_donut2.png` });

    await context.close();
  }
  await browser.close();
})();
