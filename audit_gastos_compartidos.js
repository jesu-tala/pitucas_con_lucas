// Motor de balances de gastos compartidos + derivación de "mi parte" + mapeo aprendido.
// Igual que audit_consistency.js: recalcula "la verdad" a mano desde los datos crudos de
// prueba y la compara contra lo que las funciones puras (saldoGrupo, transferenciasSugeridas,
// sincronizarGastosCompartidos) realmente devuelven — así se atrapa cualquier discrepancia,
// no solo "no crasheó".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;

    // ---- Fixture: un grupo "Depto" con 3 participantes ----
    // p1 = yo (currentUser), p2 = Fran (tiene cuenta), p3 = Pancho (sin cuenta).
    D.currentUser = { id: 'user-jesu' };
    D.GRUPOS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GRUPO_PARTICIPANTES = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' },
      { id: 'p3', grupo_id: 'g1', user_id: null, nombre: 'Pancho', color: 'peach' }
    ];
    D.GASTOS_COMPARTIDOS = [
      // Pagué yo, registré yo -- mi parte va en MI transacción real (porCobrar), no acá.
      { id: 'gc1', grupo_id: 'g1', descripcion: 'Arriendo', categoria_origen: null, monto: 300000,
        fecha: '2026-08-05', pagado_por: 'p1', registrado_por: 'user-jesu', division_tipo: 'iguales',
        tx_origen_id: 'tx-arriendo', reparto: [{ id:'r1', gasto_compartido_id:'gc1', participante_id:'p1', monto:100000 },
          { id:'r2', gasto_compartido_id:'gc1', participante_id:'p2', monto:100000 },
          { id:'r3', gasto_compartido_id:'gc1', participante_id:'p3', monto:100000 }] },
      // Pagó y registró Fran -- me toca una parte sin categoría todavía (categoria_origen 'Comida').
      { id: 'gc2', grupo_id: 'g1', descripcion: 'Supermercado', categoria_origen: 'Comida', monto: 60000,
        fecha: '2026-08-10', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
        tx_origen_id: 'tx-fran-1', reparto: [{ id:'r4', gasto_compartido_id:'gc2', participante_id:'p1', monto:20000 },
          { id:'r5', gasto_compartido_id:'gc2', participante_id:'p2', monto:20000 },
          { id:'r6', gasto_compartido_id:'gc2', participante_id:'p3', monto:20000 }] },
      // Pagó Pancho (sin cuenta) pero LO REGISTRÉ YO -- mi propia parte igual me llega como
      // entrada derivada (no porque yo haya pagado, sino porque el que pagó fue Pancho).
      { id: 'gc3', grupo_id: 'g1', descripcion: 'Bencina', categoria_origen: 'Transporte', monto: 30000,
        fecha: '2026-08-12', pagado_por: 'p3', registrado_por: 'user-jesu', division_tipo: 'iguales',
        tx_origen_id: 'tx-jesu-2', reparto: [{ id:'r7', gasto_compartido_id:'gc3', participante_id:'p1', monto:10000 },
          { id:'r8', gasto_compartido_id:'gc3', participante_id:'p2', monto:10000 },
          { id:'r9', gasto_compartido_id:'gc3', participante_id:'p3', monto:10000 }] }
    ];
    D.MAPEO_CATEGORIAS = [];
    D.SALDOS_PAGADOS = [];

    D.TX.length = 0; // esta prueba solo mira gastos compartidos, no la data de demo

    D.sincronizarGastosCompartidos();
    const trasSync1 = D.TX.map(t => ({
      id: t.id, monto: t.monto, estado: t.estado, gastoCompartidoId: t.gastoCompartidoId,
      categoriaOrigenSugerida: t.categoriaOrigenSugerida, categorias: t.categorias
    }));

    // ---- Motor de balances (sin saldos pagados todavía) ----
    const saldo1 = D.saldoGrupo('g1');
    const transf1 = D.transferenciasSugeridas('g1');

    // ---- Neteo con un saldo ya pagado (Pancho le pagó $50.000 a Yo) -- mismos 3 gastos ----
    D.SALDOS_PAGADOS = [{ id:'s1', grupo_id:'g1', de_participante:'p3', a_participante:'p1', monto:50000, fecha:'2026-08-15' }];
    const saldo2 = D.saldoGrupo('g1');
    const transf2 = D.transferenciasSugeridas('g1');

    // ---- Mapeo aprendido: clasifico "a mano" la entrada derivada de gc2 (Fran, 'Comida') ----
    const txGc2 = D.TX.find(t => t.gastoCompartidoId === 'gc2');
    D.clasificarGastoCompartidoAjeno(txGc2.id, 'supermercado');
    const mapeoTrasClasificar = D.MAPEO_CATEGORIAS.slice();
    const txGc2Despues = D.TX.find(t => t.gastoCompartidoId === 'gc2');

    // Un gasto NUEVO de Fran, misma categoría de origen 'Comida' -- debería clasificarse solo.
    D.GASTOS_COMPARTIDOS.push({
      id: 'gc4', grupo_id: 'g1', descripcion: 'Jumbo', categoria_origen: 'Comida', monto: 40000,
      fecha: '2026-08-20', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
      tx_origen_id: 'tx-fran-2', reparto: [{ id:'r10', gasto_compartido_id:'gc4', participante_id:'p1', monto:15000 },
        { id:'r11', gasto_compartido_id:'gc4', participante_id:'p2', monto:15000 },
        { id:'r12', gasto_compartido_id:'gc4', participante_id:'p3', monto:10000 }]
    });
    D.sincronizarGastosCompartidos();
    const txGc4 = D.TX.find(t => t.gastoCompartidoId === 'gc4');
    // gc2 también se reconstruyó en este resync -- confirma que el mapeo aprendido "pega" de
    // nuevo desde MAPEO_CATEGORIAS, no solo por la edición manual de más arriba.
    const txGc2TrasResync = D.TX.find(t => t.gastoCompartidoId === 'gc2');

    // ---- No doble conteo: el total de gasto del mes debe ser exactamente lo ya clasificado ----
    const mesTotales = D.monthTotals('2026-08');

    return { trasSync1, saldo1, transf1, saldo2, transf2, mapeoTrasClasificar, txGc2Despues, txGc4, txGc2TrasResync, mesTotales };
  });

  console.log('=== GASTOS COMPARTIDOS: RESULTADO ===');
  console.log(JSON.stringify(resultado, null, 1));

  // ---------- Derivación "mi parte" (compartidoAjeno) ----------
  check('gc1 (pagué y registré yo) NO genera entrada derivada',
    !resultado.trasSync1.some(t => t.gastoCompartidoId === 'gc1'));
  const gc2Tx = resultado.trasSync1.find(t => t.gastoCompartidoId === 'gc2');
  check('gc2 (pagó Fran) SÍ genera mi entrada derivada, por $20.000', !!gc2Tx && gc2Tx.monto === 20000);
  check('gc2 sin mapeo previo queda pendiente con la sugerencia "Comida"',
    !!gc2Tx && gc2Tx.estado === 'pendiente' && gc2Tx.categoriaOrigenSugerida === 'Comida');
  const gc3Tx = resultado.trasSync1.find(t => t.gastoCompartidoId === 'gc3');
  check('gc3 (pagó Pancho, la registré yo) también genera mi entrada derivada, por $10.000',
    !!gc3Tx && gc3Tx.monto === 10000);

  // ---------- Motor de balances (sin saldos pagados) ----------
  const s1 = id => resultado.saldo1.find(s => s.participanteId === id);
  check('saldo de Yo (p1) antes de saldar: +170.000 (le deben)', s1('p1').saldo === 170000, s1('p1'));
  check('saldo de Fran (p2) antes de saldar: -70.000 (debe)', s1('p2').saldo === -70000, s1('p2'));
  check('saldo de Pancho (p3) antes de saldar: -100.000 (debe)', s1('p3').saldo === -100000, s1('p3'));
  check('los 3 saldos del grupo suman $0 (neteo consistente)',
    resultado.saldo1.reduce((s, x) => s + x.saldo, 0) === 0);

  check('transferencias sugeridas (2, la mínima posible): Pancho y Fran le pagan a Yo',
    resultado.transf1.length === 2 &&
    resultado.transf1.some(t => t.de === 'p3' && t.a === 'p1' && t.monto === 100000) &&
    resultado.transf1.some(t => t.de === 'p2' && t.a === 'p1' && t.monto === 70000),
    resultado.transf1);

  // ---------- Mapeo aprendido ----------
  check('clasificar a mano escribe el mapeo (de Fran, "Comida" -> supermercado)',
    resultado.mapeoTrasClasificar.length === 1 &&
    resultado.mapeoTrasClasificar[0].de_participante === 'p2' &&
    resultado.mapeoTrasClasificar[0].categoria_ajena === 'Comida' &&
    resultado.mapeoTrasClasificar[0].categoria_propia === 'supermercado');
  check('la transacción de gc2 queda confirmada con la categoría elegida',
    resultado.txGc2Despues.estado === 'confirmado' &&
    resultado.txGc2Despues.categorias.length === 1 &&
    resultado.txGc2Despues.categorias[0].cat === 'supermercado');
  check('gc2 se reconstruye igual de clasificada tras un resync (el mapeo "pega" solo, no solo la edición manual)',
    resultado.txGc2TrasResync.estado === 'confirmado' &&
    resultado.txGc2TrasResync.categorias[0].cat === 'supermercado');
  check('un gasto NUEVO de Fran con la misma categoría de origen se clasifica solo',
    !!resultado.txGc4 && resultado.txGc4.estado === 'confirmado' &&
    resultado.txGc4.categorias[0].cat === 'supermercado');

  // ---------- Neteo después de un saldo pagado (Pancho -> Yo, $50.000) ----------
  const s2 = id => resultado.saldo2.find(s => s.participanteId === id);
  check('tras el saldo pagado, Pancho baja su deuda a -50.000', s2('p3').saldo === -50000, s2('p3'));
  check('tras el saldo pagado, Yo bajo lo que me deben a +120.000', s2('p1').saldo === 120000, s2('p1'));
  check('Fran no cambia (no participó en ese saldo): sigue en -70.000', s2('p2').saldo === -70000, s2('p2'));
  check('las transferencias sugeridas se actualizan solas (Fran y Pancho siguen pagándole a Yo, montos nuevos)',
    resultado.transf2.length === 2 &&
    resultado.transf2.some(t => t.de === 'p2' && t.a === 'p1' && t.monto === 70000) &&
    resultado.transf2.some(t => t.de === 'p3' && t.a === 'p1' && t.monto === 50000),
    resultado.transf2);

  // ---------- No doble conteo ----------
  // gc1 (pagué y registré yo) no dejó ninguna transacción "real" en este fixture (solo probamos
  // que no genera una derivada) — no aporta nada acá. gc2 y gc4 ya están mapeados a "supermercado"
  // (20.000 + 15.000): cuentan una sola vez cada uno, exactamente como cualquier gasto categorizado.
  // gc3 (10.000) sigue "pendiente" sin categoría (nadie mapeó "Transporte" de mí mismo como
  // registrador) -- y una transacción sin categoría no cuenta en los totales, IGUAL que cualquier
  // transacción pendiente de siempre (t30 en la demo): eso es lo que prueba que no hay doble
  // conteo NI conteo prematuro de algo que la usuaria todavía no ha clasificado.
  const gastoEsperado = 20000 + 15000; // gc2 (mapeado a mano) + gc4 (mapeado solo) -- gc3 queda en $0 hasta clasificarse
  check('el mes no dobla-cuenta ni cuenta de más lo sin clasificar: total de gasto = solo lo ya categorizado',
    resultado.mesTotales.gastos === gastoEsperado, { esperado: gastoEsperado, real: resultado.mesTotales.gastos });

  await finish({ context, browser, errors });
})();
