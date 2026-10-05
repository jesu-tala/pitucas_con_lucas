// El "aporte mensual objetivo" (y por lo tanto el % de Inversión de Balance) tiene que salir de
// la MISMA fuente que el total invertido y el objetivo del año: metasContables().
//
// El bug: monthlyInvestmentGoalCLP se había quedado recorriendo INVESTMENT_GOALS crudo mientras
// el resto del archivo ya usaba metasContables(). Contaba metas que no deben contar --las de una
// plataforma CERRADA y las HUÉRFANAS, cuya plataforma ya no existe-- e inflaba el objetivo
// mensual.
//
// Reportado como "aporte mensual objetivo: 111% de mis ingresos". Y lo delataba la propia
// pantalla: el objetivo ANUAL, a un centímetro de distancia, sale de metasContables() y por lo
// tanto decía otra cosa. Dos números contradiciéndose en la misma tarjeta.
//
// Lo que NO era el bug: las metas sin aporte mensual fijo ya aportaban 0 correctamente.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    D.INVESTMENT_GOALS.length = 0;

    D.CATEGORIES['plat_viva'] = { nombre: 'Viva', tipo: 'inversion', colorHue: 200, icon: 'trending' };
    D.PLATFORM_DATA['plat_viva'] = { valorHistorial: {}, fechaActualizacion: null, tasaAnual: null, comision: null, plazo: null };
    D.CATEGORIES['plat_cerrada'] = { nombre: 'Cerrada', tipo: 'inversion', colorHue: 300, icon: 'trending' };
    D.PLATFORM_DATA['plat_cerrada'] = { valorHistorial: {}, fechaActualizacion: null, tasaAnual: null, comision: null, plazo: null, archivada: true };

    D.INVESTMENT_GOALS.push(
      { id: 'm_viva', nombre: 'Meta viva', plataformaId: 'plat_viva', aporteMensualMeta: 200000, plazo: 'medio' },
      // De una plataforma cerrada: ya no es un compromiso vigente.
      { id: 'm_cerrada', nombre: 'De plataforma cerrada', plataformaId: 'plat_cerrada', aporteMensualMeta: 900000, plazo: 'medio' },
      // "Lo que pueda": sin monto fijo, no fija objetivo mensual.
      { id: 'm_sin_aporte', nombre: 'Lo que pueda', plataformaId: 'plat_viva', plazo: 'largo' },
      // Huérfana: su plataforma no existe en CATEGORIES.
      { id: 'm_huerfana', nombre: 'Plataforma borrada', plataformaId: 'plat_que_no_existe', aporteMensualMeta: 500000, plazo: 'medio' }
    );

    const anio = D.todayISO().slice(0, 4);
    return {
      objetivoMensual: D.monthlyInvestmentGoalCLP(),
      contables: D.metasContables().map(m => m.id),
      objetivoAnual: D.annualInvestmentGoalProgress(anio).objetivoAnual,
      // El escenario completo sumaría 1.600.000 si no se filtrara nada.
      sumaCruda: D.INVESTMENT_GOALS.reduce((s, m) => s + (m.aporteMensualMeta || 0), 0),
    };
  });

  // ---------- controles positivos ----------
  // Sin metas que DEBAN quedar fuera, "el objetivo es correcto" pasaría sin probar nada.
  check('(control) el escenario tiene metas que deben quedar fuera',
    r.sumaCruda === 1600000 && r.contables.length === 2, r);
  check('(control) metasContables deja fuera la cerrada y la huérfana',
    !r.contables.includes('m_cerrada') && !r.contables.includes('m_huerfana'), r.contables);

  // ---------- el bug ----------
  check('el aporte mensual objetivo cuenta solo las metas vigentes', r.objetivoMensual === 200000, r);
  check('NO cuenta la meta de una plataforma cerrada', r.objetivoMensual !== 1100000, r);
  check('NO cuenta la meta huérfana', r.objetivoMensual !== 700000, r);
  // La contradicción que delataba el bug en pantalla.
  check('el objetivo mensual y el anual cuentan lo mismo',
    r.objetivoAnual === r.objetivoMensual * 12, r);

  // ---------- lo que NO era el bug ----------
  // Una meta sin aporte fijo tiene que seguir aportando 0, no un valor derivado del total.
  const sinAporte = await page.evaluate(() => {
    const D = window.__debug;
    const antes = D.monthlyInvestmentGoalCLP();
    D.INVESTMENT_GOALS.push({ id: 'otra_sin_aporte', nombre: 'Otra sin monto', plataformaId: 'plat_viva',
      montoObjetivo: 12000000, plazo: 'largo' });
    const despues = D.monthlyInvestmentGoalCLP();
    D.INVESTMENT_GOALS.pop();
    return { antes, despues };
  });
  // montoObjetivo de $12.000.000 y plazo largo: si en algún lado se infiriera el aporte mensual
  // dividiendo el total por los meses, acá se vería saltar el objetivo. No debe moverse.
  check('una meta de stock SIN aporte fijo no suma nada al objetivo mensual',
    sinAporte.despues === sinAporte.antes, sinAporte);

  // ---------- y el % de Balance ----------
  const pct = await page.evaluate(() => {
    const D = window.__debug;
    return { pct: D.investmentGoalPct(), ingreso: D.referenceMonthlyIncome(), objetivo: D.monthlyInvestmentGoalCLP() };
  });
  check('(control) hay un ingreso de referencia con el que comparar', pct.ingreso > 0, pct);
  check('el % de Inversión sale del objetivo ya filtrado',
    Math.abs(pct.pct - (pct.objetivo / pct.ingreso) * 100) < 0.01, pct);

  await browser.close();
  finish(errors);
})();
