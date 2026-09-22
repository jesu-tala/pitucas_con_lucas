// Una transacción importada del correo traía 'Importado automáticamente desde tu correo' en la
// nota como VALOR guardado. Para escribir algo propio había que borrarlo primero: el campo
// llegaba ocupado por texto que la persona nunca escribió.
//
// Ahora ese texto es el PLACEHOLDER del campo (guía en gris) y la nota nace vacía. El dato de que
// vino del mail no se pierde: lo registran importadoEmail/origen, y el detalle ya muestra su
// propia tarjeta "Importada desde tu correo".
//
// El test fija las tres mitades: que la nota nazca vacía, que el placeholder aparezca solo en las
// importadas, y que las transacciones YA guardadas con el texto viejo se sanen -- sin pisar una
// nota que la persona haya editado.
const { openApp, check, finish } = require('./lib/test_kit');

const NOTA_VIEJA = 'Importado automáticamente desde tu correo';

(async () => {
  const { context, browser, page, errors } = await openApp();

  const campo = () => page.evaluate(() => {
    const el = document.querySelector('[data-tx-field="nota"]');
    return el ? { value: el.value, placeholder: el.getAttribute('placeholder') } : null;
  });
  const abrir = async (id) => { await page.click('[data-tx="' + id + '"]'); await page.waitForTimeout(200); };
  const cerrar = async () => { await page.click('[data-close-sheet-done]'); await page.waitForTimeout(150); };

  await page.evaluate(() => {
    const D = window.__debug;
    const hoy = D.todayISO();
    D.TRANSACTIONS.length = 0;
    const base = (id, extra) => Object.assign({ id, fecha: hoy, hora: '10:00', comercio: 'Comercio ' + id,
      monto: 5000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'supermercado', monto: 5000 }], porCobrar: [], reglaAuto: false, nota: '' }, extra);
    D.TRANSACTIONS.push(base('imp', { importadoEmail: true, origen: 'auto-mail' }));   // importada, nota vacía
    D.TRANSACTIONS.push(base('manual', {}));                                            // hecha a mano
    D.state.tab = 'transacciones'; D.state.filter = 'todas'; D.render();
  });
  await page.waitForTimeout(150);

  await abrir('imp');
  const imp = await campo();
  check('en una importada, la nota llega VACÍA (no hay que borrar nada para escribir)', imp && imp.value === '', imp);
  check('   y el texto del import aparece como placeholder, en gris', imp && imp.placeholder === NOTA_VIEJA, imp);
  await cerrar();

  await abrir('manual');
  const man = await campo();
  check('en una hecha a mano el placeholder sigue siendo el de siempre', man && man.placeholder === 'Agregar notas personales', man);
  await cerrar();

  // ---- Las que YA estaban guardadas con el texto viejo ----
  const migracion = await page.evaluate(() => {
    const D = window.__debug;
    const NOTA = 'Importado automáticamente desde tu correo';
    const t = D.TRANSACTIONS.find(x => x.id === 'imp');
    const otra = D.TRANSACTIONS.find(x => x.id === 'manual');
    t.nota = NOTA;                                  // como quedó guardada antes del cambio
    otra.importadoEmail = true;
    otra.nota = NOTA + ' — pero yo le agregué esto';  // editada por la persona: NO se toca
    D.applyStateBlob(D.buildFullStateBlob());        // el camino real por donde pasa la migración
    // OJO: no se puede leer D.TRANSACTIONS acá. setTransactions() REASIGNA el array
    // (TRANSACTIONS = v) y el puente de debug expone la referencia que existía cuando se armó,
    // así que después de applyStateBlob D.TRANSACTIONS apunta al array VIEJO y muestra los
    // valores de antes de la migración. buildFullStateBlob() en cambio lee el binding vivo del
    // módulo, así que refleja lo que la app tiene de verdad.
    const vivas = D.buildFullStateBlob().transacciones;
    return {
      importadaLimpia: vivas.find(x => x.id === 'imp').nota,
      editadaIntacta: vivas.find(x => x.id === 'manual').nota
    };
  });
  check('una importada ya guardada con el texto viejo queda con la nota vacía', migracion.importadaLimpia === '', migracion);
  check('   pero una nota que la persona editó NO se toca (solo se borra el texto que puso la app)',
    migracion.editadaIntacta === NOTA_VIEJA + ' — pero yo le agregué esto', migracion);

  await finish({ context, browser, errors });
})();
