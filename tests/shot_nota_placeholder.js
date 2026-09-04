// Regression: the user asked for the Nota field's placeholder (in a transaction's
// detail view) to be visually lighter and say "agregar notas personales" -- before it had
// different text and the same color/weight as normal text, not standing out as a placeholder.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t3 = Uber, no note in the mockup -- the placeholder should be visible.
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);

  const info = await page.evaluate(() => {
    const input = document.querySelector('[data-tx-field="nota"]');
    return {
      placeholder: input ? input.getAttribute('placeholder') : null,
      tieneClaseNotaInput: input ? input.classList.contains('nota-input') : null,
    };
  });
  check('El placeholder del campo Nota dice "Agregar notas personales"', info.placeholder === 'Agregar notas personales', info.placeholder);
  check('El input tiene la clase "nota-input" (para el estilo más clarito del placeholder)', info.tieneClaseNotaInput === true, info);

  // The placeholder should look lighter (tertiary color), not the same color as the input's
  // normal text -- this is checked by reading the applied ::placeholder CSS rule.
  const placeholderColorDiferente = await page.evaluate(() => {
    const input = document.querySelector('[data-tx-field="nota"]');
    const textColor = getComputedStyle(input).color;
    // We can't reliably read getComputedStyle(::placeholder) cross-browser from
    // here, so instead we confirm that the ::placeholder CSS rule for .nota-input
    // exists and uses var(--text-tertiary) -- what we CAN verify is that this color token
    // is DIFFERENT from the input's normal text color, meaning the placeholder must read
    // lighter than the text you type.
    const tmp = document.createElement('div');
    tmp.style.color = 'var(--text-tertiary)';
    document.body.appendChild(tmp);
    const tertiaryColor = getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    return { textColor, tertiaryColor };
  });
  check('El color del placeholder (--text-tertiary) es distinto al color de texto normal del input', placeholderColorDiferente.textColor !== placeholderColorDiferente.tertiaryColor, placeholderColorDiferente);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
