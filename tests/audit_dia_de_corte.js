// Día de corte por medio de pago, para reconciliar contra el período REAL de la tarjeta.
//
// El problema: statementPeriod() devuelve el rango de las fechas que la cartola TRAE, y eso está
// sesgado. Si la cartola no tiene ningún movimiento el día 25, el rango arranca el 27 o el 28 --
// y entonces una transacción del 25, que sí pertenece a esa facturación, parece "no respaldada
// por esta cartola" y se propone ELIMINAR. Borrar algo legítimo es el peor resultado posible de
// una reconciliación.
//
// Con el corte configurado, la ventana se alinea al período de facturación de verdad (del 25 al
// 24, por ejemplo), tenga o no movimientos en los bordes.
//
// Y lo que NO debe pasar, que es la otra mitad del pedido: el corte aplica SOLO a la
// reconciliación. Balance, Presupuesto y Evolución siguen por mes calendario.
const fs = require('fs');
const path = require('path');
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;

    // Una tarjeta con corte el 24 y una cuenta corriente sin corte.
    D.PAYMENT_METHODS['tarjeta_corte'] = { nombre: 'Visa', corto: '1234', icon: 'card', diaCorte: 24 };
    D.PAYMENT_METHODS['cuenta_sin_corte'] = { nombre: 'Cuenta', corto: 'cc', icon: 'bank' };

    // Una cartola cuyos movimientos van del 28 de septiembre al 20 de octubre: el período
    // DERIVADO arranca el 28, pero la facturación real arrancó el 25 de septiembre.
    const movs = [
      { fecha: '2026-09-28', detalle: 'JUMBO', comercioSugerido: 'JUMBO', monto: -20000, tipoMov: 'gasto' },
      { fecha: '2026-10-20', detalle: 'UBER', comercioSugerido: 'UBER', monto: -5000, tipoMov: 'gasto' },
    ];

    const derivado = D.statementPeriod(movs);
    const conCorte = D.periodoDeReconciliacion(movs, 'tarjeta_nacional');
    const sinCorteConfigurado = D.periodoDeReconciliacion(movs, 'cuenta_corriente');

    // El caso que el corte arregla: un gasto del 25 de septiembre, dentro de la facturación pero
    // fuera del rango derivado. Sin corte se proponía eliminar; con corte, no.
    const gasto25 = { id: 'gasto-25', fecha: '2026-09-25', hora: '10:00', comercio: 'FARMACIA',
      monto: 9000, medio: 'tarjeta_corte', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      // Con categoría: monthTotals suma por categorías, así que un gasto sin clasificar da $0 y
      // la comprobación de "sigue contando en su mes calendario" no probaría nada.
      categorias: [{ cat: 'salud', monto: 9000 }], porCobrar: [], reglaAuto: false, nota: '',
      origen: 'auto-mail' };
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(gasto25);

    const diffConCorte = D.buildReconcileDiff(movs, 'tarjeta_nacional');
    // Y el mismo escenario sin corte configurado, para ver la diferencia.
    delete D.PAYMENT_METHODS['tarjeta_corte'].diaCorte;
    const diffSinCorte = D.buildReconcileDiff(movs, 'tarjeta_nacional');
    D.PAYMENT_METHODS['tarjeta_corte'].diaCorte = 24;

    // Varias tarjetas con cortes distintos: se toma la ventana más ancha.
    D.PAYMENT_METHODS['otra_tarjeta'] = { nombre: 'Master', corto: '9999', icon: 'card', diaCorte: 5 };
    const conDosCortes = D.periodoDeReconciliacion(movs, 'tarjeta_nacional');
    const dias = D.diasCorteDeFamilia('tarjeta_nacional').slice().sort((a, b) => a - b);
    delete D.PAYMENT_METHODS['otra_tarjeta'];

    return { derivado, conCorte, sinCorteConfigurado, conDosCortes, dias,
      elimConCorte: diffConCorte.eliminarPropuesto.map(i => i.tx.id),
      elimSinCorte: diffSinCorte.eliminarPropuesto.map(i => i.tx.id) };
  });

  // ---------- la ventana ----------
  check('(control) el período derivado arranca en la primera fecha de la cartola',
    r.derivado.desde === '2026-09-28', r.derivado);
  check('con corte el 24, la ventana arranca el 25 del mes anterior', r.conCorte.desde === '2026-09-25', r.conCorte);
  check('y cierra el 24', r.conCorte.hasta === '2026-10-24', r.conCorte);
  check('sin corte configurado, se usa el período derivado de siempre',
    r.sinCorteConfigurado.desde === r.derivado.desde && r.sinCorteConfigurado.hasta === r.derivado.hasta, r);

  // ---------- el bug que esto arregla ----------
  // Sin corte, el gasto del 25 cae fuera del rango derivado (que arranca el 28) y por eso NO se
  // evalúa: no se propone eliminar, pero tampoco se respalda. Con corte entra al período y, al
  // no haber nada en la cartola que lo respalde, sí se propone -- que es el comportamiento
  // correcto y revisable. Lo que importa es que la ventana sea la real, no que haya menos avisos.
  check('(control) con corte, el gasto del 25 entra al período evaluado',
    r.elimConCorte.includes('gasto-25'), r);
  check('(control) sin corte, el gasto del 25 quedaba fuera del período y nadie lo miraba',
    !r.elimSinCorte.includes('gasto-25'), r);

  // ---------- varias tarjetas ----------
  check('(control) se detectan los dos días de corte configurados',
    JSON.stringify(r.dias) === JSON.stringify([5, 24]), r.dias);
  // Ante la duda, la ventana que NO deja nada afuera: angostar podría proponer borrar algo
  // legítimo, ensanchar solo puede evitar propuestas equivocadas.
  check('con dos cortes distintos se toma la ventana más ancha',
    r.conDosCortes.desde <= r.conCorte.desde && r.conDosCortes.hasta >= r.conCorte.hasta, r);

  // ---------- el corte NO se filtra al resto de la app ----------
  const SRC_EVO = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'evolucion.ts'), 'utf-8');
  const SRC_PRE = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'presupuesto.ts'), 'utf-8');
  check('monthTotals (Balance/Evolución) no sabe nada del día de corte', !/diaCorte/.test(SRC_EVO), 'evolucion.ts');
  check('Presupuesto no sabe nada del día de corte', !/diaCorte/.test(SRC_PRE), 'presupuesto.ts');

  const mesesIguales = await page.evaluate(() => {
    const D = window.__debug;
    // Un gasto el 25, con corte el 24: para la reconciliación pertenece a la facturación
    // siguiente, pero para Balance sigue siendo septiembre. Las dos cosas a la vez, a propósito.
    const t = D.TRANSACTIONS.find(x => x.id === 'gasto-25');
    return { mesCalendario: t.fecha.slice(0, 7), cuentaEnSeptiembre: D.monthTotals('2026-09').gastos > 0 };
  });
  check('un gasto del 25 sigue contando en su mes calendario, no en el de la facturación',
    mesesIguales.mesCalendario === '2026-09' && mesesIguales.cuentaEnSeptiembre === true, mesesIguales);

  await browser.close();
  finish(errors);
})();
