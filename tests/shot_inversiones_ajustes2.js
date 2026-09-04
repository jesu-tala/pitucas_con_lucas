// Second round of adjustments to Investments requested by the user after the redesign:
// (2) the "Aportado neto"/"Ganancia-pérdida aprox." tiles are smaller/more discreet.
// (3) the TOTAL investment goal (month by month) also generates a streak, same as the per-platform
//     goals.
// (4) inside a goal, the "Comisión anual" row is separated from the progress bar and
//     smaller/more discreet; and the month tiles extend all the way to December (not only
//     up to the last month with real data).
// (5) the simulator is no longer green and its text is quite a bit shorter.
// (6)+(7) Balance's investment % comes from the sum of "aporte mensual meta" across ALL
//     goals (all platforms), and Investments shows that same small monthly amount.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-summary-sub="inversiones"]');
  await page.waitForTimeout(200);

  // ---------- (2) Smaller total tiles ----------
  const totalTiles = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.platform-total-label')].find(el => el.textContent.includes('Total invertido'));
    const grid = label ? label.closest('.card').querySelector('.stat-grid') : null;
    if (!grid) return null;
    const tile = grid.querySelector('.stat-tile');
    const cs = tile ? getComputedStyle(tile) : null;
    return {
      esCompacto: grid.classList.contains('stat-grid-compact'),
      paddingTop: cs ? parseFloat(cs.paddingTop) : null,
    };
  });
  check('(2) La card de totales usa el modificador .stat-grid-compact', totalTiles && totalTiles.esCompacto === true, totalTiles);
  check('(2) El padding de esos cuadrados es más chico que el de Balance (14px)', totalTiles && totalTiles.paddingTop < 12, totalTiles);

  // ---------- (3) Total goal streak ----------
  // Marks the last 3 months (including the current one) as completed, to force a
  // streak of 3 -- same criterion as metaRacha for a single goal.
  const rachaInfo = await page.evaluate(() => {
    const D = window.__debug;
    const year = D.todayISO().slice(0, 4);
    const mesActual = D.todayISO().slice(0, 7);
    const months = D.fullYearMonths(year).filter(m => m <= mesActual);
    months.forEach(m => { D.TOTAL_GOAL_CHECKS[m] = false; });
    const last3 = months.slice(-3);
    last3.forEach(m => { D.TOTAL_GOAL_CHECKS[m] = true; });
    D.render();
    return { calculada: D.metaTotalRacha() };
  });
  check('(3 setup) metaTotalRacha() calcula 3 tras marcar los últimos 3 meses', rachaInfo.calculada === 3, rachaInfo);
  await page.waitForTimeout(150);
  const rachaUi = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.meta-total-checks-label')][0];
    const badge = label ? label.querySelector('.meta-racha-badge') : null;
    const rachaTexto = document.querySelector('.meta-racha')?.textContent || '';
    return { badgeTexto: badge ? badge.textContent : null, rachaTexto };
  });
  check('(3) Aparece el badge de racha (3 🔥) junto al objetivo total', rachaUi.badgeTexto && rachaUi.badgeTexto.includes('3'), rachaUi);
  check('(3) El texto de abajo dice "Racha activa" con el objetivo total', rachaUi.rachaTexto.includes('Racha activa') && rachaUi.rachaTexto.includes('objetivo total'), rachaUi);

  // ---------- (4) Inside a goal: commission + tiles up to year end ----------
  // Opens the Banco de Chile platform (banco_chile), which has 2 goals with commission set
  // to null -- we set a commission on "Fondo de emergencia" (m1) so we can see its row.
  await page.evaluate(() => {
    const D = window.__debug;
    const m1 = D.INVESTMENT_GOALS.find(m => m.id === 'm1');
    m1.comision = 1.2;
    D.render();
  });
  await page.click('[data-toggle-platform="banco_chile"]');
  await page.waitForTimeout(200);
  const metaCard = await page.evaluate(() => {
    const nameEl = [...document.querySelectorAll('.meta-goal-name')].find(el => el.textContent.includes('Fondo de emergencia'));
    const card = nameEl ? nameEl.closest('.meta-goal-card') : null;
    if (!card) return null;
    const track = card.querySelector('.budget-track');
    const comisionRow = card.querySelector('.platform-comision-row');
    const cs = comisionRow ? getComputedStyle(comisionRow) : null;
    const chips = [...card.querySelectorAll('.meta-check-chip')].map(c => c.querySelector('.mcc-label')?.textContent);
    return {
      tieneComision: !!comisionRow,
      marginTop: cs ? parseFloat(cs.marginTop) : null,
      fontSize: cs ? parseFloat(cs.fontSize) : null,
      chips,
    };
  });
  check('(4a) La fila de comisión anual tiene separación con la barra de progreso (margin-top >= 8px)', metaCard && metaCard.marginTop >= 8, metaCard);
  check('(4a) Y se ve chica (font-size <= 11px)', metaCard && metaCard.fontSize <= 11, metaCard);
  // m1 (Fondo de emergencia) has history from April to August 2026 -- the tiles should
  // reach all the way to December (9 months: Abr..Dic), not just up to Ago (5 months).
  check('(4b) Los cuadraditos de mes llegan hasta diciembre (9 meses: abr-dic), no solo hasta el último dato', metaCard && metaCard.chips.length === 9 && metaCard.chips[metaCard.chips.length - 1] === 'Dic', metaCard);
  check('   incluye un mes futuro sin dato real (Sep) como cuadradito no marcado', metaCard && metaCard.chips.includes('Sep'), metaCard);

  // ---------- (5) Simulator: no green, short text ----------
  const simulador = await page.evaluate(() => {
    const card = document.querySelector('.proyeccion-card');
    const cs = card ? getComputedStyle(card) : null;
    const texto = document.querySelector('.proyeccion-text')?.textContent || '';
    const caption = document.querySelector('.proyeccion-caption')?.textContent || '';
    return {
      bg: cs ? cs.backgroundColor : null,
      largoTexto: texto.length,
      largoCaption: caption.length,
      mencionaSupuesto: (texto + ' ' + caption).includes('supuesto moderado'),
    };
  });
  // The theme's "sage" green (light) is rgb(199, 217, 183) -- we confirm it's no longer that tone.
  check('(5) El fondo del simulador ya no es el verde sage de antes', simulador.bg !== 'rgb(199, 217, 183)', simulador);
  check('(5) El texto principal quedó breve (<140 caracteres, antes >220)', simulador.largoTexto < 140, simulador);
  check('(5) Ya no menciona el párrafo largo sobre el "supuesto moderado"', simulador.mencionaSupuesto === false, simulador);

  // ---------- (6)+(7) investment % = sum of goals across ALL platforms ----------
  const metaCheck = await page.evaluate(() => {
    const D = window.__debug;
    const sumaAportes = D.INVESTMENT_GOALS.reduce((s, m) => s + (m.aporteMensualMeta || 0), 0);
    const esperado = { suma: sumaAportes, mensualCLP: D.monthlyInvestmentGoalCLP(), pct: D.investmentGoalPct() };
    return esperado;
  });
  check('(6/7 setup) monthlyInvestmentGoalCLP() = suma de aporteMensualMeta de TODAS las metas', metaCheck.mensualCLP === metaCheck.suma, metaCheck);

  // (7) In Investments, the "Objetivo de inversión" card shows that same monthly amount.
  const objetivoLine = await page.evaluate(() => document.body.textContent.match(/Aporte mensual objetivo: \$[\d.,]+ · \d+% de tus ingresos/)?.[0] || null);
  check('(7) Se ve "Aporte mensual objetivo" con el monto y % en Inversiones', !!objetivoLine, objetivoLine);

  // (6) In Balance, the Investment goal (the %) is that same calculation -- read from the fixed text
  // that says "tu meta de Inversión (X%) sale sola de lo que ya definiste en Inversiones".
  await page.click('[data-summary-sub="balance"]');
  await page.waitForTimeout(200);
  const balancePct = await page.evaluate(() => {
    const caption = [...document.querySelectorAll('.meta-caption')].map(el => el.textContent).find(t => t.includes('meta de Inversión'));
    const m = caption ? caption.match(/meta de Inversión \((\d+)%\)/) : null;
    return m ? parseInt(m[1], 10) : null;
  });
  check('(6) El % de meta de Inversión en Balance coincide con la suma de metas de todas las plataformas', balancePct === Math.round(metaCheck.pct), { balancePct, esperado: Math.round(metaCheck.pct) });

  await finish({ context, browser, errors });
})();
