// La suma de presupuestos que muestra Presupuesto tiene que coincidir con las tarjetas que
// dibuja. Eran dos listas distintas:
//
//   · la vista filtraba por "la categoría existe Y es de tipo gasto"
//   · la suma recorría BUDGETS entero, sin filtrar nada
//
// Un presupuesto huérfano --porque a esa categoría le cambiaron el tipo de gasto a
// ingreso/inversión, o por datos viejos de una versión anterior-- seguía sumando aunque su
// tarjeta no se dibujara en ninguna parte. Reportado así: "la app dice 1.400.000 asignados pero
// cuando sumo mis categorías me da 1.350.000", con un huérfano de exactamente $50.000 invisible.
//
// Peor que el número en sí: ese huérfano disparaba el aviso de "$50.000 más que tu presupuesto
// total", mandando a buscar un descuadre que no existía.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    Object.keys(D.BUDGETS).forEach(k => delete D.BUDGETS[k]);

    // Tres categorías de gasto reales: 1.350.000.
    D.BUDGETS['supermercado'] = { meta: 600000, alertas: {} };
    D.BUDGETS['restoranes'] = { meta: 400000, alertas: {} };
    D.BUDGETS['transporte'] = { meta: 350000, alertas: {} };

    // Huérfano 1: la categoría no existe (datos viejos).
    D.BUDGETS['gym_que_ya_no_existe'] = { meta: 50000, alertas: {} };
    // Huérfano 2: la categoría existe pero ya no es de gasto, así que su tarjeta no se dibuja.
    const idNoGasto = Object.keys(D.CATEGORIES).find(k => D.CATEGORIES[k].tipo !== 'gasto');
    if (idNoGasto) D.BUDGETS[idNoGasto] = { meta: 70000, alertas: {} };

    D.setMonthlyBudgetTotal(1350000);
    D.state.tab = 'resumen';
    D.state.summarySub = 'presupuesto';
    D.render();

    const gastoCatIds = Object.keys(D.CATEGORIES).filter(k => D.CATEGORIES[k].tipo === 'gasto');
    const visibles = gastoCatIds.filter(id => D.BUDGETS[id]);
    return {
      idNoGasto,
      entradasEnBudgets: Object.keys(D.BUDGETS).length,
      suma: D.sumaPresupuestosCategorias(),
      sumaDeLasVisibles: visibles.reduce((s, id) => s + D.BUDGETS[id].meta, 0),
      cuantasVisibles: visibles.length,
    };
  });
  await page.waitForTimeout(250);

  // ---------- controles positivos ----------
  // Sin huérfanos de verdad en BUDGETS, "la suma coincide" pasaría sin probar nada.
  check('(control) hay más entradas en BUDGETS que tarjetas visibles',
    r.entradasEnBudgets > r.cuantasVisibles, r);
  check('(control) se pudo armar el huérfano de tipo no-gasto', !!r.idNoGasto, r);
  check('(control) las tarjetas visibles suman 1.350.000', r.sumaDeLasVisibles === 1350000, r);

  // ---------- el bug ----------
  check('la suma coincide con las tarjetas que se muestran', r.suma === r.sumaDeLasVisibles, r);
  check('la suma NO cuenta los presupuestos huérfanos', r.suma === 1350000, r);

  // ---------- y en pantalla ----------
  const linea = await page.evaluate(() => {
    const el = document.querySelector('.budget-cats-calce');
    return el ? el.textContent.trim() : null;
  });
  check('(control) la línea de calce se muestra', !!linea, linea);
  check('la pantalla muestra la suma correcta', /1\.350\.000/.test(linea || ''), linea);
  // El falso positivo que mandaba a buscar un descuadre inexistente.
  check('no avisa de un descuadre que no existe', !/más que tu presupuesto total/.test(linea || ''), linea);
  check('dice que calzan, porque calzan', /calzan justo/.test(linea || ''), linea);

  // ---------- y las tarjetas dibujadas son las mismas que suma ----------
  const tarjetas = await page.$$eval('[data-budget-see-more]', els => els.length);
  check('(control) se dibujaron tarjetas de categoría', tarjetas > 0, { tarjetas });

  await browser.close();
  finish(errors);
})();
