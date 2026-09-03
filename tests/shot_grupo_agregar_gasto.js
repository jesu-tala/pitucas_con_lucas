// Regresión: el botón "+ Agregar un gasto" dentro de un grupo (data-grupo-crear-gasto-abrir)
// existía pero no tenía ningún handler conectado -- no hacía nada al tocarlo. Ahora reusa la
// misma hoja de "nueva transacción" del + de Transacciones: al guardar, en vez de cerrar la
// hoja y volver a la lista, deja la transacción recién creada abierta en su detalle con
// "Compartir con un grupo" ya precargado con el grupo del que se vino (state.compartirDraft).
// Igual que shot_compartir_grupo.js, el grupo se inyecta por window.__debug (sb bloqueado en
// el sandbox de test).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GRUPOS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GRUPO_PARTICIPANTES = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.GASTOS_COMPARTIDOS = [];
    D.state.tab = 'grupos';
    D.state.grupoAbiertoId = 'g1';
    D.render();
  });
  await page.waitForTimeout(200);

  // (a) El botón "Agregar un gasto" existe en el detalle del grupo.
  const tieneBoton = await page.evaluate(() => !!document.querySelector('[data-grupo-crear-gasto-abrir="g1"]'));
  check('(a) El detalle del grupo tiene el botón "Agregar un gasto"', tieneBoton === true);

  // (b) Al tocarlo, abre la MISMA hoja de "nueva transacción" que el + de Transacciones (no un
  // formulario aparte) -- con el borrador de tipo "gasto" y recordando de qué grupo se vino.
  await page.click('[data-grupo-crear-gasto-abrir="g1"]');
  await page.waitForTimeout(200);
  const abierto = await page.evaluate(() => ({
    creatingNew: window.__debug.state.creatingNew,
    tipo: window.__debug.state.draftTx ? window.__debug.state.draftTx.tipo : null,
    origenGrupo: window.__debug.state.crearGastoDesdeGrupoId,
    tieneCampoComercio: !!document.querySelector('[data-draft-field="comercio"]'),
  }));
  check('(b) Abre la hoja de nueva transacción (creatingNew=true, tipo=gasto)', abierto.creatingNew === true && abierto.tipo === 'gasto', abierto);
  check('   y recuerda que vino del grupo "g1"', abierto.origenGrupo === 'g1', abierto);
  check('   con el campo de comercio visible, igual que el + normal', abierto.tieneCampoComercio === true, abierto);

  // (c) Al guardar, NO vuelve a la lista de Transacciones: deja la transacción abierta en su
  // detalle, con "Compartir con un grupo" ya precargado con "Casa" (sin tener que elegirlo).
  await page.fill('[data-draft-field="comercio"]', 'Supermercado Líder');
  await page.fill('[data-draft-field="monto"]', '20000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(250);
  const trasGuardar = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TX.find(t => t.comercio === 'Supermercado Líder');
    return {
      creatingNew: D.state.creatingNew,
      openTxId: D.state.openTxId,
      origenGrupoLimpio: D.state.crearGastoDesdeGrupoId,
      compartirDraft: D.state.compartirDraft,
      txCreada: tx ? { id: tx.id, tipo: tx.tipo, monto: tx.monto } : null,
      sheetAbierta: document.getElementById('sheet-overlay').classList.contains('open'),
      contenidoDetalle: document.getElementById('sheet-content').textContent,
      tieneBotonElegirGrupo: !!document.querySelector('[data-compartir-abrir]'),
    };
  });
  check('(c) La transacción se creó (gasto, $20.000)', !!trasGuardar.txCreada && trasGuardar.txCreada.tipo === 'gasto' && trasGuardar.txCreada.monto === 20000, trasGuardar.txCreada);
  check('   la hoja sigue abierta, mostrando el detalle (no volvió a la lista)', trasGuardar.sheetAbierta === true && trasGuardar.creatingNew === false && trasGuardar.openTxId === trasGuardar.txCreada.id, trasGuardar);
  check('   se limpió crearGastoDesdeGrupoId (no queda pegado para la próxima)', trasGuardar.origenGrupoLimpio === null, trasGuardar);
  check('   "Compartir con un grupo" quedó precargado con el grupo "g1"', !!trasGuardar.compartirDraft && trasGuardar.compartirDraft.grupoId === 'g1' && trasGuardar.compartirDraft.txId === trasGuardar.txCreada.id, trasGuardar.compartirDraft);
  check('   el detalle muestra el formulario de reparto ya abierto (no el botón "Elegir un grupo")',
    trasGuardar.contenidoDetalle.includes('Compartir con un grupo') && trasGuardar.contenidoDetalle.includes('Casa') && trasGuardar.tieneBotonElegirGrupo === false,
    trasGuardar);

  await finish({ context, browser, errors });
})();
