// Dos bugs que se veían como uno: en el dashboard de categorías aparecían VARIOS segmentos
// "Sin categoría" en el mismo donut.
//
// Causa 1: el donut agrupaba por el id CRUDO de la categoría, pero rotulaba con catInfo(id), que
// devuelve el mismo objeto de respaldo {nombre:'Sin categoría'} para CUALQUIER id que no resuelva.
// Una categoría borrada, un null y un id viejo eran tres baldes distintos con la misma etiqueta.
//
// Una transacción SIN ninguna categoría sigue sin aparecer en el donut, a propósito: es el mismo
// criterio que usan los totales, donde lo que todavía no se revisó no cuenta hasta clasificarlo
// (ver "no cuenta de más lo sin clasificar" en audit_gastos_compartidos.js). Se probó contarlas y
// se descartó: el donut pasaría a sumar más que el total del período, y los dos números se
// contradirían en pantalla. Lo que este test fija es que eso siga así.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const mes = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[0], f = d => mes + '-' + String(d).padStart(2, '0');
    D.TRANSACTIONS.length = 0;
    const g = (id, d, monto, cats) => ({ id, fecha: f(d), hora: '10:00', comercio: 'Gasto ' + id, monto,
      medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: cats, porCobrar: [], reglaAuto: false, nota: '' });
    D.TRANSACTIONS.push(g('a', 3, 40000, [{ cat: 'supermercado', monto: 40000 }]));    // categoría real
    D.TRANSACTIONS.push(g('b', 4, 30000, [{ cat: 'cat_borrada_1', monto: 30000 }]));   // id que ya no existe
    D.TRANSACTIONS.push(g('c', 5, 20000, [{ cat: 'cat_borrada_2', monto: 20000 }]));   // otro id que no existe
    D.TRANSACTIONS.push(g('d', 6, 10000, [{ cat: null, monto: 10000 }]));              // cat null
    D.TRANSACTIONS.push(g('e', 7, 15000, []));                                          // sin clasificar
    D.render();
    return mes;
  });

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  for (let i = 0; i < 12; i++) {
    const dis = await page.$eval('[data-month-nav="-1"]', el => el.disabled).catch(() => true);
    if (dis) break;
    await page.click('[data-month-nav="-1"]'); await page.waitForTimeout(60);
  }
  await page.waitForTimeout(250);

  const donut = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.donut-card'));
    // el de gastos es el que tiene filas de leyenda en este fixture (solo hay gastos)
    const filas = cards.flatMap(c => Array.from(c.querySelectorAll('.legend-row')).map(e => ({
      cat: e.getAttribute('data-cat'), nombre: (e.querySelector('.legend-name') || {}).textContent })));
    return { filas, cuantasSinCategoria: filas.filter(f => /Sin categoría/.test(f.nombre || '')).length };
  });

  // Control positivo: si el donut no dibujara nada, "hay una sola Sin categoría" pasaría en verde
  // sin haber probado nada.
  check('(control) el donut dibuja la categoría real', donut.filas.some(f => f.cat === 'supermercado'), donut.filas);
  check('hay UN SOLO segmento "Sin categoría", no uno por cada id roto',
    donut.cuantasSinCategoria === 1, donut);
  check('   y usa el id canónico, así el drill-down lleva a un lugar definido',
    donut.filas.some(f => f.cat === '__sin_categoria'), donut.filas);

  const totales = await page.evaluate((mes) => {
    const D = window.__debug;
    const sinCat = D.TRANSACTIONS.find(t => t.id === 'e');
    return {
      gastosDelMes: D.monthTotals(mes).gastos,
      netDelSinClasificar: D.netExpenseTx(sinCat),
      soloCategorizado: 40000 + 30000 + 20000 + 10000
    };
  }, mes);

  check('una transacción sin clasificar sigue sin contar en los totales (no se cuenta antes de revisarla)',
    totales.netDelSinClasificar === 0, totales);
  check('   y tampoco se dibuja en el donut, para que el donut no sume más que el total del período',
    donut.filas.every(f => f.cat !== 'e'), donut.filas);

  await finish({ context, browser, errors });
})();
