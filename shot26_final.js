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

    // ---- Point 2: Evolución full year totals ----
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="evolucion"]');
    await page.waitForTimeout(250);
    const yearCaption = await page.$$eval('.evo-detail-month', els => els[els.length-1].textContent);
    console.log(scheme, 'year caption:', yearCaption);
    const yearIngresos = await page.evaluate(() => {
      const title = [...document.querySelectorAll('.section-title')].find(el => el.textContent.includes('Total del año'));
      return title.nextElementSibling.textContent;
    });
    console.log(scheme, 'year card raw text:', yearIngresos);
    await page.screenshot({ path: `shot26_${scheme}_01_evolucion_year.png`, fullPage: true });

    // ---- Point 1: projection card ----
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(250);
    await page.evaluate(() => { document.querySelector('.proyeccion-card').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot26_${scheme}_02_proyeccion.png` });

    const totalBefore = await page.$eval('[data-proy-total]', el => el.textContent);
    console.log(scheme, 'proyeccion total before:', totalBefore);

    await page.fill('[data-proy-retorno-input]', '10');
    await page.waitForTimeout(150);
    const totalAfterRetorno = await page.$eval('[data-proy-total]', el => el.textContent);
    console.log(scheme, 'proyeccion total after retorno=10:', totalAfterRetorno);

    await page.fill('[data-proy-inflacion-input]', '5');
    await page.waitForTimeout(150);
    const totalAfterInflacion = await page.$eval('[data-proy-total]', el => el.textContent);
    console.log(scheme, 'proyeccion total after inflacion=5:', totalAfterInflacion);
    await page.screenshot({ path: `shot26_${scheme}_03_proyeccion_edited.png` });

    // confirm inputs kept focus mid-edit (didn't get wiped by a full re-render)
    const focusedTag = await page.evaluate(() => document.activeElement.getAttribute('data-proy-inflacion-input') !== null);
    console.log(scheme, 'inflacion input still focused after typing:', focusedTag);

    // ---- Point 3: commission per meta ----
    // fintual has no metas -> should still show platform-level commission field in edit form
    await page.click('[data-edit-platform="fintual"]');
    await page.waitForTimeout(200);
    const fintualComisionInputExists = await page.$('[data-platform-field="comision"]') !== null;
    console.log(scheme, 'fintual (no metas) has platform comision input:', fintualComisionInputExists);
    await page.fill('[data-platform-field="comision"]', '1.2');
    await page.click('[data-save-platform="fintual"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot26_${scheme}_04_fintual_comision.png` });
    const fintualHasComisionRow = await page.$('[data-platform-vermas="fintual"]').then(async () => {
      return await page.evaluate(() => {
        const card = document.querySelector('[data-edit-platform="fintual"]').closest('.platform-card');
        return !!card.querySelector('.platform-comision-row');
      });
    });
    console.log(scheme, 'fintual comision row visible after save:', fintualHasComisionRow);

    // banco_chile HAS metas -> platform-level comision input should be gone from edit form
    await page.click('[data-edit-platform="banco_chile"]');
    await page.waitForTimeout(200);
    const bchComisionInputExists = await page.$('[data-platform-field="comision"]') !== null;
    console.log(scheme, 'banco_chile (has metas) has platform comision input (expect false):', bchComisionInputExists);
    await page.screenshot({ path: `shot26_${scheme}_05_bch_edit_no_comision.png` });
    await page.click('[data-cancel-platform-edit]');
    await page.waitForTimeout(150);

    const bchPlatformHasComisionRow = await page.evaluate(() => {
      const card = document.querySelector('[data-edit-platform="banco_chile"]').closest('.platform-card');
      return !!card.querySelector('.platform-comision-row');
    });
    console.log(scheme, 'banco_chile platform-level comision row visible (expect false):', bchPlatformHasComisionRow);

    // edit "Fondo de emergencia" meta and set a commission
    const editMetaBtn = await page.$('[data-edit-meta]');
    if (editMetaBtn) {
      const metaId = await editMetaBtn.evaluate(el => el.getAttribute('data-edit-meta'));
      await editMetaBtn.click();
      await page.waitForTimeout(200);
      const metaComisionInputExists = await page.$('[data-meta-field="comision"]') !== null;
      console.log(scheme, 'meta edit form has comision input:', metaComisionInputExists);
      await page.fill('[data-meta-field="comision"]', '0.8');
      await page.screenshot({ path: `shot26_${scheme}_06_meta_editing_comision.png` });
      await page.click(`[data-save-meta="${metaId}"]`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot26_${scheme}_07_meta_saved_comision.png`, fullPage: true });
      const metaHasComisionRow = await page.evaluate((id) => {
        const btn = document.querySelector(`[data-edit-meta="${id}"]`);
        const card = btn.closest('.meta-goal-card');
        return !!card.querySelector('.platform-comision-row');
      }, metaId);
      console.log(scheme, 'meta comision row visible after save:', metaHasComisionRow);
    }

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
