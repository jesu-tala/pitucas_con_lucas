// Inconsistencia reportada: "total invertido $0" conviviendo en pantalla con un avance del
// objetivo del año mayor que cero. Los dos números se contradecían y no había forma de saber
// cuál creer.
//
// La causa NO era que leyeran datos distintos (la sospecha inicial era que el avance leía el
// historial manual de las metas -- ese historial ya no existe, todo se deriva de TRANSACTIONS).
// Era que recorrían los MISMOS datos por caminos distintos:
//
//   annualInvestmentGoalProgress  ->  itera INVESTMENT_GOALS directo
//   todo lo de "invertido"        ->  activePlatformIds() -> goalsForPlatform()
//
// Así, una meta cuya plataforma estaba archivada (o cuyo plataformaId ya no existe en CATEGORIES)
// desaparecía de un recorrido y seguía contando en el otro.
//
// Decisión de producto: cerrar una plataforma la saca de TODO, no solo del total. Por eso acá se
// exige que ambos números se muevan juntos. El costo aceptado es que la barra del objetivo del
// año retrocede al cerrar una plataforma, que es el precio de que nunca se contradigan.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const armar = () => page.evaluate(() => {
    const D = window.__debug;
    const anio = D.todayISO().slice(0, 4);
    const mes = anio + '-03';
    D.TRANSACTIONS.length = 0;
    D.INVESTMENT_GOALS.length = 0;
    Object.keys(D.PLATFORM_DATA).forEach(id => { delete D.PLATFORM_DATA[id].archivada; });
    D.INVESTMENT_GOALS.push({ id: 'meta_pie', nombre: 'Pie depto', montoObjetivo: 12000000,
      aporteMensualMeta: 200000, plataformaId: 'fintual', plazo: 'largo', comision: null,
      startMonth: mes, startingAmount: 0, checks: {} });
    D.TRANSACTIONS.push({ id: 'i1', fecha: mes + '-10', hora: '10:00', comercio: 'Aporte Fintual',
      monto: 300000, medio: 'efectivo', tipo: 'inversion', recurrencia: 'variable',
      estado: 'confirmado', categorias: [{ cat: 'meta_pie', monto: 300000 }], porCobrar: [],
      reglaAuto: false, nota: '' });
    return anio;
  });

  const medir = () => page.evaluate(() => {
    const D = window.__debug;
    const anio = D.todayISO().slice(0, 4);
    return {
      totalInvertido: D.activePlatformIds().reduce((s, id) => s + D.platformAportadoNeto(id), 0),
      anual: D.annualInvestmentGoalProgress(anio)
    };
  });

  const anio = await armar();

  // Control positivo: sin nada archivado los dos números ya coinciden. Si este control fallara,
  // el resto del test no estaría probando lo que dice probar.
  const base = await medir();
  check('(control) con la plataforma activa, total invertido y avance del año coinciden',
    base.totalInvertido === 300000 && base.anual.aporteAnio === 300000, base);
  check('(control) y el objetivo del año es de flujo: aporte mensual × 12',
    base.anual.objetivoAnual === 2400000, base.anual);

  // ---------- Camino 1: plataforma archivada ----------
  // Éste es el caso exacto que se reportó: total invertido en 0, avance intacto.
  const archivada = await page.evaluate(() => {
    const D = window.__debug;
    D.PLATFORM_DATA['fintual'].archivada = true;
    const anio = D.todayISO().slice(0, 4);
    return {
      totalInvertido: D.activePlatformIds().reduce((s, id) => s + D.platformAportadoNeto(id), 0),
      anual: D.annualInvestmentGoalProgress(anio)
    };
  });
  check('al cerrar la plataforma, el total invertido baja a 0', archivada.totalInvertido === 0, archivada);
  check('y el avance del año baja con él (no se queda contando plata que ya no está en ningún total)',
    archivada.anual.aporteAnio === 0, archivada);
  check('   el objetivo del año también sale: sin plataforma viva no hay compromiso que medir',
    archivada.anual.objetivoAnual === 0, archivada);
  check('   y tampoco reaparece por la puerta de atrás como "aporte sin objetivo fijo"',
    archivada.anual.otrosAporteAnio === 0, archivada);

  // ---------- Camino 2: meta huérfana (plataformaId que no existe) ----------
  const huerfana = await page.evaluate(() => {
    const D = window.__debug;
    const anio = D.todayISO().slice(0, 4);
    const mes = anio + '-03';
    delete D.PLATFORM_DATA['fintual'].archivada;
    D.INVESTMENT_GOALS.push({ id: 'meta_huerfana', nombre: 'Huérfana', aporteMensualMeta: 50000,
      plataformaId: 'plataforma_que_no_existe', plazo: 'largo', comision: null,
      startMonth: mes, startingAmount: 0, checks: {} });
    D.TRANSACTIONS.push({ id: 'i2', fecha: mes + '-11', hora: '10:00', comercio: 'Aporte suelto',
      monto: 150000, medio: 'efectivo', tipo: 'inversion', recurrencia: 'variable',
      estado: 'confirmado', categorias: [{ cat: 'meta_huerfana', monto: 150000 }], porCobrar: [],
      reglaAuto: false, nota: '' });
    return {
      totalInvertido: D.activePlatformIds().reduce((s, id) => s + D.platformAportadoNeto(id), 0),
      anual: D.annualInvestmentGoalProgress(anio)
    };
  });
  check('una meta cuya plataforma no existe tampoco infla el avance del año',
    huerfana.anual.aporteAnio === 300000, huerfana);
  check('   ni el objetivo del año (no se compromete contra una plataforma que no está)',
    huerfana.anual.objetivoAnual === 2400000, huerfana);
  check('   y el total invertido sigue siendo el mismo, así que los dos números no se separan',
    huerfana.totalInvertido === 300000, huerfana);

  await finish({ context, browser, errors });
})();
