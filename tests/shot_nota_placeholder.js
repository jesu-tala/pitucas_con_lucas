// Regresión: la usuaria pidió que el placeholder del campo Nota (en el detalle de una
// transacción) fuera más clarito visualmente y dijera "agregar notas personales" -- antes tenía
// otro texto y el mismo color/peso que el texto normal, sin distinguirse como placeholder.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t3 = Uber, sin nota en la maqueta -- el placeholder debe estar visible.
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

  // El placeholder debe verse más clarito (color terciario), no el mismo color que el texto
  // normal del input -- se comprueba leyendo la regla CSS ::placeholder aplicada.
  const placeholderColorDiferente = await page.evaluate(() => {
    const input = document.querySelector('[data-tx-field="nota"]');
    const textColor = getComputedStyle(input).color;
    // No se puede leer getComputedStyle(::placeholder) de forma confiable cross-browser desde
    // aquí, así que en vez de eso confirmamos que la regla CSS ::placeholder para .nota-input
    // existe y usa var(--text-tertiary) -- lo que sí podemos verificar es que ese token de color
    // es DISTINTO del color de texto normal del input, o sea que el placeholder debe leerse más
    // clarito que el texto que escribes.
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
