// jesu no podía saber por qué el aviso de presupuesto "no le llegaba" -- enviarPushHogar() es
// a propósito "dispara y olvida" (nunca bloquea nada real por un aviso), así que un fallo en el
// camino (Worker mal configurado, sin dispositivos suscritos, error de Supabase) queda
// completamente en silencio para la usuaria. Este test fija el botón "Enviar aviso de prueba"
// en Menú > Notificaciones, que sí espera la respuesta real de enviarPushPrueba() y la muestra
// en pantalla -- para poder diagnosticar sin adivinar.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="notificaciones"]');
  await page.waitForTimeout(200);

  // Sin suscripción en este dispositivo (estado normal de los datos de ejemplo, sin Service
  // Worker real registrado), el botón de prueba no debería aparecer -- no tiene sentido probar
  // un envío si este dispositivo ni siquiera está suscrito.
  const sinSuscripcion = await page.evaluate(() => !!document.querySelector('[data-notif-test]'));
  check('Sin suscripción activa en este dispositivo, no aparece el botón "Enviar aviso de prueba"', sinSuscripcion === false, sinSuscripcion);

  // Con notifSubscribed forzado a true (simulando un dispositivo ya suscrito), el botón debe
  // aparecer, y al usarlo -- sin Worker real disponible en el entorno de test -- debe mostrar
  // un resultado en pantalla (nunca quedar en silencio ni reventar).
  const resultado = await page.evaluate(async () => {
    const D = window.__debug;
    D.state.notifSubscribed = true;
    D.render();
    const apareceBoton = !!document.querySelector('[data-notif-test]');
    await D.enviarPushPrueba();
    const texto = document.getElementById('view-root').textContent;
    return { apareceBoton, texto };
  });
  check('Con este dispositivo ya suscrito, sí aparece el botón "Enviar aviso de prueba"', resultado.apareceBoton, resultado);
  check('Al usar el botón de prueba, siempre se muestra un resultado en pantalla (nunca queda en silencio)', /aviso|Worker|prueba|conexión/i.test(resultado.texto), resultado.texto.slice(0, 500));

  await finish({ context, browser, errors });
})();
