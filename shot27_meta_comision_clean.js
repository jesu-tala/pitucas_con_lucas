const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(250);

    const editMetaBtn = await page.$('[data-edit-meta]');
    const metaId = await editMetaBtn.evaluate(el => el.getAttribute('data-edit-meta'));
    await editMetaBtn.click();
    await page.waitForTimeout(150);
    await page.fill('[data-meta-field="comision"]', '0.8');
    await page.click(`[data-save-meta="${metaId}"]`);
    await page.waitForTimeout(900); // let toast disappear
    await page.evaluate(() => { document.querySelector('.platform-goal-nest').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot27_${scheme}_meta_comision_clean.png` });
    await context.close();
  }
  await browser.close();
})();
