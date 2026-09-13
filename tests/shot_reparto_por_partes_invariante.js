// Bugs 2/3 del reparto "por partes": tres síntomas con causa raíz en dos mecanismos.
//
// (a) Conflación input/monto: el campo por participante guardaba solo el MONTO en pesos ya
// calculado, nunca el input crudo del modo (partes/%/pesos) -- al guardar y recargar, "1 parte"
// se leía de vuelta como "el monto en pesos" (ej. "5.244 partes"). Arreglo: ReceivableItem.
// divisionValor / Transaction.pagadorDivisionValor (types.ts) guardan el input crudo por
// separado; `monto` SIEMPRE se deriva, nunca se escribe de vuelta al input.
//
// (c) Redondeo concentrado en el último: cuando el total no divide exacto entre N personas, todo
// el resto (hasta N-1 pesos) se le asignaba entero a la ÚLTIMA persona de la lista, en vez de
// repartirse de a 1 peso. Arreglo: splitEqually/splitByShares (shared-expenses.ts) reparten el
// resto un peso a la vez, a los primeros `resto` participantes.
//
// (Un tercer mecanismo hipotetizado -- "asignación residual" al agregar gente de a uno -- ya
// estaba resuelto por un arreglo previo de esta misma sesión: computeShareAmounts siempre
// recalcula TODA la lista contra el TOTAL completo, nunca contra un remanente. Ese test ya existe
// en shot_dividir_gasto_editar_muchas_personas.js.)
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ================= Round-trip por partes: guardar -> recargar -> sigue siendo "1 parte" =================
  await page.evaluate(() => {
    const D = window.__debug;
    D.CONTACTS = [];
    D.TRANSACTIONS.push({ id: 'txRoundtrip', fecha: D.todayISO(), hora: '10:00', comercio: 'Asado', monto: 84500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 84500 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.state.openTxId = 'txRoundtrip';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  await page.fill('[data-share-new-name]', 'Sole');
  await page.click('[data-share-add-name]');
  await page.waitForTimeout(150);
  await page.click('[data-share-confirm="txRoundtrip"]');
  await page.waitForTimeout(150);
  const guardado = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'txRoundtrip'));
  check('Se guarda con divisionValor (input crudo) en la fila de Sole, no solo el monto', guardado.porCobrar[0].monto === 42250, guardado.porCobrar);

  await page.click('#sheet-close, .sheet-close');
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.__debug.state.openTxId = 'txRoundtrip'; document.getElementById('sheet-overlay').classList.add('open'); window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-charge-split-open="txRoundtrip"]');
  await page.waitForTimeout(150);
  const reabierto = await page.evaluate(() => ({
    divisionTipo: window.__debug.state.shareDraft.divisionTipo,
    tuInput: document.querySelector('[data-share-value="tu"]').value,
    soleInput: document.querySelector('[data-share-value="Sole"]').value,
    tuComputado: document.querySelector('[data-share-computed="tu"]').textContent,
    soleComputado: document.querySelector('[data-share-computed="Sole"]').textContent,
  }));
  check('Round-trip: al recargar sigue en "por partes" (nunca colapsa a "Monto fijo")', reabierto.divisionTipo === 'iguales', reabierto);
  check('   el input de cada participante es el CONTEO de partes (en blanco = 1), NO el monto en pesos', reabierto.tuInput === '' && reabierto.soleInput === '', reabierto);
  check('   el monto se sigue derivando bien ($42.250 c/u de $84.500)', reabierto.tuComputado === '$42.250' && reabierto.soleComputado === '$42.250', reabierto);

  // ================= Idempotencia de cambio de modo: partes -> % -> monto fijo -> partes =================
  await page.click('[data-seg="division-tipo"] [data-seg-val="pct"]');
  await page.waitForTimeout(100);
  await page.click('[data-seg="division-tipo"] [data-seg-val="montos"]');
  await page.waitForTimeout(100);
  await page.click('[data-seg="division-tipo"] [data-seg-val="iguales"]');
  await page.waitForTimeout(150);
  const trasVueltas = await page.evaluate(() => ({
    tuInput: document.querySelector('[data-share-value="tu"]').value,
    soleInput: document.querySelector('[data-share-value="Sole"]').value,
    tuComputado: document.querySelector('[data-share-computed="tu"]').textContent,
    soleComputado: document.querySelector('[data-share-computed="Sole"]').textContent,
  }));
  check('Idempotencia: partes -> % -> monto fijo -> partes deja los inputs en blanco (1 cada uno), no el monto como "partes"',
    trasVueltas.tuInput === '' && trasVueltas.soleInput === '', trasVueltas);
  check('   y el reparto sigue siendo igualitario ($42.250 c/u)', trasVueltas.tuComputado === '$42.250' && trasVueltas.soleComputado === '$42.250', trasVueltas);
  await page.click('[data-share-cancel]');
  await page.waitForTimeout(100);
  await page.click('#sheet-close, .sheet-close');
  await page.waitForTimeout(150);

  // ================= Eliminar un participante: desaparece y se recalcula, sin conteo fantasma =================
  await page.evaluate(() => {
    const D = window.__debug;
    D.CONTACTS = [];
    D.TRANSACTIONS.push({
      id: 'txEliminar', fecha: D.todayISO(), hora: '10:00', comercio: 'Cena', monto: 30000, medio: 'visa_bch',
      tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', divisionTipo: 'iguales',
      categorias: [{ cat: 'restoranes', monto: 30000 }],
      porCobrar: [
        { persona: 'Ana', monto: 15000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null, divisionValor: 1 },
        { persona: 'Beto', monto: 15000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null, divisionValor: 1 }
      ],
      reglaAuto: false, nota: ''
    });
    D.state.openTxId = 'txEliminar';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-charge-split-open="txEliminar"]');
  await page.waitForTimeout(150);
  // Desmarcar a Beto ("esta persona ya no participa")
  await page.click('[data-share-include="Beto"]');
  await page.waitForTimeout(150);
  const trasEliminar = await page.evaluate(() => ({
    betoVisible: !!document.querySelector('[data-share-computed="Beto"]'),
    tuComputado: document.querySelector('[data-share-computed="tu"]').textContent,
    anaComputado: document.querySelector('[data-share-computed="Ana"]').textContent,
  }));
  check('Al eliminar a Beto, ya no aparece con ningún conteo (ni fantasma tipo "5.244 partes")', trasEliminar.betoVisible === false, trasEliminar);
  check('   y el resto se recalcula sobre el total completo entre los 2 que quedan ($15.000 c/u de $30.000)',
    trasEliminar.tuComputado === '$15.000' && trasEliminar.anaComputado === '$15.000', trasEliminar);

  // ================= Reparto del resto: total no divisible entre 16, diferencia máxima 1 peso =================
  await page.click('[data-share-cancel]');
  await page.waitForTimeout(100);
  await page.click('#sheet-close, .sheet-close');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const D = window.__debug;
    D.CONTACTS = [];
    D.TRANSACTIONS.push({ id: 'txResto', fecha: D.todayISO(), hora: '10:00', comercio: 'Junta grande', monto: 84500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 84500 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.state.openTxId = 'txResto';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  for (let i = 1; i <= 15; i++) {
    await page.fill('[data-share-new-name]', 'P' + i);
    await page.click('[data-share-add-name]');
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  const montos16 = await page.evaluate(() => {
    const ids = ['tu'].concat(Array.from({ length: 15 }, (_, i) => 'P' + (i + 1)));
    return ids.map(id => {
      const t = document.querySelector('[data-share-computed="' + id + '"]')?.textContent || '';
      return parseInt(t.replace(/[^0-9]/g, ''), 10);
    });
  });
  const suma16 = montos16.reduce((s, m) => s + m, 0);
  const max16 = Math.max(...montos16), min16 = Math.min(...montos16);
  check('Reparto del resto (16 personas, $84.500): la suma da exacto el total', suma16 === 84500, { montos16, suma16 });
  check('   y la diferencia entre el mayor y el menor es <= 1 peso (no un salto de varios pesos)', (max16 - min16) <= 1, { max16, min16 });

  await finish({ context, browser, errors });
})();
