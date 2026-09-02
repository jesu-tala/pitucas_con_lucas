// Reportado: "los iconos de la barra inferior están mal centrados". Revisando el CSS no
// encontramos ningún bug de centrado (.tab usa flex-direction:column + align-items:center para
// icono y texto, sin overrides en conflicto) -- este test lo deja verificado en automático: el
// centro horizontal del ícono y del texto de cada tab deben coincidir exactamente entre sí y con
// el centro del botón. Si algún cambio futuro rompe ese centrado (ej. un ancho fijo mal puesto,
// un padding asimétrico, un ícono con viewBox descuadrado) este test lo va a agarrar.
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

  check('la barra inferior tiene los 3 tabs esperados', tabs.length === 3, tabs.map(t => t.label));
  tabs.forEach(t => {
    check('ícono de "' + t.label + '" centrado horizontalmente sobre su propio botón (tolerancia 1px)', Math.abs(t.svgCenter - t.btnCenter) <= 1, t);
    check('ícono de "' + t.label + '" alineado con su etiqueta de texto (tolerancia 1px)', Math.abs(t.svgCenter - t.spanCenter) <= 1, t);
  });

  await finish({ context, browser, errors });
})();
