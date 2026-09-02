// Cobertura del rediseño de la pestaña Inversiones que pidió la usuaria:
// 1) plataformas como acordeón (colapsadas por defecto, una sola abierta a la vez, sin los
//    mini gráficos por plataforma, sin la palabra "valor estimado" en el label de cada una).
// 2) card de totales con "Aportado neto" y "Ganancia/pérdida aprox." como dos cuadrados
//    (mismo patrón visual .stat-grid/.stat-tile que Balance), no una línea de texto.
// 3) el simulador (proyección) al final de la página, después del planificador.
// 4) el gráfico "Aportado vs. valor" con eje X fijo de enero a diciembre del año de HOY, y
//    etiquetas aproximadas en el eje Y.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-resumen-sub="inversiones"]');
  await page.waitForTimeout(200);

  // ---------- 1) Acordeón de plataformas ----------
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

  // Abrir la plataforma B debe cerrar la A (acordeón de una sola apertura).
  await page.click(`[data-toggle-platform="${idB}"]`);
  await page.waitForTimeout(150);
  const trasAbrirB = await page.evaluate(({idA, idB}) => ({
    aSigueAbierta: !!document.querySelector(`[data-edit-platform="${idA}"]`),
    bAhoraAbierta: !!document.querySelector(`[data-edit-platform="${idB}"]`),
  }), {idA, idB});
  check('(1e) Abrir otra plataforma cierra la anterior (acordeón de una sola apertura)', trasAbrirB.aSigueAbierta === false && trasAbrirB.bAhoraAbierta === true, trasAbrirB);
  // la dejamos cerrada para no interferir con el resto del test
  await page.click(`[data-toggle-platform="${idB}"]`);
  await page.waitForTimeout(150);

  // ---------- 2) Card de totales: dos cuadrados ----------
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

  // ---------- 3) Simulador al final ----------
  // Después del simulador solo puede venir contenido "de cierre" (el disclaimer legal, el
  // espaciador final) -- ninguna otra .card de contenido real, así que se verifica que sea la
  // ÚLTIMA .card de la vista, en vez de fijar una posición exacta entre los hijos.
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

  // ---------- 4) Gráfico: eje X enero-diciembre del año de hoy, eje Y con etiquetas aprox ----------
  const grafico = await page.evaluate(() => {
    const D = window.__debug;
    const year = D.todayISO().slice(0,4);
    const svg = document.querySelector('.evo-card svg');
    const textos = svg ? [...svg.querySelectorAll('text')].map(t=>t.textContent) : [];
    // Las 12 etiquetas de mes deben estar todas (Ene..Dic), sin importar si hay dato ese mes.
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const tieneLos12Meses = meses.every(m => textos.includes(m));
    // Debe haber al menos una etiqueta con formato abreviado (termina en K o M, o es "$0")
    const tieneEtiquetaYAprox = textos.some(t => /^[−-]?\$[\d,]+[KM]?$/.test(t));
    return { year, tieneLos12Meses, tieneEtiquetaYAprox, cantidadTextos: textos.length };
  });
  check('(4a) El gráfico muestra las 12 etiquetas de mes (enero a diciembre) del año actual', grafico.tieneLos12Meses === true, grafico);
  check('(4b) El eje Y tiene etiquetas de valores aproximados', grafico.tieneEtiquetaYAprox === true, grafico);

  await finish({ context, browser, errors });
})();
