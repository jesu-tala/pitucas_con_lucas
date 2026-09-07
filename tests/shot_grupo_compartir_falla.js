// Regression for "cuando creo un gasto en un grupo dps no puedo editarlo": shareExistingTransaction
// (views/menu.ts) used to mutate tx.groupId/tx.porCobrar/tx.estado/tx.categorias BEFORE the
// Supabase insert, with no rollback if that insert failed. Since this sandbox has no real grant
// on gastos_compartidos for the anon role, confirming a share here ALWAYS fails with a real
// 42501 permission error -- which is exactly the scenario that used to leave a transaction
// permanently stuck: tx.groupId got set (so renderShareGroupSection showed its permanent
// read-only "ya se compartió, edita desde el grupo" card) even though nothing was ever saved,
// so there was no way back in from the group's side either. After the fix, the insert happens
// first and the transaction is left completely untouched on failure -- the user can just try
// sharing again (or edit anything else) instead of being stuck.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page } = await openApp();
  const errors = []; // don't use the shared `errors` from openApp -- we WANT/expect one console
                      // error here (the logged Supabase permission failure), so track separately
                      // and only forward JS pageerrors (real bugs) to finish().
  page.on('pageerror', err => errors.push(err.message));

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

  // Create the expense from inside the group, same as the reported flow.
  await page.click('[data-group-create-expense-open="g1"]');
  await page.waitForTimeout(150);
  await page.fill('[data-draft-field="comercio"]', 'Supermercado Falla');
  await page.fill('[data-draft-field="monto"]', '20000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(250);

  const txId = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.comercio === 'Supermercado Falla').id);

  // Confirm "Compartir con un grupo" -- this hits the real (blocked-by-RLS) Supabase insert
  // and is guaranteed to fail in this sandbox.
  await page.click('[data-share-confirm]');
  await page.waitForTimeout(1500);

  const tras = await page.evaluate((id) => {
    const D = window.__debug;
    const tx = D.TRANSACTIONS.find(t => t.id === id);
    return {
      tx,
      contenidoDetalle: document.getElementById('sheet-content').textContent,
      tieneBotonElegirGrupoDeNuevo: !!document.querySelector('[data-share-open="' + id + '"]'),
    };
  }, txId);

  check('la transacción NO quedó con groupId tras una compartición fallida', tras.tx.groupId === undefined, tras.tx);
  check('   ni con sharedExpenseId', tras.tx.sharedExpenseId === undefined, tras.tx);
  check('   y su estado/categorías/porCobrar quedaron como al guardarla (no se corrompieron)', tras.tx.estado !== 'no_es_gasto' && Array.isArray(tras.tx.porCobrar) && tras.tx.porCobrar.length === 0, tras.tx);
  check('el detalle NO muestra la tarjeta de solo lectura "ya se compartió" (que dejaría sin forma de editar el reparto)', !tras.contenidoDetalle.includes('ya se compartió con'), tras.contenidoDetalle.slice(0, 300));
  check('   sigue ofreciendo "Elegir un grupo" para volver a intentarlo', tras.tieneBotonElegirGrupoDeNuevo === true, tras);

  // And the rest of the transaction is still fully editable, same as any other transaction.
  const montoField = await page.$('[data-tx-field="monto"]');
  check('el campo de monto sigue siendo editable', !!montoField);
  if (montoField) {
    await page.fill('[data-tx-field="monto"]', '25000');
    await page.waitForTimeout(100);
    const txEditado = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id), txId);
    check('   y el cambio se guarda (monto = 25000)', txEditado.monto === 25000, txEditado);
  }

  check('no hubo errores de JS (pageerror) durante todo el flujo', errors.length === 0, errors);

  await finish({ context, browser, errors: [] });
})();
