// Antes de este fix, al crear un gasto nuevo no había forma de marcarlo "por cobrar a
// alguien"/"reembolso pendiente"/"no es gasto" hasta DESPUÉS de guardarlo -- la usuaria tenía
// que guardar la transacción (lo que cierra la hoja entera), buscarla de nuevo en la lista,
// tocarla, y RECIÉN ahí aparecían esas opciones en su detalle. Este test cubre que "Acciones
// rápidas" (y, cuando corresponde, el editor de reparto que abre "Por cobrar a alguien") ahora
// también viven en la hoja de "Nueva transacción" (renderNewTxSheetContent en sheet.ts), ANTES
// de tocar "Guardar transacción", y que lo elegido ahí sobrevive intacto al guardar.
//
// Implementación (ver sheet.ts): state.draftTx recibe un id sentinela fijo ('__draft__',
// DRAFT_TX_ID) para que todo lo que ya dependía de t.id para este grupo de interacciones
// (state.splitCollectMode/splitCollectUnit, state.shareDraft.txId, los atributos data-tx/
// data-share-confirm/data-charge-* de la propia hoja) funcione sin ningún caso especial --
// currentEditableTx() (sheet.ts) es lo único que cada handler en events.ts usa para resolver
// "la transacción sobre la que estoy actuando ahora", devolviendo state.draftTx mientras
// state.creatingNew es true o la transacción real (getTx(state.openTxId)) en cualquier otro caso.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // ========== (a) "Por cobrar a alguien" ANTES de guardar ==========
  await page.click('#fab-add');
  await page.waitForTimeout(200);

  const quickActionsVisiblesDeEntrada = await page.evaluate(() => ({
    tieneAccionesRapidas: !!document.querySelector('#sheet-content [data-action="porcobrar_persona"]'),
    creatingNew: window.__debug.state.creatingNew,
    draftId: window.__debug.state.draftTx.id,
  }));
  check('(a) La hoja de "Nueva transacción" ya trae "Acciones rápidas" ANTES de guardar (gasto por defecto)',
    quickActionsVisiblesDeEntrada.tieneAccionesRapidas === true, quickActionsVisiblesDeEntrada);
  check('   el borrador tiene un id sentinela fijo para que el resto de los handlers funcione sin casos especiales',
    quickActionsVisiblesDeEntrada.creatingNew === true && quickActionsVisiblesDeEntrada.draftId === '__draft__',
    quickActionsVisiblesDeEntrada);

  await page.fill('[data-draft-field="comercio"]', 'Cena con Fran');
  await page.fill('[data-draft-field="monto"]', '10000');
  await page.waitForTimeout(150);

  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  const trasTocarPorCobrar = await page.evaluate(() => ({
    estado: window.__debug.state.draftTx.estado,
    shareDraftTxId: window.__debug.state.shareDraft ? window.__debug.state.shareDraft.txId : null,
    tieneModalidad: !!document.querySelector('[data-seg="division-tipo"]'),
  }));
  check('   tocar "Por cobrar a alguien" en el borrador abre el mismo editor de reparto compartido (state.shareDraft) que una transacción ya guardada',
    trasTocarPorCobrar.estado === 'por_cobrar' && trasTocarPorCobrar.shareDraftTxId === '__draft__' && trasTocarPorCobrar.tieneModalidad === true,
    trasTocarPorCobrar);

  // "Vincular a un depósito"/"dar por perdida"/"subir foto de la boleta" no tienen sentido antes
  // de que esta transacción exista de verdad -- deben estar ausentes mientras se arma el reparto.
  const accionesDiferidas = await page.evaluate(() => ({
    linkPending: !!document.querySelector('[data-link-pending]'),
    writeOff: !!document.querySelector('[data-write-off]'),
    openReceipt: !!document.querySelector('[data-open-receipt]'),
  }));
  check('   "vincular a un depósito"/"dar por perdida"/"subir boleta" quedan diferidos hasta después de guardar (ninguno aparece en el borrador)',
    !accionesDiferidas.linkPending && !accionesDiferidas.writeOff && !accionesDiferidas.openReceipt, accionesDiferidas);

  await page.click('[data-share-include="Fran"]');
  await page.waitForTimeout(150);
  const previewReparto = await page.evaluate(() => ({
    confirmHabilitado: !document.querySelector('[data-share-confirm]').disabled,
    totalTexto: document.getElementById('sheet-content').textContent,
  }));
  check('   incluir a Fran reparte los $10.000 en partes iguales (Tú/Fran $5.000 cada uno) y habilita "Guardar reparto"',
    previewReparto.confirmHabilitado === true && previewReparto.totalTexto.includes('$10.000 de $10.000'),
    previewReparto);

  await page.click('[data-share-confirm="__draft__"]');
  await page.waitForTimeout(150);
  const trasConfirmarReparto = await page.evaluate(() => ({
    porCobrar: window.__debug.state.draftTx.porCobrar,
    estado: window.__debug.state.draftTx.estado,
    botonSeleccionado: document.querySelector('[data-action="porcobrar_persona"]').classList.contains('selected'),
    muestraEditarReparto: !!document.querySelector('[data-charge-split-open="__draft__"]'),
  }));
  check('   al confirmar el reparto, queda escrito directo en el borrador (porCobrar: Fran $5.000, estado "por_cobrar") ANTES de guardar',
    trasConfirmarReparto.porCobrar.length === 1 && trasConfirmarReparto.porCobrar[0].persona === 'Fran' &&
    trasConfirmarReparto.porCobrar[0].monto === 5000 && trasConfirmarReparto.estado === 'por_cobrar',
    trasConfirmarReparto);
  check('   y la UI lo refleja: el botón "Por cobrar a alguien" queda marcado y aparece "Editar reparto"',
    trasConfirmarReparto.botonSeleccionado === true && trasConfirmarReparto.muestraEditarReparto === true,
    trasConfirmarReparto);

  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(200);
  const guardadaPorCobrar = await page.evaluate(() => {
    const tx = window.__debug.TRANSACTIONS.find(t => t.comercio === 'Cena con Fran');
    return tx ? { estado: tx.estado, porCobrar: tx.porCobrar, id: tx.id } : null;
  });
  check('(a) La transacción real, ya guardada, conserva el reparto armado ANTES de guardar (estado "por_cobrar", Fran $5.000)',
    !!guardadaPorCobrar && guardadaPorCobrar.estado === 'por_cobrar' &&
    guardadaPorCobrar.porCobrar.length === 1 && guardadaPorCobrar.porCobrar[0].persona === 'Fran' && guardadaPorCobrar.porCobrar[0].monto === 5000,
    guardadaPorCobrar);
  check('   y el id sentinela del borrador nunca se filtra al id real de la transacción guardada',
    guardadaPorCobrar.id !== '__draft__', guardadaPorCobrar.id);

  // ========== (b) "Reembolso pendiente" ANTES de guardar ==========
  await page.click('#fab-add');
  await page.waitForTimeout(200);
  await page.fill('[data-draft-field="comercio"]', 'Consulta médica');
  await page.fill('[data-draft-field="monto"]', '30000');
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_reembolso"]');
  await page.waitForTimeout(150);
  const trasReembolso = await page.evaluate(() => ({
    estado: window.__debug.state.draftTx.estado,
    porCobrar: window.__debug.state.draftTx.porCobrar,
  }));
  check('(b) "Reembolso pendiente" en el borrador agrega una fila tipo reembolso y marca el borrador "por_cobrar"',
    trasReembolso.estado === 'por_cobrar' && trasReembolso.porCobrar.length === 1 && trasReembolso.porCobrar[0].tipo === 'reembolso',
    trasReembolso);

  await page.fill('[data-charge-name="0"]', 'Isapre');
  await page.fill('[data-charge-amount="0"]', '18000');
  await page.waitForTimeout(150);
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(200);
  const guardadaReembolso = await page.evaluate(() => {
    const tx = window.__debug.TRANSACTIONS.find(t => t.comercio === 'Consulta médica');
    return tx ? { estado: tx.estado, porCobrar: tx.porCobrar } : null;
  });
  check('(b) La transacción guardada conserva el reembolso armado antes de guardar (Isapre, $18.000)',
    !!guardadaReembolso && guardadaReembolso.estado === 'por_cobrar' &&
    guardadaReembolso.porCobrar.length === 1 && guardadaReembolso.porCobrar[0].persona === 'Isapre' && guardadaReembolso.porCobrar[0].monto === 18000,
    guardadaReembolso);

  // ========== (c) "No es gasto" ANTES de guardar -- también limpia la categoría ya elegida ==========
  await page.click('#fab-add');
  await page.waitForTimeout(200);
  await page.fill('[data-draft-field="comercio"]', 'Traspaso interno');
  await page.fill('[data-draft-field="monto"]', '50000');
  await page.waitForTimeout(150);
  await page.selectOption('[data-draft-cat-select]', 'supermercado');
  await page.waitForTimeout(150);
  const conCategoriaAntes = await page.evaluate(() => window.__debug.state.draftTx.categorias);
  check('(c) Antes de marcar "no es gasto", el borrador tiene la categoría recién elegida', conCategoriaAntes.length === 1 && conCategoriaAntes[0].cat === 'supermercado', conCategoriaAntes);

  await page.click('[data-action="noesgasto"]');
  await page.waitForTimeout(150);
  const trasNoEsGasto = await page.evaluate(() => ({
    estado: window.__debug.state.draftTx.estado,
    categorias: window.__debug.state.draftTx.categorias,
  }));
  check('   "No es gasto" limpia la categoría ya elegida (misma regla que ya rige para una transacción guardada) y marca el estado',
    trasNoEsGasto.estado === 'no_es_gasto' && trasNoEsGasto.categorias.length === 0, trasNoEsGasto);

  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(200);
  const guardadaNoEsGasto = await page.evaluate(() => {
    const tx = window.__debug.TRANSACTIONS.find(t => t.comercio === 'Traspaso interno');
    return tx ? { estado: tx.estado, categorias: tx.categorias } : null;
  });
  check('(c) La transacción guardada queda "no_es_gasto" y sin categoría',
    !!guardadaNoEsGasto && guardadaNoEsGasto.estado === 'no_es_gasto' && guardadaNoEsGasto.categorias.length === 0, guardadaNoEsGasto);

  // ========== (d) Regresión: el flujo viejo de 2 pasos sigue funcionando igual ==========
  // Guardar un gasto "pelado" (sin tocar Acciones rápidas) sigue quedando "pendiente" (sin
  // categoría) como siempre, y marcar "por cobrar a alguien" DESPUÉS de guardado (reabriendo su
  // detalle) sigue funcionando exactamente igual que antes de este fix.
  await page.click('#fab-add');
  await page.waitForTimeout(200);
  await page.fill('[data-draft-field="comercio"]', 'Compra pelada');
  await page.fill('[data-draft-field="monto"]', '8000');
  await page.waitForTimeout(150);
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(200);
  const peladaId = await page.evaluate(() => {
    const tx = window.__debug.TRANSACTIONS.find(t => t.comercio === 'Compra pelada');
    return tx ? { id: tx.id, estado: tx.estado, porCobrar: tx.porCobrar } : null;
  });
  check('(d) Guardar "pelado" (sin tocar Acciones rápidas) sigue dejando la transacción "pendiente" y sin porCobrar, como siempre',
    !!peladaId && peladaId.estado === 'pendiente' && peladaId.porCobrar.length === 0, peladaId);

  await page.click('[data-tx="' + peladaId.id + '"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Cata"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-confirm="' + peladaId.id + '"]');
  await page.waitForTimeout(150);
  const trasFlujoViejo = await page.evaluate((id) => {
    const tx = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return { estado: tx.estado, porCobrar: tx.porCobrar };
  }, peladaId.id);
  check('(d) El flujo viejo (guardar y RECIÉN DESPUÉS marcar "por cobrar" reabriendo el detalle) sigue funcionando exactamente igual',
    trasFlujoViejo.estado === 'por_cobrar' && trasFlujoViejo.porCobrar.length === 1 && trasFlujoViejo.porCobrar[0].persona === 'Cata' && trasFlujoViejo.porCobrar[0].monto === 4000,
    trasFlujoViejo);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ========== (e) Regresión: un borrador de ingreso/inversión nunca muestra Acciones rápidas ==========
  await page.click('#fab-add');
  await page.waitForTimeout(200);
  await page.click('[data-seg="draft-tipo"] [data-seg-val="ingreso"]');
  await page.waitForTimeout(150);
  const ingresoSinAcciones = await page.evaluate(() => !document.querySelector('#sheet-content [data-action]'));
  check('(e) Un borrador de tipo "ingreso" no muestra Acciones rápidas (misma regla que el detalle ya guardado)', ingresoSinAcciones === true);

  await page.click('[data-seg="draft-tipo"] [data-seg-val="inversion"]');
  await page.waitForTimeout(150);
  const inversionSinAcciones = await page.evaluate(() => !document.querySelector('#sheet-content [data-action]'));
  check('   tampoco un borrador de tipo "inversión"', inversionSinAcciones === true);

  await page.click('#sheet-close-btn');
  await page.waitForTimeout(150);

  // ========== (f) Un borrador abandonado no filtra estado hacia el próximo borrador nuevo ==========
  await page.click('#fab-add');
  await page.waitForTimeout(200);
  await page.fill('[data-draft-field="comercio"]', 'Borrador que se abandona');
  await page.fill('[data-draft-field="monto"]', '9000');
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Mamá"]');
  await page.waitForTimeout(150);
  // Nunca se confirma el reparto -- se cierra la hoja entera con el editor todavía abierto.
  await page.click('#sheet-close-btn');
  await page.waitForTimeout(150);

  await page.click('#fab-add');
  await page.waitForTimeout(200);
  const borradorFresco = await page.evaluate(() => ({
    estado: window.__debug.state.draftTx.estado,
    porCobrar: window.__debug.state.draftTx.porCobrar,
    shareDraftEsDelBorrador: !!(window.__debug.state.shareDraft && window.__debug.state.shareDraft.txId === '__draft__'),
    botonPorCobrarSeleccionado: document.querySelector('[data-action="porcobrar_persona"]').classList.contains('selected'),
    muestraBloqueDeReparto: !!document.querySelector('#sheet-content .split-block'),
  }));
  check('(f) Un borrador nuevo, tras abandonar uno anterior con "por cobrar" a medio armar, arranca 100% limpio',
    borradorFresco.estado === undefined && borradorFresco.porCobrar.length === 0 &&
    borradorFresco.shareDraftEsDelBorrador === false && borradorFresco.botonPorCobrarSeleccionado === false &&
    borradorFresco.muestraBloqueDeReparto === false,
    borradorFresco);

  await page.click('#sheet-close-btn');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
