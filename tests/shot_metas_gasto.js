const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Investment Goal: should come purely from the sum of aporteMensualMeta in INVESTMENT_GOALS
  // (150000 + 300000 = 450000), not from a made-up %.
  const invMeta = await page.evaluate(() => {
    const D = window.__debug;
    return { totalCLP: D.monthlyInvestmentGoalCLP(), pct: D.investmentGoalPct(), ref: D.referenceMonthlyIncome() };
  });
  console.log('Meta inversión mensual (CLP, esperado 450.000):', invMeta.totalCLP);
  check('Meta inversión mensual (CLP) === 450.000', invMeta.totalCLP === 450000, invMeta.totalCLP);
  console.log('Meta inversión %:', invMeta.pct.toFixed(1), '| ingreso de referencia:', invMeta.ref);
  check('Meta inversión % coincide con totalCLP/ingreso', Math.abs(invMeta.pct - (invMeta.totalCLP/invMeta.ref)*100) < 0.01, invMeta);

  // The Balance gauge must reflect that goal (not a hardcoded 20/38 value).
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  const captionText = await page.evaluate(() => document.querySelector('.meta-caption').textContent);
  check('El texto de la meta card menciona el % real de inversión', captionText.includes(Math.round(invMeta.pct)+'%'), captionText);

  // Go to Budget and edit Fixed/Variable.
  await page.click('[data-summary-sub="presupuesto"]');
  await page.waitForTimeout(150);
  const antes = await page.evaluate(() => window.__debug.SPENDING_GOAL_PCT);
  console.log('Metas por defecto (Fijo 45 / Variable 17):', JSON.stringify(antes));

  await page.click('[data-edit-spending-goals]');
  await page.waitForTimeout(150);
  await page.fill('[data-spending-goals-input="fijo"]', '50');
  await page.fill('[data-spending-goals-input="variable"]', '20');
  await page.click('[data-save-spending-goals]');
  await page.waitForTimeout(150);
  const despues = await page.evaluate(() => window.__debug.SPENDING_GOAL_PCT);
  check('Metas actualizadas tras Guardar (esperado fijo:50, variable:20)', despues.fijo === 50 && despues.variable === 20, despues);

  // Set goals that add up to > 100% together with the real investment goal, and check the warning.
  await page.click('[data-edit-spending-goals]');
  await page.waitForTimeout(150);
  await page.fill('[data-spending-goals-input="fijo"]', '80');
  await page.fill('[data-spending-goals-input="variable"]', '70');
  await page.click('[data-save-spending-goals]');
  await page.waitForTimeout(150);
  const avisoVisible = await page.evaluate(() => !!document.querySelector('.metas-gasto-card .budget-cats-calce.warn'));
  check('Aviso de que las metas suman más del 100% aparece', avisoVisible);

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(80);
  await page.click('[data-summary-sub="balance"]');
  await page.waitForTimeout(150);
  const avisoBalance = await page.evaluate(() => !!document.querySelector('.meta-caption.warn'));
  check('El mismo aviso aparece también en Balance (meta-card)', avisoBalance);

  // Regresión: si fijo + variable + meta de inversión suman EXACTAMENTE 100% (perceptualmente),
  // el aviso de "más del 100%" igual aparecía -- porque investmentGoalPct() es un cociente de
  // punto flotante (aporte/ingreso*100) y la comparación vieja era "suma>100" sobre el valor
  // crudo, no sobre el redondeado (Math.round(fijo)+Math.round(variable)+metaInvPct puede dar
  // 100.00000000000001 en vez de 100 justo). Se inyecta un escenario donde eso pasa de verdad:
  // fijo=10.1/variable=10.1 (el guardado real redondea a enteros, así que se ponen directo por
  // window.__debug para simular el mismo tipo de imprecisión sin depender de esa ruta) e ingreso
  // de referencia + meta de inversión elegidos para que 10.1+10.1+investmentGoalPct() dé
  // 100.00000000000001 -- verificado a mano que esta combinación específica overflowea en JS.
  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({id:'test-income-100pct', fecha: D.todayISO(), hora:'12:00', comercio:'Test income', monto:2000000, medio:'cuenta_vista', tipo:'ingreso', recurrencia:'variable', estado:'confirmado', categorias:[{cat:'sueldo',monto:2000000}], porCobrar:[], reglaAuto:false, nota:''});
    D.INVESTMENT_GOALS.length = 0;
    D.INVESTMENT_GOALS.push({id:'test-goal-100pct', nombre:'Test', montoObjetivo:3000000, aporteMensualMeta:1596000, plataformaId:'banco_chile', plazo:'corto', comision:null, aportadoNeto:0, historial:{}, checks:{}});
    D.SPENDING_GOAL_PCT.fijo = 10.1;
    D.SPENDING_GOAL_PCT.variable = 10.1;
    D.state.tab = 'resumen'; D.state.summarySub = 'presupuesto';
    D.render();
  });
  await page.waitForTimeout(150);
  const escenario100 = await page.evaluate(() => {
    const D = window.__debug;
    return {
      metaInvPct: D.investmentGoalPct(),
      sumaCruda: D.SPENDING_GOAL_PCT.fijo + D.SPENDING_GOAL_PCT.variable + D.investmentGoalPct(),
      avisoWarn: !!document.querySelector('.metas-gasto-card .budget-cats-calce.warn'),
      texto: document.querySelector('.metas-gasto-card .budget-cats-calce')?.textContent || '',
    };
  });
  check('(setup) El escenario inyectado efectivamente da un pelo arriba de 100 por punto flotante (no exactamente 100)',
    escenario100.sumaCruda > 100 && escenario100.sumaCruda < 100.001, escenario100);
  check('Si suman justo 100% (con error de punto flotante de por medio), NO aparece el aviso de "más del 100%"',
    escenario100.avisoWarn === false && !/más del 100%/.test(escenario100.texto), escenario100);

  await finish({ context, browser, errors });
})();
