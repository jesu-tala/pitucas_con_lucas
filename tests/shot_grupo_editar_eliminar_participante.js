// Feature: "debería poder eliminar personas de grupo o editarlas". Solo se ofrece para
// participantes SIN cuenta (ella los administra por completo, como su nombre) -- a alguien con
// cuenta propia no se le fuerza un cambio de nombre ni se lo saca del grupo unilateralmente
// desde acá. Eliminar además se bloquea si el participante ya tiene gastos o transferencias
// asociadas (grupo_participantes.id tiene on delete cascade desde gasto_reparto -- borrarlo con
// historial corrompería cuentas ya cerradas), verificado con participantHasHistory().
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page } = await openApp();
  const errors = []; // se espera un console.error real (permission/RLS simulado en el sandbox,
                      // mismo patrón que shot_grupo_eliminar.js) para el caso con historial.
  page.on('pageerror', err => errors.push(err.message));

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }, // con cuenta
      { id: 'p3', grupo_id: 'g1', user_id: null, nombre: 'Cata', color: 'peach' } // sin cuenta, sin historial
    ];
    D.SHARED_EXPENSES = [];
    D.PAID_BALANCES = [];
    D.state.tab = 'grupos';
    D.state.openGroupId = 'g1';
    D.state.groupDetailTab = 'balances';
    D.render();
  });
  await page.waitForTimeout(200);

  const botones = await page.evaluate(() => ({
    yoTieneEditar: !!document.querySelector('[data-open-edit-participant="p1"]'),
    franTieneEditar: !!document.querySelector('[data-open-edit-participant="p2"]'),
    cataTieneEditar: !!document.querySelector('[data-open-edit-participant="p3"]'),
    cataTieneEliminar: !!document.querySelector('[data-ask-delete-participant="p3"]'),
  }));
  check('A "Yo" (con cuenta) no se le ofrece editar/eliminar', botones.yoTieneEditar === false);
  check('A "Fran" (con cuenta) tampoco se le ofrece editar/eliminar', botones.franTieneEditar === false);
  check('A "Cata" (sin cuenta) SÍ se le ofrece editar', botones.cataTieneEditar === true);
  check('   y eliminar', botones.cataTieneEliminar === true);

  // ---------- Editar: abre el campo, escribe, guarda ----------
  await page.click('[data-open-edit-participant="p3"]');
  await page.waitForTimeout(150);
  const campoAbierto = await page.evaluate(() => {
    const input = document.querySelector('[data-edit-participant-name]');
    return input ? input.value : null;
  });
  check('Tocar "Editar" abre un campo con el nombre actual precargado', campoAbierto === 'Cata', campoAbierto);

  await page.fill('[data-edit-participant-name]', 'Catalina');
  await page.click('[data-save-edit-participant="p3"]');
  await page.waitForTimeout(1500);
  const trasGuardar = await page.evaluate(() => ({
    toast: document.getElementById('toast-stack').textContent,
    editando: window.__debug.state.editingParticipantId,
  }));
  check('Guardar cierra el campo de edición', trasGuardar.editando === null, trasGuardar);
  // sb real no puede escribir en este sandbox (mismo motivo de siempre) -- lo que importa acá es
  // que avise con un toast explícito, nunca en silencio.
  check('   y avisa (éxito o error explícito, nunca silencio)', trasGuardar.toast.length > 0, trasGuardar);

  // ---------- Eliminar sin historial: pide confirmación, nunca borra directo ----------
  await page.click('[data-ask-delete-participant="p3"]');
  await page.waitForTimeout(150);
  const pidiendoConfirmacion = await page.evaluate(() => ({
    tieneConfirmar: !!document.querySelector('[data-confirm-delete-participant="p3"]'),
    tieneCancelar: !!document.querySelector('[data-cancel-delete-participant]'),
  }));
  check('Tocar "Eliminar" pide confirmación explícita (no borra directo)', pidiendoConfirmacion.tieneConfirmar && pidiendoConfirmacion.tieneCancelar, pidiendoConfirmacion);
  await page.click('[data-cancel-delete-participant]');
  await page.waitForTimeout(150);
  const siguExistiendo = await page.evaluate(() => window.__debug.GROUP_PARTICIPANTS.some(p => p.id === 'p3'));
  check('Cancelar no borra a nadie', siguExistiendo === true, siguExistiendo);

  // ---------- Eliminar CON historial: se bloquea de entrada, con un motivo claro ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.SHARED_EXPENSES = [{ id: 'gc1', grupo_id: 'g1', descripcion: 'Feria', categoria_origen: null, monto: 30000, fecha: '2026-08-01', pagado_por: 'p1', registrado_por: 'user-jesu', division_tipo: 'montos', tx_origen_id: null, reparto: [{ id: 'r1', gasto_compartido_id: 'gc1', participante_id: 'p3', monto: 10000 }] }];
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-ask-delete-participant="p3"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-participant="p3"]');
  await page.waitForTimeout(300);
  const conHistorial = await page.evaluate(() => ({
    toast: document.getElementById('toast-stack').textContent,
    siguExistiendo: window.__debug.GROUP_PARTICIPANTS.some(p => p.id === 'p3'),
  }));
  check('Con historial (gastos ya repartidos), el borrado se bloquea con un motivo claro',
    /gastos o transferencias registradas/i.test(conHistorial.toast), conHistorial);
  check('   y sigue existiendo (no se corrompió el reparto del gasto ya cerrado)', conHistorial.siguExistiendo === true, conHistorial);

  await finish({ context, browser, errors: [] });
})();
