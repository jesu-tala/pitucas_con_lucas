// Request: in Reconcile with the statement, a movement might be neither a real expense nor income
// (e.g. a transfer between one's own accounts) -- before, the only option was "+ Agregar", which
// classified it as a normal expense/income. Now every unregistered movement also has a
// "No es gasto" button that adds it directly with the same 'no_es_gasto' status already used by the
// button in a normal transaction's detail view (excluded from expense/income totals).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(150);

  await page.evaluate(() => {
    const D = window.__debug;
    D.state.reconciliar.archivo = 'cartola_test.pdf';
    D.state.reconciliar.tipo = 'cuenta_corriente';
    D.state.reconciliar.movimientos = [
      { fecha: D.todayISO(), detalle: 'TRASPASO ENTRE CUENTAS', comercioSugerido: 'Traspaso entre mis cuentas', monto: -200000, tipoMov: 'gasto', esEspecial: null, __match: null }
    ];
    D.render();
  });
  await page.waitForTimeout(150);

  const botones = await page.evaluate(() => ({
    hayAgregar: !!document.querySelector('[data-reconcile-add="0"]'),
    hayNoEsGasto: !!document.querySelector('[data-reconcile-not-expense="0"]'),
  }));
  check('Un movimiento sin registrar muestra "+ Agregar" y "No es gasto"', botones.hayAgregar && botones.hayNoEsGasto, botones);

  const txCountAntes = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  await page.click('[data-reconcile-not-expense="0"]');
  await page.waitForTimeout(200);
  const nuevaTx = await page.evaluate(() => window.__debug.TRANSACTIONS[0]);
  const txCountDespues = await page.evaluate(() => window.__debug.TRANSACTIONS.length);

  check('"No es gasto" agrega la transacción', txCountDespues === txCountAntes + 1, { txCountAntes, txCountDespues });
  check('Queda con estado "no_es_gasto" (excluida de los totales de gasto/ingreso)', nuevaTx.estado === 'no_es_gasto', nuevaTx);
  check('Mantiene el monto y comercio correctos del movimiento', nuevaTx.monto === 200000 && nuevaTx.comercio === 'Traspaso entre mis cuentas' && nuevaTx.tipo === 'gasto', nuevaTx);
  check('No queda con categorías asignadas (no aplica clasificar algo que no es gasto)', nuevaTx.categorias.length === 0, nuevaTx.categorias);

  // After adding it, the row switches to "Ya registrada" (it no longer offers the two buttons).
  const trasAgregar = await page.evaluate(() => ({
    yaRegistrada: !!document.querySelector('.state-cobrado-inline'),
    siguenLosBotones: !!document.querySelector('[data-reconcile-add="0"]') || !!document.querySelector('[data-reconcile-not-expense="0"]'),
  }));
  check('Tras agregarla, la fila queda marcada "Ya registrada" y ya no ofrece agregarla de nuevo', trasAgregar.yaRegistrada && !trasAgregar.siguenLosBotones, trasAgregar);

  await finish({ context, browser, errors });
})();
