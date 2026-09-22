// Una entrada marcada "no es ingreso" (estado 'no_es_gasto') ya quedó resuelta: la persona dijo
// explícitamente que esa plata no es un ingreso suyo (un traspaso entre cuentas propias, una
// devolución anulada). Aun así seguía apareciendo bajo el chip "Entradas", porque ese filtro era
// el único que miraba SOLO el tipo y no el estado -- los demás chips filtran por estados
// concretos ('pendiente', 'por_cobrar'), así que ya la excluían solos.
//
// El resto de la app ya la trataba bien: monthTotals la saca de todos los agregados, y en la
// lista no lleva ícono de "sin clasificar". La lista de Entradas era lo último que la mostraba
// como si fuera plata que entró.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    const hoy = D.todayISO();
    D.TRANSACTIONS.length = 0;
    const base = (id, extra) => Object.assign({ id, fecha: hoy, hora: '10:00', comercio: 'Entrada ' + id,
      monto: 50000, medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'sueldo', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' }, extra);
    D.TRANSACTIONS.push(base('real', {}));                                        // un ingreso de verdad
    D.TRANSACTIONS.push(base('noes', { estado: 'no_es_gasto', categorias: [] }));  // marcada "no es ingreso"
    D.TRANSACTIONS.push(base('pend', { estado: 'pendiente', categorias: [] }));    // sin clasificar todavía
    D.state.tab = 'transacciones'; D.state.filter = 'entradas'; D.render();
  });
  await page.waitForTimeout(200);

  const enEntradas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-tx]')).map(e => e.getAttribute('data-tx')));

  // Control positivo: si el chip no mostrara NADA, "no aparece la marcada" pasaría en verde sin
  // haber probado nada.
  check('(control) el chip Entradas sigue mostrando las entradas de verdad',
    enEntradas.includes('real') && enEntradas.includes('pend'), enEntradas);
  check('una entrada marcada "no es ingreso" ya no aparece bajo Entradas', enEntradas.includes('noes') === false, enEntradas);

  // Y los otros chips siguen sin mostrarla, como ya hacían.
  const otros = await page.evaluate(() => {
    const D = window.__debug, out = {};
    ['pendientes', 'porcobrar', 'reembolso'].forEach(f => {
      D.state.filter = f; D.render();
      out[f] = Array.from(document.querySelectorAll('[data-tx]')).map(e => e.getAttribute('data-tx'));
    });
    return out;
  });
  check('   y tampoco aparece en Pendientes, Por cobrar ni Reembolso',
    Object.keys(otros).every(f => !otros[f].includes('noes')), otros);
  check('   Pendientes sí sigue mostrando la que está realmente sin clasificar',
    otros.pendientes.includes('pend'), otros.pendientes);

  await finish({ context, browser, errors });
})();
