// Un gasto con algo por cobrar ligado (de una PERSONA -- "pagué $25.000, me deben $15.000 de
// vuelta" -- o de un REEMBOLSO -- isapre/seguro/empleador) nunca tacha el NOMBRE de la
// transacción: sigue siendo dinero que salió de tu cuenta ese día. En vez de eso, una vez
// saldado por completo se tacha el MONTO bruto y al lado, en la misma línea, se muestra el
// costo neto real ya definitivo (lo que de verdad terminó siendo tuyo). Mientras está pendiente
// no hay ningún estado intermedio: la fila se ve como un gasto normal (eso ya lo cubre el tag
// "Por cobrar"/"Reembolso"). Y el tag que aparece una vez saldado dice "Saldado" (persona) o
// "Reembolsado" (reembolso), siempre en verde.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      // Sin nada por cobrar -- se ve como siempre.
      { id: 'gastoNormal', fecha: D.todayISO(), hora: '10:00', comercio: 'Supermercado', monto: 50000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' },
      // Reembolso YA recibido -- monto bruto tachado + neto $200.000 al lado, nombre normal.
      { id: 'gastoReembolsado', fecha: D.todayISO(), hora: '11:00', comercio: 'Clínica Alemana', monto: 1000000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 1000000 }], porCobrar: [{ persona: 'Isapre', monto: 800000, pagado: true, tipo: 'reembolso', montoRecibido: 800000, linkedTxId: null }], reglaAuto: false, nota: '' },
      // Reembolso todavía PENDIENTE -- se ve exactamente como un gasto normal, sin tachar nada.
      { id: 'gastoReembolsoPendiente', fecha: D.todayISO(), hora: '12:00', comercio: 'Farmacia Cruz Verde', monto: 500000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 500000 }], porCobrar: [{ persona: 'Seguro', monto: 400000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      // Por cobrar de PERSONA ya SALDADO -- "pagué $25.000, me deben $15.000 de vuelta" -- el
      // nombre NO se tacha (bug reportado), se tacha el bruto ($25.000) y al lado sale el neto
      // real ($10.000).
      { id: 'gastoPersonaSaldado', fecha: D.todayISO(), hora: '13:00', comercio: 'Cena con Fran', monto: 25000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restaurantes', monto: 25000 }], porCobrar: [{ persona: 'Fran', monto: 15000, pagado: true, tipo: 'persona', montoRecibido: 15000, linkedTxId: null }], reglaAuto: false, nota: '' },
      // Por cobrar de PERSONA todavía PENDIENTE -- se ve como un gasto normal, sin tachar nada.
      { id: 'gastoPersonaPendiente', fecha: D.todayISO(), hora: '14:00', comercio: 'Asado', monto: 40000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restaurantes', monto: 40000 }], porCobrar: [{ persona: 'Javi', monto: 20000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' }
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
      const tagEl = btn ? btn.querySelector('.tx-state') : null;
      return {
        nombreTachado: nombreEl ? nombreEl.classList.contains('tachado') : null,
        montoTachado: montoEl ? montoEl.classList.contains('tachado') : null,
        bruto: montoEl ? montoEl.textContent : null,
        real: realEl ? realEl.textContent : null,
        tag: tagEl ? tagEl.textContent : null
      };
    };
    return {
      normal: filaDe('gastoNormal'),
      reembolsado: filaDe('gastoReembolsado'),
      pendiente: filaDe('gastoReembolsoPendiente'),
      personaSaldado: filaDe('gastoPersonaSaldado'),
      personaPendiente: filaDe('gastoPersonaPendiente')
    };
  });

  check('Gasto SIN nada por cobrar: nombre no tachado, monto no tachado, sin neto al lado', filas.normal.nombreTachado === false && filas.normal.montoTachado === false && filas.normal.real === null, filas.normal);

  check('Reembolso YA RECIBIDO: el nombre no se tacha', filas.reembolsado.nombreTachado === false, filas.reembolsado);
  check('   el monto bruto sí se tacha ($1.000.000)', filas.reembolsado.montoTachado === true && filas.reembolsado.bruto === '$1.000.000', filas.reembolsado);
  check('   y el neto real sale al lado ($200.000)', filas.reembolsado.real === '$200.000', filas.reembolsado);
  check('   el tag dice "Reembolsado" en verde', filas.reembolsado.tag === 'Reembolsado', filas.reembolsado);

  check('Reembolso PENDIENTE: nada tachado, sin estado intermedio', filas.pendiente.nombreTachado === false && filas.pendiente.montoTachado === false && filas.pendiente.real === null, filas.pendiente);

  check('Por cobrar de PERSONA ya SALDADO: el nombre NO se tacha (bug reportado -- seguía siendo dinero que gastaste)', filas.personaSaldado.nombreTachado === false, filas.personaSaldado);
  check('   se tacha el monto bruto completo ($25.000)', filas.personaSaldado.montoTachado === true && filas.personaSaldado.bruto === '$25.000', filas.personaSaldado);
  check('   y al lado sale lo que de verdad terminó siendo tuyo ($10.000)', filas.personaSaldado.real === '$10.000', filas.personaSaldado);
  check('   el tag dice "Saldado" (no "Cobrado"), en verde', filas.personaSaldado.tag === 'Saldado', filas.personaSaldado);

  check('Por cobrar de PERSONA PENDIENTE: nada tachado, sin estado intermedio', filas.personaPendiente.nombreTachado === false && filas.personaPendiente.montoTachado === false && filas.personaPendiente.real === null, filas.personaPendiente);

  await finish({ context, browser, errors });
})();
