// Regresión (a, reescrita): la primera versión de este fix hacía que setAppHeight() SIEMPRE
// escribiera --app-height a mano (leyendo window.innerHeight, después visualViewport.height) y
// lo dejaba puesto para siempre. El problema: una variable CSS, una vez seteada, no vuelve sola
// al valor de respaldo (100dvh) de la regla de .phone -- así que si esa lectura por JS alguna
// vez quedaba un pelo corta del alto real de pantalla (pasaba en algunos iPhone, por motivos
// fuera de nuestro control en cómo iOS reporta el alto justo al abrir una PWA), el hueco bajo la
// barra de tabs quedaba pegado toda la sesión, aunque el navegador mismo (100dvh, pensado
// justo para esto) lo hubiera calculado bien. Ahora setAppHeight() deja --app-height SIN
// definir en el caso normal (así .phone usa 100dvh nativo directo) y solo lo define cuando de
// verdad hace falta: mientras el teclado está abierto (ver (b) más abajo), que es el único caso
// que 100dvh no resuelve solo (el "layout viewport" no se achica con el teclado, solo el área
// realmente visible, visualViewport.height).
//
// Regresión (b): el teclado de iOS tapaba campos cerca del borde inferior sin dejar cómo
// verlos -- por eso setAppHeight() sigue existiendo, ahora acotado a este único caso.
//
// Este sandbox no puede reproducir el comportamiento real de iOS (son detalles de Safari, no
// algo que Chromium headless tenga) -- lo que sí se puede probar acá es el mecanismo.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // (a) En el caso normal (sin teclado), --app-height queda SIN definir -- .phone usa 100dvh
  // nativo del navegador directo, no un valor recalculado a mano que podría quedar corto.
  const appHeightInicial = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
  check('(a) En el caso normal (sin teclado), --app-height queda SIN definir (usa 100dvh nativo)', appHeightInicial === '', appHeightInicial);

  const tieneVisualViewport = await page.evaluate(() => !!window.visualViewport);
  check('(setup) Este navegador tiene visualViewport (para poder probar el caso del teclado)', tieneVisualViewport === true, tieneVisualViewport);

  // (b) Simula que se abre el teclado (visualViewport se achica bastante más que el margen de
  // 40px, pero window.innerHeight NO cambia -- así se distingue de un jitter menor) y confirma
  // que --app-height ahora SÍ sigue al área visible más chica.
  if(tieneVisualViewport){
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 500 });
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const appHeightConTeclado = await page.evaluate(() => ({
      appHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim(),
      innerHeight: window.innerHeight,
    }));
    check('(b) Al "abrirse el teclado" (visualViewport se achica bastante), --app-height lo sigue (500px) aunque window.innerHeight no haya cambiado',
      appHeightConTeclado.appHeight === '500px' && appHeightConTeclado.innerHeight !== 500, appHeightConTeclado);

    // (c) Y al "cerrarse el teclado" (visualViewport vuelve a su alto normal), --app-height
    // vuelve a quedar SIN definir -- no se queda pegado en el último valor del teclado.
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: window.innerHeight });
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const appHeightTrasCerrar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
    check('(c) Al "cerrarse el teclado", --app-height vuelve a quedar sin definir (no se queda pegado)', appHeightTrasCerrar === '', appHeightTrasCerrar);
  }

  await finish({ context, browser, errors });
})();
