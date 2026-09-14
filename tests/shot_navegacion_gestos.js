// Navegación por gestos: una pila de navegación central (nav.ts) que la flecha atrás, el
// swipe desde el borde izquierdo, el back del SO (popstate) y el cierre de una hoja usan todos
// por igual, más el drag-to-dismiss de la hoja (grabber/backdrop/contenido-al-tope) y el doble
// tap en el navbar (resetea esa sección a su vista por defecto).
//
// Nota de test-harness: los listeners de gesto están delegados en #phone y leen e.target para
// decidir si aplican (zona del borde, .sheet-handle, #sheet-content al tope) -- por eso los
// pointerdown/move/up de acá se despachan sobre el ELEMENTO real involucrado (o sobre
// coordenadas dentro de la zona de borde), nunca sobre #phone directamente, salvo cuando lo que
// se está probando es justamente la posición (x) del toque, no un target específico.
const { openApp, check, finish } = require('./lib/test_kit');

async function edgeSwipe(page, { startX, startY = 400, dx, dy = 2, pointerId }) {
  await page.dispatchEvent('#phone', 'pointerdown', { pointerId, clientX: startX, clientY: startY, button: 0, isPrimary: true });
  await page.waitForTimeout(15);
  await page.dispatchEvent('#phone', 'pointermove', { pointerId, clientX: startX + dx * 0.4, clientY: startY + dy * 0.4 });
  await page.waitForTimeout(15);
  await page.dispatchEvent('#phone', 'pointermove', { pointerId, clientX: startX + dx, clientY: startY + dy });
  await page.waitForTimeout(15);
  await page.dispatchEvent('#phone', 'pointerup', { pointerId, clientX: startX + dx, clientY: startY + dy });
}

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 390, height: 844 } });

  // ---------- 1) Pila única: flecha, gesto y "back del SO" producen el MISMO resultado ----------
  await page.evaluate(() => { window.__debug.state.tab = 'menu'; window.__debug.render(); });
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(120);
  const stackDespuesDeAbrir = await page.evaluate(() => window.__debug.navStackSnapshot());
  check('(1) Abrir una sección del Menú empuja UN frame a la pila (tipo "menu-section")',
    stackDespuesDeAbrir.length === 1 && stackDespuesDeAbrir[0].type === 'menu-section', stackDespuesDeAbrir);

  // 1a) La flecha atrás
  await page.click('[data-menu-back]');
  await page.waitForTimeout(120);
  const trasFlecha = await page.evaluate(() => ({ depth: window.__debug.navDepth(), section: window.__debug.state.menuSection, titulo: document.querySelector('.menu-screen-title')?.textContent || null }));
  check('(1a) La flecha atrás deja la pila en 0 y vuelve a la lista principal de Menú', trasFlecha.depth === 0 && trasFlecha.section === null, trasFlecha);

  // 1b) navigateBack() -- la MISMA función que el gesto de borde y el back del SO invocan
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__debug.navigateBack());
  await page.waitForTimeout(120);
  const trasNavigateBack = await page.evaluate(() => ({ depth: window.__debug.navDepth(), section: window.__debug.state.menuSection }));
  check('(1b) navigateBack() (lo que dispara el gesto de borde) produce EXACTAMENTE lo mismo que la flecha', JSON.stringify(trasNavigateBack) === JSON.stringify(trasFlecha.depth !== undefined ? { depth: trasFlecha.depth, section: trasFlecha.section } : null), trasNavigateBack);

  // 1c) popstate ("back del SO" -- Android/navegador; el único que existe en un PWA de iOS es
  // el swipe de borde probado más abajo) dispara la MISMA función.
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await page.waitForTimeout(120);
  const trasPopstate = await page.evaluate(() => ({ depth: window.__debug.navDepth(), section: window.__debug.state.menuSection }));
  check('(1c) Un evento popstate (back del SO) también produce lo mismo', trasPopstate.depth === 0 && trasPopstate.section === null, trasPopstate);

  // ---------- 2) Edge-swipe-back ----------
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(120);

  // 2a) Un swipe que arranca en el CENTRO de la pantalla no debe disparar nada.
  await edgeSwipe(page, { startX: 200, dx: 150, pointerId: 10 });
  await page.waitForTimeout(300);
  const trasSwipeCentro = await page.evaluate(() => ({ depth: window.__debug.navDepth(), section: window.__debug.state.menuSection }));
  check('(2a) Un swipe que arranca en el centro de la pantalla NO dispara el back', trasSwipeCentro.depth === 1 && trasSwipeCentro.section === 'categorias', trasSwipeCentro);

  // 2b) Un swipe corto/lento desde el borde vuelve a su lugar (no cruza el umbral).
  await edgeSwipe(page, { startX: 10, dx: 20, pointerId: 11 });
  await page.waitForTimeout(300);
  const trasSwipeCorto = await page.evaluate(() => ({
    depth: window.__debug.navDepth(), section: window.__debug.state.menuSection,
    transform: document.getElementById('view-root').style.transform,
  }));
  check('(2b) Un swipe desde el borde que no pasa el umbral NO dispara el back (vuelve a su lugar)',
    trasSwipeCorto.depth === 1 && trasSwipeCorto.section === 'categorias' && trasSwipeCorto.transform === '', trasSwipeCorto);

  // 2c) Un swipe desde el borde que SÍ pasa el umbral dispara el back, con la pantalla
  // anterior asomando (el peek) mientras se arrastra.
  await page.dispatchEvent('#phone', 'pointerdown', { pointerId: 12, clientX: 10, clientY: 400, button: 0, isPrimary: true });
  await page.waitForTimeout(15);
  await page.dispatchEvent('#phone', 'pointermove', { pointerId: 12, clientX: 60, clientY: 401 });
  await page.waitForTimeout(15);
  await page.dispatchEvent('#phone', 'pointermove', { pointerId: 12, clientX: 150, clientY: 402 });
  await page.waitForTimeout(15);
  const midSwipe = await page.evaluate(() => ({
    peekVisible: !document.getElementById('view-root-peek').hidden,
    peekTieneListaMenu: document.getElementById('view-root-peek').textContent.includes('Categorías') === false && document.getElementById('view-root-peek').textContent.length > 0,
    transform: document.getElementById('view-root').style.transform,
  }));
  await page.dispatchEvent('#phone', 'pointerup', { pointerId: 12, clientX: 150, clientY: 402 });
  await page.waitForTimeout(350);
  const trasSwipeLargo = await page.evaluate(() => ({ depth: window.__debug.navDepth(), section: window.__debug.state.menuSection }));
  check('(2c) Mientras se arrastra desde el borde, la pantalla anterior asoma (peek visible) siguiendo el dedo',
    midSwipe.peekVisible === true && midSwipe.transform.includes('translateX'), midSwipe);
  check('   y al soltar pasado el umbral, se completa el back (vuelve a la lista principal de Menú)',
    trasSwipeLargo.depth === 0 && trasSwipeLargo.section === null, trasSwipeLargo);

  // 2d) Un swipe sobre un carrusel/scroller horizontal (ej. el donut) tampoco dispara nada --
  // el gesto está acotado a los primeros 24px, y un elemento normal de la pantalla empieza
  // bastante más adentro que eso incluso pegado a la izquierda de su propia tarjeta.
  await page.evaluate(() => { window.__debug.state.tab = 'resumen'; window.__debug.render(); });
  await page.waitForTimeout(120);
  await edgeSwipe(page, { startX: 120, dx: 150, pointerId: 13 });
  await page.waitForTimeout(300);
  const errsTrasSwipeResumen = errors.length;
  check('(2d) Un swipe que no arranca en la franja del borde (ej. sobre contenido de Resumen) no revienta nada', errsTrasSwipeResumen === errors.length);

  // ---------- 3) Drag-to-dismiss de la hoja ----------
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(120);
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(150);

  // 3a) Arrastrar el grabber por debajo del umbral -- y despacio, no un flick -- vuelve a su
  // lugar (no cierra). Los waitForTimeout entre pasos importan acá: son lo que hace que la
  // velocidad calculada quede baja, igual que un ajuste lento de verdad con el dedo.
  let handle = await page.$('.sheet-handle');
  let box = await handle.boundingBox();
  await page.dispatchEvent('.sheet-handle', 'pointerdown', { pointerId: 20, clientX: box.x+box.width/2, clientY: box.y+box.height/2, button: 0, isPrimary: true, bubbles: true });
  await page.waitForTimeout(200);
  await page.dispatchEvent('.sheet-handle', 'pointermove', { pointerId: 20, clientX: box.x+box.width/2, clientY: box.y+box.height/2+40, bubbles: true });
  await page.waitForTimeout(200);
  await page.dispatchEvent('.sheet-handle', 'pointerup', { pointerId: 20, clientX: box.x+box.width/2, clientY: box.y+box.height/2+40, bubbles: true });
  await page.waitForTimeout(350);
  const trasDragCorto = await page.evaluate(() => ({ open: document.getElementById('sheet-overlay').classList.contains('open'), depth: window.__debug.navDepth() }));
  check('(3a) Arrastrar el grabber sin pasar el umbral NO cierra la hoja', trasDragCorto.open === true && trasDragCorto.depth === 1, trasDragCorto);

  // 3b) Arrastrar el grabber pasado el umbral (o rápido) SÍ cierra la hoja.
  if(!trasDragCorto.open){ await page.click('[data-tx="t2"]'); await page.waitForTimeout(150); }
  handle = await page.$('.sheet-handle');
  box = await handle.boundingBox();
  await page.dispatchEvent('.sheet-handle', 'pointerdown', { pointerId: 21, clientX: box.x+box.width/2, clientY: box.y+box.height/2, button: 0, isPrimary: true, bubbles: true });
  await page.waitForTimeout(15);
  await page.dispatchEvent('.sheet-handle', 'pointermove', { pointerId: 21, clientX: box.x+box.width/2, clientY: box.y+box.height/2+60, bubbles: true });
  await page.waitForTimeout(15);
  const midDrag = await page.evaluate(() => document.getElementById('sheet').style.transform);
  await page.dispatchEvent('.sheet-handle', 'pointermove', { pointerId: 21, clientX: box.x+box.width/2, clientY: box.y+box.height/2+180, bubbles: true });
  await page.waitForTimeout(15);
  await page.dispatchEvent('.sheet-handle', 'pointerup', { pointerId: 21, clientX: box.x+box.width/2, clientY: box.y+box.height/2+180, bubbles: true });
  await page.waitForTimeout(400);
  const trasDragLargo = await page.evaluate(() => ({ open: document.getElementById('sheet-overlay').classList.contains('open'), depth: window.__debug.navDepth() }));
  check('(3b) La hoja sigue el dedo en vivo mientras se arrastra el grabber', midDrag.includes('translateY'), midDrag);
  check('   y pasado el umbral, soltar cierra la hoja de verdad', trasDragLargo.open === false && trasDragLargo.depth === 0, trasDragLargo);

  // 3c) El backdrop cierra la hoja.
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(150);
  await page.click('#sheet-overlay', { position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
  const trasBackdrop = await page.evaluate(() => document.getElementById('sheet-overlay').classList.contains('open'));
  check('(3c) Tocar el backdrop cierra la hoja', trasBackdrop === false);

  // 3d) El scroll interno de la hoja (contenido NO al tope) no dispara el dismiss por accidente.
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('sheet-content').scrollTop = 50; });
  const contentBox = await page.evaluate(() => {
    const el = document.getElementById('sheet-content');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + 30 };
  });
  await page.dispatchEvent('#sheet-content', 'pointerdown', { pointerId: 22, clientX: contentBox.x, clientY: contentBox.y, button: 0, isPrimary: true, bubbles: true });
  await page.waitForTimeout(15);
  await page.dispatchEvent('#sheet-content', 'pointermove', { pointerId: 22, clientX: contentBox.x, clientY: contentBox.y+150, bubbles: true });
  await page.waitForTimeout(15);
  await page.dispatchEvent('#sheet-content', 'pointerup', { pointerId: 22, clientX: contentBox.x, clientY: contentBox.y+150, bubbles: true });
  await page.waitForTimeout(300);
  const trasScrollNoAlTope = await page.evaluate(() => ({
    open: document.getElementById('sheet-overlay').classList.contains('open'),
    transform: document.getElementById('sheet').style.transform,
  }));
  check('(3d) Arrastrar desde el contenido cuando NO está scrolleado al tope no cierra la hoja ni la mueve', trasScrollNoAlTope.open === true && trasScrollNoAlTope.transform === '', trasScrollNoAlTope);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ---------- 4) Doble tap en el navbar ----------
  await page.evaluate(() => { window.__debug.state.tab = 'menu'; window.__debug.render(); });
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => { document.getElementById('view-root').scrollTop = 40; });
  const antesDobleTap = await page.evaluate(() => ({ section: window.__debug.state.menuSection, scrollTop: document.getElementById('view-root').scrollTop }));
  check('(pre) Antes del doble tap: seguimos dentro de Categorías, con algo de scroll', antesDobleTap.section === 'categorias' && antesDobleTap.scrollTop > 0, antesDobleTap);

  // Tocar la tab "Menú" mientras YA está activa (justo lo que un segundo tap real produce, ya
  // que el primer tap ya te deja en esa tab) resetea la sección a su default.
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  const trasDobleTap = await page.evaluate(() => ({
    section: window.__debug.state.menuSection, depth: window.__debug.navDepth(),
    scrollTop: document.getElementById('view-root').scrollTop,
  }));
  check('(4) Tocar la tab activa cierra la sub-vista abierta (vuelve a la raíz de Menú)', trasDobleTap.section === null && trasDobleTap.depth === 0, trasDobleTap);
  check('   y deja el scroll al tope', trasDobleTap.scrollTop === 0, trasDobleTap);

  // Tocar una tab DISTINTA (no la activa) solo cambia de pestaña -- no resetea nada por las
  // puras, ni toca la sub-vista de otra sección que no sea la que se está dejando.
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(120);
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(120);
  const trasCambiarTab = await page.evaluate(() => ({ tab: window.__debug.state.tab, section: window.__debug.state.menuSection, depth: window.__debug.navDepth() }));
  check('(4b) Tocar una tab DISTINTA solo cambia de pestaña -- no resetea la sub-vista de Menú (se conserva para cuando se vuelva)', trasCambiarTab.tab === 'transacciones' && trasCambiarTab.section === 'categorias' && trasCambiarTab.depth === 1, trasCambiarTab);

  await finish({ context, browser, errors });
})();
