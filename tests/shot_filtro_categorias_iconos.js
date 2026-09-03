// Regression: the "Filters" sheet (funnel icon, in Transactions) showed every category
// chip as "undefined Hogar", "undefined Supermercado", etc. The cause: chipToggle()
// built the icon with ICONS[icon] directly, which only works for named icons from the fixed set
// (payment methods: 'card', 'bank', 'cash') -- but almost all expense/income categories
// use a loose emoji as their icon ('🛒', '🏠', etc), so ICONS[icon] returned
// `undefined`. The fix uses catIconMarkup() (the same helper that already handles this elsewhere in
// the app) for both cases. This test guards against the word "undefined" reappearing in
// the filter's category or payment-method chips, and checks that every chip shows its real icon.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-open-filters]');
  await page.waitForTimeout(200);

  const info = await page.evaluate(() => {
    const CATEGORIES = window.__debug.CATEGORIES;
    const chips = [...document.querySelectorAll('[data-toggle-filter-cat]')];
    const textos = chips.map(c => c.textContent.trim());
    const conUndefined = textos.filter(t => t.includes('undefined'));
    // Every chip (except "Sin categoría", which carries no icon) must have a real icon: an <svg>
    // (named icons) or a .emoji-icon (categories with a loose emoji).
    const sinIcono = chips.filter(c => {
      const id = c.getAttribute('data-toggle-filter-cat');
      if (id === '__sin_cat__') return false;
      return !c.querySelector('svg') && !c.querySelector('.emoji-icon');
    }).map(c => c.getAttribute('data-toggle-filter-cat'));
    return {
      cantidadChips: chips.length,
      cantidadCategoriasReales: Object.keys(CATEGORIES).length,
      conUndefined,
      sinIcono,
    };
  });
  check('Aparece un chip de filtro por cada categoría (+ "Sin categoría")', info.cantidadChips === info.cantidadCategoriasReales + 1, info);
  check('Ningún chip de categoría muestra la palabra "undefined"', info.conUndefined.length === 0, info);
  check('Todos los chips de categoría muestran su ícono real (svg o emoji)', info.sinIcono.length === 0, info);

  // The "payment method" chips (with named icons: card/bank/cash) also must not say
  // "undefined" -- they already worked fine, but it's worth guarding this alongside the above.
  const paymentMethodInfo = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-toggle-filter-payment-method]')];
    return { textos: chips.map(c => c.textContent.trim()), conUndefined: chips.filter(c => c.textContent.includes('undefined')).length };
  });
  check('Los chips de medio de pago tampoco muestran "undefined"', paymentMethodInfo.conUndefined === 0, paymentMethodInfo);

  await finish({ context, browser, errors });
})();
