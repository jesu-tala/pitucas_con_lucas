// jesu preguntó: "el punto 4 [presupuesto cruzado sin tener la app abierta] podría pasar
// porque tenemos lo de clasificar ciertas transacciones como siempre de la misma categoría
// -- ¿esto funciona bien? no lo he testeado". Investigando: SÍ existía una regla de
// clasificación automática por comercio (reglasAgrupadas/applyLockRule), pero solo la
// consultaba la importación de CSV de cartola (importCartolaRows) -- la importación
// automática por correo (absorbImportedRows/txDesdeImportEmail) SIEMPRE dejaba pendiente
// cualquier gasto/ingreso, sin importar que ya existiera una regla para ese comercio. Este
// test primero confirma el bug tal cual estaba (documentado abajo, ya no reproducible tras el
// fix) y después fija el comportamiento correcto: ambas importaciones deben tratar igual una
// regla ya creada.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    // t2, t4, t14 (Copec Providencia) ya vienen con reglaAuto:true + categoria transporte en
    // los datos de ejemplo -- reglasAgrupadas() debería devolver esa regla.
    const reglas = D.reglasAgrupadas();
    const reglaCopec = reglas.find(r => r.comercio === 'Copec Providencia');

    // Simula una fila tal cual la entrega transacciones_importadas para un gasto en el MISMO
    // comercio que ya tiene regla, pero SIN categoría propia (así llegan hoy los gastos/ingresos
    // desde el correo -- ver guessCatIdFromImportRow, que solo resuelve inversión).
    const filaConRegla = {
      fecha: '2026-09-01', hora: '10:00', comercio: 'Copec Providencia',
      monto: 21000, tipo: 'gasto', medio_sugerido: null, fuente: 'gmail:banco_edwards_compra'
    };
    const txConRegla = D.txDesdeImportEmail(filaConRegla);

    // Comercio SIN ninguna regla creada -- debe seguir quedando pendiente, como siempre.
    const filaSinRegla = {
      fecha: '2026-09-01', hora: '11:00', comercio: 'Almacén Don Pepe',
      monto: 5000, tipo: 'gasto', medio_sugerido: null, fuente: 'gmail:banco_edwards_compra'
    };
    const txSinRegla = D.txDesdeImportEmail(filaSinRegla);

    return { reglaCopec, txConRegla, txSinRegla };
  });

  check('reglasAgrupadas() ya trae una regla para "Copec Providencia" (transporte)', !!resultado.reglaCopec && resultado.reglaCopec.cat === 'transporte', resultado.reglaCopec);

  check('Una transacción importada por correo de un comercio CON regla se auto-clasifica (ya no queda pendiente)', resultado.txConRegla.estado === 'confirmado' && resultado.txConRegla.categorias.length === 1 && resultado.txConRegla.categorias[0].cat === 'transporte', resultado.txConRegla);
  check('...y queda marcada como reglaAuto (se ve el candadito, igual que si la hubiera clasificado a mano)', resultado.txConRegla.reglaAuto === true, resultado.txConRegla);
  check('El tipo (gasto/ingreso/inversión) que ya traía el correo del banco NO se pisa con el de la regla', resultado.txConRegla.tipo === 'gasto', resultado.txConRegla);

  check('Un comercio SIN ninguna regla creada sigue llegando pendiente, sin categoría (comportamiento de siempre)', resultado.txSinRegla.estado === 'pendiente' && resultado.txSinRegla.categorias.length === 0 && resultado.txSinRegla.reglaAuto === false, resultado.txSinRegla);

  await finish({ context, browser, errors });
})();
