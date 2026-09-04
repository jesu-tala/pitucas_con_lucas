// Real bug found while reviewing a screenshot from the user: some transactions (with a
// payment method that no longer exists in PAYMENT_METHODS, or with no method ever assigned) literally
// showed the word "undefined" in the list row, instead of something readable -- because paymentMethodInfo()
// returned a fallback object without the "corto" property that row uses. This test locks in that
// fix: any tx with a nonexistent payment method must show the fallback text, never the
// word "undefined".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const setup = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push({
      id: 't_medio_inexistente_test', fecha: D.todayISO(), hora: '10:00', comercio: 'Comercio Sin Medio',
      monto: 12345, medio: 'medio_que_no_existe_xyz', tipo: 'gasto', recurrencia: 'variable',
      estado: 'confirmado', categorias: [{ cat: Object.keys(D.CATEGORIES)[0], monto: 12345 }],
      porCobrar: [], reglaAuto: false, nota: ''
    });
    D.state.tab = 'transacciones';
    D.render();
    return true;
  });
  await page.waitForTimeout(150);
  check('setup ok', setup === true);

  const row = await page.evaluate(() => {
    const btn = document.querySelector('[data-tx="t_medio_inexistente_test"]');
    const sub = btn ? btn.querySelector('.tx-right-sub') : null;
    return sub ? sub.textContent : null;
  });
  console.log('payment method text in the row:', JSON.stringify(row));

  check('la fila existe y tiene un tx-right-sub', row !== null, row);
  check('NO muestra literalmente la palabra "undefined"', !/undefined/i.test(row || ''), row);
  // The actual text includes the payment method's emoji icon stuck to the front (e.g. "💳Sin medio"), with no
  // space -- that's why we check "includes" and not an exact equality.
  check('muestra el texto de respaldo legible ("Sin medio")', (row || '').includes('Sin medio'), row);

  // Same check inside the detail view: opening the sheet must not break or show "undefined" in
  // the payment method selector (the selected <option> simply doesn't match any, which is
  // acceptable -- what can't happen is a crash or broken text in the rest of the sheet).
  await page.click('[data-tx="t_medio_inexistente_test"]');
  await page.waitForTimeout(200);
  const sheetOk = await page.evaluate(() => !!document.querySelector('.sheet-top .merchant'));
  check('el detalle de la transacción abre sin problema', sheetOk === true);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
