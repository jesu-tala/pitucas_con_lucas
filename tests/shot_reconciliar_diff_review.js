// UI for the automatic-reconciliation review screen added to "Reconciliar con la cartola"
// (see renderReconcileDiffSection in views/menu.ts, and reconcile.ts for the underlying diff).
// This is ADDITIVE to the existing movement-by-movement list (kept as-is on purpose, still
// covered by shot_reconciliar.js/shot_reconciliar_agregar_ya_registrada.js/
// shot_reconciliar_no_es_gasto.js) -- this test only covers the new section: the bulk
// "Agregar las de confianza alta" button, the checkbox + "Eliminar seleccionadas" flow for
// eliminarPropuesto (per-item confirmation, never a single bulk-delete-everything button), and
// that a manual transaction shows up as informational-only, never with a delete checkbox.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(150);

  const antes = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      // auto-cartola, nothing on the statement backs it -- must show up with a delete checkbox.
      { id:'auto-del', fecha:'2026-05-20', hora:'10:00', comercio:'Suscripcion X', monto:5000, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'', origen:'auto-cartola' },
      // manual -- must show up ONLY informationally, never with a delete checkbox.
      { id:'manual-keep', fecha:'2026-05-20', hora:'10:00', comercio:'Compra Manual', monto:8000, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'', origen:'manual' }
    );
    D.state.reconciliar.archivo = 'cartola_test.pdf';
    D.state.reconciliar.tipo = 'tarjeta_nacional';
    D.state.reconciliar.movimientos = [
      { fecha:'2026-05-20', detalle:'UBER TRIP', comercioSugerido:'Uber', monto:-6200, tipoMov:'gasto', esEspecial:null, __match:null }
    ];
    D.state.reconciliar.eliminarSeleccionados = [];
    D.render();
    return { txCount: D.TRANSACTIONS.length };
  });
  await page.waitForTimeout(150);
  check('Fixture cargada: 2 transacciones antes de reconciliar', antes.txCount===2, antes);

  const estadoInicial = await page.evaluate(() => ({
    tituloSeccion: !!document.querySelector('.section-title'),
    botonAltas: document.querySelector('[data-reconcile-diff-add-altas]') ? document.querySelector('[data-reconcile-diff-add-altas]').textContent : null,
    checkboxElim: document.querySelector('[data-reconcile-diff-elim-check="auto-del"]') !== null,
    botonConfirmarDisabled: document.querySelector('[data-reconcile-diff-elim-confirmar]') ? document.querySelector('[data-reconcile-diff-elim-confirmar]').disabled : null,
    manualEnCheckbox: document.querySelector('[data-reconcile-diff-elim-check="manual-keep"]') !== null,
    manualTexto: document.body.textContent.includes('Compra Manual'),
  }));
  check('Aparece la sección "Revisión automática"', estadoInicial.tituloSeccion, estadoInicial);
  check('El botón de agregar confianza alta menciona "Uber" está pendiente (1 de confianza alta)', /1/.test(estadoInicial.botonAltas||''), estadoInicial);
  check('La transacción automática sin respaldo (auto-del) tiene checkbox para eliminar', estadoInicial.checkboxElim, estadoInicial);
  check('El botón "Eliminar seleccionadas" arranca deshabilitado (nada marcado todavía)', estadoInicial.botonConfirmarDisabled===true, estadoInicial);
  check('La transacción MANUAL (manual-keep) NUNCA tiene checkbox de eliminar', estadoInicial.manualEnCheckbox===false, estadoInicial);
  check('La transacción manual sí aparece listada (informativo, "no se tocan")', estadoInicial.manualTexto, estadoInicial);

  // ---- Bulk "Agregar las de confianza alta" ----
  await page.click('[data-reconcile-diff-add-altas]');
  await page.waitForTimeout(200);
  const trasAgregar = await page.evaluate(() => {
    const D = window.__debug;
    const diff = D.buildReconcileDiff(D.state.reconciliar.movimientos, D.state.reconciliar.tipo);
    return { agregarLen: diff.agregar.length, botonAltasSigue: document.querySelector('[data-reconcile-diff-add-altas]') !== null };
  });
  check('Tras agregar las de confianza alta, ya no queda nada pendiente de agregar', trasAgregar.agregarLen===0, trasAgregar);
  check('El botón de agregar altas desaparece (nada más que agregar en confianza alta)', trasAgregar.botonAltasSigue===false, trasAgregar);

  // ---- Per-item confirmation for "Posibles a eliminar" ----
  await page.click('[data-reconcile-diff-elim-check="auto-del"]');
  await page.waitForTimeout(150);
  const trasCheck = await page.evaluate(() => ({
    checked: document.querySelector('[data-reconcile-diff-elim-check="auto-del"]').checked,
    botonHabilitado: !document.querySelector('[data-reconcile-diff-elim-confirmar]').disabled,
    botonTexto: document.querySelector('[data-reconcile-diff-elim-confirmar]').textContent,
  }));
  check('Marcar el checkbox lo deja marcado y habilita "Eliminar seleccionadas"', trasCheck.checked && trasCheck.botonHabilitado, trasCheck);
  check('El botón muestra la cuenta (1)', /1/.test(trasCheck.botonTexto), trasCheck);

  await page.click('[data-reconcile-diff-elim-confirmar]');
  await page.waitForTimeout(200);
  const trasEliminar = await page.evaluate(() => {
    const D = window.__debug;
    // setTransactions() reassigns TRANSACTIONS -- window.__debug.TRANSACTIONS (captured once at
    // load) goes stale after that, same caveat documented in shot_tx_delete.js. buildReconcileDiff
    // reads the real live TRANSACTIONS internally though, so it's a reliable way to confirm the
    // deletion actually happened, without relying on the stale snapshot.
    const diff = D.buildReconcileDiff(D.state.reconciliar.movimientos, D.state.reconciliar.tipo);
    return {
      eliminarLen: diff.eliminarPropuesto.length,
      filaSigueEnDom: !!document.querySelector('[data-reconcile-diff-elim-check="auto-del"]'),
      manualTodaviaListada: document.body.textContent.includes('Compra Manual'),
    };
  });
  check('Tras confirmar, "auto-del" ya no está entre las propuestas de eliminar (fue eliminada de verdad)', trasEliminar.eliminarLen===0, trasEliminar);
  check('Su fila/checkbox desaparece de la pantalla', trasEliminar.filaSigueEnDom===false, trasEliminar);
  check('La transacción manual sigue intacta y listada (nunca se tocó)', trasEliminar.manualTodaviaListada===true, trasEliminar);

  await finish({ context, browser, errors });
})();
