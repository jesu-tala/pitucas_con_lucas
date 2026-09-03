// Coverage for the redesign of the Investments tab requested by the user:
// 1) platforms as an accordion (collapsed by default, only one open at a time, without the
//    per-platform mini charts, without the words "valor estimado" in each one's label).
// 2) totals card with "Aportado neto" and "Ganancia/pérdida aprox." as two tiles
//    (same .stat-grid/.stat-tile visual pattern as Balance), not a line of text.
// 3) the simulator (projection) at the end of the page, after the planner.
// 4) the "Aportado vs. valor" chart with a fixed X axis from January to December of TODAY's year, and
//    approximate labels on the Y axis.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-summary-sub="inversiones"]');
  await page.waitForTimeout(200);

  // ---------- 1) Platform accordion ----------
  const idsPlataformas = await page.evaluate(() => [...document.querySelectorAll('[data-toggle-platform]')].map(el=>el.getAttribute('data-toggle-platform')));
  check('Hay al menos 2 plataformas para probar el acordeón', idsPlataformas.length >= 2, idsPlataformas);
  const [idA, idB] = idsPlataformas;

  const antesDeAbrir = await page.evaluate((id) => !!document.querySelector(`[data-edit-platform="${id}"]`), idA);
  check('(1a) Plataforma colapsada por defecto: no se ven sus figuras/botones internos', antesDeAbrir === false);

  await page.click(`[data-toggle-platform="${idA}"]`);
  await page.waitForTimeout(150);
  const trasAbrirA = await page.evaluate((id) => ({
    seVeA: !!document.querySelector(`[data-edit-platform="${id}"]`),
    noHayMiniGrafico: !document.querySelector('.platform-spark'),
    dicePalabraProhibida: document.querySelector(`[data-toggle-platform="${id}"]`).closest('.platform-group').textContent.includes('valor estimado'),
  }), idA);
  check('(1b) Al abrirla, se ven sus figuras/botones', trasAbrirA.seVeA === true, trasAbrirA);
  check('(1c) No existe ningún mini gráfico por plataforma (.platform-spark)', trasAbrirA.noHayMiniGrafico === true, trasAbrirA);
  check('(1d) No aparece la palabra "valor estimado" dentro de la plataforma', trasAbrirA.dicePalabraProhibida === false, trasAbrirA);

  // Opening platform B must close A (only-one-open accordion).
  await page.click(`[data-toggle-platform="${idB}"]`);
  await page.waitForTimeout(150);
  const trasAbrirB = await page.evaluate(({idA, idB}) => ({
    aSigueAbierta: !!document.querySelector(`[data-edit-platform="${idA}"]`),
    bAhoraAbierta: !!document.querySelector(`[data-edit-platform="${idB}"]`),
  }), {idA, idB});
  check('(1e) Abrir otra plataforma cierra la anterior (acordeón de una sola apertura)', trasAbrirB.aSigueAbierta === false && trasAbrirB.bAhoraAbierta === true, trasAbrirB);
  // leave it closed so it doesn't interfere with the rest of the test
  await page.click(`[data-toggle-platform="${idB}"]`);
  await page.waitForTimeout(150);

  // ---------- 2) Totals card: two tiles ----------
  const totalCard = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.platform-total-label')].find(el=>el.textContent.includes('Total invertido'));
    const card = label ? label.closest('.card') : null;
    if(!card) return null;
    const tiles = [...card.querySelectorAll('.stat-tile')];
    return {
      cantidadCuadrados: tiles.length,
      labels: tiles.map(t=>t.querySelector('.stat-label')?.textContent),
      totalInvertidoSinSufijo: label.textContent.trim() === 'Total invertido',
    };
  });
  check('(2a) La card de totales tiene 2 cuadrados (.stat-tile)', totalCard && totalCard.cantidadCuadrados === 2, totalCard);
  check('(2b) Uno dice "Aportado neto" y el otro "Ganancia/pérdida aprox."', totalCard && totalCard.labels.some(l=>l.includes('Aportado neto')) && totalCard.labels.some(l=>l.includes('Ganancia')), totalCard);
  check('(2c) El label de arriba ya no dice "(valor estimado)"', totalCard && totalCard.totalInvertidoSinSufijo === true, totalCard);

  // ---------- 3) Simulator at the end ----------
  // After the simulator only "closing" content can come (the legal disclaimer, the
  // final spacer) -- no other .card with real content, so we check that it's the
  // LAST .card of the view, instead of pinning an exact position among the children.
  const orden = await page.evaluate(() => {
    const root = document.getElementById('resumen-content');
    const cards = [...root.children];
    const idxProyeccion = cards.findIndex(c=>c.classList.contains('proyeccion-card'));
    const idxPlanificador = cards.findIndex(c=>c.querySelector && c.querySelector('[data-plan-bar]'));
    const idxUltimaCard = cards.reduce((last,c,i)=> c.classList.contains('card') ? i : last, -1);
    return { total: cards.length, idxProyeccion, idxPlanificador, idxUltimaCard };
  });
  check('(3) La card del simulador (.proyeccion-card) está DESPUÉS del planificador', orden.idxProyeccion > orden.idxPlanificador, orden);
  check('   y es la última .card de la vista (nada de contenido real viene después)', orden.idxProyeccion === orden.idxUltimaCard, orden);

  // ---------- 4) Chart: X axis January-December of the current year, Y axis with approximate labels ----------
  const grafico = await page.evaluate(() => {
    const D = window.__debug;
    const year = D.todayISO().slice(0,4);
    const svg = document.querySelector('.evo-card svg');
    const textos = svg ? [...svg.querySelectorAll('text')].map(t=>t.textContent) : [];
    // All 12 month labels must be present (Ene..Dic), regardless of whether there's data that month.
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const tieneLos12Meses = meses.every(m => textos.includes(m));
    // There must be at least one label in abbreviated format (ends in K or M, or is "$0")
    const tieneEtiquetaYAprox = textos.some(t => /^[−-]?\$[\d,]+[KM]?$/.test(t));
    return { year, tieneLos12Meses, tieneEtiquetaYAprox, cantidadTextos: textos.length };
  });
  check('(4a) El gráfico muestra las 12 etiquetas de mes (enero a diciembre) del año actual', grafico.tieneLos12Meses === true, grafico);
  check('(4b) El eje Y tiene etiquetas de valores aproximados', grafico.tieneEtiquetaYAprox === true, grafico);

  await finish({ context, browser, errors });
})();
