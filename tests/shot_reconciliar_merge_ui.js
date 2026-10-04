// La pantalla para emparejar una línea de la cartola con una transacción que ya existe.
//
// Antes, un calce único desaparecía del diff en silencio: servía para no duplicar, pero no había
// nada que mirar ni que confirmar. Y el caso que motivó todo esto --un gasto subido a mano con
// monto aproximado-- ni siquiera llegaba a calzar, así que la línea se proponía como transacción
// nueva y terminabas con el gasto duplicado.
//
// Lo que esta pantalla tiene que dejar claro, y lo que el test vigila: que emparejar NO toca
// nada de lo que la usuaria escribió, que el monto de ella se mantiene salvo que pida lo
// contrario, y que si tenía cobros a personas se le diga que esas deudas no se recalcularon.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const setup = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    const f = d => mes + '-' + String(d).padStart(2, '0');
    D.TRANSACTIONS.length = 0;

    // Gasto manual con monto aproximado y un cobro a una persona.
    D.TRANSACTIONS.push({ id: 'manual-jumbo', fecha: f(5), hora: '21:00', comercio: 'JUMBO COSTANERA',
      monto: 46000, medio: 'visa', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'supermercado', monto: 46000 }],
      porCobrar: [{ persona: 'Fran', monto: 23000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }],
      reglaAuto: false, nota: 'la compra grande', origen: 'manual' });
    // Automática que calza exacto.
    D.TRANSACTIONS.push({ id: 'auto-uber', fecha: f(7), hora: '10:00', comercio: 'UBER',
      monto: 3500, medio: 'visa', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'transporte', monto: 3500 }], porCobrar: [], reglaAuto: false, nota: '',
      origen: 'auto-mail' });

    const movs = [
      { fecha: f(5), detalle: 'JUMBO COSTANERA', comercioSugerido: 'JUMBO COSTANERA', monto: 45990, tipoMov: 'gasto' },
      { fecha: f(7), detalle: 'UBER', comercioSugerido: 'UBER', monto: 3500, tipoMov: 'gasto' },
      // Línea que no corresponde a NADA en la app: es el control negativo del refresco de
      // matches. UBER no sirve para eso -- calza exacto, así que findSimilarTx lo encuentra
      // siempre, con merge o sin merge.
      { fecha: f(11), detalle: 'TIENDA DESCONOCIDA', comercioSugerido: 'TIENDA DESCONOCIDA', monto: 9900, tipoMov: 'gasto' },
    ];
    movs.forEach((m, i) => { m.fuenteLineaId = D.movementLineId(m, i); });

    const R = D.state.reconciliar;
    R.archivo = 'cartola.pdf'; R.tipo = 'tarjeta_nacional'; R.movimientos = movs;
    R.eliminarSeleccionados = [];
    D.state.tab = 'menu'; D.state.menuSection = 'reconciliar';
    D.renderMenuView();
    return { lineaJumbo: movs[0].fuenteLineaId, lineaUber: movs[1].fuenteLineaId };
  });
  await page.waitForTimeout(250);

  let txt = await page.textContent('#view-root');
  check('(control) la sección de emparejar aparece', /Ya están en la app \(2\)/.test(txt), txt.slice(0, 500));
  check('(control) la línea que no corresponde a nada se propone agregar',
    /Faltan en la app \(1\)/.test(txt), txt.slice(0, 700));
  check('dice que no se cambia lo ya escrito', /no se borra ni se cambia nada de lo que ya escribiste/.test(txt), txt.slice(0, 600));
  check('muestra la diferencia de monto en términos de la decisión',
    /Tu monto: \$46\.000/.test(txt) && /la cartola dice \$45\.990/.test(txt) && /Se mantiene el tuyo/.test(txt), txt.slice(0, 900));
  check('avisa que el gasto tiene cobros a personas que no se tocan', /no se tocan/.test(txt), txt.slice(0, 900));
  check('marca el que la usuaria subió a mano', /la subiste a mano/.test(txt), txt.slice(0, 900));
  check('ofrece emparejar en bloque solo las que calzan exacto', /Emparejar la 1 que calza exacto|Emparejar las 1 que calzan exacto/.test(txt), txt.slice(0, 600));

  // ---------- emparejar conservando el monto ----------
  await page.click('[data-reconcile-merge="' + setup.lineaJumbo + '"]:not([data-merge-monto])');
  await page.waitForTimeout(250);

  const trasMerge = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 'manual-jumbo');
    return { monto: t.monto, conciliada: t.conciliada, fuenteLineaId: t.fuenteLineaId,
      nota: t.nota, origen: t.origen, cat: t.categorias[0].cat,
      porCobrar: t.porCobrar.map(p => ({ persona: p.persona, monto: p.monto })) };
  });
  check('emparejar marca la transacción como conciliada', trasMerge.conciliada === true, trasMerge);
  check('NO cambió el monto', trasMerge.monto === 46000, trasMerge);
  check('conservó la nota, el origen y la categoría',
    trasMerge.nota === 'la compra grande' && trasMerge.origen === 'manual' && trasMerge.cat === 'supermercado', trasMerge);
  check('conservó el cobro a Fran intacto',
    trasMerge.porCobrar.length === 1 && trasMerge.porCobrar[0].monto === 23000, trasMerge.porCobrar);

  txt = await page.textContent('#view-root');
  check('la emparejada desaparece de la lista de pendientes por emparejar',
    /Ya están en la app \(1\)/.test(txt), txt.slice(0, 400));
  // El hueco que esto cierra: la lista de movimientos de arriba seguía ofreciendo "+ Agregar"
  // para la línea recién emparejada, porque findSimilarTx exige el monto con $1 de tolerancia y
  // no veía el calce aproximado. Un toque ahí creaba el duplicado que el merge acababa de evitar.
  const yaRegistradas = await page.evaluate(() => {
    const movs = window.__debug.state.reconciliar.movimientos;
    return movs.map(m => ({ detalle: m.detalle, tieneMatch: !!m.__match }));
  });
  check('la línea emparejada queda marcada como ya registrada',
    yaRegistradas.find(m => m.detalle === 'JUMBO COSTANERA').tieneMatch === true, yaRegistradas);
  check('(control) una línea que no corresponde a nada sigue sin match',
    yaRegistradas.find(m => m.detalle === 'TIENDA DESCONOCIDA').tieneMatch === false, yaRegistradas);

  // ---------- emparejar actualizando el monto ----------
  const conMonto = await page.evaluate(async (lineaUber) => {
    const D = window.__debug;
    // Se reusa el gasto manual: se desmarca y se le pide el monto de la cartola.
    const t = D.TRANSACTIONS.find(x => x.id === 'manual-jumbo');
    // Hay que limpiar las DOS marcas: buildReconcileDiff saltea toda línea cuyo fuenteLineaId ya
    // esté en alguna transacción, antes incluso de mirar el matching -- es la garantía dura de
    // idempotencia, así que con solo apagar `conciliada` la línea seguía sin proponerse.
    t.conciliada = false;
    delete t.fuenteLineaId;
    D.renderMenuView();
    return true;
  }, setup.lineaUber);
  await page.waitForTimeout(200);
  await page.click('[data-reconcile-merge="' + setup.lineaJumbo + '"][data-merge-monto]');
  await page.waitForTimeout(250);

  const trasMonto = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 'manual-jumbo');
    return { monto: t.monto, montoCat: t.categorias[0].monto, porCobrar: t.porCobrar.map(p => p.monto) };
  });
  check('si se pide, el monto pasa al de la cartola', trasMonto.monto === 45990, trasMonto);
  check('la categoría única sigue el monto', trasMonto.montoCat === 45990, trasMonto);
  // Lo que alguien te debe es un acuerdo con esa persona, no algo que mueva el banco.
  check('lo que debe Fran sigue igual', trasMonto.porCobrar[0] === 23000, trasMonto);

  await browser.close();
  finish(errors);
})();
