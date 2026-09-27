// Tercera y última vía de entrada en dólares: la cartola. Las otras dos (a mano y el import del
// correo) ya convertían; esta no, y fallaba peor que las otras dos juntas.
//
// parseMontoCLP borra TODO lo que no sea dígito -- correcto para pesos, donde el punto es
// separador de miles y no hay decimales, pero destructivo para dólares: "US$51,25" le quedaba en
// 5125, o sea $5.125 pesos. Una compra de ~$49.000 entraba como $5.125, mal por un factor de ~10,
// y el marcador "US$" se descartaba junto con el resto, así que no quedaba ni rastro de que había
// sido en otra moneda.
//
// Ahora la moneda se decide sobre el texto CRUDO, antes de tocar los dígitos, y la conversión usa
// la misma función que las otras dos vías.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const casos = ['$49.493', 'US$51,25', 'USD 51.25', '$1.234.567', 'US$1,234.56', '-US$20,00'];
    const parseado = {};
    casos.forEach(c => { parseado[c] = D.parseMontoConMoneda(c); });
    return { parseado, viejo: D.parseMontoCLP('US$51,25') };
  });

  check('(regresión) el parser viejo leía US$51,25 como 5125 pesos', r.viejo === 5125, r.viejo);
  check('un monto en pesos se sigue leyendo igual que siempre',
    r.parseado['$49.493'].monto === 49493 && r.parseado['$49.493'].moneda === 'CLP', r.parseado['$49.493']);
  check('un monto en dólares se reconoce como tal y conserva los decimales',
    r.parseado['US$51,25'].monto === 51.25 && r.parseado['US$51,25'].moneda === 'USD', r.parseado['US$51,25']);
  check('   da igual si el decimal viene con coma o con punto',
    r.parseado['USD 51.25'].monto === 51.25, r.parseado['USD 51.25']);
  check('   y entiende separador de miles junto con decimal (US$1,234.56)',
    r.parseado['US$1,234.56'].monto === 1234.56, r.parseado['US$1,234.56']);
  check('   y un monto negativo sigue siendo negativo', r.parseado['-US$20,00'].monto === -20, r.parseado['-US$20,00']);
  check('un peso grande no se confunde con dólares por tener puntos',
    r.parseado['$1.234.567'].monto === 1234567 && r.parseado['$1.234.567'].moneda === 'CLP', r.parseado['$1.234.567']);

  // ---- La transacción que se crea desde una línea en dólares ----
  const creadas = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    const linea = (extra) => Object.assign({
      fecha: '2026-09-25', detalle: 'AMAZON MIAMI', comercioSugerido: 'AMAZON MIAMI',
      monto: -49493, tipoMov: 'gasto', esEspecial: null, fuenteLineaId: 'ln1'
    }, extra);

    // (a) Convertida: monto ya en pesos, con su trazabilidad.
    D.createTxFromMovement(linea({ moneda: 'USD', montoOriginal: 51.25, tipoCambio: 965.71 }));
    // (b) Sin tipo de cambio: monto 0 y sin clasificar.
    D.createTxFromMovement(linea({ monto: 0, moneda: 'USD', montoOriginal: 51.25, tipoCambio: null, fuenteLineaId: 'ln2', comercioSugerido: 'HOTEL NY' }));
    // (c) En pesos: igual que siempre.
    D.createTxFromMovement(linea({ monto: -15000, fuenteLineaId: 'ln3', comercioSugerido: 'JUMBO' }));

    const vivas = D.buildFullStateBlob().transacciones;
    const por = n => vivas.find(t => t.comercio === n);
    const a = por('AMAZON MIAMI'), b = por('HOTEL NY'), c = por('JUMBO');
    return {
      convertida: a && { monto: a.monto, moneda: a.moneda, montoOriginal: a.montoOriginal, tipoCambio: a.tipoCambio },
      sinTC: b && { monto: b.monto, moneda: b.moneda, montoOriginal: b.montoOriginal, estado: b.estado, cats: b.categorias.length },
      enPesos: c && { monto: c.monto, moneda: c.moneda }
    };
  });

  check('(control) una línea en pesos crea la transacción igual que siempre',
    creadas.enPesos.monto === 15000 && creadas.enPesos.moneda === undefined, creadas.enPesos);
  check('una línea en dólares queda en pesos, con los tres datos guardados',
    creadas.convertida.monto === 49493 && creadas.convertida.moneda === 'USD' &&
    creadas.convertida.montoOriginal === 51.25 && creadas.convertida.tipoCambio === 965.71, creadas.convertida);
  check('sin tipo de cambio, NUNCA entra un número en dólares al campo de pesos',
    creadas.sinTC.monto === 0, creadas.sinTC);
  check('   y queda sin clasificar, para no dar por buena una cifra que todavía no es real',
    creadas.sinTC.estado === 'pendiente' && creadas.sinTC.cats === 0, creadas.sinTC);
  check('   pero el monto en dólares no se pierde', creadas.sinTC.montoOriginal === 51.25, creadas.sinTC);

  await finish({ context, browser, errors });
})();
