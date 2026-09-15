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
// Regresión (d/e, nueva): el margen de 40px (arriba) era tan chico que, en iOS, la diferencia
// normal entre window.innerHeight y visualViewport.height al recién cargar (antes de que el
// navegador termine de asentar el viewport dinámico -- ninguna de las dos cosas tiene por qué
// estar ya estable en ese primer instante, y no puede haber ningún teclado abierto todavía,
// nada tiene foco recién cargando) se leía como "el teclado está abierto": un falso positivo que
// dejaba --app-height pegado en un valor más chico que la pantalla real por el resto de la
// sesión, hasta el primer resize/orientation genuino (que sí recalcula con métricas ya
// asentadas -- por eso el bug real reportado "se arreglaba solo al mover el teléfono"). El
// arreglo: el margen sube a 150px (un teclado real tapa varias veces eso, un jitter de arranque
// no) y, más importante, orientationchange/pageshow/visibilitychange ya no vuelven a intentar
// "adivinar" si hay teclado con esas métricas -- simplemente asumen que no lo hay (correcto:
// nada tiene foco recién rotando la pantalla o volviendo de segundo plano) y limpian
// --app-height directo, sin comparar nada.
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

    // (d) Un achique CHICO (60px -- más que el margen viejo de 40px, pero muchísimo menos que un
    // teclado real) NO debe activar --app-height -- eso era justo el falso positivo del bug real
    // (la diferencia de arranque entre innerHeight/visualViewport.height en iOS nunca llega a
    // cubrir varios cientos de px, así que un margen de 150px lo absorbe sin marcarlo como
    // "teclado abierto").
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: window.innerHeight - 60 });
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const appHeightConJitterChico = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
    check('(d) Un achique chico (60px, más que el margen viejo de 40px) ya NO se confunde con el teclado abierto (margen ahora 150px)', appHeightConJitterChico === '', appHeightConJitterChico);

    // (e) orientationchange (y pageshow/visibilitychange) ya NO vuelven a comparar métricas para
    // "adivinar" si hay teclado -- limpian --app-height directo, incluso si visualViewport
    // TODAVÍA está achicado (lo que antes se hubiera vuelto a leer como "sigue abierto").
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 500 });
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const antesDeRotar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
    check('(setup e) --app-height queda en 500px antes de "rotar"', antesDeRotar === '500px', antesDeRotar);
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await page.waitForTimeout(100);
    const trasRotar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
    check('(e) orientationchange limpia --app-height directo (sin volver a comparar métricas)', trasRotar === '', trasRotar);
  }

  await finish({ context, browser, errors });
})();
