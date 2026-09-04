// Regression guard: at a narrow (mobile-breakpoint) viewport, .phone must be position:fixed
// and flush against the true bottom of the viewport -- this is the fix for the old bug where
// .phone used height:100vh and left a gap below the tab bar (rebote / rubber-band scroll on
// iOS made the frame not reach the real bottom of the screen).
//
// Also covers the bug reported when adding the app to the home screen (standalone PWA on
// iOS): there was leftover empty space under the bottom bar. The fix was to explicitly pin the
// height of .phone (100dvh, with --app-height set by JS as a fallback) instead of
// completing it with "bottom:0" -- here we verify that variable gets computed and that .phone still
// reaches exactly the real bottom edge.
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
  check('--app-height quedó seteado por JS (respaldo para el hueco de la PWA instalada)', info.appHeight === info.viewportHeight + 'px', info.appHeight);
  check('.phone llega exacto al alto real de la pantalla (tolerancia 2px)', Math.abs(info.phoneHeight - info.viewportHeight) <= 2, info);

  await finish({ context, browser, errors });
})();
