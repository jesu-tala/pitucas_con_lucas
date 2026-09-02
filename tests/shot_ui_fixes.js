const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // 1) header respeta safe-area-inset-top (en este navegador normal el inset es 0, pero
  // confirmamos que la fórmula calc() se aplica sin romper el padding base de 20px)
  const headerPadTop = await page.evaluate(() => getComputedStyle(document.querySelector('.app-header')).paddingTop);
  console.log('1) app-header padding-top (esperado 20px con inset=0 en este navegador):', headerPadTop);
  check('1) app-header padding-top === 20px (inset=0)', headerPadTop === '20px', headerPadTop);

  // 2) inputs vuelven a 16px SOLO mientras están enfocados (evita el zoom de iOS), y
  // recuperan su tamaño normal al perder el foco
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

  // 3) el botón + no queda tapado por la barra inferior: su borde inferior debe estar
  // claramente por ENCIMA del borde superior de la tabbar (con margen)
  const fabBox = await page.$eval('#fab-add', el => el.getBoundingClientRect());
  const tabbarBox = await page.$eval('#tabbar', el => el.getBoundingClientRect());
  const fabClearsTabbar = fabBox.bottom <= tabbarBox.top + 1;
  check('3) botón + no se superpone con la barra inferior (fab.bottom<=tabbar.top)', fabClearsTabbar, {fabBottom:fabBox.bottom, tabbarTop:tabbarBox.top});

  // cerrar el sheet de "nueva transacción" sin guardar (para no ensuciar el resto de la prueba)
  await page.click('#sheet-close-btn');
  await page.waitForTimeout(150);

  // 4) botón "Listo" en el detalle de una transacción existente
  await page.click('.tx-item');
  await page.waitForTimeout(200);
  const tieneListo = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Listo'));
  check('4) el detalle de una transacción existente tiene un botón "Listo"', tieneListo);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);
  const sheetCerradoConListo = await page.evaluate(() => !document.getElementById('sheet-overlay').classList.contains('open'));
  check('   y al apretarlo cierra el sheet', sheetCerradoConListo);

  // 5) se puede cambiar el medio de pago de una transacción ya existente
  await page.click('.tx-item');
  await page.waitForTimeout(200);
  const medioSelect = await page.$('[data-tx-medio-select]');
  check('5) existe un selector de medio de pago en el detalle', medioSelect !== null);
  if (medioSelect) {
    const txId = await medioSelect.getAttribute('data-tx-medio-select');
    const options = await medioSelect.evaluate(el => [...el.options].map(o => o.value));
    // elegimos la ÚLTIMA opción de la lista (si hay más de un medio, será distinta a la actual)
    const nuevoValor = options[options.length - 1];
    await medioSelect.selectOption(nuevoValor);
    await page.waitForTimeout(150);
    const medioActualizado = await page.evaluate((id) => window.__debug.TX.find(t => t.id === id).medio, txId);
    check('   tras elegir la última opción, quedó guardado ese medio', medioActualizado === nuevoValor, { options, nuevoValor, medioActualizado });
  }

  await finish({ context, browser, errors });
})();
