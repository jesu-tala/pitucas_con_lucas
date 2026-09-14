// Reembolso: se tacha el MONTO, no el nombre. En la lista de Transacciones, un gasto con
// reembolso YA RECIBIDO muestra el monto bruto tachado y, al lado (misma línea), el costo neto
// real (bruto - reembolso). El nombre de la transacción NUNCA se tacha por un reembolso -- solo
// se tacha cuando lo cobrado es un "por cobrar" de persona (compartido con alguien). Mientras el
// reembolso está pendiente, no existe un estado intermedio especial: la fila se ve normal, sin
// tachar nada (eso ya lo cubre el tag "Reembolso").
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      // Sin reembolso -- se ve como siempre.
      { id: 'gastoNormal', fecha: D.todayISO(), hora: '10:00', comercio: 'Supermercado', monto: 50000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' },
      // Reembolso YA recibido -- monto bruto tachado + neto $200.000 al lado, nombre normal.
      { id: 'gastoReembolsado', fecha: D.todayISO(), hora: '11:00', comercio: 'Clínica Alemana', monto: 1000000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 1000000 }], porCobrar: [{ persona: 'Isapre', monto: 800000, pagado: true, tipo: 'reembolso', montoRecibido: 800000, linkedTxId: null }], reglaAuto: false, nota: '' },
      // Reembolso todavía PENDIENTE -- se ve exactamente como un gasto normal, sin tachar nada.
      { id: 'gastoReembolsoPendiente', fecha: D.todayISO(), hora: '12:00', comercio: 'Farmacia Cruz Verde', monto: 500000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 500000 }], porCobrar: [{ persona: 'Seguro', monto: 400000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      // Por cobrar de PERSONA (no reembolso), ya cobrado -- el nombre SÍ se sigue tachando (no
      // es lo que este bug pedía cambiar).
      { id: 'gastoCobradoPersona', fecha: D.todayISO(), hora: '13:00', comercio: 'Cena con Fran', monto: 20000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restaurantes', monto: 20000 }], porCobrar: [{ persona: 'Fran', monto: 10000, pagado: true, tipo: 'persona', montoRecibido: 10000, linkedTxId: null }], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  const filas = await page.evaluate(() => {
    const filaDe = (id) => {
      const btn = document.querySelector('[data-tx="' + id + '"]');
      const nombreEl = btn ? btn.querySelector('.tx-name') : null;
      const montoEl = btn ? btn.querySelector('.tx-amount') : null;
      const realEl = btn ? btn.querySelector('.tx-amount-real') : null;
      return {
        nombreTachado: nombreEl ? nombreEl.classList.contains('tachado') : null,
        montoTachado: montoEl ? montoEl.classList.contains('tachado') : null,
        bruto: montoEl ? montoEl.textContent : null,
        real: realEl ? realEl.textContent : null
      };
    };
    return {
      normal: filaDe('gastoNormal'),
      reembolsado: filaDe('gastoReembolsado'),
      pendiente: filaDe('gastoReembolsoPendiente'),
      cobradoPersona: filaDe('gastoCobradoPersona')
    };
  });

  check('Gasto SIN reembolso: nombre no tachado', filas.normal.nombreTachado === false, filas.normal);
  check('Gasto SIN reembolso: monto no tachado y sin monto real al lado', filas.normal.montoTachado === false && filas.normal.real === null, filas.normal);

  check('Reembolso YA RECIBIDO: el NOMBRE no se tacha (bug arreglado)', filas.reembolsado.nombreTachado === false, filas.reembolsado);
  check('Reembolso YA RECIBIDO: el MONTO bruto sí se tacha', filas.reembolsado.montoTachado === true, filas.reembolsado);
  check('   el bruto sigue siendo el monto completo ($1.000.000)', filas.reembolsado.bruto === '$1.000.000', filas.reembolsado);
  check('   y al lado, en línea, se ve el neto real ($200.000)', filas.reembolsado.real === '$200.000', filas.reembolsado);

  check('Reembolso PENDIENTE: no se tacha el nombre', filas.pendiente.nombreTachado === false, filas.pendiente);
  check('Reembolso PENDIENTE: no se tacha el monto (sin estado intermedio)', filas.pendiente.montoTachado === false, filas.pendiente);
  check('   se ve el monto normal, sin neto al lado', filas.pendiente.bruto === '$500.000' && filas.pendiente.real === null, filas.pendiente);

  check('Por cobrar de PERSONA (no reembolso) ya cobrado: el nombre SÍ sigue tachado', filas.cobradoPersona.nombreTachado === true, filas.cobradoPersona);
  check('   y el monto no se tacha por eso (esa lógica es solo para reembolso)', filas.cobradoPersona.montoTachado === false, filas.cobradoPersona);

  await finish({ context, browser, errors });
})();
