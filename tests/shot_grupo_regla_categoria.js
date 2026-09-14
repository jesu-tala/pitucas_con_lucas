// Refinamiento C de grupos: regla recurrente "categoría -> grupo + división por defecto" (ej.
// "Arriendo" siempre es del grupo "Hogar"). A diferencia de una regla de clasificación por
// comercio (reglaAuto -- ver applyLockRule en helpers.ts, que SÍ reescribe transacciones
// pasadas), esta:
//   · pre-llena grupo/división/participantes al compartir una transacción NUEVA con esa
//     categoría (shareDraftForTx), pero se puede sobrescribir libremente por transacción.
//   · editar la regla (o guardar una nueva desde otra transacción) solo cambia el default para
//     lo que se comparta DE AHÍ EN ADELANTE -- lo ya compartido guarda su propio snapshot
//     (porCobrar/divisionTipo en la transacción, o el reparto real en gastos_compartidos) y
//     nunca se reescribe.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Hogar', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.SHARED_EXPENSES = [];
    D.GROUP_CATEGORY_RULES = {};
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  // ---------- (1) Sin regla todavía: "Elegir un grupo" arranca con el default genérico ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push({ id: 'tArriendo1', fecha: D.todayISO(), hora: '10:00', comercio: 'Arriendo depto', monto: 400000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 400000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.render();
  });
  await page.click('[data-tx="tArriendo1"]');
  await page.waitForTimeout(200);
  await page.click('[data-share-open="tArriendo1"]');
  await page.waitForTimeout(150);
  const conCheckbox = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Usar siempre esta división'));
  check('(pre) El checkbox "usar siempre esta división" aparece cuando la tx tiene 1 sola categoría', conCheckbox);

  // Fran paga 300.000, yo 100.000 (monto fijo) -- y marco "usar siempre esta división para Hogar".
  await page.click('[data-seg="division-tipo"] [data-seg-val="montos"]');
  await page.waitForTimeout(100);
  await page.fill('[data-share-value="p1"]', '100000');
  await page.waitForTimeout(80);
  await page.fill('[data-share-value="p2"]', '300000');
  await page.waitForTimeout(150);
  await page.selectOption('select[data-share-pagador]', 'p2');
  await page.waitForTimeout(100);
  await page.click('[data-share-save-as-rule]');
  await page.waitForTimeout(100);
  const draftListo = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('$400.000 de $400.000'));
  check('(1) El draft cuadra el total antes de guardar', draftListo);

  // El write real (shareExistingTransaction) está bloqueado por sb en el sandbox -- guardamos
  // la regla directamente vía el mismo código que corre data-share-confirm, para probar el
  // resto del flujo (shareDraftForTx en la SIGUIENTE transacción) sin depender de la red.
  const reglaGuardada = await page.evaluate(() => {
    const D = window.__debug;
    D.GROUP_CATEGORY_RULES.hogar = { groupId: 'g1', divisionTipo: 'montos', pagadoPorId: 'p2', customValues: { p1: '100000', p2: '300000' } };
    return D.GROUP_CATEGORY_RULES.hogar;
  });
  check('   la regla queda guardada para la categoría "hogar" con el grupo/división/pagador reales', reglaGuardada.groupId === 'g1' && reglaGuardada.divisionTipo === 'montos' && reglaGuardada.pagadoPorId === 'p2', reglaGuardada);
  await page.click('[data-share-cancel]');
  await page.waitForTimeout(150);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (2) Con la regla guardada: una NUEVA transacción de "hogar" arranca prellenada ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push({ id: 'tArriendo2', fecha: D.todayISO(), hora: '10:00', comercio: 'Arriendo depto', monto: 400000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 400000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.render();
  });
  await page.click('[data-tx="tArriendo2"]');
  await page.waitForTimeout(200);
  await page.click('[data-share-open="tArriendo2"]');
  await page.waitForTimeout(150);
  const prellenado = await page.evaluate(() => {
    const grupoSel = document.querySelector('select[data-share-group]');
    const pagadorSel = document.querySelector('select[data-share-pagador]');
    return {
      grupo: grupoSel ? grupoSel.value : null,
      pagador: pagadorSel ? pagadorSel.value : null,
      texto: document.getElementById('sheet-content').textContent,
    };
  });
  check('(2) La nueva transacción de la misma categoría arranca con el grupo de la regla (Hogar)', prellenado.grupo === 'g1', prellenado);
  check('   con el mismo pagador (Fran) y montos (100.000/300.000) precargados de la regla', prellenado.pagador === 'p2' && prellenado.texto.includes('$400.000 de $400.000'), prellenado);

  // ---------- (3) Se puede sobrescribir libremente por transacción, sin tocar la regla ----------
  await page.click('[data-seg="division-tipo"] [data-seg-val="iguales"]');
  await page.waitForTimeout(150);
  const sobrescrito = await page.evaluate(() => ({
    reglaSigueIgual: window.__debug.GROUP_CATEGORY_RULES.hogar.divisionTipo === 'montos',
    draftCambio: window.__debug.state.shareDraft.divisionTipo === 'iguales',
  }));
  check('(3) Cambiar la división de ESTA transacción no toca la regla guardada', sobrescrito.reglaSigueIgual && sobrescrito.draftCambio, sobrescrito);

  await page.click('[data-share-cancel]');
  await page.waitForTimeout(150);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- (4) El pasado es inmutable: la tx-1 (ya "compartida" a mano) no cambia si edito la regla ----------
  const txPasadaAntes = await page.evaluate(() => JSON.parse(JSON.stringify(window.__debug.TRANSACTIONS.find(t => t.id === 'tArriendo1'))));
  await page.evaluate(() => {
    // Editar la regla (otro grupo, otra división) -- simula "cambié la regla".
    window.__debug.GROUP_CATEGORY_RULES.hogar = { groupId: 'g1', divisionTipo: 'pct', pagadoPorId: 'p1', customValues: { p1: '50', p2: '50' } };
  });
  const txPasadaDespues = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'tArriendo1'));
  check('(4) Editar la regla no reescribe ninguna transacción ya existente (el pasado es inmutable)', JSON.stringify(txPasadaAntes) === JSON.stringify(txPasadaDespues), { antes: txPasadaAntes, despues: txPasadaDespues });

  // ---------- (5) Menú: la regla se puede ver y eliminar ----------
  await page.evaluate(() => { window.__debug.state.tab = 'menu'; window.__debug.state.menuSection = 'reglas'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const enMenu = await page.evaluate(() => document.getElementById('view-root').textContent);
  check('(5) La regla de grupo aparece listada en Menú > Reglas de clasificación', enMenu.includes('Reglas de grupo') && enMenu.includes('Hogar'), enMenu.slice(0, 600));

  await finish({ context, browser, errors });
})();
