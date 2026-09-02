const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const allErrors = [];
  for (const scheme of ['light', 'dark']) {
    const { context, browser, page, errors } = await openApp({ debug: false, colorScheme: scheme });

    await page.click('[data-tab="transacciones"]'); await page.waitForTimeout(200);
    await page.click('[data-tab="resumen"]'); await page.waitForTimeout(150);
    for (const sub of ['balance','presupuesto','evolucion','inversiones']) {
      await page.click(`[data-resumen-sub="${sub}"]`); await page.waitForTimeout(200);
    }
    await page.click('[data-tab="menu"]'); await page.waitForTimeout(150);
    await page.click('[data-tab="resumen"]'); await page.waitForTimeout(150);

    console.log(scheme, 'smoke ERRORS:', JSON.stringify(errors));
    check('Sin errores de JS/consola navegando todas las vistas en modo ' + scheme, errors.length === 0, errors.length ? errors : undefined);
    allErrors.push(...errors);

    await context.close();
    await browser.close();
  }

  // errors ya se acumularon/chequearon por esquema arriba; pasamos un array vacío a finish
  // para que su check automático (agregado, sin duplicar lo ya reportado por esquema) no
  // vuelva a fallar sobre errores que ya fueron reportados individualmente.
  await finish({ errors: [] });
})();
