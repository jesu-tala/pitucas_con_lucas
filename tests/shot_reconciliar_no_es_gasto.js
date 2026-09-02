// Pedido: en Reconciliar con la cartola, un movimiento puede no ser ni un gasto ni un ingreso
// real (ej. un traspaso entre sus propias cuentas) -- antes la única opción era "+ Agregar", que
// lo clasificaba como gasto/ingreso normal. Ahora cada movimiento sin registrar también tiene un
// botón "No es gasto" que lo agrega directo con el mismo estado 'no_es_gasto' que ya usa el botón
// del detalle de una transacción normal (excluido de los totales de gasto/ingreso).
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
    hayAgregar: !!document.querySelector('[data-reconciliar-agregar="0"]'),
    hayNoEsGasto: !!document.querySelector('[data-reconciliar-noesgasto="0"]'),
  }));
  check('Un movimiento sin registrar muestra "+ Agregar" y "No es gasto"', botones.hayAgregar && botones.hayNoEsGasto, botones);

  const txCountAntes = await page.evaluate(() => window.__debug.TX.length);
  await page.click('[data-reconciliar-noesgasto="0"]');
  await page.waitForTimeout(200);
  const nuevaTx = await page.evaluate(() => window.__debug.TX[0]);
  const txCountDespues = await page.evaluate(() => window.__debug.TX.length);

  check('"No es gasto" agrega la transacción', txCountDespues === txCountAntes + 1, { txCountAntes, txCountDespues });
  check('Queda con estado "no_es_gasto" (excluida de los totales de gasto/ingreso)', nuevaTx.estado === 'no_es_gasto', nuevaTx);
  check('Mantiene el monto y comercio correctos del movimiento', nuevaTx.monto === 200000 && nuevaTx.comercio === 'Traspaso entre mis cuentas' && nuevaTx.tipo === 'gasto', nuevaTx);
  check('No queda con categorías asignadas (no aplica clasificar algo que no es gasto)', nuevaTx.categorias.length === 0, nuevaTx.categorias);

  // Después de agregarlo, la fila pasa a "Ya registrada" (ya no ofrece los dos botones).
  const trasAgregar = await page.evaluate(() => ({
    yaRegistrada: !!document.querySelector('.state-cobrado-inline'),
    siguenLosBotones: !!document.querySelector('[data-reconciliar-agregar="0"]') || !!document.querySelector('[data-reconciliar-noesgasto="0"]'),
  }));
  check('Tras agregarla, la fila queda marcada "Ya registrada" y ya no ofrece agregarla de nuevo', trasAgregar.yaRegistrada && !trasAgregar.siguenLosBotones, trasAgregar);

  await finish({ context, browser, errors });
})();
