const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light','dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 700 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="evolucion"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const el = document.querySelector('.meta-goal-card');
      if(el) el.scrollIntoView();
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot12c_${scheme}_meta.png` });
    const html = await page.$eval('.meta-goal-card', el => el.outerHTML.slice(0,400));
    console.log(scheme, html);
    await context.close();
  }
  await browser.close();
})();
