// jesu couldn't figure out why the budget alert "wasn't arriving" -- enviarPushHogar() is
// deliberately "fire and forget" (it never blocks anything real over a notification), so a failure
// along the way (a misconfigured Worker, no subscribed devices, a Supabase error) stays
// completely silent for the user. This test locks in the "Enviar aviso de prueba" (send test alert) button
// in Menu > Notifications, which does wait for sendTestPush()'s real response and shows it
// on screen -- so it can be diagnosed without guessing.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="notificaciones"]');
  await page.waitForTimeout(200);

  // Without a subscription on this device (the normal state of the sample data, with no real
  // Service Worker registered), the test button should not appear -- there's no point testing
  // a send if this device isn't even subscribed.
  const sinSuscripcion = await page.evaluate(() => !!document.querySelector('[data-notif-test]'));
  check('Sin suscripción activa en este dispositivo, no aparece el botón "Enviar aviso de prueba"', sinSuscripcion === false, sinSuscripcion);

  // With notifSubscribed forced to true (simulating an already-subscribed device), the button should
  // appear, and using it -- with no real Worker available in the test environment -- should show
  // a result on screen (never staying silent or crashing).
  const resultado = await page.evaluate(async () => {
    const D = window.__debug;
    D.state.notifSubscribed = true;
    D.render();
    const apareceBoton = !!document.querySelector('[data-notif-test]');
    await D.sendTestPush();
    const texto = document.getElementById('view-root').textContent;
    return { apareceBoton, texto };
  });
  check('Con este dispositivo ya suscrito, sí aparece el botón "Enviar aviso de prueba"', resultado.apareceBoton, resultado);
  check('Al usar el botón de prueba, siempre se muestra un resultado en pantalla (nunca queda en silencio)', /aviso|Worker|prueba|conexión/i.test(resultado.texto), resultado.texto.slice(0, 500));

  await finish({ context, browser, errors });
})();
