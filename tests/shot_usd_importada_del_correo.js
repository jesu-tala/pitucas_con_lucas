// Una compra en dólares que llega por el import del correo tenía su PROPIO comportamiento,
// distinto del de una ingresada a mano, y con dos problemas:
//
//   1. La trazabilidad se guardaba PEGADA AL NOMBRE del comercio ("AMAZON (US$51,25 a $950)").
//      Texto, no datos: no se podía recalcular, corregir ni mostrar aparte.
//   2. Si la API del dólar no respondía, dejaba el monto EN DÓLARES dentro de un campo que toda
//      la app suma como pesos. Una compra de US$51 entraba al balance como $51 -- mil veces
//      menos -- avisando solo con texto en el nombre.
//
// Ahora el Apps Script solo REPORTA que fue en dólares (en `raw`, el bolsón que la RPC ya
// acepta, así que no hizo falta ni migración de SQL ni cambiar la firma) y la conversión la hace
// la app, con la misma función que usa el ingreso manual.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const fila = (extra) => Object.assign({
      fecha: '2026-09-25', hora: '14:30', comercio: 'AMAZON', monto: 51.25,
      tipo: 'gasto', medio_sugerido: null, raw: null
    }, extra);

    // (a) Con tipo de cambio: convierte y guarda los tres datos.
    const conTC = D.txFromEmailImport(fila({ raw: { moneda: 'USD', monto_original: 51.25, tipo_cambio: 965.71 } }));
    // (b) Sin tipo de cambio: NUNCA deja dólares en el campo de pesos.
    const sinTC = D.txFromEmailImport(fila({ raw: { moneda: 'USD', monto_original: 51.25, tipo_cambio: null } }));
    // (c) Una compra en pesos, que es el caso normal, no cambia en nada.
    const enPesos = D.txFromEmailImport(fila({ monto: 15000, comercio: 'JUMBO' }));

    return {
      conTC: { monto: conTC.monto, moneda: conTC.moneda, montoOriginal: conTC.montoOriginal, tipoCambio: conTC.tipoCambio, comercio: conTC.comercio, estado: conTC.estado },
      sinTC: { monto: sinTC.monto, moneda: sinTC.moneda, montoOriginal: sinTC.montoOriginal, estado: sinTC.estado, cats: sinTC.categorias.length },
      enPesos: { monto: enPesos.monto, moneda: enPesos.moneda, comercio: enPesos.comercio }
    };
  });

  check('(control) una compra en pesos importada no cambia en nada',
    r.enPesos.monto === 15000 && r.enPesos.moneda === undefined && r.enPesos.comercio === 'JUMBO', r.enPesos);

  check('una compra en dólares queda convertida a pesos (51,25 × 965,71 = 49.493)', r.conTC.monto === 49493, r.conTC);
  check('   con la trazabilidad como CAMPOS, no pegada al nombre del comercio',
    r.conTC.moneda === 'USD' && r.conTC.montoOriginal === 51.25 && r.conTC.tipoCambio === 965.71, r.conTC);
  check('   y el nombre del comercio queda limpio, sin "(US$… a $…)"',
    r.conTC.comercio === 'AMAZON', r.conTC.comercio);

  check('sin tipo de cambio, NUNCA entra un número en dólares al campo de pesos (era el bug)',
    r.sinTC.monto === 0, r.sinTC);
  check('   la transacción llega sin clasificar, así no ensucia ningún total',
    r.sinTC.estado === 'pendiente' && r.sinTC.cats === 0, r.sinTC);
  check('   pero el monto en dólares no se pierde: queda guardado para arreglarla a mano',
    r.sinTC.montoOriginal === 51.25 && r.sinTC.moneda === 'USD', r.sinTC);

  await finish({ context, browser, errors });
})();
