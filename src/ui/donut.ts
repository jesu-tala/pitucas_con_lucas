import { catInfo, catNetAmount, catTotalAmount, netExpenseTx, incomeIsPersonSettlement, lastSalaryTx } from '../helpers';
import { ICONS, catIconMarkup, icon } from '../icons';
import { SPENDING_GOAL_PCT, INVESTMENT_GOALS, MONTHS, MONTH_LABEL, money, moneyPlainMasked, state, todayISO } from '../state';
import { monthTotals } from '../views/evolucion';
/* ===================== DONUT SVG ===================== */
export function buildDonut(segments, size, strokeW){
  // segments: [{value, color, id, nombre}]
  const total = segments.reduce((s,x)=>s+x.value,0);
  const r = (size/2) - strokeW/2 - 2;
  const cx=size/2, cy=size/2;
  // 6° (used to be 3°) -- a wider gap helps tell apart two neighboring segments that happened
  // to end up with the same color (see categoriesWithColor), without which they look like a
  // single continuous block.
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
    segments.forEach(seg=>{
      const frac = seg.value/total;
      const sweep = frac*360 - gapDeg;
      if(sweep<=0){ startAngle += frac*360; return; }
      const a0 = startAngle;
      const a1 = startAngle + sweep;
      const large = sweep>180 ? 1 : 0;
      const p0 = polar(cx,cy,r,a0);
      const p1 = polar(cx,cy,r,a1);
      paths += '<path class="arc-seg" data-cat="'+seg.id+'" d="M '+p0.x+' '+p0.y+' A '+r+' '+r+' 0 '+large+' 1 '+p1.x+' '+p1.y+'" fill="none" stroke="'+seg.color+'" stroke-width="'+strokeW+'" stroke-linecap="round"/>';
      startAngle += frac*360;
    });
  }
  return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'">'+paths+'</svg>';
}
export function polar(cx,cy,r,angleDeg){
  const a = angleDeg*Math.PI/180;
  return {x:(cx+r*Math.cos(a)).toFixed(2), y:(cy+r*Math.sin(a)).toFixed(2)};
}

export function renderDonutBlock(titulo, subtitulo, tipo, monthTx){
  const byCat = {};
  monthTx.filter(t=>t.tipo===tipo && t.estado!=='no_es_gasto').forEach(t=>{
    if(tipo==='ingreso' && incomeIsPersonSettlement(t)) return; // not new money, it just settles a pending item
    t.categorias.forEach(c=>{
      const v = tipo==='gasto' ? catNetAmount(t,c) : c.monto;
      byCat[c.cat] = (byCat[c.cat]||0) + v;
    });
  });
  const entries = Object.keys(byCat).map(id=>({id, value:byCat[id], info:catInfo(id)}))
    .sort((a,b)=>b.value-a.value);
  const total = entries.reduce((s,e)=>s+e.value,0);
  const segs = entries.map(e=>({value:e.value, color:'var(--cat-'+e.info.color+'-fill)', id:e.id, nombre:e.info.nombre}));
  const donutSvg = buildDonut(segs, 172, 24);
  const legend = entries.length===0
    ? '<div class="empty-state" style="padding:14px 4px;">'+icon('inbox')+'<div>Sin movimientos este mes.</div></div>'
    : entries.map(e=>{
        const pct = total>0 ? Math.round((e.value/total)*100) : 0;
        return '<button class="legend-row" data-cat="'+e.id+'">'+
          '<span class="legend-dot" style="--fill:var(--cat-'+e.info.color+'-fill)"></span>'+
          '<span class="legend-icon">'+catIconMarkup(e.info.icon)+'</span>'+
          '<span class="legend-name">'+e.info.nombre+'</span>'+
          '<span class="legend-pct">'+pct+'%</span>'+
          '<span class="legend-value tabular">'+money(e.value)+'</span>'+
        '</button>';
      }).join('');
  return '<div class="card donut-card">'+
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

export function renderGoalSummaryCard(monthTx, ingresos){
  let fijo=0, variable=0, inversion=0;
  monthTx.forEach(t=>{
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
  const metaInvPct = investmentGoalPct();
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
