// Bug real reportado: un cargo (SALUD UC URGENCIA CSC) se confirmó importado OK en el log de
// Apps Script (la fila llegó a transacciones_importadas y el RPC respondió bien) pero nunca
// apareció en la app. Causa raíz: absorbImportedRows() (views/menu.ts) marcaba la fila como
// "procesado" confiando en el guardado automático DEBOUNCED (scheduleSave -> writeStateToSupabase,
// ~1.2s después, ver supabase.ts) en vez de esperar que ese guardado terminara. Si esa escritura
// fallaba (sin conexión, error de Supabase) o la pestaña se cerraba antes de que corriera, la
// transacción quedaba solo en memoria, nunca se guardaba, y como el correo ya figuraba
// "procesado" jamás se reintentaba: se perdía en silencio para siempre.
// El fix hace que absorbImportedRows espere la confirmación real de writeStateToSupabase() antes
// de marcar procesado -- si falla, la fila importada se deja "procesado:false" para reintentarla
// la próxima vez. Este test fuerza esa falla reemplazando window.__debug.sb por un cliente falso
// (sb real no puede escribir en este sandbox de todas formas, ver shot_grupo_eliminar.js) para
// controlar exactamente si la escritura a "app_state" tiene éxito o no.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page } = await openApp();
  const errors = []; // don't use the shared `errors` from openApp -- Escenario A WANTS/expects
                      // the console.error that writeStateToSupabase logs on a real failure (see
                      // shot_grupo_compartir_falla.js for the same pattern), so track separately
                      // and only forward JS pageerrors (real bugs) to finish().
  page.on('pageerror', err => errors.push(err.message));

  // ---------- Escenario A: el guardado a Supabase FALLA ----------
  const before = await page.evaluate(() => {
    const D = window.__debug;
    window.__test = { markedProcessed: false };
    D.currentHouseholdId = 'test-household';
    D.sb = {
      from(table){
        if(table === 'transacciones_importadas'){
          return {
            select(){ return this; }, eq(){ return this; },
            order(){ return Promise.resolve({ data: [{
              id: 'imp-salud-1', household_id:'test-household', fecha:'2026-09-07', hora:'12:57',
              comercio:'SALUD UC URGENCIA CSC', monto: 815642, tipo:'gasto', medio_sugerido:'****6342', procesado:false
            }], error: null }); },
            update(){ window.__test.markedProcessed = true; return this; },
            in(){ return Promise.resolve({data:null, error:null}); }
          };
        }
        if(table === 'app_state'){
          // Simula una escritura real que falla (sin conexión, error de Supabase, etc.)
          return { update(){ return this; }, eq(){ return Promise.resolve({ error: {message:'network error (simulado)'} }); } };
        }
        return { select(){return this;}, eq(){return this;}, order(){ return Promise.resolve({data:[],error:null}); } };
      }
    };
    return D.TRANSACTIONS.length;
  });
  await page.evaluate(() => window.__debug.absorbImportedRows());
  await page.waitForTimeout(300);
  const afterFail = await page.evaluate(() => ({
    count: window.__debug.TRANSACTIONS.length,
    marcoProcesado: window.__test.markedProcessed,
    toastTexto: document.getElementById('toast-stack').textContent,
  }));
  check('la transacción se agrega en memoria aunque el guardado real falle después', afterFail.count === before + 1, { before, after: afterFail.count });
  check('si falla el guardado, NO se marca el correo como "procesado" (se reintenta, no se pierde)', afterFail.marcoProcesado === false, afterFail);
  check('avisa con un toast explícito que no se pudo guardar (nunca en silencio)', /no se pudo guardar/i.test(afterFail.toastTexto), afterFail);

  // ---------- Escenario B: el guardado a Supabase funciona bien ----------
  await page.evaluate(() => {
    const D = window.__debug;
    window.__test.markedProcessed = false;
    D.sb = {
      from(table){
        if(table === 'transacciones_importadas'){
          return {
            select(){ return this; }, eq(){ return this; },
            order(){ return Promise.resolve({ data: [{
              id: 'imp-salud-2', household_id:'test-household', fecha:'2026-09-07', hora:'13:00',
              comercio:'FARMACIA CRUZ VERDE', monto: 9990, tipo:'gasto', medio_sugerido:'****6342', procesado:false
            }], error: null }); },
            update(){ window.__test.markedProcessed = true; return this; },
            in(){ return Promise.resolve({data:null, error:null}); }
          };
        }
        if(table === 'app_state'){
          return { update(){ return this; }, eq(){ return Promise.resolve({ error: null }); } };
        }
        return { select(){return this;}, eq(){return this;}, order(){ return Promise.resolve({data:[],error:null}); } };
      }
    };
  });
  await page.evaluate(() => window.__debug.absorbImportedRows());
  await page.waitForTimeout(300);
  const afterOk = await page.evaluate(() => ({
    marcoProcesado: window.__test.markedProcessed,
    toastTexto: document.getElementById('toast-stack').textContent,
  }));
  check('cuando el guardado SÍ funciona, ahí sí se marca el correo como procesado', afterOk.marcoProcesado === true, afterOk);
  check('y avisa con el toast normal de "se agregó desde tu correo"', /se agreg[oó].*desde tu correo/i.test(afterOk.toastTexto), afterOk);

  check('no hubo errores de JS (pageerror) durante todo el flujo', errors.length === 0, errors);
  await finish({ context, browser, errors: [] });
})();
