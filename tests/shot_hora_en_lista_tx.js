// Request: show each transaction's time (hora) as a small extra detail in the Transactions list.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t1: Jumbo Ñuñoa, hora '09:12' (see state.ts fixture).
  const info = await page.evaluate(() => {
    const row = document.querySelector('[data-tx="t1"]');
    const sub = row ? row.querySelector('.tx-right-sub') : null;
    const horaEl = sub ? sub.querySelector('.tx-hora') : null;
    return {
      horaText: horaEl ? horaEl.textContent : null,
      subText: sub ? sub.textContent : null,
      fontSize: horaEl ? getComputedStyle(horaEl).fontSize : null,
      subFontSize: sub ? getComputedStyle(sub).fontSize : null,
    };
  });
  check('La fila muestra la hora de la transacción (09:12)', info.horaText === '09:12', info);
  check('La hora aparece junto al medio de pago en la misma línea chica', info.subText.includes('09:12') && info.subText.includes('9034'), info);
  check('Se ve en letra chica, como un dato extra (mismo tamaño que el medio de pago, no más grande)', info.fontSize === info.subFontSize, info);

  await finish({ context, browser, errors });
})();
