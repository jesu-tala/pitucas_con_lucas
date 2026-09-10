// Feature: "quiero arriba de transacciones que me aparezcan próx cuotas". Las cuotas
// proyectadas (regenerateInstallmentsFor, shared-expenses.ts) ya vivían en TRANSACTIONS con su
// fecha futura real -- técnicamente ya aparecían arriba de la lista (ordenada por fecha
// descendente), pero mezcladas con el resto sin nada que las agrupe. Esta tarjeta nueva las
// junta arriba de todo, ordenadas por la más próxima primero.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    // La data de ejemplo ya trae su propia cuota proyectada (Falabella · Notebook) -- se limpia
    // para que este test controle exactamente qué cuotas hay, sin interferencia.
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 'cuota-1', fecha: '2026-11-15', hora: '00:00', comercio: 'Falabella', monto: 45000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros', monto: 45000 }], porCobrar: [], cuotaProyectada: true, cuotaNumero: 3, cuotaTotal: 12, cuotaOf: 'root-1' },
      { id: 'cuota-2', fecha: '2026-10-15', hora: '00:00', comercio: 'Sodimac', monto: 20000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros', monto: 20000 }], porCobrar: [], cuotaProyectada: true, cuotaNumero: 2, cuotaTotal: 6, cuotaOf: 'root-2' }
    );
    D.state.filter = 'todas';
    D.state.categoryFilter = null;
    D.state.searchQuery = '';
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  const banner = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.cuotas-proximas-card'));
    return cards.length ? cards[0].textContent : null;
  });
  check('Aparece la tarjeta "Próximas cuotas" arriba de la lista', banner !== null, banner);
  check('   con las 2 cuotas futuras (Falabella y Sodimac)', banner && banner.includes('Falabella') && banner.includes('Sodimac'), banner);
  check('   la más próxima (Sodimac, octubre) antes que la más lejana (Falabella, noviembre)',
    banner && banner.indexOf('Sodimac') < banner.indexOf('Falabella'), banner);
  check('   muestra el número de cuota de cada una', banner && banner.includes('2/6') && banner.includes('3/12'), banner);
  check('   y el total sumado de ambas ($65.000)', banner && banner.includes('$65.000'), banner);

  // Con un filtro/búsqueda activo, la tarjeta no debe aparecer (mismo criterio que el banner de sueldo).
  await page.evaluate(() => { window.__debug.state.searchQuery = 'algo'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const conBusqueda = await page.evaluate(() => !document.querySelector('.cuotas-proximas-card'));
  check('Con una búsqueda activa, la tarjeta no aparece (no distrae del resultado buscado)', conBusqueda === true, conBusqueda);

  // Sin ninguna cuota proyectada futura, tampoco aparece.
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.searchQuery = '';
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({ id: 't-normal', fecha: D.todayISO(), hora: '10:00', comercio: 'Café', monto: 3000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros', monto: 3000 }], porCobrar: [] });
    D.render();
  });
  await page.waitForTimeout(150);
  const sinCuotas = await page.evaluate(() => !document.querySelector('.cuotas-proximas-card'));
  check('Sin ninguna cuota proyectada, la tarjeta no aparece', sinCuotas === true, sinCuotas);

  await finish({ context, browser, errors });
})();
