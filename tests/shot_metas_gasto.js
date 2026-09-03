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

  await finish({ context, browser, errors });
})();
