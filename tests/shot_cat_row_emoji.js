// Regression: the user reported she no longer saw the category icons/emojis ("the ones
// we'd talked about before") -- the bug was in renderCategoryRows(), which drew each
// category row (inside a transaction's detail) with a plain color dot (.cat-dot), with no
// icon or emoji inside. Now each row uses a .cat-row-icon avatar that does show the category's
// real icon or emoji (via catIconMarkup), same as the rest of the app.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t6 = Sueldo Agosto, single category "sueldo", whose icon in CATEGORIES is the emoji 💼 (not a named
  // SVG icon) -- the exact case that was broken.
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
