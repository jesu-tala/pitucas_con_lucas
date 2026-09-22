// En Presupuesto, una categoría SIN presupuesto fijado mostraba solo su nombre y el link para
// agregar uno. Para saber cuánto llevabas gastado en ella había que ponerle una meta primero,
// aunque el dato ya existiera y no dependiera de ninguna meta.
//
// Ahora la tarjeta sin meta muestra las mismas dos cifras que la tarjeta con meta: el gasto del
// mes y el promedio de los últimos 3 meses. Lo que sigue apareciendo SOLO con meta es la barra de
// progreso y las alertas, porque las dos se miden contra la meta: sin meta no significan nada.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    const meses = D.MONTHS.slice(0, 4);
    const mes = meses[3];
    D.TRANSACTIONS.length = 0;
    // 'supermercado' CON presupuesto, 'restoranes' SIN presupuesto. Las dos con gasto este mes y
    // en los 3 anteriores, para que el promedio tenga de dónde salir.
    Object.keys(D.BUDGETS).forEach(k => { delete D.BUDGETS[k]; });
    D.BUDGETS['supermercado'] = { meta: 200000, alertas: { 80: true, 90: true, 100: true } };
    let n = 0;
    meses.forEach((m, i) => {
      [['supermercado', 50000 + i * 1000], ['restoranes', 30000 + i * 3000]].forEach(([cat, monto]) => {
        D.TRANSACTIONS.push({ id: 'b' + (n++), fecha: m + '-05', hora: '10:00', comercio: cat, monto,
          medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
          categorias: [{ cat, monto }], porCobrar: [], reglaAuto: false, nota: '' });
      });
    });
    window.__mesPrueba = mes;
    D.render();
  });

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  await page.click('[data-summary-sub="presupuesto"]');
  await page.waitForTimeout(200);
  // ir al mes con datos: el cuarto de la lista
  for (let i = 0; i < 12; i++) {
    const dis = await page.$eval('[data-month-nav="-1"]', el => el.disabled).catch(() => true);
    if (dis) break;
    await page.click('[data-month-nav="-1"]'); await page.waitForTimeout(60);
  }
  for (let i = 0; i < 3; i++) { await page.click('[data-month-nav="1"]'); await page.waitForTimeout(80); }
  await page.waitForTimeout(250);

  const r = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.budget-cat-card'));
    const porNombre = {};
    cards.forEach(c => {
      const n = (c.querySelector('.budget-cat-name') || {}).textContent;
      if (!n) return;
      porNombre[n.trim()] = {
        sinMeta: c.classList.contains('empty'),
        texto: c.textContent,
        gastoSinMeta: (c.querySelector('.gastado-sinmeta') || {}).textContent || null,
        tieneBarra: !!c.querySelector('.budget-track, .budget-bar'),
        tieneAlerta: !!c.querySelector('.budget-alert-badge, .budget-alert')
      };
    });
    return porNombre;
  });

  const conMeta = r['Supermercado'];
  const sinMeta = r['Restoranes y bares'];

  // Control positivo: si no se encontraran las dos tarjetas, todo lo de abajo pasaría en verde
  // sin haber mirado nada.
  check('(control) se encuentran las dos tarjetas, una con meta y otra sin meta',
    !!conMeta && !!sinMeta && conMeta.sinMeta === false && sinMeta.sinMeta === true,
    { conMeta: !!conMeta, sinMeta: !!sinMeta });

  check('una categoría SIN meta ya muestra cuánto llevas gastado este mes',
    sinMeta && sinMeta.gastoSinMeta === '$39.000', sinMeta);
  check('   y también el promedio de los últimos 3 meses', /Prom\. 3 meses: \$/.test(sinMeta.texto), sinMeta.texto);
  check('   pero NO barra de progreso (se mide contra la meta, que no existe)', sinMeta.tieneBarra === false, sinMeta);
  check('   ni alertas, por lo mismo', sinMeta.tieneAlerta === false, sinMeta);
  check('   y sigue ofreciendo agregarle un presupuesto', /Agregar presupuesto/.test(sinMeta.texto), sinMeta.texto);

  check('la categoría CON meta sigue igual que antes: barra y "de $meta"',
    conMeta.tieneBarra === true && /de \$200\.000/.test(conMeta.texto), conMeta);

  // Y una categoría sin meta NI movimiento no ensucia la lista con un "$0 este mes": la lista
  // trae todas las categorías de gasto existentes, así que sin esto la pantalla se llenaba de
  // tarjetas repitiendo cero.
  const sinNada = r['Transporte'];
  check('una categoría sin meta y sin gasto NO muestra cifras (no ensucia la lista)',
    !!sinNada && sinNada.gastoSinMeta === null, sinNada);

  await finish({ context, browser, errors });
})();
