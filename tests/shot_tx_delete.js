// Regression: the user reported she could no longer delete transactions -- the delete button
// only existed for transactions imported by email (t.importadoEmail). Now the detail of
// ANY existing transaction shows an action bar at the bottom: a small red delete
// button (on the left) and "Done" (large, on the right) -- see .sheet-bottom-actions.
// This test covers: the button exists for a normal (non-imported) transaction, asking for
// confirmation before deleting, being able to cancel, and that "Yes, delete" actually removes it from TRANSACTIONS.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);

  // t3 = Uber, normal transaction from the mockup data (not imported by email).
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);

  const antesDeBorrar = await page.evaluate(() => ({
    existeTx: !!window.__debug.TRANSACTIONS.find(t => t.id === 't3'),
    hayBotonBorrar: !!document.querySelector('[data-ask-delete-tx="t3"]'),
    hayBotonListo: !!document.querySelector('[data-close-sheet-done]'),
    hayConfirmacion: !!document.querySelector('.sheet-delete-confirm'),
  }));
  check('(a) t3 existe antes de borrar', antesDeBorrar.existeTx === true);
  check('(b) el detalle de una transacción NORMAL (no importada) tiene botón de borrar', antesDeBorrar.hayBotonBorrar === true, antesDeBorrar);
  check('(c) y también el botón "Listo", ambos en la misma barra de acciones', antesDeBorrar.hayBotonListo === true, antesDeBorrar);
  check('(d) todavía no se pide confirmación (no se ha tocado borrar)', antesDeBorrar.hayConfirmacion === false, antesDeBorrar);

  // Tapping delete should ask for confirmation, not delete directly.
  await page.click('[data-ask-delete-tx="t3"]');
  await page.waitForTimeout(150);
  const trasPedirBorrar = await page.evaluate(() => ({
    existeTx: !!window.__debug.TRANSACTIONS.find(t => t.id === 't3'),
    hayConfirmacion: !!document.querySelector('.sheet-delete-confirm'),
    hayCancelar: !!document.querySelector('[data-cancel-delete-tx="t3"]'),
    hayConfirmar: !!document.querySelector('[data-confirm-delete-tx="t3"]'),
  }));
  check('(e) tocar borrar pide confirmación, no borra todavía', trasPedirBorrar.existeTx === true && trasPedirBorrar.hayConfirmacion === true, trasPedirBorrar);
  check('   con botones Cancelar y "Sí, eliminar"', trasPedirBorrar.hayCancelar === true && trasPedirBorrar.hayConfirmar === true, trasPedirBorrar);

  // Cancel should return to the normal state without deleting anything.
  await page.click('[data-cancel-delete-tx="t3"]');
  await page.waitForTimeout(150);
  const trasCancelar = await page.evaluate(() => ({
    existeTx: !!window.__debug.TRANSACTIONS.find(t => t.id === 't3'),
    hayConfirmacion: !!document.querySelector('.sheet-delete-confirm'),
    hayBotonBorrar: !!document.querySelector('[data-ask-delete-tx="t3"]'),
  }));
  check('(f) Cancelar no borra la transacción', trasCancelar.existeTx === true, trasCancelar);
  check('   y vuelve a mostrar el botón de borrar normal (no la confirmación)', trasCancelar.hayConfirmacion === false && trasCancelar.hayBotonBorrar === true, trasCancelar);

  // Now for real: ask to delete and actually confirm.
  await page.click('[data-ask-delete-tx="t3"]');
  await page.waitForTimeout(150);
  await page.click('[data-confirm-delete-tx="t3"]');
  await page.waitForTimeout(200);
  // Note: "Yes, delete" does TRANSACTIONS = TRANSACTIONS.filter(...), which REPLACES the array (new reference) --
  // window.__debug.TRANSACTIONS (a reference captured once when the page loads) stays
  // pointing at the old array and would keep "seeing" t3. That's why we check against the
  // visible DOM instead, same as shot_import_pendiente.js already does. Also note: closeSheet() only hides
  // the overlay (removes the "open" class), it doesn't empty #sheet-content -- the form fields
  // that stay there (amount input, date input, etc.) also carry data-tx="t3" as their own
  // attribute, so the generic selector "[data-tx=t3]" still finds them even after the list row
  // has already disappeared. We need to target the row specifically (.tx-item[data-tx]).
  const trasConfirmar = await page.evaluate(() => ({
    filaSigueEnDom: !!document.querySelector('.tx-item[data-tx="t3"]'),
    sheetAbierto: document.getElementById('sheet-overlay').classList.contains('open'),
  }));
  check('(g) "Sí, eliminar" saca la transacción de la vista', trasConfirmar.filaSigueEnDom === false, trasConfirmar);
  check('   y cierra el detalle', trasConfirmar.sheetAbierto === false, trasConfirmar);

  await finish({ context, browser, errors });
})();
