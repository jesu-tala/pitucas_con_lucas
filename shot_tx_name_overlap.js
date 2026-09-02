// Bug reportado: un comercio con nombre largo en la lista de Transacciones se dibujaba encima
// del monto de al lado ("COMISION ADMINISTRACION MES..." tapando el "$12.840"), en vez de
// cortarse con "..." como debería. Causa: .tx-name es un <span> (inline) -- overflow:hidden y
// text-overflow:ellipsis no hacen nada en un elemento inline sin display:block/inline-block, así
// que el texto se dibujaba a su ancho natural completo y se salía visualmente de su columna.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TX.unshift({
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
