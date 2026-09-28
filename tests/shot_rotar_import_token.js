// Menú > "Importar desde tu correo": el botón para cambiar el código de importación
// (ver backend/supabase/fix_rotar_import_token.sql).
//
// Antes de esto el import_token era ETERNO. Es la credencial con la que el Apps Script y el
// Worker escriben en un hogar sin sesión de nadie, vive en dos lugares fuera de la app (un
// script en script.google.com y los parámetros de una llamada al Worker), y no había forma de
// cambiarlo: fix_grupos_columnas_protegidas.sql --con razón-- le quitó a `authenticated` el
// permiso de escribir esa columna, así que quedó bien protegida y a la vez imposible de rotar
// ni por su dueña.
//
// La rotación en sí la hace el servidor (rotar_import_token(), security definer, saca el hogar
// de auth.uid() sin recibirlo por parámetro), y la suite corre sin conexión con sb en null. Así
// que lo que se ejercita acá es el lado del cliente: que exista el botón, que pida confirmación
// antes de romper nada, que la confirmación diga la consecuencia REAL --que las compras dejan
// de entrar hasta pegar el código nuevo en el Apps Script--, que cancelar no cambie nada, y que
// una rotación fallida avise en vez de decir que salió bien.
const { openApp, check, finish } = require('./lib/test_kit');

const TOKEN_FALSO = '11111111-2222-3333-4444-555555555555';

(async () => {
  const { context, browser, page, errors } = await openApp();

  // La pantalla normalmente carga los códigos desde Supabase al abrirla; acá se marcan como ya
  // cargados y se inyecta un token, el mismo patrón que el resto de la suite usa para los datos
  // que vienen del backend.
  await page.evaluate((tok) => {
    const D = window.__debug;
    D.state.emailImportLoaded = true;
    D.state.emailImportLoading = false;
    D.state.emailImportError = null;
    D.state.importToken = tok;
  }, TOKEN_FALSO);

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="importarcorreo"]');
  await page.waitForTimeout(250);

  let txt = await page.textContent('#view-root');
  check('la pantalla muestra el código de importación', /Código de importación/.test(txt), txt.slice(0, 200));
  const tokenVisible = await page.$$eval('input.draft-input', els => els.map(e => e.value));
  check('(control) el token inyectado se está mostrando de verdad', tokenVisible.includes(TOKEN_FALSO), tokenVisible);
  check('hay un botón para cambiar el código', !!(await page.$('[data-rotar-token]')));

  // ---------- confirmación ----------
  await page.click('[data-rotar-token]');
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('pedir el cambio abre una confirmación, no rota de inmediato', /¿Cambiar el código\?/.test(txt), txt.slice(0, 400));
  check('la confirmación avisa que el código viejo deja de servir', /deja de servir/.test(txt), txt.slice(0, 600));
  // Es LA advertencia que importa: sin ella el síntoma aparece días después, como "dejaron de
  // entrar mis compras", sin ninguna pista de la causa.
  check('la confirmación avisa que las compras dejan de entrar solas', /dejar de entrar solas/.test(txt), txt.slice(0, 600));
  check('la confirmación nombra el Apps Script, que es donde hay que pegar el nuevo', /Apps Script/.test(txt), txt.slice(0, 600));
  check('mientras confirma, el botón de cambiar ya no está', !(await page.$('[data-rotar-token]')));

  // ---------- cancelar ----------
  await page.click('[data-rotar-token-cancelar]');
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('cancelar cierra la confirmación', !/¿Cambiar el código\?/.test(txt), txt.slice(0, 300));
  check('cancelar deja el botón de cambiar de vuelta', !!(await page.$('[data-rotar-token]')));
  const trasCancelar = await page.$$eval('input.draft-input', els => els.map(e => e.value));
  check('cancelar no toca el código', trasCancelar.includes(TOKEN_FALSO), trasCancelar);

  // ---------- el camino de falla ----------
  // Sin conexión (sb en null, como corre toda la suite) la rotación no puede salir bien. Lo que
  // se comprueba es que AVISE: un "Código cambiado" acá sería una mentira que manda a la
  // persona a pegar un código que en realidad nunca cambió.
  await page.click('[data-rotar-token]');
  await page.waitForTimeout(150);
  await page.click('[data-rotar-token-confirmar]');
  await page.waitForTimeout(400);
  txt = await page.textContent('#view-root');
  check('si la rotación falla, NO dice que el código cambió', !/Código cambiado/.test(txt), txt.slice(0, 500));
  check('si la rotación falla, lo avisa', /No se pudo cambiar el código/.test(txt), txt.slice(0, 500));
  const trasFallar = await page.$$eval('input.draft-input', els => els.map(e => e.value));
  check('una rotación fallida deja el código anterior intacto', trasFallar.includes(TOKEN_FALSO), trasFallar);

  // ---------- el aviso posterior, cuando sí funciona ----------
  // El éxito necesita servidor, así que se pinta el estado directamente para comprobar que el
  // texto diga lo que tiene que decir: que hay que ir a pegarlo, no solo "listo".
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.tokenRotado = true;
    D.state.confirmRotarToken = false;
    D.state.rotandoToken = false;
    D.state.rotarTokenError = null;
    D.renderMenuView();
  });
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('al cambiarlo, avisa que hay que pegarlo en el Apps Script', /Código cambiado/.test(txt) && /IMPORT_TOKEN/.test(txt), txt.slice(0, 600));

  await browser.close();
  finish(errors);
})();
