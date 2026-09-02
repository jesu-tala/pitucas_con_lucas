// Regresión: la hoja de "Nueva transacción" se veía muy distinta al detalle de una transacción
// ya creada -- una lista plana de campos sueltos, con una grilla grande de chips (siempre
// abierta) para elegir la categoría. La usuaria pidió que se pareciera más al detalle: los
// mismos campos agrupados en tarjetas (.sheet-block.card), y la categoría con el mismo
// componente visual del detalle -- un avatar redondo con el ícono/emoji de la categoría al lado
// de un <select> nativo (tocarlo despliega las opciones), en vez de la grilla de chips siempre
// visible.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('#fab-add');
  await page.waitForTimeout(200);

  // 1) La hoja está organizada en tarjetas .sheet-block.card, igual que el detalle.
  const cardCount = await page.evaluate(() => document.querySelectorAll('#sheet-content .sheet-block.card').length);
  check('La hoja de "Nueva transacción" agrupa sus campos en tarjetas .sheet-block.card (>=4)', cardCount >= 4, cardCount);

  // 2) La categoría se ve como el detalle: avatar + <select> (no la grilla grande de chips).
  const catUi = await page.evaluate(() => ({
    tieneFilaCompacta: !!document.querySelector('#sheet-content .cat-rows .split-row .cat-row-icon'),
    tieneSelect: !!document.querySelector('#sheet-content [data-draft-cat-select]'),
    tieneGrillaChips: !!document.querySelector('#sheet-content [data-draft-pick-cat]'),
  }));
  check('Categoría con avatar + select (mismo componente que el detalle)', catUi.tieneFilaCompacta && catUi.tieneSelect, catUi);
  check('Ya NO se muestra la grilla grande de chips siempre abierta', catUi.tieneGrillaChips === false, catUi);

  // "Sueldo" es una categoría de tipo ingreso -- el borrador arranca en "gasto" (que no la
  // ofrece), así que primero hay que cambiar el tipo antes de poder elegirla en el select.
  await page.click('[data-seg="draft-tipo"] [data-seg-val="ingreso"]');
  await page.waitForTimeout(120);

  // 3) Elegir "Sueldo" en el select actualiza el draft y el avatar muestra su emoji (💼).
  await page.selectOption('[data-draft-cat-select]', 'sueldo');
  await page.waitForTimeout(150);
  const trasElegir = await page.evaluate(() => ({
    categorias: window.__debug.state.draftTx.categorias,
    avatarTexto: document.querySelector('#sheet-content .cat-row-icon .emoji-icon')?.textContent || null,
  }));
  check('Elegir una categoría en el select actualiza el borrador', trasElegir.categorias.length===1 && trasElegir.categorias[0].cat==='sueldo', trasElegir);
  check('El avatar de la fila muestra el emoji de la categoría elegida (💼)', trasElegir.avatarTexto === '💼', trasElegir);

  // 4) Guardar una transacción de ingreso con categoría elegida por este flujo -- sigue
  //    guardándose correctamente (mismo criterio de antes: categorias[0] + estado confirmado).
  await page.fill('[data-draft-field="comercio"]', 'Bono trimestral');
  await page.fill('[data-draft-field="monto"]', '55000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(200);
  const guardada = await page.evaluate(() => {
    const tx = window.__debug.TX.find(t => t.comercio === 'Bono trimestral');
    return tx ? { tipo: tx.tipo, estado: tx.estado, categorias: tx.categorias } : null;
  });
  check('La transacción se guarda con tipo/categoría/estado correctos', !!guardada && guardada.tipo==='ingreso' && guardada.estado==='confirmado' && guardada.categorias[0].cat==='sueldo', guardada);

  await finish({ context, browser, errors });
})();
