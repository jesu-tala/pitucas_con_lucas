// Bug real reportado: "eliminé grupos, volví a iniciar sesión y los veo de nuevo". Causa: en
// Postgres/PostgREST, si una política de RLS bloquea un DELETE, la llamada NO devuelve error --
// simplemente borra 0 filas en silencio. deleteGroup() (views/menu.ts) solo miraba `error`, así
// que mostraba "Grupo eliminado" con éxito aunque el grupo siguiera intacto en la base. El fix:
// después de un DELETE sin error, se confirma con una lectura aparte que la fila de verdad
// desapareció antes de avisar éxito.
// De paso, joinGroup() tenía el mismo problema de siempre (solo true/false, sin el error real) --
// se arregla igual que createGroup/deleteGroup.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page } = await openApp();
  const errors = []; // se espera un console.error real (RLS silenciosa simulada) -- mismo
                      // patrón que shot_grupo_compartir_falla.js / shot_import_falla_guardado.js.
  page.on('pageerror', err => errors.push(err.message));

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [{ id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' }];
    D.SHARED_EXPENSES = [];
    D.state.tab = 'grupos';
  });

  // ---------- Caso 1: el DELETE "funciona" (sin error) pero la fila SIGUE ahí (RLS silenciosa) ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.sb = {
      from(table){
        if(table === 'grupos'){
          return {
            delete(){ return this; },
            eq(){ return this; },
            // .delete().eq(...) se resuelve sin error -- simula el DELETE que "funciona" pero
            // en realidad no borró nada porque RLS lo bloqueó en silencio.
            then(resolve){ return resolve({ error: null }); },
            select(){ return this; },
            // La lectura de verificación encuentra la fila SIGUE existiendo.
            maybeSingle(){ return Promise.resolve({ data: { id: 'g1' }, error: null }); }
          };
        }
        return { select(){ return this; }, eq(){ return this; }, in(){ return this; }, maybeSingle(){ return Promise.resolve({data:null,error:null}); } };
      }
    };
    D.state.openGroupId = 'g1';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-ask-delete-group="g1"]');
  await page.waitForTimeout(100);
  await page.click('[data-confirm-delete-group="g1"]');
  await page.waitForTimeout(300);
  const caso1 = await page.evaluate(() => ({
    toast: document.getElementById('toast-stack').textContent,
    grupoSigueEnLista: window.__debug.GROUPS.some(g => g.id === 'g1'),
  }));
  check('Si el DELETE no da error pero la fila sigue existiendo (RLS silenciosa), avisa que NO se pudo eliminar',
    /no se pudo eliminar/i.test(caso1.toast) && !/eliminado$/i.test(caso1.toast.trim()), caso1);
  check('   y el grupo sigue en la lista local (no se borra de la UI con una falsa confirmación)',
    caso1.grupoSigueEnLista === true, caso1);

  // ---------- Caso 2: joinGroup muestra el error real, no siempre "revisa el código" ----------
  await page.evaluate(() => {
    document.getElementById('toast-stack').innerHTML = '';
    const D = window.__debug;
    D.sb = {
      rpc(fn, args){
        return Promise.resolve({ data: null, error: { message: 'código de invitación expirado' } });
      }
    };
    D.state.openGroupId = null;
    D.state.joiningGroup = true;
    D.state.joinDraft = { inviteCode: '', nombre: '' };
    D.render();
  });
  await page.waitForTimeout(150);
  await page.fill('[data-join-draft-field="inviteCode"]', 'abc-123');
  await page.fill('[data-join-draft-field="nombre"]', 'Yo');
  await page.click('[data-group-join-confirm]');
  await page.waitForTimeout(300);
  const caso2 = await page.evaluate(() => document.getElementById('toast-stack').textContent);
  check('Si unirse a un grupo falla, muestra el error real de Supabase (no siempre "revisa el código")',
    /no se pudo unir.*c[oó]digo de invitaci[oó]n expirado/i.test(caso2), caso2);

  check('no hubo errores de JS (pageerror) durante todo el flujo', errors.length === 0, errors);
  await finish({ context, browser, errors: [] });
})();
