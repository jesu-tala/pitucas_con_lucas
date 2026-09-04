const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // We simulate what absorbImportedRows() does but without depending on a real
  // Supabase session (blocked in this sandbox): we push a transaction directly with the same
  // exact shape that function builds, to test how it looks/behaves in the UI.
  const countBefore = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.unshift({
      id: 'temail-test-1', fecha: '2026-08-30', hora: '18:02', comercio: 'TRAPENSES',
      monto: 3870, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable',
      estado: 'pendiente', categorias: [], porCobrar: [], reglaAuto: false,
      nota: 'Importado automáticamente desde tu correo', importadoEmail: true
    });
    D.render();
  });
  const countAfter = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  check('TRANSACTIONS antes -> despues (esperado +1)', countAfter === countBefore + 1, { countBefore, countAfter });

  // 1) does it appear in the Transactions tab, "Pendientes" filter?
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  await page.click('[data-filter="pendientes"]');
  await page.waitForTimeout(150);
  const apareceEnPendientes = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.tx-item')];
    return items.some(i => i.textContent.includes('TRAPENSES'));
  });
  check('Aparece en Transacciones > Pendientes', apareceEnPendientes);

  // 2) open the detail view and verify the "imported from your email" block shows up with
  // the delete button
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

  // 3) click delete -> must ask for confirmation, not delete directly
  await page.click('[data-ask-delete-tx="temail-test-1"]');
  await page.waitForTimeout(150);
  const pideConfirmacion = await page.$('[data-confirm-delete-tx="temail-test-1"]') !== null;
  check('Al apretar eliminar, pide confirmación (no borra directo)', pideConfirmacion);

  // 4) cancel -> the transaction should still exist
  await page.click('[data-cancel-delete-tx="temail-test-1"]');
  await page.waitForTimeout(150);
  const siguenExistiendoTrasCancelar = await page.evaluate(() => window.__debug.TRANSACTIONS.some(t => t.id === 'temail-test-1'));
  check('Tras cancelar, la transacción sigue existiendo', siguenExistiendoTrasCancelar);

  // 5) confirm for real -> it should disappear and close the sheet
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
  // Note: after "TRANSACTIONS = TRANSACTIONS.filter(...)" the array is REPLACED (new reference), so
  // window.__debug.TRANSACTIONS (a reference captured once when the page loaded) ends up
  // pointing to the old array — that's why this checks against the visible DOM instead of that.
  const yaNoExiste = await page.evaluate(() => !document.getElementById('view-root').textContent.includes('TRAPENSES'));
  const sheetCerrado = await page.evaluate(() => !document.getElementById('sheet-overlay').classList.contains('open'));
  check('Tras confirmar, la transacción ya no existe (en el DOM visible)', yaNoExiste);
  check('Tras confirmar, el sheet se cerró', sheetCerrado);

  await finish({ context, browser, errors });
})();
