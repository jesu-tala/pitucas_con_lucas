// Reportado: la barra inferior (Transacciones/Resumen/Grupos/Menú) se ve demasiado alta y
// despegada del borde inferior, con espacio muerto debajo (estilo distinto al de Tricount).
// Este test bloquea una regresión de vuelta a eso, en 3 frentes:
//  (1) sigue pegada exactamente al borde inferior real (.phone position:fixed + 100dvh en el
//      breakpoint móvil) -- ya cubierto también por shot_tabbar_fixed.js, se re-chequea acá para
//      que quede junto al resto de este bug puntual;
//  (2) la barra en sí es compacta -- padding vertical achicado (4px, antes 6px) y altura de
//      contenido bajo un techo razonable (<=60px sin safe-area, Tricount-style), no "gigante";
//  (3) el safe-area-inset-bottom del iPhone se usa en exactamente 3 lugares, cada uno con un
//      propósito propio y sin pisarse entre sí: el padding de la barra (para no tapar sus
//      propios íconos con el home indicator), el padding-bottom de .view-scroll (para que el
//      contenido con scroll no quede oculto DETRÁS de la barra, que ahora es position:fixed y
//      ya no reserva su espacio en el flujo normal) y el offset del botón + (para no quedar
//      tapado por la barra) -- verificado inspeccionando el CSS generado (env() resuelve a 0 en
//      Chromium de escritorio sin notch, así que la única forma confiable de detectar una
//      duplicación ACCIDENTAL es contar cuántas reglas lo usan, no medir píxeles);
//  (4) la causa raíz real del bug reportado -- la barra se dibujaba "despegada" del borde SOLO
//      al recién abrir la app (y se autocorregía al mover/inclinar el teléfono, un resize real).
//      Eso apuntaba a .phone (100dvh) resolviendo un alto momentáneamente MÁS GRANDE que el real
//      en el primer pintado en iOS, antes de asentar el viewport dinámico -- y como la barra
//      vivía dentro del flujo de .phone, quedaba empujada fuera del área visible real ese primer
//      instante. Este test simula exactamente esa condición (fuerza a .phone a un alto mayor al
//      viewport real, sin esperar a que iOS realmente la produzca) y confirma que la barra
//      YA NO le importa: al ser position:fixed contra el viewport real, se queda pegada al
//      borde real sin importar cuánto se equivoque .phone en su propia altura.
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
  check('(3) safe-area-inset-bottom se usa exactamente 3 veces en el CSS (barra + view-scroll + botón +, nunca duplicado por accidente)', ocurrencias === 3, ocurrencias);

  // (4) Simula la condición real del bug: .phone midiéndose (momentáneamente, en iOS) más alto
  // que el viewport real. Sin el fix, eso empujaba la barra fuera del área visible -- con el
  // fix (la barra es position:fixed contra el viewport, ya no un hijo del flujo de .phone) debe
  // quedarse exactamente donde estaba, sin importar este error de .phone.
  const conPhoneMasAlto = await page.evaluate(() => {
    const phone = document.querySelector('.phone');
    phone.style.setProperty('height', '1200px', 'important'); // viewport real: 844px
    const tabbar = document.getElementById('tabbar');
    const r = tabbar.getBoundingClientRect();
    return { tabbarBottom: r.bottom, phoneHeight: phone.getBoundingClientRect().height, viewportHeight: window.innerHeight };
  });
  console.log('con .phone forzado más alto que el viewport real:', JSON.stringify(conPhoneMasAlto));
  check('(4) Aunque .phone se mida 1200px (más alto que el viewport real de 844px, la condición exacta del bug), la barra sigue pegada al borde real', Math.abs(conPhoneMasAlto.tabbarBottom - conPhoneMasAlto.viewportHeight) <= 2, conPhoneMasAlto);

  // (5) Ahora que la barra es position:fixed (ya no reserva su espacio en el flujo normal de
  // .phone), .view-scroll debe reservar manualmente al menos esa misma altura como
  // padding-bottom -- si no, el contenido con scroll pasaría por DEBAJO de la barra flotante.
  const clearance = await page.evaluate(() => {
    const tabbar = document.getElementById('tabbar');
    const scroll = document.querySelector('.view-scroll');
    return {
      tabbarHeight: tabbar.getBoundingClientRect().height,
      scrollPaddingBottom: parseFloat(getComputedStyle(scroll).paddingBottom)
    };
  });
  check('(5) .view-scroll reserva abajo al menos el alto real de la barra (para no ocultar contenido detrás de ella)', clearance.scrollPaddingBottom >= clearance.tabbarHeight, clearance);

  await finish({ context, browser, errors });
})();
