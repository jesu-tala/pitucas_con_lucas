// Regresión: la usuaria reportó que ya no veía los iconos/emojis de las categorías ("de los que
// habíamos hablado antes") -- el bug estaba en renderCategoriaRows(), que dibujaba cada fila de
// categoría (dentro del detalle de una transacción) con un simple punto de color (.cat-dot), sin
// ícono ni emoji adentro. Ahora cada fila usa un avatar .cat-row-icon que sí muestra el ícono o
// emoji real de la categoría (vía catIconMarkup), igual que en el resto de la app.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t6 = Sueldo Agosto, categoría única "sueldo", cuyo ícono en CATS es el emoji 💼 (no un ícono
  // SVG con nombre conocido) -- el caso exacto que se rompía.
  await page.click('[data-tx="t6"]');
  await page.waitForTimeout(200);

  const filaSueldo = await page.evaluate(() => {
    const row = document.querySelector('.split-row[data-cat-row="0"]');
    const iconSpan = row ? row.querySelector('.cat-row-icon') : null;
    return {
      hayFilaConDot: !!document.querySelector('.cat-dot'),
      tieneIconSpan: !!iconSpan,
      tieneEmojiIcon: iconSpan ? !!iconSpan.querySelector('.emoji-icon') : false,
      emojiTexto: iconSpan ? (iconSpan.querySelector('.emoji-icon')?.textContent || null) : null,
    };
  });
  check('Ya no existe el punto de color plano ".cat-dot" (el bug original)', filaSueldo.hayFilaConDot === false, filaSueldo);
  check('La fila de categoría tiene un avatar .cat-row-icon', filaSueldo.tieneIconSpan === true, filaSueldo);
  check('Ese avatar muestra el emoji real de la categoría (💼 para Sueldo)', filaSueldo.tieneEmojiIcon === true && filaSueldo.emojiTexto === '💼', filaSueldo);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
