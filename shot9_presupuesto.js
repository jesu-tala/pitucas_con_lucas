const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));
    page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);

    // go to Resumen tab
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot9_${scheme}_01_balance.png` });

    // switch to Presupuesto subtab
    const subtabs = await page.$$('[data-resumen-sub]');
    console.log(scheme, 'subtabs found:', subtabs.length);
    await page.click('[data-resumen-sub="presupuesto"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot9_${scheme}_02_presupuesto.png` });

    // confirm subtabs bar still visible (bug-fix check)
    const subtabsStillThere = await page.$$eval('[data-resumen-sub]', els => els.length);
    console.log(scheme, 'subtabs still visible after switch:', subtabsStillThere);

    // month nav while on presupuesto (bug-fix check: subtabs must survive)
    await page.click('[data-month-nav="-1"]');
    await page.waitForTimeout(200);
    const subtabsAfterNav = await page.$$eval('[data-resumen-sub]', els => els.length).catch(()=>0);
    console.log(scheme, 'subtabs after month nav:', subtabsAfterNav);
    await page.screenshot({ path: `shot9_${scheme}_03_after_monthnav.png` });
    await page.click('[data-month-nav="1"]');
    await page.waitForTimeout(200);

    // edit total budget
    await page.click('[data-edit-budget-total]');
    await page.waitForTimeout(200);
    await page.fill('[data-budget-total-input]', '750000');
    await page.screenshot({ path: `shot9_${scheme}_04_total_editing.png` });
    await page.click('[data-save-budget-total]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot9_${scheme}_05_total_saved.png` });

    // cancel flow on total
    await page.click('[data-edit-budget-total]');
    await page.waitForTimeout(150);
    await page.click('[data-cancel-budget-total]');
    await page.waitForTimeout(150);

    // edit an existing category budget (supermercado)
    await page.click('[data-edit-budget="supermercado"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot9_${scheme}_06_cat_editing.png` });
    await page.fill('[data-budget-meta-input]', '200000');
    await page.click('[data-toggle-alert="90"]');
    await page.waitForTimeout(150);
    await page.click('[data-save-budget="supermercado"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot9_${scheme}_07_cat_saved.png` });

    // add a budget to a category with none - find one "+ Agregar presupuesto" link
    const addLink = await page.$('.budget-add-link');
    if (addLink) {
      const catId = await addLink.evaluate(el => el.getAttribute('data-edit-budget'));
      console.log(scheme, 'adding budget to:', catId);
      await addLink.click();
      await page.waitForTimeout(200);
      await page.fill('[data-budget-meta-input]', '50000');
      await page.click(`[data-save-budget="${catId}"]`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot9_${scheme}_08_added_new.png` });
    } else {
      console.log(scheme, 'no category without budget found to test add flow');
    }

    // delete a budget (supermercado, re-enter edit mode)
    await page.click('[data-edit-budget="supermercado"]');
    await page.waitForTimeout(150);
    await page.click('[data-delete-budget="supermercado"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot9_${scheme}_09_deleted.png` });

    // Ver mas drill-down
    const verMas = await page.$('.budget-ver-mas');
    if (verMas) {
      await verMas.click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: `shot9_${scheme}_10_vermas.png` });
      const currentTab = await page.evaluate(() => document.querySelector('#tabbar [data-tab].active')?.getAttribute('data-tab'));
      console.log(scheme, 'tab after vermas:', currentTab);
    }

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
