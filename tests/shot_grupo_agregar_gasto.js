// Regression: the "+ Add an expense" button inside a group (data-group-create-expense-open)
// existed but had no handler wired up -- it did nothing when tapped. It now reuses the
// same "new transaction" sheet as the + in Transactions: on save, instead of closing the
// sheet and returning to the list, it leaves the newly created transaction open in its
// detail view with "Share with a group" already preloaded with the group it came from (state.shareDraft).
// Just like shot_compartir_grupo.js, the group is injected via window.__debug (sb blocked in
// the test sandbox).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.SHARED_EXPENSES = [];
    D.state.tab = 'grupos';
    D.state.openGroupId = 'g1';
    D.render();
  });
  await page.waitForTimeout(200);

  // (a) The "Add an expense" button exists in the group's detail view.
  const tieneBoton = await page.evaluate(() => !!document.querySelector('[data-group-create-expense-open="g1"]'));
  check('(a) El detalle del grupo tiene el botón "Agregar un gasto"', tieneBoton === true);

  // (b) On tapping it, it opens the SAME "new transaction" sheet as the + in Transactions (not a
  // separate form) -- with the draft type set to "gasto" and remembering which group it came from.
  await page.click('[data-group-create-expense-open="g1"]');
  await page.waitForTimeout(200);
  const abierto = await page.evaluate(() => ({
    creatingNew: window.__debug.state.creatingNew,
    tipo: window.__debug.state.draftTx ? window.__debug.state.draftTx.tipo : null,
    origenGrupo: window.__debug.state.createExpenseFromGroupId,
    tieneCampoComercio: !!document.querySelector('[data-draft-field="comercio"]'),
  }));
  check('(b) Abre la hoja de nueva transacción (creatingNew=true, tipo=gasto)', abierto.creatingNew === true && abierto.tipo === 'gasto', abierto);
  check('   y recuerda que vino del grupo "g1"', abierto.origenGrupo === 'g1', abierto);
  check('   con el campo de comercio visible, igual que el + normal', abierto.tieneCampoComercio === true, abierto);

  // (c) On save, it does NOT return to the Transactions list: it leaves the transaction open in its
  // detail view, with "Share with a group" already preloaded with "Casa" (without having to pick it).
  await page.fill('[data-draft-field="comercio"]', 'Supermercado Líder');
  await page.fill('[data-draft-field="monto"]', '20000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(250);
  const trasGuardar = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TRANSACTIONS.find(t => t.comercio === 'Supermercado Líder');
    return {
      creatingNew: D.state.creatingNew,
      openTxId: D.state.openTxId,
      origenGrupoLimpio: D.state.createExpenseFromGroupId,
      shareDraft: D.state.shareDraft,
      txCreada: tx ? { id: tx.id, tipo: tx.tipo, monto: tx.monto } : null,
      sheetAbierta: document.getElementById('sheet-overlay').classList.contains('open'),
      contenidoDetalle: document.getElementById('sheet-content').textContent,
      tieneBotonElegirGrupo: !!document.querySelector('[data-share-open]'),
    };
  });
  check('(c) La transacción se creó (gasto, $20.000)', !!trasGuardar.txCreada && trasGuardar.txCreada.tipo === 'gasto' && trasGuardar.txCreada.monto === 20000, trasGuardar.txCreada);
  check('   la hoja sigue abierta, mostrando el detalle (no volvió a la lista)', trasGuardar.sheetAbierta === true && trasGuardar.creatingNew === false && trasGuardar.openTxId === trasGuardar.txCreada.id, trasGuardar);
  check('   se limpió createExpenseFromGroupId (no queda pegado para la próxima)', trasGuardar.origenGrupoLimpio === null, trasGuardar);
  check('   "Compartir con un grupo" quedó precargado con el grupo "g1"', !!trasGuardar.shareDraft && trasGuardar.shareDraft.groupId === 'g1' && trasGuardar.shareDraft.txId === trasGuardar.txCreada.id, trasGuardar.shareDraft);
  check('   el detalle muestra el formulario de reparto ya abierto (no el botón "Elegir un grupo")',
    trasGuardar.contenidoDetalle.includes('Compartir con un grupo') && trasGuardar.contenidoDetalle.includes('Casa') && trasGuardar.tieneBotonElegirGrupo === false,
    trasGuardar);

  await finish({ context, browser, errors });
})();
