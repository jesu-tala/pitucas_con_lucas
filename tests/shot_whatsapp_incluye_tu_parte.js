// Texto de WhatsApp al compartir un gasto: el total mostrado debe ser el del GASTO COMPLETO
// (no "lo que me deben"), e incluir la propia parte de quien comparte cuando también le toca
// pagar -- para que quede claro que se está sumando a la división, no solo cobrando.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;

    // Caso 1: el pagador (Tú) también participa del reparto -- gasto de $9.000 entre 3, cada
    // quien $3.000, ninguno pagado todavía.
    const conMiParte = {
      id: 'gConMiParte', monto: 9000, porCobrar: [
        { persona: 'Jose', monto: 3000, pagado: false, tipo: 'persona', direccion: null, montoRecibido: null, linkedTxId: null },
        { persona: 'Mamá', monto: 3000, pagado: false, tipo: 'persona', direccion: null, montoRecibido: null, linkedTxId: null }
      ]
    };
    const textoConMiParte = D.buildChargeWhatsAppText(conMiParte);

    // Caso 2: el pagador NO participa (pagó 100% por otros) -- no debe agregar una línea "Tú" con $0.
    const sinMiParte = {
      id: 'gSinMiParte', monto: 6000, porCobrar: [
        { persona: 'Jose', monto: 3000, pagado: false, tipo: 'persona', direccion: null, montoRecibido: null, linkedTxId: null },
        { persona: 'Mamá', monto: 3000, pagado: false, tipo: 'persona', direccion: null, montoRecibido: null, linkedTxId: null }
      ]
    };
    const textoSinMiParte = D.buildChargeWhatsAppText(sinMiParte);

    return { textoConMiParte, textoSinMiParte };
  });

  const lineasConMiParte = resultado.textoConMiParte.split('\n');
  check('Cuando el pagador también participa, sale "Tú" numerado primero con su parte',
    lineasConMiParte[1] === '1. Tú $3.000', resultado.textoConMiParte);
  check('   seguido de los demás participantes numerados a continuación', lineasConMiParte[2] === '2. Jose $3.000' && lineasConMiParte[3] === '3. Mamá $3.000', resultado.textoConMiParte);
  check('   y el Total es el del GASTO COMPLETO ($9.000), no la suma de lo pendiente de otros ($6.000)',
    resultado.textoConMiParte.includes('Total: $9.000'), resultado.textoConMiParte);

  check('Cuando el pagador NO participa (pagó 100% por otros), no aparece una línea "Tú"',
    !resultado.textoSinMiParte.includes('Tú'), resultado.textoSinMiParte);
  check('   y el total sigue siendo el del gasto completo ($6.000)',
    resultado.textoSinMiParte.includes('Total: $6.000'), resultado.textoSinMiParte);

  await finish({ context, browser, errors });
})();
