// Las cuatro tarjetas de Balance se leen como una cuenta, y ahora lo son: la primera muestra
// TODO lo que entró, que es lo que el balance usa, así Entradas − Gastos − Inversiones = Balance
// cierra a la vista.
//
// Antes decía "Ingreso" y mostraba solo el ingreso REAL (naturaleza 'ingreso', ver
// incomeNatureOf), mientras el balance sumaba todas las entradas. Un depósito sin clasificar
// entra en el segundo y no en el primero, así que la resta no daba y nada lo explicaba: con
// $2.881.025 de ingreso, $868.207 de gastos y $400.000 de inversiones el balance mostraba
// $2.855.380, y parecía que se había quedado pegado en un valor viejo de antes de borrar un
// sueldo duplicado. Estaba bien calculado; lo que faltaba era mostrar el número que usaba.
//
// El ingreso real no se esconde: va como línea chica bajo Entradas cuando los dos difieren, y
// sigue siendo el que usan las metas y la tasa de ahorro.
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
  check('la tarjeta se llama Entradas, no Ingreso', /Entradas/.test(txt) && !/Ingreso\$/.test(txt), txt.slice(0, 200));
  // Sin diferencia no hay nada que aclarar: repetir el mismo número dos veces sería ruido.
  check('cuando entradas e ingreso real coinciden, no se repite la línea chica',
    !/ingreso real:/.test(txt), txt.slice(0, 300));

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
  check('la tarjeta muestra TODO lo que entró', /1\.500\.000/.test(txt), txt.slice(0, 400));
  check('el ingreso real aparece como línea chica', /ingreso real: \$1\.000\.000/.test(txt), txt.slice(0, 400));
  // Lo que se buscaba con todo esto: que la resta que se ve en pantalla efectivamente dé.
  const tarjetas = await page.evaluate(() => {
    const val = (cls) => {
      const el = document.querySelector('#resumen-content .' + cls + ' .stat-value');
      return el ? Number(el.textContent.replace(/[^0-9-]/g, '')) : null;
    };
    return { entradas: val('stat-ingresos'), gastos: val('stat-gastos'),
             inversiones: val('stat-inversiones'), balance: val('stat-balance') };
  });
  check('(control) se leyeron las cuatro tarjetas', Object.values(tarjetas).every(v => v !== null), tarjetas);
  check('la resta que se ve en pantalla ahora SÍ da',
    tarjetas.entradas - tarjetas.gastos - tarjetas.inversiones === tarjetas.balance, tarjetas);

  // Y el balance en pantalla sigue siendo el correcto, no uno "arreglado" para que cierre.
  check('el balance mostrado sigue siendo entradas − gastos − inversiones',
    totales.balance === totales.entradas - totales.gastos - totales.inversiones, totales);

  await browser.close();
  finish(errors);
})();
