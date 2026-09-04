// Coverage for the "metas en vez de plataformas" redesign requested by the user:
// 1) a goal's form has fields for "cuánto tienes ahorrado hasta ahora" (startingAmount) and
//    "desde qué mes partiste" (startMonth), and editing an existing goal pre-fills them.
// 2) classifying an investment-type transaction offers Goals + a "General" bucket per platform
//    (never the bare platform id) -- picking a goal counts toward that goal's progress AND
//    (via a rollup) toward its platform's Aportado neto; picking General only counts toward the
//    platform.
// 3) when there isn't a single goal created yet, the category picker shows a "No tienes metas
//    creadas" empty state with a button that jumps straight into creating one.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- 1) Goal form: startingAmount + startMonth ----------
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-summary-sub="inversiones"]');
  await page.waitForTimeout(200);
  await page.click('[data-toggle-platform="banco_chile"]');
  await page.waitForTimeout(200);

  const antesEditar = await page.evaluate(() => {
    const D = window.__debug;
    const m1 = D.INVESTMENT_GOALS.find(m => m.id === 'm1');
    return { startingAmount: m1.startingAmount, startMonth: m1.startMonth };
  });

  await page.click('[data-edit-goal="m1"]');
  await page.waitForTimeout(150);
  const formPrefill = await page.evaluate(() => {
    const aportado = document.querySelector('[data-goal-field="aportadoInicial"]');
    const mes = document.querySelector('[data-goal-field="mesInicio"]');
    return { aportadoVal: aportado ? aportado.value : null, mesVal: mes ? mes.value : null, mesType: mes ? mes.type : null };
  });
  check('(1a) El form de editar meta trae un campo de "aportado hasta ahora" con el valor guardado', formPrefill.aportadoVal === String(antesEditar.startingAmount), { formPrefill, antesEditar });
  check('(1b) Y un campo de "mes de inicio" (input type=month) con el valor guardado', formPrefill.mesVal === antesEditar.startMonth && formPrefill.mesType === 'month', { formPrefill, antesEditar });

  // Change both and save -- verify the goal object itself is updated (not just the draft).
  await page.fill('[data-goal-field="aportadoInicial"]', '1999999');
  await page.fill('[data-goal-field="mesInicio"]', '2026-02');
  await page.click('[data-save-goal="m1"]');
  await page.waitForTimeout(150);
  const trasGuardar = await page.evaluate(() => {
    const D = window.__debug;
    const m1 = D.INVESTMENT_GOALS.find(m => m.id === 'm1');
    return { startingAmount: m1.startingAmount, startMonth: m1.startMonth };
  });
  check('(1c) Guardar actualiza startingAmount de la meta', trasGuardar.startingAmount === 1999999, trasGuardar);
  check('(1d) Guardar actualiza startMonth de la meta', trasGuardar.startMonth === '2026-02', trasGuardar);

  // Creating a brand-new goal: the fields default to 0 / the current month, and after saving
  // the new goal is computed purely from transactions from then on (no more free-standing
  // "aportadoNeto"/"historial" fields).
  await page.click('[data-add-goal="banco_chile"]');
  await page.waitForTimeout(150);
  const newGoalDefaults = await page.evaluate(() => {
    const D = window.__debug;
    const mes = document.querySelector('[data-goal-field="mesInicio"]');
    return { mesVal: mes ? mes.value : null, mesActual: D.todayISO().slice(0,7) };
  });
  check('(1e) Una meta nueva empieza con "mes de inicio" = mes actual', newGoalDefaults.mesVal === newGoalDefaults.mesActual, newGoalDefaults);
  await page.fill('[data-goal-field="nombre"]', 'Meta de prueba');
  await page.fill('[data-goal-field="montoObjetivo"]', '500000');
  await page.fill('[data-goal-field="aporteMensualMeta"]', '25000');
  await page.click('[data-save-goal="nueva"]');
  await page.waitForTimeout(150);
  const nuevaMeta = await page.evaluate(() => {
    const D = window.__debug;
    return D.INVESTMENT_GOALS.find(m => m.nombre === 'Meta de prueba');
  });
  check('(1f) La meta nueva se crea sin los campos viejos aportadoNeto/historial', !!nuevaMeta && !('aportadoNeto' in nuevaMeta) && !('historial' in nuevaMeta), nuevaMeta);
  check('   y con startingAmount:0 (no se inventa un aporte inicial)', nuevaMeta && nuevaMeta.startingAmount === 0, nuevaMeta);

  // ---------- 2) Categorization by goal + rollup to platform Aportado neto ----------
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  const rollupAntes = await page.evaluate(() => window.__debug.platformAportadoNeto('racional'));

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push({id:'t_meta_cat', fecha: D.todayISO(), hora:'10:00', comercio:'Aporte de prueba Racional',
      monto: 33333, medio:'cuenta_vista', tipo:'inversion', recurrencia:'variable', estado:'confirmado',
      categorias:[{cat:'m4', monto:33333}], porCobrar:[], reglaAuto:false, nota:''});
    D.state.searchQuery = 'Aporte de prueba Racional';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-tx="t_meta_cat"]');
  await page.waitForTimeout(200);

  const options2 = await page.evaluate(() => {
    const sel = document.querySelector('[data-cat-select="0"]');
    return sel ? Array.from(sel.options).map(o => o.value) : null;
  });
  check('(2a) La categoría ofrece la meta m4 (Portafolio Racional) y el bucket racional__general', options2 && options2.includes('m4') && options2.includes('racional__general'), options2);

  const rollupTrasGoal = await page.evaluate(() => window.__debug.platformAportadoNeto('racional'));
  check('(2b) La transacción ya viene categorizada a m4 y ya cuenta en el rollup de racional (aportado neto)', rollupTrasGoal === rollupAntes + 33333, { rollupAntes, rollupTrasGoal });

  // Now re-categorize the SAME transaction to the General bucket instead -- still rolls up to
  // the platform, but no longer to any specific goal.
  const m4Antes = await page.evaluate(() => {
    const D = window.__debug;
    return D.metaAportadoNeto(D.INVESTMENT_GOALS.find(m => m.id === 'm4'));
  });
  await page.selectOption('[data-cat-select="0"]', 'racional__general');
  await page.waitForTimeout(150);
  const trasGeneral = await page.evaluate(() => {
    const D = window.__debug;
    return {
      rollup: D.platformAportadoNeto('racional'),
      m4: D.metaAportadoNeto(D.INVESTMENT_GOALS.find(m => m.id === 'm4')),
    };
  });
  check('(2c) Al pasar a "General", sigue sumando al rollup de la plataforma...', trasGeneral.rollup === rollupTrasGoal, { rollupTrasGoal, trasGeneral });
  check('   ...pero ya NO cuenta en el aportado de la meta m4 (baja lo que había subido)', trasGeneral.m4 === m4Antes - 33333, { m4Antes, trasGeneral });

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- 3) "No tienes metas creadas" empty state ----------
  const emptyStateInfo = await page.evaluate(() => {
    const D = window.__debug;
    // Save the real goals aside and empty the array in place (mutating the same reference
    // render()/the sheet depend on, not reassigning D.INVESTMENT_GOALS = ...).
    const backup = D.INVESTMENT_GOALS.slice();
    D.INVESTMENT_GOALS.length = 0;
    return { backupLength: backup.length };
  });
  check('(3 setup) INVESTMENT_GOALS quedó vacío para la prueba', emptyStateInfo.backupLength > 0, emptyStateInfo);

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push({id:'t_sin_metas', fecha: D.todayISO(), hora:'10:00', comercio:'Aporte sin metas',
      monto: 10000, medio:'cuenta_vista', tipo:'inversion', recurrencia:'variable', estado:'pendiente',
      categorias:[], porCobrar:[], reglaAuto:false, nota:''});
    D.state.tab = 'transacciones';
    D.state.searchQuery = 'Aporte sin metas';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-tx="t_sin_metas"]');
  await page.waitForTimeout(200);

  const emptyState = await page.evaluate(() => {
    const btn = document.querySelector('[data-goto-create-goal]');
    return {
      dicePlaceholder: document.body.textContent.includes('No tienes metas creadas'),
      tieneBoton: !!btn,
      platformIdEnBoton: btn ? btn.getAttribute('data-goto-create-goal') : null,
    };
  });
  check('(3a) Sin metas, el picker de categoría muestra "No tienes metas creadas"', emptyState.dicePlaceholder, emptyState);
  check('(3b) Y un botón para crear la primera meta, con una plataforma preseleccionada', emptyState.tieneBoton && !!emptyState.platformIdEnBoton, emptyState);

  await page.click('[data-goto-create-goal]');
  await page.waitForTimeout(200);
  const trasClickCta = await page.evaluate(() => {
    const D = window.__debug;
    return {
      tab: D.state.tab, summarySub: D.state.summarySub, editingGoalId: D.state.editingGoalId,
      addGoalPlatformId: D.state.addGoalPlatformId,
      formVisible: !!document.querySelector('[data-goal-field="nombre"]'),
    };
  });
  check('(3c) El botón lleva directo a Inversiones con el form de "nueva meta" ya abierto', trasClickCta.tab==='resumen' && trasClickCta.summarySub==='inversiones' && trasClickCta.editingGoalId==='nueva' && !!trasClickCta.addGoalPlatformId && trasClickCta.formVisible, trasClickCta);

  await finish({ context, browser, errors });
})();
