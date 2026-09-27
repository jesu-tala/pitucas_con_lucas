// Una compra en dólares que llegó SIN convertir (la API del dólar caída el día que entró) queda
// con monto 0 y sin clasificar. Hasta acá no tenía arreglo desde la app: había que borrarla y
// volver a crearla a mano. Ahora la línea de moneda del detalle se toca y deja escribir el tipo
// de cambio, que recalcula el monto.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({ id: 'sintc', fecha: D.todayISO(), hora: '10:00', comercio: 'Hotel Miami',
      monto: 0, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '', moneda: 'USD', montoOriginal: 51.25 });
    D.state.tab = 'transacciones'; D.state.filter = 'todas'; D.render();
  });
  await page.waitForTimeout(200);
  await page.click('[data-tx="sintc"]');
  await page.waitForTimeout(250);

  const antes = await page.evaluate(() => ({
    hayBoton: !!document.querySelector('[data-editar-tc-tx]'),
    hayCampo: !!document.querySelector('[data-tx-tipocambio]'),
    monto: window.__debug.TRANSACTIONS.find(t => t.id === 'sintc').monto
  }));
  check('(control) la transacción sin convertir está en $0 y ofrece tocar para arreglarla',
    antes.monto === 0 && antes.hayBoton === true && antes.hayCampo === false, antes);

  await page.click('[data-editar-tc-tx]');
  await page.waitForTimeout(250);
  const enEdicion = await page.evaluate(() => !!document.querySelector('[data-tx-tipocambio]'));
  check('tocarla abre el campo para escribir el tipo de cambio', enEdicion === true, enEdicion);

  await page.fill('[data-tx-tipocambio]', '965,71');
  await page.waitForTimeout(300);
  const despues = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 'sintc');
    return { monto: t.monto, tipoCambio: t.tipoCambio, montoOriginal: t.montoOriginal,
             montoEnPantalla: (document.querySelector('.sheet-amount') || {}).textContent };
  });
  check('escribirlo recalcula el monto en pesos (51,25 × 965,71 = 49.493)',
    despues.monto === 49493 && despues.tipoCambio === 965.71, despues);
  check('   y el monto se actualiza en pantalla al instante', /49\.493/.test(despues.montoEnPantalla || ''), despues);

  // Corregirlo otra vez tiene que partir del monto en dólares, no del ya convertido.
  await page.fill('[data-tx-tipocambio]', '1000');
  await page.waitForTimeout(300);
  const corregido = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 'sintc');
    return { monto: t.monto, montoOriginal: t.montoOriginal };
  });
  check('corregirlo de nuevo recalcula desde los dólares, no sobre el monto ya convertido',
    corregido.monto === 51250 && corregido.montoOriginal === 51.25, corregido);

  await finish({ context, browser, errors });
})();
