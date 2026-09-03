// Regresión: "Eliminar grupo" no existía en absoluto (ni botón, ni handler, ni permiso en la
// base) -- se agregó eliminarGrupo() (menu.ts) + el trío de UI ask/cancel/confirm (mismo patrón
// que eliminar una transacción). Solo quien creó el grupo debería verlo, porque borra en cascada
// los gastos/saldos/participantes para todo el mundo. Igual que shot_grupos_feedback_errores.js,
// la escritura real a Supabase no se puede probar acá (sb bloqueado en el sandbox) -- así que
// también se cubre que un intento fallido avise con un toast explícito, nunca en silencio.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GRUPOS = [
      { id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' },
      { id: 'g2', nombre: 'Viaje', icono: '✈️', creado_por: 'user-fran', invite_code: 'y', created_at: '' }
    ];
    D.GRUPO_PARTICIPANTES = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g2', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p3', grupo_id: 'g2', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.GASTOS_COMPARTIDOS = [];
    D.state.tab = 'grupos';
  });

  // (a) En un grupo que YO creé: aparece "Eliminar grupo".
  await page.evaluate(() => { window.__debug.state.grupoAbiertoId = 'g1'; window.__debug.render(); });
  await page.waitForTimeout(200);
  const enMiGrupo = await page.evaluate(() => !!document.querySelector('[data-ask-delete-grupo="g1"]'));
  check('(a) En un grupo que yo creé, aparece el botón "Eliminar grupo"', enMiGrupo === true);

  // (b) En un grupo que creó OTRA persona (yo solo participo): no aparece la opción.
  await page.evaluate(() => { window.__debug.state.grupoAbiertoId = 'g2'; window.__debug.render(); });
  await page.waitForTimeout(200);
  const enGrupoAjeno = await page.evaluate(() => !!document.querySelector('[data-ask-delete-grupo="g2"]'));
  check('(b) En un grupo que creó otra persona, NO aparece "Eliminar grupo"', enGrupoAjeno === false);

  // (c) Volvemos al grupo propio: tocar "Eliminar grupo" pide confirmación, sin borrar nada
  // todavía.
  await page.evaluate(() => { window.__debug.state.grupoAbiertoId = 'g1'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-ask-delete-grupo="g1"]');
  await page.waitForTimeout(150);
  const pidiendoConfirmacion = await page.evaluate(() => ({
    estado: window.__debug.state.confirmDeleteGrupoId,
    tieneConfirmar: !!document.querySelector('[data-confirm-delete-grupo="g1"]'),
    tieneCancelar: !!document.querySelector('[data-cancel-delete-grupo]'),
    grupoSigueExistiendo: window.__debug.GRUPOS.some(g => g.id === 'g1'),
  }));
  check('(c) Tocar "Eliminar grupo" pide confirmación explícita (no borra directo)',
    pidiendoConfirmacion.estado === 'g1' && pidiendoConfirmacion.tieneConfirmar && pidiendoConfirmacion.tieneCancelar, pidiendoConfirmacion);
  check('   el grupo todavía no se borró', pidiendoConfirmacion.grupoSigueExistiendo === true, pidiendoConfirmacion);

  // (d) Cancelar vuelve al botón normal, sin tocar nada.
  await page.click('[data-cancel-delete-grupo]');
  await page.waitForTimeout(150);
  const cancelado = await page.evaluate(() => ({
    estado: window.__debug.state.confirmDeleteGrupoId,
    volvioAlBoton: !!document.querySelector('[data-ask-delete-grupo="g1"]'),
    grupoSigueExistiendo: window.__debug.GRUPOS.some(g => g.id === 'g1'),
  }));
  check('(d) Cancelar vuelve a mostrar el botón "Eliminar grupo", sin borrar', cancelado.estado === null && cancelado.volvioAlBoton === true && cancelado.grupoSigueExistiendo === true, cancelado);

  // (e) Confirmar, sin conexión real a Supabase (sb bloqueado en este sandbox), avisa con un
  // toast explícito -- nunca en silencio -- y no deja el grupo en un estado a medias.
  await page.click('[data-ask-delete-grupo="g1"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-grupo="g1"]');
  await page.waitForTimeout(1200);
  const trasConfirmar = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    estado: window.__debug.state.confirmDeleteGrupoId,
  }));
  check('(e) Si eliminar falla, aparece un toast explícito (nunca silencio)', /no se pudo eliminar/i.test(trasConfirmar.toastTexto), trasConfirmar);
  check('   y se cierra el diálogo de confirmación de todas formas (no queda pegado)', trasConfirmar.estado === null, trasConfirmar);

  await finish({ context, browser, errors });
})();
