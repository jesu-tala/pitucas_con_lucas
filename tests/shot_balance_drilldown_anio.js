// Bug 5: el drill-down del Balance anual filtraba por el mes actual, no por el año. Con el
// selector en "Año", tocar una categoría (ej. "Sueldo") debía mostrar las transacciones de esa
// categoría de TODO el año -- en cambio mostraba solo las del mes actual. Causa: el click en la
// leyenda del donut (events.ts) siempre usaba MONTHS[state.monthIndex] (el mes actualmente
// seleccionado), sin importar si Balance estaba en modo Mes o Año -- el donut no tenía forma de
// decir con qué período se lo había alimentado. Arreglo: renderDonutBlock (ui/donut.ts) ahora
// recibe y estampa ese período (mes 'YYYY-MM' o año 'YYYY') como data-periodo, y el click lo lee
// de ahí en vez de asumir "el mes seleccionado" a ciegas.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const anio = await page.evaluate(() => {
    const D = window.__debug;
    const anio = D.todayISO().slice(0, 4);
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 'sueldoEnero', fecha: anio + '-01-05', hora: '09:00', comercio: 'Sueldo Enero', monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [], reglaAuto: false, nota: '' },
      { id: 'sueldoMesActual', fecha: D.todayISO(), hora: '09:00', comercio: 'Sueldo del mes', monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'resumen';
    D.state.summarySub = 'balance';
    D.render();
    return anio;
  });
  await page.waitForTimeout(150);

  // ---------- Modo Mes: sigue filtrando solo por el mes seleccionado (comportamiento de siempre) ----------
  await page.evaluate(() => { window.__debug.state.balancePeriodo = 'mes'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('#resumen-content .legend-row');
  await page.waitForTimeout(150);
  const enModoMes = await page.evaluate(() => ({
    tab: window.__debug.state.tab,
    categoryFilterMonth: window.__debug.state.categoryFilterMonth,
    filas: Array.from(document.querySelectorAll('.tx-item')).map(el => el.textContent),
  }));
  check('Modo Mes: el drill-down deja categoryFilterMonth en el mes actual (formato YYYY-MM)',
    enModoMes.categoryFilterMonth && enModoMes.categoryFilterMonth.length === 7, enModoMes.categoryFilterMonth);
  check('   y la lista trae solo la transacción del mes actual, no la de enero', enModoMes.filas.length === 1 && enModoMes.filas[0].includes('Sueldo del mes'), enModoMes.filas);

  // ---------- Modo Año: el drill-down trae TODO el año, no solo el mes actual ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.categoryFilter = null; D.state.categoryFilterMonth = null;
    D.state.tab = 'resumen'; D.state.summarySub = 'balance'; D.state.balancePeriodo = 'año';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('#resumen-content .legend-row');
  await page.waitForTimeout(150);
  const enModoAnio = await page.evaluate(() => ({
    tab: window.__debug.state.tab,
    categoryFilterMonth: window.__debug.state.categoryFilterMonth,
    filas: Array.from(document.querySelectorAll('.tx-item')).map(el => el.textContent),
  }));
  check('Modo Año: el drill-down deja categoryFilterMonth en el AÑO (formato YYYY, no YYYY-MM)',
    enModoAnio.categoryFilterMonth === anio, enModoAnio.categoryFilterMonth);
  check('   y la lista trae las 2 transacciones del año (enero Y el mes actual), no solo una',
    enModoAnio.filas.length === 2 && enModoAnio.filas.some(f => f.includes('Sueldo Enero')) && enModoAnio.filas.some(f => f.includes('Sueldo del mes')),
    enModoAnio.filas);

  const pill = await page.evaluate(() => document.querySelector('[data-clear-catfilter]')?.textContent || '');
  check('El chip de filtro activo muestra el año, no un mes', pill.includes(anio) && !/de\s+\d{4}/i.test(pill), pill);

  await finish({ context, browser, errors });
})();
