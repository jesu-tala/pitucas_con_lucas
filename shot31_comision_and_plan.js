const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('TUNNEL')) errors.push('console: ' + msg.text()); });

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(250);

    // set commission on fintual (no metas, valorActual 504000, aportado 480000 -> ganancia 24000)
    await page.click('[data-edit-platform="fintual"]');
    await page.waitForTimeout(150);
    await page.fill('[data-platform-field="comision"]', '1.2');
    await page.click('[data-save-platform="fintual"]');
    await page.waitForTimeout(300);
    const fintualComisionTxt = await page.evaluate(() => {
      const card = document.querySelector('[data-edit-platform="fintual"]').closest('.platform-card');
      return card.querySelector('.platform-comision-row')?.innerText || null;
    });
    console.log(scheme, 'fintual comision row (expect based on $24.000 ganancia, 1.2% = $288/año):', fintualComisionTxt);
    await page.screenshot({ path: `shot31_${scheme}_01_fintual_comision.png` });

    // set commission on Fondo de emergencia meta (acumulado 2.2M, aportadoNeto 2.15M -> ganancia 50000)
    const editMetaBtn = await page.$('[data-edit-meta]');
    const metaId = await editMetaBtn.evaluate(el => el.getAttribute('data-edit-meta'));
    await editMetaBtn.click();
    await page.waitForTimeout(150);
    await page.fill('[data-meta-field="comision"]', '0.8');
    await page.click(`[data-save-meta="${metaId}"]`);
    await page.waitForTimeout(1800);
    const metaComisionTxt = await page.evaluate((id) => {
      const btn = document.querySelector(`[data-edit-meta="${id}"]`);
      const card = btn.closest('.meta-goal-card');
      return card.querySelector('.platform-comision-row')?.innerText || null;
    }, metaId);
    console.log(scheme, 'meta comision row (expect based on $50.000 ganancia, 0.8% = $400/año):', metaComisionTxt);
    await page.evaluate(() => { document.querySelector('.meta-goal-card').scrollIntoView({block:'center'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot31_${scheme}_02_meta_comision.png` });

    // Confirm "Como se reparte la inversion de largo plazo" widget is GONE
    const hasInvestWidget = await page.evaluate(() => document.body.textContent.includes('Cómo se reparte la inversión de largo plazo'));
    console.log(scheme, 'invest sub-split widget present (expect false):', hasInvestWidget);

    // Scroll to planificador to visually confirm it ends cleanly after the 3 plazo groups
    await page.evaluate(() => { document.querySelector('.plan-footer').scrollIntoView({block:'center'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot31_${scheme}_03_plan_footer.png` });

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
