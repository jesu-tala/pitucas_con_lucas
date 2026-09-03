import { catInfo, catMontoNeto, catTotalMonto, gastoNetoTx, ingresoEsSaldoDePersona, lastSueldoTx } from '../helpers';
import { ICONS, catIconMarkup, icon } from '../icons';
import { METAS_GASTO_PCT, METAS_INVERSION, MONTHS, MONTH_LABEL, money, moneyPlainMasked, state, todayISO } from '../state';
import { monthTotals } from '../views/evolucion';
/* ===================== DONUT SVG ===================== */
export function buildDonut(segments, size, strokeW){
  // segments: [{value, color, id, nombre}]
  const total = segments.reduce((s,x)=>s+x.value,0);
  const r = (size/2) - strokeW/2 - 2;
  const cx=size/2, cy=size/2;
  // 6° (antes 3°) -- un gap más ancho ayuda a distinguir dos segmentos vecinos que por
  // casualidad quedaron con el mismo color (ver categoriasConColor), sin lo cual se ven
  // como un solo bloque continuo.
  const gapDeg = segments.length>1 ? 6 : 0;
  let startAngle = -90;
  let paths = '';
  if(total<=0){
    paths = '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--border)" stroke-width="'+strokeW+'"/>';
  } else if(segments.length===1){
    // Un solo segmento = 100% del círculo. Un arco SVG (comando "A") no puede dibujar la
    // vuelta completa: el punto de inicio y de término quedan en el mismo lugar, así que el
    // trazo se ve como un punto en vez de un anillo. Un <circle> completo sí lo dibuja bien.
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
    if(tipo==='ingreso' && ingresoEsSaldoDePersona(t)) return; // no es plata nueva, solo salda un pendiente
    t.categorias.forEach(c=>{
      const v = tipo==='gasto' ? catMontoNeto(t,c) : c.monto;
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

// ---- Metas de Fijo / Variable / Inversión (Resumen > Balance) ----
// Fijo y Variable son % de tus ingresos que tú defines (editable en Presupuesto). Inversión
// NO se define acá — sale sola de la suma de "aporte mensual meta" de tus metas en la
// pestaña Inversiones, para que ambas vistas cuenten siempre la misma historia.
export function metaInversionMensualCLP(){
  return METAS_INVERSION.reduce((s,m)=>s+(m.aporteMensualMeta||0),0);
}
// Ingreso de referencia para comparar tus metas — el mes actual si ya tiene ingresos
// registrados; si no (recién empezando el mes), tu último sueldo conocido, más estable
// que comparar contra $0.
export function ingresoMensualReferencia(){
  const ingresosMes = monthTotals(todayISO().slice(0,7)).ingresos;
  if(ingresosMes>0) return ingresosMes;
  const last = lastSueldoTx();
  return last ? last.monto : 0;
}
export function metaInversionPct(){
  const ref = ingresoMensualReferencia();
  return ref>0 ? (metaInversionMensualCLP()/ref)*100 : 0;
}
export function sumaMetasGastoPct(){
  return METAS_GASTO_PCT.fijo + METAS_GASTO_PCT.variable + metaInversionPct();
}
// Franjas de color alrededor de una meta: para Fijo/Variable menos es mejor (verde hasta la
// meta, ámbar hasta un 30% por sobre ella, rojo más allá); para Inversión es al revés (más
// es mejor).
export function zonasMeta(metaPct, masEsMejor){
  if(masEsMejor) return [{hasta:metaPct*0.6,tono:'bad'},{hasta:metaPct,tono:'ok'},{hasta:100,tono:'good'}];
  return [{hasta:metaPct,tono:'good'},{hasta:metaPct*1.3,tono:'ok'},{hasta:100,tono:'bad'}];
}

export function metaZoneRow(nombre, pct, monto, zones, sinIngresos, metaPct){
  // zones: array de {hasta, tono} en orden ascendente 0-100, tono: good|ok|bad
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

export function renderMetaCard(monthTx, ingresos){
  let fijo=0, variable=0, inversion=0;
  monthTx.forEach(t=>{
    if(t.estado==='no_es_gasto') return;
    if(t.tipo==='gasto'){
      if(t.recurrencia==='variable') variable += gastoNetoTx(t);
      else fijo += gastoNetoTx(t);
    } else if(t.tipo==='inversion'){
      inversion += catTotalMonto(t);
    }
  });
  const sinIngresos = ingresos<=0;
  const pctFijo = sinIngresos?0:(fijo/ingresos)*100, pctVar = sinIngresos?0:(variable/ingresos)*100, pctInv = sinIngresos?0:(inversion/ingresos)*100;
  const metaInvPct = metaInversionPct();
  const sumaMetas = METAS_GASTO_PCT.fijo + METAS_GASTO_PCT.variable + metaInvPct;
  const avisoSuma = sumaMetas > 100
    ? '<div class="meta-caption warn">Ojo: tus 3 metas suman '+Math.round(sumaMetas)+'% de tus ingresos — eso es más del 100%, no calzan entre ellas. Ajusta Fijo/Variable en Presupuesto.</div>'
    : '';
  return '<div class="card meta-card">'+
    '<div class="donut-card-title">Fijo · Variable · Inversión</div>'+
    '<div class="donut-card-sub">Como porcentaje de tus ingresos del mes, contra tus propias metas</div>'+
    metaZoneRow('Gasto fijo', pctFijo, fijo, zonasMeta(METAS_GASTO_PCT.fijo, false), sinIngresos, METAS_GASTO_PCT.fijo)+
    metaZoneRow('Gasto variable', pctVar, variable, zonasMeta(METAS_GASTO_PCT.variable, false), sinIngresos, METAS_GASTO_PCT.variable)+
    metaZoneRow('Inversión', pctInv, inversion, zonasMeta(metaInvPct, true), sinIngresos, metaInvPct)+
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

