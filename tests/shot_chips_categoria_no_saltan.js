// La fila de chips de categoría, arriba de Transacciones, se desplaza de lado (.chip-row es
// overflow-x:auto) y hay bastantes más categorías de las que caben a lo ancho del teléfono.
//
// El bug: renderTransactionsView reescribe el innerHTML entero de #view-root, así que el
// navegador vuelve a crear ese div y su scroll arranca en cero. Tocar un chip que estaba a la
// derecha hacía saltar la fila al principio -- y el chip recién tocado quedaba fuera de
// pantalla, que es justo el que uno quiere seguir viendo (es el filtro que acaba de aplicar).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(250);

  // Control positivo #1: la fila tiene que desbordar de verdad, o no habría scroll que perder
  // y el test pasaría sin comprobar nada.
  const medidas = await page.evaluate(() => {
    const row = document.querySelector('#view-root .chip-row');
    return row ? { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth, chips: row.children.length } : null;
  });
  check('(control) la fila de chips existe', !!medidas, medidas);
  check('(control) la fila de chips desborda a lo ancho', !!medidas && medidas.scrollWidth > medidas.clientWidth + 20, medidas);

  // Desplazar la fila a la derecha, como haría alguien buscando una categoría del final.
  await page.evaluate(() => {
    const row = document.querySelector('#view-root .chip-row');
    row.scrollLeft = row.scrollWidth - row.clientWidth;
  });
  await page.waitForTimeout(120);
  const scrollAntes = await page.evaluate(() => document.querySelector('#view-root .chip-row').scrollLeft);
  check('(control) la fila quedó desplazada antes de tocar nada', scrollAntes > 20, { scrollAntes });

  // Tocar el último chip de la fila: aplica el filtro y re-renderiza la vista entera. Se elige
  // el último a propósito, porque es el que está fuera de pantalla si la fila volviera a cero.
  const chipTocado = await page.evaluate(() => {
    const row = document.querySelector('#view-root .chip-row');
    const chips = [...row.querySelectorAll('[data-filter]')];
    const chip = chips[chips.length - 1];
    if(!chip) return null;
    const info = { texto: chip.textContent.trim(), filtro: chip.getAttribute('data-filter') };
    chip.click();
    return info;
  });
  check('(control) se tocó un chip real de la fila', !!chipTocado && !!chipTocado.filtro, chipTocado);
  await page.waitForTimeout(250);

  const scrollDespues = await page.evaluate(() => {
    const row = document.querySelector('#view-root .chip-row');
    return row ? row.scrollLeft : -1;
  });
  check('tocar un chip NO devuelve la fila al principio', scrollDespues > 20, { scrollAntes, scrollDespues });
  check('la fila queda donde estaba', Math.abs(scrollDespues - scrollAntes) < 40, { scrollAntes, scrollDespues });

  // Y el filtro sí se aplicó: el arreglo del scroll no puede haber roto lo que el chip hace.
  const filtroAplicado = await page.evaluate(() => window.__debug.state.filter);
  check('el filtro del chip se aplicó igual', !!chipTocado && filtroAplicado === chipTocado.filtro,
    { filtroAplicado, esperado: chipTocado && chipTocado.filtro });

  await browser.close();
  finish(errors);
})();
