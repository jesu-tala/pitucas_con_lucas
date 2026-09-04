const { openApp, check, finish } = require('./lib/test_kit');

// Before the goals-based redesign of investment categorization, this audit checked that
// PLATFORM_DATA.banco_chile.valorHistorial (a hand-typed "current value" curve) equalled the sum
// of its two goals' own hand-typed historial curves, month by month -- a fixture-data invariant
// that made sense back when both were manually maintained numbers meant to agree with each other.
//
// Now a Goal's progress (metaAportadoNeto/metaHistorialAt) is computed straight from whichever
// transactions are categorized to it (plus its startingAmount seed), and a Platform's Aportado
// neto (platformAportadoNeto) is a rollup of its own goals' progress plus its General bucket --
// there's no longer a separate "value curve" per goal to compare against valorHistorial (which
// stays a platform-level, hand-typed *current value*, a different concept than *net
// contributed*). So this audit now checks the invariants that DO hold under the new design:
// 1) a platform's Aportado neto equals the sum of its own goals' Aportado neto (rollup
//    correctness -- this is what makes categorizing to a goal also count toward its platform,
//    per the user's request).
// 2) a goal's cumulative historial at its latest tracked month equals its own Aportado neto
//    (the point-in-time function and the running total must agree).
(async () => {
  const { context, browser, page, errors } = await openApp();

  const result = await page.evaluate(() => {
    const D = window.__debug;
    const platformIds = D.platformIds();
    const rollup = {};
    platformIds.forEach(id => {
      const metas = D.INVESTMENT_GOALS.filter(m => m.plataformaId === id);
      const sumMetas = metas.reduce((s, m) => s + D.metaAportadoNeto(m), 0);
      const generalId = id + '__general';
      const generalAmount = D.TRANSACTIONS
        .filter(t => t.tipo === 'inversion')
        .reduce((s, t) => s + t.categorias.filter(c => c.cat === generalId).reduce((ss, c) => ss + c.monto, 0), 0);
      const platformTotal = D.platformAportadoNeto(id);
      rollup[id] = { sumMetas, generalAmount, platformTotal, match: platformTotal === sumMetas + generalAmount };
    });
    const historialConsistency = {};
    D.INVESTMENT_GOALS.forEach(m => {
      const months = D.metaMonths ? D.metaMonths(m) : [];
      const lastMonth = months[months.length - 1];
      const historialAtLast = D.metaHistorialAt ? D.metaHistorialAt(m, lastMonth) : null;
      const aportadoNeto = D.metaAportadoNeto(m);
      historialConsistency[m.id] = { lastMonth, historialAtLast, aportadoNeto, match: historialAtLast === aportadoNeto };
    });
    return { rollup, historialConsistency };
  });
  console.log(JSON.stringify(result, null, 1));

  check('Aportado neto de cada plataforma == suma de sus metas + su bucket General', Object.values(result.rollup).every(r => r.match), result.rollup);
  check('El historial acumulado de cada meta en su último mes coincide con su Aportado neto', Object.values(result.historialConsistency).every(r => r.match), result.historialConsistency);

  await finish({ context, browser, errors });
})();
