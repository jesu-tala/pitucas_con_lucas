// Deslizar una fila de Transacciones hacia la izquierda para eliminarla.
//
// El gesto NO borra: abre la MISMA confirmación que el botón de borrar del detalle (el mismo
// state.confirmDeleteTxId, el mismo texto, los mismos dos botones), y recién el "Sí, eliminar"
// borra. Un gesto que borra solo sería demasiado fácil de disparar sin querer justo en la
// pantalla donde se hace scroll todo el tiempo.
//
// Lo que este test cuida, además de que el gesto funcione: que un scroll vertical normal NO lo
// dispare, y que deslizar hacia el otro lado tampoco -- ese sentido es el del gesto de "volver
// atrás", que ya existía.
const { openApp, check, finish } = require('./lib/test_kit');

// Playwright convierte un arrastre en un mousedown + mouseup sobre la fila, y el navegador
// dispara un click igual -- así que un arrastre que NO arma el gesto termina abriendo el detalle
// (en el teléfono no pasa: el scroll cancela el click). Se cierra entre gestos, porque con una
// hoja abierta el gesto no arranca a propósito.
async function cerrarHojaSiQuedoAbierta(page) {
  const abierta = await page.evaluate(() => !!window.__debug.state.openTxId);
  if (!abierta) return;
  // Se cierra por el camino real (el botón "Listo"), no tocando el estado a mano: la hoja tiene
  // su propia capa encima de todo, y apagar solo state.openTxId la dejaba interceptando los
  // gestos siguientes.
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(250);
}

// Un arrastre con pasos intermedios: un solo pointermove no se parece a un dedo de verdad, y el
// detector mira el movimiento acumulado.
async function arrastrar(page, selector, dx, dy) {
  const caja = await page.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(caja.x, caja.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(caja.x + (dx * i) / 6, caja.y + (dy * i) / 6);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
}

(async () => {
  const { context, browser, page, errors } = await openApp();

  const ids = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    D.TRANSACTIONS.length = 0;
    ['uno', 'dos'].forEach((id, i) => {
      D.TRANSACTIONS.push({ id, fecha: mes + '-0' + (i + 3), hora: '10:00', comercio: 'Compra ' + id,
        monto: 10000 * (i + 1), medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable',
        estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 10000 * (i + 1) }],
        porCobrar: [], reglaAuto: false, nota: '' });
    });
    D.state.tab = 'transacciones';
    D.render();
    return D.TRANSACTIONS.map(t => t.id);
  });
  check('(control) la lista arranca con las dos filas', ids.length === 2, ids);
  await page.waitForTimeout(150);

  // ---------- un scroll vertical no debe disparar nada ----------
  await arrastrar(page, '.tx-item[data-tx="uno"]', 0, -120);
  let confirmando = await page.evaluate(() => window.__debug.state.confirmDeleteTxId);
  check('un scroll vertical NO abre la confirmación', confirmando === null, { confirmando });
  await cerrarHojaSiQuedoAbierta(page);

  // ---------- deslizar hacia la derecha tampoco ----------
  // Ese sentido es el del gesto de volver atrás, que ya existía.
  await arrastrar(page, '.tx-item[data-tx="uno"]', 120, 0);
  confirmando = await page.evaluate(() => window.__debug.state.confirmDeleteTxId);
  check('deslizar hacia la derecha NO abre la confirmación', confirmando === null, { confirmando });
  await cerrarHojaSiQuedoAbierta(page);

  // ---------- deslizar hacia la izquierda sí ----------
  await arrastrar(page, '.tx-item[data-tx="uno"]', -120, 0);
  confirmando = await page.evaluate(() => window.__debug.state.confirmDeleteTxId);
  check('deslizar hacia la izquierda abre la confirmación', confirmando === 'uno', { confirmando });
  // Lo que garantiza suppressRowSwipeClick: el click que el navegador dispara al terminar el
  // arrastre no debe abrir el detalle encima de la confirmación recién abierta.
  check('el gesto no abre el detalle encima', await page.evaluate(() => window.__debug.state.openTxId) === null);

  let txt = await page.textContent('#tx-results');
  // Acotado al bloque de la confirmación: "Compra uno" sale igual en la fila normal, así que
  // buscarlo en toda la lista pasaba aunque la confirmación no existiera.
  const bloque = await page.evaluate(() => {
    const el = document.querySelector('.tx-swipe-confirm');
    return el ? el.textContent : null;
  });
  check('(control) la confirmación existe como su propio bloque', !!bloque, bloque);
  check('la confirmación dice qué transacción es', !!bloque && /Compra uno/.test(bloque), bloque);
  check('la confirmación avisa que no se puede deshacer', !!bloque && /No se puede deshacer/.test(bloque), bloque);
  check('la confirmación ofrece cancelar y confirmar',
    !!(await page.$('[data-cancel-delete-tx="uno"]')) && !!(await page.$('[data-confirm-delete-tx="uno"]')));
  // Lo más importante del gesto: hasta acá no se borró nada.
  const sigueAhi = await page.evaluate(() => window.__debug.TRANSACTIONS.some(t => t.id === 'uno'));
  check('el gesto por sí solo NO borra', sigueAhi === true);
  check('la otra fila sigue intacta', !!(await page.$('.tx-item[data-tx="dos"]')));

  // ---------- cancelar ----------
  await page.click('[data-cancel-delete-tx="uno"]');
  await page.waitForTimeout(200);
  confirmando = await page.evaluate(() => window.__debug.state.confirmDeleteTxId);
  check('cancelar cierra la confirmación', confirmando === null, { confirmando });
  // Sin repintar la lista al cancelar, la fila quedaba en modo confirmación para siempre.
  check('cancelar devuelve la fila normal', !!(await page.$('.tx-item[data-tx="uno"]')));
  check('cancelar no borró nada',
    (await page.$$eval('.tx-item[data-tx]', els => els.length)) === 2);

  // ---------- confirmar sí borra ----------
  await arrastrar(page, '.tx-item[data-tx="uno"]', -120, 0);
  await page.click('[data-confirm-delete-tx="uno"]');
  await page.waitForTimeout(250);
  // Se lee del DOM, NO de window.__debug.TRANSACTIONS: eliminar pasa por setTransactions(), que
  // REASIGNA el binding del módulo, y el puente de depuración se queda con la referencia al
  // array viejo. Leer ahí mostraba las transacciones como si nada se hubiera borrado.
  const quedan = await page.$$eval('.tx-item[data-tx]', els => els.map(e => e.getAttribute('data-tx')));
  check('confirmar elimina la transacción', !quedan.includes('uno'), { quedan });
  check('confirmar no se lleva las demás', quedan.includes('dos'), { quedan });
  check('queda exactamente una fila', quedan.length === 1, { quedan });
  // Y que no haya quedado una confirmación colgada ocupando el lugar de la fila borrada.
  check('no queda ninguna confirmación abierta', !(await page.$('.tx-swipe-confirm')));

  await browser.close();
  finish(errors);
})();
