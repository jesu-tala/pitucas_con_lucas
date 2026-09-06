// Bug reportado: en la vista vacía de Grupos (sin ningún grupo todavía), "Crear grupo" y
// "Unirme con un código" quedaban gigantes -- .save-tx-btn (width:100%) sueltos dentro de
// .empty-state se estiraban al ancho completo de la pantalla, sin la tarjeta que normalmente
// los acota en el resto de la app.
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
    const btn = document.querySelector('[data-group-create-open]');
    const rect = btn ? btn.getBoundingClientRect() : null;
    return { width: rect ? Math.round(rect.width) : null, viewportWidth: window.innerWidth };
  });
  check('El botón "Crear grupo" ya no ocupa el ancho completo de la pantalla', info.width !== null && info.width < info.viewportWidth - 40, info);

  await finish({ context, browser, errors });
})();
