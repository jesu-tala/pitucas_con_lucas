// Reportado desde el teléfono: en el detalle de una transacción, los campos Fecha y Hora se
// chocan. En iOS los input[type=date]/[type=time] se dibujan con el ancho NATURAL de su
// contenido y Safari no los encoge por debajo de eso, así que se comen la separación y las dos
// cajas quedan pegadas, leyéndose como un solo control.
//
// Chromium no lo reproduce (ahí quedan holgadas), así que este test no puede comprobar el
// síntoma de iOS. Lo que SÍ fija es lo que lo causa: que haya separación real entre las dos
// cajas, que ninguna desborde su columna, y que las dos quepan dentro del ancho del teléfono.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 393, height: 852 } });

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({ id: 't1', fecha: '2026-09-26', hora: '09:18', comercio: 'PAYU *UBER TRIP',
      monto: 6488, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'transporte', monto: 6488 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.state.tab = 'transacciones'; D.render();
  });
  await page.waitForTimeout(200);
  await page.click('[data-tx="t1"]');
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const f = document.querySelector('[data-tx-field="fecha"]');
    const h = document.querySelector('[data-tx-field="hora"]');
    const par = document.querySelector('.edit-field-pair');
    if (!f || !h || !par) return null;
    const rf = f.getBoundingClientRect(), rh = h.getBoundingClientRect(), rp = par.getBoundingClientRect();
    return {
      separacion: Math.round(rh.left - rf.right),
      fechaDesborda: f.scrollWidth > f.clientWidth + 1,
      horaDesborda: h.scrollWidth > h.clientWidth + 1,
      cabenEnElAncho: Math.round(rh.right) <= Math.round(rp.right) + 1,
      anchoFecha: Math.round(rf.width), anchoHora: Math.round(rh.width)
    };
  });

  check('(control) se encuentran los dos campos en el detalle', m !== null, m);
  check('hay separación real entre Fecha y Hora (no quedan pegadas)', m.separacion >= 12, m);
  check('   ninguna de las dos desborda su columna', m.fechaDesborda === false && m.horaDesborda === false, m);
  check('   y las dos caben dentro del ancho del teléfono', m.cabenEnElAncho === true, m);

  await finish({ context, browser, errors });
})();
