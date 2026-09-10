// Bug real reportado: "en la vista pendientes no entiendo por qué transacciones ya
// categorizadas aparecen ahí". Causa: applyLockRule (helpers.ts), al activar "clasificar
// siempre así" para un comercio, le copiaba la categoría a TODAS las demás transacciones de
// ese mismo comercio -- incluidas las que estaban 'pendiente' -- pero nunca actualizaba su
// estado. Quedaban con categoría asignada pero atrapadas para siempre en la pestaña
// Pendientes (que filtra por estado==='pendiente', no por si tienen categoría).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 420, height: 1400 } });

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push(
      { id: 'reglaA', fecha: D.todayISO(), hora: '10:00', comercio: 'Cafe Regla Test', monto: 3000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 3000 }], porCobrar: [], reglaAuto: false, nota: '' },
      { id: 'reglaB', fecha: D.todayISO(), hora: '09:00', comercio: 'Cafe Regla Test', monto: 2500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  // Activar "clasificar siempre así" desde la transacción ya categorizada (reglaA)
  await page.click('[data-tx="reglaA"]');
  await page.waitForTimeout(150);
  await page.click('[data-toggle-lock="reglaA"]');
  await page.waitForTimeout(150);
  await page.click('#sheet-close, .sheet-close');
  await page.waitForTimeout(150);

  const reglaB = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'reglaB'));
  check('La regla automática le copió la categoría a la otra transacción del mismo comercio', reglaB.categorias.length > 0 && reglaB.categorias[0].cat === 'restoranes', reglaB);
  check('Y también la sacó de "pendiente" (pasó a confirmado)', reglaB.estado === 'confirmado', reglaB.estado);

  // Y de verdad desaparece de la pestaña Pendientes
  await page.evaluate(() => { window.__debug.state.filter = 'pendientes'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const sigueEnPendientes = await page.evaluate(() => !!document.querySelector('[data-tx="reglaB"]'));
  check('reglaB ya no aparece en la lista de Pendientes', !sigueEnPendientes);

  await finish({ context, browser, errors });
})();
