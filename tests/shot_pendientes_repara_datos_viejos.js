// El arreglo en applyLockRule (helpers.ts, ver shot_regla_auto_confirma_pendientes.js) evita que
// una transacción quede categorizada pero atrapada en Pendientes DE AHORA EN ADELANTE -- pero no
// corrige, por sí solo, una cuenta real que YA tenía datos guardados así en Supabase desde antes
// del arreglo (el usuario reportó justo esto: "esto no se ha arreglado", tras el deploy). Este
// test simula ese escenario exacto -- un blob cargado desde Supabase con una transacción vieja
// 'pendiente' que ya tiene categoría asignada -- y confirma que applyStateBlob la sana al cargar.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const blob = D.emptyAppStateBlob();
    blob.transacciones = [
      { id: 'viejaRota', fecha: D.todayISO(), hora: '10:00', comercio: 'Copec Vieja', monto: 15000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [{ cat: 'transporte', monto: 15000 }], porCobrar: [], reglaAuto: true, nota: '' },
      { id: 'siNecesitaRevision', fecha: D.todayISO(), hora: '09:00', comercio: 'Comercio Sin Clasificar', monto: 5000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    ];
    D.applyStateBlob(blob);
    // applyStateBlob reasigna internamente TRANSACTIONS (setTransactions) -- window.__debug.
    // TRANSACTIONS queda apuntando al arreglo viejo (staleness ya documentada en otros tests),
    // así que se lee un snapshot fresco vía buildFullStateBlob (lee el TRANSACTIONS interno vivo).
    return D.buildFullStateBlob().transacciones.map(t => ({ id: t.id, estado: t.estado }));
  });

  const vieja = resultado.find(t => t.id === 'viejaRota');
  const sinClasificar = resultado.find(t => t.id === 'siNecesitaRevision');
  check('Una transacción vieja "pendiente" que ya tenía categoría se sana a "confirmado" al cargar el estado', vieja && vieja.estado === 'confirmado', vieja);
  check('Una transacción de verdad sin categoría se queda "pendiente" como corresponde (no se toca lo que sí está bien)', sinClasificar && sinClasificar.estado === 'pendiente', sinClasificar);

  await finish({ context, browser, errors });
})();
