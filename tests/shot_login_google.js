// Feature: agregar "Continuar con Google" al auth-gate. Motivación real: una usuaria creó una
// cuenta con correo/contraseña, no confirmó el correo antes de intentar entrar, y el login le
// mostró el mismo mensaje genérico ("correo o contraseña incorrectos") que si hubiera escrito
// mal la clave -- Supabase no distingue el motivo por seguridad, así que no había forma de saber
// qué pasaba. Entrar con Google evita ese problema de raíz (Google ya confirma el correo), sin
// tener que armar todavía un flujo de "olvidé mi contraseña" (que sigue sin existir).
// sb siempre falla/no está disponible en este sandbox, así que este test verifica: el botón
// existe con el texto y atributo correctos, que tocarlo llama a signInWithOAuth con
// provider:'google' y una redirectTo razonable, y que un error real (ej. "provider no
// habilitado", el caso más probable mientras no se configure en Supabase) se traduce a un
// mensaje entendible en vez de mostrar el texto crudo de la API.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // openApp() oculta el auth-gate entero para poder probar el resto de la app directo -- para
  // este test hay que volver a mostrarlo (mismo estado que alguien viendo el login de verdad).
  await page.evaluate(() => {
    document.getElementById('auth-gate').hidden = false;
    document.getElementById('auth-checking').hidden = true;
    document.getElementById('auth-content').hidden = false;
  });

  const boton = await page.evaluate(() => {
    const btn = document.getElementById('auth-google-btn');
    return btn ? { existe: true, texto: btn.textContent.trim(), tieneIcono: !!btn.querySelector('svg') } : { existe: false };
  });
  check('El botón "Continuar con Google" existe en el auth-gate', boton.existe === true, boton);
  check('   con el texto correcto y un ícono', /Continuar con Google/i.test(boton.texto) && boton.tieneIcono, boton);

  // ---------- Tocar el botón llama a signInWithOAuth con los parámetros correctos ----------
  await page.evaluate(() => {
    window.__oauthCall = null;
    const D = window.__debug;
    D.sb = {
      auth: {
        signInWithOAuth(opts){ window.__oauthCall = opts; return Promise.resolve({ data: {}, error: null }); }
      }
    };
  });
  await page.click('#auth-google-btn');
  await page.waitForTimeout(150);
  const llamada = await page.evaluate(() => window.__oauthCall);
  check('Tocar el botón llama a sb.auth.signInWithOAuth con provider:"google"', llamada && llamada.provider === 'google', llamada);
  check('   con un redirectTo apuntando de vuelta a esta misma página (sin querystring/hash propios)',
    llamada && typeof llamada.options.redirectTo === 'string' && llamada.options.redirectTo.length > 0 &&
    !llamada.options.redirectTo.includes('?') && !llamada.options.redirectTo.includes('#'), llamada);

  // ---------- Si Google todavía no está habilitado en Supabase, el error se traduce (no texto crudo) ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.sb = {
      auth: {
        signInWithOAuth(){ return Promise.resolve({ data: null, error: { message: 'Unsupported provider: provider is not enabled' } }); }
      }
    };
  });
  await page.click('#auth-google-btn');
  await page.waitForTimeout(150);
  const errorMostrado = await page.evaluate(() => document.getElementById('auth-error').textContent);
  check('Si el provider no está habilitado, se traduce a un mensaje entendible (no el texto crudo de la API)',
    /google.*no est[aá] activado/i.test(errorMostrado) && !errorMostrado.includes('Unsupported provider'), errorMostrado);

  await finish({ context, browser, errors });
})();
