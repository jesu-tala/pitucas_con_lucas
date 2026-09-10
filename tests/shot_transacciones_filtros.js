// Dos bugs reportados juntos en la vista Transacciones:
// 1) "El filtro por tarjeta no funciona": el chip de tarjeta/medio en la hoja de Filtros se
//    pintaba con data-toggle-filter-medio (sheet.ts, chipToggle) pero el listener de clicks
//    escuchaba data-toggle-filter-payment-method (events.ts) -- un nombre de atributo distinto,
//    así que el click nunca hacía nada: el chip nunca se agregaba a state.advFilters.medios y el
//    filtro por tarjeta jamás achicaba la lista.
// 2) "Cuando cambian los filtros de transacciones deberían cambiar los valores de
//    ingresos/reembolsos, por cobrar, pendientes": renderFilterSummary() (views/transacciones.ts)
//    solo recalculaba esos totales sobre un subconjunto filtrado cuando había un drill-down de
//    categoría activo (state.categoryFilter) -- los filtros de la hoja de Filtros (categoría,
//    tarjeta, rango de fechas) y la búsqueda nunca afectaban esos totales, aunque sí afectaban
//    la lista de abajo, dando la sensación de que "no hacían nada".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 't1', fecha: '2026-09-01', hora: '10:00', comercio: 'Sueldo Septiembre', monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [] },
      { id: 't2', fecha: '2026-09-02', hora: '11:00', comercio: 'Reembolso seguro', monto: 200000, medio: 'visa_bch', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'pololos_extra', monto: 200000 }], porCobrar: [] },
      { id: 't3', fecha: '2026-09-03', hora: '12:00', comercio: 'Supermercado Jumbo', monto: 45000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 45000 }], porCobrar: [] }
    );
    D.state.filter = 'entradas';
    D.state.categoryFilter = null;
    D.state.categoryFilterMonth = null;
    D.state.searchQuery = '';
    D.state.advFilters = { cats: [], medios: [], grupos: [], dateFrom: '', dateTo: '' };
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(200);

  // ---------- Bug 2: los totales de "Entradas" (Ingresos) parten sumando TODO ----------
  const totalesSinFiltro = await page.evaluate(() => document.querySelector('.stat-ingresos .stat-value')?.textContent);
  check('Sin filtros avanzados, "Ingresos" suma las 2 entradas ($1.200.000)', totalesSinFiltro === '$1.200.000', totalesSinFiltro);

  // ---------- Abrir Filtros y activar el chip de la tarjeta (Visa Banco de Chile) ----------
  await page.click('[data-open-filters]');
  await page.waitForTimeout(200);
  const chipAntes = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('[data-toggle-filter-medio]')).find(b => b.textContent.includes('Visa Banco de Chile'));
    return btn ? btn.getAttribute('style') || '' : null;
  });
  check('El chip "Visa Banco de Chile" existe en la hoja de Filtros', chipAntes !== null, chipAntes);

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('[data-toggle-filter-medio]')).find(b => b.textContent.includes('Visa Banco de Chile'));
    btn.click();
  });
  await page.waitForTimeout(150);
  const trasClick = await page.evaluate(() => ({
    advFiltersMedios: window.__debug.state.advFilters.medios.slice(),
    chipQuedoActivo: Array.from(document.querySelectorAll('[data-toggle-filter-medio]')).find(b => b.textContent.includes('Visa Banco de Chile'))?.getAttribute('style') || '',
  }));
  check('Bug 1 arreglado: tocar el chip de la tarjeta SÍ la agrega a state.advFilters.medios', trasClick.advFiltersMedios.includes('visa_bch'), trasClick);
  check('   y el chip se pinta como activo', trasClick.chipQuedoActivo.includes('accent'), trasClick);

  await page.click('[data-apply-advfilters]');
  await page.waitForTimeout(200);

  // ---------- Bug 1 verificado en la lista: solo debería quedar la transacción de esa tarjeta ----------
  const listaFiltrada = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tx-item'));
    return { cantidad: items.length, textos: items.map(i => i.textContent) };
  });
  check('Filtrando por "Visa Banco de Chile", la lista muestra solo 1 transacción (Reembolso seguro)',
    listaFiltrada.cantidad === 1 && listaFiltrada.textos[0].includes('Reembolso seguro'), listaFiltrada);

  // ---------- Bug 2 verificado: el total de Ingresos ahora refleja SOLO la tarjeta filtrada ----------
  const totalesConFiltro = await page.evaluate(() => document.querySelector('.stat-ingresos .stat-value')?.textContent);
  check('Bug 2 arreglado: con el filtro de tarjeta activo, "Ingresos" baja a $200.000 (solo esa tarjeta)', totalesConFiltro === '$200.000', totalesConFiltro);

  // Limpiar filtros: los totales vuelven a sumar todo.
  await page.click('[data-open-filters]');
  await page.waitForTimeout(150);
  await page.click('[data-clear-advfilters]');
  await page.waitForTimeout(150);
  await page.click('[data-apply-advfilters]');
  await page.waitForTimeout(200);
  const totalesTrasLimpiar = await page.evaluate(() => document.querySelector('.stat-ingresos .stat-value')?.textContent);
  check('Al limpiar los filtros, "Ingresos" vuelve a $1.200.000', totalesTrasLimpiar === '$1.200.000', totalesTrasLimpiar);

  await finish({ context, browser, errors });
})();
