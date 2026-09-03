// Regression: "Delete group" didn't exist at all (no button, no handler, no permission in the
// database) -- deleteGroup() (menu.ts) was added, along with the usual UI trio ask/cancel/confirm
// (same pattern as deleting a transaction). Only whoever created the group should see it, because
// it cascade-deletes the expenses/balances/participants for everyone. Just like
// shot_grupos_feedback_errores.js, the real write to Supabase can't be tested here (sb blocked in
// the sandbox) -- so this also covers that a failed attempt warns with an explicit toast, never silently.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [
      { id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' },
      { id: 'g2', nombre: 'Viaje', icono: '✈️', creado_por: 'user-fran', invite_code: 'y', created_at: '' }
    ];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g2', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p3', grupo_id: 'g2', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.SHARED_EXPENSES = [];
    D.state.tab = 'grupos';
  });

  // (a) In a group that I created: "Delete group" appears.
  await page.evaluate(() => { window.__debug.state.openGroupId = 'g1'; window.__debug.render(); });
  await page.waitForTimeout(200);
  const enMiGrupo = await page.evaluate(() => !!document.querySelector('[data-ask-delete-group="g1"]'));
  check('(a) En un grupo que yo creé, aparece el botón "Eliminar grupo"', enMiGrupo === true);

  // (b) In a group created by ANOTHER person (I only participate): the option doesn't appear.
  await page.evaluate(() => { window.__debug.state.openGroupId = 'g2'; window.__debug.render(); });
  await page.waitForTimeout(200);
  const enGrupoAjeno = await page.evaluate(() => !!document.querySelector('[data-ask-delete-group="g2"]'));
  check('(b) En un grupo que creó otra persona, NO aparece "Eliminar grupo"', enGrupoAjeno === false);

  // (c) Back to my own group: tapping "Delete group" asks for confirmation, without deleting anything
  // yet.
  await page.evaluate(() => { window.__debug.state.openGroupId = 'g1'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-ask-delete-group="g1"]');
  await page.waitForTimeout(150);
  const pidiendoConfirmacion = await page.evaluate(() => ({
    estado: window.__debug.state.confirmDeleteGroupId,
    tieneConfirmar: !!document.querySelector('[data-confirm-delete-group="g1"]'),
    tieneCancelar: !!document.querySelector('[data-cancel-delete-group]'),
    grupoSigueExistiendo: window.__debug.GROUPS.some(g => g.id === 'g1'),
  }));
  check('(c) Tocar "Eliminar grupo" pide confirmación explícita (no borra directo)',
    pidiendoConfirmacion.estado === 'g1' && pidiendoConfirmacion.tieneConfirmar && pidiendoConfirmacion.tieneCancelar, pidiendoConfirmacion);
  check('   el grupo todavía no se borró', pidiendoConfirmacion.grupoSigueExistiendo === true, pidiendoConfirmacion);

  // (d) Cancel goes back to the normal button, without touching anything.
  await page.click('[data-cancel-delete-group]');
  await page.waitForTimeout(150);
  const cancelado = await page.evaluate(() => ({
    estado: window.__debug.state.confirmDeleteGroupId,
    volvioAlBoton: !!document.querySelector('[data-ask-delete-group="g1"]'),
    grupoSigueExistiendo: window.__debug.GROUPS.some(g => g.id === 'g1'),
  }));
  check('(d) Cancelar vuelve a mostrar el botón "Eliminar grupo", sin borrar', cancelado.estado === null && cancelado.volvioAlBoton === true && cancelado.grupoSigueExistiendo === true, cancelado);

  // (e) Confirming, with no real connection to Supabase (sb blocked in this sandbox), warns with an
  // explicit toast -- never silently -- and doesn't leave the group in a half-done state.
  await page.click('[data-ask-delete-group="g1"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-group="g1"]');
  await page.waitForTimeout(1200);
  const trasConfirmar = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    estado: window.__debug.state.confirmDeleteGroupId,
  }));
  check('(e) Si eliminar falla, aparece un toast explícito (nunca silencio)', /no se pudo eliminar/i.test(trasConfirmar.toastTexto), trasConfirmar);
  check('   y se cierra el diálogo de confirmación de todas formas (no queda pegado)', trasConfirmar.estado === null, trasConfirmar);

  await finish({ context, browser, errors });
})();
