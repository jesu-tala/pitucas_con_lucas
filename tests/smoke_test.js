const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const allErrors = [];
  for (const scheme of ['light', 'dark']) {
    const { context, browser, page, errors } = await openApp({ debug: false, colorScheme: scheme });

    await page.click('[data-tab="transacciones"]'); await page.waitForTimeout(200);
    await page.click('[data-tab="resumen"]'); await page.waitForTimeout(150);
    for (const sub of ['balance','presupuesto','evolucion','inversiones']) {
      await page.click(`[data-summary-sub="${sub}"]`); await page.waitForTimeout(200);
    }
    await page.click('[data-tab="menu"]'); await page.waitForTimeout(150);
    await page.click('[data-tab="resumen"]'); await page.waitForTimeout(150);

    console.log(scheme, 'smoke ERRORS:', JSON.stringify(errors));
    check('Sin errores de JS/consola navegando todas las vistas en modo ' + scheme, errors.length === 0, errors.length ? errors : undefined);
    allErrors.push(...errors);

    await context.close();
    await browser.close();
  }

  // errors were already accumulated/checked per scheme above; we pass an empty array to finish
  // so its automatic check (aggregated, without duplicating what was already reported per scheme)
  // doesn't fail again over errors that were already reported individually.
  await finish({ errors: [] });
})();
