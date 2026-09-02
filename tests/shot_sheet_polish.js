const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  const listCheck = await page.evaluate(() => {
    const dayLabels = Array.from(document.querySelectorAll('.day-label')).map(e => e.textContent);
    const list = document.querySelector('.tx-list');
    const cs = list ? getComputedStyle(list) : null;
    // El chequeo de "separador solo entre filas" solo es observable en un día con >=2
    // transacciones -- cuál día tiene eso depende de los datos de demo relativos a la fecha
    // real de hoy (cambia con el calendario), así que buscamos el PRIMER grupo con 2+ filas
    // en vez de asumir que el primer grupo de la lista siempre tiene varias.
    const allLists = Array.from(document.querySelectorAll('.tx-list'));
    const multiList = allLists.find(l => l.querySelectorAll('.tx-item').length >= 2) || null;
    const multiItems = multiList ? Array.from(multiList.querySelectorAll('.tx-item')) : [];
    return {
      firstDayLabel: dayLabels[0],
      listBg: cs ? cs.backgroundColor : null,
      listRadius: cs ? cs.borderRadius : null,
      foundMultiDayGroup: !!multiList,
      nItemsInMultiGroup: multiItems.length,
      lastItemBorderBottom: multiItems.length ? getComputedStyle(multiItems[multiItems.length - 1]).borderBottomWidth : null,
      firstItemBorderBottom: multiItems.length ? getComputedStyle(multiItems[0]).borderBottomWidth : null,
    };
  });
  check('1) Fecha del grupo con mayúscula solo en la primera letra (no MAYÚSCULAS)', /^[A-ZÁÉÍÓÚ][a-záéíóúñ]+ \d+ de [a-záéíóúñ]+$/.test(listCheck.firstDayLabel), listCheck.firstDayLabel);
  check('2) La lista de transacciones del día es una sola tarjeta encapsulada (fondo/radio propios)', listCheck.listBg !== 'rgba(0, 0, 0, 0)', { listBg: listCheck.listBg, listRadius: listCheck.listRadius });
  check('   Última fila sin borde inferior (separador solo entre filas)', listCheck.foundMultiDayGroup && listCheck.lastItemBorderBottom === '0px' && listCheck.firstItemBorderBottom !== '0px', { found: listCheck.foundMultiDayGroup, nItems: listCheck.nItemsInMultiGroup, last: listCheck.lastItemBorderBottom, first: listCheck.firstItemBorderBottom });

  const medioIconCheck = await page.evaluate(() => {
    // t2 = Copec Providencia, pagada con visa_bch (tarjeta) -> debe verse 💳
    const items = Array.from(document.querySelectorAll('.tx-item'));
    let cardRow = null, cashRow = null;
    items.forEach(it => {
      const sub = it.querySelector('.tx-right-sub');
      if (!sub) return;
      if (sub.textContent.includes('4821') && !cardRow) cardRow = sub.innerHTML;
    });
    // Forzamos una transacción en efectivo para revisar el ícono de bolsa de plata.
    const d = window.__debug;
    d.TX.push({id:'tefec', fecha:'2026-08-20', hora:'10:00', comercio:'Test efectivo', monto:1000,
      medio:'efectivo', tipo:'gasto', recurrencia:'variable', estado:'confirmado',
      categorias:[{cat:'supermercado',monto:1000}], porCobrar:[], reglaAuto:false, nota:''});
    d.render();
    return { cardRowHtml: cardRow };
  });
  await page.waitForTimeout(150);
  const cashIconCheck = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.tx-item'));
    let cashRow = null;
    items.forEach(it => {
      const name = it.querySelector('.tx-name');
      const sub = it.querySelector('.tx-right-sub');
      if (name && name.textContent === 'Test efectivo' && sub) cashRow = sub.innerHTML;
    });
    return { cashRowHtml: cashRow };
  });
  check('3) Fila pagada con tarjeta muestra 💳 junto a los últimos dígitos', medioIconCheck.cardRowHtml && medioIconCheck.cardRowHtml.includes('💳'), medioIconCheck.cardRowHtml);
  check('   Fila en efectivo muestra 💰 (bolsa de plata)', cashIconCheck.cashRowHtml && cashIconCheck.cashRowHtml.includes('💰'), cashIconCheck.cashRowHtml);

  // 4) Detalle de una transacción: Monto/Fecha/Hora editables, con eco en vivo y día calculado.
  await page.evaluate(() => { window.__debug.render(); });
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  const sheetBefore = await page.evaluate(() => {
    const montoInput = document.querySelector('[data-tx-field="monto"]');
    const echo = document.querySelector('.edit-amount-echo');
    const fechaInput = document.querySelector('[data-tx-field="fecha"]');
    const horaInput = document.querySelector('[data-tx-field="hora"]');
    const dayHint = document.querySelector('.edit-day-hint');
    const header = document.querySelector('.sheet-top .meta');
    const merchant = document.querySelector('.merchant');
    const amount = document.querySelector('.sheet-amount');
    return {
      montoValue: montoInput ? montoInput.value : null,
      echoText: echo ? echo.textContent : null,
      fechaValue: fechaInput ? fechaInput.value : null,
      horaValue: horaInput ? horaInput.value : null,
      dayHintText: dayHint ? dayHint.textContent : null,
      headerText: header ? header.textContent : null,
      merchantText: merchant ? merchant.textContent : null,
      amountText: amount ? amount.textContent : null,
    };
  });
  console.log('4a) Sheet de Copec Providencia antes de editar:', JSON.stringify(sheetBefore));
  console.log('    Encabezado mantiene el formato "día · hora · medio" de siempre:', sheetBefore.headerText);

  await page.fill('[data-tx-field="monto"]', '25000');
  await page.waitForTimeout(100);
  await page.fill('[data-tx-field="fecha"]', '2026-08-19');
  await page.waitForTimeout(100);
  const sheetAfter = await page.evaluate(() => {
    const echo = document.querySelector('.edit-amount-echo');
    const dayHint = document.querySelector('.edit-day-hint');
    const header = document.querySelector('.sheet-top .meta');
    const amount = document.querySelector('.sheet-amount');
    const tx = window.__debug.TX.find(t => t.id === 't2');
    return {
      echoText: echo ? echo.textContent : null,
      dayHintText: dayHint ? dayHint.textContent : null,
      headerText: header ? header.textContent : null,
      amountText: amount ? amount.textContent : null,
      txMonto: tx.monto,
      txFecha: tx.fecha,
    };
  });
  console.log('4b) Tras editar Monto a 25000 y Fecha a 2026-08-19 (sin perder el foco / sin renderSheet completo):', JSON.stringify(sheetAfter));
  check('tx.monto actualizado a 25000', sheetAfter.txMonto === 25000, sheetAfter.txMonto);
  check('tx.fecha actualizada a 2026-08-19', sheetAfter.txFecha === '2026-08-19', sheetAfter.txFecha);
  check('Eco del monto se actualizó en vivo', sheetAfter.echoText.includes('25.000'), sheetAfter.echoText);
  check('Día calculado se actualizó (miércoles 19 de agosto, en minúscula)', sheetAfter.dayHintText === 'miércoles 19 de agosto', sheetAfter.dayHintText);
  check('Encabezado también se actualizó en vivo', sheetAfter.headerText.includes('miércoles 19 de agosto'), sheetAfter.headerText);

  await finish({ context, browser, errors });
})();
