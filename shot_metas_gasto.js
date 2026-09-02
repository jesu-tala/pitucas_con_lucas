const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Meta de Inversión: debe salir sola de la suma de aporteMensualMeta en METAS_INVERSION
  // (150000 + 300000 = 450000), no de un % inventado.
  const invMeta = await page.evaluate(() => {
    const D = window.__debug;
    return { totalCLP: D.metaInversionMensualCLP(), pct: D.metaInversionPct(), ref: D.ingresoMensualReferencia() };
  });
  console.log('Meta inversión mensual (CLP, esperado 450.000):', invMeta.totalCLP);
  check('Meta inversión mensual (CLP) === 450.000', invMeta.totalCLP === 450000, invMeta.totalCLP);
  console.log('Meta inversión %:', invMeta.pct.toFixed(1), '| ingreso de referencia:', invMeta.ref);
  check('Meta inversión % coincide con totalCLP/ingreso', Math.abs(invMeta.pct - (invMeta.totalCLP/invMeta.ref)*100) < 0.01, invMeta);

  // El gauge de Balance debe reflejar esa meta (no un valor hardcodeado 20/38).
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  const captionText = await page.evaluate(() => document.querySelector('.meta-caption').textContent);
  check('El texto de la meta card menciona el % real de inversión', captionText.includes(Math.round(invMeta.pct)+'%'), captionText);

  // Ir a Presupuesto y editar Fijo/Variable.
  await page.click('[data-resumen-sub="presupuesto"]');
  await page.waitForTimeout(150);
  const antes = await page.evaluate(() => window.__debug.METAS_GASTO_PCT);
  console.log('Metas por defecto (Fijo 45 / Variable 17):', JSON.stringify(antes));

  await page.click('[data-edit-metas-gasto]');
  await page.waitForTimeout(150);
  await page.fill('[data-metas-gasto-input="fijo"]', '50');
  await page.fill('[data-metas-gasto-input="variable"]', '20');
  await page.click('[data-save-metas-gasto]');
  await page.waitForTimeout(150);
  const despues = await page.evaluate(() => window.__debug.METAS_GASTO_PCT);
  check('Metas actualizadas tras Guardar (esperado fijo:50, variable:20)', despues.fijo === 50 && despues.variable === 20, despues);

  // Poner metas que sumen > 100% junto a la meta real de inversión, y comprobar el aviso.
  await page.click('[data-edit-metas-gasto]');
  await page.waitForTimeout(150);
  await page.fill('[data-metas-gasto-input="fijo"]', '80');
  await page.fill('[data-metas-gasto-input="variable"]', '70');
  await page.click('[data-save-metas-gasto]');
  await page.waitForTimeout(150);
  const avisoVisible = await page.evaluate(() => !!document.querySelector('.metas-gasto-card .budget-cats-calce.warn'));
  check('Aviso de que las metas suman más del 100% aparece', avisoVisible);

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(80);
  await page.click('[data-resumen-sub="balance"]');
  await page.waitForTimeout(150);
  const avisoBalance = await page.evaluate(() => !!document.querySelector('.meta-caption.warn'));
  check('El mismo aviso aparece también en Balance (meta-card)', avisoBalance);

  await finish({ context, browser, errors });
})();
