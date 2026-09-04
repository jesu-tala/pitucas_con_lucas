// Request: the investment simulator's projection used to apply a REAL rate (nominal return
// discounted by the inflation % you typed, via Fisher) so the result was expressed "en pesos de
// hoy" (today's purchasing power). The user asked explicitly to switch it to nominal pesos
// instead (no inflation discount) -- so the "% inflación" input is gone, the label no longer
// says "pesos de hoy", and the math is a straight compound on the return rate alone.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-summary-sub="inversiones"]');
  await page.waitForTimeout(200);

  const antes = await page.evaluate(() => ({
    hayInflacion: !!document.querySelector('[data-proj-inflation-input]'),
    sub: document.querySelector('.proyeccion-sub')?.textContent || '',
    hayRetorno: !!document.querySelector('[data-proj-return-input]'),
  }));
  check('Ya no existe el input de "% inflación"', antes.hayInflacion === false, antes);
  check('El input de "% retorno" sigue existiendo', antes.hayRetorno === true, antes);
  check('El texto ya no dice "pesos de hoy" (dice pesos nominales)', /nominal/i.test(antes.sub) && !/pesos de hoy/i.test(antes.sub), antes.sub);

  // Set a known return % and a known monthly contribution, then verify the shown total matches
  // a plain nominal compound formula computed independently here -- with NO inflation discount
  // anywhere in the math.
  await page.fill('[data-proj-return-input]', '10');
  await page.waitForTimeout(100);
  await page.fill('[data-proj-contribution-input]', '100000');
  await page.waitForTimeout(100);

  const datos = await page.evaluate(() => {
    const D = window.__debug;
    const proy = D.projectedContributions(3, 20);
    return { totalActual: proy.totalActual, anios: proy.anios, proyectadoConRetorno: proy.proyectadoConRetorno };
  });
  const r = 0.10;
  const factor = Math.pow(1+r, datos.anios);
  const aporteAnual = 100000*12;
  const esperado = datos.totalActual*factor + aporteAnual*((factor-1)/r);
  check('El total proyectado calza con un interés compuesto nominal puro (10% anual, sin descontar inflación)',
    Math.abs(datos.proyectadoConRetorno - esperado) < 1, { obtenido: datos.proyectadoConRetorno, esperado });

  await finish({ context, browser, errors });
})();
