// Bug real reportado: "en transacciones, está mal que hayan nombres by default y cuando agrego
// un nombre no se agrega". Causa: CONTACTS (state.ts) era un array fijo (const) con 4 nombres
// de ejemplo (Cata/Fran/Pancho/Mamá), NUNCA incluido en buildFullStateBlob/applyStateBlob -- así
// que siempre eran los mismos 4 nombres de la maqueta para cualquier cuenta real, y "+ agregar
// persona" (events.ts) solo empujaba el nombre nuevo al borrador de ESE reparto puntual
// (extraParticipants), nunca a CONTACTS, así que en el próximo reparto volvía a desaparecer.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- Una cuenta nueva de verdad arranca SIN los 4 nombres de la maqueta ----------
  const contactosVacios = await page.evaluate(() => window.__debug.emptyAppStateBlob().contactos);
  check('emptyAppStateBlob() no trae los 4 nombres de ejemplo de la maqueta (arranca vacío)',
    Array.isArray(contactosVacios) && contactosVacios.length === 0, contactosVacios);

  // ---------- "+ agregar persona" (flujo real, vía la UI) empuja el nombre a CONTACTS ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.TRANSACTIONS.push({ id: 'tx-test', fecha: D.todayISO(), hora: '10:00', comercio: 'Test', monto: 20000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{cat:'otros', monto:20000}], porCobrar: [], reglaAuto: false, nota: '' });
    D.state.tab = 'transacciones';
    D.state.openTxId = 'tx-test';
    D.state.creatingNew = false;
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.fill('[data-share-new-name]', 'Javiera');
  await page.click('[data-share-add-name]');
  await page.waitForTimeout(150);
  const contactosTrasAgregar = await page.evaluate(() => window.__debug.CONTACTS.slice());
  check('"+ agregar persona" (la UI real) deja el nombre nuevo en CONTACTS, no solo en el borrador del reparto',
    contactosTrasAgregar.includes('Javiera'), contactosTrasAgregar);

  // ---------- Y sobrevive un guardado+recarga real (buildFullStateBlob -> applyStateBlob) ----------
  const sobrevivioRecarga = await page.evaluate(() => {
    const D = window.__debug;
    const blob = D.buildFullStateBlob();
    D.CONTACTS = []; // simula volver a cargar la página desde cero, sin nada en memoria todavía
    D.applyStateBlob(blob);
    return D.CONTACTS.slice();
  });
  check('El nombre agregado sobrevive a un guardado+recarga real (quedó en CONTACTS de verdad, vía buildFullStateBlob/applyStateBlob)',
    sobrevivioRecarga.includes('Javiera'), sobrevivioRecarga);

  await finish({ context, browser, errors });
})();
