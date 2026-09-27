// Menú > "Volver a una versión anterior": la pantalla que permite volver a un respaldo
// automático del blob (ver backend/supabase/schema_historial_blob.sql).
//
// Antes de esto, app_state era UNA fila por hogar que se sobrescribía en cada guardado, sin
// historial de ninguna clase: si los datos se corrompían, lo único que salvaba a la usuaria era
// haber bajado el JSON a mano -- y esa pantalla dice textualmente que no se puede volver a
// importar. O sea, no había vuelta atrás.
//
// La restauración en sí la hace el servidor (restaurar_snapshot(), security definer, verifica
// la membresía contra auth.uid()), y la suite corre sin conexión con sb en null, así que lo que
// se ejercita acá es todo lo que SÍ vive en el cliente: la lista, el resumen de cada versión,
// el paso de confirmación con el conteo actual, cancelar, el estado vacío, el bloqueo en modo
// demo, y el formato de las fechas. Los snapshots se inyectan en state, el mismo patrón que
// usan shot_compartir_grupo.js y shot_clasificar_ajeno.js para los datos que vienen de Supabase.
const { openApp, check, finish } = require('./lib/test_kit');

const hoyISO = (diasAtras, hora) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  d.setHours(hora, 32, 0, 0);
  return d.toISOString();
};

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- estado vacío ----------
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  const entradaExiste = await page.$('[data-menu-open="historial"]');
  check('el menú tiene la entrada "Volver a una versión anterior"', !!entradaExiste);

  await page.click('[data-menu-open="historial"]');
  await page.waitForTimeout(250);
  let txt = await page.textContent('#view-root');
  check('sin snapshots muestra el estado vacío, no una lista rota', /Todavía no hay versiones guardadas/.test(txt), txt.slice(0, 200));

  // ---------- con snapshots ----------
  // 12 transacciones ahora en memoria, contra un snapshot de 412: es justo el caso que el
  // historial tiene que resolver (un borrado en masa que se nota después).
  await page.evaluate((fechas) => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    for (let i = 0; i < 12; i++) {
      D.TRANSACTIONS.push({ id: 'h' + i, fecha: D.MONTHS[0] + '-05', hora: '10:00', comercio: 'algo',
        monto: 1000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
        categorias: [], porCobrar: [], reglaAuto: false, nota: '' });
    }
    D.state.historialSnapshots = [
      { id: 'snap-hoy',    snapshot_at: fechas[0], n_transacciones: 14,  peso_bytes: 2048 },
      { id: 'snap-ayer',   snapshot_at: fechas[1], n_transacciones: 412, peso_bytes: 305152 },
      { id: 'snap-semana', snapshot_at: fechas[2], n_transacciones: 380, peso_bytes: 1048576 },
    ];
    D.state.historialLoading = false;
    D.renderMenuView();
  }, [hoyISO(0, 14), hoyISO(1, 9), hoyISO(6, 18)]);
  await page.waitForTimeout(200);

  txt = await page.textContent('#view-root');
  check('lista las 3 versiones', (txt.match(/Restaurar esta versión/g) || []).length === 3, txt.slice(0, 400));
  check('muestra el conteo de transacciones de cada versión', /412 transacciones/.test(txt), txt.slice(0, 400));
  check('muestra el peso en KB', /298 KB/.test(txt) || /KB/.test(txt), txt.slice(0, 400));
  check('muestra el peso en MB cuando corresponde', /1\.0 MB/.test(txt), txt.slice(0, 400));
  check('fecha relativa: hoy', /hoy 14:32/.test(txt), txt.slice(0, 300));
  check('fecha relativa: ayer', /ayer 09:32/.test(txt), txt.slice(0, 300));
  check('fecha relativa y absoluta juntas para lo más viejo', /hace 6 días — \d+ \w+ 18:32/.test(txt), txt.slice(0, 400));

  // ---------- confirmación ----------
  await page.click('[data-historial-restaurar="snap-ayer"]');
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('pedir restaurar abre una confirmación, no restaura de inmediato', /Sí, restaurar/.test(txt), txt.slice(0, 400));
  check('la confirmación dice cuántas transacciones hay AHORA', /12 transacciones/.test(txt), txt.slice(0, 600));
  check('la confirmación avisa que se puede volver atrás', /puedes volver/.test(txt), txt.slice(0, 600));
  // Control positivo: la confirmación es de ESA versión y no aparece en las otras dos.
  check('solo la versión elegida entra en confirmación', (txt.match(/Sí, restaurar/g) || []).length === 1, txt.slice(0, 400));

  await page.click('[data-historial-cancelar]');
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('cancelar vuelve a la lista sin restaurar', !/Sí, restaurar/.test(txt) && (txt.match(/Restaurar esta versión/g) || []).length === 3, txt.slice(0, 400));

  // ---------- modo demo ----------
  // El historial son respaldos de datos reales; en demo sb está en null a propósito.
  await page.evaluate(() => {
    window.__debug.state.demoMode = true;
    window.__debug.renderMenuView();
  });
  await page.waitForTimeout(150);
  txt = await page.textContent('#view-root');
  check('en modo demo no muestra el historial', /No disponible en modo demo/.test(txt), txt.slice(0, 300));
  check('en modo demo no quedan botones de restaurar', !/Restaurar esta versión/.test(txt), txt.slice(0, 300));

  await browser.close();
  finish(errors);
})();
