// Tocar "Entradas" en Balance lleva a las entradas DE ESE MES, con su suma.
//
// Reportado como "en agosto tengo en entradas aprox 4 millones pero no veo que las entradas
// sumen eso". La suma de la tarjeta estaba bien --es el total crudo de las entradas del mes,
// verificado transacción por transacción-- pero NO había forma de comprobarlo: la lista de
// Transacciones con el chip "Entradas" muestra todos los meses a propósito (ver filteredTx), no
// el mes que Balance tiene abierto. Así que el número no se podía auditar desde ninguna parte.
//
// Este test verifica justamente eso: que lo que la lista muestra al tocar la cifra suma
// exactamente la cifra tocada.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const setup = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    const otroMes = D.MONTHS[D.state.monthIndex - 1];
    const f = (m, d) => m + '-' + String(d).padStart(2, '0');
    D.TRANSACTIONS.length = 0;

    // Tres entradas en el mes abierto, de naturalezas distintas: una categorizada, una sin
    // clasificar, y una marcada como "no es ingreso" (que NO debe contar).
    D.TRANSACTIONS.push({ id: 'sueldo', fecha: f(mes, 1), hora: '09:00', comercio: 'Sueldo', monto: 2500000,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado',
      categorias: [{ cat: 'sueldo', monto: 2500000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.TRANSACTIONS.push({ id: 'misterio', fecha: f(mes, 10), hora: '10:00', comercio: 'Transferencia', monto: 900000,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'pendiente',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '' });
    D.TRANSACTIONS.push({ id: 'traspaso', fecha: f(mes, 12), hora: '10:00', comercio: 'Traspaso propio', monto: 700000,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'no_es_gasto',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '' });
    // Y una entrada de OTRO mes, que no debe aparecer: es el punto del drill-down.
    D.TRANSACTIONS.push({ id: 'otro-mes', fecha: f(otroMes, 15), hora: '10:00', comercio: 'Sueldo viejo', monto: 1800000,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado',
      categorias: [{ cat: 'sueldo', monto: 1800000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.render();
    return { mes, otroMes, entradas: D.monthTotals(mes).entradas };
  });

  // $2.500.000 + $900.000 = $3.400.000. El traspaso marcado "no es ingreso" no cuenta.
  check('(control) la tarjeta excluye lo marcado como "no es ingreso"', setup.entradas === 3400000, setup);

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  await page.click('[data-summary-sub="balance"]');
  await page.waitForTimeout(300);

  check('la cifra de Entradas es tocable', !!(await page.$('[data-drill-entradas]')));
  await page.click('[data-drill-entradas]');
  await page.waitForTimeout(300);

  const tras = await page.evaluate(() => ({
    tab: window.__debug.state.tab,
    filtro: window.__debug.state.filter,
    mesFiltrado: window.__debug.state.categoryFilterMonth,
    filas: [...document.querySelectorAll('.tx-item[data-tx]')].map(e => e.getAttribute('data-tx')),
  }));

  check('lleva a Transacciones', tras.tab === 'transacciones', tras);
  check('con el filtro de entradas puesto', tras.filtro === 'entradas', tras);
  check('y acotado al mes de Balance', tras.mesFiltrado === setup.mes, tras);

  check('muestra las entradas de ese mes', tras.filas.includes('sueldo') && tras.filas.includes('misterio'), tras.filas);
  // El punto del drill-down: sin el filtro de mes, la lista traía todos los meses y la cifra era
  // imposible de verificar.
  check('NO muestra entradas de otros meses', !tras.filas.includes('otro-mes'), tras.filas);
  check('NO muestra lo marcado como "no es ingreso"', !tras.filas.includes('traspaso'), tras.filas);

  // Y lo que de verdad se buscaba: que lo listado SUME la cifra tocada.
  const suma = await page.evaluate((ids) => {
    const D = window.__debug;
    return ids.reduce((s, id) => {
      const t = D.TRANSACTIONS.find(x => x.id === id);
      return s + (t ? t.monto : 0);
    }, 0);
  }, tras.filas);
  check('lo que la lista muestra suma exactamente la cifra de la tarjeta',
    suma === setup.entradas, { suma, tarjeta: setup.entradas });

  await browser.close();
  finish(errors);
})();
