const { chromium } = require('playwright');
const path = require('path');

async function closeSheetIfOpen(page) {
  const open = await page.$('.sheet-overlay.open');
  if (open) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];

  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') errors.push(scheme + ': ' + msg.text()); });
    page.on('pageerror', err => errors.push(scheme + ' pageerror: ' + err.message + '\n' + err.stack));

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);

    // 1. Search bar: type "uber" and see filtered results
    await page.screenshot({ path: `shot4_${scheme}_01_before_search.png` });
    const searchInput = await page.$('#tx-search-input');
    await searchInput.fill('uber');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot4_${scheme}_02_search_uber.png` });
    // check focus retained
    const activeId = await page.evaluate(() => document.activeElement.id);
    console.log(scheme, 'active element after search typing:', activeId);

    // clear search
    const clearBtn = await page.$('[data-clear-search]');
    if (clearBtn) { await clearBtn.click(); await page.waitForTimeout(150); }
    await page.screenshot({ path: `shot4_${scheme}_03_search_cleared.png` });

    // 2. Open filter sheet
    const openFilters = await page.$('[data-open-filters]');
    if (openFilters) { await openFilters.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: `shot4_${scheme}_04_filter_sheet.png` });

    // pick a category filter + a medio filter
    const catChip = await page.$('[data-toggle-filter-cat="transporte"]');
    if (catChip) { await catChip.click(); await page.waitForTimeout(150); }
    const medioChip = await page.$('[data-toggle-filter-medio]');
    if (medioChip) { await medioChip.click(); await page.waitForTimeout(150); }
    await page.screenshot({ path: `shot4_${scheme}_05_filter_selected.png` });

    // apply
    const applyBtn = await page.$('[data-apply-advfilters]');
    if (applyBtn) { await applyBtn.click(); await page.waitForTimeout(200); }
    await page.screenshot({ path: `shot4_${scheme}_06_after_apply.png` });

    // reopen filter sheet and clear
    const openFilters2 = await page.$('[data-open-filters]');
    if (openFilters2) { await openFilters2.click(); await page.waitForTimeout(200); }
    const clearAdv = await page.$('[data-clear-advfilters]');
    if (clearAdv) { await clearAdv.click(); await page.waitForTimeout(150); }
    await page.screenshot({ path: `shot4_${scheme}_07_cleared_advfilters.png` });
    const applyBtn2 = await page.$('[data-apply-advfilters]');
    if (applyBtn2) { await applyBtn2.click(); await page.waitForTimeout(150); }

    // 3. Category re-edit: open an already-classified tx (t2, single category) and change category
    await closeSheetIfOpen(page);
    const t2 = await page.$('button[data-tx="t2"]');
    if (t2) { await t2.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: `shot4_${scheme}_08_sheet_classified.png` });
    const cambiarBtn = await page.$('[data-toggle-catedit]');
    if (cambiarBtn) { await cambiarBtn.click(); await page.waitForTimeout(200); }
    await page.screenshot({ path: `shot4_${scheme}_09_cat_edit_mode.png` });
    // cancel first to verify cancel works
    const cancelBtn = await page.$('[data-cancel-catedit]');
    if (cancelBtn) { await cancelBtn.click(); await page.waitForTimeout(150); }
    await page.screenshot({ path: `shot4_${scheme}_10_cat_edit_cancelled.png` });
    // now actually re-edit and pick a different category
    const cambiarBtn2 = await page.$('[data-toggle-catedit]');
    if (cambiarBtn2) { await cambiarBtn2.click(); await page.waitForTimeout(150); }
    const pickOther = await page.$('[data-pick-cat="entretencion"]');
    if (pickOther) { await pickOther.click(); await page.waitForTimeout(200); }
    await page.screenshot({ path: `shot4_${scheme}_11_cat_reclassified.png` });

    await context.close();
  }

  await browser.close();
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
})();
