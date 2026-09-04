const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Simulate a REAL freshly-created account: PAYMENT_METHODS starts with only "Efectivo" (as in
  // emptyAppStateBlob), not with the sample mockup's payment methods.
  const resultado = await page.evaluate(() => {
    const d = window.__debug;
    Object.keys(d.PAYMENT_METHODS).forEach(k => delete d.PAYMENT_METHODS[k]);
    d.PAYMENT_METHODS['efectivo'] = {nombre:'Efectivo', corto:'Efectivo', icon:'cash'};

    const out = {};

    // 1) Email import: a rule that couldn't extract the card's 4 digits
    // (medio_sugerido arrives null, as used to happen with Movired) must NO LONGER fall back to "Efectivo".
    out.desconocidoId = d.ensureUnknownPaymentMethod();
    out.desconocidoNombre = d.PAYMENT_METHODS[out.desconocidoId].nombre;

    // 2) A rule that DOES know it's a checking account (transfer, Racional) sends the
    // literal 'cuenta_vista' — it must create/use that payment method, not fall back to Efectivo either.
    out.cuentaVistaId = d.ensurePaymentMethodForSuggestion('cuenta_vista');
    out.cuentaVistaNombre = d.PAYMENT_METHODS[out.cuentaVistaId].nombre;

    // 3) A purchase with a real card (with the last 4 digits) still creates/uses the
    // payment method for that specific card — this should not have broken.
    out.tarjetaId = d.ensurePaymentMethodForSuggestion('****0507');
    out.tarjetaNombre = d.PAYMENT_METHODS[out.tarjetaId].nombre;

    // 4) createTxFromMovement: a credit CARD statement must no longer end up in
    // "Cuenta Vista" (as it used to) — it should go to "PaymentMethod sin identificar".
    d.state.reconciliar.tipo = 'tarjeta_nacional';
    const antesTx = d.TRANSACTIONS.length;
    d.createTxFromMovement({fecha:'2026-08-15', detalle:'Compra tarjeta test', comercioSugerido:'Compra tarjeta test', monto:-5000, tipoMov:'gasto'});
    const txTarjeta = d.TRANSACTIONS[0];
    out.txTarjetaMedio = txTarjeta.medio;
    out.txTarjetaMedioNombre = d.PAYMENT_METHODS[txTarjeta.medio].nombre;

    // 5) createTxFromMovement: a CHECKING ACCOUNT statement should indeed go to "Cuenta Vista".
    d.state.reconciliar.tipo = 'cuenta_corriente';
    d.createTxFromMovement({fecha:'2026-08-16', detalle:'Movimiento cuenta test', comercioSugerido:'Movimiento cuenta test', monto:-3000, tipoMov:'gasto'});
    const txCuenta = d.TRANSACTIONS[0];
    out.txCuentaMedio = txCuenta.medio;
    out.txCuentaMedioNombre = d.PAYMENT_METHODS[txCuenta.medio].nombre;
    out.nuevasTx = d.TRANSACTIONS.length - antesTx;

    // 6) Importing a statement CSV: same check — it must not break if PAYMENT_METHODS doesn't have
    // "cuenta_vista" yet.
    const resCsv = d.importStatementRows([{fecha:'2026-08-17', descripcion:'CSV test', monto:-1000}]);
    const txCsv = d.TRANSACTIONS[0];
    out.txCsvMedio = txCsv.medio;
    out.txCsvMedioNombre = d.PAYMENT_METHODS[txCsv.medio].nombre;

    return out;
  });

  check('1) Sin poder identificar la tarjeta/medio, ya NO cae en "Efectivo"', resultado.desconocidoNombre !== 'Efectivo', resultado.desconocidoNombre);
  check('2) Una transferencia (medio_sugerido="cuenta_vista") crea/usa Cuenta Vista, no Efectivo', resultado.cuentaVistaNombre === 'Cuenta Vista', resultado.cuentaVistaNombre);
  check('3) Una compra con tarjeta real (****0507) sigue creando su propio medio, no Efectivo', resultado.tarjetaNombre !== 'Efectivo' && resultado.tarjetaNombre.includes('0507'), resultado.tarjetaNombre);
  check('4) Reconciliar cartola de TARJETA ya no cae en "Cuenta Vista"', resultado.txTarjetaMedioNombre !== 'Cuenta Vista' && resultado.txTarjetaMedioNombre !== 'Efectivo', resultado.txTarjetaMedioNombre);
  check('5) Reconciliar cartola de CUENTA CORRIENTE sigue yendo a "Cuenta Vista"', resultado.txCuentaMedioNombre === 'Cuenta Vista', resultado.txCuentaMedioNombre);
  check('   Se crearon las 2 transacciones esperadas', resultado.nuevasTx === 2, resultado.nuevasTx);
  check('6) Importar CSV de cartola tampoco cae en "Efectivo"', resultado.txCsvMedioNombre === 'Cuenta Vista', resultado.txCsvMedioNombre);

  // 7) New manual transaction: the default payment method is now the first REAL one (not a
  // mockup id that doesn't exist in a real account), so the selector and the saved value always match.
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
