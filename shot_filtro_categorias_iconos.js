// Regresión: la hoja de "Filtros" (icono de embudo, en Transacciones) mostraba cada chip de
// categoría como "undefined Hogar", "undefined Supermercado", etc. La causa: chipToggle()
// armaba el ícono con ICONS[icon] directo, que solo sirve para íconos con nombre del set fijo
// (los medios de pago: 'card', 'bank', 'cash') -- pero casi todas las categorías de gasto/
// ingreso usan un emoji suelto como ícono ('🛒', '🏠', etc), así que ICONS[icon] daba
// `undefined`. El fix usa catIconMarkup() (el mismo helper que ya resuelve esto en el resto de
// la app) para ambos casos. Este test bloquea que la palabra "undefined" vuelva a aparecer en
// los chips de categoría o de medio del filtro, y que cada chip muestre su ícono real.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-open-filters]');
  await page.waitForTimeout(200);

  const info = await page.evaluate(() => {
    const CATS = window.__debug.CATS;
    const chips = [...document.querySelectorAll('[data-toggle-filter-cat]')];
    const textos = chips.map(c => c.textContent.trim());
    const conUndefined = textos.filter(t => t.includes('undefined'));
    // Cada chip (salvo "Sin categoría", que no lleva ícono) debe tener un ícono real: un <svg>
    // (íconos con nombre) o un .emoji-icon (categorías con emoji suelto).
    const sinIcono = chips.filter(c => {
      const id = c.getAttribute('data-toggle-filter-cat');
      if (id === '__sin_cat__') return false;
      return !c.querySelector('svg') && !c.querySelector('.emoji-icon');
    }).map(c => c.getAttribute('data-toggle-filter-cat'));
    return {
      cantidadChips: chips.length,
      cantidadCategoriasReales: Object.keys(CATS).length,
      conUndefined,
      sinIcono,
    };
  });
  check('Aparece un chip de filtro por cada categoría (+ "Sin categoría")', info.cantidadChips === info.cantidadCategoriasReales + 1, info);
  check('Ningún chip de categoría muestra la palabra "undefined"', info.conUndefined.length === 0, info);
  check('Todos los chips de categoría muestran su ícono real (svg o emoji)', info.sinIcono.length === 0, info);

  // Los chips de "medio de pago" (con íconos de nombre: card/bank/cash) tampoco deben decir
  // "undefined" -- ya funcionaban bien, pero conviene bloquearlo junto con lo anterior.
  const medioInfo = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-toggle-filter-medio]')];
    return { textos: chips.map(c => c.textContent.trim()), conUndefined: chips.filter(c => c.textContent.includes('undefined')).length };
  });
  check('Los chips de medio de pago tampoco muestran "undefined"', medioInfo.conUndefined === 0, medioInfo);

  await finish({ context, browser, errors });
})();
