// Regression: the user reported "I created the group but I don't see it" -- the real cause was that
// createGroup() failed silently (no connection to Supabase, or an RLS issue) and the
// "Crear" button simply closed the form without any warning, leaving the impression that
// "nothing happened". The same gap existed in "Add participant". This test pins down the contract: if
// the write to Supabase fails (here, sb is always null in the test sandbox, so
// any of these calls ALWAYS take the error path), the user must see an
// explicit toast saying it failed, never be left with no signal at all.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.currentUser = { id: 'user-jesu' }; window.__debug.state.tab = 'grupos'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // (a) Creating a group with no connection: the form closes but warns that it failed -- never
  // total silence (which is exactly what made people think "nothing was created" with no explanation).
  await page.click('[data-group-create-open]');
  await page.waitForTimeout(100);
  await page.fill('[data-group-draft-field="nombre"]', 'Depto con Fran');
  await page.click('[data-group-create-confirm]');
  await page.waitForTimeout(300);
  const tocreacion = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    grupos: window.__debug.GROUPS.length,
  }));
  check('(a) Si crear grupo falla, aparece un toast explícito de error (nunca silencio)',
    /no se pudo crear/i.test(tocreacion.toastTexto), tocreacion);
  check('   y efectivamente no quedó ningún grupo creado (consistente con el aviso)', tocreacion.grupos === 0, tocreacion);

  // (b) Adding a participant without an account, with no connection: same treatment -- error toast, not silence.
  await page.evaluate(() => {
    const D = window.__debug;
    D.GROUPS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [{ id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' }];
    D.state.openGroupId = 'g1';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-group-add-participant-open]');
  await page.waitForTimeout(100);
  await page.fill('[data-participant-draft-field="nombre"]', 'Pancho');
  await page.click('[data-group-add-participant-confirm]');
  await page.waitForTimeout(300);
  const toparticipante = await page.evaluate(() => ({
    toastTexto: document.getElementById('toast-stack').textContent,
    participantes: window.__debug.GROUP_PARTICIPANTS.length,
  }));
  check('(b) Si agregar un participante falla, también avisa con un toast explícito', /no se pudo agregar/i.test(toparticipante.toastTexto), toparticipante);
  check('   y no quedó ningún participante nuevo agregado', toparticipante.participantes === 1, toparticipante);

  await finish({ context, browser, errors });
})();
