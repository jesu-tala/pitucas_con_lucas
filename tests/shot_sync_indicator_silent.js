// Regression: the user asked that the app NEVER explicitly tell her "saving..."/"saved"
// -- saving should be invisible and just work implicitly (no text notification). The only
// case where something visible should appear is a real connection error ("not saved"),
// because there it does matter that the person knows something wasn't saved. This test calls
// updateSyncIndicator() directly (the real function used by the Supabase autosave flow) with each
// possible state and verifies what stays visible in each case.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const estados = await page.evaluate(() => {
    const D = window.__debug;
    const el = document.getElementById('sync-indicator');
    const leer = () => ({ hidden: el.hidden, texto: el.textContent });

    D.updateSyncIndicator('saving');
    const saving = leer();

    D.updateSyncIndicator('saved');
    const saved = leer();

    D.updateSyncIndicator('error');
    const error = leer();

    // Returning to a good state (e.g. connection recovered) should hide it again.
    D.updateSyncIndicator('saved');
    const trasRecuperar = leer();

    return { saving, saved, error, trasRecuperar };
  });

  check('Mientras "guarda" (saving), el indicador queda OCULTO (sin texto visible)', estados.saving.hidden === true, estados.saving);
  check('   y no dice literalmente "Guardando"', !/guardando/i.test(estados.saving.texto), estados.saving);
  check('Tras guardar (saved), el indicador sigue OCULTO', estados.saved.hidden === true, estados.saved);
  check('   y no dice literalmente "Guardado"', !/guardado/i.test(estados.saved.texto), estados.saved);
  check('Con un error real de conexión, el indicador SÍ se muestra', estados.error.hidden === false, estados.error);
  check('   con un texto que avisa que no se guardó', /no se guardó/i.test(estados.error.texto), estados.error);
  check('Al recuperarse (saved de nuevo), vuelve a ocultarse', estados.trasRecuperar.hidden === true, estados.trasRecuperar);

  await finish({ context, browser, errors });
})();
