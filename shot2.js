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
  const context = await browser.newContext({ viewport: { width: 900, height: 950 }, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message + '\n' + err.stack));

  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);

  // 1. Pendientes filter -> summary + unclassified tx
  await page.click('button[data-filter="pendientes"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2_01_pendientes.png' });
  const unclassifiedTx = await page.$('button[data-tx="t30"]');
  if (unclassifiedTx) { await unclassifiedTx.click(); await page.waitForTimeout(300); }
  await page.screenshot({ path: 'shot2_02_sheet_unclassified.png' });
  const pickCat = await page.$('[data-pick-cat="transporte"]');
  if (pickCat) { await pickCat.click(); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'shot2_03_after_classify.png' });
  await closeSheetIfOpen(page);

  // 2. Entradas filter -> summary
  await page.click('button[data-filter="entradas"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2_04_entradas.png' });

  // 3. Por cobrar filter -> summary + open t5 to test pagado toggle + expr eval
  await page.click('button[data-filter="porcobrar"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2_05_porcobrar.png' });
  const t5 = await page.$('button[data-tx="t5"]');
  if (t5) { await t5.click(); await page.waitForTimeout(300); }
  await page.screenshot({ path: 'shot2_06_sheet_t5.png' });
  // toggle Fran as paid
  const payBtn = await page.$('[data-toggle-pagado="1"]');
  if (payBtn) { await payBtn.click(); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'shot2_07_t5_all_paid.png' });
  await closeSheetIfOpen(page);
  await page.click('button[data-filter="todas"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2_08_list_after_t5_paid.png' });

  // 4. Expression evaluator test in category split
  const t1 = await page.$('button[data-tx="t1"]');
  if (t1) { await t1.click(); await page.waitForTimeout(300); }
  const catSplitToggle = await page.$('[data-toggle-catsplit]');
  if (catSplitToggle) { await catSplitToggle.click(); await page.waitForTimeout(150); }
  const amtInput = await page.$('[data-cat-amount="0"]');
  if (amtInput) {
    await amtInput.fill('45000-10000');
    await page.waitForTimeout(150);
    await page.screenshot({ path: 'shot2_09_expr_typing.png' });
    await amtInput.evaluate(el => el.blur());
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: 'shot2_10_expr_after_blur.png' });
  await closeSheetIfOpen(page);

  // 5. Cuotas: open root t31, check cuota controls; navigate to Sept/Oct to see projections
  const t31 = await page.$('button[data-tx="t31"]');
  if (t31) { await t31.click(); await page.waitForTimeout(300); }
  await page.screenshot({ path: 'shot2_11_cuotas_root.png' });
  const cuotasPlus = await page.$('[data-cuotas-step="1"]');
  if (cuotasPlus) { await cuotasPlus.click(); await page.waitForTimeout(150); }
  await page.screenshot({ path: 'shot2_12_cuotas_plus.png' });
  await closeSheetIfOpen(page);
  await page.click('button[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('button[data-month-nav="1"]'); // to Sept
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2_13_balance_sept.png' });

  // 6. Category drill-down month scoping
  const legendRows = await page.$$('.legend-row');
  if (legendRows.length > 0) { await legendRows[0].click(); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'shot2_14_drilldown_month.png' });
  const clearFilter = await page.$('[data-clear-catfilter]');
  if (clearFilter) { await clearFilter.click(); await page.waitForTimeout(150); }

  // 7. Fijo/Variable/Inversion meta card
  await page.click('button[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('button[data-month-nav="-1"]'); // back to Agosto
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2_15_meta_card.png', fullPage: true });

  // 8. FAB new transaction
  await page.click('button[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  await page.click('#fab-add');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot2_16_new_tx_empty.png' });
  const comercioInput = await page.$('[data-draft-field="comercio"]');
  if (comercioInput) await comercioInput.fill('Starbucks Costanera');
  const montoInput = await page.$('[data-draft-field="monto"]');
  if (montoInput) await montoInput.fill('5200');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2_17_new_tx_filled.png' });
  const draftCat = await page.$('[data-draft-pick-cat="delivery"]');
  if (draftCat) { await draftCat.click(); await page.waitForTimeout(150); }
  await page.screenshot({ path: 'shot2_18_new_tx_cat_picked.png' });
  const saveBtn = await page.$('[data-save-draft]');
  if (saveBtn) { await saveBtn.click(); await page.waitForTimeout(300); }
  await page.screenshot({ path: 'shot2_19_after_save.png' });

  await context.close();
  await browser.close();
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
})();
