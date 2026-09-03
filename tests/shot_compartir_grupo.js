// UI: "Share with a group" in a transaction's detail view (shared expenses, UI phase).
// The real write against Supabase (shareExistingTransaction) can't be tested end to end
// here -- just like createGroup/joinGroup/addParticipantWithoutAccount, it depends on "sb"
// (the Supabase client, blocked by the sandbox's network policy) -- so this test
// focuses on what IS purely UI: that the section doesn't appear without groups, that it appears
// and opens correctly with groups (injected via window.__debug, same as
// audit_gastos_compartidos.js), that the payer selector and the participant checkboxes
// react and recalculate the equal split live, and that Cancel closes the form.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // t2 = Copec Providencia, $18.000, confirmed expense -- a good candidate: even amount, no
  // prior porCobrar/no_es_gasto that would complicate reading the test.
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // (a) With no group created yet: the section must not appear at all.
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  const sinGrupos = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Compartir con un grupo'));
  check('(a) Sin grupos creados: no aparece "Compartir con un grupo" en el detalle', sinGrupos === false);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // Inject a "Casa" group with 2 participants: Yo (currentUser) and Fran.
  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.SHARED_EXPENSES = [];
    D.render();
  });

  // (b) With a group available and the transaction not yet shared: closed "Choose a group" button.
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  const cerrado = await page.evaluate(() => ({
    tieneSeccion: document.getElementById('sheet-content').textContent.includes('Compartir con un grupo'),
    tieneBotonAbrir: !!document.querySelector('[data-share-open="t2"]'),
    formAbierto: !!document.querySelector('[data-share-group]'),
  }));
  check('(b) Con un grupo y tx sin compartir: aparece la sección con botón "Elegir un grupo"', cerrado.tieneSeccion && cerrado.tieneBotonAbrir, cerrado);
  check('   el formulario todavía no está abierto', cerrado.formAbierto === false, cerrado);

  // (c) On opening, the group select is shown, the payer (Yo by default), and both participants
  // included by default, with an equal split ($9,000 each of $18,000).
  await page.click('[data-share-open="t2"]');
  await page.waitForTimeout(150);
  const abierto = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    const checks = Array.from(document.querySelectorAll('[data-share-include]'));
    return {
      tieneSelectGrupo: !!document.querySelector('[data-share-group]'),
      pagadorSeleccionado: document.querySelector('.segmented[data-seg="compartir-pagador"] button.active')?.textContent || null,
      cantidadCheckboxes: checks.length,
      todosMarcados: checks.every(c => c.checked),
      totalRepartido: content.textContent.includes('$18.000 de $18.000'),
      botonCompartirHabilitado: !document.querySelector('[data-share-confirm="t2"]').disabled,
    };
  });
  check('(c) Al abrir el form: aparece el select de grupo', abierto.tieneSelectGrupo === true, abierto);
  check('   "Yo" viene seleccionada por defecto como quien pagó', abierto.pagadorSeleccionado === 'Yo', abierto);
  check('   los 2 participantes vienen incluidos por defecto (2 checkboxes marcados)', abierto.cantidadCheckboxes === 2 && abierto.todosMarcados === true, abierto);
  check('   el reparto en partes iguales suma el total exacto ($18.000 de $18.000)', abierto.totalRepartido === true, abierto);
  check('   el botón "Compartir" está habilitado (reparto completo)', abierto.botonCompartirHabilitado === true, abierto);

  // (d) Unchecking a participant recalculates the split live (now only Yo, 100% of the expense).
  await page.click('[data-share-include="p2"]');
  await page.waitForTimeout(150);
  const desmarcado = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      p2Marcado: document.querySelector('[data-share-include="p2"]').checked,
      totalTexto: content.textContent,
    };
  });
  check('(d) Al desmarcar a Fran, su checkbox queda desmarcado', desmarcado.p2Marcado === false, desmarcado);
  check('   el reparto se recalcula: ahora Yo cubre el total completo ($18.000 de $18.000)',
    desmarcado.totalTexto.includes('$18.000 de $18.000'), desmarcado.totalTexto.slice(0, 400));

  // (e) Changing the payer to Fran via the segmented control updates the in-memory draft.
  await page.click('[data-share-include="p2"]'); // include them again
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Fran' && b.closest('.segmented'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(150);
  const pagadorCambiado = await page.evaluate(() => window.__debug.state.shareDraft.pagadoPorId);
  check('(e) Elegir a Fran como pagador actualiza el draft (pagadoPorId = p2)', pagadorCambiado === 'p2', pagadorCambiado);

  // (f) Cancel closes the form and returns to the "Choose a group" button, without touching the transaction.
  await page.click('[data-share-cancel]');
  await page.waitForTimeout(150);
  const cancelado = await page.evaluate(() => ({
    formAbierto: !!document.querySelector('[data-share-group]'),
    botonAbrir: !!document.querySelector('[data-share-open="t2"]'),
    txSigueSinGrupo: window.__debug.TRANSACTIONS.find(t => t.id === 't2').groupId === undefined,
  }));
  check('(f) Cancelar cierra el form y vuelve al botón "Elegir un grupo"', cancelado.formAbierto === false && cancelado.botonAbrir === true, cancelado);
  check('   la transacción original no quedó modificada (sin groupId)', cancelado.txSigueSinGrupo === true, cancelado);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (g) A transaction ALREADY shared (groupId set by hand, simulating that shareExistingTransaction
  // already ran) shows the read-only "already shared" card, without the choose-group button.
  await page.evaluate(() => {
    const D = window.__debug;
    const t3 = D.TRANSACTIONS.find(t => t.id === 't3');
    t3.groupId = 'g1';
    D.render();
  });
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);
  const yaCompartido = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      tieneTexto: content.textContent.includes('ya se compartió con') && content.textContent.includes('Casa'),
      tieneBotonAbrir: !!document.querySelector('[data-share-open="t3"]'),
    };
  });
  check('(g) Una tx ya compartida (groupId puesto) muestra la tarjeta de solo lectura con el nombre del grupo', yaCompartido.tieneTexto === true, yaCompartido);
  check('   y ya no ofrece el botón de "Elegir un grupo" (no se puede volver a compartir desde acá)', yaCompartido.tieneBotonAbrir === false, yaCompartido);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
