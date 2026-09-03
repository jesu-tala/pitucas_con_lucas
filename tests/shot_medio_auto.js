const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const result = await page.evaluate(() => {
    const D = window.__debug;
    const antes = Object.keys(D.PAYMENT_METHODS).length;
    const id1 = D.ensurePaymentMethodForSuggestion('****0507');
    const despues = Object.keys(D.PAYMENT_METHODS).length;
    const medioCreado = D.PAYMENT_METHODS[id1];
    const id2 = D.ensurePaymentMethodForSuggestion('****0507');
    const totalTrasSegunda = Object.keys(D.PAYMENT_METHODS).length;
    const id3 = D.ensurePaymentMethodForSuggestion('****4821');
    const totalTrasExistente = Object.keys(D.PAYMENT_METHODS).length;
    const id4 = D.ensurePaymentMethodForSuggestion(null);
    return { antes, despues, medioCreado, id1, id2, totalTrasSegunda, id3, totalTrasExistente, id4 };
  });
  console.log(JSON.stringify(result, null, 1));
  check('Crea 1 medio nuevo la primera vez', result.despues === result.antes + 1, result);
  check('Reusa el mismo id la segunda vez (no duplica)', result.id1 === result.id2 && result.totalTrasSegunda === result.despues, result);
  check('Tarjeta ya conocida (4821) usa visa_bch, no crea otra', result.id3 === 'visa_bch' && result.totalTrasExistente === result.despues, result);
  check('Sin sugerencia devuelve null', result.id4 === null, result.id4);

  await finish({ context, browser, errors });
})();
