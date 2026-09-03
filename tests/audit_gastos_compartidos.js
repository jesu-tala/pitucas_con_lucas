// Shared expense balance engine + "my share" derivation + learned mapping.
// Same as audit_consistency.js: it recomputes "the truth" by hand from the raw
// test data and compares it against what the pure functions (groupBalances, suggestedTransfers,
// syncSharedExpenses) actually return — that way any discrepancy is caught,
// not just "it didn't crash".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;

    // ---- Fixture: a "Depto" group with 3 participants ----
    // p1 = me (currentUser), p2 = Fran (has an account), p3 = Pancho (no account).
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' },
      { id: 'p3', grupo_id: 'g1', user_id: null, nombre: 'Pancho', color: 'peach' }
    ];
    D.SHARED_EXPENSES = [
      // I paid, I registered it -- my share goes on MY real transaction (porCobrar), not here.
      { id: 'gc1', grupo_id: 'g1', descripcion: 'Arriendo', categoria_origen: null, monto: 300000,
        fecha: '2026-08-05', pagado_por: 'p1', registrado_por: 'user-jesu', division_tipo: 'iguales',
        tx_origen_id: 'tx-arriendo', reparto: [{ id:'r1', gasto_compartido_id:'gc1', participante_id:'p1', monto:100000 },
          { id:'r2', gasto_compartido_id:'gc1', participante_id:'p2', monto:100000 },
          { id:'r3', gasto_compartido_id:'gc1', participante_id:'p3', monto:100000 }] },
      // Fran paid and registered it -- I owe a share that has no category yet (categoria_origen 'Comida').
      { id: 'gc2', grupo_id: 'g1', descripcion: 'Supermercado', categoria_origen: 'Comida', monto: 60000,
        fecha: '2026-08-10', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
        tx_origen_id: 'tx-fran-1', reparto: [{ id:'r4', gasto_compartido_id:'gc2', participante_id:'p1', monto:20000 },
          { id:'r5', gasto_compartido_id:'gc2', participante_id:'p2', monto:20000 },
          { id:'r6', gasto_compartido_id:'gc2', participante_id:'p3', monto:20000 }] },
      // Pancho paid (no account) but I REGISTERED IT -- my own share still reaches me as a
      // derived entry (not because I paid, but because it was Pancho who paid).
      { id: 'gc3', grupo_id: 'g1', descripcion: 'Bencina', categoria_origen: 'Transporte', monto: 30000,
        fecha: '2026-08-12', pagado_por: 'p3', registrado_por: 'user-jesu', division_tipo: 'iguales',
        tx_origen_id: 'tx-jesu-2', reparto: [{ id:'r7', gasto_compartido_id:'gc3', participante_id:'p1', monto:10000 },
          { id:'r8', gasto_compartido_id:'gc3', participante_id:'p2', monto:10000 },
          { id:'r9', gasto_compartido_id:'gc3', participante_id:'p3', monto:10000 }] }
    ];
    D.CATEGORY_MAPPINGS = [];
    D.PAID_BALANCES = [];

    D.TRANSACTIONS.length = 0; // this test only looks at shared expenses, not the demo data

    D.syncSharedExpenses();
    const trasSync1 = D.TRANSACTIONS.map(t => ({
      id: t.id, monto: t.monto, estado: t.estado, sharedExpenseId: t.sharedExpenseId,
      suggestedOriginCategory: t.suggestedOriginCategory, categorias: t.categorias
    }));

    // ---- Balance engine (no paid balances yet) ----
    const balance1 = D.groupBalances('g1');
    const transf1 = D.suggestedTransfers('g1');

    // ---- Netting with an already-paid balance (Pancho paid Yo $50,000) -- same 3 expenses ----
    D.PAID_BALANCES = [{ id:'s1', grupo_id:'g1', de_participante:'p3', a_participante:'p1', monto:50000, fecha:'2026-08-15' }];
    const balance2 = D.groupBalances('g1');
    const transf2 = D.suggestedTransfers('g1');

    // ---- Learned mapping: I "manually" classify gc2's derived entry (Fran, 'Comida') ----
    const txGc2 = D.TRANSACTIONS.find(t => t.sharedExpenseId === 'gc2');
    D.classifySharedExpenseFromOthers(txGc2.id, 'supermercado');
    const mapeoTrasClasificar = D.CATEGORY_MAPPINGS.slice();
    const txGc2Despues = D.TRANSACTIONS.find(t => t.sharedExpenseId === 'gc2');

    // A NEW expense from Fran, same origin category 'Comida' -- should classify itself.
    D.SHARED_EXPENSES.push({
      id: 'gc4', grupo_id: 'g1', descripcion: 'Jumbo', categoria_origen: 'Comida', monto: 40000,
      fecha: '2026-08-20', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
      tx_origen_id: 'tx-fran-2', reparto: [{ id:'r10', gasto_compartido_id:'gc4', participante_id:'p1', monto:15000 },
        { id:'r11', gasto_compartido_id:'gc4', participante_id:'p2', monto:15000 },
        { id:'r12', gasto_compartido_id:'gc4', participante_id:'p3', monto:10000 }]
    });
    D.syncSharedExpenses();
    const txGc4 = D.TRANSACTIONS.find(t => t.sharedExpenseId === 'gc4');
    // gc2 was also rebuilt in this resync -- confirms that the learned mapping "sticks"
    // again from CATEGORY_MAPPINGS, not just from the manual edit above.
    const txGc2TrasResync = D.TRANSACTIONS.find(t => t.sharedExpenseId === 'gc2');

    // ---- No double counting: the month's expense total must be exactly what's already classified ----
    const mesTotales = D.monthTotals('2026-08');

    return { trasSync1, balance1, transf1, balance2, transf2, mapeoTrasClasificar, txGc2Despues, txGc4, txGc2TrasResync, mesTotales };
  });

  console.log('=== GASTOS COMPARTIDOS: RESULTADO ===');
  console.log(JSON.stringify(resultado, null, 1));

  // ---------- "My share" derivation (sharedByOthers) ----------
  check('gc1 (pagué y registré yo) NO genera entrada derivada',
    !resultado.trasSync1.some(t => t.sharedExpenseId === 'gc1'));
  const gc2Tx = resultado.trasSync1.find(t => t.sharedExpenseId === 'gc2');
  check('gc2 (pagó Fran) SÍ genera mi entrada derivada, por $20.000', !!gc2Tx && gc2Tx.monto === 20000);
  check('gc2 sin mapeo previo queda pendiente con la sugerencia "Comida"',
    !!gc2Tx && gc2Tx.estado === 'pendiente' && gc2Tx.suggestedOriginCategory === 'Comida');
  const gc3Tx = resultado.trasSync1.find(t => t.sharedExpenseId === 'gc3');
  check('gc3 (pagó Pancho, la registré yo) también genera mi entrada derivada, por $10.000',
    !!gc3Tx && gc3Tx.monto === 10000);

  // ---------- Balance engine (no paid balances) ----------
  const s1 = id => resultado.balance1.find(s => s.participantId === id);
  check('saldo de Yo (p1) antes de saldar: +170.000 (le deben)', s1('p1').balance === 170000, s1('p1'));
  check('saldo de Fran (p2) antes de saldar: -70.000 (debe)', s1('p2').balance === -70000, s1('p2'));
  check('saldo de Pancho (p3) antes de saldar: -100.000 (debe)', s1('p3').balance === -100000, s1('p3'));
  check('los 3 saldos del grupo suman $0 (neteo consistente)',
    resultado.balance1.reduce((s, x) => s + x.balance, 0) === 0);

  check('transferencias sugeridas (2, la mínima posible): Pancho y Fran le pagan a Yo',
    resultado.transf1.length === 2 &&
    resultado.transf1.some(t => t.from === 'p3' && t.to === 'p1' && t.monto === 100000) &&
    resultado.transf1.some(t => t.from === 'p2' && t.to === 'p1' && t.monto === 70000),
    resultado.transf1);

  // ---------- Learned mapping ----------
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

  // ---------- Netting after a paid balance (Pancho -> Yo, $50,000) ----------
  const s2 = id => resultado.balance2.find(s => s.participantId === id);
  check('tras el saldo pagado, Pancho baja su deuda a -50.000', s2('p3').balance === -50000, s2('p3'));
  check('tras el saldo pagado, Yo bajo lo que me deben a +120.000', s2('p1').balance === 120000, s2('p1'));
  check('Fran no cambia (no participó en ese saldo): sigue en -70.000', s2('p2').balance === -70000, s2('p2'));
  check('las transferencias sugeridas se actualizan solas (Fran y Pancho siguen pagándole a Yo, montos nuevos)',
    resultado.transf2.length === 2 &&
    resultado.transf2.some(t => t.from === 'p2' && t.to === 'p1' && t.monto === 70000) &&
    resultado.transf2.some(t => t.from === 'p3' && t.to === 'p1' && t.monto === 50000),
    resultado.transf2);

  // ---------- No double counting ----------
  // gc1 (I paid and registered it) left no "real" transaction in this fixture (we only tested
  // that it doesn't generate a derived one) — it contributes nothing here. gc2 and gc4 are already
  // mapped to "supermercado" (20,000 + 15,000): each counts exactly once, just like any categorized expense.
  // gc3 (10,000) is still "pendiente" with no category (nobody mapped "Transporte" from myself as
  // the registrant) -- and a transaction with no category doesn't count in the totals, JUST LIKE any
  // perennially-pending transaction (t30 in the demo): that's what proves there's no double
  // counting NOR premature counting of something the user hasn't classified yet.
  const gastoEsperado = 20000 + 15000; // gc2 (mapped by hand) + gc4 (mapped on its own) -- gc3 stays at $0 until classified
  check('el mes no dobla-cuenta ni cuenta de más lo sin clasificar: total de gasto = solo lo ya categorizado',
    resultado.mesTotales.gastos === gastoEsperado, { esperado: gastoEsperado, real: resultado.mesTotales.gastos });

  await finish({ context, browser, errors });
})();
