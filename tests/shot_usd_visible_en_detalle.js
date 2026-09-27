// Los tres campos de una compra en otra moneda (monto CLP, montoOriginal USD, tipoCambio) se
// guardaban bien, pero NINGUNA vista los mostraba: una vez guardada, la transacción se veía
// exactamente igual que un gasto en pesos de $49.493 y no había forma de saber que habían sido
// US$51,25. La trazabilidad existía solo en la base de datos.
//
// Peor era el caso sin tipo de cambio: ahí el monto en pesos es 0 a propósito (para no meter un
// número en dólares a un campo que se suma como pesos), así que la transacción se veía como un
// gasto de $0 sin ninguna explicación de por qué.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    const hoy = D.todayISO();
    D.TRANSACTIONS.length = 0;
    const base = (id, extra) => Object.assign({ id, fecha: hoy, hora: '10:00', comercio: 'Compra ' + id,
      monto: 49493, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'compras', monto: 49493 }], porCobrar: [], reglaAuto: false, nota: '' }, extra);
    D.TRANSACTIONS.push(base('usd', { moneda: 'USD', montoOriginal: 51.25, tipoCambio: 965.71 }));
    D.TRANSACTIONS.push(base('sintc', { monto: 0, categorias: [], estado: 'pendiente', moneda: 'USD', montoOriginal: 51.25 }));
    D.TRANSACTIONS.push(base('clp', {}));
    D.state.tab = 'transacciones'; D.state.filter = 'todas'; D.render();
  });
  await page.waitForTimeout(200);

  const abrir = async (id) => { await page.click('[data-tx="' + id + '"]'); await page.waitForTimeout(250); };
  const cerrar = async () => { await page.click('[data-close-sheet-done]'); await page.waitForTimeout(200); };
  const leer = () => page.evaluate(() => {
    const el = document.querySelector('.sheet-moneda-origen');
    return {
      hayLinea: !!el,
      texto: el ? el.textContent : null,
      esAlerta: !!(el && el.classList.contains('sin-convertir')),
      montoMostrado: (document.querySelector('.sheet-amount') || {}).textContent
    };
  });

  await abrir('usd');
  const usd = await leer();
  check('una compra en dólares muestra cuánto fue en USD', usd.hayLinea && /US\$51,25/.test(usd.texto), usd);
  check('   y a qué tipo de cambio se convirtió (se puede verificar la cifra)',
    /965,71/.test(usd.texto || ''), usd);
  check('   sin dejar de mostrar el monto en pesos, que es el que cuenta', /49\.493/.test(usd.montoMostrado || ''), usd);
  await cerrar();

  await abrir('sintc');
  const sintc = await leer();
  check('sin tipo de cambio avisa que falta, en vez de verse como un gasto de $0 sin explicación',
    sintc.hayLinea && /falta el tipo de cambio/.test(sintc.texto), sintc);
  check('   y lo marca como alerta, no como un dato más', sintc.esAlerta === true, sintc);
  check('   pero igual dice cuánto fue en dólares, así no se pierde el dato', /US\$51,25/.test(sintc.texto || ''), sintc);
  await cerrar();

  // Control positivo: si la línea apareciera siempre, todo lo de arriba pasaría por otra razón.
  await abrir('clp');
  const clp = await leer();
  check('(control) una compra en pesos NO muestra ninguna línea de moneda', clp.hayLinea === false, clp);

  await finish({ context, browser, errors });
})();
