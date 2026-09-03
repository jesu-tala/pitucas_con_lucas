// In Reconcile with the statement, a movement the app detects as "Already registered" (automatic
// match against an existing transaction) must not have a "+ Add" button -- allowing it to be
// added anyway (informational, non-blocking) was tried but it was decided NOT to, that it should stay
// a real block: if it's already registered, the option to add it again is not offered. This test
// locks that in so the change isn't made again by mistake.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(150);

  // Build a statement result by hand with one movement ALREADY matched and another unmatched, without
  // depending on reading a real PDF.
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.reconciliar.archivo = 'cartola_test.pdf';
    D.state.reconciliar.tipo = 'cuenta_corriente';
    D.state.reconciliar.movimientos = [
      { fecha: D.todayISO(), detalle: 'COMPRA YA REGISTRADA', comercioSugerido: 'Compra ya registrada', monto: -5000, tipoMov: 'gasto', esEspecial: null, __match: { id: 'existente-1' } },
      { fecha: D.todayISO(), detalle: 'COMPRA NUEVA', comercioSugerido: 'Compra nueva', monto: -7000, tipoMov: 'gasto', esEspecial: null, __match: null }
    ];
    D.render();
  });
  await page.waitForTimeout(150);

  const estado = await page.evaluate(() => ({
    totalBotonesAgregar: document.querySelectorAll('[data-reconcile-add]').length,
    tieneTagYaRegistrada: !!document.querySelector('.state-cobrado-inline'),
  }));
  check('El movimiento ya registrado NO tiene botón "+ Agregar" (solo el nuevo, esperado 1)', estado.totalBotonesAgregar === 1, estado);
  check('El movimiento ya registrado muestra el aviso "Ya registrada" en su lugar', estado.tieneTagYaRegistrada, estado);

  // The only visible "+ Agregar" button corresponds to the unmatched movement (idx 1).
  const idxBoton = await page.evaluate(() => document.querySelector('[data-reconcile-add]').getAttribute('data-reconcile-add'));
  check('El botón "+ Agregar" visible es el del movimiento sin match (idx 1)', idxBoton === '1', idxBoton);

  const txCountAntes = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  await page.click('[data-reconcile-add="1"]');
  await page.waitForTimeout(200);
  const txCountDespues = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  check('Agregar el movimiento sin match funciona con normalidad', txCountDespues === txCountAntes + 1, { txCountAntes, txCountDespues });

  await finish({ context, browser, errors });
})();
