// Regresión: en una PWA de iOS agregada a la pantalla de inicio, a veces el primer dibujo deja
// un resto de espacio vacío debajo de la barra de tabs (window.innerHeight tarda un instante en
// asentarse en el alto real de pantalla). setAppHeight() ya se llamaba al cargar y ante eventos
// como resize/orientationchange, pero si ninguno de esos disparaba en la sesión, el valor
// equivocado del primer dibujo quedaba pegado. Se agregaron dos reintentos cortos (50ms y
// 300ms) para cubrir ese hueco sin depender de que la usuaria haga algo.
//
// Este sandbox no puede reproducir el bug real de iOS (es un detalle de Safari, no algo que
// Chromium headless tenga) -- lo que sí se puede probar acá es que el mecanismo de reintento
// funciona: si window.innerHeight cambia justo después de cargar (simulando que el navegador
// "corrige" su propio valor un instante después, como pasa en iOS), --app-height termina
// reflejando el valor nuevo una vez que corren los reintentos, no se queda pegado en el viejo.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  // waitAfter:0 -- openApp() por defecto espera 300ms antes de devolver el control, que es
  // justo la ventana de los reintentos que este test necesita interceptar a tiempo.
  const { context, browser, page, errors } = await openApp({ waitAfter: 0 });

  const appHeightInicial = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
  check('--app-height queda seteado desde el arranque (no vacío)', !!appHeightInicial && appHeightInicial !== '', appHeightInicial);

  // Simula que el navegador "corrige" su propio innerHeight un instante después de cargar
  // (el patrón real del bug en iOS) -- sin disparar ningún evento nosotros, para probar
  // justo que el reintento por setTimeout (no un listener) es el que se da cuenta. Tiene que
  // pasar ANTES de los 50ms del primer reintento -- por eso el openApp() de arriba no espera
  // sus 300ms por defecto.
  await page.evaluate(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
  });
  await page.waitForTimeout(400); // más que los 300ms del segundo reintento

  const appHeightTrasCorregir = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim());
  check('Tras los reintentos cortos, --app-height ya refleja el innerHeight "corregido" (700px), sin necesitar ningún evento', appHeightTrasCorregir === '700px', appHeightTrasCorregir);

  await finish({ context, browser, errors });
})();
