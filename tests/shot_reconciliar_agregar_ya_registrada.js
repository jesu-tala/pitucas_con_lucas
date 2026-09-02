// En Reconciliar con la cartola, un movimiento que la app detecta como "Ya registrada" (match
// automático contra una transacción existente) no debe tener botón "+ Agregar" -- se probó
// permitir agregarlo igual (informativo, no bloqueante) pero se decidió que NO, que siga siendo
// un bloqueo real: si ya está registrada, no se ofrece la opción de agregarla de nuevo. Este test
// deja eso fijado para que no se repita el cambio por error.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(150);

  // Arma a mano un resultado de cartola con un movimiento YA matcheado y otro sin matchear, sin
  // depender de leer un PDF real.
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
    totalBotonesAgregar: document.querySelectorAll('[data-reconciliar-agregar]').length,
    tieneTagYaRegistrada: !!document.querySelector('.state-cobrado-inline'),
  }));
  check('El movimiento ya registrado NO tiene botón "+ Agregar" (solo el nuevo, esperado 1)', estado.totalBotonesAgregar === 1, estado);
  check('El movimiento ya registrado muestra el aviso "Ya registrada" en su lugar', estado.tieneTagYaRegistrada, estado);

  // El único botón "+ Agregar" visible corresponde al movimiento sin match (idx 1).
  const idxBoton = await page.evaluate(() => document.querySelector('[data-reconciliar-agregar]').getAttribute('data-reconciliar-agregar'));
  check('El botón "+ Agregar" visible es el del movimiento sin match (idx 1)', idxBoton === '1', idxBoton);

  const txCountAntes = await page.evaluate(() => window.__debug.TX.length);
  await page.click('[data-reconciliar-agregar="1"]');
  await page.waitForTimeout(200);
  const txCountDespues = await page.evaluate(() => window.__debug.TX.length);
  check('Agregar el movimiento sin match funciona con normalidad', txCountDespues === txCountAntes + 1, { txCountAntes, txCountDespues });

  await finish({ context, browser, errors });
})();
