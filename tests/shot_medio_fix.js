const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Simulamos una cuenta REAL recién creada: MEDIOS empieza solo con "Efectivo" (como
  // emptyAppStateBlob), no con los medios de la maqueta de ejemplo.
  const resultado = await page.evaluate(() => {
    const d = window.__debug;
    Object.keys(d.MEDIOS).forEach(k => delete d.MEDIOS[k]);
    d.MEDIOS['efectivo'] = {nombre:'Efectivo', corto:'Efectivo', icon:'cash'};

    const out = {};

    // 1) Import por correo: una regla que no pudo sacar los 4 dígitos de la tarjeta
    // (medio_sugerido llega null, como pasaba con Movired) ya NO debe caer en "Efectivo".
    out.desconocidoId = d.ensureMedioDesconocido();
    out.desconocidoNombre = d.MEDIOS[out.desconocidoId].nombre;

    // 2) Una regla que SÍ sabe que es cuenta corriente (transferencia, Racional) manda el
    // literal 'cuenta_vista' — debe crear/usar ese medio, no caer en Efectivo tampoco.
    out.cuentaVistaId = d.ensureMedioForSugerido('cuenta_vista');
    out.cuentaVistaNombre = d.MEDIOS[out.cuentaVistaId].nombre;

    // 3) Una compra con tarjeta real (con los últimos 4 dígitos) sigue creando/usando el
    // medio de esa tarjeta específica — esto no debía romperse.
    out.tarjetaId = d.ensureMedioForSugerido('****0507');
    out.tarjetaNombre = d.MEDIOS[out.tarjetaId].nombre;

    // 4) crearTxDesdeMovimiento: una cartola de TARJETA de crédito ya no debe quedar en
    // "Cuenta Vista" (como antes) — debe ir a "Medio sin identificar".
    d.state.reconciliar.tipo = 'tarjeta_nacional';
    const antesTx = d.TX.length;
    d.crearTxDesdeMovimiento({fecha:'2026-08-15', detalle:'Compra tarjeta test', comercioSugerido:'Compra tarjeta test', monto:-5000, tipoMov:'gasto'});
    const txTarjeta = d.TX[0];
    out.txTarjetaMedio = txTarjeta.medio;
    out.txTarjetaMedioNombre = d.MEDIOS[txTarjeta.medio].nombre;

    // 5) crearTxDesdeMovimiento: una cartola de CUENTA CORRIENTE sí debe ir a "Cuenta Vista".
    d.state.reconciliar.tipo = 'cuenta_corriente';
    d.crearTxDesdeMovimiento({fecha:'2026-08-16', detalle:'Movimiento cuenta test', comercioSugerido:'Movimiento cuenta test', monto:-3000, tipoMov:'gasto'});
    const txCuenta = d.TX[0];
    out.txCuentaMedio = txCuenta.medio;
    out.txCuentaMedioNombre = d.MEDIOS[txCuenta.medio].nombre;
    out.nuevasTx = d.TX.length - antesTx;

    // 6) Importar CSV de cartola: mismo chequeo — no debe quedar roto si MEDIOS no tiene
    // "cuenta_vista" todavía.
    const resCsv = d.importCartolaRows([{fecha:'2026-08-17', descripcion:'CSV test', monto:-1000}]);
    const txCsv = d.TX[0];
    out.txCsvMedio = txCsv.medio;
    out.txCsvMedioNombre = d.MEDIOS[txCsv.medio].nombre;

    return out;
  });

  check('1) Sin poder identificar la tarjeta/medio, ya NO cae en "Efectivo"', resultado.desconocidoNombre !== 'Efectivo', resultado.desconocidoNombre);
  check('2) Una transferencia (medio_sugerido="cuenta_vista") crea/usa Cuenta Vista, no Efectivo', resultado.cuentaVistaNombre === 'Cuenta Vista', resultado.cuentaVistaNombre);
  check('3) Una compra con tarjeta real (****0507) sigue creando su propio medio, no Efectivo', resultado.tarjetaNombre !== 'Efectivo' && resultado.tarjetaNombre.includes('0507'), resultado.tarjetaNombre);
  check('4) Reconciliar cartola de TARJETA ya no cae en "Cuenta Vista"', resultado.txTarjetaMedioNombre !== 'Cuenta Vista' && resultado.txTarjetaMedioNombre !== 'Efectivo', resultado.txTarjetaMedioNombre);
  check('5) Reconciliar cartola de CUENTA CORRIENTE sigue yendo a "Cuenta Vista"', resultado.txCuentaMedioNombre === 'Cuenta Vista', resultado.txCuentaMedioNombre);
  check('   Se crearon las 2 transacciones esperadas', resultado.nuevasTx === 2, resultado.nuevasTx);
  check('6) Importar CSV de cartola tampoco cae en "Efectivo"', resultado.txCsvMedioNombre === 'Cuenta Vista', resultado.txCsvMedioNombre);

  // 7) Nueva transacción manual: el medio por default ahora es el primero REAL (no un id de
  // la maqueta que no existe en una cuenta real), así el selector y lo guardado siempre calzan.
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.click('#fab-add');
  await page.waitForTimeout(150);
  const medioDefault = await page.evaluate(() => {
    const sel = document.querySelector('[data-draft-field="medio"]');
    return { estadoJS: window.__debug.state.draftTx.medio, domValue: sel ? sel.value : null };
  });
  check('7) Al crear una transacción nueva, el medio del borrador y el que se ve en el selector coinciden', medioDefault.estadoJS === medioDefault.domValue, medioDefault);

  await finish({ context, browser, errors });
})();
