// Regresión: los campos de monto ($) mostraban los números crudos mientras se escribía (ej.
// "1500000"), sin puntos de miles, hasta que se salía del campo -- fácil de leer mal (¿llevo
// 1.500 o 15.000?). liveFormatThousands() (shared-expenses.ts) ahora los reformatea en vivo,
// pero SOLO cuando el valor actual es un número puro -- varios de estos campos (Monto objetivo,
// Aporte mensual, Presupuesto, etc.) aceptan escribir una expresión tipo Tricount ("22000-5000")
// que se evalúa recién al guardar (safeEvalExpr), así que reformatear en vivo con puntos NO debe
// romper esa escritura.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // (a) Monto de una transacción ya existente (detalle) -- campo simple, sin expresiones.
  // Nota: se lee el valor INMEDIATAMENTE después de fill(), sin ningún await/timeout de por
  // medio -- fill() deja el campo enfocado y formateado en el momento, pero unos ~20ms después
  // pierde el foco sola (un detalle interno de fill(), no de cómo escribe una usuaria de
  // verdad) y eso dispara el refresco al perder el foco (otro fix ya hecho, ver events.ts),
  // que redibuja la hoja entera desde tx.monto sin puntos -- si hubiera un await entre medio,
  // el test alcanzaría a ver ese redibujado en vez del valor recién formateado.
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);
  await page.fill('[data-tx-field="monto"]', '1500000');
  const montoTx = await page.evaluate(() => document.querySelector('[data-tx-field="monto"]').value);
  check('(a) El campo de monto de una transacción muestra puntos de miles mientras se escribe (1.500.000)', montoTx === '1.500.000', montoTx);
  await page.waitForTimeout(150);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (b) Monto objetivo y "cuánto tienes ahorrado" al crear una meta -- el caso que reportó la
  // usuaria explícitamente.
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(100);
  await page.click('[data-summary-sub="inversiones"]');
  await page.waitForTimeout(150);
  const platformId = await page.evaluate(() => document.querySelector('[data-toggle-platform]')?.getAttribute('data-toggle-platform'));
  await page.click(`[data-toggle-platform="${platformId}"]`);
  await page.waitForTimeout(150);
  await page.click(`[data-add-goal="${platformId}"]`);
  await page.waitForTimeout(150);
  await page.fill('[data-goal-field="montoObjetivo"]', '8000000');
  await page.waitForTimeout(100);
  const montoObjetivo = await page.evaluate(() => document.querySelector('[data-goal-field="montoObjetivo"]').value);
  check('(b) "Monto objetivo" de una meta muestra puntos de miles mientras se escribe (8.000.000)', montoObjetivo === '8.000.000', montoObjetivo);

  const tieneAportadoInicial = await page.evaluate(() => !!document.querySelector('[data-goal-field="aportadoInicial"]'));
  if(tieneAportadoInicial){
    await page.fill('[data-goal-field="aportadoInicial"]', '2500000');
    await page.waitForTimeout(100);
    const aportadoInicial = await page.evaluate(() => document.querySelector('[data-goal-field="aportadoInicial"]').value);
    check('(b2) "Cuánto tienes ahorrado" también muestra puntos de miles en vivo (2.500.000)', aportadoInicial === '2.500.000', aportadoInicial);
  }

  // (c) El campo de monto objetivo sigue aceptando una expresión Tricount sin que se le metan
  // puntos en medio -- reescribimos con algo que tiene un operador, y debe quedar TAL CUAL.
  await page.fill('[data-goal-field="montoObjetivo"]', '8000000-500000');
  await page.waitForTimeout(100);
  const montoObjetivoExpr = await page.evaluate(() => document.querySelector('[data-goal-field="montoObjetivo"]').value);
  check('(c) Una expresión con operador ("8000000-500000") no se toca -- no se le insertan puntos', montoObjetivoExpr === '8000000-500000', montoObjetivoExpr);
  await page.evaluate(() => document.querySelector('[data-goal-field="montoObjetivo"]').blur());
  await page.waitForTimeout(100);
  const draftTrasExpr = await page.evaluate(() => window.__debug.state.goalDraft.montoObjetivo);
  check('   y el borrador guarda la expresión cruda (se evalúa recién al confirmar el form)', draftTrasExpr === '8000000-500000', draftTrasExpr);

  // (d) El cursor no se va al final: escribir en medio de un número ya formateado mantiene la
  // posición relativa (no se "escapa" al final cada vez que se inserta un dígito).
  await page.fill('[data-goal-field="montoObjetivo"]', '1234567');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const el = document.querySelector('[data-goal-field="montoObjetivo"]');
    el.focus();
    el.setSelectionRange(1, 1); // cursor justo después del primer dígito ("1|.234.567")
  });
  await page.keyboard.type('9', { delay: 20 });
  await page.waitForTimeout(100);
  const trasEscribirEnMedio = await page.evaluate(() => {
    const el = document.querySelector('[data-goal-field="montoObjetivo"]');
    return { valor: el.value, cursor: el.selectionStart };
  });
  check('(d) Escribir en medio de un monto ya formateado inserta el dígito en el lugar correcto (19.234.567)',
    trasEscribirEnMedio.valor === '19.234.567', trasEscribirEnMedio);
  check('   y el cursor queda cerca de donde se escribió, no salta al final', trasEscribirEnMedio.cursor <= 3, trasEscribirEnMedio);

  // (e) Bug real reportado ("puse 483000 y se me pasó a 48.3"): page.fill() de arriba deja el
  // valor final de una sola vez y no alcanza a reproducirlo -- el bug solo aparece cuando el "."
  // que liveFormatThousands() dejó en el campo en un dígito anterior SIGUE ahí cuando se lee el
  // valor para guardarlo (se leía como separador decimal en vez de miles). Hay que tipear
  // dígito a dígito con keyboard.type() para que cada uno dispare su propio evento 'input', igual
  // que escribiría una persona de verdad.
  await page.click('[data-goal-field="montoObjetivo"]');
  await page.evaluate(() => {
    const el = document.querySelector('[data-goal-field="montoObjetivo"]');
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.keyboard.type('483000', { delay: 20 });
  await page.waitForTimeout(100);
  const goalDraftTrasTipear = await page.evaluate(() => window.__debug.state.goalDraft.montoObjetivo);
  check('(e) Tecleando "483000" dígito a dígito, el borrador guarda "483000" (el "." de miles no se cuela como decimal)',
    goalDraftTrasTipear === '483000', goalDraftTrasTipear);
  await page.click('[data-close-sheet-done]').catch(()=>{});

  // (f) Mismo bug, en el campo de monto de una transacción nueva (el caso reportado -- "agregar
  // un ingreso extra").
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  await page.click('#fab-add');
  await page.waitForTimeout(200);
  await page.click('[data-seg="draft-tipo"] [data-seg-val="ingreso"]');
  await page.waitForTimeout(100);
  await page.click('[data-draft-field="monto"]');
  await page.keyboard.type('483000', { delay: 20 });
  await page.waitForTimeout(100);
  const draftMontoTrasTipear = await page.evaluate(() => window.__debug.state.draftTx.monto);
  check('(f) Un ingreso nuevo tecleado "483000" dígito a dígito guarda 483000 (no 48.3)',
    draftMontoTrasTipear === 483000, draftMontoTrasTipear);

  await finish({ context, browser, errors });
})();
