// Reported: "the bottom bar icons are badly centered". Reviewing the CSS we didn't
// find any centering bug (.tab uses flex-direction:column + align-items:center for the
// icon and text, with no conflicting overrides) -- this test leaves it automatically verified: the
// horizontal center of each tab's icon and text must exactly match each other and
// the button's center. If some future change breaks that centering (e.g. a badly set fixed width,
// an asymmetric padding, an icon with a misaligned viewBox) this test will catch it.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 390, height: 844 } });

  const tabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#tabbar .tab')).map(tab => {
      const btn = tab.getBoundingClientRect();
      const svg = tab.querySelector('svg').getBoundingClientRect();
      const span = tab.querySelector('span').getBoundingClientRect();
      return {
        label: tab.textContent.trim(),
        btnCenter: (btn.left + btn.right) / 2,
        svgCenter: (svg.left + svg.right) / 2,
        spanCenter: (span.left + span.right) / 2,
      };
    });
  });
  console.log('tabbar icon centering:', JSON.stringify(tabs));

  check('la barra inferior tiene los 4 tabs esperados (incluye Grupos, de gastos compartidos)', tabs.length === 4, tabs.map(t => t.label));
  tabs.forEach(t => {
    check('ícono de "' + t.label + '" centrado horizontalmente sobre su propio botón (tolerancia 1px)', Math.abs(t.svgCenter - t.btnCenter) <= 1, t);
    check('ícono de "' + t.label + '" alineado con su etiqueta de texto (tolerancia 1px)', Math.abs(t.svgCenter - t.spanCenter) <= 1, t);
  });

  await finish({ context, browser, errors });
})();
