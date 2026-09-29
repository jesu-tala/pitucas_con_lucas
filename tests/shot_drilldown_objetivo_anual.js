// "Objetivo de inversión [año]" muestra cuánto llevas aportado este año, pero ese número no
// tenía forma de abrirse: no había manera de ver QUÉ transacciones lo componen. Ahora el monto
// es tocable y lleva a esas transacciones, mismo patrón de "tocar un número -> ver su detalle"
// que el drill-down del donut de Balance.
//
// El desglose tiene que ser EXACTO, no aproximado: el filtro muestra las transacciones de
// inversión del año categorizadas a las metas con aporte fijo que cuentan -- las mismas que
// suman a la cifra. Si mostrara "todas las inversiones" incluiría años anteriores, metas sin
// aporte fijo y plataformas cerradas, y la suma de lo listado no daría el número de arriba.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const armado = await page.evaluate(() => {
    const D = window.__debug;
    const anio = D.todayISO().slice(0, 4);
    const anterior = String(Number(anio) - 1);
    const mes = anio + '-03';
    D.TRANSACTIONS.length = 0;
    D.INVESTMENT_GOALS.length = 0;
    Object.keys(D.PLATFORM_DATA).forEach(id => { delete D.PLATFORM_DATA[id].archivada; });
    const meta = (id, nombre, plataformaId, aporte) => ({ id, nombre, plataformaId,
      aporteMensualMeta: aporte, plazo: 'largo', comision: null, startMonth: anterior + '-01',
      startingAmount: 0, checks: {} });
    D.INVESTMENT_GOALS.push(meta('m_fijo', 'Pie depto', 'fintual', 200000));   // cuenta
    D.INVESTMENT_GOALS.push(meta('m_flujo', 'Lo que pueda', 'fintual', undefined)); // sin aporte fijo
    D.INVESTMENT_GOALS.push(meta('m_cerrada', 'Cripto', 'buda', 50000));       // plataforma se cerrará

    const tx = (id, fecha, cat, monto) => D.TRANSACTIONS.push({ id, fecha, hora: '10:00',
      comercio: 'Aporte ' + id, monto, medio: 'efectivo', tipo: 'inversion', recurrencia: 'variable',
      estado: 'confirmado', categorias: [{ cat, monto }], porCobrar: [], reglaAuto: false, nota: '' });

    tx('SI_1', mes + '-05', 'm_fijo', 300000);              // sí: meta con aporte fijo, este año
    tx('SI_2', anio + '-04-05', 'm_fijo', 100000);          // sí
    tx('NO_anioViejo', anterior + '-05-05', 'm_fijo', 900000);  // no: otro año
    tx('NO_sinAporteFijo', mes + '-06', 'm_flujo', 70000);  // no: meta sin aporte mensual fijo
    tx('NO_general', mes + '-07', 'fintual__general', 50000);   // no: bucket General
    tx('NO_cerrada', mes + '-08', 'm_cerrada', 40000);      // no (una vez cerrada la plataforma)

    D.PLATFORM_DATA['buda'].archivada = true;
    D.state.tab = 'resumen'; D.state.summarySub = 'inversiones'; D.render();
    return { anio, avance: D.annualInvestmentGoalProgress(anio).aporteAnio };
  });
  await page.waitForTimeout(250);

  check('(control) el avance del año son los 400.000 de la meta con aporte fijo, no todo lo invertido',
    armado.avance === 400000, armado);

  const hayBoton = await page.evaluate(() =>
    !!document.querySelector('[data-drill-aporte-anio]'));
  check('el monto del avance es tocable', hayBoton === true, null);

  await page.click('[data-drill-aporte-anio]');
  await page.waitForTimeout(300);

  const tras = await page.evaluate(() => {
    const D = window.__debug;
    const ids = Array.from(document.querySelectorAll('[data-tx]')).map(e => e.getAttribute('data-tx'));
    return {
      tab: D.state.tab,
      ids,
      sumaListada: ids.reduce((s, id) => {
        const t = D.TRANSACTIONS.find(x => x.id === id);
        return s + (t ? t.monto : 0);
      }, 0),
      textoPill: (document.querySelector('[data-clear-catfilter]') || {}).textContent || ''
    };
  });

  check('tocarlo navega a Transacciones', tras.tab === 'transacciones', tras.tab);
  check('   muestra exactamente las transacciones que componen la cifra',
    tras.ids.slice().sort().join(',') === 'SI_1,SI_2', tras.ids);
  check('   y lo listado suma exactamente el número de arriba (400.000)',
    tras.sumaListada === armado.avance, tras);
  check('   deja ver de qué es el filtro, con el año', /Aportes a metas con aporte fijo/.test(tras.textoPill) && tras.textoPill.includes(armado.anio), tras.textoPill);

  // Cada exclusión por separado, para que si mañana se rompe una sola se sepa cuál.
  check('   excluye lo aportado en años anteriores', tras.ids.indexOf('NO_anioViejo') === -1, tras.ids);
  check('   excluye las metas sin aporte mensual fijo', tras.ids.indexOf('NO_sinAporteFijo') === -1, tras.ids);
  check('   excluye el bucket General de la plataforma', tras.ids.indexOf('NO_general') === -1, tras.ids);
  check('   excluye las metas de plataformas cerradas', tras.ids.indexOf('NO_cerrada') === -1, tras.ids);

  // La pill se puede soltar: el drill-down no deja a la usuaria atrapada en un filtro.
  await page.click('[data-clear-catfilter]');
  await page.waitForTimeout(200);
  const trasLimpiar = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-tx]')).map(e => e.getAttribute('data-tx')).length);
  check('   y el filtro se puede soltar para volver a ver todo', trasLimpiar === 6, trasLimpiar);

  await finish({ context, browser, errors });
})();
