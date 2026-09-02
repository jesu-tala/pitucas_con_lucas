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
    await page.waitForTimeout(400);

    // 1. Transacciones list — new palette + fonts
    await page.screenshot({ path: `shot5_${scheme}_01_transacciones.png` });

    // 2. Resumen / Balance — donut with new palette
    await page.click('button[data-tab="resumen"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot5_${scheme}_02_balance.png`, fullPage: true });

    // 3. Category chip tap-to-edit (no separate "Cambiar" button)
    await page.click('button[data-tab="transacciones"]');
    await page.waitForTimeout(150);
    const t2 = await page.$('button[data-tx="t2"]');
    if (t2) { await t2.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: `shot5_${scheme}_03_sheet_classified.png` });
    const catChip = await page.$('.cat-chip-row button.cat-chip');
    if (catChip) { await catChip.click(); await page.waitForTimeout(200); }
    await page.screenshot({ path: `shot5_${scheme}_04_cat_edit_carousel.png` });
    await closeSheetIfOpen(page);

    // 4. Por cobrar flow: open a normal confirmado tx, verify NO "Dividir por cobrar" block present
    const t3 = await page.$('button[data-tx="t3"]');
    if (t3) { await t3.click(); await page.waitForTimeout(300); }
    const hasCobroBlockBefore = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sheet-block-title')).some(el => el.textContent.includes('Dividir por cobrar'));
    });
    console.log(scheme, 'Dividir por cobrar visible before marking (should be false):', hasCobroBlockBefore);
    await page.screenshot({ path: `shot5_${scheme}_05_before_marcar_porcobrar.png` });

    // mark as por cobrar
    const marcarBtn = await page.$('[data-action="porcobrar"]');
    if (marcarBtn) { await marcarBtn.click(); await page.waitForTimeout(250); }
    const hasCobroBlockAfter = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sheet-block-title')).some(el => el.textContent.includes('Dividir por cobrar'));
    });
    console.log(scheme, 'Dividir por cobrar visible after marking (should be true):', hasCobroBlockAfter);
    await page.screenshot({ path: `shot5_${scheme}_06_after_marcar_porcobrar.png` });
    await closeSheetIfOpen(page);

    // 5. Category carousel in new-tx draft sheet
    const fab = await page.$('#fab-add');
    if (fab) { await fab.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: `shot5_${scheme}_07_new_tx_carousel.png` });
    await closeSheetIfOpen(page);

    // 6. Filter sheet category carousel
    const openFilters = await page.$('[data-open-filters]');
    if (openFilters) { await openFilters.click(); await page.waitForTimeout(250); }
    await page.screenshot({ path: `shot5_${scheme}_08_filter_sheet_carousel.png` });
    await closeSheetIfOpen(page);

    await context.close();
  }

  await browser.close();
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
})();
