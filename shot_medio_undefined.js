// Bug real encontrado revisando un screenshot de la usuaria: algunas transacciones (con un
// medio de pago que ya no existe en MEDIOS, o sin medio nunca asignado) mostraban literalmente
// la palabra "undefined" en la fila de la lista, en vez de algo legible -- porque medioInfo()
// devolvía un objeto de respaldo sin la propiedad "corto" que usa esa fila. Este test fija ese
// arreglo: cualquier tx con un medio inexistente debe mostrar el texto de respaldo, nunca la
// palabra "undefined".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const setup = await page.evaluate(() => {
    const D = window.__debug;
    D.TX.push({
      id: 't_medio_inexistente_test', fecha: D.todayISO(), hora: '10:00', comercio: 'Comercio Sin Medio',
      monto: 12345, medio: 'medio_que_no_existe_xyz', tipo: 'gasto', recurrencia: 'variable',
      estado: 'confirmado', categorias: [{ cat: Object.keys(D.CATS)[0], monto: 12345 }],
      porCobrar: [], reglaAuto: false, nota: ''
    });
    D.state.tab = 'transacciones';
    D.render();
    return true;
  });
  await page.waitForTimeout(150);
  check('setup ok', setup === true);

  const row = await page.evaluate(() => {
    const btn = document.querySelector('[data-tx="t_medio_inexistente_test"]');
    const sub = btn ? btn.querySelector('.tx-right-sub') : null;
    return sub ? sub.textContent : null;
  });
  console.log('texto del medio en la fila:', JSON.stringify(row));

  check('la fila existe y tiene un tx-right-sub', row !== null, row);
  check('NO muestra literalmente la palabra "undefined"', !/undefined/i.test(row || ''), row);
  // El texto real incluye el ícono emoji del medio pegado adelante (ej. "💳Sin medio"), sin
  // espacio -- por eso "incluye" y no una igualdad exacta.
  check('muestra el texto de respaldo legible ("Sin medio")', (row || '').includes('Sin medio'), row);

  // Mismo chequeo dentro del detalle: abrir la hoja no debe romperse ni mostrar "undefined" en
  // el selector de medio (el <option> seleccionado simplemente no calza con ninguno, que es
  // aceptable -- lo que no puede pasar es un crash o texto roto en el resto del sheet).
  await page.click('[data-tx="t_medio_inexistente_test"]');
  await page.waitForTimeout(200);
  const sheetOk = await page.evaluate(() => !!document.querySelector('.sheet-top .merchant'));
  check('el detalle de la transacción abre sin problema', sheetOk === true);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
