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
  await page.selectOption('select[data-share-pagador]', 'tu'); // volver a "Tú" para el resto del test

  // ---------- Segundo reporte: cambiar a "Por partes" seguía sin cambiar nada, y agregar a
  // alguien más no reajustaba lo que le toca pagar a cada uno ----------
  await page.click('[data-seg="division-tipo"] [data-seg-val="iguales"]');
  await page.waitForTimeout(150);
  const trasCambiarAPartes = await page.evaluate(() => ({
    valores: ['tu', 'Ana', 'Beto', 'Cami', 'Diego'].map(id => document.querySelector('[data-share-value="' + id + '"]').value),
    computados: ['tu', 'Ana', 'Beto', 'Cami', 'Diego'].map(id => document.querySelector('[data-share-computed="' + id + '"]').textContent),
  }));
  check('Cambiar a "Por partes" SÍ se nota: arranca en blanco (1 parte cada uno), no con los $20.000 de antes',
    trasCambiarAPartes.valores.every(v => v === ''), trasCambiarAPartes.valores);
  check('   y de entrada sigue siendo $20.000 cada uno (5 personas, reparto igualitario real)',
    trasCambiarAPartes.computados.every(c => c === '$20.000'), trasCambiarAPartes.computados);

  // Agregar una 6ª persona -- el total tiene que reajustarse entre las 6, no dejar a la nueva en
  // $0. "+ agregar persona" ya la deja incluida (checkbox marcado) de entrada.
  await page.fill('[data-share-new-name]', 'Elena');
  await page.click('[data-share-add-name]');
  await page.waitForTimeout(150);
  const conElena = await page.evaluate(() => ({
    elenaIncluida: document.querySelector('[data-share-include="Elena"]').checked,
    computados: ['tu', 'Ana', 'Beto', 'Cami', 'Diego', 'Elena'].map(id => document.querySelector('[data-share-computed="' + id + '"]')?.textContent),
    total: Array.from(document.querySelectorAll('.split-remaining')).find(e => e.textContent.includes('Total repartido'))?.textContent,
  }));
  // splitByShares reparte 100.000/6 = $16.666,67 -> $16.667 para los primeros 5 (redondeo normal),
  // y la última persona del orden (Elena, la recién agregada) se lleva el resto exacto ($16.665)
  // para que la suma calce a la moneda -- por eso no son 6 cifras idénticas.
  check('Agregar a Elena la deja incluida de entrada (no hay que marcarla a mano)', conElena.elenaIncluida === true, conElena);
  check('Agregar a Elena reajusta el monto de TODOS (ya no $20.000 fijo): $16.667 x5 + $16.665 la última, no $0 para la nueva',
    conElena.computados.slice(0,5).every(c => c === '$16.667') && conElena.computados[5] === '$16.665', conElena.computados);
  check('   y el total repartido sigue calzando exacto con los $100.000 de la transacción',
    conElena.total && conElena.total.includes('de $100.000'), conElena.total);

  // ---------- Tercer reporte: "debería ser también para % y monto fijo", no solo por partes ----------
  await page.click('[data-share-cancel]');
  await page.waitForTimeout(100);
  await page.click('#sheet-close, .sheet-close');
  await page.waitForTimeout(150);

  await page.evaluate(() => {
    const D = window.__debug;
    D.CONTACTS = [];
    D.TRANSACTIONS.push({
      id: 'txMontoFijo', fecha: D.todayISO(), hora: '11:00', comercio: 'Cena Monto Fijo', monto: 30000, medio: 'visa_bch',
      tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 30000 }],
      porCobrar: [], reglaAuto: false, nota: ''
    });
    D.state.openTxId = 'txMontoFijo';
    D.state.creatingNew = false;
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.fill('[data-share-new-name]', 'Fran');
  await page.click('[data-share-add-name]');
  await page.waitForTimeout(150);
  await page.click('[data-seg="division-tipo"] [data-seg-val="montos"]');
  await page.waitForTimeout(150);
  // "Tú" y Fran ya vienen sembrados en $15.000 c/u (mitad y mitad) al cambiar a "Monto fijo" --
  // valores explícitos en el input (no en blanco), así que todavía no hay lectura "computada".
  const antesDeAgregar = await page.evaluate(() => ['tu', 'Fran'].map(id => document.querySelector('[data-share-value="' + id + '"]').value));
  check('"Monto fijo" con 2 personas arranca en $15.000/$15.000 (mitad y mitad de $30.000)', antesDeAgregar.every(v => v === '15000'), antesDeAgregar);
  await page.fill('[data-share-new-name]', 'Gaby');
  await page.click('[data-share-add-name]');
  await page.waitForTimeout(150);
  const conGabyMontoFijo = await page.evaluate(() => ['tu', 'Fran', 'Gaby'].map(id => document.querySelector('[data-share-computed="' + id + '"]')?.textContent));
  check('En "Monto fijo", agregar a Gaby SÍ reajusta a los 3 a $10.000 c/u (30.000/3), no la deja en $0 con los otros en $15.000',
    conGabyMontoFijo.every(c => c === '$10.000'), conGabyMontoFijo);

  // ---------- Lo mismo, en "Por %" ----------
  await page.click('[data-share-cancel]');
  await page.waitForTimeout(100);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.click('[data-share-include="Fran"]');
  await page.waitForTimeout(100);
  await page.click('[data-seg="division-tipo"] [data-seg-val="pct"]');
  await page.waitForTimeout(150);
  await page.fill('[data-share-new-name]', 'Hugo');
  await page.click('[data-share-add-name]');
  await page.waitForTimeout(150);
  const conHugoPct = await page.evaluate(() => ['tu', 'Fran', 'Hugo'].map(id => document.querySelector('[data-share-computed="' + id + '"]')?.textContent));
  check('En "Por %", agregar a Hugo también reajusta a los 3 a $10.000 c/u (30.000/3), no lo deja en $0',
    conHugoPct.every(c => c === '$10.000'), conHugoPct);

  await finish({ context, browser, errors });
})();
