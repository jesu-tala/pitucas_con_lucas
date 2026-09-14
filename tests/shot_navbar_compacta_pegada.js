// Reportado: la barra inferior (Transacciones/Resumen/Grupos/Menú) se ve demasiado alta y
// despegada del borde inferior, con espacio muerto debajo (estilo distinto al de Tricount).
// Este test bloquea una regresión de vuelta a eso, en 3 frentes:
//  (1) sigue pegada exactamente al borde inferior real (.phone position:fixed + 100dvh en el
//      breakpoint móvil) -- ya cubierto también por shot_tabbar_fixed.js, se re-chequea acá para
//      que quede junto al resto de este bug puntual;
//  (2) la barra en sí es compacta -- padding vertical achicado (4px, antes 6px) y altura de
//      contenido bajo un techo razonable (<=60px sin safe-area, Tricount-style), no "gigante";
//  (3) el safe-area-inset-bottom del iPhone se suma UNA sola vez -- nunca se duplica en un
//      wrapper además de la barra -- verificado inspeccionando el CSS generado (env() resuelve
//      a 0 en Chromium de escritorio sin notch, así que la única forma confiable de detectar una
//      duplicación es contar cuántas reglas lo usan, no medir píxeles).
const fs = require('fs');
const path = require('path');
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 390, height: 844 } });

  const info = await page.evaluate(() => {
    const tabbar = document.getElementById('tabbar');
    const r = tabbar.getBoundingClientRect();
    const cs = getComputedStyle(tabbar);
    return {
      tabbarBottom: r.bottom,
      tabbarHeight: r.height,
      paddingTop: cs.paddingTop,
      viewportHeight: window.innerHeight
    };
  });
  console.log('navbar compacta:', JSON.stringify(info));

  check('(1) La barra sigue exactamente pegada al borde inferior real (tolerancia 2px)', Math.abs(info.tabbarBottom - info.viewportHeight) <= 2, info);
  check('(2) El padding vertical de la barra se achicó (4px, antes 6px)', info.paddingTop === '4px', info.paddingTop);
  check('(2) La altura de contenido de la barra es compacta (<=60px sin safe-area, antes 67px)', info.tabbarHeight <= 60, info.tabbarHeight);

  // (3) inspección estática del CSS generado: el safe-area-inset-bottom del iPhone solo se
  // suma en 2 lugares intencionales (el padding de la barra, y el offset del botón + para no
  // quedar tapado detrás de ella) -- nunca en un wrapper adicional que lo duplicaría.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  // El patrón exige la coma + valor por defecto (",0px)") -- así solo cuenta usos reales en
  // una declaración CSS, no una mención suelta en un comentario.
  const ocurrencias = (html.match(/env\(safe-area-inset-bottom,0px\)/g) || []).length;
  check('(3) safe-area-inset-bottom se usa exactamente 2 veces en el CSS (barra + botón +, nunca duplicado)', ocurrencias === 2, ocurrencias);

  await finish({ context, browser, errors });
})();
