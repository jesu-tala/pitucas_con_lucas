const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 420, height: 1400 } });

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t2 = Copec Providencia, normal expense with no active rule yet
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/sheet_format_1.png' });

  const sheetAbrio = await page.evaluate(() => {
    const overlay = document.getElementById('sheet-overlay');
    return overlay && overlay.classList.contains('open') && document.body.textContent.includes('Copec Providencia');
  });
  check('El sheet de detalle abrió y muestra el comercio (Copec Providencia)', sheetAbrio);

  const reglaAutoAntes = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 't2').reglaAuto);

  // Toggle the automatic rule on/off to see the "already classified" state (tinted card)
  await page.click('[data-toggle-lock="t2"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/sheet_format_2.png' });
  const reglaAutoMedio = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 't2').reglaAuto);

  // Revert and look for a transaction with status 'por_cobrar' to see that block too
  await page.click('[data-toggle-lock="t2"]');
  await page.waitForTimeout(100);
  const reglaAutoFinal = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 't2').reglaAuto);

  check('Toggle de reglaAuto cambia de estado en el primer click', reglaAutoMedio !== reglaAutoAntes, { reglaAutoAntes, reglaAutoMedio });
  check('Toggle de reglaAuto vuelve al estado original tras un segundo click', reglaAutoFinal === reglaAutoAntes, { reglaAutoAntes, reglaAutoFinal });

  await page.click('#sheet-close, .sheet-close');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
