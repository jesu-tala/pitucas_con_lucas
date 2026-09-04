// Coverage for the editable Nota field on the transaction sheet: typing persists to tx.nota,
// the header echo (data-note-echo) shows/hides correctly, and it survives a real close+reopen
// of the sheet (guarding against a future renderSheetContent regression that forgets t.nota).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t3 = Uber, no note by default in the mockup.
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);

  const antes = await page.evaluate(() => {
    const echo = document.querySelector('.sheet-top [data-note-echo]');
    return { notaTx: window.__debug.TRANSACTIONS.find(t => t.id === 't3').nota, echoVisible: echo ? getComputedStyle(echo).display !== 'none' : null };
  });
  check('(a0) Antes de escribir, tx.nota está vacía', antes.notaTx === '', antes.notaTx);
  check('(b0) Con nota vacía, el eco del header está oculto', antes.echoVisible === false, antes);

  await page.fill('[data-tx-field="nota"]', 'Volviendo tarde del trabajo');
  await page.waitForTimeout(150);

  const tras = await page.evaluate(() => {
    const echo = document.querySelector('.sheet-top [data-note-echo]');
    return {
      notaTx: window.__debug.TRANSACTIONS.find(t => t.id === 't3').nota,
      echoVisible: echo ? getComputedStyle(echo).display !== 'none' : null,
      echoText: echo ? echo.textContent : null,
    };
  });
  check('(a) Escribir en el campo nota persiste a tx.nota', tras.notaTx === 'Volviendo tarde del trabajo', tras.notaTx);
  check('(b) El eco del header queda visible con el texto correcto', tras.echoVisible === true && tras.echoText === 'Volviendo tarde del trabajo', tras);

  // (c) close and reopen via the real UI flow, not touching state by hand.
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);

  const reabierto = await page.evaluate(() => {
    const notaInput = document.querySelector('[data-tx-field="nota"]');
    const echo = document.querySelector('.sheet-top [data-note-echo]');
    return {
      inputValue: notaInput ? notaInput.value : null,
      echoText: echo ? echo.textContent : null,
      echoVisible: echo ? getComputedStyle(echo).display !== 'none' : null,
    };
  });
  check('(c) Tras cerrar y reabrir el sheet, la nota guardada se sigue mostrando en el input', reabierto.inputValue === 'Volviendo tarde del trabajo', reabierto);
  check('   y también en el eco del header', reabierto.echoVisible === true && reabierto.echoText === 'Volviendo tarde del trabajo', reabierto);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
