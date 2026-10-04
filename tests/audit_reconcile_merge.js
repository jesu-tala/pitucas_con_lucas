// El merge de una línea de cartola con una transacción que ya existe.
//
// Antes esto no era un grupo del diff: cuando el matching encontraba un único calce claro, el
// código hacía `return` y la línea desaparecía sin dejar rastro. Servía para no duplicar, pero
// perdía todo lo demás -- y en particular el caso que motivó la función: un gasto subido a mano
// con un monto aproximado nunca podía quedar emparejado con su línea real de la cartola.
//
// Las dos garantías que este archivo existe para proteger, las dos pedidas explícitamente:
//
//  1. Las transacciones MANUALES nunca se tocan sin confirmación, aunque el calce sea perfecto.
//     Y aun confirmando, el merge no puede pisar lo que la usuaria armó a mano: su categoría,
//     su nota, su origen, y sobre todo sus filas de porCobrar (muchas veces el gasto se sube a
//     mano justamente para poder cobrarle a alguien).
//  2. IDEMPOTENCIA: correr la misma cartola dos veces no vuelve a proponer ni a duplicar nada.
const fs = require('fs');
const path = require('path');
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    const f = d => mes + '-' + String(d).padStart(2, '0');

    D.TRANSACTIONS.length = 0;

    // (a) Gasto MANUAL con monto aproximado y con un cobro pendiente a una persona. Es el caso
    //     delicado: la cartola dice $45.990 y acá se subió $46.000 "más o menos".
    D.TRANSACTIONS.push({ id: 'manual-cena', fecha: f(5), hora: '21:00', comercio: 'JUMBO COSTANERA',
      monto: 46000, medio: 'visa', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'supermercado', monto: 46000 }],
      porCobrar: [{ persona: 'Fran', monto: 23000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }],
      reglaAuto: false, nota: 'la compra grande del mes', origen: 'manual' });

    // (b) Gasto AUTOMÁTICO que calza exacto: no debería necesitar confirmación.
    D.TRANSACTIONS.push({ id: 'auto-farmacia', fecha: f(7), hora: '10:00', comercio: 'FARMACIA AHUMADA',
      monto: 12500, medio: 'visa', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'salud', monto: 12500 }], porCobrar: [], reglaAuto: false, nota: '',
      origen: 'auto-mail' });

    // (c) Gasto MANUAL que calza EXACTO. Es el control que importa para la regla: lo manual se
    //     confirma siempre, no solo cuando el calce es dudoso.
    D.TRANSACTIONS.push({ id: 'manual-exacto', fecha: f(9), hora: '13:00', comercio: 'UBER',
      monto: 3500, medio: 'visa', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'transporte', monto: 3500 }], porCobrar: [], reglaAuto: false, nota: '',
      origen: 'manual' });

    const movs = [
      { fecha: f(5), detalle: 'JUMBO COSTANERA', comercioSugerido: 'JUMBO COSTANERA', monto: 45990, tipoMov: 'gasto' },
      { fecha: f(7), detalle: 'FARMACIA AHUMADA', comercioSugerido: 'FARMACIA AHUMADA', monto: 12500, tipoMov: 'gasto' },
      { fecha: f(9), detalle: 'UBER', comercioSugerido: 'UBER', monto: 3500, tipoMov: 'gasto' },
    ];
    movs.forEach((m, i) => { m.fuenteLineaId = D.movementLineId(m, i); });

    const diff = D.buildReconcileDiff(movs, 'tarjeta_nacional');
    const porId = id => diff.mergear.find(x => x.tx.id === id);

    return {
      movs,
      cuantosMerge: diff.mergear.length,
      cuantosAgregar: diff.agregar.length,
      manual: porId('manual-cena') ? {
        requiereConfirmacion: porId('manual-cena').requiereConfirmacion,
        diferenciaMonto: porId('manual-cena').diferenciaMonto,
        confianza: porId('manual-cena').confianza,
      } : null,
      auto: porId('auto-farmacia') ? {
        requiereConfirmacion: porId('auto-farmacia').requiereConfirmacion,
        diferenciaMonto: porId('auto-farmacia').diferenciaMonto,
        confianza: porId('auto-farmacia').confianza,
      } : null,
      manualExacto: porId('manual-exacto') ? {
        requiereConfirmacion: porId('manual-exacto').requiereConfirmacion,
        confianza: porId('manual-exacto').confianza,
        diferenciaMonto: porId('manual-exacto').diferenciaMonto,
      } : null,
    };
  });

  // ---------- el grupo existe y propone, en vez de saltear en silencio ----------
  check('(control) ninguna línea se propone como "agregar" (las dos ya existen)', r.cuantosAgregar === 0, r);
  check('las tres líneas que ya existen se proponen para mergear', r.cuantosMerge === 3, r);

  // ---------- garantía 1: lo manual siempre se confirma ----------
  check('el gasto manual con monto aproximado exige confirmación',
    r.manual && r.manual.requiereConfirmacion === true, r.manual);
  // El control que importa: lo manual se confirma SIEMPRE, no solo cuando el calce es dudoso.
  // Si esto fallara, la regla sería "se confirma lo incierto", que no es lo pedido.
  check('(control) un gasto manual con calce PERFECTO también exige confirmación',
    r.manualExacto && r.manualExacto.confianza === 'alta' && r.manualExacto.requiereConfirmacion === true,
    r.manualExacto);
  // Y al revés, para que "exige confirmación" no sea simplemente siempre true.
  check('(control) el gasto automático con calce exacto NO exige confirmación',
    r.auto && r.auto.confianza === 'alta' && r.auto.requiereConfirmacion === false, r.auto);
  // Un monto aproximado nunca llega a 'alta': es lo que impide que algo pase sin confirmar.
  check('un monto aproximado se queda en confianza media, nunca alta',
    r.manual && r.manual.confianza === 'media', r.manual);
  check('la diferencia de monto se informa en el manual ($46.000 vs $45.990)',
    r.manual && r.manual.diferenciaMonto === -10, r.manual);
  check('(control) cuando el monto calza exacto, no se informa diferencia',
    r.auto && r.auto.diferenciaMonto === null, r.auto);

  // ---------- garantía 1b: el merge conservador no pisa nada ----------
  const conservador = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TRANSACTIONS.find(t => t.id === 'manual-cena');
    const mov = { fecha: tx.fecha, detalle: 'JUMBO COSTANERA', comercioSugerido: 'JUMBO COSTANERA',
      monto: 45990, tipoMov: 'gasto', fuenteLineaId: 'linea-jumbo' };
    const res = D.aplicarMerge(tx, mov, false);   // sin actualizar el monto
    return { res,
      monto: tx.monto, categoria: tx.categorias[0] && tx.categorias[0].cat, montoCat: tx.categorias[0] && tx.categorias[0].monto,
      nota: tx.nota, origen: tx.origen, conciliada: tx.conciliada, fuenteLineaId: tx.fuenteLineaId,
      porCobrar: (tx.porCobrar || []).map(p => ({ persona: p.persona, monto: p.monto, tipo: p.tipo })) };
  });
  check('el merge marca la transacción como conciliada', conservador.conciliada === true, conservador);
  check('el merge guarda la línea de origen (para la idempotencia)', conservador.fuenteLineaId === 'linea-jumbo', conservador);
  check('por defecto NO sobrescribe el monto', conservador.monto === 46000, conservador);
  check('conserva la categoría que la usuaria eligió', conservador.categoria === 'supermercado', conservador);
  check('conserva su nota', conservador.nota === 'la compra grande del mes', conservador);
  check('conserva el origen manual (no lo convierte en automática)', conservador.origen === 'manual', conservador);
  // La garantía que más importa: perder esto sería caótico.
  check('conserva intactas sus filas de porCobrar',
    conservador.porCobrar.length === 1 && conservador.porCobrar[0].persona === 'Fran' && conservador.porCobrar[0].monto === 23000,
    conservador.porCobrar);

  // ---------- actualizar el monto es opcional, y no descuadra las deudas ----------
  const conMonto = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TRANSACTIONS.find(t => t.id === 'manual-cena');
    tx.conciliada = false;   // para poder volver a aplicarlo en el test
    const mov = { fecha: tx.fecha, detalle: 'JUMBO COSTANERA', monto: 45990, tipoMov: 'gasto', fuenteLineaId: 'linea-jumbo' };
    const res = D.aplicarMerge(tx, mov, true);   // actualizando el monto
    return { res, monto: tx.monto, montoCat: tx.categorias[0].monto,
      porCobrar: tx.porCobrar.map(p => p.monto) };
  });
  check('si se pide, el monto se actualiza al de la cartola', conMonto.monto === 45990, conMonto);
  check('la categoría única sigue el monto del gasto', conMonto.montoCat === 45990, conMonto);
  // Lo que alguien te debe es un acuerdo con esa persona, no algo que deba moverse porque el
  // banco redondeó distinto. Se informa, no se reescala a ciegas.
  check('lo que debe Fran NO se reescala solo', conMonto.porCobrar[0] === 23000, conMonto);
  check('el resultado informa el monto antes y después, para poder mostrarlo',
    conMonto.res.montoAntes === 46000 && conMonto.res.montoDespues === 45990, conMonto.res);
  check('el resultado dice explícitamente que los porCobrar no se recalcularon',
    conMonto.res.porCobrarRecalculado === false, conMonto.res);

  // ---------- garantía 2: idempotencia ----------
  const rerun = await page.evaluate((movs) => {
    const D = window.__debug;
    // Correr la MISMA cartola de nuevo, ya con las dos conciliadas.
    D.TRANSACTIONS.forEach(t => { t.conciliada = true; });
    D.TRANSACTIONS.find(t => t.id === 'manual-cena').fuenteLineaId = movs[0].fuenteLineaId;
    D.TRANSACTIONS.find(t => t.id === 'auto-farmacia').fuenteLineaId = movs[1].fuenteLineaId;
    D.TRANSACTIONS.find(t => t.id === 'manual-exacto').fuenteLineaId = movs[2].fuenteLineaId;
    const diff = D.buildReconcileDiff(movs, 'tarjeta_nacional');
    return { agregar: diff.agregar.length, mergear: diff.mergear.length,
      revisar: diff.revisar.length, eliminar: diff.eliminarPropuesto.length,
      nTx: D.TRANSACTIONS.length };
  }, r.movs);
  check('re-correr la misma cartola no propone agregar nada', rerun.agregar === 0, rerun);
  check('re-correr la misma cartola no vuelve a proponer el merge', rerun.mergear === 0, rerun);
  check('re-correr no manda nada a revisar', rerun.revisar === 0, rerun);
  check('re-correr no propone eliminar nada', rerun.eliminar === 0, rerun);
  check('re-correr no duplicó transacciones', rerun.nTx === 3, rerun);

  // ---------- el archivo sigue sin mutar al construir el diff ----------
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'reconcile.ts'), 'utf-8');
  const fn = SRC.slice(SRC.indexOf('export function buildReconcileDiff'));
  const cuerpo = fn.slice(0, fn.indexOf('\n}\n'));
  check('(control) se encontró el cuerpo de buildReconcileDiff', cuerpo.length > 500);
  // La regla del archivo: el diff propone, no aplica. Si alguien escribe conciliada ahí dentro,
  // el diff pasa a mutar y deja de ser una propuesta revisable.
  check('buildReconcileDiff no escribe conciliada en ninguna transacción',
    !/\.conciliada\s*=/.test(cuerpo), cuerpo.slice(0, 300));

  await browser.close();
  finish(errors);
})();
