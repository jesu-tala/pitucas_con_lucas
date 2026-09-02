// Regresión: la usuaria pidió que la app NUNCA le diga explícitamente "guardando..."/"guardado"
// -- que el guardado pase invisible, y que se entienda solo (sin avisar con texto). El único
// caso en el que sí debe aparecer algo visible es un error real de conexión ("no se guardó"),
// porque ahí sí importa que la persona sepa que algo no se guardó. Este test llama directo a
// updateSyncIndicator() (la función real que usa el flujo de autosave con Supabase) con cada
// estado posible y verifica qué queda visible en cada caso.
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

    // Volver a un estado bueno (ej: se recuperó la conexión) debe volver a ocultarlo.
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
