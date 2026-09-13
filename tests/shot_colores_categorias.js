// "Colores únicos y gráficos completos en Resumen": cada categoría recibe un tono (hue) propio
// asignado algorítmicamente (inserción por punto más lejano sobre el círculo de tonos --
// nextCategoryHue en category-colors.ts), estable en el tiempo (se guarda una sola vez, no se
// recalcula en cada render), y la leyenda del donut siempre lista el 100% de las categorías --
// el RING agrupa las categorías chicas (bajo DONUT_OTROS_THRESHOLD_PCT) en una sola porción
// "Otros" (nunca un "Otros" de una sola categoría) para no volverse ilegible, pero eso nunca
// oculta nada de la leyenda.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- 1) Unicidad: farthest-point hue insertion reparte tonos distintos ----------
  const unicidad = await page.evaluate(() => {
    const D = window.__debug;
    const cats = { a: { nombre: 'A', tipo: 'gasto', colorHue: 0, icon: 'more' } };
    const hues = [0];
    for (let i = 0; i < 5; i++) {
      const h = D.nextCategoryHue(cats, 'gasto');
      hues.push(h);
      cats['c' + i] = { nombre: 'c' + i, tipo: 'gasto', colorHue: h, icon: 'more' };
    }
    // distancia angular mínima entre cualquier par de tonos generados
    let minGap = 360;
    for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) {
      const d = Math.abs(hues[i] - hues[j]) % 360;
      minGap = Math.min(minGap, Math.min(d, 360 - d));
    }
    return { hues, minGap, todosDistintos: new Set(hues.map(h => Math.round(h))).size === hues.length };
  });
  check('nextCategoryHue() nunca repite un tono ya usado', unicidad.todosDistintos, unicidad.hues);
  check('   y cada tono nuevo queda razonablemente lejos de los demás (inserción por punto más lejano)', unicidad.minGap >= 30, unicidad);

  // ---------- 2) Estabilidad: el hue no se recalcula solo -- se guarda una vez y persiste ----------
  const estabilidad = await page.evaluate(() => {
    const D = window.__debug;
    const antes = D.CATEGORIES.supermercado.colorHue;
    D.render(); D.render(); D.render();
    const despues = D.CATEGORIES.supermercado.colorHue;
    // editar OTRO campo de la categoría (icono) no debe tocar su colorHue.
    const iconoOriginal = D.CATEGORIES.supermercado.icon;
    D.CATEGORIES.supermercado.icon = '🐶';
    const trasEditarIcono = D.CATEGORIES.supermercado.colorHue;
    D.CATEGORIES.supermercado.icon = iconoOriginal;
    return { antes, despues, trasEditarIcono };
  });
  check('El colorHue de una categoría no cambia solo por re-renderizar', estabilidad.antes === estabilidad.despues, estabilidad);
  check('   ni por editar otro campo de la misma categoría (icono)', estabilidad.antes === estabilidad.trasEditarIcono, estabilidad);

  // ---------- 3) Leyenda completa + Ring agrupado en "Otros" ----------
  const hoy = await page.evaluate(() => {
    const D = window.__debug;
    const fecha = D.todayISO();
    D.TRANSACTIONS.length = 0;
    // 2 categorías grandes (muy por sobre el umbral) + 5 categorías chicas (cada una bajo el
    // umbral de 3%) -- el ring debería agrupar las 5 chicas en un solo arco "Otros", pero la
    // leyenda debe seguir listando las 7, una por una, sin excepción.
    const grandes = [['supermercado', 1000000], ['restoranes', 1000000]];
    const chicas = [['transporte', 10000], ['hogar', 10000], ['salud', 10000], ['entretenimiento', 10000], ['deporte', 10000]];
    [...grandes, ...chicas].forEach(([cat, monto], i) => {
      D.TRANSACTIONS.push({ id: 'tcol' + i, fecha, hora: '09:00', comercio: 'Gasto ' + cat, monto, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'unica', estado: 'confirmado', categorias: [{ cat, monto }], porCobrar: [], reglaAuto: false, nota: '' });
    });
    D.state.tab = 'resumen'; D.state.summarySub = 'balance'; D.state.balancePeriodo = 'mes';
    D.render();
    return fecha;
  });
  await page.waitForTimeout(150);
  const grafico = await page.evaluate(() => ({
    legendRows: document.querySelectorAll('#resumen-content .donut-card .legend-row').length,
    arcSegs: document.querySelectorAll('#resumen-content .donut-card .arc-seg').length,
    otrosArc: !!document.querySelector('#resumen-content .donut-card .arc-seg[data-cat="otros"]'),
    otrosBadges: document.querySelectorAll('#resumen-content .donut-card .legend-otros-badge').length,
  }));
  check('La leyenda muestra las 7 categorías con movimiento, sin agrupar ninguna', grafico.legendRows === 7, grafico);
  check('El ring agrupa las 5 categorías chicas en un solo arco "Otros" (2 grandes + 1 Otros = 3 arcos)', grafico.arcSegs === 3 && grafico.otrosArc, grafico);
  check('   y esas 5 quedan marcadas en la leyenda con la insignia "Otros" (sin desaparecer de la lista)', grafico.otrosBadges === 5, grafico);

  // ---------- 4) Nunca un "Otros" de un solo ítem: se dibuja directo con su propio color ----------
  const unaChica = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    const fecha = D.todayISO();
    D.TRANSACTIONS.push(
      { id: 'g1', fecha, hora: '09:00', comercio: 'Grande', monto: 1000000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'unica', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 1000000 }], porCobrar: [], reglaAuto: false, nota: '' },
      { id: 'g2', fecha, hora: '09:00', comercio: 'Chica', monto: 10000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'unica', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 10000 }], porCobrar: [], reglaAuto: false, nota: '' }
    );
    D.render();
  });
  await page.waitForTimeout(150);
  const soloUnaChica = await page.evaluate(() => ({
    arcSegs: document.querySelectorAll('#resumen-content .donut-card .arc-seg').length,
    otrosArc: !!document.querySelector('#resumen-content .donut-card .arc-seg[data-cat="otros"]'),
  }));
  check('Con una sola categoría bajo el umbral, NO se crea un "Otros" de un solo ítem -- se dibuja directo', soloUnaChica.arcSegs === 2 && !soloUnaChica.otrosArc, soloUnaChica);

  // ---------- 5) Tocar el arco "Otros" resalta (sin filtrar) las filas de la leyenda que agrupa ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    const fecha = D.todayISO();
    [['supermercado', 1000000], ['restoranes', 1000000], ['transporte', 10000], ['hogar', 10000]].forEach(([cat, monto], i) => {
      D.TRANSACTIONS.push({ id: 'th' + i, fecha, hora: '09:00', comercio: 'Gasto ' + cat, monto, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'unica', estado: 'confirmado', categorias: [{ cat, monto }], porCobrar: [], reglaAuto: false, nota: '' });
    });
    D.state.categoryFilter = null; D.state.categoryFilterMonth = null;
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('#resumen-content .donut-card .arc-seg[data-cat="otros"]');
  await page.waitForTimeout(100);
  const trasTocarOtros = await page.evaluate(() => ({
    tab: window.__debug.state.tab, // no debe haber saltado a Transacciones
    resaltadas: document.querySelectorAll('#resumen-content .legend-row-otros.legend-otros-flash').length,
  }));
  check('Tocar el arco "Otros" no hace drill-down a Transacciones (no es una categoría real)', trasTocarOtros.tab === 'resumen', trasTocarOtros);
  check('   sino que resalta en la leyenda las categorías que agrupa', trasTocarOtros.resaltadas === 2, trasTocarOtros);

  await finish({ context, browser, errors });
})();
