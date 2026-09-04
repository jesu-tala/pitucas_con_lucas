// Regression guard: at a narrow (mobile-breakpoint) viewport, .phone must be position:fixed
// and flush against the true bottom of the viewport -- this is the fix for the old bug where
// .phone used height:100vh and left a gap below the tab bar (rebote / rubber-band scroll on
// iOS made the frame not reach the real bottom of the screen).
//
// Also covers the bug reported (twice) when adding the app to the home screen (standalone PWA
// on iOS): there was leftover empty space under the bottom bar. An earlier fix pinned .phone's
// height to a value computed by JS (--app-height, read from window.innerHeight /
// visualViewport.height) at all times -- but that JS-measured value occasionally came out a
// few pixels short of the real screen on some iPhones, and once set, a CSS custom property
// never falls back to 100dvh again on its own, so the gap stayed stuck. Now --app-height is
// only defined while the on-screen keyboard is genuinely open (the one case 100dvh can't
// handle by itself, see setAppHeight() in app.ts) -- in the normal case it stays undefined and
// .phone relies on 100dvh directly, which the browser itself resolves correctly for this
// "PWA on iOS" scenario without our help.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 390, height: 844 } });

  const info = await page.evaluate(() => {
    const phone = document.querySelector('.phone');
    const tabbar = document.getElementById('tabbar');
    const phoneStyle = getComputedStyle(phone);
    const tabbarRect = tabbar.getBoundingClientRect();
    const appHeight = getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim();
    return {
      phonePosition: phoneStyle.position,
      phoneHeight: phone.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      tabbarBottom: tabbarRect.bottom,
      appHeight,
    };
  });
  console.log('phone position / tabbar bottom vs viewport height:', JSON.stringify(info));

  check('A <=480px, .phone usa position:fixed (no height:100vh, que dejaba un hueco)', info.phonePosition === 'fixed', info.phonePosition);
  check('La tabbar queda al ras del borde inferior real de la pantalla (tolerancia 2px)', Math.abs(info.tabbarBottom - info.viewportHeight) <= 2, info);
  check('--app-height queda SIN definir (sin teclado abierto, .phone usa 100dvh nativo directo)', info.appHeight === '', info.appHeight);
  check('.phone llega exacto al alto real de la pantalla vía 100dvh, sin ayuda de JS (tolerancia 2px)', Math.abs(info.phoneHeight - info.viewportHeight) <= 2, info);

  await finish({ context, browser, errors });
})();
