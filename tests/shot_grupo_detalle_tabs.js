// Feature: the group detail view was a single flat screen (balance card + "Por persona" +
// expense feed) -- it's now 3 Tricount-style sub-tabs (Gastos/Balances/Transferencias, same
// .subtabs/.subtab visual pattern as "Resumen", see views/inversiones.ts renderSummarySubtabsInner),
// per the approved design. The balance engine itself (groupBalances/suggestedTransfers,
// shared-expenses.ts) didn't change -- see audit_gastos_compartidos.js for the pure-math
// invariants (sum-to-zero, minimal transfers, manual transfer effect). This test covers the UI:
// switching tabs, what each tab renders, and the two write actions ("marcar como pagado" on a
// suggested transfer, and the manual-transfer form) both routing through the same
// registerPaidBalance() used everywhere else in Grupos. Like every other Grupos test, sb (the
// Supabase client) can't actually write in this sandbox -- see shot_grupo_eliminar.js /
// shot_grupos_feedback_errores.js -- so the two write actions are checked the same way those
// tests check deleteGroup/createGroup: they must show an explicit error toast (never silence)
// and leave state consistent. The "a transfer actually updates balances and shows up in
// Transferencias" acceptance criterion is checked by injecting the resulting PAID_BALANCES row
// directly via window.__debug (same technique audit_gastos_compartidos.js uses for its "after
// settling" checks) -- i.e. simulating what a SUCCESSFUL registerPaidBalance write would leave
// behind, since a real one can't complete here.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Fixture: "Depto" group, 4 participants -- Yo (me), Fran, Beto, Caro -- with 2 expenses that
  // leave a 3-way imbalance where at least one suggested transfer does NOT involve me (Beto owes
  // Caro directly), so the highlighting logic actually gets exercised both ways.
  // paid: Yo=100000, Caro=40000 (total 140000) -- owed: Yo=30000, Fran=40000, Beto=40000, Caro=30000 (total 140000)
  // balance: Yo=+70000, Fran=-40000, Beto=-40000, Caro=+10000 (sum 0)
  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' },
      { id: 'p3', grupo_id: 'g1', user_id: 'user-beto', nombre: 'Beto', color: 'sky' },
      { id: 'p4', grupo_id: 'g1', user_id: 'user-caro', nombre: 'Caro', color: 'peach' }
    ];
    D.SHARED_EXPENSES = [
      // I paid and registered it, with a category name that matches one of MY OWN categories
      // ("Supermercado") -- the feed should resolve a real category icon for it (path (a) of
      // categoryForSharedExpense: same taxonomy, direct match by nombre).
      { id: 'gc1', grupo_id: 'g1', descripcion: 'Feria y supermercado', categoria_origen: 'Supermercado', monto: 100000,
        fecha: '2026-08-05', pagado_por: 'p1', registrado_por: 'user-jesu', division_tipo: 'montos',
        tx_origen_id: 'tx-1', reparto: [{ id:'r1', gasto_compartido_id:'gc1', participante_id:'p1', monto:20000 },
          { id:'r2', gasto_compartido_id:'gc1', participante_id:'p2', monto:30000 },
          { id:'r3', gasto_compartido_id:'gc1', participante_id:'p3', monto:30000 },
          { id:'r4', gasto_compartido_id:'gc1', participante_id:'p4', monto:20000 }] },
      // Caro paid and registered it, with a category name I've ALREADY learned to map to
      // "restoranes" (path (b): CATEGORY_MAPPINGS lookup, same as syncSharedExpenses).
      { id: 'gc2', grupo_id: 'g1', descripcion: 'Sushi para todos', categoria_origen: 'Restoranes y bares', monto: 40000,
        fecha: '2026-08-10', pagado_por: 'p4', registrado_por: 'user-caro', division_tipo: 'montos',
        tx_origen_id: 'tx-2', reparto: [{ id:'r5', gasto_compartido_id:'gc2', participante_id:'p1', monto:10000 },
          { id:'r6', gasto_compartido_id:'gc2', participante_id:'p2', monto:10000 },
          { id:'r7', gasto_compartido_id:'gc2', participante_id:'p3', monto:10000 },
          { id:'r8', gasto_compartido_id:'gc2', participante_id:'p4', monto:10000 }] }
    ];
    D.CATEGORY_MAPPINGS = [{ id: 'm1', user_id: 'user-jesu', de_participante: 'p4', categoria_ajena: 'Restoranes y bares', categoria_propia: 'restoranes' }];
    D.PAID_BALANCES = [];
    D.state.tab = 'grupos';
    D.state.openGroupId = 'g1';
    D.state.groupDetailTab = 'gastos';
    D.render();
  });
  await page.waitForTimeout(200);

  // ---------- Tab "Gastos" (default) ----------
  const gastosTab = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[data-group-expense-open]'));
    return {
      activeLabel: document.querySelector('.subtab.active')?.textContent || null,
      totalGastado: document.querySelector('.stat-tile .stat-value')?.textContent || null,
      cantidadFilas: items.length,
      // gc2 (2026-08-10, Sushi/Caro) is more recent than gc1 (2026-08-05, Feria/Yo) -- most
      // recent first, so gc2 is items[0].
      filaSushi: items[0] ? items[0].textContent : null,
      filaSushiTieneEmoji: items[0] ? items[0].innerHTML.includes('🍽️') : false, // Restoranes y bares (mapeado, la registró Caro)
      filaFeria: items[1] ? items[1].textContent : null,
      filaFeriaTieneEmoji: items[1] ? items[1].innerHTML.includes('🛒') : false, // Supermercado (la registré yo mismo)
    };
  });
  check('(Gastos) es la pestaña activa por defecto', gastosTab.activeLabel === 'Gastos', gastosTab);
  check('(Gastos) el total gastado por el grupo es $140.000 (100.000+40.000)', gastosTab.totalGastado === '$140.000', gastosTab);
  check('(Gastos) el feed tiene las 2 filas, la más reciente primero', gastosTab.cantidadFilas === 2, gastosTab);
  check('   la fila de "Feria y supermercado" muestra: quién pagó, entre quiénes y la fecha',
    gastosTab.filaFeria.includes('Feria y supermercado') && gastosTab.filaFeria.includes('pagó Yo') &&
    gastosTab.filaFeria.includes('Yo, Fran, Beto, Caro') && /agosto|Hoy|Ayer/.test(gastosTab.filaFeria),
    gastosTab.filaFeria);
  check('   esa fila resuelve un ícono de categoría real (🛒 Supermercado, la registré yo mismo)', gastosTab.filaFeriaTieneEmoji === true, gastosTab);
  check('   la fila de Caro (registrada por ella) resuelve su categoría vía el mapeo aprendido (🍽️ Restoranes)', gastosTab.filaSushiTieneEmoji === true, gastosTab);

  // Tapping a row expands its inline detail card (.sheet-block.card) with the full split.
  await page.click('[data-group-expense-open="gc1"]');
  await page.waitForTimeout(150);
  const detalle = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.sheet-block.card'));
    const conDetalle = cards.find(c => c.textContent.includes('Feria y supermercado') && c.querySelector('[data-group-expense-close]'));
    return {
      existe: !!conDetalle,
      texto: conDetalle ? conDetalle.textContent : null,
    };
  });
  check('(Gastos) tocar una fila abre su detalle en una tarjeta .sheet-block.card', detalle.existe === true, detalle);
  check('   el detalle desglosa el reparto de los 4 participantes con sus montos', detalle.existe && ['Yo','Fran','Beto','Caro'].every(n => detalle.texto.includes(n)) && detalle.texto.includes('$20.000') && detalle.texto.includes('$30.000'), detalle);
  await page.click('[data-group-expense-close]');
  await page.waitForTimeout(150);
  const cerrado = await page.evaluate(() => !document.querySelector('[data-group-expense-close]'));
  check('   "Cerrar" colapsa el detalle de vuelta', cerrado === true);

  // ---------- Tab "Balances" ----------
  await page.click('[data-group-tab="balances"]');
  await page.waitForTimeout(200);
  const balancesTab = await page.evaluate(() => {
    const D = window.__debug;
    const suma = D.groupBalances('g1').reduce((s, x) => s + x.balance, 0);
    const rows = Array.from(document.querySelectorAll('[data-mark-transfer-paid]'));
    return {
      activeLabel: document.querySelector('.subtab.active')?.textContent || null,
      contenido: document.getElementById('view-root').textContent,
      sumaSaldos: suma,
      cantidadSugeridas: rows.length,
      involucraYo: rows.map(r => r.getAttribute('data-mark-transfer-paid').includes('|p1|') || r.getAttribute('data-mark-transfer-paid').endsWith('|p1')),
      primeraDestacada: rows[0] ? getComputedStyle(rows[0].closest('.split-row')).backgroundColor : null,
    };
  });
  check('(Balances) es ahora la pestaña activa', balancesTab.activeLabel === 'Balances', balancesTab);
  check('   los saldos netos suman $0', balancesTab.sumaSaldos === 0, balancesTab);
  check('   muestra el saldo de las 4 personas (verde si le deben, durazno si debe)',
    balancesTab.contenido.includes('Le deben $70.000') && balancesTab.contenido.includes('Debe $40.000') && balancesTab.contenido.includes('Le deben $10.000'),
    balancesTab.contenido);
  check('   sugiere el conjunto mínimo de transferencias (3) -- TODOS los reembolsos del grupo, no solo los míos',
    balancesTab.cantidadSugeridas === 3, balancesTab);
  check('   al menos una involucra a "Yo" y al menos una NO (Beto -> Caro, entre otros)',
    balancesTab.involucraYo.some(v => v) && balancesTab.involucraYo.some(v => !v), balancesTab.involucraYo);

  // "Marcar como pagado": in this sandbox the write to Supabase always fails (same as every
  // other Grupos action, see shot_grupo_eliminar.js) -- confirm it warns explicitly and doesn't
  // silently corrupt state, using the SAME registerPaidBalance() call path as the manual form below.
  const primerBoton = await page.evaluate(() => document.querySelector('[data-mark-transfer-paid]').getAttribute('data-mark-transfer-paid'));
  await page.click('[data-mark-transfer-paid="' + primerBoton + '"]');
  await page.waitForTimeout(1500);
  const trasMarcar = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    saldosSiguenIguales: window.__debug.PAID_BALANCES.length === 0,
  }));
  check('(Balances) "Marcar como pagado" avisa con un toast explícito si la escritura falla (nunca silencio)',
    /no se pudo registrar/i.test(trasMarcar.toastTexto), trasMarcar);
  check('   y no queda un registro a medias si falló', trasMarcar.saldosSiguenIguales === true, trasMarcar);

  // ---------- Tab "Transferencias" ----------
  await page.click('[data-group-tab="transferencias"]');
  await page.waitForTimeout(200);
  const transferenciasVacio = await page.evaluate(() => ({
    activeLabel: document.querySelector('.subtab.active')?.textContent || null,
    tieneVacio: document.getElementById('view-root').textContent.includes('Todavía no hay transferencias registradas'),
    tieneBotonAbrir: !!document.querySelector('[data-manual-transfer-open]'),
  }));
  check('(Transferencias) es ahora la pestaña activa', transferenciasVacio.activeLabel === 'Transferencias', transferenciasVacio);
  check('   sin transferencias aún: muestra el estado vacío y el botón para registrar una manual', transferenciasVacio.tieneVacio && transferenciasVacio.tieneBotonAbrir, transferenciasVacio);

  // Open the manual-transfer form, fill it, and submit -- same fail-toast contract as above
  // (single call path: registerPaidBalance(gid, deId, aId, monto)).
  await page.click('[data-manual-transfer-open]');
  await page.waitForTimeout(150);
  const formAbierto = await page.evaluate(() => ({
    tieneDe: !!document.querySelector('[data-manual-transfer-field="deId"]'),
    tieneA: !!document.querySelector('[data-manual-transfer-field="aId"]'),
    tieneMonto: !!document.querySelector('[data-manual-transfer-field="monto"]'),
    tieneFecha: !!document.querySelector('[data-manual-transfer-field="fecha"]'),
    botonDeshabilitado: document.querySelector('[data-manual-transfer-confirm]').disabled,
  }));
  check('(Transferencias) el formulario manual tiene de/a/monto/fecha', formAbierto.tieneDe && formAbierto.tieneA && formAbierto.tieneMonto && formAbierto.tieneFecha, formAbierto);
  check('   el botón "Registrar" arranca deshabilitado (todavía no hay monto)', formAbierto.botonDeshabilitado === true, formAbierto);

  await page.selectOption('[data-manual-transfer-field="deId"]', 'p2'); // Fran
  await page.selectOption('[data-manual-transfer-field="aId"]', 'p1'); // Yo
  await page.fill('[data-manual-transfer-field="monto"]', '15000');
  await page.waitForTimeout(150);
  const formCompleto = await page.evaluate(() => ({
    draft: window.__debug.state.manualTransferDraft,
    botonHabilitado: !document.querySelector('[data-manual-transfer-confirm]').disabled,
  }));
  check('   completar de/a/monto habilita "Registrar" y actualiza el draft en vivo', formCompleto.draft.deId === 'p2' && formCompleto.draft.aId === 'p1' && formCompleto.draft.monto === 15000 && formCompleto.botonHabilitado, formCompleto);

  await page.click('[data-manual-transfer-confirm]');
  await page.waitForTimeout(1500);
  const trasManual = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    formCerrado: !document.querySelector('[data-manual-transfer-field="monto"]'),
    sinRegistroReal: window.__debug.PAID_BALANCES.length === 0,
  }));
  check('(Transferencias) el formulario manual usa el MISMO camino (falla igual, mismo toast) que "marcar como pagado"',
    /no se pudo registrar/i.test(trasManual.toastTexto), trasManual);
  check('   y el formulario se cierra de todas formas (no queda pegado)', trasManual.formCerrado === true, trasManual);
  check('   sin escritura real (sb bloqueado en el sandbox), no quedó ningún registro', trasManual.sinRegistroReal === true, trasManual);

  // ---------- "Registrar una transferencia actualiza los saldos y aparece en Transferencias" ----------
  // Since a real Supabase write can't complete in this sandbox, simulate the state a SUCCESSFUL
  // registerPaidBalance() would leave behind (same technique as audit_gastos_compartidos.js's
  // "after settling" section): push the row directly and re-render.
  await page.evaluate(() => {
    const D = window.__debug;
    D.PAID_BALANCES.push({ id: 's1', grupo_id: 'g1', de_participante: 'p2', a_participante: 'p1', monto: 15000, fecha: '2026-08-20' });
    D.render();
  });
  await page.waitForTimeout(150);
  const trasInyectar = await page.evaluate(() => {
    const D = window.__debug;
    const b = id => D.groupBalances('g1').find(s => s.participantId === id);
    return {
      balanceYo: b('p1').balance, balanceFran: b('p2').balance,
      apareceEnHistorial: document.getElementById('view-root').textContent.includes('Fran → Yo') && document.getElementById('view-root').textContent.includes('$15.000'),
    };
  });
  check('registrar una transferencia (Fran → Yo, $15.000) ajusta los saldos de ambos', trasInyectar.balanceYo === 70000 - 15000 && trasInyectar.balanceFran === -40000 + 15000, trasInyectar);
  check('   y aparece en el historial de la pestaña "Transferencias"', trasInyectar.apareceEnHistorial === true, trasInyectar);

  // ---------- Demo mode masks every new amount shown ----------
  await page.evaluate(() => { window.__debug.state.demoMode = true; window.__debug.render(); });
  await page.waitForTimeout(150);
  const demoTransferencias = await page.evaluate(() => document.getElementById('view-root').textContent);
  check('(Transferencias, modo demo) el monto del historial queda enmascarado', demoTransferencias.includes('$••••••') && !demoTransferencias.includes('$15.000'));

  await page.evaluate(() => { window.__debug.state.groupDetailTab = 'balances'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const demoBalances = await page.evaluate(() => document.getElementById('view-root').textContent);
  check('(Balances, modo demo) los saldos y las transferencias sugeridas quedan enmascarados', demoBalances.includes('$••••••') && !demoBalances.includes('$55.000') && !demoBalances.includes('$25.000'));

  await page.evaluate(() => { window.__debug.state.groupDetailTab = 'gastos'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const demoGastos = await page.evaluate(() => document.getElementById('view-root').textContent);
  check('(Gastos, modo demo) el total gastado y los montos del feed quedan enmascarados', demoGastos.includes('$••••••') && !demoGastos.includes('$140.000'));

  await finish({ context, browser, errors });
})();
