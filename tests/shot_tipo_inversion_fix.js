const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- Bug 1: changing the Type of an already-existing transaction didn't reset the
  // category, polluting Balance's per-category breakdown. ----------
  await page.evaluate(() => {
    const d = window.__debug;
    d.TRANSACTIONS.push({id:'t_bugcheck', fecha:'2026-08-15', hora:'10:00', comercio:'Test tipo bug', monto:5000,
      medio:'efectivo', tipo:'gasto', recurrencia:'variable', estado:'confirmado',
      categorias:[{cat:'supermercado', monto:5000}], porCobrar:[], reglaAuto:false, nota:''});
    d.state.tab = 'transacciones';
    d.state.searchQuery = 'Test tipo bug';
    d.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-tx="t_bugcheck"]'); // opens the sheet through the real flow (openSheet)
  await page.waitForTimeout(200);
  await page.evaluate(() => { const el = document.querySelector('.sheet-scroll'); if (el) el.scrollTo(0, 400); });
  await page.waitForTimeout(100);
  await page.click('[data-seg="tipo"] [data-seg-val="ingreso"]');
  await page.waitForTimeout(150);
  const afterFlip = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 't_bugcheck');
    return { tipo: t.tipo, categorias: t.categorias };
  });
  check('1) Al cambiar Tipo de gasto a ingreso, la categoría vieja (de gasto) se limpia', afterFlip.tipo === 'ingreso' && afterFlip.categorias.length === 0, afterFlip);

  // We close the sheet through the real flow (the "Done" button), not by touching state by hand —
  // otherwise the overlay stays "open" and blocks the clicks that follow.
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // The real symptom of the bug: the Balance donut groups by category by iterating t.categorias
  // for each transaction of the corresponding type — if this one was left with tipo="ingreso" but
  // kept its old EXPENSE category ("Supermercado"), that category leaked into the
  // INCOME breakdown. With categorias reset to [], it no longer contributes any row to any
  // per-category breakdown (this can be confirmed without relying on scraping the donut's DOM).
  check('Ya no aporta ninguna categoría "huérfana" a ningún desglose (categorias.length===0)', afterFlip.categorias.length === 0, afterFlip.categorias);
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(100);

  // ---------- Bug 2: an already-created transaction couldn't be switched to "Investment" ----------
  await page.evaluate(() => {
    const d = window.__debug;
    // Simulates a transfer to Fintual that arrived imported as a generic expense.
    d.TRANSACTIONS.push({id:'t_fintual_bug', fecha:'2026-08-20', hora:'09:00', comercio:'Transferencia Fintual SPA', monto:100000,
      medio:'cuenta_vista', tipo:'gasto', recurrencia:'variable', estado:'confirmado',
      categorias:[], porCobrar:[], reglaAuto:false, nota:'', importadoEmail:true});
    d.state.tab = 'transacciones';
    d.state.searchQuery = 'Fintual';
    d.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-tx="t_fintual_bug"]');
  await page.waitForTimeout(200);
  const tipoOptions = await page.evaluate(() => Array.from(document.querySelectorAll('[data-seg="tipo"] [data-seg-val]')).map(b => b.getAttribute('data-seg-val')));
  check('2a) El selector de Tipo en el detalle ahora incluye Inversión', tipoOptions.includes('inversion'), tipoOptions);

  await page.evaluate(() => { const el = document.querySelector('.sheet-scroll'); if (el) el.scrollTo(0, 400); });
  await page.waitForTimeout(100);
  await page.click('[data-seg="tipo"] [data-seg-val="inversion"]');
  await page.waitForTimeout(150);
  // Since the goals-based redesign of investment categorization, the options here are Fintual's
  // own goal(s) ("APV Fintual" = m3, seeded in the fixture) plus its "General" catch-all
  // (fintual__general) -- never the bare platform id "fintual" itself anymore (see the note on
  // INVESTMENT_GOALS in state.ts).
  const platformSelectOptions = await page.evaluate(() => {
    const sel = document.querySelector('[data-cat-select="0"]');
    return sel ? Array.from(sel.options).map(o => o.value) : null;
  });
  check('2b) Tras pasar a Inversión, la fila de categoría ofrece las metas de Fintual (no la plataforma directa)',
    platformSelectOptions && platformSelectOptions.includes('m3') && platformSelectOptions.includes('fintual__general') && !platformSelectOptions.includes('fintual'),
    platformSelectOptions);

  const aportadoAntes = await page.evaluate(() => window.__debug.platformAportadoNeto('fintual'));
  await page.selectOption('[data-cat-select="0"]', 'm3');
  await page.waitForTimeout(150);
  const finalState = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 't_fintual_bug');
    return { tipo: t.tipo, categorias: t.categorias, aportado: window.__debug.platformAportadoNeto('fintual') };
  });
  check('2c) Queda clasificada como aporte a la meta de Fintual y se refleja (roll-up) en el total aportado de la plataforma',
    finalState.tipo === 'inversion' && finalState.categorias[0].cat === 'm3' && finalState.aportado === aportadoAntes + 100000,
    { finalState, aportadoAntes });

  await finish({ context, browser, errors });
})();
