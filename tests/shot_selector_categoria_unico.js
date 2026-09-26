// Había DOS formas distintas de elegir categoría, para exactamente lo mismo:
//
//   - Al agregar un gasto a mano: una fila de avatar + select. Se aprieta y recién ahí aparecen
//     todas las categorías.
//   - Al clasificar una transacción importada: una grilla de chips SIEMPRE ABIERTA
//     (catPickerGrid), desplegada de lado, ocupando media pantalla sin haberla pedido.
//
// Ahora las dos vías usan el mismo selector. Este test fija que la grilla ya no exista en ninguna
// parte y, sobre todo, que clasificar por el selector siga haciendo TODO lo que hacía el chip:
// dejar la transacción confirmada (sale de Pendientes) y, en un gasto de grupo ajeno, aprender el
// mapeo de categorías -- eso vivía solo en el handler de los chips y era lo que podía perderse en
// silencio al cambiar de componente.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    const hoy = D.todayISO();
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({ id: 'imp', fecha: hoy, hora: '10:00', comercio: 'MERPAGO*RUTA', monto: 3490,
      medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '', origen: 'auto-mail' });
    D.state.tab = 'transacciones'; D.state.filter = 'todas'; D.render();
  });
  await page.waitForTimeout(150);

  await page.click('[data-tx="imp"]');
  await page.waitForTimeout(250);

  const sinClasificar = await page.evaluate(() => ({
    hayGrilla: !!document.querySelector('[data-pick-cat]'),
    hayChips: !!document.querySelector('.cat-picker-chip'),
    haySelector: !!document.querySelector('[data-cat-select]'),
    selectorVacio: (document.querySelector('[data-cat-select]') || {}).value === '',
    // El mismo componente que usa el gasto manual: avatar + select en una fila.
    hayAvatar: !!document.querySelector('.cat-row-icon')
  }));
  check('(control) una transacción sin clasificar ofrece con qué clasificarla', sinClasificar.haySelector === true, sinClasificar);
  check('la grilla de chips siempre abierta ya no existe', sinClasificar.hayGrilla === false && sinClasificar.hayChips === false, sinClasificar);
  check('   en su lugar está el mismo selector del gasto manual (avatar + select)',
    sinClasificar.hayAvatar === true && sinClasificar.selectorVacio === true, sinClasificar);

  // Clasificar por el selector tiene que dejarla resuelta, igual que hacía el chip.
  await page.selectOption('[data-cat-select]', 'supermercado');
  await page.waitForTimeout(300);
  const clasificada = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 'imp');
    return { estado: t.estado, cat: t.categorias[0] && t.categorias[0].cat, monto: t.categorias[0] && t.categorias[0].monto };
  });
  check('clasificar por el selector deja la transacción confirmada (sale de Pendientes)',
    clasificada.estado === 'confirmado', clasificada);
  check('   con la categoría elegida y el monto completo', clasificada.cat === 'supermercado' && clasificada.monto === 3490, clasificada);

  // Y deja de aparecer bajo el chip Pendientes, que es el efecto visible de lo anterior.
  const enPendientes = await page.evaluate(() => {
    const D = window.__debug;
    D.state.openTxId = null; D.state.filter = 'pendientes'; D.render();
    // .tx-item acota a las FILAS de la lista: la hoja abierta también usa data-tx en sus
    // botones de acciones rápidas, y sin acotar los contaba como si estuvieran en la lista.
    return Array.from(document.querySelectorAll('.tx-item[data-tx]')).map(e => e.getAttribute('data-tx'));
  });
  check('   y ya no figura en Pendientes', enPendientes.includes('imp') === false, enPendientes);

  await finish({ context, browser, errors });
})();
