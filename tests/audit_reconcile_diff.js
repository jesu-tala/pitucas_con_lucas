// Automatic reconciliation diff engine (src/reconcile.ts) -- same spirit as
// audit_gastos_compartidos.js: build small scenarios by hand (no real PDF needed, the parsing
// itself is already covered by shot_reconciliar.js) and check buildReconcileDiff/matchConfidence
// against what's expected, asserting the non-negotiable rules directly at the data-model level:
//
//   1) A manual transaction (or one with no `origen` at all -- legacy/fixture data) is NEVER
//      proposed for deletion, even when a statement line would otherwise "match" it as voided or
//      simply doesn't back it at all.
//   2) Idempotency: reconciling the exact same statement twice never proposes "agregar" again for
//      a line that was already turned into a transaction, and that new transaction isn't somehow
//      re-flagged as "missing" against itself on the second pass.
//   3) The three confidence levels (alta/media/baja) behave as designed -- only alta/media are
//      "clean" matches, baja always lands in "revisar", never auto-actionable.
//   4) Card installments: a statement line for one month's cuota correctly matches the
//      regenerateInstallmentsFor-generated row for THAT month, without flagging the purchase's
//      other months (root or other projected cuotas, outside this statement's own period) as
//      missing or unbacked.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const out = {};

    /* ---------- 0) matchConfidence unit-level coverage (alta/media/baja/null) ---------- */
    const txBase = { id:'x', fecha:'2026-05-10', hora:'10:00', comercio:'Jumbo Ñuñoa', monto:45000, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'' };
    out.confAlta = D.matchConfidence({fecha:'2026-05-11', detalle:'JUMBO NUNOA', comercioSugerido:'Jumbo Ñuñoa', monto:-45000, tipoMov:'gasto'}, txBase);
    out.confMediaComercioDistinto = D.matchConfidence({fecha:'2026-05-10', detalle:'COMPRA TRANSBANK *8842', comercioSugerido:'Compra Transbank *8842', monto:-45000, tipoMov:'gasto'}, txBase);
    out.confBajaMontoRedondeo = D.matchConfidence({fecha:'2026-05-10', detalle:'JUMBO NUNOA', comercioSugerido:'Jumbo Ñuñoa', monto:-44999, tipoMov:'gasto'}, txBase);
    out.confBajaFechaLejana = D.matchConfidence({fecha:'2026-05-14', detalle:'JUMBO NUNOA', comercioSugerido:'Jumbo Ñuñoa', monto:-45000, tipoMov:'gasto'}, txBase);
    out.confNullMontoMuyDistinto = D.matchConfidence({fecha:'2026-05-10', detalle:'JUMBO NUNOA', comercioSugerido:'Jumbo Ñuñoa', monto:-90000, tipoMov:'gasto'}, txBase);
    out.confNullTipoDistinto = D.matchConfidence({fecha:'2026-05-10', detalle:'JUMBO NUNOA', comercioSugerido:'Jumbo Ñuñoa', monto:45000, tipoMov:'ingreso'}, txBase);

    /* ---------- 0b) origin protection helpers, directly ---------- */
    out.autoMailIsAutomatic = D.isAutomaticOrigin({ origen:'auto-mail' });
    out.autoCartolaIsAutomatic = D.isAutomaticOrigin({ origen:'auto-cartola' });
    out.manualIsProtected = D.isProtectedOrigin({ origen:'manual' });
    out.undefinedOrigenIsProtected = D.isProtectedOrigin({}); // legacy/fixture data, no `origen` at all
    out.autoMailIsNotProtected = D.isProtectedOrigin({ origen:'auto-mail' });

    /* ---------- 1) full diff: manual protection + baja/revisar + eliminarPropuesto ---------- */
    D.TRANSACTIONS.length = 0; // this scenario only looks at the fixtures below, not the demo data
    D.TRANSACTIONS.push(
      // Manual, and the statement shows it "anulada" (voided) -- MUST end up in
      // manualesIgnoradas, MUST NEVER end up in eliminarPropuesto.
      { id:'m-anulado', fecha:'2026-05-10', hora:'10:00', comercio:'Falabella', monto:50000, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'', origen:'manual' },
      // Manual, nothing in the statement backs it at all -- same rule, informational only.
      { id:'m-unbacked', fecha:'2026-05-12', hora:'10:00', comercio:'Compra Personal', monto:15000, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'', origen:'manual' },
      // auto-cartola, nothing backs it -- THIS one is allowed to reach eliminarPropuesto.
      { id:'a-unbacked', fecha:'2026-05-11', hora:'10:00', comercio:'Suscripcion Fantasma', monto:9990, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'', origen:'auto-cartola' },
      // auto-mail, cleanly backed by a statement line -- must not appear anywhere in the diff.
      { id:'a-backed', fecha:'2026-05-13', hora:'10:00', comercio:'Netflix', monto:7990, medio:'visa_bch', tipo:'gasto', recurrencia:'mensual', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'', origen:'auto-mail' },
      // No `origen` at all (pre-dates this field, like the state.ts fixture data) -- must be
      // treated exactly like 'manual': protected, informational only.
      { id:'legacy-unbacked', fecha:'2026-05-14', hora:'10:00', comercio:'Cosa Vieja', monto:5000, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'' },
      // auto-cartola, only a WEAK ("baja") candidate on the statement -- ambiguous, must be left
      // alone entirely (neither eliminarPropuesto nor manualesIgnoradas), the movement instead
      // surfaces in "revisar".
      { id:'baja-cand', fecha:'2026-05-09', hora:'10:00', comercio:'Copec', monto:20000, medio:'visa_bch', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'', origen:'auto-cartola' }
    );
    const movimientos1 = [
      { fecha:'2026-05-10', detalle:'FALABELLA ANULACION COMPRA', comercioSugerido:'Falabella (anulado)', monto:-50000, tipoMov:'gasto', esEspecial:null },
      { fecha:'2026-05-13', detalle:'NETFLIX.COM', comercioSugerido:'Netflix.com', monto:-7990, tipoMov:'gasto', esEspecial:null },
      { fecha:'2026-05-15', detalle:'UBER TRIP', comercioSugerido:'Uber', monto:-6200, tipoMov:'gasto', esEspecial:null },
      { fecha:'2026-05-11', detalle:'COPEC LAS CONDES', comercioSugerido:'Copec Las Condes', monto:-19999, tipoMov:'gasto', esEspecial:null }
    ];
    const diff1 = D.buildReconcileDiff(movimientos1, 'tarjeta_nacional');
    out.diff1 = {
      agregarIds: diff1.agregar.map(i => i.movimiento.comercioSugerido),
      agregarConfianzas: diff1.agregar.map(i => i.confianza),
      eliminarIds: diff1.eliminarPropuesto.map(i => i.tx.id),
      eliminarOrigenesTodosAutomaticos: diff1.eliminarPropuesto.every(i => D.isAutomaticOrigin(i.tx)),
      revisarConfianzas: diff1.revisar.map(i => i.confianza),
      revisarCandidatoIds: diff1.revisar.map(i => i.candidatos.map(t => t.id)),
      manualesIds: diff1.manualesIgnoradas.map(i => i.tx.id).sort(),
      manualAnuladoMotivo: (diff1.manualesIgnoradas.find(i => i.tx.id==='m-anulado') || {}).motivo
    };

    /* ---------- 2) idempotency ---------- */
    D.TRANSACTIONS.length = 0;
    D.state.reconciliar.tipo = 'cuenta_corriente'; // createTxFromMovement picks the medio from this
    const movIdemp = { fecha:'2026-04-05', detalle:'JUMBO NUNOA', comercioSugerido:'Jumbo Ñuñoa', monto:-45000, tipoMov:'gasto', esEspecial:null };
    movIdemp.fuenteLineaId = D.movementLineId(movIdemp, 0);
    const diffPass1 = D.buildReconcileDiff([movIdemp], 'cuenta_corriente');
    out.idempPass1AgregarLen = diffPass1.agregar.length;
    out.idempPass1Confianza = diffPass1.agregar.length ? diffPass1.agregar[0].confianza : null;

    D.createTxFromMovement(movIdemp); // simulates confirming the "agregar" (bulk or single)
    const nuevaTx = D.TRANSACTIONS.find(t => t.fuenteLineaId === movIdemp.fuenteLineaId);
    out.idempNuevaTxOrigen = nuevaTx ? nuevaTx.origen : null;

    const diffPass2 = D.buildReconcileDiff([movIdemp], 'cuenta_corriente');
    out.idempPass2AgregarLen = diffPass2.agregar.length;
    out.idempPass2EliminarLen = diffPass2.eliminarPropuesto.length; // the just-created tx must not be flagged as missing against itself
    out.idempPass2RevisarLen = diffPass2.revisar.length;

    /* ---------- 3) card installments (cuotas) ---------- */
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({
      id:'cuota-root', fecha:'2026-06-10', hora:'12:00', comercio:'Sodimac', monto:30000, medio:'visa_bch',
      tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[], porCobrar:[], reglaAuto:false, nota:'',
      cuotas:{total:3}, origen:'auto-mail'
    });
    D.regenerateInstallmentsFor('cuota-root'); // generates cuota-root-c2 (July) and cuota-root-c3 (August)
    // A card statement for JULY only -- shows just that month's installment charge.
    const movimientosCuota = [
      { fecha:'2026-07-10', detalle:'SODIMAC CUOTA 02/03', comercioSugerido:'Sodimac Cuota 02/03', monto:-30000, tipoMov:'gasto', esEspecial:null }
    ];
    const diffCuota = D.buildReconcileDiff(movimientosCuota, 'tarjeta_nacional');
    out.cuota = {
      agregarLen: diffCuota.agregar.length,       // 0: July's cuota is already the c2 row, not "missing"
      eliminarLen: diffCuota.eliminarPropuesto.length, // 0: c2 is backed; root (June) and c3 (August) are outside this statement's period
      manualesLen: diffCuota.manualesIgnoradas.length,
      revisarLen: diffCuota.revisar.length,
      matchC2Directo: D.matchConfidence(movimientosCuota[0], { id:'cuota-root-c2', fecha:'2026-07-10', monto:30000, tipo:'gasto', comercio:'Sodimac' })
    };

    return out;
  });

  /* ---------- 0) matchConfidence ---------- */
  check('matchConfidence: mismo monto+fecha cercana+comercio parecido -> alta', resultado.confAlta==='alta', resultado.confAlta);
  check('matchConfidence: mismo monto+fecha exacta, comercio no calza -> media', resultado.confMediaComercioDistinto==='media', resultado.confMediaComercioDistinto);
  check('matchConfidence: monto redondeado (1 peso) -> baja', resultado.confBajaMontoRedondeo==='baja', resultado.confBajaMontoRedondeo);
  check('matchConfidence: fecha más lejana (4 días) con monto exacto -> baja', resultado.confBajaFechaLejana==='baja', resultado.confBajaFechaLejana);
  check('matchConfidence: monto muy distinto -> null (nada)', resultado.confNullMontoMuyDistinto===null, resultado.confNullMontoMuyDistinto);
  check('matchConfidence: tipo distinto (gasto vs ingreso) -> null', resultado.confNullTipoDistinto===null, resultado.confNullTipoDistinto);

  /* ---------- 0b) origin protection ---------- */
  check('isAutomaticOrigin(auto-mail) === true', resultado.autoMailIsAutomatic===true);
  check('isAutomaticOrigin(auto-cartola) === true', resultado.autoCartolaIsAutomatic===true);
  check('isProtectedOrigin(manual) === true', resultado.manualIsProtected===true);
  check('isProtectedOrigin(sin origen) === true (dato legacy/fixture, protegido igual que manual)', resultado.undefinedOrigenIsProtected===true);
  check('isProtectedOrigin(auto-mail) === false', resultado.autoMailIsNotProtected===false);

  /* ---------- 1) full diff ---------- */
  const d1 = resultado.diff1;
  check('diff: "Uber" (nada la respalda) queda en agregar, confianza alta', d1.agregarIds.includes('Uber') && d1.agregarConfianzas[d1.agregarIds.indexOf('Uber')]==='alta', d1);
  check('diff: solo 1 item en agregar (Netflix/Falabella ya calzan, Copec es "revisar")', d1.agregarIds.length===1, d1);
  check('diff: "a-unbacked" (auto-cartola, sin respaldo) SÍ queda en eliminarPropuesto', d1.eliminarIds.includes('a-unbacked'), d1);
  check('diff: eliminarPropuesto NUNCA contiene m-anulado/m-unbacked/legacy/baja-cand (protegidas o ambiguas)', !d1.eliminarIds.some(id => ['m-anulado','m-unbacked','legacy-unbacked','baja-cand'].includes(id)), d1);
  check('diff: TODO lo que llega a eliminarPropuesto tiene origen automático', d1.eliminarOrigenesTodosAutomaticos===true, d1);
  check('diff: eliminarPropuesto tiene exactamente 1 ítem (a-unbacked)', d1.eliminarIds.length===1, d1);
  check('diff: "Copec Las Condes" (monto -1 peso, confianza baja) queda en revisar, no en agregar ni eliminar', d1.revisarConfianzas.length===1 && d1.revisarConfianzas[0]==='baja', d1);
  check('diff: el candidato de "revisar" para Copec es baja-cand', JSON.stringify(d1.revisarCandidatoIds)===JSON.stringify([['baja-cand']]), d1);
  check('diff: manualesIgnoradas contiene m-anulado, m-unbacked y legacy-unbacked (y solo esas)', JSON.stringify(d1.manualesIds)===JSON.stringify(['legacy-unbacked','m-anulado','m-unbacked']), d1);
  check('diff: el motivo de m-anulado menciona que la cartola la muestra anulada', /anulad/i.test(d1.manualAnuladoMotivo||''), d1.manualAnuladoMotivo);

  /* ---------- 2) idempotency ---------- */
  check('idempotencia: 1ra pasada propone agregar la línea (confianza alta)', resultado.idempPass1AgregarLen===1 && resultado.idempPass1Confianza==='alta', resultado);
  check('idempotencia: la transacción creada queda con origen auto-cartola', resultado.idempNuevaTxOrigen==='auto-cartola', resultado.idempNuevaTxOrigen);
  check('idempotencia: 2da pasada de LA MISMA cartola no vuelve a proponer agregar esa línea', resultado.idempPass2AgregarLen===0, resultado);
  check('idempotencia: la transacción recién creada tampoco queda marcada para eliminar contra sí misma', resultado.idempPass2EliminarLen===0, resultado);
  check('idempotencia: tampoco queda en revisar', resultado.idempPass2RevisarLen===0, resultado);

  /* ---------- 3) cuotas ---------- */
  check('cuotas: la cuota de julio ya generada por regenerateInstallmentsFor calza en alta con la línea de julio', resultado.cuota.matchC2Directo==='alta', resultado.cuota);
  check('cuotas: no propone "agregar" la cuota de julio (ya existe como fila proyectada)', resultado.cuota.agregarLen===0, resultado.cuota);
  check('cuotas: no propone eliminar nada (la cuota de julio está respaldada; la raíz de junio y la cuota de agosto quedan fuera del período de ESTA cartola)', resultado.cuota.eliminarLen===0, resultado.cuota);
  check('cuotas: no hay nada para revisar ni manuales de por medio', resultado.cuota.revisarLen===0 && resultado.cuota.manualesLen===0, resultado.cuota);

  await finish({ context, browser, errors });
})();
