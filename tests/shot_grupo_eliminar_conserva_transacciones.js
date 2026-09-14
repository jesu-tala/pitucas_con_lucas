// Refinamiento F de grupos: "al eliminar un grupo se borra solo la estructura compartida, no las
// transacciones. El viaje/gasto ya ocurrió y la plata ya se dividió, así que cada transacción
// debe quedar en el historial de cada persona como transacción normal, desvinculada del grupo,
// conservando su división ya congelada (snapshot)."
//
// Causa real del bug: una transacción "compartida por otra persona" (sharedByOthers=true) es
// una entrada DERIVADA que nunca se persiste -- se recalcula desde cero, cada vez, a partir de
// SHARED_EXPENSES (ver syncSharedExpenses en views/menu.ts). Si el grupo se elimina, el próximo
// refetch (loadSharedExpenses, llamado justo después del DELETE) ya no encuentra ningún
// gastos_compartidos de ese grupo -- esa entrada simplemente deja de recrearse y desaparece del
// historial en silencio. preserveGroupTransactionsBeforeUnlink() se llama justo antes de ese
// refetch para materializarla en una transacción real y persistida primero.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const fecha = D.todayISO();

    // (1) Una transacción MÍA (yo pagué/registré) ya compartida con el grupo -- su reparto real
    // ya vive en porCobrar (nunca depende de que el grupo siga existiendo).
    D.TRANSACTIONS.push({
      id: 'tPropia', fecha, hora: '10:00', comercio: 'Supermercado depto', monto: 40000, medio: 'debito_bci',
      tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'supermercado', monto: 40000 }],
      porCobrar: [{ persona: 'Caro', monto: 20000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null, groupId: 'gDel', participantId: 'p2', sharedExpenseId: 'seDel' }],
      reglaAuto: false, nota: '', groupId: 'gDel', sharedExpenseId: 'seDel', divisionTipo: 'iguales'
    });

    // (2) Una transacción DERIVADA (Caro pagó, esta es "mi parte") -- la que hoy desaparece en
    // silencio al recalcularse tras eliminar el grupo.
    D.TRANSACTIONS.push({
      id: 'compartido-seOtro', fecha, hora: '12:00', comercio: 'Cuenta de la luz', monto: 15000, medio: 'efectivo',
      tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'hogar', monto: 15000 }], porCobrar: [], reglaAuto: false,
      nota: 'Tu parte de "Cuenta de la luz" — pagó Caro · grupo Depto',
      groupId: 'gDel', sharedExpenseId: 'seOtro', sharedByOthers: true
    });

    const antesPropia = JSON.parse(JSON.stringify(D.TRANSACTIONS.find(t => t.id === 'tPropia')));
    const antesDerivada = JSON.parse(JSON.stringify(D.TRANSACTIONS.find(t => t.id === 'compartido-seOtro')));

    D.preserveGroupTransactionsBeforeUnlink('gDel');

    const trasPropia = D.TRANSACTIONS.find(t => t.id === 'tPropia');
    const trasDerivada = D.TRANSACTIONS.find(t => t.id === 'compartido-seOtro');

    return { antesPropia, antesDerivada, trasPropia, trasDerivada };
  });

  check('(1) Mi propia transacción sigue existiendo tras eliminar el grupo (no se borra)', !!resultado.trasPropia, resultado.trasPropia);
  check('   con el mismo monto/categoría/estado -- su división queda intacta', resultado.trasPropia.monto === 40000 && resultado.trasPropia.categorias[0].monto === 40000 && resultado.trasPropia.estado === 'por_cobrar', resultado.trasPropia);
  check('   y su reparto (quién me debe qué) sigue ahí, congelado -- no se pierde la plata', resultado.trasPropia.porCobrar.length === 1 && resultado.trasPropia.porCobrar[0].persona === 'Caro' && resultado.trasPropia.porCobrar[0].monto === 20000, resultado.trasPropia.porCobrar);
  check('   pero queda desvinculada del grupo (groupId/sharedExpenseId ya no apuntan a nada)', resultado.trasPropia.groupId === undefined && resultado.trasPropia.sharedExpenseId === undefined, resultado.trasPropia);

  check('(2) La transacción DERIVADA (la parte que pagó otra persona) también sobrevive -- antes desaparecía en silencio', !!resultado.trasDerivada, resultado.trasDerivada);
  check('   se convierte en una transacción normal y persistida (sharedByOthers ya no es true)', resultado.trasDerivada.sharedByOthers === false, resultado.trasDerivada);
  check('   con su monto/categoría intactos ($15.000, hogar)', resultado.trasDerivada.monto === 15000 && resultado.trasDerivada.categorias[0].cat === 'hogar', resultado.trasDerivada);
  check('   y también desvinculada del grupo', resultado.trasDerivada.groupId === undefined && resultado.trasDerivada.sharedExpenseId === undefined, resultado.trasDerivada);

  await finish({ context, browser, errors });
})();
