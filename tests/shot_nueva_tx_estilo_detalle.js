// Regression: the "New transaction" sheet looked very different from the detail view of an
// already-created transaction -- a flat list of loose fields, with a large grid of chips (always
// open) to pick the category. The user asked for it to look more like the detail view: the
// same fields grouped into cards (.sheet-block.card), and the category with the same
// visual component as the detail view -- a round avatar with the category's icon/emoji next to
// a native <select> (tapping it expands the options), instead of the always-visible
// chip grid.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('#fab-add');
  await page.waitForTimeout(200);

  // 1) The sheet is organized into .sheet-block.card cards, just like the detail view.
  const cardCount = await page.evaluate(() => document.querySelectorAll('#sheet-content .sheet-block.card').length);
  check('La hoja de "Nueva transacción" agrupa sus campos en tarjetas .sheet-block.card (>=4)', cardCount >= 4, cardCount);

  // 2) The category looks like the detail view: avatar + <select> (not the large chip grid).
  const catUi = await page.evaluate(() => ({
    tieneFilaCompacta: !!document.querySelector('#sheet-content .cat-rows .split-row .cat-row-icon'),
    tieneSelect: !!document.querySelector('#sheet-content [data-draft-cat-select]'),
    tieneGrillaChips: !!document.querySelector('#sheet-content [data-draft-pick-cat]'),
  }));
  check('Categoría con avatar + select (mismo componente que el detalle)', catUi.tieneFilaCompacta && catUi.tieneSelect, catUi);
  check('Ya NO se muestra la grilla grande de chips siempre abierta', catUi.tieneGrillaChips === false, catUi);

  // "Sueldo" is an income-type category -- the draft starts on "gasto" (which doesn't
  // offer it), so the type must be changed first before it can be picked in the select.
  await page.click('[data-seg="draft-tipo"] [data-seg-val="ingreso"]');
  await page.waitForTimeout(120);

  // 3) Picking "Sueldo" in the select updates the draft and the avatar shows its emoji (💼).
  await page.selectOption('[data-draft-cat-select]', 'sueldo');
  await page.waitForTimeout(150);
  const trasElegir = await page.evaluate(() => ({
    categorias: window.__debug.state.draftTx.categorias,
    avatarTexto: document.querySelector('#sheet-content .cat-row-icon .emoji-icon')?.textContent || null,
  }));
  check('Elegir una categoría en el select actualiza el borrador', trasElegir.categorias.length===1 && trasElegir.categorias[0].cat==='sueldo', trasElegir);
  check('El avatar de la fila muestra el emoji de la categoría elegida (💼)', trasElegir.avatarTexto === '💼', trasElegir);

  // 4) Saving an income transaction with a category picked via this flow -- still
  //    saves correctly (same criteria as before: categorias[0] + estado confirmado).
  await page.fill('[data-draft-field="comercio"]', 'Bono trimestral');
  await page.fill('[data-draft-field="monto"]', '55000');
  await page.click('[data-save-draft="1"]');
  await page.waitForTimeout(200);
  const guardada = await page.evaluate(() => {
    const tx = window.__debug.TRANSACTIONS.find(t => t.comercio === 'Bono trimestral');
    return tx ? { tipo: tx.tipo, estado: tx.estado, categorias: tx.categorias } : null;
  });
  check('La transacción se guarda con tipo/categoría/estado correctos', !!guardada && guardada.tipo==='ingreso' && guardada.estado==='confirmado' && guardada.categorias[0].cat==='sueldo', guardada);

  await finish({ context, browser, errors });
})();
