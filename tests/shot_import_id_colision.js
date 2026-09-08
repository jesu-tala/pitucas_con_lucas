// Bug real reportado: "cuando corro el script varias veces la data empieza a enloquecer, por
// ejemplo aprieto el gasto de la Clínica Alemana de $1.600 y me aparece Virtual el Muro con
// datos de $9.000". Causa raíz en applyStateBlob() (supabase.ts), que corre cada vez que se
// recarga/inicia sesión en la app: nextImportId() (state.ts) es UN SOLO contador compartido por
// tres orígenes de transacción -- 'timp'+n (CSV de cartola), 'trec'+n (reconciliar con cartola)
// y 'temail'+n (importar desde el correo, ver txFromEmailImport) -- pero la restauración del
// contador al cargar solo miraba ids "timp", ignorando "trec"/"temail" -- así que para un hogar
// como este (casi todo llega por correo) el contador SIEMPRE se restauraba en 0 al recargar, y
// la siguiente tanda de correos importados volvía a generar ids YA USADOS por transacciones
// viejas ("temail1", "temail2"...). Como getTx()/TRANSACTIONS.find(t=>t.id===id) devuelve la
// PRIMERA que encuentra, dos transacciones con el mismo id significan que tocar una en la lista
// puede abrir el detalle de la otra.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Simula exactamente el escenario real: ya existen transacciones importadas por correo con
  // ids altos (temail1..temail7, mezcladas con alguna 'trec'/'timp' de otros orígenes), y la app
  // se "recarga" (aplicando un blob de estado guardado, como hace applyStateBlob en cada login).
  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const fixture = [
      { id: 'temail1', fecha: '2026-08-01', hora: '09:00', comercio: 'Clínica Alemana', monto: 1600, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [] },
      { id: 'temail2', fecha: '2026-08-02', hora: '10:00', comercio: 'Copec', monto: 30000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [] },
      { id: 'trec1', fecha: '2026-08-03', hora: '11:00', comercio: 'Reconciliado X', monto: 5000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [] },
      { id: 'timp1', fecha: '2026-08-04', hora: '12:00', comercio: 'CSV Y', monto: 8000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [] },
      { id: 'temail7', fecha: '2026-08-05', hora: '13:00', comercio: 'Virtual el Muro', monto: 9000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [] },
    ];
    // Simula un login/recarga real: applyStateBlob() es lo que corre cada vez, y es ahí donde
    // vivía el bug (restauraba mal el contador a partir de esta misma lista).
    D.applyStateBlob({ transacciones: fixture });

    // Ahora "importa" una transacción nueva desde el correo, igual que absorbImportedRows().
    const nuevoId = 'temail' + D.nextImportId();
    D.TRANSACTIONS.unshift({
      id: nuevoId, fecha: '2026-09-08', hora: '08:00', comercio: 'Farmacia Nueva',
      monto: 4500, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: []
    });

    return {
      nuevoId,
      hayColision: D.TRANSACTIONS.filter(t => t.id === nuevoId).length > 1,
      totalConEseId: D.TRANSACTIONS.filter(t => t.id === nuevoId).length,
    };
  });

  check('Tras "recargar" con transacciones temail1..temail7 (y trec1/timp1), la siguiente importada saca un id NUEVO (temail8) -- el contador se restauró en 7, el máximo real, no en 0',
    resultado.nuevoId === 'temail8', resultado);
  check('No hay dos transacciones distintas con el mismo id (la colisión real reportada)', resultado.hayColision === false && resultado.totalConEseId === 1, resultado);

  // Verificación end-to-end del síntoma exacto que describió: tocar "Clínica Alemana $1.600" en
  // la lista debe abrir SU detalle, no el de otra transacción con un id que coincida.
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tx-item'));
    const el = items.find(i => i.textContent.includes('Clínica Alemana'));
    el.click();
  });
  await page.waitForTimeout(200);
  const detalle = await page.evaluate(() => document.getElementById('sheet-content').textContent);
  check('Tocar "Clínica Alemana" abre SU detalle ($1.600), no el de otra transacción', detalle.includes('Clínica Alemana') && detalle.includes('1.600') && !detalle.includes('Virtual el Muro'), detalle);

  await finish({ context, browser, errors });
})();
