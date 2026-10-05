// Un donut "por categoría" no puede dibujar lo que no tiene categoría, y eso está bien. Lo que
// estaba mal era el rótulo: la cifra del centro dice "total" y contradecía a la tarjeta de
// arriba sin que nada lo explicara.
//
// Caso reportado: "en agosto tengo en entradas aprox 4 millones pero no veo que las entradas
// sumen eso". La suma de la tarjeta estaba bien -- es el total crudo de las entradas del mes,
// verificado contra las transacciones una por una. Lo que no aparecía eran los cobros y los
// depósitos sin clasificar, que al no tener categoría no pueden salir en el donut.
//
// Ahora el donut dice cuánto deja afuera y qué hacer para que aparezca.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    const f = d => mes + '-' + String(d).padStart(2, '0');
    D.TRANSACTIONS.length = 0;

    // Sueldo categorizado: esto SÍ sale en el donut.
    D.TRANSACTIONS.push({ id: 'sueldo', fecha: f(1), hora: '09:00', comercio: 'Sueldo', monto: 2500000,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado',
      categorias: [{ cat: 'sueldo', monto: 2500000 }], porCobrar: [], reglaAuto: false, nota: '' });
    // Un cobro: el depósito queda sin categoría a propósito (ver resolvePending en helpers.ts).
    D.TRANSACTIONS.push({ id: 'cena', fecha: f(5), hora: '21:00', comercio: 'Cena', monto: 100000,
      medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'restoranes', monto: 100000 }],
      porCobrar: [{ persona: 'Fran', monto: 50000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }],
      reglaAuto: false, nota: '' });
    D.TRANSACTIONS.push({ id: 'dep-cobro', fecha: f(6), hora: '10:00', comercio: 'Transferencia Fran', monto: 50000,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'pendiente',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '' });
    D.assignIncomeToReceivable('cena', 0, 'dep-cobro', 50000);
    // Y un depósito sin clasificar.
    D.TRANSACTIONS.push({ id: 'misterio', fecha: f(10), hora: '10:00', comercio: 'Transferencia', monto: 900000,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'pendiente',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '' });
    D.render();

    const mt = D.monthTotals(mes);
    return { entradas: mt.entradas,
      sumaCruda: D.TRANSACTIONS.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0) };
  });

  // ---------- la suma de la tarjeta NO era el bug ----------
  // Esto es lo primero que había que descartar: que "Entradas" contara algo de más.
  check('(control) la tarjeta Entradas es exactamente la suma cruda de las entradas del mes',
    r.entradas === r.sumaCruda && r.entradas === 3450000, r);

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  await page.click('[data-summary-sub="balance"]');
  await page.waitForTimeout(300);

  const donut = await page.evaluate(() => {
    const bloque = [...document.querySelectorAll('#resumen-content .card')]
      .find(c => /Ingresos por categor/.test(c.textContent));
    if (!bloque) return null;
    const centro = bloque.querySelector('.dc-total');
    const aviso = bloque.querySelector('.file-format-hint');
    return { centro: centro ? centro.textContent : null, aviso: aviso ? aviso.textContent : null };
  });

  check('(control) el donut de ingresos existe y muestra su cifra', !!donut && !!donut.centro, donut);
  // El donut sigue mostrando solo lo categorizado: eso es correcto y no se cambió.
  check('(control) el donut suma solo lo que tiene categoría', /2\.500\.000/.test(donut.centro), donut);
  // Lo que se arregló: ahora dice cuánto deja afuera, en vez de dos "totales" contradiciéndose.
  check('el donut avisa cuánto queda fuera del gráfico', !!donut.aviso && /950\.000/.test(donut.aviso), donut);
  check('y explica por qué y qué hacer', !!donut.aviso && /sin categoría/.test(donut.aviso), donut);

  // ---------- y no avisa cuando no hay nada que avisar ----------
  const sinNada = await page.evaluate(() => {
    const D = window.__debug;
    // Se dejan solo entradas categorizadas: el aviso debe desaparecer, no mostrar "$0".
    for (let i = D.TRANSACTIONS.length - 1; i >= 0; i--) {
      if (D.TRANSACTIONS[i].id !== 'sueldo') D.TRANSACTIONS.splice(i, 1);
    }
    D.render();
    const bloque = [...document.querySelectorAll('#resumen-content .card')]
      .find(c => /Ingresos por categor/.test(c.textContent));
    const aviso = bloque ? bloque.querySelector('.file-format-hint') : null;
    return { hayAviso: !!aviso };
  });
  check('cuando todo está categorizado, no aparece ningún aviso', sinNada.hayAviso === false, sinNada);

  await browser.close();
  finish(errors);
})();
