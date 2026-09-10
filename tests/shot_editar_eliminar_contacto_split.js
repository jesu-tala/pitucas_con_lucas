// Pedido real: "en dividir este gasto necesito poder editar a las personas agregadas (eliminar
// o editar) y veo que cuando agrego a alguien queda como default, lo que necesito es que si no
// hay nada asignado a esa persona entonces si la elimino se vaya del default sin eliminar gastos
// ya asignados a esa persona". Se agregan editar/quitar por persona (icono lápiz/basurero) en
// "Dividir este gasto" (sin grupo) -- solo para contactos (no para "Tú"), y quitar a alguien de
// CONTACTS nunca toca TRANSACTIONS: no borra ningún reparto ya guardado en otra transacción.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.CONTACTS = ['Nacho', 'Sole'];
    D.TRANSACTIONS.push(
      // Vieja: ya tiene un reparto guardado con "Nacho" -- debe sobrevivir intacto.
      { id: 'txVieja', fecha: '2026-08-01', hora: '10:00', comercio: 'Cena vieja', monto: 20000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 20000 }], porCobrar: [{ persona: 'Nacho', monto: 10000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      // Nueva: la que se va a abrir para dividir ahora.
      { id: 'txNueva', fecha: D.todayISO(), hora: '10:00', comercio: 'Cena nueva', monto: 30000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 30000 }], porCobrar: [], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'transacciones';
    D.state.openTxId = 'txNueva';
    D.state.creatingNew = false;
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);

  const filas = await page.evaluate(() => ({
    editarTu: !!document.querySelector('[data-open-edit-contact="tu"]'),
    editarNacho: !!document.querySelector('[data-open-edit-contact="Nacho"]'),
    eliminarNacho: !!document.querySelector('[data-ask-delete-contact="Nacho"]'),
  }));
  check('"Tú" NO tiene botón de editar/eliminar (no te puedes quitar a ti mismo)', filas.editarTu === false, filas);
  check('Un contacto (Nacho) SÍ tiene botones de editar y eliminar', filas.editarNacho && filas.eliminarNacho, filas);

  // ---------- Editar: renombrar "Nacho" -> "Ignacio" ----------
  await page.click('[data-open-edit-contact="Nacho"]');
  await page.waitForTimeout(100);
  await page.fill('[data-edit-contact-name]', 'Ignacio');
  await page.click('[data-save-edit-contact="Nacho"]');
  await page.waitForTimeout(150);
  const trasRenombrar = await page.evaluate(() => window.__debug.CONTACTS.slice());
  check('Renombrar actualiza CONTACTS (Nacho -> Ignacio)', trasRenombrar.includes('Ignacio') && !trasRenombrar.includes('Nacho'), trasRenombrar);

  // ---------- Eliminar: quitar "Ignacio" de la lista ----------
  await page.click('[data-ask-delete-contact="Ignacio"]');
  await page.waitForTimeout(100);
  const pideConfirmacion = await page.evaluate(() => document.body.textContent.includes('¿Quitar a'));
  check('Antes de eliminar, pide confirmación explícita', pideConfirmacion);
  await page.click('[data-confirm-delete-contact="Ignacio"]');
  await page.waitForTimeout(150);
  const trasEliminar = await page.evaluate(() => window.__debug.CONTACTS.slice());
  check('Confirmar elimina a "Ignacio" de CONTACTS (la lista default)', !trasEliminar.includes('Ignacio'), trasEliminar);
  check('"Sole" (que no se tocó) sigue en CONTACTS', trasEliminar.includes('Sole'), trasEliminar);

  const yaNoFila = await page.evaluate(() => !document.querySelector('[data-open-edit-contact="Ignacio"]'));
  check('La fila de "Ignacio" ya no aparece en el picker de "dividir este gasto"', yaNoFila);

  // ---------- Lo más importante: el gasto YA repartido con "Nacho" en otra transacción no se toca ----------
  const porCobrarVieja = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'txVieja').porCobrar);
  check('El reparto viejo con "Nacho" (otra transacción) sigue intacto -- eliminar del default NO borra gastos ya asignados',
    porCobrarVieja.length === 1 && porCobrarVieja[0].persona === 'Nacho' && porCobrarVieja[0].monto === 10000, porCobrarVieja);

  await finish({ context, browser, errors });
})();
