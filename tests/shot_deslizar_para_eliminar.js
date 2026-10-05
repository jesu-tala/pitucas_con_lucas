// Deslizar una fila de Transacciones hacia la izquierda para eliminarla.
//
// Son DOS pasos, a propósito: el gesto solo corre la fila y deja ver un basurero AL LADO, y
// recién tocar ese basurero abre un pop-up preguntando. Borrar no se deshace, y deslizar sin
// querer en una lista con scroll es fácil.
//
// La primera versión ponía la confirmación como un bloque DEBAJO de la fila, reemplazándola.
// Eso empujaba la lista y se leía como parte de la transacción en vez de como una pregunta que
// hay que contestar. Ahora la pregunta va en una hoja, el mismo patrón que la nota por categoría.
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
  let confirmando = await page.evaluate(() => window.__debug.state.swipedTxId);
  check('un scroll vertical NO corre la fila', confirmando === null, { confirmando });
  await cerrarHojaSiQuedoAbierta(page);

  // ---------- deslizar hacia la derecha tampoco ----------
  // Ese sentido es el del gesto de volver atrás, que ya existía.
  await arrastrar(page, '.tx-item[data-tx="uno"]', 120, 0);
  confirmando = await page.evaluate(() => window.__debug.state.swipedTxId);
  check('deslizar hacia la derecha NO corre la fila', confirmando === null, { confirmando });
  await cerrarHojaSiQuedoAbierta(page);

  // ---------- deslizar hacia la izquierda sí ----------
  await arrastrar(page, '.tx-item[data-tx="uno"]', -120, 0);
  confirmando = await page.evaluate(() => window.__debug.state.swipedTxId);
  check('deslizar hacia la izquierda corre la fila', confirmando === 'uno', { confirmando });
  // El gesto por sí solo NO pregunta nada todavía: solo revela la acción.
  check('deslizar NO abre todavía la confirmación',
    await page.evaluate(() => window.__debug.state.deleteSheet) === null);
  check('aparece el basurero al lado de la fila', !!(await page.$('[data-swipe-trash="uno"]')));
  check('la fila sigue ahí, no se reemplazó por nada', !!(await page.$('.tx-item[data-tx="uno"]')));
  // Lo que garantiza suppressRowSwipeClick: el click que el navegador dispara al terminar el
  // arrastre no debe abrir el detalle encima de la confirmación recién abierta.
  check('el gesto no abre el detalle encima', await page.evaluate(() => window.__debug.state.openTxId) === null);

  check('la otra fila sigue intacta', !!(await page.$('.tx-item[data-tx="dos"]')));

  // ---------- el basurero abre el pop-up ----------
  await page.click('[data-swipe-trash="uno"]');
  await page.waitForTimeout(250);
  const hoja = await page.evaluate(() => window.__debug.state.deleteSheet);
  check('tocar el basurero abre el pop-up', !!hoja && hoja.txId === 'uno', hoja);
  // La pregunta va en la hoja, NO debajo de la fila: la lista no se toca. Esto es exactamente
  // lo que se pidió cambiar de la primera versión.
  const dentroDeLaLista = await page.evaluate(() => {
    const el = document.getElementById('tx-results');
    return el ? /No se puede deshacer/.test(el.textContent) : null;
  });
  check('la pregunta NO aparece dentro de la lista', dentroDeLaLista === false, { dentroDeLaLista });

  const pop = await page.textContent('#sheet-content');
  check('el pop-up dice qué transacción es', /Compra uno/.test(pop), pop.slice(0, 300));
  // Se llega acá por un gesto, así que es fácil haberse equivocado de fila: el pop-up muestra
  // monto y fecha para poder verificarlo antes de borrar.
  check('el pop-up muestra el monto', /10\.000/.test(pop), pop.slice(0, 300));
  check('el pop-up avisa que no se puede deshacer', /No se puede deshacer/.test(pop), pop.slice(0, 300));
  check('el pop-up ofrece cancelar y confirmar',
    !!(await page.$('[data-cancel-delete-tx="uno"]')) && !!(await page.$('[data-confirm-delete-tx="uno"]')));
  // Lo más importante: hasta acá no se borró nada.
  const sigueAhi = await page.evaluate(() => window.__debug.TRANSACTIONS.some(t => t.id === 'uno'));
  check('ni el gesto ni abrir el pop-up borran', sigueAhi === true);

  // ---------- cancelar ----------
  await page.click('[data-cancel-delete-tx="uno"]');
  await page.waitForTimeout(250);
  const trasCancelar = await page.evaluate(() => ({
    hoja: window.__debug.state.deleteSheet, swiped: window.__debug.state.swipedTxId,
  }));
  check('cancelar cierra el pop-up', trasCancelar.hoja === null, trasCancelar);
  // Dejar la fila corrida después de cancelar la hacía parecer que la acción seguía pendiente.
  check('cancelar devuelve la fila a su lugar', trasCancelar.swiped === null, trasCancelar);
  check('ya no se ve el basurero', !(await page.$('[data-swipe-trash="uno"]')));
  check('la fila sigue ahí', !!(await page.$('.tx-item[data-tx="uno"]')));
  check('cancelar no borró nada',
    (await page.$$eval('.tx-item[data-tx]', els => els.length)) === 2);

  // ---------- confirmar sí borra ----------
  await arrastrar(page, '.tx-item[data-tx="uno"]', -120, 0);
  await page.click('[data-swipe-trash="uno"]');
  await page.waitForTimeout(200);
  await page.click('[data-confirm-delete-tx="uno"]');
  await page.waitForTimeout(250);
  // Se lee del DOM, NO de window.__debug.TRANSACTIONS: eliminar pasa por setTransactions(), que
  // REASIGNA el binding del módulo, y el puente de depuración se queda con la referencia al
  // array viejo. Leer ahí mostraba las transacciones como si nada se hubiera borrado.
  const quedan = await page.$$eval('.tx-item[data-tx]', els => els.map(e => e.getAttribute('data-tx')));
  check('confirmar elimina la transacción', !quedan.includes('uno'), { quedan });
  check('confirmar no se lleva las demás', quedan.includes('dos'), { quedan });
  check('queda exactamente una fila', quedan.length === 1, { quedan });
  // Y que no quede nada colgado: ni el pop-up ni una fila corrida.
  const limpio = await page.evaluate(() => ({
    hoja: window.__debug.state.deleteSheet, swiped: window.__debug.state.swipedTxId,
  }));
  check('no queda el pop-up abierto', limpio.hoja === null, limpio);
  check('no queda ninguna fila corrida', limpio.swiped === null, limpio);

  await browser.close();
  finish(errors);
})();
