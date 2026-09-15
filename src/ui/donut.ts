import { esc } from '../esc';
import { catInfo, catNetAmount, catTotalAmount, netExpenseTx, netIncomeFactor, lastSalaryTx } from '../helpers';
import { categoryFillCss } from '../category-colors';
import { ICONS, catIconMarkup, icon } from '../icons';
import { SPENDING_GOAL_PCT, INVESTMENT_GOALS, MONTHS, MONTH_LABEL, money, moneyPlainMasked, state, todayISO } from '../state';
import { monthTotals } from '../views/evolucion';
/* ===================== DONUT SVG ===================== */
export function buildDonut(segments, size, strokeW){
  // segments: [{value, color, id, nombre, extraAttrs?}]
  const total = segments.reduce((s,x)=>s+x.value,0);
  const r = (size/2) - strokeW/2 - 2;
  const cx=size/2, cy=size/2;
  // 6° (used to be 3°) -- a wider gap helps tell apart two neighboring segments that happened
  // to end up with a similar color, without which they look like a single continuous block.
  // Every category now gets its own unique hue (see category-colors.ts), so this is mostly a
  // safety margin rather than the main way of telling segments apart.
  const gapDeg = segments.length>1 ? 6 : 0;
  let startAngle = -90;
  let paths = '';
  if(total<=0){
    paths = '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--border)" stroke-width="'+strokeW+'"/>';
  } else if(segments.length===1){
    // A single segment = 100% of the circle. An SVG arc (the "A" command) can't draw the full
    // loop: the start and end points land in the same place, so the stroke looks like a dot
    // instead of a ring. A full <circle> draws it correctly.
    paths = '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+segments[0].color+'" stroke-width="'+strokeW+'"/>';
  } else {
    // A real (nonzero) segment always gets at least this much visible sweep -- without a floor,
    // a small-but-real slice (e.g. a single category just under the "Otros" grouping threshold,
    // which by design draws directly instead of being grouped -- see DONUT_OTROS_THRESHOLD_PCT)
    // could end up with frac*360 smaller than the gap itself and silently vanish from the ring
    // even though its full amount is still listed in the legend below.
    const MIN_VISIBLE_SWEEP_DEG = 3;
    segments.forEach(seg=>{
      const frac = seg.value/total;
      if(frac<=0) return;
      const sweep = Math.max(frac*360 - gapDeg, MIN_VISIBLE_SWEEP_DEG);
      const a0 = startAngle;
      const a1 = startAngle + sweep;
      const large = sweep>180 ? 1 : 0;
      const p0 = polar(cx,cy,r,a0);
      const p1 = polar(cx,cy,r,a1);
      paths += '<path class="arc-seg" data-cat="'+seg.id+'"'+(seg.extraAttrs||'')+' d="M '+p0.x+' '+p0.y+' A '+r+' '+r+' 0 '+large+' 1 '+p1.x+' '+p1.y+'" fill="none" stroke="'+seg.color+'" stroke-width="'+strokeW+'" stroke-linecap="round"/>';
      startAngle += frac*360;
    });
  }
  return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'">'+paths+'</svg>';
}
export function polar(cx,cy,r,angleDeg){
  const a = angleDeg*Math.PI/180;
  return {x:(cx+r*Math.cos(a)).toFixed(2), y:(cy+r*Math.sin(a)).toFixed(2)};
}

// Ring-only grouping threshold: a category under this % of the month/year's total gets folded
// into a single "Otros" arc so the ring doesn't dissolve into slivers -- adjustable here, not
// hardcoded at each call site. The LEGEND never groups anything -- it always lists 100% of
// categories individually, however small, so nothing is actually hidden, just visually
// simplified in the ring. A single small category never gets wrapped into a 1-item "Otros"
// (that would just be a worse label for the same slice) -- it's drawn directly instead.
export const DONUT_OTROS_THRESHOLD_PCT = 3;

// `periodoFiltro` is what a legend-row tap should filter Transacciones by if you drill down into
// a category from here: a 'YYYY-MM' month, or a bare 'YYYY' year (see state.categoryFilterMonth
// in state.ts, and the data-cat click handler in events.ts, which reads it off this same
// .donut-card via data-periodo instead of always assuming "the currently selected month" --
// Balance's año mode calls this with a year, not a month, precisely so that drill-down brings
// the whole year, not just whatever single month happened to be selected).
export function renderDonutBlock(titulo, subtitulo, tipo, monthTx, periodoFiltro?){
  const byCat = {};
  monthTx.filter(t=>t.tipo===tipo && t.estado!=='no_es_gasto').forEach(t=>{
    t.categorias.forEach(c=>{
      // netIncomeFactor(t) is 1 for an ordinary income (nothing to net), 0 for one that just
      // settles a pending item (persona split, or a reembolso with no sobre-reembolso), and
      // somewhere in between for a reembolso whose sobre-reembolso only partially counts.
      const v = tipo==='gasto' ? catNetAmount(t,c) : tipo==='ingreso' ? c.monto*netIncomeFactor(t) : c.monto;
      byCat[c.cat] = (byCat[c.cat]||0) + v;
    });
  });
  const entries = Object.keys(byCat).map(id=>({id, value:byCat[id], info:catInfo(id)}))
    .sort((a,b)=>b.value-a.value);
  const total = entries.reduce((s,e)=>s+e.value,0);

  // Ring: fold every entry under the threshold into one "Otros" arc -- unless there's only one
  // such entry, in which case grouping it alone would gain nothing.
  const smallIds = total>0
    ? entries.filter(e => (e.value/total)*100 < DONUT_OTROS_THRESHOLD_PCT).map(e=>e.id)
    : [];
  const grouped = smallIds.length > 1;
  const otrosIds = grouped ? smallIds : [];
  const ringEntries = !grouped ? entries : (function(){
    const big = entries.filter(e=>!otrosIds.includes(e.id));
    const otrosValue = entries.filter(e=>otrosIds.includes(e.id)).reduce((s,e)=>s+e.value,0);
    return (big as any[]).concat([{id:'otros', value:otrosValue, info:{nombre:'Otros', icon:'more', colorHue:0, tipo:tipo}, isOtros:true}]);
  })();
  const segs = ringEntries.map(e=>({
    value: e.value,
    color: (e as any).isOtros ? 'var(--text-tertiary)' : categoryFillCss(e.info.colorHue),
    id: e.id,
    nombre: e.info.nombre,
    extraAttrs: (e as any).isOtros ? ' data-otros-ids="'+otrosIds.join(',')+'"' : ''
  }));
  const donutSvg = buildDonut(segs, 172, 24);
  // The legend, unlike the ring, is never grouped -- every category shows its own row, however
  // small its slice, so 100% of the breakdown is always visible somewhere on screen even when
  // the ring itself simplifies. A legend row folded into the ring's "Otros" arc gets a small
  // badge instead so it's clear where it went on the chart.
  const legend = entries.length===0
    ? '<div class="empty-state" style="padding:14px 4px;">'+icon('inbox')+'<div>Sin movimientos este mes.</div></div>'
    : entries.map(e=>{
        const pct = total>0 ? Math.round((e.value/total)*100) : 0;
        const enOtros = otrosIds.includes(e.id);
        return '<button class="legend-row'+(enOtros?' legend-row-otros':'')+'" data-cat="'+e.id+'">'+
          '<span class="legend-dot" style="--fill:'+categoryFillCss(e.info.colorHue)+'"></span>'+
          '<span class="legend-icon">'+catIconMarkup(e.info.icon)+'</span>'+
          '<span class="legend-name">'+esc(e.info.nombre)+(enOtros?' <span class="legend-otros-badge">Otros</span>':'')+'</span>'+
          '<span class="legend-pct">'+pct+'%</span>'+
          '<span class="legend-value tabular">'+money(e.value)+'</span>'+
        '</button>';
      }).join('');
  return '<div class="card donut-card" '+(periodoFiltro?'data-periodo="'+periodoFiltro+'"':'')+'>'+
    '<div class="donut-card-title">'+titulo+'</div>'+
    '<div class="donut-card-sub">'+subtitulo+'</div>'+
    '<div class="donut-row">'+
      '<div class="donut-svg-wrap">'+donutSvg+
        '<div class="donut-center"><span class="dc-total tabular">'+(total>0?moneyPlainMasked(total):'$0')+'</span><span class="dc-label">total</span></div>'+
      '</div>'+
      '<div class="donut-legend">'+legend+'</div>'+
    '</div>'+
  '</div>';
}

// ---- Fixed / Variable / Investment goals (Summary > Balance) ----
// Fixed and Variable are % of your income that you define (editable in Budget). Investment is
// NOT defined here — it comes by itself from the sum of "monthly goal contribution" of your
// goals in the Investments tab, so both views always tell the same story.
export function monthlyInvestmentGoalCLP(){
  return INVESTMENT_GOALS.reduce((s,m)=>s+(m.aporteMensualMeta||0),0);
}
// Reference income to compare your goals against — the current month if it already has income
// registered; if not (just starting the month), your last known salary, more stable than
// comparing against $0.
export function referenceMonthlyIncome(){
  const monthIncome = monthTotals(todayISO().slice(0,7)).ingresos;
  if(monthIncome>0) return monthIncome;
  const last = lastSalaryTx();
  return last ? last.monto : 0;
}
export function investmentGoalPct(){
  const ref = referenceMonthlyIncome();
  return ref>0 ? (monthlyInvestmentGoalCLP()/ref)*100 : 0;
}
export function sumSpendingGoalPct(){
  return SPENDING_GOAL_PCT.fijo + SPENDING_GOAL_PCT.variable + investmentGoalPct();
}
// Color bands around a goal: for Fixed/Variable less is better (green up to the goal, amber up
// to 30% over it, red beyond that); for Investment it's the other way around (more is better).
export function goalZones(metaPct, masEsMejor){
  if(masEsMejor) return [{hasta:metaPct*0.6,tono:'bad'},{hasta:metaPct,tono:'ok'},{hasta:100,tono:'good'}];
  return [{hasta:metaPct,tono:'good'},{hasta:metaPct*1.3,tono:'ok'},{hasta:100,tono:'bad'}];
}

export function goalZoneRow(nombre, pct, monto, zones, sinIngresos, metaPct){
  // zones: array of {hasta, tono} in ascending order 0-100, tono: good|ok|bad
  let gradient = 'linear-gradient(to right';
  let prev = 0;
  zones.forEach(z=>{
    const color = 'var(--'+(z.tono==='good'?'income':z.tono==='ok'?'cat-butter':'expense')+'-fill)';
    gradient += ', '+color+' '+prev+'%, '+color+' '+z.hasta+'%';
    prev = z.hasta;
  });
  gradient += ')';
  const pctText = sinIngresos ? '—' : Math.round(pct)+'%';
  const marker = sinIngresos ? '' : '<div class="meta-marker" style="left:'+Math.max(0,Math.min(100,pct))+'%"></div>';
  const goalMarker = (sinIngresos || metaPct==null) ? '' :
    '<div class="meta-goal-marker" style="left:'+Math.max(0,Math.min(100,metaPct))+'%">'+Math.round(metaPct)+'%</div>';
  let statusHtml;
  if(sinIngresos){
    statusHtml = '<span class="meta-status" style="background:var(--surface-sunken);color:var(--text-secondary);">Sin ingresos este mes</span>';
  } else {
    const zoneAt = zones.find(z=>pct<=z.hasta) || zones[zones.length-1];
    const statusLabel = {good:'En buen rango', ok:'Un poco fuera de meta', bad:'Lejos de tu meta'}[zoneAt.tono];
    statusHtml = '<span class="meta-status '+zoneAt.tono+'">'+statusLabel+'</span>';
  }
  return '<div class="meta-row">'+
    '<div class="meta-row-head"><span class="meta-row-name">'+nombre+'</span>'+
      '<span class="meta-row-figs"><span class="meta-row-pct tabular">'+pctText+'</span><span class="meta-row-amt tabular">'+money(monto)+'</span></span></div>'+
    '<div class="meta-track-wrap">'+goalMarker+'<div class="meta-track" style="background:'+gradient+'">'+marker+'</div></div>'+
    statusHtml+
  '</div>';
}

// periodTx/ingresos can be a single month's or a full year's worth of data — this function
// never assumes which; it just sums whatever it's handed and compares against metaInvPct,
// which the CALLER computes appropriately for the period (see the note in
// views/presupuesto.ts, renderBalanceView, for why the Investment target % can't just be
// investmentGoalPct() unchanged in year mode).
export function renderGoalSummaryCard(periodTx, ingresos, metaInvPct){
  let fijo=0, variable=0, inversion=0;
  periodTx.forEach(t=>{
    if(t.estado==='no_es_gasto') return;
    if(t.tipo==='gasto'){
      if(t.recurrencia==='variable') variable += netExpenseTx(t);
      else fijo += netExpenseTx(t);
    } else if(t.tipo==='inversion'){
      inversion += catTotalAmount(t);
    }
  });
  const sinIngresos = ingresos<=0;
  const pctFijo = sinIngresos?0:(fijo/ingresos)*100, pctVar = sinIngresos?0:(variable/ingresos)*100, pctInv = sinIngresos?0:(inversion/ingresos)*100;
  const sumaMetas = SPENDING_GOAL_PCT.fijo + SPENDING_GOAL_PCT.variable + metaInvPct;
  const avisoSuma = sumaMetas > 100
    ? '<div class="meta-caption warn">Ojo: tus 3 metas suman '+Math.round(sumaMetas)+'% de tus ingresos — eso es más del 100%, no calzan entre ellas. Ajusta Fijo/Variable en Presupuesto.</div>'
    : '';
  return '<div class="card meta-card">'+
    '<div class="donut-card-title">Fijo · Variable · Inversión</div>'+
    '<div class="donut-card-sub">Como porcentaje de tus ingresos del mes, contra tus propias metas</div>'+
    goalZoneRow('Gasto fijo', pctFijo, fijo, goalZones(SPENDING_GOAL_PCT.fijo, false), sinIngresos, SPENDING_GOAL_PCT.fijo)+
    goalZoneRow('Gasto variable', pctVar, variable, goalZones(SPENDING_GOAL_PCT.variable, false), sinIngresos, SPENDING_GOAL_PCT.variable)+
    goalZoneRow('Inversión', pctInv, inversion, goalZones(metaInvPct, true), sinIngresos, metaInvPct)+
    '<div class="meta-caption">"Fijo" = tus gastos con recurrencia mensual o anual · "Variable" = el resto · tu meta de Inversión ('+Math.round(metaInvPct)+'%) sale sola de lo que ya definiste en Inversiones. Edita Fijo/Variable en Presupuesto.</div>'+
    avisoSuma+
  '</div>';
}

export function monthSwitcherHtml(){
  const month = MONTHS[state.monthIndex];
  return '<div class="month-switcher">'+
      '<button data-month-nav="-1" '+(state.monthIndex<=0?'disabled':'')+' aria-label="Mes anterior">'+ICONS.chevL+'</button>'+
      '<span class="m-label">'+MONTH_LABEL[month]+'</span>'+
      '<button data-month-nav="1" '+(state.monthIndex>=MONTHS.length-1?'disabled':'')+' aria-label="Mes siguiente">'+ICONS.chevR+'</button>'+
    '</div>';
}
// Balance's year mode has no prev/next navigation on purpose — it always shows the current
// calendar year (same scope decision Evolución already made, which has no year-switcher either)
// — so this is a plain label, not an interactive control, just reusing the same
// .month-switcher/.m-label classes so it lines up visually with month mode.
export function yearSwitcherHtml(year){
  return '<div class="month-switcher"><span class="m-label">Año '+year+'</span></div>';
}
