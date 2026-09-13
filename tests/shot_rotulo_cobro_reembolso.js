// Bug 1: el cuadro de pendientes decía siempre "Cobros y reembolsos pendientes", aunque solo
// aplicara uno de los dos. "Por cobrar a alguien" (persona) y "Reembolso pendiente" (reembolso)
// son dos flags independientes marcables desde Acciones rápidas -- el rótulo debe reflejar
// exactamente cuáles de las dos hay marcadas:
//   solo cobro -> "Cobros pendientes"
//   solo reembolso -> "Reembolso pendiente"
//   ambos -> "Cobros y reembolsos pendientes"
//   ninguno -> el cuadro ni se muestra
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.CONTACTS = [];
    D.TRANSACTIONS.push({ id: 'txRotulo', fecha: D.todayISO(), hora: '10:00', comercio: 'Cena', monto: 30000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 30000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.state.openTxId = 'txRotulo';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);

  const tituloActual = () => page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.sheet-block-title')).find(e =>
      /^(Cobros pendientes|Reembolso pendiente|Cobros y reembolsos pendientes)$/.test(e.textContent.trim())
    );
    return el ? el.textContent.trim() : null;
  });

  // ---------- Ninguno marcado: el cuadro ni se muestra ----------
  check('(ninguno) Sin nada marcado, el cuadro de pendientes no aparece', await tituloActual() === null);

  // ---------- Solo "por cobrar" ----------
  await page.click('[data-action="porcobrar_persona"][data-tx="txRotulo"]');
  await page.waitForTimeout(150);
  await page.fill('[data-share-new-name]', 'Fran');
  await page.click('[data-share-add-name]');
  await page.waitForTimeout(150);
  await page.click('[data-share-confirm="txRotulo"]');
  await page.waitForTimeout(150);
  check('(solo cobro) El rótulo dice "Cobros pendientes"', await tituloActual() === 'Cobros pendientes');

  // ---------- Agregar también "reembolso pendiente" -> ambos ----------
  await page.click('[data-action="porcobrar_reembolso"][data-tx="txRotulo"]');
  await page.waitForTimeout(150);
  check('(ambos) Con cobro Y reembolso marcados, el rótulo dice "Cobros y reembolsos pendientes"', await tituloActual() === 'Cobros y reembolsos pendientes');

  // ---------- Quitar el cobro, dejando solo el reembolso ----------
  await page.click('[data-action="porcobrar_persona"][data-tx="txRotulo"]');
  await page.waitForTimeout(150);
  check('(solo reembolso) Al quitar el cobro, el rótulo dice "Reembolso pendiente"', await tituloActual() === 'Reembolso pendiente');

  // ---------- Quitar también el reembolso -> vuelve a no mostrarse ----------
  await page.click('[data-action="porcobrar_reembolso"][data-tx="txRotulo"]');
  await page.waitForTimeout(150);
  check('(ninguno de nuevo) Al quitar ambos, el cuadro vuelve a no aparecer', await tituloActual() === null);

  await finish({ context, browser, errors });
})();
