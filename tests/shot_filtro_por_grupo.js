// Feature: "quiero que se pueda filtrar por grupo" -- se agrega "Grupo" como un filtro más en
// la hoja de Filtros de Transacciones (junto a categoría/tarjeta/fecha), usando el groupId que
// ya tiene cualquier transacción compartida con un grupo (types.ts).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [
      { id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' },
      { id: 'g2', nombre: 'Viaje', icono: '✈️', creado_por: 'user-jesu', invite_code: 'y', created_at: '' }
    ];
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 't1', fecha: '2026-09-01', hora: '10:00', comercio: 'Supermercado del depto', monto: 30000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 30000 }], porCobrar: [], groupId: 'g1' },
      { id: 't2', fecha: '2026-09-02', hora: '11:00', comercio: 'Pasajes del viaje', monto: 80000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 80000 }], porCobrar: [], groupId: 'g2' },
      { id: 't3', fecha: '2026-09-03', hora: '12:00', comercio: 'Gasto personal, sin grupo', monto: 5000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros', monto: 5000 }], porCobrar: [] }
    );
    D.state.filter = 'todas';
    D.state.tab = 'transacciones';
    D.state.advFilters = { cats: [], medios: [], grupos: [], dateFrom: '', dateTo: '' };
    D.render();
  });
  await page.waitForTimeout(150);

  const sinFiltro = await page.evaluate(() => document.querySelectorAll('.tx-item').length);
  check('Sin filtros, se ven las 3 transacciones', sinFiltro === 3, sinFiltro);

  await page.click('[data-open-filters]');
  await page.waitForTimeout(150);
  const seccionGrupo = await page.evaluate(() => {
    const titulo = Array.from(document.querySelectorAll('.sheet-block-title')).find(el => el.textContent.trim() === 'Grupo');
    return {
      existeSeccion: !!titulo,
      chips: Array.from(document.querySelectorAll('[data-toggle-filter-grupo]')).map(b => b.textContent.trim()),
    };
  });
  check('La hoja de Filtros tiene una sección "Grupo"', seccionGrupo.existeSeccion === true, seccionGrupo);
  check('   con un chip por cada grupo ("Depto" y "Viaje")', seccionGrupo.chips.some(t => t.includes('Depto')) && seccionGrupo.chips.some(t => t.includes('Viaje')), seccionGrupo);
  check('   y además un chip "Personal" para las transacciones sin grupo', seccionGrupo.chips.some(t => t.includes('Personal')), seccionGrupo);

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('[data-toggle-filter-grupo]')).find(b => b.textContent.includes('Depto'));
    btn.click();
  });
  await page.waitForTimeout(150);
  const trasElegir = await page.evaluate(() => window.__debug.state.advFilters.grupos.slice());
  check('Elegir "Depto" lo agrega a state.advFilters.grupos', trasElegir.length === 1 && trasElegir[0] === 'g1', trasElegir);

  await page.click('[data-apply-advfilters]');
  await page.waitForTimeout(200);
  const filtrado = await page.evaluate(() => Array.from(document.querySelectorAll('.tx-item')).map(i => i.textContent));
  check('Filtrando por "Depto", solo aparece la transacción de ese grupo', filtrado.length === 1 && filtrado[0].includes('Supermercado del depto'), filtrado);

  // "Personal" se puede elegir junto con grupos reales -- no es excluyente, es un chip más.
  await page.click('[data-open-filters]');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('[data-toggle-filter-grupo]')).find(b => b.textContent.includes('Personal'));
    btn.click();
  });
  await page.click('[data-apply-advfilters]');
  await page.waitForTimeout(200);
  const conPersonalYDepto = await page.evaluate(() => Array.from(document.querySelectorAll('.tx-item')).map(i => i.textContent));
  check('Con "Personal" + "Depto" elegidos, aparecen la del depto Y la personal (2)',
    conPersonalYDepto.length === 2 && conPersonalYDepto.some(t => t.includes('Supermercado del depto')) && conPersonalYDepto.some(t => t.includes('Gasto personal')),
    conPersonalYDepto);

  // Solo "Personal" (sin ningún grupo elegido) muestra únicamente lo que no tiene grupo.
  await page.click('[data-open-filters]');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('[data-toggle-filter-grupo]')).find(b => b.textContent.includes('Depto'));
    btn.click(); // saca "Depto", deja solo "Personal" elegido
  });
  await page.click('[data-apply-advfilters]');
  await page.waitForTimeout(200);
  const soloPersonal = await page.evaluate(() => Array.from(document.querySelectorAll('.tx-item')).map(i => i.textContent));
  check('Solo "Personal" elegido muestra únicamente la transacción sin grupo', soloPersonal.length === 1 && soloPersonal[0].includes('Gasto personal'), soloPersonal);

  // Limpiar filtros vuelve a mostrar todo.
  await page.click('[data-open-filters]');
  await page.waitForTimeout(150);
  await page.click('[data-clear-advfilters]');
  await page.waitForTimeout(150);
  await page.click('[data-apply-advfilters]');
  await page.waitForTimeout(200);
  const trasLimpiar = await page.evaluate(() => document.querySelectorAll('.tx-item').length);
  check('Limpiar filtros vuelve a mostrar las 3 transacciones', trasLimpiar === 3, trasLimpiar);

  // Sin ningún grupo creado, la sección "Grupo" no aparece (no tendría nada que ofrecer).
  await page.evaluate(() => {
    const D = window.__debug;
    D.GROUPS = [];
    D.state.creatingGroup = false;
    D.render();
  });
  await page.click('[data-open-filters]');
  await page.waitForTimeout(150);
  const sinGrupos = await page.evaluate(() => !Array.from(document.querySelectorAll('.sheet-block-title')).some(el => el.textContent.trim() === 'Grupo'));
  check('Sin ningún grupo creado, la sección "Grupo" no aparece en Filtros', sinGrupos === true, sinGrupos);

  await finish({ context, browser, errors });
})();
