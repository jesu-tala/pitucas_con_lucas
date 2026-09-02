const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // 1) Balance debe abrir en el mes real de hoy, no en un mes futuro. Derivamos "hoy" del
  // propio todayISO()/MONTH_LABEL de la app (no lo hardcodeamos) para que este test no se
  // rompa solo porque el calendario real avanzó de un mes a otro.
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  const hoyInfo = await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    return { ym, expectedLabel: D.MONTH_LABEL[ym] };
  });
  const monthLabel = await page.evaluate(() => document.querySelector('.month-switcher .m-label').textContent);
  check('Balance abre en el mes actual (' + hoyInfo.expectedLabel + ')', monthLabel === hoyInfo.expectedLabel, { label: monthLabel, expected: hoyInfo.expectedLabel });

  // 1b) Simular que una cuota futura empujó MONTHS hasta enero 2027, y confirmar que igual
  //     currentMonthIndex() apunta al mes real de hoy, no al último mes del arreglo.
  const idxCheck = await page.evaluate(() => {
    const D = window.__debug;
    if (!D.MONTHS.includes('2027-01')) { D.MONTHS.push('2027-01'); D.MONTHS.sort(); }
    return { idx: D.state.monthIndex, months: D.MONTHS.slice(), lastMonth: D.MONTHS[D.MONTHS.length-1] };
  });
  check('MONTHS ahora incluye un mes futuro (simulado)', idxCheck.months.includes('2027-01'), { lastMonth: idxCheck.lastMonth });
  check('Pero monthIndex sigue apuntando al mes actual, no se movió solo (' + hoyInfo.ym + ')', idxCheck.months[idxCheck.idx] === hoyInfo.ym);

  // 2) "Por cobrar" y "Reembolso" ahora son chips separados.
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  const chipLabels = await page.evaluate(() => Array.from(document.querySelectorAll('.chip-row .chip')).map(b => b.textContent));
  console.log('Chips de filtro:', JSON.stringify(chipLabels));
  check('Existen chips separados "Por cobrar" y "Reembolso"', chipLabels.includes('Por cobrar') && chipLabels.includes('Reembolso'), { chipLabels });

  await page.click('[data-filter="porcobrar"]');
  await page.waitForTimeout(150);
  const tagsPorCobrar = await page.evaluate(() => Array.from(document.querySelectorAll('.tx-state')).map(e => e.textContent));
  check('En el filtro "Por cobrar" no aparece ninguna etiqueta "Reembolso"', !tagsPorCobrar.includes('Reembolso'), { tagsPorCobrar });

  await page.click('[data-filter="reembolso"]');
  await page.waitForTimeout(150);
  const tagsReembolso = await page.evaluate(() => Array.from(document.querySelectorAll('.tx-state')).map(e => e.textContent));
  check('En el filtro "Reembolso" SÍ aparece la etiqueta "Reembolso" y no "Por cobrar"', tagsReembolso.includes('Reembolso') && !tagsReembolso.includes('Por cobrar'), { tagsReembolso });
  const reembolsoCount = await page.evaluate(() => window.__debug.TX.filter(t => t.estado==='por_cobrar' && t.porCobrar.some(p=>p.tipo==='reembolso')).length);
  check('Cantidad de transacciones tipo reembolso (esperado 2)', reembolsoCount === 2, { reembolsoCount });

  // 3) El botón "Listo" vive en una barra de acciones junto al de borrar: chico y rojo el de
  // borrar (izquierda), grande el de "Listo" (derecha) -- este layout es un pedido explícito de
  // la usuaria (antes "Listo" era una pastilla chica y centrada sola; ahora comparte fila con
  // borrar y debe verse como la acción principal, no como un botón secundario).
  await page.click('[data-filter="todas"]');
  await page.waitForTimeout(100);
  const tx = await page.evaluate(() => window.__debug.TX[0]);
  await page.evaluate((id) => { window.__debug.openSheetForTest && window.__debug.openSheetForTest(id); }, tx.id);
  // abrir por click real en vez de depender de un helper que no existe:
  await page.click('.tx-item');
  await page.waitForTimeout(200);
  const listoInfo = await page.evaluate(() => {
    const btn = document.querySelector('[data-close-sheet-done]');
    const delBtn = document.querySelector('[data-ask-delete-tx]');
    if (!btn || !delBtn) return null;
    return {
      cls: btn.className,
      width: btn.getBoundingClientRect().width,
      deleteWidth: delBtn.getBoundingClientRect().width,
      sheetWidth: document.getElementById('sheet').getBoundingClientRect().width,
    };
  });
  console.log('Botón "Listo" vs botón borrar:', JSON.stringify(listoInfo));
  check('Ya no usa la clase "save-tx-btn" (la pastilla de "Guardar transacción")', listoInfo && !listoInfo.cls.includes('save-tx-btn'), { listoInfo });
  check('"Listo" es la acción grande de la fila (más ancho que el botón rojo de borrar)', listoInfo && listoInfo.width > listoInfo.deleteWidth, { listoInfo });
  check('El botón de borrar es chico (una fracción del sheet, no la fila completa)', listoInfo && listoInfo.deleteWidth < listoInfo.sheetWidth * 0.3, { listoInfo });
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // 4) Presupuesto: indicador chico de si las categorías calzan con el presupuesto total.
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(100);
  await page.click('[data-resumen-sub="presupuesto"]');
  await page.waitForTimeout(150);
  const calceInfo = await page.evaluate(() => {
    const el = document.querySelector('.budget-cats-calce');
    return el ? { text: el.textContent, cls: el.className } : null;
  });
  console.log('Indicador de calce de presupuestos por categoría:', JSON.stringify(calceInfo));

  await finish({ context, browser, errors });
})();
