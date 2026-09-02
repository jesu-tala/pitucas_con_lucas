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
    await page.screenshot({ path: `shot13_${scheme}_01_inversiones.png` });

    const subtabs = await page.$$eval('[data-resumen-sub]', els => els.length);
    console.log(scheme, 'subtabs visible:', subtabs);

    // edit fintual value
    const editBtn = await page.$('[data-edit-platform="fintual"]');
    if (editBtn) {
      await editBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot13_${scheme}_02_editing.png` });
      await page.fill('[data-platform-field="valor"]', '520000');
      await page.fill('[data-platform-field="tasaAnual"]', '5');
      await page.click('[data-save-platform="fintual"]');
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot13_${scheme}_03_saved.png` });
    }

    // scroll to chart + planificador
    await page.evaluate(() => { document.getElementById('resumen-content').scrollTop = 900; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot13_${scheme}_04_chart.png` });

    // ver transacciones drill-down
    const verMas = await page.$('[data-platform-vermas]');
    if (verMas) {
      const id = await verMas.evaluate(el => el.getAttribute('data-platform-vermas'));
      await verMas.click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: `shot13_${scheme}_05_vermas_${id}.png` });
      const tabActive = await page.$eval('#tabbar [data-tab].active', el => el.getAttribute('data-tab'));
      console.log(scheme, 'tab after vermas:', tabActive, 'platform:', id);
    }

    // add aporte/retiro manual
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);
    const addBtn = await page.$('[data-add-inversion]');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(200);
      const tipoVal = await page.$eval('[data-seg="draft-tipo"] .active', el => el.getAttribute('data-seg-val')).catch(()=>null);
      console.log(scheme, 'draft tipo preselected:', tipoVal);
      await page.screenshot({ path: `shot13_${scheme}_06_add_inversion_sheet.png` });
    }

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
