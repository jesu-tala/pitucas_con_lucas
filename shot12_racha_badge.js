const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light','dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 700 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="evolucion"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.getElementById('resumen-content').scrollTop = 700; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot12_${scheme}_racha.png` });
    console.log(scheme, 'ERRORS', errors);
    await context.close();
  }
  await browser.close();
})();
