// Bug reportado: en la vista vacía de Grupos (sin ningún grupo todavía), "Crear grupo" y
// "Unirme con un código" quedaban gigantes -- .save-tx-btn (width:100%) sueltos dentro de
// .empty-state se estiraban al ancho completo de la pantalla, sin la tarjeta que normalmente
// los acota en el resto de la app.
//
// Un segundo reporte más tarde ("se ven gigantes ... cuadrados") resultó ser una causa
// distinta: el ícono "+" de "Crear grupo" se insertaba como <svg> crudo dentro del botón sin
// ninguna regla CSS que lo acotara (todo el resto de la app escala sus íconos vía una regla
// `.algo svg{width;height}` dedicada) -- sin eso, el <svg viewBox="0 0 24 24"> sin atributos
// width/height propios rendereaba a su tamaño intrínseco por defecto del navegador (~300x150px),
// inflando el botón entero. El arreglo agrega `.save-tx-btn svg{width:16px;height:16px}` y de
// paso pone ambos botones en una fila compacta (mismo layout que cuando ya existen grupos), en
// vez de apilados.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 390, height: 844 } });

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = []; // sin grupos -- fuerza el estado vacío
    D.state.tab = 'grupos';
    D.render();
  });
  await page.waitForTimeout(150);

  const info = await page.evaluate(() => {
    const crear = document.querySelector('[data-group-create-open]');
    const unirme = document.querySelector('[data-group-join-open]');
    const rCrear = crear ? crear.getBoundingClientRect() : null;
    const rUnirme = unirme ? unirme.getBoundingClientRect() : null;
    const svg = crear ? crear.querySelector('svg') : null;
    const rSvg = svg ? svg.getBoundingClientRect() : null;
    return {
      width: rCrear ? Math.round(rCrear.width) : null,
      height: rCrear ? Math.round(rCrear.height) : null,
      viewportWidth: window.innerWidth,
      svgWidth: rSvg ? Math.round(rSvg.width) : null,
      svgHeight: rSvg ? Math.round(rSvg.height) : null,
      mismaFila: rCrear && rUnirme ? Math.abs(rCrear.top - rUnirme.top) < 2 : false,
    };
  });
  check('El botón "Crear grupo" ya no ocupa el ancho completo de la pantalla', info.width !== null && info.width < info.viewportWidth - 40, info);
  check('El ícono "+" queda acotado a un tamaño chico (no ~300x150px por defecto del navegador)', info.svgWidth !== null && info.svgWidth <= 20 && info.svgHeight <= 20, info);
  check('El botón queda con una altura modesta, no gigante (menos de 90px)', info.height !== null && info.height < 90, info);
  check('El botón no queda cuadrado (más ancho que alto)', info.width !== null && info.height !== null && info.width > info.height, info);
  check('"Crear grupo" y "Unirme con un código" quedan en una sola fila compacta, no apilados', info.mismaFila, info);

  await finish({ context, browser, errors });
})();
