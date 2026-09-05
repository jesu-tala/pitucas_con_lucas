// Coverage for the stock-vs-flow redesign of investment goals:
//   - montoObjetivo (stock: save up to a total) and aporteMensualMeta (flow: a fixed monthly
//     amount) are now BOTH optional, independently.
//   - a goal without montoObjetivo never shows a stock progress bar, but still tracks
//     aportado/sparkline/streak correctly.
//   - a goal without aporteMensualMeta ("aporta lo que puedas") never adds to the monthly
//     objective total or to Balance's Investment % (monthlyInvestmentGoalCLP/investmentGoalPct),
//     but real contributions to it still count as real investment (aportado neto / Total
//     invertido) -- they just land in "otrosAporteAnio", never in the annual objective bar's
//     numerator.
//   - "Objetivo de inversión [año]" is now a FLOW metric: objetivoAnual = Σ(aporteMensualMeta)×12
//     over fixed-aporte goals, aporteAnio = this year's contributions to those SAME goals only --
//     a big contribution to a flow-only goal or to the seeded "Otros" platform must never move
//     that bar.
//   - "Otros": a system-seeded, zero-valuation platform for one-off investments -- contributions
//     count toward Aportado neto, its "ganancia/pérdida" is always exactly $0 (value===aportado
//     by construction), its two "Aportado vs. valor" lines move together (no artificial gap), it
//     can never host a goal, and it's never offered as the fallback platform for "crear meta".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-summary-sub="inversiones"]');
  await page.waitForTimeout(200);

  // ---------- baseline (before injecting anything) ----------
  const baseline = await page.evaluate(() => {
    const D = window.__debug;
    const year = D.todayISO().slice(0, 4);
    return {
      year,
      monthlyObj: D.monthlyInvestmentGoalCLP(),
      pct: D.investmentGoalPct(),
      annual: D.annualInvestmentGoalProgress(year),
      bchAportado: D.platformAportadoNeto('banco_chile'),
    };
  });

  // ---------- 1) goal with no montoObjetivo (flow-only) + no aporteMensualMeta ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.INVESTMENT_GOALS.push({
      id: 'mFlow', nombre: 'Ahorro libre', plataformaId: 'banco_chile', plazo: null, comision: null,
      startMonth: '2026-04', startingAmount: 0, checks: {}
      // deliberately no montoObjetivo, no aporteMensualMeta
    });
    D.render();
  });
  await page.click('[data-toggle-platform="banco_chile"]');
  await page.waitForTimeout(200);

  const flowCard = await page.evaluate(() => {
    const btn = document.querySelector('[data-edit-goal="mFlow"]');
    const card = btn ? btn.closest('.meta-goal-card') : null;
    if (!card) return null;
    return {
      hasStockFigs: !!card.querySelector('.meta-goal-figs'),
      hasTrack: !!card.querySelector('.budget-track'),
      hasAporteBlock: !!card.querySelector('.meta-goal-aporte'),
      hasSparkRow: !!card.querySelector('.meta-goal-spark-row'),
      hasCheckRow: !!card.querySelector('.meta-check-row'),
    };
  });
  check('(1a) Meta sin montoObjetivo ni aporteMensualMeta: se encuentra la tarjeta', !!flowCard, flowCard);
  check('(1b) ...no muestra la barra de progreso de stock (figs+track)', flowCard && !flowCard.hasStockFigs && !flowCard.hasTrack, flowCard);
  check('(1c) ...no muestra "Meta de aporte" (no tiene aporteMensualMeta)', flowCard && !flowCard.hasAporteBlock, flowCard);
  check('(1d) ...pero sí sigue mostrando sparkline y la fila de checks (racha/hábito intactos)', flowCard && flowCard.hasSparkRow && flowCard.hasCheckRow, flowCard);

  const afterAddingFlowGoal = await page.evaluate(() => {
    const D = window.__debug;
    return { monthlyObj: D.monthlyInvestmentGoalCLP(), pct: D.investmentGoalPct() };
  });
  check('(1e) Una meta sin aporteMensualMeta no suma al aporte mensual objetivo de Balance', afterAddingFlowGoal.monthlyObj === baseline.monthlyObj, { baseline, afterAddingFlowGoal });
  check('   ...ni a la meta de Inversión % de Balance', Math.abs(afterAddingFlowGoal.pct - baseline.pct) < 0.001, { baseline, afterAddingFlowGoal });

  // ---------- 2) a big contribution to that flow-only goal: counts as real investment, never as "objetivo" ----------
  const CONTRIB_FLOW = 5000000;
  const beforeFlowContrib = await page.evaluate(() => window.__debug.annualInvestmentGoalProgress(window.__debug.todayISO().slice(0, 4)));
  await page.evaluate((monto) => {
    const D = window.__debug;
    D.TRANSACTIONS.push({
      id: 't_flow_contrib', fecha: D.todayISO(), hora: '09:00', comercio: 'Aporte grande sin objetivo fijo',
      monto, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'mFlow', monto }], porCobrar: [], reglaAuto: false, nota: ''
    });
  }, CONTRIB_FLOW);
  const afterFlowContrib = await page.evaluate(() => {
    const D = window.__debug;
    const year = D.todayISO().slice(0, 4);
    return {
      annual: D.annualInvestmentGoalProgress(year),
      metaAportado: D.metaAportadoNeto(D.INVESTMENT_GOALS.find(m => m.id === 'mFlow')),
      bchAportado: D.platformAportadoNeto('banco_chile'),
    };
  });
  check('(2a) La meta refleja el aporte real', afterFlowContrib.metaAportado === CONTRIB_FLOW, afterFlowContrib);
  check('(2b) Sube el "Aportado neto" de su plataforma (cuenta como inversión real)', afterFlowContrib.bchAportado === baseline.bchAportado + CONTRIB_FLOW, { baseline, afterFlowContrib });
  check('(2c) NO mueve el objetivo anual (objetivoAnual sin cambio)', afterFlowContrib.annual.objetivoAnual === beforeFlowContrib.objetivoAnual, { beforeFlowContrib, afterFlowContrib });
  check('(2d) NI el numerador de la barra (aporteAnio sin cambio: solo cuenta metas con aporte fijo)', afterFlowContrib.annual.aporteAnio === beforeFlowContrib.aporteAnio, { beforeFlowContrib, afterFlowContrib });
  check('(2e) El aporte grande cae en otrosAporteAnio (informativo, nunca en el numerador)', afterFlowContrib.annual.otrosAporteAnio === beforeFlowContrib.otrosAporteAnio + CONTRIB_FLOW, { beforeFlowContrib, afterFlowContrib });

  // ---------- 3) "Otros": zero-valuation platform ----------
  // Uses a month within the fixture's own historical range (2026-04..2026-08, see MONTHS/
  // PLATFORM_DATA in state.ts) for the "Aportado vs. valor" chart checks below -- the real
  // platforms only have a valorHistorial entry through 2026-08, so today's real calendar month
  // (which the fixture data predates) would make mesTieneValorParaTodas() false for every
  // platform and turn both series null regardless of what "Otros" does.
  const CHART_MONTH = '2026-08';

  const otrosAntes = await page.evaluate((mesChart) => {
    const D = window.__debug;
    return {
      aportado: D.platformAportadoNeto('otros'),
      valor: D.platformCurrentValue('otros'),
      valorTotalMes: D.valorTotalEnMesONull(mesChart),
      aportadoTotalMes: D.aportadoAcumuladoHastaMesONull(mesChart),
    };
  }, CHART_MONTH);
  check('(3a) "Otros" arranca con ganancia $0 (valor === aportado)', otrosAntes.valor === otrosAntes.aportado, otrosAntes);

  const CONTRIB_OTROS = 2000000;
  await page.evaluate((monto) => {
    const D = window.__debug;
    D.TRANSACTIONS.push({
      id: 't_otros_contrib', fecha: '2026-08-20', hora: '11:00', comercio: 'Compra puntual fuera de plataforma',
      monto, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros__general', monto }], porCobrar: [], reglaAuto: false, nota: ''
    });
  }, CONTRIB_OTROS);

  const otrosDespues = await page.evaluate((mesChart) => {
    const D = window.__debug;
    const year = D.todayISO().slice(0, 4);
    return {
      aportado: D.platformAportadoNeto('otros'),
      valor: D.platformCurrentValue('otros'),
      valorTotalMes: D.valorTotalEnMesONull(mesChart),
      aportadoTotalMes: D.aportadoAcumuladoHastaMesONull(mesChart),
      annual: D.annualInvestmentGoalProgress(year),
    };
  }, CHART_MONTH);
  check('(3b) El aporte a "Otros" sube su Aportado neto', otrosDespues.aportado === otrosAntes.aportado + CONTRIB_OTROS, { otrosAntes, otrosDespues });
  check('(3c) Su "ganancia/pérdida" sigue siendo exactamente $0 sin importar cuánto se le aporte', otrosDespues.valor === otrosDespues.aportado, otrosDespues);
  check('(3d) El aporte a "Otros" tampoco mueve el objetivo anual ni su numerador', otrosDespues.annual.objetivoAnual === afterFlowContrib.annual.objetivoAnual && otrosDespues.annual.aporteAnio === afterFlowContrib.annual.aporteAnio, { afterFlowContrib, otrosDespues });
  check('(3e) ...cae en otrosAporteAnio junto con el resto de los aportes sin objetivo fijo', otrosDespues.annual.otrosAporteAnio === afterFlowContrib.annual.otrosAporteAnio + CONTRIB_OTROS, { afterFlowContrib, otrosDespues });
  // The two "Aportado vs. valor" lines must move TOGETHER for "Otros" -- no artificial gap
  // introduced just because it has no valuation of its own (platformAportadoNetoHastaMes mirrors
  // metaHistorialAt's pattern one level up, at the platform level).
  const deltaValor = otrosDespues.valorTotalMes - otrosAntes.valorTotalMes;
  const deltaAportado = otrosDespues.aportadoTotalMes - otrosAntes.aportadoTotalMes;
  check('(3f) Las 2 líneas del gráfico "Aportado vs. valor" se mueven exactamente juntas al aportar a "Otros"', deltaValor === CONTRIB_OTROS && deltaAportado === CONTRIB_OTROS, { otrosAntes, otrosDespues, deltaValor, deltaAportado });

  // ---------- 4) "Otros" UI: no update tag, no edit button, no comisión row, no "+ Agregar meta" ----------
  await page.evaluate(() => { window.__debug.state.openPlatformId = null; window.__debug.render(); });
  await page.waitForTimeout(120);
  await page.click('[data-toggle-platform="otros"]');
  await page.waitForTimeout(200);
  const otrosUi = await page.evaluate(() => {
    const btn = document.querySelector('[data-toggle-platform="otros"]');
    const card = btn ? btn.closest('.platform-group') : null;
    if (!card) return null;
    return {
      updateTagText: card.querySelector('.platform-update-tag') ? card.querySelector('.platform-update-tag').textContent : null,
      hasEditBtn: !!card.querySelector('[data-edit-platform="otros"]'),
      hasAddGoalLink: !!card.querySelector('[data-add-goal="otros"]'),
      hasComisionRow: !!card.querySelector('.platform-comision-row'),
      firstFigLabel: card.querySelector('.platform-fig-label') ? card.querySelector('.platform-fig-label').textContent : null,
    };
  });
  check('(4a) "Otros" no muestra "Actualizado hace N días" (no tiene valuación que actualizar)', otrosUi && !otrosUi.updateTagText, otrosUi);
  check('(4b) "Otros" no tiene botón de editar/actualizar valor', otrosUi && !otrosUi.hasEditBtn, otrosUi);
  check('(4c) "Otros" no ofrece "+ Agregar meta" (nunca puede tener metas propias)', otrosUi && !otrosUi.hasAddGoalLink, otrosUi);
  check('(4d) "Otros" no muestra fila de comisión', otrosUi && !otrosUi.hasComisionRow, otrosUi);
  check('(4e) La cifra principal de "Otros" se etiqueta como "Aportado" (no "Total en esta plataforma")', otrosUi && otrosUi.firstFigLabel === 'Aportado', otrosUi);

  // ---------- 5) "Otros" never offered as a place to categorize a goal, and never picked as the default platform to create one ----------
  const catOptionsOtros = await page.evaluate(() => window.__debug.investmentCatOptions().filter(o => o.plataformaId === 'otros'));
  check('(5a) "Otros" solo ofrece su bucket General (nunca una meta propia)', catOptionsOtros.length === 1 && catOptionsOtros[0].value === 'otros__general', catOptionsOtros);
  check('(5b) ...y su label es simplemente "Otros" (sin el sufijo "· General", ya que nunca tiene metas)', catOptionsOtros[0] && catOptionsOtros[0].label === 'Otros', catOptionsOtros);

  const goalCapable = await page.evaluate(() => window.__debug.goalCapablePlatformIds());
  check('(5c) "Otros" nunca aparece en la lista de plataformas donde SÍ se puede crear una meta', !goalCapable.includes('otros'), goalCapable);

  // ---------- 6) with every goal's aporteMensualMeta cleared, the annual bar shows an honest empty state instead of a broken 0/$0 ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.INVESTMENT_GOALS.forEach(m => { delete m.aporteMensualMeta; });
    D.state.openPlatformId = null;
    D.render();
  });
  await page.waitForTimeout(150);
  const emptyObjetivo = await page.evaluate(() => {
    const block = document.querySelector('.platform-total-goal-block');
    return block ? { text: block.innerText, hasTrack: !!block.querySelector('.budget-track') } : null;
  });
  check('(6a) Sin ninguna meta de aporte fijo, el bloque de objetivo anual no muestra una barra 0/$0', emptyObjetivo && !emptyObjetivo.hasTrack, emptyObjetivo);
  check('(6b) ...y explica que no hay un objetivo anual que medir', emptyObjetivo && /no hay un objetivo anual que medir/.test(emptyObjetivo.text), emptyObjetivo);

  await finish({ context, browser, errors });
})();
