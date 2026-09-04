// Reported bug: a merchant with a long name in the Transactions list was drawn on top
// of the amount next to it ("COMISION ADMINISTRACION MES..." covering the "$12.840"), instead of
// being cut off with "..." as it should. Cause: .tx-name is a <span> (inline) -- overflow:hidden and
// text-overflow:ellipsis do nothing on an inline element without display:block/inline-block, so
// the text was drawn at its full natural width and visually spilled out of its column.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.unshift({
      id: 'test-nombre-largo', fecha: D.todayISO(), hora: '09:00',
      comercio: 'COMISION ADMINISTRACION MENSUAL CUENTA CORRIENTE NACIONAL', monto: 12840,
      medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente',
      categorias: [], porCobrar: [], reglaAuto: false, nota: ''
    });
    D.render();
  });
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(200);

  const rects = await page.evaluate(() => {
    const item = document.querySelector('[data-tx="test-nombre-largo"]');
    if (!item) return null;
    const nombre = item.querySelector('.tx-name');
    const monto = item.querySelector('.tx-amount');
    const rName = nombre.getBoundingClientRect();
    const rMonto = monto.getBoundingClientRect();
    return {
      display: getComputedStyle(nombre).display,
      nombreRight: rName.right,
      montoLeft: rMonto.left,
      nombreScrollWidth: nombre.scrollWidth,
      nombreClientWidth: nombre.clientWidth,
    };
  });

  check('Se encuentra la transacción de nombre largo en la lista', !!rects, rects);
  check('.tx-name tiene display:block (para que el truncado funcione de verdad)', rects && rects.display === 'block', rects);
  check('El texto del nombre está recortado (scrollWidth > clientWidth -- hay contenido oculto por el "...")', rects && rects.nombreScrollWidth > rects.nombreClientWidth, rects);
  check('El nombre truncado NO se superpone con el monto (termina antes de donde empieza el monto)', rects && rects.nombreRight <= rects.montoLeft + 1, rects);

  await finish({ context, browser, errors });
})();
