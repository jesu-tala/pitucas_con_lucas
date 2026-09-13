// Nuevo pedido sobre reembolsos: en la lista de Transacciones, un gasto con reembolso ligado
// debe mostrar el monto BRUTO como principal (lo que de verdad salió de la tarjeta/cuenta, sin
// tocar) y, en chico debajo, el costo neto real -- "Pagado real: $X" si el reembolso ya llegó
// (definitivo), o "Neto estimado: $X" si todavía está pendiente (usa el monto esperado, puede
// ajustarse). Sin ningún reembolso ligado, la fila se ve como siempre (sin esa línea extra).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      // Sin reembolso -- se ve como siempre, sin línea extra.
      { id: 'gastoNormal', fecha: D.todayISO(), hora: '10:00', comercio: 'Supermercado', monto: 50000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' },
      // Reembolso YA recibido -- "Pagado real: $200.000" (neto = 1.000.000 - 800.000).
      { id: 'gastoReembolsado', fecha: D.todayISO(), hora: '11:00', comercio: 'Clínica Alemana', monto: 1000000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 1000000 }], porCobrar: [{ persona: 'Isapre', monto: 800000, pagado: true, tipo: 'reembolso', montoRecibido: 800000, linkedTxId: null }], reglaAuto: false, nota: '' },
      // Reembolso todavía PENDIENTE -- "Neto estimado: $200.000" (mismo neto, pero es estimado).
      { id: 'gastoReembolsoPendiente', fecha: D.todayISO(), hora: '12:00', comercio: 'Farmacia Cruz Verde', monto: 500000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 500000 }], porCobrar: [{ persona: 'Seguro', monto: 400000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  const filas = await page.evaluate(() => {
    const filaDe = (id) => {
      const btn = document.querySelector('[data-tx="' + id + '"]');
      const netoEl = btn ? btn.querySelector('.tx-neto-reembolso') : null;
      return { bruto: btn?.querySelector('.tx-amount')?.textContent, neto: netoEl ? netoEl.textContent : null };
    };
    return { normal: filaDe('gastoNormal'), reembolsado: filaDe('gastoReembolsado'), pendiente: filaDe('gastoReembolsoPendiente') };
  });

  check('Un gasto SIN reembolso no muestra ninguna línea extra de neto', filas.normal.neto === null, filas.normal);
  check('Un gasto con reembolso YA RECIBIDO muestra el bruto completo como monto principal',
    filas.reembolsado.bruto === '$1.000.000', filas.reembolsado);
  check('   y en chico debajo, "Pagado real: $200.000" (el neto ya definitivo)',
    filas.reembolsado.neto === 'Pagado real: $200.000', filas.reembolsado);
  check('Un gasto con reembolso PENDIENTE también muestra el bruto completo como principal',
    filas.pendiente.bruto === '$500.000', filas.pendiente);
  check('   y en chico debajo, "Neto estimado: $100.000" (todavía no confirmado)',
    filas.pendiente.neto === 'Neto estimado: $100.000', filas.pendiente);

  await finish({ context, browser, errors });
})();
