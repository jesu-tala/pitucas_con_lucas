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
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);
  await page.fill('[data-tx-field="monto"]', '1500000');
  await page.waitForTimeout(100);
  const montoTx = await page.evaluate(() => document.querySelector('[data-tx-field="monto"]').value);
  check('(a) El campo de monto de una transacción muestra puntos de miles mientras se escribe (1.500.000)', montoTx === '1.500.000', montoTx);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (b) Monto objetivo de una meta -- el caso que reportó la usuaria explícitamente.
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

  // (c) El mismo campo sigue aceptando una expresión Tricount sin que se le metan puntos en
  // medio -- reescribimos con algo que tiene un operador, y debe quedar TAL CUAL, sin tocar.
  await page.fill('[data-goal-field="montoObjetivo"]', '8000000-500000');
  await page.waitForTimeout(100);
  const montoObjetivoExpr = await page.evaluate(() => document.querySelector('[data-goal-field="montoObjetivo"]').value);
  check('(c) Una expresión con operador ("8000000-500000") no se toca -- no se le insertan puntos', montoObjetivoExpr === '8000000-500000', montoObjetivoExpr);
  // Y al salir del campo, se evalúa igual que siempre (comportamiento de safeEvalExpr, sin
  // relación con el formateo en vivo).
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

  await finish({ context, browser, errors });
})();
