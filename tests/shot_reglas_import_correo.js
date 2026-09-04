// jesu asked: "could point 4 [budget crossed without having the app open] happen
// because we have that thing about classifying certain transactions as always the same category
// -- does this work correctly? I haven't tested it". Investigating: an automatic
// classification-by-merchant rule (groupedRules/applyLockRule) DID exist, but it was only
// consulted by the statement CSV import (importStatementRows) -- automatic
// email import (absorbImportedRows/txFromEmailImport) ALWAYS left any expense/income
// pending, regardless of whether a rule already existed for that merchant. This
// test first confirms the bug as it was (documented below, no longer reproducible after the
// fix) and then locks in the correct behavior: both imports must treat an
// already-created rule the same way.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    // t2, t4, t14 (Copec Providencia) already come with reglaAuto:true + categoria transporte in
    // the sample data -- groupedRules() should return that rule.
    const reglas = D.groupedRules();
    const reglaCopec = reglas.find(r => r.comercio === 'Copec Providencia');

    // Simulate a row exactly as transacciones_importadas delivers it for an expense in the SAME
    // merchant that already has a rule, but WITHOUT its own category (that's how expenses/income arrive today
    // from email -- see guessCatIdFromImportRow, which only resolves investment platforms).
    const filaConRegla = {
      fecha: '2026-09-01', hora: '10:00', comercio: 'Copec Providencia',
      monto: 21000, tipo: 'gasto', medio_sugerido: null, fuente: 'gmail:banco_edwards_compra'
    };
    const txConRegla = D.txFromEmailImport(filaConRegla);

    // Merchant WITHOUT any rule created -- it should still stay pending, as always.
    const filaSinRegla = {
      fecha: '2026-09-01', hora: '11:00', comercio: 'Almacén Don Pepe',
      monto: 5000, tipo: 'gasto', medio_sugerido: null, fuente: 'gmail:banco_edwards_compra'
    };
    const txSinRegla = D.txFromEmailImport(filaSinRegla);

    return { reglaCopec, txConRegla, txSinRegla };
  });

  check('groupedRules() ya trae una regla para "Copec Providencia" (transporte)', !!resultado.reglaCopec && resultado.reglaCopec.cat === 'transporte', resultado.reglaCopec);

  check('Una transacción importada por correo de un comercio CON regla se auto-clasifica (ya no queda pendiente)', resultado.txConRegla.estado === 'confirmado' && resultado.txConRegla.categorias.length === 1 && resultado.txConRegla.categorias[0].cat === 'transporte', resultado.txConRegla);
  check('...y queda marcada como reglaAuto (se ve el candadito, igual que si la hubiera clasificado a mano)', resultado.txConRegla.reglaAuto === true, resultado.txConRegla);
  check('El tipo (gasto/ingreso/inversión) que ya traía el correo del banco NO se pisa con el de la regla', resultado.txConRegla.tipo === 'gasto', resultado.txConRegla);

  check('Un comercio SIN ninguna regla creada sigue llegando pendiente, sin categoría (comportamiento de siempre)', resultado.txSinRegla.estado === 'pendiente' && resultado.txSinRegla.categorias.length === 0 && resultado.txSinRegla.reglaAuto === false, resultado.txSinRegla);

  await finish({ context, browser, errors });
})();
