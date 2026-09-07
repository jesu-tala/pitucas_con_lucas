// Regression for "en inversiones, cuando agrego una transacción de inversión, se agrega a
// aportado neto pero no se agrega a total en esta plataforma y sí debería": before this fix,
// platformCurrentValue(id) (what "Total en esta plataforma" shows) only ever moved via a manual
// "Actualizar valor" edit -- adding/editing/deleting a classified inversión transaction moved
// platformAportadoNeto (fully derived from transactions) but never touched valorHistorial, so the
// platform's displayed value could lag behind money just put in. bumpPlatformValueForContribution
// (views/inversiones.ts) now nudges the platform's CURRENT MONTH valorHistorial entry by the same
// delta on every create/edit/delete, seeded from the last known value the first time this month.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Baseline from the seed data (state.ts): Fintual's last recorded value is $504.000 (2026-08),
  // and "today" in this environment is 2026-09-06 -- 2026-09 has no entry yet.
  const base = await page.evaluate(() => window.__debug.platformCurrentValue('fintual'));
  check('valor base de Fintual antes de cualquier cambio ($504.000, del seed)', base === 504000, base);

  // (a) Adding a new inversión transaction classified to Fintual's goal (m3) bumps the platform's
  // current value by the same amount, seeded from the last known value.
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.click('#fab-add');
  await page.waitForTimeout(150);
  await page.click('.segmented[data-seg="draft-tipo"] [data-seg-val="inversion"]');
  await page.waitForTimeout(100);
  await page.selectOption('[data-draft-cat-select]', 'm3');
  await page.fill('[data-draft-field="comercio"]', 'Aporte test Fintual');
  await page.fill('[data-draft-field="monto"]', '50000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(250);

  const trasCrear = await page.evaluate(() => ({
    valor: window.__debug.platformCurrentValue('fintual'),
    entradaMesActual: window.__debug.PLATFORM_DATA.fintual.valorHistorial[window.__debug.todayISO().slice(0,7)],
  }));
  check('(a) al crear un aporte de $50.000 a Fintual, "Total en esta plataforma" sube a $554.000', trasCrear.valor === 554000, trasCrear);
  check('   quedó guardado en el mes actual de valorHistorial (no en otro mes)', trasCrear.entradaMesActual === 554000, trasCrear);

  const txId = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.comercio === 'Aporte test Fintual').id);

  // (b) Editing that transaction's monto (50.000 -> 80.000, delta +30.000) moves the platform's
  // value by the delta, not by the new total.
  await page.evaluate((id) => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); }, txId);
  await page.click('.tx-item[data-tx="' + txId + '"]');
  await page.waitForTimeout(200);
  await page.fill('[data-tx-field="monto"]', '80000');
  await page.waitForTimeout(150);
  const trasEditar = await page.evaluate(() => window.__debug.platformCurrentValue('fintual'));
  check('(b) al editar el monto de 50.000 a 80.000 (delta +30.000), el valor de Fintual sube a $584.000 (no a 80.000)', trasEditar === 584000, trasEditar);

  // (c) A manual "Actualizar valor" correction is NOT clobbered by the next contribution -- the
  // next delta applies on top of whatever was manually typed in, not on top of some value this
  // mechanism remembers separately.
  await page.evaluate(() => {
    const D = window.__debug;
    D.PLATFORM_DATA.fintual.valorHistorial[D.todayISO().slice(0,7)] = 600000; // simulates a manual edit via "Actualizar valor"
  });
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);
  await page.click('#fab-add');
  await page.waitForTimeout(150);
  await page.click('.segmented[data-seg="draft-tipo"] [data-seg-val="inversion"]');
  await page.waitForTimeout(100);
  await page.selectOption('[data-draft-cat-select]', 'm3');
  await page.fill('[data-draft-field="comercio"]', 'Aporte test Fintual 2');
  await page.fill('[data-draft-field="monto"]', '20000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(250);
  const trasManual = await page.evaluate(() => window.__debug.platformCurrentValue('fintual'));
  check('(c) tras una corrección manual a $600.000, el siguiente aporte de $20.000 la deja en $620.000 (no clobbereada)', trasManual === 620000, trasManual);

  // (d) Deleting an inversión transaction takes its amount back out of the platform's value.
  const tx2Id = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.comercio === 'Aporte test Fintual 2').id);
  await page.evaluate((id) => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); }, tx2Id);
  await page.click('.tx-item[data-tx="' + tx2Id + '"]');
  await page.waitForTimeout(200);
  await page.click('[data-ask-delete-tx="' + tx2Id + '"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-tx="' + tx2Id + '"]');
  await page.waitForTimeout(150);
  const trasBorrar = await page.evaluate(() => window.__debug.platformCurrentValue('fintual'));
  check('(d) al eliminar ese aporte de $20.000, el valor de Fintual vuelve a $600.000', trasBorrar === 600000, trasBorrar);

  // (e) The "Otros" platform (sinValuacion) is untouched by this mechanism -- its value is
  // always exactly its aportado, computed the existing way, never via valorHistorial.
  const otrosAntes = await page.evaluate(() => window.__debug.platformCurrentValue('otros'));
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.click('#fab-add');
  await page.waitForTimeout(150);
  await page.click('.segmented[data-seg="draft-tipo"] [data-seg-val="inversion"]');
  await page.waitForTimeout(100);
  await page.selectOption('[data-draft-cat-select]', 'otros__general');
  await page.fill('[data-draft-field="comercio"]', 'Aporte suelto Otros');
  await page.fill('[data-draft-field="monto"]', '10000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(250);
  const otrosDespues = await page.evaluate(() => ({
    valor: window.__debug.platformCurrentValue('otros'),
    valorHistorialVacio: Object.keys(window.__debug.PLATFORM_DATA.otros.valorHistorial).length === 0,
  }));
  check('(e) "Otros" (sinValuacion) sigue subiendo su valor vía aportado, no vía valorHistorial', otrosDespues.valor === otrosAntes + 10000, { otrosAntes, otrosDespues });
  check('   y su valorHistorial sigue vacío (sin bump redundante)', otrosDespues.valorHistorialVacio === true, otrosDespues);

  await finish({ context, browser, errors });
})();
