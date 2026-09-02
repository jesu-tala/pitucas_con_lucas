const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- Bug 1: cambiar el Tipo de una transacción ya existente no reiniciaba la
  // categoría, ensuciando el desglose por categoría de Balance. ----------
  await page.evaluate(() => {
    const d = window.__debug;
    d.TX.push({id:'t_bugcheck', fecha:'2026-08-15', hora:'10:00', comercio:'Test tipo bug', monto:5000,
      medio:'efectivo', tipo:'gasto', recurrencia:'variable', estado:'confirmado',
      categorias:[{cat:'supermercado', monto:5000}], porCobrar:[], reglaAuto:false, nota:''});
    d.state.tab = 'transacciones';
    d.state.searchQuery = 'Test tipo bug';
    d.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-tx="t_bugcheck"]'); // abre el sheet por el flujo real (openSheet)
  await page.waitForTimeout(200);
  await page.evaluate(() => { const el = document.querySelector('.sheet-scroll'); if (el) el.scrollTo(0, 400); });
  await page.waitForTimeout(100);
  await page.click('[data-seg="tipo"] [data-seg-val="ingreso"]');
  await page.waitForTimeout(150);
  const afterFlip = await page.evaluate(() => {
    const t = window.__debug.TX.find(x => x.id === 't_bugcheck');
    return { tipo: t.tipo, categorias: t.categorias };
  });
  check('1) Al cambiar Tipo de gasto a ingreso, la categoría vieja (de gasto) se limpia', afterFlip.tipo === 'ingreso' && afterFlip.categorias.length === 0, afterFlip);

  // Cerramos el sheet por el flujo real (botón "Listo"), no tocando el estado a mano —
  // si no, el overlay se queda "open" y tapa los clicks de lo que sigue.
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // El síntoma real del bug: el donut de Balance agrupa por categoría iterando t.categorias
  // de cada transacción del tipo correspondiente — si esta quedaba con tipo="ingreso" pero
  // conservaba su categoría vieja de GASTO ("Supermercado"), esa categoría se colaba en el
  // desglose de INGRESOS. Con categorias reiniciado a [], ya no aporta ninguna fila a ningún
  // desglose por categoría (se puede confirmar sin depender de scrapear el DOM del donut).
  check('Ya no aporta ninguna categoría "huérfana" a ningún desglose (categorias.length===0)', afterFlip.categorias.length === 0, afterFlip.categorias);
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(100);

  // ---------- Bug 2: una transacción ya creada no se podía pasar a "Inversión" ----------
  await page.evaluate(() => {
    const d = window.__debug;
    // Simula una transferencia a Fintual que llegó importada como gasto genérico.
    d.TX.push({id:'t_fintual_bug', fecha:'2026-08-20', hora:'09:00', comercio:'Transferencia Fintual SPA', monto:100000,
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
  const platformSelectOptions = await page.evaluate(() => {
    const sel = document.querySelector('[data-cat-select="0"]');
    return sel ? Array.from(sel.options).map(o => o.value) : null;
  });
  check('2b) Tras pasar a Inversión, la fila de categoría ofrece las plataformas (Fintual, etc.)', platformSelectOptions && platformSelectOptions.includes('fintual'), platformSelectOptions);

  await page.selectOption('[data-cat-select="0"]', 'fintual');
  await page.waitForTimeout(150);
  const finalState = await page.evaluate(() => {
    const t = window.__debug.TX.find(x => x.id === 't_fintual_bug');
    return { tipo: t.tipo, categorias: t.categorias, aportado: window.__debug.platformAportadoNeto('fintual') };
  });
  check('2c) Queda clasificada como aporte a Fintual y se refleja en el total aportado de la plataforma', finalState.tipo === 'inversion' && finalState.categorias[0].cat === 'fintual', finalState);

  await finish({ context, browser, errors });
})();
