// Refinamiento B de grupos: "una vez que marcas que una transacción es de un grupo, no deja
// editar eso" -- antes, el detalle de una transacción ya compartida mostraba un mensaje sin
// salida ("para cambiar el reparto, hazlo desde la vista del grupo", sin ningún botón real ahí
// tampoco). Ahora ofrece "Editar" (reabre el mismo formulario de compartir, seedeado desde el
// reparto real ya guardado -- puede cambiar grupo/división/participantes) y "Quitar del grupo"
// (desvincula la transacción, sin borrar nada del grupo). El write real a Supabase
// (updateSharedTransaction/removeSharedTransaction) no se puede probar de punta a punta acá
// (sb bloqueado en el sandbox, igual que shot_compartir_grupo.js) -- este test cubre lo que SÍ es
// puramente UI/estado local: que aparecen los botones correctos, que "Editar" reconstruye el
// draft con los valores reales, y que "Quitar" pide confirmación antes de actuar.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' },
      { id: 'p3', grupo_id: 'g1', user_id: null, nombre: 'Caro', color: 'peach' }
    ];
    // El gasto compartido real (division_tipo 'montos', ya no en partes iguales) -- lo que
    // draftFromExistingGroupSplit debería reconstruir al tocar "Editar".
    D.SHARED_EXPENSES = [{
      id: 'se1', grupo_id: 'g1', descripcion: 'Compra depto', categoria_origen: null, monto: 30000,
      fecha: D.todayISO(), pagado_por: 'p1', registrado_por: 'user-jesu', division_tipo: 'montos', tx_origen_id: 'tGrupoEdit',
      reparto: [
        { id: 'sp1', gasto_compartido_id: 'se1', participante_id: 'p2', monto: 12000 },
        { id: 'sp2', gasto_compartido_id: 'se1', participante_id: 'p3', monto: 8000 }
      ]
    }];
    D.TRANSACTIONS.push({
      id: 'tGrupoEdit', fecha: D.todayISO(), hora: '10:00', comercio: 'Compra depto', monto: 30000, medio: 'debito_bci',
      tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'hogar', monto: 30000 }],
      porCobrar: [
        { persona: 'Fran', monto: 12000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null, groupId: 'g1', participanteId: 'p2', sharedExpenseId: 'se1' },
        { persona: 'Caro', monto: 8000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null, groupId: 'g1', participanteId: 'p3', sharedExpenseId: 'se1' }
      ],
      reglaAuto: false, nota: '', groupId: 'g1', sharedExpenseId: 'se1', divisionTipo: 'montos'
    });
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  // ---------- (a) El detalle ya no es un dead-end: ofrece Editar + Quitar del grupo ----------
  await page.click('[data-tx="tGrupoEdit"]');
  await page.waitForTimeout(200);
  const detalle = await page.evaluate(() => ({
    texto: document.getElementById('sheet-content').textContent,
    tieneEditar: !!document.querySelector('[data-share-edit="tGrupoEdit"]'),
    tieneQuitar: !!document.querySelector('[data-share-remove-ask="tGrupoEdit"]'),
  }));
  check('(a) El detalle de un gasto ya compartido ofrece un botón "Editar" real', detalle.tieneEditar, detalle);
  check('   y un botón "Quitar del grupo"', detalle.tieneQuitar, detalle);
  check('   (ya no el mensaje sin salida "hazlo desde la vista del grupo")', !/hazlo desde la vista del grupo/i.test(detalle.texto), detalle.texto.slice(0, 300));

  // ---------- (b) "Editar" reabre el formulario con los valores REALES ya guardados ----------
  await page.click('[data-share-edit="tGrupoEdit"]');
  await page.waitForTimeout(150);
  const editando = await page.evaluate(() => {
    const grupoSel = document.querySelector('select[data-share-group]');
    const pagadorSel = document.querySelector('select[data-share-pagador]');
    return {
      grupoSeleccionado: grupoSel ? grupoSel.value : null,
      pagadorSeleccionado: pagadorSel ? pagadorSel.value : null,
      valorFran: document.querySelector('[data-share-value="p2"]') ? document.querySelector('[data-share-value="p2"]').value : null,
      valorCaro: document.querySelector('[data-share-value="p3"]') ? document.querySelector('[data-share-value="p3"]').value : null,
      totalTexto: document.getElementById('sheet-content').textContent,
      tituloDiceEditar: /Editar reparto del grupo/.test(document.getElementById('sheet-content').textContent),
      botonDiceGuardarCambios: (document.querySelector('[data-share-confirm="tGrupoEdit"]') || {}).textContent,
    };
  });
  check('(b) "Editar" deja el grupo correcto ya seleccionado', editando.grupoSeleccionado === 'g1', editando);
  check('   y al pagador real (Yo = p1)', editando.pagadorSeleccionado === 'p1', editando);
  check('   con los montos reales de cada participante precargados (Fran $12.000, Caro $8.000)',
    editando.valorFran === '12000' && editando.valorCaro === '8000', editando);
  check('   el total repartido sigue cuadrando ($30.000 de $30.000)', editando.totalTexto.includes('$30.000 de $30.000'), editando.totalTexto.slice(0, 400));
  check('   el título dice "Editar reparto del grupo" (no "Compartir con un grupo" de cero)', editando.tituloDiceEditar, editando);
  check('   y el botón dice "Guardar cambios" (no "Compartir")', editando.botonDiceGuardarCambios === 'Guardar cambios', editando.botonDiceGuardarCambios);

  // ---------- (c) Se puede cambiar la división en el mismo formulario ----------
  await page.click('[data-seg="division-tipo"] [data-seg-val="iguales"]');
  await page.waitForTimeout(150);
  const cambiado = await page.evaluate(() => document.getElementById('sheet-content').textContent);
  check('(c) Cambiar a "Por partes" (iguales) recalcula el reparto en el mismo formulario', cambiado.includes('$30.000 de $30.000'), cambiado.slice(0, 400));

  await page.click('[data-share-cancel]');
  await page.waitForTimeout(150);

  // ---------- (d) "Quitar del grupo" pide confirmación antes de actuar ----------
  const antesDeQuitar = await page.evaluate(() => !!document.querySelector('[data-share-remove-ask]'));
  check('(pre-d) El botón "Quitar del grupo" está de vuelta tras cancelar la edición', antesDeQuitar);
  await page.click('[data-share-remove-ask="tGrupoEdit"]');
  await page.waitForTimeout(150);
  const confirmando = await page.evaluate(() => ({
    pideConfirmacion: document.getElementById('sheet-content').textContent.includes('Quitar este gasto de'),
    tieneBotonConfirmar: !!document.querySelector('[data-share-remove-confirm="tGrupoEdit"]'),
  }));
  check('(d) "Quitar del grupo" pide confirmación antes de desvincular nada', confirmando.pideConfirmacion && confirmando.tieneBotonConfirmar, confirmando);

  await page.click('[data-share-remove-cancel]');
  await page.waitForTimeout(150);
  const trasCancelar = await page.evaluate(() => ({
    seCancelo: !document.getElementById('sheet-content').textContent.includes('Quitar este gasto de'),
    txSigueEnGrupo: window.__debug.buildFullStateBlob().transacciones.find(t => t.id === 'tGrupoEdit').groupId === 'g1',
  }));
  check('   cancelar no desvincula nada (la transacción sigue en el grupo)', trasCancelar.seCancelo && trasCancelar.txSigueEnGrupo, trasCancelar);

  await finish({ context, browser, errors });
})();
