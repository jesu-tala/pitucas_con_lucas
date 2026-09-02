const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(250);
    await page.click('[data-edit-platform="fintual"]');
    await page.waitForTimeout(150);
    await page.fill('[data-platform-field="comision"]', '1.2');
    await page.click('[data-save-platform="fintual"]');
    await page.waitForTimeout(1600);
    await page.evaluate(() => { document.querySelector('[data-edit-platform="fintual"]').closest('.platform-card').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot29_${scheme}_fintual_comision_clean.png` });
    await context.close();
  }
  await browser.close();
})();
