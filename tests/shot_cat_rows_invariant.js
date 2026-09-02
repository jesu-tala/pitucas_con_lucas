// Locks in the core invariant of the always-editable category-rows split UI: no matter how
// you add/remove rows or flip between $/%, the sum of tx.categorias[].monto must always equal
// tx.monto. This is easy to silently break with future edits to the split logic.
const { openApp, check, finish } = require('./lib/test_kit');

async function sumaCategorias(page) {
  return page.evaluate(() => {
    const t = window.__debug.TX.find(t => t.id === 't3');
    return { sum: t.categorias.reduce((s,c)=>s+c.monto,0), monto: t.monto, categorias: t.categorias };
  });
}

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t3 = Uber, monto 6200, una sola categoría (transporte) -- caso simple y limpio para partir.
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);

  const inicial = await sumaCategorias(page);
  check('(setup) t3 arranca con una sola categoría cuya suma calza con el monto', inicial.sum === inicial.monto && inicial.categorias.length === 1, inicial);

  // (a) Agregar una segunda fila y repartir el monto entre las dos -- la suma debe seguir
  // calzando exactamente con el monto total.
  await page.click('[data-add-catrow="t3"]');
  await page.waitForTimeout(150);
  const trasAgregar = await sumaCategorias(page);
  check('Tras "Agregar categoría" aparece una segunda fila', trasAgregar.categorias.length === 2, trasAgregar.categorias.length);

  await page.fill('[data-cat-amount="0"]', '4000');
  await page.waitForTimeout(100);
  await page.fill('[data-cat-amount="1"]', '2200');
  await page.waitForTimeout(100);
  const trasRepartir = await sumaCategorias(page);
  check('(a) Con 2 filas repartidas (4000 + 2200), la suma sigue calzando con monto (6200)', trasRepartir.sum === trasRepartir.monto, trasRepartir);

  // (b) Alternar a modo % y volver a $ no debe alterar los montos guardados (el toggle solo
  // cambia cómo se MUESTRAN, nunca los valores reales) -- la suma debe seguir calzando.
  await page.click('[data-catunit="%"]');
  await page.waitForTimeout(150);
  const enModoPct = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('[data-cat-amount]'));
    return inputs.map(i => i.value);
  });
  console.log('Valores mostrados en modo %:', JSON.stringify(enModoPct));

  await page.click('[data-catunit="$"]');
  await page.waitForTimeout(150);
  const trasToggle = await sumaCategorias(page);
  check('(b) Tras alternar %  ->  $, la suma sigue calzando con monto (invariante preservado)', trasToggle.sum === trasToggle.monto && trasToggle.sum === 6200, trasToggle);

  // (c) Quitar una fila (trash) debe DOBLAR su monto en la(s) fila(s) restante(s), no perderlo
  // -- la suma sigue calzando, y la fila borrada desaparece del DOM.
  await page.click('[data-cat-remove="1"]');
  await page.waitForTimeout(150);
  const trasRemover = await sumaCategorias(page);
  const domTrasRemover = await page.evaluate(() => ({
    nSelects: document.querySelectorAll('[data-cat-select]').length,
    nAmounts: document.querySelectorAll('[data-cat-amount]').length,
    idx1SelectExists: !!document.querySelector('[data-cat-select="1"]'),
    idx1AmountExists: !!document.querySelector('[data-cat-amount="1"]'),
  }));
  check('(c) Tras quitar una fila, el monto removido se dobla en la fila restante (suma sigue calzando)', trasRemover.sum === trasRemover.monto && trasRemover.categorias.length === 1, trasRemover);
  check('   Y la fila borrada (idx 1) ya no existe en el DOM', domTrasRemover.nSelects === 1 && domTrasRemover.nAmounts === 1 && !domTrasRemover.idx1SelectExists && !domTrasRemover.idx1AmountExists, domTrasRemover);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
