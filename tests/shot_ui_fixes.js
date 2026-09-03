const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // 1) header respects safe-area-inset-top (in this normal browser the inset is 0, but
  // we confirm the calc() formula applies without breaking the 20px base padding)
  const headerPadTop = await page.evaluate(() => getComputedStyle(document.querySelector('.app-header')).paddingTop);
  console.log('1) app-header padding-top (esperado 20px con inset=0 en este navegador):', headerPadTop);
  check('1) app-header padding-top === 20px (inset=0)', headerPadTop === '20px', headerPadTop);

  // 2) inputs go back to 16px ONLY while focused (avoids iOS zoom), and
  // recover their normal size when they lose focus
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  await page.click('#fab-add');
  await page.waitForTimeout(200);
  const comercioInput = await page.$('[data-draft-field="comercio"]');
  const sizeBeforeFocus = await comercioInput.evaluate(el => getComputedStyle(el).fontSize);
  await comercioInput.focus();
  const sizeOnFocus = await comercioInput.evaluate(el => getComputedStyle(el).fontSize);
  await comercioInput.evaluate(el => el.blur());
  const sizeAfterBlur = await comercioInput.evaluate(el => getComputedStyle(el).fontSize);
  console.log('2) tamaño de letra: reposo=' + sizeBeforeFocus + ' enfocado=' + sizeOnFocus + ' (esperado 16px) despues=' + sizeAfterBlur);
  check('2) Tamaño de letra enfocado === 16px (evita zoom iOS)', sizeOnFocus === '16px', { sizeBeforeFocus, sizeOnFocus, sizeAfterBlur });

  // 3) the + button isn't covered by the bottom bar: its bottom edge must be
  // clearly ABOVE the top edge of the tabbar (with margin)
  const fabBox = await page.$eval('#fab-add', el => el.getBoundingClientRect());
  const tabbarBox = await page.$eval('#tabbar', el => el.getBoundingClientRect());
  const fabClearsTabbar = fabBox.bottom <= tabbarBox.top + 1;
  check('3) botón + no se superpone con la barra inferior (fab.bottom<=tabbar.top)', fabClearsTabbar, {fabBottom:fabBox.bottom, tabbarTop:tabbarBox.top});

  // close the "new transaction" sheet without saving (to avoid polluting the rest of the test)
  await page.click('#sheet-close-btn');
  await page.waitForTimeout(150);

  // 4) "Done" button in the detail of an existing transaction
  await page.click('.tx-item');
  await page.waitForTimeout(200);
  const tieneListo = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Listo'));
  check('4) el detalle de una transacción existente tiene un botón "Listo"', tieneListo);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);
  const sheetCerradoConListo = await page.evaluate(() => !document.getElementById('sheet-overlay').classList.contains('open'));
  check('   y al apretarlo cierra el sheet', sheetCerradoConListo);

  // 5) the payment method of an already-existing transaction can be changed
  await page.click('.tx-item');
  await page.waitForTimeout(200);
  const medioSelect = await page.$('[data-tx-payment-method-select]');
  check('5) existe un selector de medio de pago en el detalle', medioSelect !== null);
  if (medioSelect) {
    const txId = await medioSelect.getAttribute('data-tx-payment-method-select');
    const options = await medioSelect.evaluate(el => [...el.options].map(o => o.value));
    // we pick the LAST option in the list (if there's more than one method, it'll differ from the current one)
    const nuevoValor = options[options.length - 1];
    await medioSelect.selectOption(nuevoValor);
    await page.waitForTimeout(150);
    const medioActualizado = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id).medio, txId);
    check('   tras elegir la última opción, quedó guardado ese medio', medioActualizado === nuevoValor, { options, nuevoValor, medioActualizado });
  }

  await finish({ context, browser, errors });
})();
