// Un depósito pendiente de clasificación, al vincularlo a un cobro o a un reembolso, tiene que
// salir del filtro Pendientes.
//
// El bug: "Pendientes" filtra por t.estado==='pendiente', y ninguno de los dos caminos de
// vinculación tocaba el estado del DEPÓSITO. applyUnexpectedReimbursement sí ponía
// estado='por_cobrar' en el GASTO, pero el depósito --que es el que estaba pendiente-- se
// quedaba así para siempre, aunque la app ya supiera perfectamente qué era: incomeNatureOf lo
// deriva del vínculo y devolvía 'cobro' / 'reembolso' correctamente.
//
// Reportado como: "una transacción pendiente de clasificación, una vez que la pongo como
// reembolso recibido, no se sale de pendientes". Afectaba también al camino del cobro.
//
// La vuelta también se comprueba: desvincular lo devuelve a pendiente, porque vuelve a no tener
// nada que diga qué es.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    const base = (id, tipo, monto, estado, cats) => ({ id, fecha: mes + '-05', hora: '10:00',
      comercio: id, monto, medio: 'efectivo', tipo, recurrencia: 'variable', estado,
      categorias: cats, porCobrar: [], reglaAuto: false, nota: '' });

    D.TRANSACTIONS.length = 0;
    // Camino 1: un gasto con un cobro pendiente, y un depósito sin clasificar que lo salda.
    D.TRANSACTIONS.push(Object.assign(base('gasto-cobro', 'gasto', 20000, 'por_cobrar', [{ cat: 'restoranes', monto: 20000 }]),
      { porCobrar: [{ persona: 'Fran', monto: 12000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }] }));
    D.TRANSACTIONS.push(base('dep-cobro', 'ingreso', 12000, 'pendiente', []));
    // Camino 2: un reembolso inesperado sobre un gasto que no tenía nada marcado.
    D.TRANSACTIONS.push(base('gasto-reemb', 'gasto', 30000, 'confirmado', [{ cat: 'salud', monto: 30000 }]));
    D.TRANSACTIONS.push(base('dep-reemb', 'ingreso', 30000, 'pendiente', []));

    const est = id => (D.TRANSACTIONS.find(t => t.id === id) || {}).estado;
    const nat = id => D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === id));
    const pendientes = () => D.TRANSACTIONS.filter(t => t.estado === 'pendiente').map(t => t.id);

    const antes = { pendientes: pendientes(), natCobro: nat('dep-cobro'), natReemb: nat('dep-reemb') };
    const okCobro = D.assignIncomeToReceivable('gasto-cobro', 0, 'dep-cobro', 12000);
    const okReemb = D.applyUnexpectedReimbursement('gasto-reemb', 'dep-reemb');
    const despues = { pendientes: pendientes(), estCobro: est('dep-cobro'), estReemb: est('dep-reemb'),
      natCobro: nat('dep-cobro'), natReemb: nat('dep-reemb') };
    // Y la vuelta: desvincular el cobro.
    const okUndo = D.removeIncomeAssignment('gasto-cobro', 0, 'dep-cobro');
    const trasDesvincular = { pendientes: pendientes(), estCobro: est('dep-cobro'), natCobro: nat('dep-cobro') };
    return { okCobro, okReemb, okUndo, antes, despues, trasDesvincular };
  });

  // ---------- controles positivos ----------
  check('(control) los dos depósitos arrancan en Pendientes',
    r.antes.pendientes.includes('dep-cobro') && r.antes.pendientes.includes('dep-reemb'), r.antes);
  // Si ya tuvieran naturaleza antes de vincular, "sale de pendientes" podría salir verde sin que
  // el vínculo tuviera nada que ver.
  check('(control) antes de vincular, ninguno tiene naturaleza determinada',
    r.antes.natCobro === 'por_clasificar' && r.antes.natReemb === 'por_clasificar', r.antes);
  check('(control) las dos vinculaciones se ejecutaron', r.okCobro === true && r.okReemb === true, r);

  // ---------- el bug ----------
  check('vincular como reembolso recibido lo saca de Pendientes',
    !r.despues.pendientes.includes('dep-reemb'), r.despues);
  check('vincular como cobro también lo saca de Pendientes',
    !r.despues.pendientes.includes('dep-cobro'), r.despues);
  check('no queda ningún depósito pendiente', r.despues.pendientes.length === 0, r.despues);
  check('el depósito del reembolso queda confirmado', r.despues.estReemb === 'confirmado', r.despues);
  check('el depósito del cobro queda confirmado', r.despues.estCobro === 'confirmado', r.despues);
  // Y la naturaleza es la que el vínculo determina, que es el motivo por el que ya no está pendiente.
  check('la naturaleza quedó determinada por el vínculo',
    r.despues.natReemb === 'reembolso' && r.despues.natCobro === 'cobro', r.despues);

  // ---------- la vuelta ----------
  check('(control) desvincular se ejecutó', r.okUndo === true, r);
  check('desvincular lo devuelve a Pendientes',
    r.trasDesvincular.pendientes.includes('dep-cobro') && r.trasDesvincular.estCobro === 'pendiente', r.trasDesvincular);
  check('y vuelve a no tener naturaleza determinada',
    r.trasDesvincular.natCobro === 'por_clasificar', r.trasDesvincular);

  // ---------- y en la pantalla ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.tab = 'transacciones';
    D.state.filter = 'pendientes';
    D.render();
  });
  await page.waitForTimeout(250);
  const filas = await page.$$eval('.tx-item[data-tx]', els => els.map(e => e.getAttribute('data-tx')));
  check('el filtro Pendientes muestra el que quedó sin clasificar', filas.includes('dep-cobro'), { filas });
  check('y NO muestra el que se vinculó como reembolso', !filas.includes('dep-reemb'), { filas });

  await browser.close();
  finish(errors);
})();
