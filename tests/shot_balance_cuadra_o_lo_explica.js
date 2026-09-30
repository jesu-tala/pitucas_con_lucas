// Balance muestra cuatro cifras que se leen como una cuenta: Ingreso − Gastos − Inversiones =
// Balance. Pero no lo son, y cuando no dan, nada en pantalla lo decía.
//
// "Ingreso" es el ingreso REAL (naturaleza 'ingreso', ver incomeNatureOf). "Balance" usa TODAS
// las entradas, para cuadrar con lo que de verdad entró a la cuenta. Un depósito sin clasificar
// entra en el segundo y no en el primero.
//
// El caso real: con $2.881.025 de ingreso, $868.207 de gastos y $400.000 de inversiones, el
// Balance mostraba $2.855.380. La cuenta no daba por $1.242.562 de entradas sin clasificar, y
// desde afuera parecía que el Balance se había quedado pegado en un valor viejo de antes de
// borrar un sueldo duplicado. Estaba bien calculado; lo que faltaba era decirlo.
const { openApp, check, finish } = require('./lib/test_kit');

const tx = (id, fecha, tipo, monto, cats) => ({
  id, fecha, hora: '10:00', comercio: id, monto, medio: 'efectivo', tipo,
  recurrencia: 'variable', estado: 'confirmado', categorias: cats, porCobrar: [],
  reglaAuto: false, nota: '',
});

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- caso 1: todo clasificado, la cuenta cierra ----------
  const mes = await page.evaluate((t) => {
    const D = window.__debug;
    // El mes que la vista está mostrando, no el último de la lista: MONTHS incluye meses
    // futuros, así que escribir ahí dejaba la pantalla en $0 y los checks pasaban en vacío.
    const mes = D.MONTHS[D.state.monthIndex];
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(Object.assign({}, t, { id: 'sueldo1', fecha: mes + '-01', tipo: 'ingreso', monto: 1000000, categorias: [{ cat: 'sueldo', monto: 1000000 }] }));
    D.TRANSACTIONS.push(Object.assign({}, t, { id: 'gasto1', fecha: mes + '-05', tipo: 'gasto', monto: 200000, categorias: [{ cat: 'supermercado', monto: 200000 }] }));
    D.render();
    return mes;
  }, tx('base', '', 'gasto', 0, []));

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  await page.click('[data-summary-sub="balance"]');
  await page.waitForTimeout(250);

  let totales = await page.evaluate((m) => window.__debug.monthTotals(m), mes);
  check('(control) el mes bajo prueba es el que la vista muestra, y tiene datos',
    totales.entradas === 1000000 && totales.gastos === 200000, totales);
  check('(control) con todo clasificado, entradas e ingresos coinciden', totales.entradas === totales.ingresos, totales);
  let txt = await page.textContent('#resumen-content');
  check('cuando la cuenta cierra, NO aparece la nota', !/El balance usa/.test(txt), txt.slice(0, 300));

  // ---------- caso 2: una entrada sin clasificar ----------
  // Un depósito sin categoría de sueldo tiene naturaleza 'por_clasificar': entra en `entradas`
  // pero no en `ingresos`, y ahí los cuatro números dejan de cerrar.
  await page.evaluate((m) => {
    const D = window.__debug;
    D.TRANSACTIONS.push({ id: 'misterio', fecha: m + '-10', hora: '10:00', comercio: 'Transferencia',
      monto: 500000, medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '' });
    D.render();
  }, mes);
  await page.waitForTimeout(250);

  totales = await page.evaluate((m) => window.__debug.monthTotals(m), mes);
  check('(control) la entrada sin clasificar sube entradas pero no ingresos',
    totales.entradas === totales.ingresos + 500000 && totales.porClasificar === 500000, totales);
  // El corazón del asunto: la resta visible NO da el balance.
  check('(control) Ingreso − Gastos − Inversiones ya no da el balance',
    totales.ingresos - totales.gastos - totales.inversiones !== totales.balance, totales);

  txt = await page.textContent('#resumen-content');
  check('cuando la cuenta no cierra, la nota aparece', /El balance usa/.test(txt), txt.slice(0, 500));
  check('la nota dice cuánto entró en total', /1\.500\.000/.test(txt), txt.slice(0, 500));
  // Acotado al texto de la nota, no a toda la vista: "$500.000" también sale en la tarjeta de
  // "Por clasificar" de más abajo, así que buscarlo suelto pasaba aunque la nota no existiera.
  const nota = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#resumen-content .file-format-hint')]
      .find(e => /El balance usa/.test(e.textContent));
    return el ? el.textContent : null;
  });
  check('(control) la nota existe como su propio elemento', !!nota, nota);
  check('la nota dice cuánto es lo que no es ingreso real', !!nota && /500\.000/.test(nota), nota);
  check('la nota explica por qué la resta no da', /no da el balance/.test(txt), txt.slice(0, 500));

  // Y el balance en pantalla sigue siendo el correcto, no uno "arreglado" para que cierre.
  check('el balance mostrado sigue siendo entradas − gastos − inversiones',
    totales.balance === totales.entradas - totales.gastos - totales.inversiones, totales);

  await browser.close();
  finish(errors);
})();
