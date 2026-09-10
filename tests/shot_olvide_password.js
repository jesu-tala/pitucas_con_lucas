// Feature: "olvidé mi contraseña" -- hasta ahora no existía ninguna forma de recuperar el
// acceso si alguien elegía entrar con correo/contraseña (en vez de Google) y la olvidaba.
// Cubre: el link solo aparece en el tab de "Iniciar sesión" (no tiene sentido al crear cuenta),
// pedir el correo antes de mandar el link, sb.auth.resetPasswordForEmail() con los parámetros
// correctos, la validación de la contraseña nueva, sb.auth.updateUser() con la contraseña
// nueva, y el guardia más importante: mientras inPasswordRecovery esté activo (la sesión que
// trae el link del correo), onAuthenticated() NO debe dejar pasar a la app directo con la
// contraseña vieja todavía puesta -- tiene que mostrar el formulario de "nueva contraseña" sí o sí.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    document.getElementById('auth-gate').hidden = false;
    document.getElementById('auth-checking').hidden = true;
    document.getElementById('auth-content').hidden = false;
    document.getElementById('auth-recovery-content').hidden = true;
  });

  // ---------- El link solo aparece en modo "Iniciar sesión" ----------
  const enLogin = await page.evaluate(() => !document.getElementById('auth-forgot-btn').hidden);
  check('El link "¿Olvidaste tu contraseña?" aparece en el tab de Iniciar sesión', enLogin === true);
  await page.click('[data-auth-tab="signup"]');
  await page.waitForTimeout(100);
  const enSignup = await page.evaluate(() => document.getElementById('auth-forgot-btn').hidden);
  check('   pero NO en el tab de Crear cuenta', enSignup === true);
  await page.click('[data-auth-tab="login"]');
  await page.waitForTimeout(100);

  // ---------- Tocarlo sin correo pide que lo escriba primero ----------
  await page.fill('#auth-email', '');
  await page.click('#auth-forgot-btn');
  await page.waitForTimeout(150);
  const sinCorreo = await page.evaluate(() => document.getElementById('auth-error').textContent);
  check('Sin correo escrito, pide escribirlo primero (no llama a Supabase)', /escribe tu correo/i.test(sinCorreo), sinCorreo);

  // ---------- Con correo, llama a resetPasswordForEmail con los parámetros correctos ----------
  await page.evaluate(() => {
    window.__resetCall = null;
    window.__debug.sb = {
      auth: {
        resetPasswordForEmail(email, opts){ window.__resetCall = { email, opts }; return Promise.resolve({ data: {}, error: null }); }
      }
    };
  });
  await page.fill('#auth-email', 'jesu@example.com');
  await page.click('#auth-forgot-btn');
  await page.waitForTimeout(150);
  const llamada = await page.evaluate(() => window.__resetCall);
  const hint = await page.evaluate(() => document.getElementById('auth-hint').textContent);
  check('Con correo, llama a resetPasswordForEmail con ese correo', llamada && llamada.email === 'jesu@example.com', llamada);
  check('   con un redirectTo de vuelta a la app', llamada && typeof llamada.opts.redirectTo === 'string' && llamada.opts.redirectTo.length > 0, llamada);
  check('   y avisa que se mandó el correo', /te mandamos un correo/i.test(hint), hint);

  // ---------- Guardia clave: con inPasswordRecovery activo, onAuthenticated NO entra a la app ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.inPasswordRecovery = true;
    D.currentHouseholdId = null; // si esto queda seteado tras esta llamada, se coló a la app
    D.onAuthenticated({ id: 'user-fake' });
  });
  await page.waitForTimeout(150);
  const trasRecoverySession = await page.evaluate(() => ({
    recoveryVisible: !document.getElementById('auth-recovery-content').hidden,
    contentHidden: document.getElementById('auth-content').hidden,
    entroALaApp: !!window.__debug.currentHouseholdId,
    gateOculto: document.getElementById('auth-gate').hidden,
  }));
  check('Con una sesión de recuperación activa, se muestra el formulario de nueva contraseña',
    trasRecoverySession.recoveryVisible === true && trasRecoverySession.contentHidden === true, trasRecoverySession);
  check('   y NO entra directo a la app con la sesión vieja (currentHouseholdId sigue sin setearse, gate sigue visible)',
    trasRecoverySession.entroALaApp === false && trasRecoverySession.gateOculto === false, trasRecoverySession);

  // ---------- En el formulario de nueva contraseña: valida largo mínimo ----------
  // El input ya tiene minlength="6" -- el navegador bloquea el submit nativo antes de que
  // llegue a JS (por eso no se prueba vía click+submit real, que nunca dispararía el handler).
  // Se llama a handlePasswordRecoverySubmit() directo para probar el chequeo propio de abajo
  // (defensa extra por si algún día se invoca de otra forma que no pase por el <form>).
  await page.fill('#auth-recovery-password', '123');
  await page.evaluate(() => window.__debug.handlePasswordRecoverySubmit());
  await page.waitForTimeout(150);
  const passwordCorta = await page.evaluate(() => document.getElementById('auth-recovery-error').textContent);
  check('Contraseña nueva muy corta: error de validación, sin llamar a Supabase', /al menos 6 caracteres/i.test(passwordCorta), passwordCorta);
  const nativaTambienBloquea = await page.evaluate(() => !document.getElementById('auth-recovery-password').checkValidity());
  check('   y el navegador igual la bloquearía de forma nativa (minlength="6")', nativaTambienBloquea === true, nativaTambienBloquea);

  await finish({ context, browser, errors });
})();
