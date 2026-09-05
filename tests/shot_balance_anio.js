// Balance > vista anual: el mismo donut por categoría + card "Fijo · Variable · Inversión" que
// ya existía para el mes, ahora también disponible para el año en curso completo (selector
// Mes/Año arriba de Balance). renderDonutBlock/renderGoalSummaryCard no cambiaron su matemática
// interna (ver ui/donut.ts) -- lo nuevo es la agregación de 12 meses en presupuesto.ts
// (renderBalanceViewAnio) y la regla de reescalar la meta de Inversión (que nace como un monto
// MENSUAL fijo) contra el ingreso ACUMULADO de los meses ya transcurridos del año, nunca contra
// el ingreso de un solo mes ni proyectando los 12 meses completos.
const { openApp, check, finish } = require('./lib/test_kit');

function parseMoney(txt){
  if(txt==null) return NaN;
  return parseInt(String(txt).replace(/[^\d\-]/g,''),10) || 0;
}

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- Fixture: income spread unevenly across the year, to make a wrong elapsed-months
  // or wrong single-month-income implementation visibly wrong ----------
  const setup = await page.evaluate(() => {
    const D = window.__debug;
    const year = D.todayISO().slice(0,4);
    const mesActual = D.todayISO().slice(0,7);
    // Deliberately uneven amounts, in months that had ZERO income before (Jan/Feb/Mar) plus the
    // current month (Sep, in this sandbox's clock) -- large enough swings that projecting all 12
    // months, or using only one month's income as the denominator, gives a clearly different
    // number than the correct one.
    const fixture = [
      {id:'test-anio-ene', fecha:year+'-01-10', hora:'09:00', comercio:'Sueldo Enero (test)', monto:400000, medio:'cuenta_vista', tipo:'ingreso', recurrencia:'mensual', estado:'confirmado', categorias:[{cat:'sueldo',monto:400000}], porCobrar:[], reglaAuto:false, nota:''},
      {id:'test-anio-feb', fecha:year+'-02-10', hora:'09:00', comercio:'Sueldo Febrero (test)', monto:3000000, medio:'cuenta_vista', tipo:'ingreso', recurrencia:'mensual', estado:'confirmado', categorias:[{cat:'sueldo',monto:3000000}], porCobrar:[], reglaAuto:false, nota:''},
      {id:'test-anio-mar', fecha:year+'-03-10', hora:'09:00', comercio:'Sueldo Marzo (test)', monto:100000, medio:'cuenta_vista', tipo:'ingreso', recurrencia:'mensual', estado:'confirmado', categorias:[{cat:'sueldo',monto:100000}], porCobrar:[], reglaAuto:false, nota:''},
      {id:'test-anio-sep', fecha:mesActual+'-02', hora:'09:00', comercio:'Sueldo mes actual (test)', monto:700000, medio:'cuenta_vista', tipo:'ingreso', recurrencia:'mensual', estado:'confirmado', categorias:[{cat:'sueldo',monto:700000}], porCobrar:[], reglaAuto:false, nota:''},
      // A gasto and an inversion added in one of those previously-empty months too, so the year
      // donut/stat-tile totals genuinely depend on summing ALL 12 months, not just the 5 months
      // (Apr-Aug) the app's sample data originally covered.
      {id:'test-anio-gasto-ene', fecha:year+'-01-12', hora:'10:00', comercio:'Supermercado Enero (test)', monto:55000, medio:'debito_bci', tipo:'gasto', recurrencia:'variable', estado:'confirmado', categorias:[{cat:'supermercado',monto:55000}], porCobrar:[], reglaAuto:false, nota:''},
      {id:'test-anio-inv-feb', fecha:year+'-02-15', hora:'10:00', comercio:'Aporte Fintual Febrero (test)', monto:120000, medio:'cuenta_vista', tipo:'inversion', recurrencia:'mensual', estado:'confirmado', categorias:[{cat:'m3',monto:120000}], porCobrar:[], reglaAuto:false, nota:''},
    ];
    fixture.forEach(t => D.TRANSACTIONS.push(t));

    // ---- Independently-recomputed truth, straight from raw TRANSACTIONS ----
    // Deliberately does NOT call monthTotals()/yearTotals() (those are exactly the functions
    // whose year-aggregation behavior is under test) -- it loops the whole TRANSACTIONS array by
    // hand and only reuses aggregatedTxAmount(), the already separately-tested PER-TRANSACTION
    // primitive (handles splits/settlements/no_es_gasto uniformly for month and year mode alike),
    // to get the per-transaction amount right without duplicating that unrelated logic here.
    let yearIngresos=0, yearGastos=0, yearInversiones=0;
    D.TRANSACTIONS.forEach(t=>{
      if(t.fecha.slice(0,4)!==year) return;
      if(t.estado==='no_es_gasto') return;
      const monto = D.aggregatedTxAmount(t);
      if(t.tipo==='ingreso') yearIngresos += monto;
      else if(t.tipo==='gasto') yearGastos += monto;
      else if(t.tipo==='inversion') yearInversiones += monto;
    });

    // ---- Independently-recomputed "correct" year-mode Investment goal target % ----
    const mesesTranscurridos = D.fullYearMonths(year).filter(m => m <= mesActual);
    const objetivoAcumuladoCorrecto = D.monthlyInvestmentGoalCLP() * mesesTranscurridos.length;
    const metaInvPctCorrecto = yearIngresos>0 ? (objetivoAcumuladoCorrecto/yearIngresos)*100 : 0;

    // ---- The two wrong alternatives a buggy implementation might produce instead ----
    const objetivoProyectado12Meses = D.monthlyInvestmentGoalCLP() * 12; // projects unlived months
    const metaInvPctWrongProjected12 = yearIngresos>0 ? (objetivoProyectado12Meses/yearIngresos)*100 : 0;
    const ingresoSoloMesActual = D.monthTotals(mesActual).ingresos; // single month, not accumulated
    const metaInvPctWrongSingleMonth = ingresoSoloMesActual>0 ? (objetivoAcumuladoCorrecto/ingresoSoloMesActual)*100 : 0;

    const reembolsoAnioEsperado = D.reimbursementTotalForMonths(D.fullYearMonths(year));

    return {
      year, mesActual, monthsElapsedCount: mesesTranscurridos.length,
      yearIngresos, yearGastos, yearInversiones,
      metaInvPctCorrecto, metaInvPctWrongProjected12, metaInvPctWrongSingleMonth,
      reembolsoAnioEsperado,
    };
  });

  console.log('=== SETUP / GROUND TRUTH ===');
  console.log(JSON.stringify(setup, null, 1));

  check('(setup) El fixture cubre más de 5 meses distintos del año (no solo abril-agosto)',
    setup.monthsElapsedCount >= 8, setup.monthsElapsedCount);
  check('(setup) La meta correcta difiere claramente de "proyectar los 12 meses" (para que el test pueda distinguir un bug real)',
    Math.abs(setup.metaInvPctCorrecto - setup.metaInvPctWrongProjected12) > 3, setup);
  check('(setup) La meta correcta difiere claramente de "usar solo el ingreso del mes actual" (ídem)',
    Math.abs(setup.metaInvPctCorrecto - setup.metaInvPctWrongSingleMonth) > 3, setup);

  // ---------- Navigate to Balance, switch to year mode ----------
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);

  const segExists = await page.$('[data-seg="balance-periodo"]');
  check('El selector Mes/Año existe arriba de Balance', !!segExists);

  const mesActivoPorDefecto = await page.$eval('[data-seg="balance-periodo"] [data-seg-val="mes"]', el => el.classList.contains('active')).catch(()=>false);
  check('Por defecto Balance abre en modo Mes', mesActivoPorDefecto);

  // ---- Month mode regression: unchanged before touching year mode ----
  const mesInvPctAntes = await page.evaluate(() => {
    const caption = [...document.querySelectorAll('.meta-caption')].find(el => el.textContent.includes('meta de Inversión'));
    return caption ? parseInt((caption.textContent.match(/Inversión \((\d+)%\)/) || [])[1], 10) : null;
  });
  const investmentGoalPctReal = await page.evaluate(() => Math.round(window.__debug.investmentGoalPct()));
  check('Modo Mes: el % objetivo de Inversión sigue viniendo de investmentGoalPct() sin cambios (no de la fórmula anual)',
    mesInvPctAntes === investmentGoalPctReal, { uiMostrado: mesInvPctAntes, investmentGoalPctReal });

  await page.click('[data-seg="balance-periodo"] [data-seg-val="año"]');
  await page.waitForTimeout(200);

  const anioActivo = await page.$eval('[data-seg="balance-periodo"] [data-seg-val="año"]', el => el.classList.contains('active'));
  check('Tras tocar "Año", el segmento queda activo', anioActivo);

  const yearLabelText = await page.$eval('.m-label', el => el.textContent);
  check('El switcher muestra "Año <año actual>" (sin flechas de navegación)',
    yearLabelText.trim() === 'Año '+setup.year, yearLabelText);
  const hasNavButtons = await page.$('[data-month-nav]');
  check('En modo Año no hay botones de navegación de mes/año (siempre año actual, sin excepciones)', !hasNavButtons);

  // ---------- Stat tiles: year mode ----------
  const tiles = await page.evaluate(() => ({
    ingresos: document.querySelector('.stat-ingresos .stat-value').textContent,
    gastos: document.querySelector('.stat-gastos .stat-value').textContent,
    inversiones: document.querySelector('.stat-inversiones .stat-value').textContent,
    balance: document.querySelector('.stat-balance .stat-value').textContent,
  }));
  check('Stat tile Ingresos (año) == verdad recalculada desde TRANSACTIONS crudas',
    parseMoney(tiles.ingresos) === setup.yearIngresos, { ui: tiles.ingresos, esperado: setup.yearIngresos });
  check('Stat tile Gastos (año) == verdad recalculada desde TRANSACTIONS crudas',
    parseMoney(tiles.gastos) === setup.yearGastos, { ui: tiles.gastos, esperado: setup.yearGastos });
  check('Stat tile Inversiones (año) == verdad recalculada desde TRANSACTIONS crudas',
    parseMoney(tiles.inversiones) === setup.yearInversiones, { ui: tiles.inversiones, esperado: setup.yearInversiones });
  const balanceEsperado = setup.yearIngresos - setup.yearGastos - setup.yearInversiones;
  check('Stat tile Balance (año) == Ingresos-Gastos-Inversiones recalculado',
    parseMoney(tiles.balance) === balanceEsperado, { ui: tiles.balance, esperado: balanceEsperado });

  // ---------- Donut totals: year mode ----------
  const donutTotals = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.donut-card')];
    const byTitle = {};
    cards.forEach(c => {
      const title = c.querySelector('.donut-card-title')?.textContent;
      const total = c.querySelector('.dc-total')?.textContent;
      if(title) byTitle[title] = total;
    });
    return byTitle;
  });
  check('Donut "Ingresos por categoría" (año) == verdad recalculada',
    parseMoney(donutTotals['Ingresos por categoría']) === setup.yearIngresos, { ui: donutTotals['Ingresos por categoría'], esperado: setup.yearIngresos });
  check('Donut "Gastos por categoría" (año) == verdad recalculada',
    parseMoney(donutTotals['Gastos por categoría']) === setup.yearGastos, { ui: donutTotals['Gastos por categoría'], esperado: setup.yearGastos });
  check('Donut "Inversiones por categoría" (año) == verdad recalculada',
    parseMoney(donutTotals['Inversiones por categoría']) === setup.yearInversiones, { ui: donutTotals['Inversiones por categoría'], esperado: setup.yearInversiones });

  // ---------- Investment goal %: year mode, elapsed-months-scaled objective ----------
  const invPctUi = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.meta-row')];
    const row = rows.find(r => r.querySelector('.meta-row-name')?.textContent === 'Inversión');
    const marker = row ? row.querySelector('.meta-goal-marker') : null;
    return marker ? parseInt(marker.textContent, 10) : null;
  });
  check('Modo Año: el % objetivo de Inversión usa el ingreso ACUMULADO de los meses transcurridos (no un mes solo, no los 12 meses proyectados)',
    invPctUi === Math.round(setup.metaInvPctCorrecto), { ui: invPctUi, esperado: Math.round(setup.metaInvPctCorrecto) });
  check('   y NO coincide con la alternativa incorrecta de proyectar los 12 meses',
    invPctUi !== Math.round(setup.metaInvPctWrongProjected12), { ui: invPctUi, incorrectaProyectada: Math.round(setup.metaInvPctWrongProjected12) });
  check('   y NO coincide con la alternativa incorrecta de usar solo el ingreso del mes actual',
    invPctUi !== Math.round(setup.metaInvPctWrongSingleMonth), { ui: invPctUi, incorrectaMesSolo: Math.round(setup.metaInvPctWrongSingleMonth) });

  // ---------- Reembolso card: year mode aggregates across the whole year too ----------
  if(setup.reembolsoAnioEsperado.count > 0){
    const reembolsoText = await page.evaluate(() => {
      const label = [...document.querySelectorAll('.reembolso-label')].find(el => el.textContent.includes('este año'));
      const card = label ? label.closest('.reembolso-card') : null;
      return card ? card.querySelector('.reembolso-value').textContent : null;
    });
    check('Card de reembolso en modo Año dice "Reembolsado este año" y suma el año completo',
      reembolsoText != null && parseMoney(reembolsoText) === setup.reembolsoAnioEsperado.total,
      { ui: reembolsoText, esperado: setup.reembolsoAnioEsperado.total });
  }

  // ---------- Demo mode masks every amount in year mode ----------
  await page.evaluate(() => { window.__debug.state.demoMode = true; window.__debug.render(); });
  await page.waitForTimeout(150);
  const demoState = await page.evaluate(() => {
    const digitsIn = sel => { const el = document.querySelector(sel); return el ? /\d/.test(el.textContent) : null; };
    return {
      statIngresosMasked: !digitsIn('.stat-ingresos .stat-value'),
      statBalanceMasked: !digitsIn('.stat-balance .stat-value'),
      donutTotalMasked: !digitsIn('.dc-total'),
      legendMasked: [...document.querySelectorAll('.legend-value')].every(el => !/\d/.test(el.textContent)),
      metaAmtMasked: [...document.querySelectorAll('.meta-row-amt')].every(el => !/\d/.test(el.textContent)),
    };
  });
  check('Modo demo (año): stat tiles enmascarados', demoState.statIngresosMasked && demoState.statBalanceMasked, demoState);
  check('Modo demo (año): total del donut enmascarado', demoState.donutTotalMasked, demoState);
  check('Modo demo (año): leyenda del donut enmascarada', demoState.legendMasked, demoState);
  check('Modo demo (año): montos de la card Fijo/Variable/Inversión enmascarados', demoState.metaAmtMasked, demoState);
  await page.evaluate(() => { window.__debug.state.demoMode = false; window.__debug.render(); });
  await page.waitForTimeout(150);

  // ---------- Bridge from Evolución: "Ver desglose del año" lands on Balance in year mode ----------
  // First flip Balance back to month mode, so the bridge link is what puts it back into year
  // mode (otherwise this wouldn't prove the link does anything).
  await page.click('[data-seg="balance-periodo"] [data-seg-val="mes"]');
  await page.waitForTimeout(150);
  await page.click('[data-summary-sub="evolucion"]');
  await page.waitForTimeout(200);
  const bridgeBtn = await page.$('[data-goto-balance-anual]');
  check('Evolución muestra el link "Ver desglose del año" bajo el total del año', !!bridgeBtn);
  const bridgeIsUnderYearCard = await page.evaluate(() => {
    const btn = document.querySelector('[data-goto-balance-anual]');
    const title = [...document.querySelectorAll('.section-title')].find(el => el.textContent.includes('Total del año'));
    return !!(btn && title && btn.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING);
  });
  check('   y está debajo (no arriba) del título "Total del año"', bridgeIsUnderYearCard);
  const evolucionHasNoDonut = await page.evaluate(() => document.querySelectorAll('#resumen-content .donut-card').length === 0);
  check('Evolución no duplica ningún donut (sigue siendo solo barras + link)', evolucionHasNoDonut);

  await page.click('[data-goto-balance-anual]');
  await page.waitForTimeout(200);

  const afterBridge = await page.evaluate(() => ({
    tab: window.__debug.state.tab,
    summarySub: window.__debug.state.summarySub,
    balancePeriodo: window.__debug.state.balancePeriodo,
  }));
  check('El link deja tab=resumen, summarySub=balance, balancePeriodo=año',
    afterBridge.tab==='resumen' && afterBridge.summarySub==='balance' && afterBridge.balancePeriodo==='año', afterBridge);
  const anioActivoTrasBridge = await page.$eval('[data-seg="balance-periodo"] [data-seg-val="año"]', el => el.classList.contains('active'));
  check('   y la UI de Balance efectivamente aterriza ya en modo Año (segmento activo)', anioActivoTrasBridge);

  await finish({ context, browser, errors });
})();
