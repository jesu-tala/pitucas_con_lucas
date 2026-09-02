const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light','dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('TUNNEL')) errors.push('console: ' + msg.text()); });
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);
    const cellCount = await page.$$eval('[data-toggle-meta-total-check]', els => els.length);
    console.log(scheme, 'cantidad de cuadraditos (debe ser 12):', cellCount);
    const doneBefore = await page.$$eval('.meta-total-check-cell.done', els => els.length);
    console.log(scheme, 'meses marcados como cumplidos (seed):', doneBefore);
    await page.screenshot({ path: `shot36_${scheme}_grid.png` });
    // click en Septiembre (mes futuro, sin marcar) para probar el toggle
    await page.evaluate(() => {
      const btn = document.querySelector('[data-toggle-meta-total-check="2026-09"]');
      btn.click();
    });
    await page.waitForTimeout(150);
    const sepChecked = await page.evaluate(() => document.querySelector('[data-toggle-meta-total-check="2026-09"]').classList.contains('done'));
    console.log(scheme, 'Septiembre marcado tras click:', sepChecked);
    await page.screenshot({ path: `shot36_${scheme}_after_toggle.png`, clip:{x:0,y:0,width:420,height:600} });
    // click de vuelta para des-marcar
    await page.evaluate(() => { document.querySelector('[data-toggle-meta-total-check="2026-09"]').click(); });
    await page.waitForTimeout(150);
    const sepUnchecked = await page.evaluate(() => !document.querySelector('[data-toggle-meta-total-check="2026-09"]').classList.contains('done'));
    console.log(scheme, 'Septiembre des-marcado tras 2do click:', sepUnchecked);
    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
