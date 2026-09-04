// Regresión: editar el Monto, el Nombre o la Fecha de una transacción YA EXISTENTE (desde su
// detalle) actualizaba tx.monto/tx.comercio en memoria y parchaba a mano el eco visual dentro
// del mismo detalle, pero nunca refrescaba el resto de la app -- ni la lista de Transacciones
// detrás del sheet, ni las tarjetas de Balance (Ingresos en particular, aunque el mismo hueco
// afecta Gastos/Inversiones también). Cerrar la hoja tampoco alcanzaba (closeSheet() no llama a
// render()) -- había que cambiar de pestaña para que la app se pusiera al día sola. Además, no
// existía ninguna forma de cambiarle el nombre a una transacción ya guardada (ni siquiera un
// input, solo un <div> de solo lectura), fuera importada o agregada a mano.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // (a) Editar el Monto de t3 (Uber, $6.200 gasto) y salir del campo (blur) refresca la fila de
  // la lista detrás del sheet, sin tener que cerrar la hoja ni cambiar de pestaña.
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);
  await page.fill('[data-tx-field="monto"]', '9999');
  await page.evaluate(() => document.querySelector('[data-tx-field="monto"]').blur());
  await page.waitForTimeout(200);
  const filaTrasMonto = await page.evaluate(() => {
    const row = document.querySelector('[data-tx="t3"].tx-item');
    return { txMonto: window.__debug.TRANSACTIONS.find(t => t.id === 't3').monto, filaTexto: row ? row.querySelector('.tx-amount').textContent : null };
  });
  check('(a) tx.monto se actualiza al editar el campo', filaTrasMonto.txMonto === 9999, filaTrasMonto);
  check('   y la fila de la lista (detrás del sheet) ya muestra el monto nuevo, sin cerrar la hoja', /9\.999|9999/.test(filaTrasMonto.filaTexto || ''), filaTrasMonto);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (b) Renombrar una transacción ya guardada: antes no había forma de editar el nombre después
  // de crearla. Probamos con t9 (Aporte Fintual), agregada como cualquier otra en el fixture --
  // la app no distingue "manual" de "importada" a esta altura, así que cubre el caso reportado.
  await page.click('[data-tx="t9"]');
  await page.waitForTimeout(200);
  const nombreInputExiste = await page.evaluate(() => !!document.querySelector('[data-tx-field="comercio"]'));
  check('(b) El detalle de una transacción ya guardada tiene un campo de Nombre editable', nombreInputExiste === true);
  await page.fill('[data-tx-field="comercio"]', 'Aporte Fintual renombrado');
  await page.waitForTimeout(150);
  const trasRenombrar = await page.evaluate(() => ({
    txComercio: window.__debug.TRANSACTIONS.find(t => t.id === 't9').comercio,
    tituloEcho: document.getElementById('sheet-title-el').textContent,
  }));
  check('   escribir en el campo persiste a tx.comercio', trasRenombrar.txComercio === 'Aporte Fintual renombrado', trasRenombrar);
  check('   y el título del detalle se actualiza en vivo mientras se escribe', trasRenombrar.tituloEcho === 'Aporte Fintual renombrado', trasRenombrar);
  await page.evaluate(() => document.querySelector('[data-tx-field="comercio"]').blur());
  await page.waitForTimeout(200);
  const filaTrasRenombrar = await page.evaluate(() => {
    const row = document.querySelector('[data-tx="t9"].tx-item');
    return row ? row.textContent : null;
  });
  check('   y la fila de la lista también refleja el nombre nuevo tras salir del campo', (filaTrasRenombrar || '').includes('Aporte Fintual renombrado'), filaTrasRenombrar);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (c) Editar el Monto de t6 (Sueldo Agosto, ingreso) y salir del campo refresca "Ingresos" en
  // Balance de inmediato -- sin ir a Transacciones y volver, que era el rodeo que había que hacer.
  // t6 vive en agosto 2026 -- el mes seleccionado por defecto en Balance es el mes real de hoy
  // (no necesariamente agosto), así que primero nos paramos ahí y recién después volvemos a
  // Transacciones a editar, para que el chequeo final ejercite de verdad el refresco automático
  // (y no un render() de más que hicimos nosotros mismos a mano).
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(100);
  await page.click('[data-summary-sub="balance"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const D = window.__debug;
    const idx = D.MONTHS.indexOf('2026-08');
    if (idx >= 0) { D.state.monthIndex = idx; D.render(); }
  });
  await page.waitForTimeout(150);
  const balanceAntes = await page.evaluate(() => document.querySelector('.stat-ingresos .stat-value')?.textContent || null);
  // Ingresos de agosto en el fixture: t6 Sueldo ($1.250.000) + t11 Freelance ($180.000) =
  // $1.430.000 (t72 Transferencia de Fran no cuenta -- es la parte de otra persona en un gasto
  // compartido, se netea a 0 por ingresoNetoTx()).
  check('(setup) Balance de agosto arranca mostrando el total de ingresos original ($1.430.000)', /1\.430\.000/.test(balanceAntes || ''), balanceAntes);

  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(100);
  await page.click('[data-tx="t6"]');
  await page.waitForTimeout(200);
  const montoOriginalT6 = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 't6').monto);
  await page.fill('[data-tx-field="monto"]', '1300000');
  await page.evaluate(() => document.querySelector('[data-tx-field="monto"]').blur());
  await page.waitForTimeout(200);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(100);
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  const balanceTrasEditar = await page.evaluate(() => document.querySelector('.stat-ingresos .stat-value')?.textContent || null);
  // 1.430.000 + (1.300.000 - 1.250.000) = 1.480.000
  check('(c) Balance > Ingresos ya refleja el monto editado sin más pasos ($1.480.000)', /1\.480\.000/.test(balanceTrasEditar || ''), { balanceTrasEditar, montoOriginalT6 });

  // (d) Con una transacción dividida en VARIAS categorías (t1: Jumbo Ñuñoa, $45.000 = $31.500
  // supermercado + $13.500 hogar, 70/30), editar el monto total reescala cada categoría
  // proporcionalmente en vez de dejarlas con la suma vieja -- si no, Balance/Presupuesto
  // seguirían viendo $45.000 repartidos aunque el monto real ya diga otra cosa.
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(100);
  await page.click('[data-tx="t1"]');
  await page.waitForTimeout(200);
  await page.fill('[data-tx-field="monto"]', '90000');
  await page.evaluate(() => document.querySelector('[data-tx-field="monto"]').blur());
  await page.waitForTimeout(150);
  const t1TrasEditar = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 't1'));
  const sumaCategorias = t1TrasEditar.categorias.reduce((s, c) => s + c.monto, 0);
  check('(d) Reescala proporcionalmente cada categoría al editar el monto de una tx dividida (70/30 se mantiene)',
    sumaCategorias === 90000 && t1TrasEditar.categorias[0].monto === 63000 && t1TrasEditar.categorias[1].monto === 27000, t1TrasEditar.categorias);

  await finish({ context, browser, errors });
})();
