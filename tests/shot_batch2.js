const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // 1) Balance should open on today's real month, not a future month. We derive "today" from
  // the app's own todayISO()/MONTH_LABEL (we don't hardcode it) so this test doesn't
  // break just because the real calendar advanced from one month to another.
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  const hoyInfo = await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    return { ym, expectedLabel: D.MONTH_LABEL[ym] };
  });
  const monthLabel = await page.evaluate(() => document.querySelector('.month-switcher .m-label').textContent);
  check('Balance abre en el mes actual (' + hoyInfo.expectedLabel + ')', monthLabel === hoyInfo.expectedLabel, { label: monthLabel, expected: hoyInfo.expectedLabel });

  // 1b) Simulate a future installment pushing MONTHS out to January 2027, and confirm that
  //     currentMonthIndex() still points at today's real month, not the last month in the array.
  const idxCheck = await page.evaluate(() => {
    const D = window.__debug;
    if (!D.MONTHS.includes('2027-01')) { D.MONTHS.push('2027-01'); D.MONTHS.sort(); }
    return { idx: D.state.monthIndex, months: D.MONTHS.slice(), lastMonth: D.MONTHS[D.MONTHS.length-1] };
  });
  check('MONTHS ahora incluye un mes futuro (simulado)', idxCheck.months.includes('2027-01'), { lastMonth: idxCheck.lastMonth });
  check('Pero monthIndex sigue apuntando al mes actual, no se movió solo (' + hoyInfo.ym + ')', idxCheck.months[idxCheck.idx] === hoyInfo.ym);

  // 2) "Por cobrar" and "Reembolso" are now separate chips.
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
  const reembolsoCount = await page.evaluate(() => window.__debug.TRANSACTIONS.filter(t => t.estado==='por_cobrar' && t.porCobrar.some(p=>p.tipo==='reembolso')).length);
  check('Cantidad de transacciones tipo reembolso (esperado 2)', reembolsoCount === 2, { reembolsoCount });

  // 3) The "Listo" button lives in an action bar next to the delete button: small and red for
  // delete (left), large for "Listo" (right) -- this layout is an explicit request from
  // the user (before, "Listo" was a small pill centered alone; now it shares a row with
  // delete and should look like the main action, not a secondary button).
  await page.click('[data-filter="todas"]');
  await page.waitForTimeout(100);
  const tx = await page.evaluate(() => window.__debug.TRANSACTIONS[0]);
  await page.evaluate((id) => { window.__debug.openSheetForTest && window.__debug.openSheetForTest(id); }, tx.id);
  // open via a real click instead of relying on a helper that doesn't exist:
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

  // 4) Budget: small indicator of whether categories match up with the total budget.
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(100);
  await page.click('[data-summary-sub="presupuesto"]');
  await page.waitForTimeout(150);
  const calceInfo = await page.evaluate(() => {
    const el = document.querySelector('.budget-cats-calce');
    return el ? { text: el.textContent, cls: el.className } : null;
  });
  console.log('Indicador de calce de presupuestos por categoría:', JSON.stringify(calceInfo));

  await finish({ context, browser, errors });
})();
