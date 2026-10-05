// La app tiene que abrir en el MES ACTUAL, siempre.
//
// El bug: state.monthIndex es un ÍNDICE dentro de MONTHS, y MONTHS se muta. currentMonthIndex()
// corre al inicializar state.ts, cuando el array llega hasta el último mes escrito a mano --
// empuja el mes actual y devuelve su posición. Pero después los datos de muestra
// (ensureMonthExists, las cuotas proyectadas) agregan meses INTERMEDIOS, el array se reordena, y
// ese índice queda apuntando a otro mes.
//
// En octubre de 2026 el síntoma era: la app abría en septiembre. Y pasaba inadvertido porque
// applyStateBlob() recalcula monthIndex al cargar los datos reales de Supabase, así que solo se
// veía con la maqueta -- o sea, en los tests, que empezaron a fallar solos el 1 de octubre.
//
// Este test es independiente de la fecha: compara contra todayISO() en vez de contra un mes
// escrito a mano, así que sigue sirviendo cualquier día de cualquier año.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    return {
      hoy: D.todayISO().slice(0, 7),
      MONTHS: D.MONTHS.slice(),
      monthIndex: D.state.monthIndex,
      mesAbierto: D.MONTHS[D.state.monthIndex],
    };
  });

  // ---------- controles positivos ----------
  // Si MONTHS tuviera un solo mes, "abre en el mes actual" pasaría por no haber alternativa.
  check('(control) MONTHS tiene varios meses, así que acertar no es trivial', r.MONTHS.length >= 3, r);
  check('(control) el mes actual está en MONTHS', r.MONTHS.includes(r.hoy), r);
  // El bug dependía de que hubiera meses POSTERIORES al último escrito a mano y además meses
  // intermedios agregados después. Si el mes actual fuera el último del array, el índice viejo
  // habría acertado por casualidad.
  check('(control) el mes actual es el último de MONTHS, que es donde el índice viejo fallaba',
    r.MONTHS[r.MONTHS.length - 1] === r.hoy, r);

  // ---------- el bug ----------
  check('la app abre en el mes actual', r.mesAbierto === r.hoy, r);

  // ---------- y en pantalla ----------
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  await page.click('[data-summary-sub="balance"]');
  await page.waitForTimeout(250);
  const label = await page.$eval('.m-label', el => el.textContent.trim());
  const esperado = await page.evaluate(() => {
    const D = window.__debug;
    return D.MONTH_LABEL[D.todayISO().slice(0, 7)] || null;
  });
  check('(control) hay una etiqueta para el mes actual', !!esperado, { esperado });
  check('Balance muestra el mes actual en el selector', label === esperado, { label, esperado });

  await browser.close();
  finish(errors);
})();
