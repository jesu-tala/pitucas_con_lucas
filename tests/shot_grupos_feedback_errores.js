// Regresión: la usuaria reportó "creé el grupo pero no lo veo" -- la causa real era que
// crearGrupo() fallaba silenciosamente (sin conexión a Supabase, o un problema de RLS) y el
// botón "Crear" simplemente cerraba el formulario sin avisar nada, dejando la impresión de que
// "no pasó nada". Mismo hueco existía en "Agregar participante". Este test fija el contrato: si
// la escritura a Supabase falla (acá, sb siempre es null en el sandbox de test, así que
// cualquier llamada de estas SIEMPRE toma el camino de error), la usuaria tiene que ver un
// toast explícito de que no se pudo, nunca quedarse sin ninguna señal.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.currentUser = { id: 'user-jesu' }; window.__debug.state.tab = 'grupos'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // (a) Crear un grupo sin conexión: el form se cierra pero avisa que no se pudo -- nunca
  // silencio total (que es justo lo que hacía pensar "no se creó nada" sin más explicación).
  await page.click('[data-grupo-crear-abrir]');
  await page.waitForTimeout(100);
  await page.fill('[data-grupo-draft-field="nombre"]', 'Depto con Fran');
  await page.click('[data-grupo-crear-confirmar]');
  await page.waitForTimeout(300);
  const tocreacion = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    grupos: window.__debug.GRUPOS.length,
  }));
  check('(a) Si crear grupo falla, aparece un toast explícito de error (nunca silencio)',
    /no se pudo crear/i.test(tocreacion.toastTexto), tocreacion);
  check('   y efectivamente no quedó ningún grupo creado (consistente con el aviso)', tocreacion.grupos === 0, tocreacion);

  // (b) Agregar un participante sin cuenta, sin conexión: mismo trato -- toast de error, no silencio.
  await page.evaluate(() => {
    const D = window.__debug;
    D.GRUPOS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GRUPO_PARTICIPANTES = [{ id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' }];
    D.state.grupoAbiertoId = 'g1';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-grupo-agregar-participante-abrir]');
  await page.waitForTimeout(100);
  await page.fill('[data-participante-draft-field="nombre"]', 'Pancho');
  await page.click('[data-grupo-agregar-participante-confirmar]');
  await page.waitForTimeout(300);
  const toparticipante = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    participantes: window.__debug.GRUPO_PARTICIPANTES.length,
  }));
  check('(b) Si agregar un participante falla, también avisa con un toast explícito', /no se pudo agregar/i.test(toparticipante.toastTexto), toparticipante);
  check('   y no quedó ningún participante nuevo agregado', toparticipante.participantes === 1, toparticipante);

  await finish({ context, browser, errors });
})();
