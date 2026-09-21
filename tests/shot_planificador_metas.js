// El planificador de sueldo reparte el excedente del mes entre destinos. Dos cosas se arreglan
// acá, las dos consecuencia de que aporteMensualMeta y la plataforma puedan no estar:
//
// 1. Una meta de "aporta lo que puedas" (sin aporteMensualMeta) mostraba literalmente
//    "Meta de aporte: $NaN/mes". La fila pasaba el campo opcional directo a money(), que hace
//    Math.round(undefined) -> NaN. Visto en pantalla, no deducido leyendo el código.
//
// 2. El planificador listaba INVESTMENT_GOALS directo, así que seguía ofreciendo como destino
//    metas de plataformas ya cerradas. Por la decisión de producto de que cerrar una plataforma
//    la saca de TODO, ahora pasa por metasContables(), la misma fuente única que usan el total
//    invertido y el objetivo del año.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const armarYRenderizar = () => page.evaluate(() => {
    const D = window.__debug;
    const mes = D.todayISO().slice(0, 7);
    D.INVESTMENT_GOALS.length = 0;
    Object.keys(D.PLATFORM_DATA).forEach(id => { delete D.PLATFORM_DATA[id].archivada; });
    const meta = (id, nombre, plataformaId, aporteMensualMeta) => ({
      id, nombre, plataformaId, aporteMensualMeta, plazo: 'largo', comision: null,
      startMonth: mes, startingAmount: 0, checks: {}
    });
    // Sin aporte fijo -- el caso del $NaN
    D.INVESTMENT_GOALS.push(meta('m_flujo', 'Lo que pueda', 'fintual', undefined));
    // Con aporte fijo -- el caso normal, que tiene que seguir mostrando el monto
    D.INVESTMENT_GOALS.push(meta('m_fijo', 'Pie depto', 'fintual', 200000));
    // En otra plataforma, para poder cerrarla sin tocar las de arriba
    D.INVESTMENT_GOALS.push(meta('m_cerrable', 'Cripto', 'buda', 50000));
    D.state.tab = 'resumen'; D.state.summarySub = 'inversiones'; D.render();
  });

  const leerPlanificador = () => page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll('.plan-row')).map(e => e.textContent);
    // Solo lo RENDERIZADO: document.body.textContent incluiría el texto del <script> inline, que
    // contiene "NaN" como parte del bundle (isNaN, etc.) y daría un falso positivo.
    const vista = document.getElementById('view-root');
    return { filas, textoCompleto: filas.join(' | '),
      hayNaN: !!vista && vista.textContent.includes('NaN') };
  });

  await armarYRenderizar();
  await page.waitForTimeout(250);
  const inicial = await leerPlanificador();

  // Control positivo: si el planificador no está en pantalla con sus filas, nada de lo de abajo
  // prueba algo.
  check('(control) el planificador está en pantalla con las 3 metas', inicial.filas.length === 3, inicial.textoCompleto);

  check('una meta sin aporte mensual fijo NO muestra "$NaN"', /NaN/.test(inicial.textoCompleto) === false, inicial.textoCompleto);
  check('   y en ninguna parte de la pantalla aparece NaN', inicial.hayNaN === false, null);
  check('   dice explícitamente que no tiene monto fijo',
    /Sin monto fijo/.test(inicial.textoCompleto) && /aporta lo que puedas/.test(inicial.textoCompleto), inicial.textoCompleto);
  check('una meta CON aporte fijo sigue mostrando su monto', /Meta de aporte: \$200\.000\/mes/.test(inicial.textoCompleto), inicial.textoCompleto);

  // ---------- Cerrar la plataforma saca su meta del planificador ----------
  const trasCerrar = await page.evaluate(() => {
    const D = window.__debug;
    D.PLATFORM_DATA['buda'].archivada = true;
    D.render();
    const filas = Array.from(document.querySelectorAll('.plan-row')).map(e => e.textContent);
    return { filas, textoCompleto: filas.join(' | ') };
  });
  await page.waitForTimeout(150);
  check('al cerrar la plataforma, su meta deja de ofrecerse como destino del sueldo',
    /Cripto/.test(trasCerrar.textoCompleto) === false, trasCerrar.textoCompleto);
  check('   y las metas de las plataformas abiertas siguen ahí',
    /Pie depto/.test(trasCerrar.textoCompleto) && /Lo que pueda/.test(trasCerrar.textoCompleto), trasCerrar.textoCompleto);

  // Y vuelve al reabrirla: el filtro es por estado actual, no una eliminación.
  const trasReabrir = await page.evaluate(() => {
    const D = window.__debug;
    delete D.PLATFORM_DATA['buda'].archivada;
    D.render();
    return Array.from(document.querySelectorAll('.plan-row')).map(e => e.textContent).join(' | ');
  });
  check('   al reabrir la plataforma su meta vuelve (se filtra, no se borra)', /Cripto/.test(trasReabrir), trasReabrir);

  await finish({ context, browser, errors });
})();
