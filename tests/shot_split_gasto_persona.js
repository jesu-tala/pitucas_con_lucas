// "Dividir un gasto con alguien" (partes iguales / % / monto fijo, con o sin grupo).
//
// Before this feature, splitting a gasto with someone worked in 2 disconnected ways: with a
// group, "Compartir con un grupo" only ever offered "partes iguales" (hardcoded); without a
// group, porCobrar was built by hand row-by-row with no validation that it summed to the total.
// Now BOTH flows go through the exact same draft/component (state.shareDraft +
// renderSplitDraftForm in views/grupos.ts), offering all 3 modalities (iguales/pct/montos) with
// a hard "sum must match the total exactly" rule before the confirm button is enabled.
//
// Just like shot_compartir_grupo.js, the real write to Supabase (shareExistingTransaction, for
// the WITH-a-group case) can't be exercised end to end here (sb is blocked in this sandbox) --
// this test covers what IS purely UI/local-state: the 3 modalities' math, the ad-hoc (no-group)
// commit into porCobrar, the new "otra persona pagó" (direccion:'debo') netting, the legacy
// (pre-feature) porCobrar regression, and demo-mode masking.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // ---------- (a) "iguales", with the rounding case: last participant absorbs the remainder ----------
  const txIguales = await page.evaluate(() => {
    const D = window.__debug;
    const t = { id: 'test-split-iguales', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Split Iguales',
      monto: 10000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 10000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txIguales);
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  // include Fran then Pancho, in that order -- participantesIncluidos ends up ['tu','Fran','Pancho'],
  // so with $10.000 among 3 people (floor 3333, remainder 1), Pancho (last) should get $3.334.
  await page.click('[data-share-include="Fran"]');
  await page.waitForTimeout(100);
  await page.click('[data-share-include="Pancho"]');
  await page.waitForTimeout(150);
  const igualesPreview = await page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll('[data-share-include]')).filter(cb => cb.checked).map(cb => {
      const row = cb.closest('.split-row');
      const amt = row.querySelector('.tabular');
      return { id: cb.getAttribute('data-share-include'), amt: amt ? amt.textContent : null };
    });
    return {
      filas,
      totalTexto: document.getElementById('sheet-content').textContent,
      confirmHabilitado: !document.querySelector('[data-share-confirm]').disabled,
    };
  });
  check('(a) "Partes iguales" con 3 personas y $10.000: Tú y Fran quedan en $3.333 cada uno',
    igualesPreview.filas.find(f => f.id === 'tu').amt === '$3.333' && igualesPreview.filas.find(f => f.id === 'Fran').amt === '$3.333',
    igualesPreview.filas);
  check('   y Pancho (el último en la lista) absorbe el resto de la división: $3.334',
    igualesPreview.filas.find(f => f.id === 'Pancho').amt === '$3.334', igualesPreview.filas);
  check('   el total repartido cuadra exacto con el total ($10.000 de $10.000) y el botón queda habilitado',
    igualesPreview.totalTexto.includes('$10.000 de $10.000') && igualesPreview.confirmHabilitado === true, igualesPreview);

  await page.click('[data-share-confirm="' + txIguales + '"]');
  await page.waitForTimeout(150);
  const trasIguales = await page.evaluate((id) => {
    const t = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return { porCobrar: t.porCobrar, divisionTipo: t.divisionTipo, pagador: t.pagador };
  }, txIguales);
  check('   al confirmar, se crea una fila por CADA OTRO participante (Fran $3.333, Pancho $3.334), nada para "tu"',
    trasIguales.porCobrar.length === 2 &&
    trasIguales.porCobrar.find(p => p.persona === 'Fran').monto === 3333 &&
    trasIguales.porCobrar.find(p => p.persona === 'Pancho').monto === 3334,
    trasIguales.porCobrar);
  check('   ambas quedan direccion "me_deben" (o sin dirección, mismo significado) y sin pagador (pagaste tú)',
    trasIguales.porCobrar.every(p => p.direccion === 'me_deben' || p.direccion === undefined) && trasIguales.pagador === undefined,
    trasIguales);
  check('   divisionTipo quedó guardado como "iguales"', trasIguales.divisionTipo === 'iguales', trasIguales.divisionTipo);

  // ---------- (a2) "Por partes" with CUSTOM weights -- the actual point of the modality: not
  // forced-equal, arbitrary "número de partes" per person, the pesos are derived automatically
  // and always sum exact (nothing to balance by hand) ----------
  const txPartes = await page.evaluate(() => {
    const D = window.__debug;
    const t = { id: 'test-split-partes-custom', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Partes Custom',
      monto: 12000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txPartes);
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Fran"]');
  await page.waitForTimeout(100);
  await page.click('[data-share-include="Pancho"]');
  await page.waitForTimeout(150);
  // tu=3 partes, Fran=2, Pancho=1 -> 6 partes de $12.000 -> 6.000/4.000/2.000 (división exacta)
  await page.fill('[data-share-value="tu"]', '3');
  await page.waitForTimeout(80);
  await page.fill('[data-share-value="Fran"]', '2');
  await page.waitForTimeout(80);
  await page.fill('[data-share-value="Pancho"]', '1');
  await page.waitForTimeout(150);
  const partesPreview = await page.evaluate(() => ({
    tu: document.querySelector('[data-share-computed="tu"]')?.textContent,
    fran: document.querySelector('[data-share-computed="Fran"]')?.textContent,
    pancho: document.querySelector('[data-share-computed="Pancho"]')?.textContent,
    totalTexto: document.getElementById('sheet-content').textContent,
    confirmHabilitado: !document.querySelector('[data-share-confirm]').disabled,
  }));
  check('(a2) "Por partes" con pesos 3/2/1 sobre $12.000 reparte 6.000/4.000/2.000 (no partes iguales)',
    partesPreview.tu === '$6.000' && partesPreview.fran === '$4.000' && partesPreview.pancho === '$2.000', partesPreview);
  check('   la suma siempre cuadra exacto (nada que balancear a mano) y el botón queda habilitado',
    partesPreview.totalTexto.includes('$12.000 de $12.000') && partesPreview.confirmHabilitado === true, partesPreview);

  // Cambiar UN SOLO peso mueve el denominador compartido -- se repinta el readout de TODAS las
  // filas, no solo la que se está editando. Con tu=3, Fran=5, Pancho vacío (cuenta como 1 parte
  // por defecto): 9 partes de $12.000 -> 4.000/6.667/1.333 (Pancho, último de la lista, absorbe
  // el resto del redondeo).
  await page.fill('[data-share-value="Fran"]', '5');
  await page.waitForTimeout(80);
  await page.fill('[data-share-value="Pancho"]', '');
  await page.waitForTimeout(150);
  const partesConBlanco = await page.evaluate(() => ({
    tu: document.querySelector('[data-share-computed="tu"]')?.textContent,
    fran: document.querySelector('[data-share-computed="Fran"]')?.textContent,
    pancho: document.querySelector('[data-share-computed="Pancho"]')?.textContent,
  }));
  check('   dejar una fila vacía cuenta como 1 parte por defecto, y mover un peso recalcula TODAS las filas (tu=3,Fran=5,Pancho vacío: $4.000/$6.667/$1.333)',
    partesConBlanco.tu === '$4.000' && partesConBlanco.fran === '$6.667' && partesConBlanco.pancho === '$1.333', partesConBlanco);

  await page.click('[data-share-confirm="' + txPartes + '"]');
  await page.waitForTimeout(150);
  const trasPartes = await page.evaluate((id) => {
    const t = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return { porCobrar: t.porCobrar, divisionTipo: t.divisionTipo };
  }, txPartes);
  check('   al confirmar, queda guardado el reparto ya calculado en pesos (no los números de partes crudos)',
    trasPartes.divisionTipo === 'iguales' &&
    (trasPartes.porCobrar.find(p => p.persona === 'Fran') || {}).monto === 6667 &&
    (trasPartes.porCobrar.find(p => p.persona === 'Pancho') || {}).monto === 1333,
    trasPartes.porCobrar);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (b) "Por %" and "Monto fijo", with hard validation ----------
  const txPct = await page.evaluate(() => {
    const D = window.__debug;
    const t = { id: 'test-split-pct', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Split Porcentaje',
      monto: 20000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 20000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txPct);
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Cata"]');
  await page.waitForTimeout(100);

  // Switch to "Por %" -- values should seed from the equal split (50%/50% of $20.000) so the
  // user isn't starting from a blank/zero.
  await page.click('[data-seg="division-tipo"] [data-seg-val="pct"]');
  await page.waitForTimeout(150);
  const pctSeeded = await page.evaluate(() => ({
    tu: document.querySelector('[data-share-value="tu"]').value,
    cata: document.querySelector('[data-share-value="Cata"]').value,
    confirmHabilitado: !document.querySelector('[data-share-confirm]').disabled,
  }));
  check('(b) Al cambiar a "Por %", los valores se precargan desde el reparto en partes iguales (50/50)',
    pctSeeded.tu === '50' && pctSeeded.cata === '50', pctSeeded);
  check('   y el botón sigue habilitado (el reparto precargado ya cuadra)', pctSeeded.confirmHabilitado === true, pctSeeded);

  // A %/monto split that does NOT add up to the total must disable the confirm button (hard
  // validation) -- setting Cata to 60% (Tú still at 50%) overshoots the total.
  await page.fill('[data-share-value="Cata"]', '60');
  await page.waitForTimeout(150);
  const pctInvalido = await page.evaluate(() => {
    const cont = document.getElementById('sheet-content');
    const err = cont.querySelector('.field-error');
    return {
      confirmDeshabilitado: cont.querySelector('[data-share-confirm]').disabled,
      error: err ? err.textContent : null,
    };
  });
  check('   si el %/monto no cuadra con el total, el botón de confirmar se deshabilita (validación dura)',
    pctInvalido.confirmDeshabilitado === true && /Sobran/.test(pctInvalido.error || ''), pctInvalido);

  // Fix it back to something that adds up (40/60) and confirm.
  await page.fill('[data-share-value="tu"]', '40');
  await page.waitForTimeout(150);
  const pctValido = await page.evaluate(() => !document.querySelector('[data-share-confirm]').disabled);
  check('   volviendo a un %/monto que sí cuadra (40/60 de $20.000), el botón se vuelve a habilitar', pctValido === true);

  await page.click('[data-share-confirm="' + txPct + '"]');
  await page.waitForTimeout(150);
  const trasPct = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id), txPct);
  check('   al confirmar, Cata (60% de $20.000) queda con una fila de $12.000 y divisionTipo="pct"',
    trasPct.porCobrar.length === 1 && trasPct.porCobrar[0].persona === 'Cata' && trasPct.porCobrar[0].monto === 12000 && trasPct.divisionTipo === 'pct',
    trasPct);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // "Monto fijo" — same mechanics, plain amounts instead of percentages.
  const txMontos = await page.evaluate(() => {
    const D = window.__debug;
    const t = { id: 'test-split-montos', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Split Monto Fijo',
      monto: 15000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 15000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txMontos);
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Mamá"]');
  await page.waitForTimeout(100);
  await page.click('[data-seg="division-tipo"] [data-seg-val="montos"]');
  await page.waitForTimeout(150);
  await page.fill('[data-share-value="tu"]', '5000');
  await page.fill('[data-share-value="Mamá"]', '10000');
  await page.waitForTimeout(150);
  const montosOk = await page.evaluate(() => !document.querySelector('[data-share-confirm]').disabled);
  check('(c) "Monto fijo" 5.000 + 10.000 = 15.000 del total: el botón queda habilitado', montosOk === true);
  await page.click('[data-share-confirm="' + txMontos + '"]');
  await page.waitForTimeout(150);
  const trasMontos = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id), txMontos);
  check('   al confirmar, Mamá queda con exactamente $10.000 y divisionTipo="montos"',
    trasMontos.porCobrar.length === 1 && trasMontos.porCobrar[0].persona === 'Mamá' && trasMontos.porCobrar[0].monto === 10000 && trasMontos.divisionTipo === 'montos',
    trasMontos);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (d) Splitting WITH a group, through the SAME component, choosing a modality ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g-split-test', nombre: 'Depto Test', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'gp1', grupo_id: 'g-split-test', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'gp2', grupo_id: 'g-split-test', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.SHARED_EXPENSES = [];
    const t = { id: 'test-split-grupo', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Split Grupo',
      monto: 8000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 8000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    D.render();
  });
  await page.click('[data-tx="test-split-grupo"]');
  await page.waitForTimeout(200);
  await page.click('[data-share-open="test-split-grupo"]');
  await page.waitForTimeout(150);
  // Same component: the modalidad segmented control is right there, just like the no-group case.
  const tieneModalidadEnGrupo = await page.evaluate(() => !!document.querySelector('[data-seg="division-tipo"]'));
  check('(d) El picker de "compartir con un grupo" ofrece las 3 modalidades (mismo componente que sin grupo)', tieneModalidadEnGrupo === true);
  await page.click('[data-seg="division-tipo"] [data-seg-val="montos"]');
  await page.waitForTimeout(150);
  await page.fill('[data-share-value="gp1"]', '3000');
  await page.fill('[data-share-value="gp2"]', '5000');
  await page.waitForTimeout(150);
  const grupoMontosOk = await page.evaluate(() => ({
    habilitado: !document.querySelector('[data-share-confirm]').disabled,
    divisionTipo: window.__debug.state.shareDraft.divisionTipo,
  }));
  check('   3.000 + 5.000 = 8.000 del total: el botón "Compartir" queda habilitado con divisionTipo="montos"',
    grupoMontosOk.habilitado === true && grupoMontosOk.divisionTipo === 'montos', grupoMontosOk);
  // The actual write to Supabase (shareExistingTransaction) can't be exercised end to end in
  // this sandbox (network calls are blocked, same limitation shot_compartir_grupo.js already
  // documents) -- clicking "Compartir" here would only produce the same permission-denied
  // console error that test already avoids by never calling it either. What matters for THIS
  // feature is proven above: the shared component reaches a valid, hard-validated "monto fijo"
  // reparto before confirm is even clickable -- shareExistingTransaction itself already forwarded
  // divisionTipo/reparto untouched before this feature (only the UI was hardcoded to 'iguales').
  await page.click('[data-share-cancel]');
  await page.waitForTimeout(150);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (e) "Otra persona pagó" (direccion:'debo') and netExpenseTx() ----------
  const txDebo = await page.evaluate(() => {
    const D = window.__debug;
    const t = { id: 'test-split-debo', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Split Debo',
      monto: 20000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 20000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txDebo);
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Fran"]');
  await page.waitForTimeout(100);
  // Fran actually paid, not you -- switching the payer produces the 'debo' case.
  await page.click('[data-seg="compartir-pagador"] [data-seg-val="Fran"]');
  await page.waitForTimeout(150);
  const pagadorEsFran = await page.evaluate(() => window.__debug.state.shareDraft.pagadoPorId);
  check('(e) Elegir a Fran como "¿Quién pagó?" actualiza el draft (pagadoPorId = Fran)', pagadorEsFran === 'Fran');
  await page.click('[data-share-confirm="' + txDebo + '"]');
  await page.waitForTimeout(150);
  const trasDebo = await page.evaluate((id) => {
    const t = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return {
      porCobrar: t.porCobrar, pagador: t.pagador,
      netExpense: window.__debug.netExpenseTx(t),
    };
  }, txDebo);
  check('   se crea UNA sola fila (nunca una por participante) con direccion "debo", por TU propia parte ($10.000)',
    trasDebo.porCobrar.length === 1 && trasDebo.porCobrar[0].direccion === 'debo' && trasDebo.porCobrar[0].monto === 10000,
    trasDebo.porCobrar);
  check('   la fila apunta a quién pagó de verdad (persona = "Fran") y tx.pagador queda "Fran"',
    trasDebo.porCobrar[0].persona === 'Fran' && trasDebo.pagador === 'Fran', trasDebo);
  check('   netExpenseTx() ya NO cuenta el total del gasto ($20.000) sino solo tu parte ($10.000)',
    trasDebo.netExpense === 10000, trasDebo.netExpense);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (f) Regression: legacy porCobrar (no pagador/divisionTipo/direccion at all) ----------
  // t5 in the demo fixture (Restobar Lastarria) already has 'persona' rows from BEFORE this
  // feature existed -- no direccion, no divisionTipo/pagador on the transaction. They must keep
  // meaning exactly what they always meant (you paid, they owe you) with zero migration.
  const legado = await page.evaluate(() => {
    const D = window.__debug;
    const t5 = D.TRANSACTIONS.find(t => t.id === 't5');
    return {
      sinCamposNuevos: t5.pagador === undefined && t5.divisionTipo === undefined && t5.porCobrar.every(p => p.direccion === undefined),
      netExpense: D.netExpenseTx(t5),
      totalCategorias: t5.categorias.reduce((s, c) => s + c.monto, 0),
      sumaPersonas: t5.porCobrar.reduce((s, p) => s + (p.monto || 0), 0),
    };
  });
  check('(f) t5 (fixture pre-existente) no tiene pagador/divisionTipo/direccion -- datos 100% legado', legado.sinCamposNuevos === true, legado);
  check('   netExpenseTx() sigue neteando igual que siempre: total de categorías menos lo repartido a personas',
    legado.netExpense === (legado.totalCategorias - legado.sumaPersonas), legado);

  await page.click('[data-tx="t5"]');
  await page.waitForTimeout(200);
  const legadoUI = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      muestraEtiquetaClasica: /te debe/.test(content.textContent) && !/Le debes a/.test(content.textContent),
      tieneEditarReparto: !!document.querySelector('[data-charge-split-open="t5"]'),
      chkPagado: !!document.querySelector('.chk-pagado.checked'),
    };
  });
  check('   se sigue mostrando con la etiqueta clásica ("<nombre> te debe"), nunca "Le debes a" (eso es solo para el caso "debo")',
    legadoUI.muestraEtiquetaClasica === true, legadoUI);
  check('   sigue ofreciendo "Editar reparto" y las filas ya pagadas siguen marcadas', legadoUI.tieneEditarReparto && legadoUI.chkPagado, legadoUI);

  // Toggling "paid" on a legacy row still works exactly as before this feature.
  const primerCheckIdx = await page.evaluate(() => {
    const t5 = window.__debug.TRANSACTIONS.find(t => t.id === 't5');
    return t5.porCobrar.findIndex(p => p.tipo === 'persona');
  });
  await page.click('[data-toggle-paid="' + primerCheckIdx + '"]');
  await page.waitForTimeout(150);
  const pagadoTrasToggle = await page.evaluate((idx) => window.__debug.TRANSACTIONS.find(t => t.id === 't5').porCobrar[idx].pagado, primerCheckIdx);
  check('   togglear "pagado" en una fila legado sigue funcionando (se desmarcó)', pagadoTrasToggle === false);
  // restore it so this test doesn't leave shared fixture state mutated for whichever test runs after it
  await page.click('[data-toggle-paid="' + primerCheckIdx + '"]');
  await page.waitForTimeout(150);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (g) Ad-hoc (no group) split among a SUBSET of participants ----------
  const txSubset = await page.evaluate(() => {
    const D = window.__debug;
    const t = { id: 'test-split-subset', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Split Subconjunto',
      monto: 12000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txSubset);
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  // Only Tú + Cata join the split (Fran, Pancho, Mamá are all valid contacts but deliberately
  // left OUT) -- confirms the checkboxes really pick a subset, not "everyone available".
  await page.click('[data-share-include="Cata"]');
  await page.waitForTimeout(150);
  const universoCompleto = await page.evaluate(() => Array.from(document.querySelectorAll('[data-share-include]')).map(cb => cb.getAttribute('data-share-include')));
  check('(g) El universo de participantes ad-hoc incluye "Tú" + todos los contactos conocidos',
    universoCompleto.includes('tu') && universoCompleto.includes('Cata') && universoCompleto.includes('Fran') && universoCompleto.includes('Pancho') && universoCompleto.includes('Mamá'),
    universoCompleto);
  await page.click('[data-share-confirm="' + txSubset + '"]');
  await page.waitForTimeout(150);
  const trasSubset = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id).porCobrar, txSubset);
  check('   al confirmar con Tú + Cata (subconjunto, sin Fran/Pancho/Mamá), se crea UNA sola fila: Cata con su mitad ($6.000)',
    trasSubset.length === 1 && trasSubset[0].persona === 'Cata' && trasSubset[0].monto === 6000, trasSubset);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (h) Demo mode masks every new preview amount ----------
  const txDemo = await page.evaluate(() => {
    const D = window.__debug;
    const t = { id: 'test-split-demo', fecha: D.todayISO(), hora: '12:00', comercio: 'Test Split Demo',
      monto: 10000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otros', monto: 10000 }], porCobrar: [], reglaAuto: false, nota: '' };
    D.TRANSACTIONS.push(t);
    D.state.demoMode = true;
    D.render();
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txDemo);
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Cata"]');
  await page.waitForTimeout(150);
  const demoPreview = await page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll('[data-share-include]')).filter(cb => cb.checked).map(cb => {
      const row = cb.closest('.split-row');
      const amt = row.querySelector('.tabular');
      return amt ? amt.textContent : null;
    });
    const totalLine = document.querySelector('.split-remaining span:last-child').textContent;
    return { filas, totalLine };
  });
  check('(h) En modo demo, los montos de cada fila del reparto quedan enmascarados ($••••••), sin ningún dígito',
    demoPreview.filas.every(t => t === '$••••••'), demoPreview.filas);
  check('   igual que el total repartido de arriba', /••••••/.test(demoPreview.totalLine) && !/\d/.test(demoPreview.totalLine), demoPreview.totalLine);

  // confirm it and check the committed row's masked display too (moneyPlainMasked in the
  // settlement view, renderPersonaSettlementRows).
  await page.click('[data-share-confirm="' + txDemo + '"]');
  await page.waitForTimeout(150);
  const demoCommitted = await page.evaluate(() => document.querySelector('.persona-amt') ? document.querySelector('.persona-amt').textContent : null);
  check('   y también la fila ya comprometida (settlement view), reusando moneyPlainMasked', demoCommitted === '••••••', demoCommitted);

  await page.evaluate(() => { window.__debug.state.demoMode = false; });
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
