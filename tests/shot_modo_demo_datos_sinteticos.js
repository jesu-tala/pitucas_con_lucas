// Modo demo: reemplazo por datos sintéticos, no ocultamiento (ver src/demo.ts).
// Antes, "modo demo" solo enmascaraba los montos reales ("$••••••") -- ahora reemplaza TODA la
// data por un set fijo y curado con números inventados que se ve completo, mientras la data
// real queda intacta en memoria (nunca se toca Supabase mientras está activo) hasta desactivarlo.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- Preparación: una cuenta real con datos propios, "logueada" ----------
  // D.TRANSACTIONS es una referencia congelada al arreglo del momento en que cargó la página --
  // cualquier setTransactions() interno posterior (enterDemoMode/exitDemoMode) la deja obsoleta
  // (bug ya documentado en otros tests de este mismo repo). Por eso, de acá en adelante, toda
  // lectura pasa por buildFullStateBlob().transacciones y toda escritura por setTransactions().
  const antes = await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-real-para-demo' };
    const actuales = D.buildFullStateBlob().transacciones;
    D.setTransactions(actuales.concat([{ id: 'real_tx_marca', fecha: D.todayISO(), hora: '08:00', comercio: 'MI TRANSACCIÓN REAL', monto: 999999, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }]));
    const txs = D.buildFullStateBlob().transacciones;
    return {
      txCount: txs.length,
      txIds: txs.map(t => t.id),
      catCount: Object.keys(D.CATEGORIES).length,
      demoMode: D.state.demoMode,
    };
  });
  check('Estado inicial: hay data real cargada (incluida nuestra marca)', antes.txIds.includes('real_tx_marca'), antes.txCount);
  check('Estado inicial: modo demo apagado', antes.demoMode === false, antes.demoMode);

  // ---------- 1) Activar demo NO modifica la data real (queda intacta en memoria) ----------
  const alActivar = await page.evaluate(() => {
    const D = window.__debug;
    D.enterDemoMode();
    // D.TRANSACTIONS queda obsoleto tras cualquier setTransactions() interno (enterDemoMode
    // reasigna el arreglo vía applyStateBlob) -- hay que releer vía buildFullStateBlob().
    const txIds = D.buildFullStateBlob().transacciones.map(t => t.id);
    return {
      demoMode: D.state.demoMode,
      sbNulled: D.sb,
      txIds,
      catCount: Object.keys(D.CATEGORIES).length,
    };
  });
  check('1) Activar demo prende state.demoMode', alActivar.demoMode === true, alActivar.demoMode);
  check('   la conexión a Supabase queda nula mientras dura el demo (bloquea escrituras/lecturas)', alActivar.sbNulled === null, alActivar.sbNulled);
  check('   la data real (nuestra marca) YA NO está visible -- fue reemplazada, no coexiste con la sintética', !alActivar.txIds.includes('real_tx_marca'), alActivar.txIds.length);
  check('   el set sintético trae categorías propias (no 0)', alActivar.catCount > 5, alActivar.catCount);

  // ---------- 2) Ninguna operación escribe a Supabase / dispara push / import / reconciliación ----------
  const bloqueos = await page.evaluate(async () => {
    const D = window.__debug;
    const saveResult = await D.writeStateToSupabase(); // debe resolver sin intentar red (sb es null)
    await D.sendTestPush();
    const notifTestResultTrasPush = D.state.notifTestResult;
    await D.enableNotifications();
    const notifSubscribedTrasEnable = D.state.notifSubscribed;
    const txCountAntesImport = D.buildFullStateBlob().transacciones.length;
    const importRes = D.importStatementRows([{ fecha: D.todayISO(), descripcion: 'Fake CSV', monto: -5000 }]);
    const txCountTrasImport = D.buildFullStateBlob().transacciones.length;
    await D.tryOpenStatementFile(new ArrayBuffer(4), 'cartola.pdf', '');
    const reconciliarCargandoTrasIntento = D.state.reconciliar.cargando;
    const toasts = Array.from(document.querySelectorAll('#toast-stack .toast span')).map(function (s) { return s.textContent; });
    return { saveResult, notifTestResultTrasPush, notifSubscribedTrasEnable, importRes, txCountAntesImport, txCountTrasImport, reconciliarCargandoTrasIntento, toasts };
  });
  check('2) writeStateToSupabase() no intenta guardar mientras sb está en null (resuelve true, sin red)', bloqueos.saveResult === true, bloqueos.saveResult);
  check('   sendTestPush() no hace nada en demo (no queda ningún resultado de prueba)', bloqueos.notifTestResultTrasPush === null, bloqueos.notifTestResultTrasPush);
  check('   enableNotifications() no suscribe nada en demo', bloqueos.notifSubscribedTrasEnable === false, bloqueos.notifSubscribedTrasEnable);
  check('   importStatementRows() no crea transacciones en demo', bloqueos.importRes.creadas === 0 && bloqueos.txCountTrasImport === bloqueos.txCountAntesImport, bloqueos);
  check('   tryOpenStatementFile() (reconciliar cartola) no arranca a cargar en demo', bloqueos.reconciliarCargandoTrasIntento === false, bloqueos.reconciliarCargandoTrasIntento);
  check('   cada intento avisa con un toast "No disponible en modo demo"', bloqueos.toasts.filter(function (t) { return /no disponible en modo demo/i.test(t); }).length >= 3, bloqueos.toasts);

  // ---------- 3) Crear/editar en demo solo afecta la copia en memoria, se descarta al salir ----------
  const conEdicion = await page.evaluate(() => {
    const D = window.__debug;
    const antesEdit = D.buildFullStateBlob().transacciones.length;
    D.setTransactions(D.buildFullStateBlob().transacciones.concat([{ id: 'demo_edicion_efimera', fecha: D.todayISO(), hora: '11:00', comercio: 'Algo que edité en el demo', monto: 1234, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }]));
    return { antesEdit, despuesEdit: D.buildFullStateBlob().transacciones.length };
  });
  check('3) Se puede agregar/editar algo mientras el demo está activo (cambia la copia en memoria)', conEdicion.despuesEdit === conEdicion.antesEdit + 1, conEdicion);

  // ---------- 4) Desactivar restaura la data real EXACTA (incluida la edición efímera descartada) ----------
  const alDesactivar = await page.evaluate(() => {
    const D = window.__debug;
    D.exitDemoMode();
    const txs = D.buildFullStateBlob().transacciones;
    return {
      demoMode: D.state.demoMode,
      txIds: txs.map(t => t.id),
      txCount: txs.length,
    };
  });
  check('4) Desactivar demo apaga state.demoMode', alDesactivar.demoMode === false, alDesactivar.demoMode);
  check('   la data real vuelve exacta (nuestra marca está de vuelta)', alDesactivar.txIds.includes('real_tx_marca'), alDesactivar.txIds.length);
  check('   la edición hecha durante el demo se descartó (no contaminó la data real)', !alDesactivar.txIds.includes('demo_edicion_efimera'), alDesactivar.txIds.includes('demo_edicion_efimera'));
  check('   el conteo de transacciones reales queda igual al de antes de activar el demo (+1 de nuestra marca)', alDesactivar.txCount === antes.txCount, { antes: antes.txCount, despues: alDesactivar.txCount });

  // ---------- 5) El set sintético cubre todas las pantallas, sin campos vacíos ni errores ----------
  const cobertura = await page.evaluate(() => {
    const D = window.__debug;
    D.enterDemoMode();
    D.state.tab = 'transacciones'; D.render();
    const nTx = document.querySelectorAll('.tx-item').length;
    D.state.tab = 'resumen'; D.state.summarySub = 'balance'; D.state.balancePeriodo = 'mes'; D.render();
    const legendRowsMes = document.querySelectorAll('#resumen-content .legend-row').length;
    D.state.balancePeriodo = 'año'; D.render();
    const legendRowsAnio = document.querySelectorAll('#resumen-content .legend-row').length;
    D.state.summarySub = 'inversiones'; D.render();
    const nPlatforms = document.querySelectorAll('#resumen-content .platform-group').length;
    D.state.tab = 'grupos'; D.render();
    const nGroups = document.querySelectorAll('.menu-list-item[data-group-open]').length;
    D.exitDemoMode();
    return { nTx, legendRowsMes, legendRowsAnio, nPlatforms, nGroups };
  });
  check('5) La pestaña Transacciones muestra movimientos en el demo', cobertura.nTx > 0, cobertura.nTx);
  check('   Balance (mes) muestra categorías en el donut', cobertura.legendRowsMes > 0, cobertura.legendRowsMes);
  check('   Balance (año) muestra categorías en el donut', cobertura.legendRowsAnio > 0, cobertura.legendRowsAnio);
  check('   Inversiones muestra al menos una plataforma', cobertura.nPlatforms > 0, cobertura.nPlatforms);
  check('   Grupos muestra al menos un grupo de ejemplo', cobertura.nGroups > 0, cobertura.nGroups);

  // ---------- 6) Las fechas del set caen en el mes/año actuales ----------
  const fechas = await page.evaluate(() => {
    const D = window.__debug;
    D.enterDemoMode();
    const hoy = D.todayISO();
    const mesActual = hoy.slice(0, 7);
    const anioActual = hoy.slice(0, 4);
    const txs = D.buildFullStateBlob().transacciones;
    const hayDelMesActual = txs.some(function (t) { return t.fecha.slice(0, 7) === mesActual; });
    const hayDelAnioActual = txs.some(function (t) { return t.fecha.slice(0, 4) === anioActual; });
    const monthsIncluyeActual = D.MONTHS.includes(mesActual);
    D.exitDemoMode();
    return { hayDelMesActual, hayDelAnioActual, monthsIncluyeActual };
  });
  check('6) Hay transacciones sintéticas en el mes actual', fechas.hayDelMesActual, fechas);
  check('   y en el año actual', fechas.hayDelAnioActual, fechas);
  check('   MONTHS incluye el mes actual (Balance por mes tiene selector con datos)', fechas.monthsIncluyeActual, fechas);

  await finish({ context, browser, errors });
})();
