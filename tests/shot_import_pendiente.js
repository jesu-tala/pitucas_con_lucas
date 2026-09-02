const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Simulamos lo que hace absorbImportedRows() pero sin depender de una sesión real de
  // Supabase (bloqueada en este sandbox): empujamos directo una transacción con la misma
  // forma exacta que arma esa función, para probar cómo se ve/comporta en la UI.
  const countBefore = await page.evaluate(() => window.__debug.TX.length);
  await page.evaluate(() => {
    const D = window.__debug;
    D.TX.unshift({
      id: 'temail-test-1', fecha: '2026-08-30', hora: '18:02', comercio: 'TRAPENSES',
      monto: 3870, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable',
      estado: 'pendiente', categorias: [], porCobrar: [], reglaAuto: false,
      nota: 'Importado automáticamente desde tu correo', importadoEmail: true
    });
    D.render();
  });
  const countAfter = await page.evaluate(() => window.__debug.TX.length);
  check('TX antes -> despues (esperado +1)', countAfter === countBefore + 1, { countBefore, countAfter });

  // 1) ¿aparece en la pestaña Transacciones, filtro "Pendientes"?
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  await page.click('[data-filter="pendientes"]');
  await page.waitForTimeout(150);
  const apareceEnPendientes = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.tx-item')];
    return items.some(i => i.textContent.includes('TRAPENSES'));
  });
  check('Aparece en Transacciones > Pendientes', apareceEnPendientes);

  // 2) abrir el detalle y verificar que sale el bloque de "importada desde tu correo" con
  // el botón de eliminar
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.tx-item')];
    const el = items.find(i => i.textContent.includes('TRAPENSES'));
    el.click();
  });
  await page.waitForTimeout(200);
  const tieneBloqueImportada = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Importada desde tu correo'));
  const tieneBotonEliminar = await page.$('[data-ask-delete-tx="temail-test-1"]') !== null;
  check('Sheet muestra "Importada desde tu correo"', tieneBloqueImportada);
  check('Tiene botón eliminar', tieneBotonEliminar);

  // 3) click en eliminar -> debe pedir confirmación, no borrar directo
  await page.click('[data-ask-delete-tx="temail-test-1"]');
  await page.waitForTimeout(150);
  const pideConfirmacion = await page.$('[data-confirm-delete-tx="temail-test-1"]') !== null;
  check('Al apretar eliminar, pide confirmación (no borra directo)', pideConfirmacion);

  // 4) cancelar -> la transacción debe seguir existiendo
  await page.click('[data-cancel-delete-tx="temail-test-1"]');
  await page.waitForTimeout(150);
  const siguenExistiendoTrasCancelar = await page.evaluate(() => window.__debug.TX.some(t => t.id === 'temail-test-1'));
  check('Tras cancelar, la transacción sigue existiendo', siguenExistiendoTrasCancelar);

  // 5) confirmar de verdad -> debe desaparecer y cerrar el sheet
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.tx-item')];
    const el = items.find(i => i.textContent.includes('TRAPENSES'));
    el.click();
  });
  await page.waitForTimeout(150);
  await page.click('[data-ask-delete-tx="temail-test-1"]');
  await page.waitForTimeout(150);
  await page.click('[data-confirm-delete-tx="temail-test-1"]');
  await page.waitForTimeout(200);
  // Ojo: tras "TX = TX.filter(...)" el arreglo se REEMPLAZA (nueva referencia), así que
  // window.__debug.TX (una referencia capturada una sola vez al cargar la página) queda
  // apuntando al arreglo viejo — por eso se verifica contra el DOM visible, no contra eso.
  const yaNoExiste = await page.evaluate(() => !document.getElementById('view-root').textContent.includes('TRAPENSES'));
  const sheetCerrado = await page.evaluate(() => !document.getElementById('sheet-overlay').classList.contains('open'));
  check('Tras confirmar, la transacción ya no existe (en el DOM visible)', yaNoExiste);
  check('Tras confirmar, el sheet se cerró', sheetCerrado);

  await finish({ context, browser, errors });
})();
