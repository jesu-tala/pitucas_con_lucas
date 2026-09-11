// Reporte real: "agregué 10 personas para repartir el gasto, lo guardé, y cuando lo quise editar
// no se actualizó el monto a repartir y a partes en vez de ver partes se veía el monto $".
// Causa: draftFromExistingSplit (shared-expenses.ts) reconstruía un reparto "por partes" sin
// sembrar el "número de partes" de "Tú" (el pagador) -- solo el de las otras personas, con su
// monto en pesos crudo -- así que el input de partes mostraba un número de pesos sin sentido, y
// la suma de pesos ya no daba el total real (a "Tú" le tocaba un peso mínimo por defecto). Ahora
// "por partes" se reabre como "Monto fijo" (siempre exacto y legible), sembrando el monto
// implícito de "Tú" también. Además, "¿Quién pagó?" pasa de fila de botones a <select> -- con
// varias personas la fila de botones se desborda.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Una transacción de $100.000 repartida "por partes" entre "Tú" y 4 personas más (imitando el
  // problema real con muchas personas), con $20.000 c/u -- solo se guardan las OTRAS 4 en
  // porCobrar (así queda un reparto real, como lo dejaría commitPersonaSplit).
  await page.evaluate(() => {
    const D = window.__debug;
    D.CONTACTS = []; // no arrastrar los 4 nombres de ejemplo de la maqueta al <select>
    D.TRANSACTIONS.push({
      id: 'txMuchos', fecha: D.todayISO(), hora: '10:00', comercio: 'Asado', monto: 100000, medio: 'visa_bch',
      tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', divisionTipo: 'iguales',
      categorias: [{ cat: 'restoranes', monto: 100000 }],
      porCobrar: [
        { persona: 'Ana', monto: 20000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null },
        { persona: 'Beto', monto: 20000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null },
        { persona: 'Cami', monto: 20000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null },
        { persona: 'Diego', monto: 20000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }
      ],
      reglaAuto: false, nota: ''
    });
    D.state.tab = 'transacciones';
    D.state.openTxId = 'txMuchos';
    D.state.creatingNew = false;
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-charge-split-open="txMuchos"]');
  await page.waitForTimeout(150);

  const draft = await page.evaluate(() => window.__debug.state.shareDraft);
  check('Al reabrir un reparto "por partes", pasa a mostrarse como "Monto fijo" (no como "por partes")', draft.divisionTipo === 'montos', draft);
  check('El monto implícito de "Tú" también quedó sembrado ($20.000, no vacío/0)', draft.customValues['tu'] === '20000', draft.customValues);

  const totales = await page.evaluate(() => {
    // .split-remaining también lo usa, más arriba en el mismo sheet, el bloque de categorías
    // ("Por asignar") -- hay que buscar específicamente el del reparto ("Total repartido").
    const el = Array.from(document.querySelectorAll('.split-remaining')).find(e => e.textContent.includes('Total repartido'));
    return el ? el.textContent : null;
  });
  check('"Total repartido" calza exacto con el monto real de la transacción ($100.000 de $100.000)', totales && totales.includes('$100.000 de $100.000'), totales);

  const guardarHabilitado = await page.evaluate(() => {
    const btn = document.querySelector('[data-share-confirm="txMuchos"]');
    return btn && !btn.disabled;
  });
  check('"Guardar reparto" queda habilitado (el reparto reabierto ya calza solo, sin tocar nada)', guardarHabilitado);

  // ---------- "¿Quién pagó?" ahora es un <select>, no una fila de botones ----------
  const pagadorUI = await page.evaluate(() => ({
    esSelect: !!document.querySelector('select[data-share-pagador]'),
    opciones: Array.from(document.querySelectorAll('select[data-share-pagador] option')).map(o => o.textContent),
    yaNoEsSegmented: !document.querySelector('[data-seg="compartir-pagador"]'),
  }));
  check('"¿Quién pagó?" es un <select> desplegable', pagadorUI.esSelect, pagadorUI);
  check('   con una opción por cada persona (Tú + las 4 agregadas)', pagadorUI.opciones.length === 5, pagadorUI.opciones);
  check('   y ya no queda la fila de botones vieja', pagadorUI.yaNoEsSegmented);

  await page.selectOption('select[data-share-pagador]', 'Beto');
  await page.waitForTimeout(100);
  const pagadorTrasElegir = await page.evaluate(() => window.__debug.state.shareDraft.pagadoPorId);
  check('Elegir a alguien del <select> actualiza quién pagó', pagadorTrasElegir === 'Beto', pagadorTrasElegir);

  await finish({ context, browser, errors });
})();
