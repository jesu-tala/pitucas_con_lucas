const { openApp, check, finish } = require('./lib/test_kit');

function parseMoney(txt){
  if(txt==null) return NaN;
  let t = txt.trim();
  const neg = /^-|^−/.test(t);
  t = t.replace(/[^\d]/g,'');
  const v = parseInt(t,10) || 0;
  return neg ? -v : v;
}

// Compares two figures with a tolerance and reports through the shared check() — same
// "OK/FAIL" criterion this script had before, just now going through the common harness.
function checkClose(label, a, b, tol){
  tol = tol==null ? 1 : tol;
  const ok = Math.abs((a||0)-(b||0)) <= tol;
  check(label, ok, { a, b, tol });
}

(async () => {
  const { context, browser, page, errors } = await openApp();

  const truth = await page.evaluate(() => {
    const D = window.__debug;
    const realMonths = ['2026-04','2026-05','2026-06','2026-07','2026-08'];
    const perMonth = {};
    realMonths.forEach(m => { perMonth[m] = D.monthTotals(m); });
    const platforms = D.platformIds();
    const platformData = {};
    platforms.forEach(id => {
      platformData[id] = { valorActual: D.platformCurrentValue(id), aportadoNeto: D.platformAportadoNeto(id) };
    });
    const metas = D.INVESTMENT_GOALS.map(m => ({ id: m.id, nombre: m.nombre, plataformaId: m.plataformaId, acumulado: D.metaAcumuladoActual(m), objetivo: m.montoObjetivo }));
    const totalValorPlataformas = platforms.reduce((s,id)=>s+platformData[id].valorActual,0);
    const totalAportadoPlataformas = platforms.reduce((s,id)=>s+platformData[id].aportadoNeto,0);
    // "Objetivo de inversión [año]" is a FLOW metric (see annualInvestmentGoalProgress in
    // views/evolucion.ts) -- computed here from scratch, independently, straight from raw
    // TRANSACTIONS/INVESTMENT_GOALS (never by calling the app's own function and comparing it to
    // itself) so this audit can actually catch a stock-vs-flow mislabeling bug, the exact kind
    // the old totalGoalProgress()-based check would never have noticed.
    const anio = D.todayISO().slice(0,4);
    const fixedGoalIdsTruth = new Set(D.INVESTMENT_GOALS.filter(m => m.aporteMensualMeta != null).map(m => m.id));
    const objetivoAnualTruth = D.INVESTMENT_GOALS.reduce((s,m) => s + (m.aporteMensualMeta || 0), 0) * 12;
    let aporteAnioTruth = 0, otrosAporteAnioTruth = 0;
    D.TRANSACTIONS.forEach(t => {
      if (t.tipo !== 'inversion' || t.estado === 'no_es_gasto' || t.fecha.slice(0,4) !== anio) return;
      t.categorias.forEach(c => {
        if (fixedGoalIdsTruth.has(c.cat)) aporteAnioTruth += c.monto;
        else otrosAporteAnioTruth += c.monto;
      });
    });
    const annualGoalProgress = { objetivoAnualTruth, aporteAnioTruth, otrosAporteAnioTruth };
    const year2026 = D.yearTotals('2026');
    // Average of the last 3 months for the Projection card — we replicate EXACTLY
    // the criterion from projectedContributions() in plata-clara.html (MONTHS filtered to <= the real
    // current month, last 3), instead of assuming it's always the last 3 months "with demo data"
    // (realMonths is a fixed list; as the real calendar advances, the current month gets
    // added to MONTHS and enters that average even though it doesn't have data yet, so a hardcode
    // here would get out of sync with what the app actually shows).
    const mesActual = D.todayISO().slice(0,7);
    const mesesProyeccion = D.MONTHS.filter(m => m <= mesActual).slice(-3);
    const last3 = mesesProyeccion.map(m=>D.monthTotals(m).inversiones);
    const avgLast3 = last3.length ? last3.reduce((a,b)=>a+b,0)/last3.length : 0;
    // banco_chile: its Aportado neto (a rollup, see platformAportadoNeto in views/inversiones.ts)
    // should equal the sum of its own goals' Aportado neto -- it has no General-bucket
    // transactions in the fixture, so nothing else should be feeding that rollup. This is a
    // different invariant than before the goals-based redesign: a goal no longer has its own
    // manually-tracked "current value" curve to compare against the platform's (that concept
    // only lives at the platform level now, via PLATFORM_DATA.valorHistorial) -- see the note on
    // INVESTMENT_GOALS in state.ts.
    const bchMetas = D.INVESTMENT_GOALS.filter(m=>m.plataformaId==='banco_chile');
    const bchMetasSum = bchMetas.reduce((s,m)=>s+D.metaAcumuladoActual(m),0);
    const defaultPlanBase = D.computeDefaultPlanBase();
    return { perMonth, platformData, metas, totalValorPlataformas, totalAportadoPlataformas, annualGoalProgress, year2026, avgLast3, bchMetasSum, defaultPlanBase };
  });
  const realMonths = ['2026-04','2026-05','2026-06','2026-07','2026-08'];

  console.log('=== GROUND TRUTH ===');
  console.log(JSON.stringify(truth, null, 1));

  // ---------- Balance view: per real month ----------
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  // jump to the first real month (index 0): click back until disabled
  for(let i=0;i<10;i++){
    const disabled = await page.$eval('[data-month-nav="-1"]', el=>el.disabled).catch(()=>true);
    if(disabled) break;
    await page.click('[data-month-nav="-1"]');
    await page.waitForTimeout(80);
  }
  const balanceByMonth = {};
  const presupuestoByMonth = {};
  const evoDetailByMonth = {};
  for (const mKey of realMonths){
    const label = await page.$eval('.m-label', el=>el.textContent);
    const ingresos = await page.$eval('.stat-ingresos .stat-value', el=>parseInt(el.textContent.replace(/[^\d\-]/g,''),10)||0);
    const gastos = await page.$eval('.stat-gastos .stat-value', el=>parseInt(el.textContent.replace(/[^\d\-]/g,''),10)||0);
    const inversiones = await page.$eval('.stat-inversiones .stat-value', el=>parseInt(el.textContent.replace(/[^\d\-]/g,''),10)||0);
    balanceByMonth[mKey] = {label, ingresos, gastos, inversiones};
    await page.click('[data-month-nav="1"]');
    await page.waitForTimeout(100);
  }
  console.log('\n=== BALANCE VIEW per month ===');
  console.log(JSON.stringify(balanceByMonth,null,1));

  // ---------- Presupuesto view: total gasto per month + sum of category cards ----------
  await page.click('[data-summary-sub="presupuesto"]');
  await page.waitForTimeout(150);
  for(let i=0;i<10;i++){
    const disabled = await page.$eval('[data-month-nav="-1"]', el=>el.disabled).catch(()=>true);
    if(disabled) break;
    await page.click('[data-month-nav="-1"]');
    await page.waitForTimeout(80);
  }
  for (const mKey of realMonths){
    const totalGastado = await page.$eval('.budget-total-figs .gastado', el=>parseInt(el.textContent.replace(/[^\d\-]/g,''),10)||0);
    // sum every category card's "gastado" figure (both con/sin presupuesto — con shows gastado/meta, sin shows nothing so skip those without a value)
    const catSum = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.budget-cat-card:not(.empty)')];
      return cards.reduce((s,c)=>{
        const el = c.querySelector('.gastado');
        if(!el) return s;
        const txt = el.textContent.replace(/[^\d]/g,'');
        return s + (parseInt(txt,10)||0);
      }, 0);
    });
    presupuestoByMonth[mKey] = {totalGastado, catSum};
    await page.click('[data-month-nav="1"]');
    await page.waitForTimeout(100);
  }
  console.log('\n=== PRESUPUESTO VIEW per month ===');
  console.log(JSON.stringify(presupuestoByMonth,null,1));

  // ---------- Evolución view: per-month detail + year totals ----------
  await page.click('[data-summary-sub="evolucion"]');
  await page.waitForTimeout(200);
  for (const mKey of realMonths){
    await page.click(`[data-evo-month="${mKey}"]`);
    await page.waitForTimeout(120);
    const detail = await page.evaluate(() => {
      // The month-specific detail row is the FIRST .evo-detail-row on the page — the
      // second one belongs to the separate "Total del año" card further down.
      const row = document.querySelector('.evo-detail-row');
      const items = row ? [...row.querySelectorAll('.evo-detail-item')] : [];
      const out = {};
      items.forEach(it=>{
        const label = it.querySelector('.evo-detail-label')?.textContent.trim();
        const val = it.querySelector('.evo-detail-value')?.textContent.trim();
        if(label) out[label]=val;
      });
      return out;
    });
    evoDetailByMonth[mKey] = detail;
  }
  const yearCardText = await page.evaluate(() => {
    const title = [...document.querySelectorAll('.section-title')].find(el => el.textContent.includes('Total del año'));
    return title ? title.nextElementSibling.innerText : null;
  });
  console.log('\n=== EVOLUCION VIEW per-month detail ===');
  console.log(JSON.stringify(evoDetailByMonth,null,1));
  console.log('\n=== EVOLUCION year card ===\n', yearCardText);

  // ---------- Inversiones view: platform + meta cards ----------
  // Platforms are now an accordion closed by default (state.openPlatformId) -- their
  // figures (Total on this platform / Net contributed) and each one's goal summary only
  // exist in the DOM while it's open, so each one has to be opened (one at a time, since
  // opening another one closes the previous one) in order to read them.
  await page.click('[data-summary-sub="inversiones"]');
  await page.waitForTimeout(200);
  const platformIdsOnPage = await page.evaluate(() => [...document.querySelectorAll('[data-toggle-platform]')].map(el=>el.getAttribute('data-toggle-platform')));
  const platformCardData = {};
  let bchCombinedText = null;
  for (const id of platformIdsOnPage){
    await page.click(`[data-toggle-platform="${id}"]`);
    await page.waitForTimeout(120);
    const result = await page.evaluate((pid) => {
      const btn = document.querySelector(`[data-edit-platform="${pid}"]`);
      const card = btn ? btn.closest('.platform-group') : null;
      const figVals = card ? [...card.querySelectorAll('.platform-fig-value')].map(e=>e.textContent.replace(/[^\d\-]/g,'')) : [];
      const metaHead = card ? card.querySelector('.platform-meta-summary-head') : null;
      const metaSummaryText = metaHead ? metaHead.closest('.platform-meta-summary').innerText : null;
      return { figVals, metaSummaryText };
    }, id);
    platformCardData[id] = { valorEstimado: parseInt(result.figVals[0]||'0',10), aportadoNeto: parseInt(result.figVals[1]||'0',10) };
    if(id==='banco_chile') bchCombinedText = result.metaSummaryText;
  }
  // The totals card shows "Aportado neto" as a tile (.stat-tile) instead of a text line
  // "Aportado neto: $X" -- it's read per element, not via regex over the whole card's
  // innerText. It used to also show a "Ganancia/pérdida aprox." tile -- removed per the
  // user's request, so there's nothing left here to cross-check for it.
  const totalCardInfo = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.platform-total-label')].find(el=>el.textContent.includes('Total invertido'));
    const card = label ? label.closest('.card') : null;
    if(!card) return null;
    const tiles = [...card.querySelectorAll('.stat-tile')];
    const aportadoTile = tiles.find(t=>t.querySelector('.stat-label')?.textContent.includes('Aportado neto'));
    return {
      totalValorText: card.querySelector('.platform-total-value')?.textContent || null,
      aportadoNetoText: aportadoTile ? aportadoTile.querySelector('.stat-value')?.textContent : null,
    };
  });
  const objetivoCardText = await page.evaluate(() => {
    const block = document.querySelector('.platform-total-goal-block');
    return block ? block.innerText : null;
  });
  console.log('\n=== INVERSIONES platform cards ===');
  console.log(JSON.stringify(platformCardData,null,1));
  console.log('\n=== INVERSIONES total card ===\n', JSON.stringify(totalCardInfo));
  console.log('\n=== INVERSIONES objetivo card ===\n', objetivoCardText);
  console.log('\n=== INVERSIONES banco_chile combined metas ===\n', bchCombinedText);

  // The simulator's "Aportando $X/mes" is now an editable <input> (so the user can
  // replace the average with their own amount), not plain text -- so its value doesn't appear in
  // innerText. As long as she hasn't touched it, the real average lives in its placeholder.
  const proyeccionAportePlaceholder = await page.$eval('[data-proj-contribution-input]', el => el.placeholder).catch(() => null);
  console.log('\n=== PROYECCION aporte placeholder (promedio real) ===\n', proyeccionAportePlaceholder);

  const planBaseVal = await page.$eval('[data-plan-base-input]', el=>parseInt(el.value.replace(/[^\d\-]/g,''),10)||0).catch(()=>null);
  console.log('\n=== PLANNER base default ===', planBaseVal);

  // ---------- Now run the actual cross-checks ----------
  console.log('\n\n========== CROSS-CHECKS ==========');
  const pm = s => parseInt((s||'0').replace(/[^\d\-]/g,''),10)||0;
  realMonths.forEach(m=>{
    const t = truth.perMonth[m];
    checkClose('Balance ingresos '+m, balanceByMonth[m].ingresos, t.ingresos);
    checkClose('Balance gastos '+m, balanceByMonth[m].gastos, t.gastos);
    checkClose('Balance inversiones '+m, balanceByMonth[m].inversiones, t.inversiones);
    checkClose('Presupuesto total gasto '+m, presupuestoByMonth[m].totalGastado, t.gastos);
    // catSum intentionally excludes "sin presupuesto" categories (they render with no
    // visible amount) — expected gap is whatever those categories spent, NOT a bug.
    checkClose('Evolucion detail Ingresos '+m, pm(evoDetailByMonth[m]['Ingresos']), t.ingresos);
    checkClose('Evolucion detail Gastos '+m, pm(evoDetailByMonth[m]['Gastos']), t.gastos);
    checkClose('Evolucion detail Inversiones '+m, pm(evoDetailByMonth[m]['Inversiones']), t.inversiones);
    checkClose('Evolucion detail Tasa de ahorro % '+m, pm(evoDetailByMonth[m]['Tasa de ahorro']), Math.round(t.tasaAhorro), 0);
  });

  checkClose('Evolucion year Ingresos', pm(yearCardText.match(/Ingresos\n(\$[\d.]+)/)?.[1]), truth.year2026.ingresos);
  checkClose('Evolucion year Gastos', pm(yearCardText.match(/Gastos\n(\$[\d.]+)/)?.[1]), truth.year2026.gastos);
  checkClose('Evolucion year Inversiones', pm(yearCardText.match(/Inversiones\n(\$[\d.]+)/)?.[1]), truth.year2026.inversiones);

  Object.keys(truth.platformData).forEach(id=>{
    checkClose('Platform '+id+' valorEstimado', platformCardData[id].valorEstimado, truth.platformData[id].valorActual);
    checkClose('Platform '+id+' aportadoNeto', platformCardData[id].aportadoNeto, truth.platformData[id].aportadoNeto);
  });

  checkClose('Total invertido card', pm(totalCardInfo.totalValorText), truth.totalValorPlataformas);
  checkClose('Total invertido card aportado neto', pm(totalCardInfo.aportadoNetoText), truth.totalAportadoPlataformas);
  // "Objetivo de inversión [año]" is now a FLOW metric -- the card's first $ figure is this
  // year's contributions to fixed-aporte goals only (aporteAnio), and "de $X" is what those same
  // goals committed to for the year (objetivoAnual = ΣaporteMensualMeta × 12). See the note above
  // annualGoalProgress's computation for why this is checked against an independently-computed
  // truth instead of the app's own annualInvestmentGoalProgress().
  checkClose('Objetivo anual card: aporte del año a metas de aporte fijo', pm(objetivoCardText.match(/\$[\d.]+/)?.[0]), truth.annualGoalProgress.aporteAnioTruth);
  checkClose('Objetivo anual card: objetivo anual (aporteMensualMeta × 12)', pm(objetivoCardText.match(/de (\$[\d.]+)/)?.[1]), truth.annualGoalProgress.objetivoAnualTruth);
  checkClose('Banco de Chile combined metas total', pm(bchCombinedText.match(/\$[\d.]+/)?.[0]), truth.bchMetasSum);
  checkClose('Banco de Chile platform card Aportado neto == sum of its metas (rollup)', platformCardData.banco_chile.aportadoNeto, truth.bchMetasSum);

  checkClose('Proyeccion promedio de los últimos 3 meses', pm(proyeccionAportePlaceholder), Math.round(truth.avgLast3));
  checkClose('Planificador base default', planBaseVal, truth.defaultPlanBase);

  await finish({ context, browser, errors });
})();
