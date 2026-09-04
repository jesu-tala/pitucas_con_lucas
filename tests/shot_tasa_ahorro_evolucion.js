// Regresión: "Tasa de ahorro" en Evolución se calculaba como (ingresos-gastos)/ingresos --
// "lo que sobró" del mes, que puede incluir plata sin invertir todavía sentada en la cuenta
// corriente, no necesariamente ahorro real. Ahora es inversiones/ingresos: cuánto de lo que
// ganaste realmente destinaste a invertir. "Tasa de gastos" (gastos/ingresos) no cambió.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const datos = await page.evaluate(() => {
    const D = window.__debug;
    // Agosto 2026 tiene ingresos, gastos e inversiones reales en el fixture de ejemplo.
    const mes = D.monthTotals('2026-08');
    const anio = D.yearTotals(2026);
    return { mes, anio };
  });

  check('(setup) El mes de prueba tiene ingresos e inversiones reales (para que el chequeo tenga sentido)',
    datos.mes.ingresos > 0 && datos.mes.inversiones > 0, datos.mes);

  const tasaAhorroEsperadaMes = (datos.mes.inversiones / datos.mes.ingresos) * 100;
  check('Tasa de ahorro mensual = inversiones/ingresos (no (ingresos-gastos)/ingresos)',
    Math.abs(datos.mes.tasaAhorro - tasaAhorroEsperadaMes) < 0.01, { real: datos.mes.tasaAhorro, esperada: tasaAhorroEsperadaMes });

  const tasaGastosEsperadaMes = (datos.mes.gastos / datos.mes.ingresos) * 100;
  check('Tasa de gastos mensual sigue siendo gastos/ingresos (sin cambios)',
    Math.abs(datos.mes.tasaGastos - tasaGastosEsperadaMes) < 0.01, { real: datos.mes.tasaGastos, esperada: tasaGastosEsperadaMes });

  const tasaAhorroEsperadaAnio = datos.anio.ingresos > 0 ? (datos.anio.inversiones / datos.anio.ingresos) * 100 : 0;
  check('Tasa de ahorro anual (yearTotals) también usa inversiones/ingresos',
    Math.abs(datos.anio.tasaAhorro - tasaAhorroEsperadaAnio) < 0.01, { real: datos.anio.tasaAhorro, esperada: tasaAhorroEsperadaAnio });

  // La UI (detalle del mes en Evolución) tiene que mostrar el mismo número que calcula
  // monthTotals(), no un valor recalculado aparte que se desincronice.
  await page.evaluate(() => { window.__debug.state.tab = 'resumen'; window.__debug.state.summarySub = 'evolucion'; window.__debug.render(); });
  await page.waitForTimeout(200);
  const uiTexto = await page.evaluate(() => document.getElementById('resumen-content').textContent);
  check('La vista de Evolución muestra el % de tasa de ahorro recalculado (redondeado)',
    uiTexto.includes(Math.round(datos.mes.tasaAhorro) + '%') || uiTexto.includes(Math.round(datos.anio.tasaAhorro) + '%'), { esperadoMes: Math.round(datos.mes.tasaAhorro), esperadoAnio: Math.round(datos.anio.tasaAhorro) });

  await finish({ context, browser, errors });
})();
