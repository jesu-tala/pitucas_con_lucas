// Bug real: "crear grupo" fallaba con "new row violates row level security policy for table
// grupos" -- createGroup() (views/menu.ts) hacía .insert(...).select().single() en una sola
// llamada, y PostgREST resuelve ese "traer la fila de vuelta" con un SELECT aparte que pasa por
// la política "ver mis grupos" (is_grupo_member), NO por la de "crear grupo". Postgres devuelve
// el MISMO mensaje genérico de RLS sin importar cuál de las dos políticas falló de verdad, así
// que no había forma de saber cuál arreglar solo con el toast. Esto YA había pasado una vez
// antes (ver PRs #4-#6) y se "arregló" revirtiendo el diagnóstico temporal sin dejar nada
// permanente -- exactamente por eso volvió a pasar. El fix real, esta vez permanente: separar
// el INSERT puro del SELECT-de-vuelta, cada uno con su propio manejo de error.
// Este test simula sb con un cliente falso (matching el mismo patrón de mock que
// shot_import_falla_guardado.js) para forzar cada uno de los dos caminos de falla por separado,
// y confirma que la app avisa cosas DISTINTAS y correctas en cada caso -- nunca "no se pudo
// crear" cuando en realidad el grupo sí quedó guardado.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page } = await openApp();
  const errors = []; // se esperan errores de consola reales (permission/RLS simulados) -- mismo
                      // patrón que shot_grupo_compartir_falla.js / shot_import_falla_guardado.js.
  page.on('pageerror', err => errors.push(err.message));

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [];
    D.state.tab = 'grupos';
    D.render();
  });
  await page.waitForTimeout(150);

  // ---------- Caso 1: el INSERT mismo falla (el grupo NO se creó) ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.sb = {
      from(table){
        if(table === 'grupos'){
          return {
            insert(){ return Promise.resolve({ data: null, error: { message: 'permission denied for table grupos' } }); },
            select(){ return this; }, eq(){ return this; }, order(){ return this; }, limit(){ return this; },
            maybeSingle(){ return Promise.resolve({ data: null, error: null }); }
          };
        }
        return { select(){ return this; }, eq(){ return this; }, order(){ return this; }, limit(){ return this; }, in(){ return this; }, maybeSingle(){ return Promise.resolve({data:null,error:null}); } };
      }
    };
  });
  await page.click('[data-group-create-open]');
  await page.waitForTimeout(100);
  await page.fill('[data-group-draft-field="nombre"]', 'Depto con Fran');
  await page.click('[data-group-create-confirm]');
  await page.waitForTimeout(300);
  const casoInsertFalla = await page.evaluate(() => ({
    toast: document.getElementById('toast-stack').textContent,
    grupos: window.__debug.GROUPS.length,
  }));
  check('Si el INSERT falla, el toast dice explícitamente "no se pudo crear" (con el detalle real)',
    /no se pudo crear el grupo.*permission denied/i.test(casoInsertFalla.toast), casoInsertFalla);
  check('   y efectivamente no hay ningún grupo (consistente con el aviso)', casoInsertFalla.grupos === 0, casoInsertFalla);

  // ---------- Caso 2: el INSERT funciona, pero el SELECT-de-vuelta falla (el grupo SÍ se creó) ----------
  await page.evaluate(() => {
    document.getElementById('toast-stack').innerHTML = ''; // limpia el toast del caso anterior
    const D = window.__debug;
    D.sb = {
      from(table){
        if(table === 'grupos'){
          return {
            insert(){ return Promise.resolve({ data: null, error: null }); }, // el insert en sí sale bien
            select(){ return this; }, eq(){ return this; }, order(){ return this; }, limit(){ return this; },
            maybeSingle(){ return Promise.resolve({ data: null, error: { message: 'permission denied for table grupos (select)' } }); }
          };
        }
        return { select(){ return this; }, eq(){ return this; }, order(){ return this; }, limit(){ return this; }, in(){ return this; }, maybeSingle(){ return Promise.resolve({data:null,error:null}); } };
      }
    };
  });
  await page.click('[data-group-create-open]');
  await page.waitForTimeout(100);
  await page.fill('[data-group-draft-field="nombre"]', 'Depto con Fran');
  await page.click('[data-group-create-confirm]');
  await page.waitForTimeout(300);
  const casoSelectFalla = await page.evaluate(() => document.getElementById('toast-stack').textContent);
  check('Si el INSERT funciona pero el SELECT-de-vuelta falla, el toast NO dice "no se pudo crear" (sería falso -- sí se creó)',
    !/no se pudo crear/i.test(casoSelectFalla), casoSelectFalla);
  check('   sino que avisa que se creó pero no se pudo confirmar en pantalla', /se cre[oó].*no se pudo confirmar/i.test(casoSelectFalla), casoSelectFalla);

  check('no hubo errores de JS (pageerror) durante todo el flujo', errors.length === 0, errors);
  await finish({ context, browser, errors: [] });
})();
