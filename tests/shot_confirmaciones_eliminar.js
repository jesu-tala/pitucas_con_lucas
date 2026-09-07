// "en todas las partes donde se puede eliminar algo, pide un mensaje de confirmación": these 5
// delete flows used to delete IMMEDIATELY on a single click, with no confirmation step at all --
// unlike deleting a transaction/platform/group, which already asked "¿seguro?" first. Each now
// gets the same two-step ask/confirm pattern (state.confirmDelete<Thing>Id -> "are you sure?" ->
// state.confirmDelete<Thing>Id cleared + actually deletes), mirroring platformDeleteBlock's shape
// (views/inversiones.ts): a "Eliminar X" link that on tap swaps in a confirm card with
// Cancelar/Sí eliminar, rather than deleting on the first tap. This test drives all 5 through the
// real UI (create something disposable via each screen's own form, then delete it) and checks the
// existing "can this be deleted at all" gates (in-use checks) are untouched.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- 1) Eliminar meta de inversión ----------
  await page.evaluate(() => { window.__debug.state.tab = 'resumen'; window.__debug.state.summarySub = 'inversiones'; window.__debug.state.openPlatformId = 'buda'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-add-goal="buda"]');
  await page.waitForTimeout(100);
  await page.fill('[data-goal-field="nombre"]', 'Meta Test Borrar');
  await page.click('[data-save-goal="nueva"]');
  await page.waitForTimeout(150);
  const goalId = await page.evaluate(() => window.__debug.INVESTMENT_GOALS.find(m => m.nombre === 'Meta Test Borrar').id);
  await page.click('[data-edit-goal="' + goalId + '"]');
  await page.waitForTimeout(100);

  const goalAntes = await page.evaluate((id) => ({
    tieneLinkEliminar: !!document.querySelector('[data-ask-delete-goal="' + id + '"]'),
    tieneConfirmYa: !!document.querySelector('[data-confirm-delete-goal]'),
  }), goalId);
  check('(meta) el botón "Eliminar meta" NO borra directo -- primero solo pide confirmación (aparece ask, no confirm)', goalAntes.tieneLinkEliminar && !goalAntes.tieneConfirmYa, goalAntes);

  await page.click('[data-ask-delete-goal="' + goalId + '"]');
  await page.waitForTimeout(100);
  const goalConfirmando = await page.evaluate(() => ({
    tieneTexto: document.getElementById('view-root').textContent.includes('¿Seguro que quieres eliminar la meta'),
    tieneCancelar: !!document.querySelector('[data-cancel-delete-goal]'),
    tieneConfirmar: !!document.querySelector('[data-confirm-delete-goal]'),
  }));
  check('(meta) al pedir eliminar, aparece la tarjeta de confirmación con Cancelar/Sí eliminar', goalConfirmando.tieneTexto && goalConfirmando.tieneCancelar && goalConfirmando.tieneConfirmar, goalConfirmando);

  await page.click('[data-cancel-delete-goal]');
  await page.waitForTimeout(100);
  // Note: state.editingGoalId stays the same, so the edit form (with the goal's name still in
  // its own draft field) stays open -- check that instead of window.__debug.INVESTMENT_GOALS,
  // which is a reference captured once at page load and goes stale the moment
  // setInvestmentGoals() ever replaces the array (see shot_tx_delete.js's note on the same
  // quirk for TRANSACTIONS/setTransactions).
  const goalTrasCancelar = await page.evaluate(() => !!document.querySelector('[data-goal-field="nombre"]') && document.querySelector('[data-goal-field="nombre"]').value === 'Meta Test Borrar');
  check('(meta) Cancelar NO elimina la meta (el form de edición sigue abierto con su nombre)', goalTrasCancelar === true, goalTrasCancelar);

  await page.click('[data-ask-delete-goal="' + goalId + '"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-goal="' + goalId + '"]');
  await page.waitForTimeout(100);
  const goalTrasConfirmar = await page.evaluate(() => !document.getElementById('view-root').textContent.includes('Meta Test Borrar'));
  check('(meta) Sí, eliminar SÍ la elimina (desaparece de la vista)', goalTrasConfirmar === true, goalTrasConfirmar);

  // ---------- 2) Eliminar presupuesto de una categoría ----------
  await page.evaluate(() => { window.__debug.state.tab = 'resumen'; window.__debug.state.summarySub = 'presupuesto'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-edit-budget="entretenimiento"]');
  await page.waitForTimeout(100);
  await page.fill('[data-budget-goal-input]', '25000');
  await page.click('[data-save-budget="entretenimiento"]');
  await page.waitForTimeout(100);
  await page.click('[data-edit-budget="entretenimiento"]');
  await page.waitForTimeout(100);

  const budgetAntes = await page.evaluate(() => ({
    tieneLinkEliminar: !!document.querySelector('[data-ask-delete-budget="entretenimiento"]'),
    tieneConfirmYa: !!document.querySelector('[data-confirm-delete-budget]'),
  }));
  check('(presupuesto) "Eliminar presupuesto" pide confirmación primero', budgetAntes.tieneLinkEliminar && !budgetAntes.tieneConfirmYa, budgetAntes);

  await page.click('[data-ask-delete-budget="entretenimiento"]');
  await page.waitForTimeout(100);
  await page.click('[data-cancel-delete-budget]');
  await page.waitForTimeout(100);
  // Still has its $25.000 meta (Cancelar didn't delete it) -- the input's own value attribute
  // isn't part of textContent, so read it directly instead.
  const budgetSigueExistiendo = await page.evaluate(() => {
    const input = document.querySelector('[data-budget-goal-input]');
    return !!input && input.value === '25000' && !!document.querySelector('[data-ask-delete-budget="entretenimiento"]');
  });
  check('(presupuesto) Cancelar NO elimina el presupuesto (sigue mostrando la meta de $25.000)', budgetSigueExistiendo === true, budgetSigueExistiendo);

  await page.click('[data-ask-delete-budget="entretenimiento"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-budget="entretenimiento"]');
  await page.waitForTimeout(100);
  // After deleting, entretenimiento goes back to the "+ Agregar presupuesto" link (no $25.000 goal left).
  const budgetEliminado = await page.evaluate(() => {
    const txt = document.getElementById('view-root').textContent;
    return txt.includes('Agregar presupuesto') && !txt.includes('25.000') && !txt.includes('25000');
  });
  check('(presupuesto) Sí, eliminar SÍ lo elimina (vuelve a "+ Agregar presupuesto")', budgetEliminado === true, budgetEliminado);

  // ---------- 3) Eliminar categoría ----------
  await page.evaluate(() => { window.__debug.state.tab = 'menu'; window.__debug.state.menuSection = 'categorias'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-add-cat]');
  await page.waitForTimeout(100);
  await page.fill('[data-cat-draft-field="nombre"]', 'Categoria Test Borrar');
  await page.click('[data-save-cat="nueva"]');
  await page.waitForTimeout(100);
  const catId = await page.evaluate(() => Object.keys(window.__debug.CATEGORIES).find(k => window.__debug.CATEGORIES[k].nombre === 'Categoria Test Borrar'));
  await page.click('[data-edit-cat="' + catId + '"]');
  await page.waitForTimeout(100);

  const catAntes = await page.evaluate((id) => ({
    tieneLinkEliminar: !!document.querySelector('[data-ask-delete-cat="' + id + '"]'),
    tieneConfirmYa: !!document.querySelector('[data-confirm-delete-cat]'),
  }), catId);
  check('(categoría) "Eliminar categoría" pide confirmación primero', catAntes.tieneLinkEliminar && !catAntes.tieneConfirmYa, catAntes);

  await page.click('[data-ask-delete-cat="' + catId + '"]');
  await page.waitForTimeout(100);
  await page.click('[data-cancel-delete-cat]');
  await page.waitForTimeout(100);
  const catTrasCancelar = await page.evaluate((id) => !!window.__debug.CATEGORIES[id], catId);
  check('(categoría) Cancelar NO elimina la categoría', catTrasCancelar === true, catTrasCancelar);

  await page.click('[data-ask-delete-cat="' + catId + '"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-cat="' + catId + '"]');
  await page.waitForTimeout(100);
  const catTrasConfirmar = await page.evaluate((id) => !!window.__debug.CATEGORIES[id], catId);
  check('(categoría) Sí, eliminar SÍ la elimina', catTrasConfirmar === false, catTrasConfirmar);

  // ---------- 4) Eliminar medio de pago ----------
  await page.evaluate(() => { window.__debug.state.tab = 'menu'; window.__debug.state.menuSection = 'medios'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-add-payment-method]');
  await page.waitForTimeout(100);
  await page.fill('[data-payment-method-draft-field="nombre"]', 'Medio Test Borrar');
  await page.click('[data-save-payment-method="nueva"]');
  await page.waitForTimeout(100);
  const medioId = await page.evaluate(() => Object.keys(window.__debug.PAYMENT_METHODS).find(k => window.__debug.PAYMENT_METHODS[k].nombre === 'Medio Test Borrar'));
  await page.click('[data-edit-payment-method="' + medioId + '"]');
  await page.waitForTimeout(100);

  const medioAntes = await page.evaluate((id) => ({
    tieneLinkEliminar: !!document.querySelector('[data-ask-delete-payment-method="' + id + '"]'),
    tieneConfirmYa: !!document.querySelector('[data-confirm-delete-payment-method]'),
  }), medioId);
  check('(medio de pago) "Eliminar medio de pago" pide confirmación primero', medioAntes.tieneLinkEliminar && !medioAntes.tieneConfirmYa, medioAntes);

  await page.click('[data-ask-delete-payment-method="' + medioId + '"]');
  await page.waitForTimeout(100);
  await page.click('[data-cancel-delete-payment-method]');
  await page.waitForTimeout(100);
  const medioTrasCancelar = await page.evaluate((id) => !!window.__debug.PAYMENT_METHODS[id], medioId);
  check('(medio de pago) Cancelar NO elimina el medio de pago', medioTrasCancelar === true, medioTrasCancelar);

  await page.click('[data-ask-delete-payment-method="' + medioId + '"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-payment-method="' + medioId + '"]');
  await page.waitForTimeout(100);
  const medioTrasConfirmar = await page.evaluate((id) => !!window.__debug.PAYMENT_METHODS[id], medioId);
  check('(medio de pago) Sí, eliminar SÍ lo elimina', medioTrasConfirmar === false, medioTrasConfirmar);

  // ---------- 5) Eliminar regla de clasificación automática ----------
  // t2 (Copec Providencia) already has reglaAuto:true in the seed data.
  await page.evaluate(() => { window.__debug.state.tab = 'menu'; window.__debug.state.menuSection = 'reglas'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const ruleKey = encodeURIComponent('Copec Providencia');

  const ruleAntes = await page.evaluate((key) => ({
    tieneLinkEliminar: !!document.querySelector('[data-ask-delete-rule="' + key + '"]'),
    tieneConfirmYa: !!document.querySelector('[data-confirm-delete-rule]'),
  }), ruleKey);
  check('(regla) el ícono de basurero pide confirmación primero (no borra directo)', ruleAntes.tieneLinkEliminar && !ruleAntes.tieneConfirmYa, ruleAntes);

  await page.click('[data-ask-delete-rule="' + ruleKey + '"]');
  await page.waitForTimeout(100);
  const ruleConfirmando = await page.evaluate(() => ({
    tieneTexto: document.getElementById('view-root').textContent.includes('¿Seguro que quieres eliminar la regla'),
    tieneCancelar: !!document.querySelector('[data-cancel-delete-rule]'),
    tieneConfirmar: !!document.querySelector('[data-confirm-delete-rule]'),
  }));
  check('(regla) aparece la tarjeta de confirmación con Cancelar/Sí eliminar', ruleConfirmando.tieneTexto && ruleConfirmando.tieneCancelar && ruleConfirmando.tieneConfirmar, ruleConfirmando);

  await page.click('[data-cancel-delete-rule]');
  await page.waitForTimeout(100);
  const ruleTrasCancelar = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 't2').reglaAuto);
  check('(regla) Cancelar NO elimina la regla (t2 sigue con reglaAuto)', ruleTrasCancelar === true, ruleTrasCancelar);

  await page.click('[data-ask-delete-rule="' + ruleKey + '"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-rule="' + ruleKey + '"]');
  await page.waitForTimeout(100);
  const ruleTrasConfirmar = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 't2').reglaAuto);
  check('(regla) Sí, eliminar SÍ la elimina (t2 pierde reglaAuto)', ruleTrasConfirmar === false, ruleTrasConfirmar);

  // ---------- Regression: the existing "can this be deleted at all" gates are untouched ----------
  // A category/payment method already in use must still hide the delete link entirely (no ask,
  // no confirm) -- this fix only adds a confirmation step between "offered" and "done", it must
  // not change WHEN deletion is offered in the first place.
  await page.evaluate(() => { window.__debug.state.tab = 'menu'; window.__debug.state.menuSection = 'categorias'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-edit-cat="transporte"]'); // has transactions (t2, t4)
  await page.waitForTimeout(100);
  const catEnUso = await page.evaluate(() => ({
    tieneAsk: !!document.querySelector('[data-ask-delete-cat="transporte"]'),
    tieneAviso: document.getElementById('view-root').textContent.includes('No se puede eliminar: tiene transacciones asociadas'),
  }));
  check('(categoría en uso) sigue sin ofrecer eliminar en absoluto -- ni ask ni confirm, solo el aviso', !catEnUso.tieneAsk && catEnUso.tieneAviso, catEnUso);

  await finish({ context, browser, errors });
})();
