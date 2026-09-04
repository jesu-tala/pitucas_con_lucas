// Regresión (a): en una PWA de iOS agregada a la pantalla de inicio, a veces el primer dibujo
// deja un resto de espacio vacío debajo de la barra de tabs (window.innerHeight/visualViewport
// tardan un instante en asentarse en el alto real de pantalla). setAppHeight() ya se llamaba al
// cargar y ante eventos como resize/orientationchange, pero si ninguno de esos disparaba en la
// sesión, el valor equivocado del primer dibujo quedaba pegado. Se agregaron dos reintentos
// cortos (50ms y 300ms) para cubrir ese hueco sin depender de que la usuaria haga algo.
//
// Regresión (b): el teclado de iOS tapaba campos cerca del borde inferior sin dejar cómo
// verlos -- setAppHeight() usaba window.innerHeight, que NO se achica cuando aparece el
// teclado (solo lo hace visualViewport.height, el área realmente visible), así que .phone
// seguía creyendo que tenía toda la pantalla libre aunque el teclado tapara parte de abajo.
// Ahora usa visualViewport.height cuando existe.
//
// Este sandbox no puede reproducir el comportamiento real de iOS (son detalles de Safari, no
// algo que Chromium headless tenga) -- lo que sí se puede probar acá es el mecanismo: que
// --app-height sigue a visualViewport.height (o a innerHeight si no hay visualViewport), y que
// los reintintos por setTimeout recuperan un valor que cambió sin que nada dispare un evento.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  // waitAfter:0 -- openApp() por defecto espera 300ms antes de devolver el control, que es
  // justo la ventana de los reintentos que este test necesita interceptar a tiempo.
  const { context, browser, page, errors } = await openApp({ waitAfter: 0 });

  const appHeightInicial = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
  check('--app-height queda seteado desde el arranque (no vacío)', !!appHeightInicial && appHeightInicial !== '', appHeightInicial);

  const tieneVisualViewport = await page.evaluate(() => !!window.visualViewport);
  check('(setup) Este navegador tiene visualViewport (para poder probar el caso del teclado)', tieneVisualViewport === true, tieneVisualViewport);

  // (a) Simula que el navegador "corrige" su propio alto un instante después de cargar (el
  // patrón real del bug en iOS) -- sin disparar ningún evento nosotros, para probar justo que
  // el reintento por setTimeout (no un listener) es el que se da cuenta. Tiene que pasar ANTES
  // de los 50ms del primer reintento -- por eso el openApp() de arriba no espera sus 300ms.
  await page.evaluate(() => {
    if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 700 });
    else Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
  });
  await page.waitForTimeout(400); // más que los 300ms del segundo reintento

  const appHeightTrasCorregir = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
  check('(a) Tras los reintentos cortos, --app-height ya refleja el alto "corregido" (700px), sin necesitar ningún evento', appHeightTrasCorregir === '700px', appHeightTrasCorregir);

  // (b) Simula que se abre el teclado (visualViewport se achica, pero window.innerHeight NO
  // cambia -- así se distingue de verdad este caso del anterior) y confirma que --app-height
  // sigue al área visible más chica, no al alto "de layout" completo.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize')); // limpio, antes de simular el teclado
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    if (window.visualViewport) {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 500 });
      window.visualViewport.dispatchEvent(new Event('resize'));
    }
  });
  await page.waitForTimeout(100);
  const appHeightConTeclado = await page.evaluate(() => ({
    appHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim(),
    innerHeight: window.innerHeight,
  }));
  if (tieneVisualViewport) {
    check('(b) Al "abrirse el teclado" (visualViewport se achica), --app-height lo sigue (500px) aunque window.innerHeight no haya cambiado',
      appHeightConTeclado.appHeight === '500px' && appHeightConTeclado.innerHeight !== 500, appHeightConTeclado);
  }

  await finish({ context, browser, errors });
})();
