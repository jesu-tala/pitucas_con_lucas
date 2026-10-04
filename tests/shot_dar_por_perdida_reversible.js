// "Dar por perdida" un cobro que la otra persona nunca pagó: arregla un doble conteo y pasa a
// ser reversible.
//
// EL BUG DE PLATA: writeOffReceivable borraba la fila de porCobrar Y creaba el gasto nuevo.
// Cada cosa por sí sola da el resultado correcto; juntas contaban el monto dos veces. Una cena
// de $10.000 donde Fran no pagó sus $5.000 quedaba registrada como $15.000 de gastos: quitar la
// fila hacía que la cena pasara de $5.000 (tu parte) a $10.000 netos, y encima aparecía un
// gasto extra de $5.000.
//
// LA VERDAD CONTABLE, que es el invariante de este archivo: si la otra persona no paga, esa
// cena te costó exactamente lo que pagaste, $10.000. Ni $5.000 (ignorar la pérdida) ni $15.000
// (contarla dos veces).
//
// Y COMO SE VUELVE REVERSIBLE: la fila ya no se borra, solo se marca con perdidaTxId. Como sus
// datos quedan intactos, deshacerlo no reconstruye nada -- borra el gasto que se creó y saca la
// marca. Antes era imposible: con la fila se iban la persona y el monto.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({ id: 'cena', fecha: mes + '-05', hora: '21:00', comercio: 'Cena con Fran',
      monto: 10000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'restoranes', monto: 10000 }],
      porCobrar: [{ tipo: 'persona', persona: 'Fran', monto: 5000, pagado: false }],
      reglaAuto: false, nota: '' });

    const anio = () => D.yearTotals(2026).gastos;
    const tx = () => D.TRANSACTIONS.find(t => t.id === 'cena');
    const fila = () => tx().porCobrar[0];

    const antes = { anio: anio(), neto: D.netExpenseTx(tx()), cobrado: D.allCollected(tx()), n: D.TRANSACTIONS.length };
    const ok = D.writeOffReceivable('cena', 0);
    const despues = { anio: anio(), neto: D.netExpenseTx(tx()), cobrado: D.allCollected(tx()),
      n: D.TRANSACTIONS.length, fila: fila() ? { persona: fila().persona, monto: fila().monto, perdidaTxId: fila().perdidaTxId } : null,
      hayPerdida: D.TRANSACTIONS.some(t => /^perdida-/.test(t.id)) };
    const okUndo = D.deshacerWriteOff('cena', 0);
    const trasDeshacer = { anio: anio(), neto: D.netExpenseTx(tx()), cobrado: D.allCollected(tx()),
      n: D.TRANSACTIONS.length, fila: fila() ? { persona: fila().persona, monto: fila().monto, perdidaTxId: fila().perdidaTxId } : null,
      hayPerdida: D.TRANSACTIONS.some(t => /^perdida-/.test(t.id)) };
    return { bruto: 10000, antes, ok, despues, okUndo, trasDeshacer };
  });

  // ---------- controles positivos ----------
  check('(control) antes, la cena cuesta solo tu parte', r.antes.anio === 5000 && r.antes.neto === 5000, r.antes);
  check('(control) darla por perdida se ejecutó', r.ok === true, r);
  check('(control) darla por perdida creó el gasto de la pérdida', r.despues.hayPerdida === true, r.despues);

  // ---------- el invariante: cuánto te costó de verdad ----------
  check('tras darla por perdida, la cena cuesta lo que pagaste, no el doble',
    r.despues.anio === r.bruto, { anio: r.despues.anio, esperado: r.bruto });
  // Dicho al revés, que es como se veía el bug: $15.000 por una cena de $10.000.
  check('NO se cuenta dos veces la parte no pagada', r.despues.anio !== 15000, r.despues);
  // Y la cena en sí no se infla: tu parte sigue siendo tu parte, la pérdida es un gasto aparte.
  check('la cena original sigue valiendo tu parte', r.despues.neto === 5000, r.despues);

  // ---------- la fila se conserva ----------
  check('la fila del cobro NO se borra', r.despues.fila !== null, r.despues);
  check('conserva la persona y el monto originales',
    r.despues.fila && r.despues.fila.persona === 'Fran' && r.despues.fila.monto === 5000, r.despues.fila);
  check('queda marcada con el gasto que generó', !!(r.despues.fila && r.despues.fila.perdidaTxId), r.despues.fila);
  // Sin esto la transacción quedaba para siempre en los filtros de "por cobrar", pidiendo cobrar
  // una plata que ya se asumió como perdida.
  check('deja de contar como pendiente de cobro', r.despues.cobrado === true, r.despues);

  // ---------- deshacer ----------
  check('(control) deshacerlo se ejecutó', r.okUndo === true, r);
  check('deshacerlo borra el gasto de la pérdida', r.trasDeshacer.hayPerdida === false, r.trasDeshacer);
  check('deshacerlo devuelve la cuenta a como estaba', r.trasDeshacer.anio === r.antes.anio, { antes: r.antes.anio, despues: r.trasDeshacer.anio });
  check('deshacerlo deja el cobro pendiente otra vez', r.trasDeshacer.cobrado === false, r.trasDeshacer);
  check('deshacerlo no perdió los datos del cobro',
    r.trasDeshacer.fila && r.trasDeshacer.fila.persona === 'Fran' && r.trasDeshacer.fila.monto === 5000 && !r.trasDeshacer.fila.perdidaTxId,
    r.trasDeshacer.fila);
  check('la ida y vuelta no deja transacciones de más', r.trasDeshacer.n === r.antes.n, { antes: r.antes.n, despues: r.trasDeshacer.n });

  // ---------- la vuelta completa por la interfaz ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('.tx-item[data-tx="cena"]');
  await page.waitForTimeout(250);
  let sheet = await page.textContent('.sheet-content, #sheet');
  check('el detalle ofrece darla por perdida', /Dar por perdida/.test(sheet), sheet.slice(0, 400));

  await page.click('[data-write-off="0"]');
  await page.waitForTimeout(250);
  sheet = await page.textContent('.sheet-content, #sheet');
  check('tras darla por perdida, el detalle ofrece deshacerlo', /volver a dejarla pendiente/.test(sheet), sheet.slice(0, 500));

  await page.click('[data-undo-write-off="0"]');
  await page.waitForTimeout(250);
  sheet = await page.textContent('.sheet-content, #sheet');
  check('tras deshacerlo, vuelve a ofrecer darla por perdida', /Dar por perdida/.test(sheet) && !/volver a dejarla pendiente/.test(sheet), sheet.slice(0, 500));

  const finalAnio = await page.evaluate(() => window.__debug.yearTotals(2026).gastos);
  check('la ida y vuelta por la interfaz deja la cuenta igual que al principio', finalAnio === 5000, { finalAnio });

  await browser.close();
  finish(errors);
})();
