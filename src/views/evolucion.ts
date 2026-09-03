import { catInfo, montoAgregadoTx, plazoChip, txsOfMonth } from '../helpers';
import { ICONS } from '../icons';
import { monthLabelFor } from '../shared-expenses';
import { segmentedHtml } from '../sheet';
import { MESES_LARGO, METAS_INVERSION, METAS_TOTAL_CHECKS, MONTHS, MONTH_LABEL, money, state, todayISO } from '../state';
import { activePlatformIds, platformValorActual } from './inversiones';
/* ===================== EVOLUCIÓN (Fase 3) ===================== */
export function monthTotals(monthKey){
  const monthTx = txsOfMonth(monthKey);
  let ingresos=0, gastos=0, inversiones=0;
  monthTx.forEach(t=>{
    if(t.estado==='no_es_gasto') return;
    const monto = montoAgregadoTx(t);
    if(t.tipo==='ingreso') ingresos += monto;
    else if(t.tipo==='gasto') gastos += monto;
    else if(t.tipo==='inversion') inversiones += monto;
  });
  return {
    ingresos, gastos, inversiones, balance: ingresos-gastos-inversiones,
    tasaAhorro: ingresos>0 ? ((ingresos-gastos)/ingresos)*100 : 0,
    tasaGastos: ingresos>0 ? (gastos/ingresos)*100 : 0
  };
}

// Suma los 12 meses del año completo (Enero-Diciembre) para mostrar el total anual en
// Evolución — ingresos, gastos, inversiones, tasa de ahorro y tasa de gastos, agregado
// para todo el año, no solo los meses que ya tienen movimientos (los que faltan cuentan
// como $0, así que no inflan ni distorsionan la suma).
export function yearTotals(year){
  const months = fullYearMonths(year);
  let ingresos=0, gastos=0, inversiones=0;
  months.forEach(m=>{
    const t = monthTotals(m);
    ingresos += t.ingresos; gastos += t.gastos; inversiones += t.inversiones;
  });
  return {
    year, months, ingresos, gastos, inversiones,
    tasaAhorro: ingresos>0 ? ((ingresos-gastos)/ingresos)*100 : 0,
    tasaGastos: ingresos>0 ? (gastos/ingresos)*100 : 0
  };
}

// Proyección a futuro basada SOLO en tu ritmo real de aportes (promedio de los últimos
// N meses con datos) — sin inventar ninguna rentabilidad ni tasa de retorno, siguiendo
// el mismo principio que el resto de la app (nunca sugerimos un % de crecimiento). Es
// "cuánto habrás puesto tú" en ese plazo, no una promesa de cuánto crecerá tu plata.
// Único lugar de la app donde SÍ inventamos un número — a pedido explícito de la usuaria,
// para poder proyectar a 20 años. Por defecto un retorno moderado y una inflación típica,
// pero ambos quedan siempre editables a la vista, nunca escondidos como si fueran un hecho.
export let PROYECCION_SUPUESTOS = {retornoAnual:6, inflacionAnual:3};

export function proyeccionAportes(mesesPromedio, aniosProyeccion){
  const mesActual = todayISO().slice(0,7);
  const mesesConDatos = MONTHS.filter(m=>m<=mesActual).slice(-mesesPromedio);
  const promedioMensual = mesesConDatos.length
    ? mesesConDatos.reduce((s,m)=>s+monthTotals(m).inversiones,0)/mesesConDatos.length
    : 0;
  // La usuaria puede reemplazar ese promedio por un monto mensual propio en el simulador
  // (por ejemplo, para ver qué pasaría si aportara más o menos que su promedio real) — si no
  // lo ha tocado (null), se sigue usando el promedio real de siempre.
  const aporteMensualUsado = state.proySimulatedAporte!=null ? state.proySimulatedAporte : promedioMensual;
  const totalActual = activePlatformIds().reduce((s,id)=>s+platformValorActual(id),0);
  const aporteAnual = aporteMensualUsado*12;
  // Referencia honesta: solo lo aportado, sin ningún % de retorno inventado.
  const proyectadoSinRetorno = totalActual + aporteAnual*aniosProyeccion;

  // Proyección con retorno + inflación (tasa real vía Fisher), expresada en pesos de hoy.
  const retornoAnual = PROYECCION_SUPUESTOS.retornoAnual;
  const inflacionAnual = PROYECCION_SUPUESTOS.inflacionAnual;
  const rReal = ((1+retornoAnual/100)/(1+inflacionAnual/100)) - 1;
  const factor = Math.pow(1+rReal, aniosProyeccion);
  const valorFuturoActual = totalActual*factor;
  const valorFuturoAportes = Math.abs(rReal)<0.0001 ? aporteAnual*aniosProyeccion : aporteAnual*((factor-1)/rReal);
  const proyectadoConRetorno = valorFuturoActual + valorFuturoAportes;

  return {promedioMensual, aporteMensualUsado, totalActual, proyectadoSinRetorno, proyectadoConRetorno, retornoAnual, inflacionAnual, rReal, meses:mesesConDatos, anios:aniosProyeccion};
}

export function buildSparkline(values, w, h, color){
  if(values.length<2) return '';
  const maxV = Math.max(...values), minV = Math.min(...values);
  const range = (maxV-minV) || 1;
  const stepX = w/(values.length-1);
  const pad = 3;
  const pts = values.map((v,i)=>[i*stepX, pad + (1-(v-minV)/range)*(h-pad*2)]);
  const d = pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const last = pts[pts.length-1];
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" style="display:block;overflow:visible;">'+
    '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+
    '<circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="3" fill="'+color+'"/>'+
  '</svg>';
}

export function buildEvolucionBars(months, selMonth){
  const totals = months.map(monthTotals);
  const maxVal = Math.max(1, ...totals.flatMap(t=>[t.ingresos,t.gastos,t.inversiones]));
  const W = 320, chartH = 128, padTop = 6, padBottom = 20, H = chartH+padTop+padBottom;
  const groupW = W/months.length;
  const barGap = 3, groupPad = 8;
  let out = '';
  months.forEach((m,i)=>{
    const t = totals[i];
    const gx = i*groupW;
    const isSelected = m===selMonth;
    const vals = [t.ingresos, t.gastos, t.inversiones];
    const colors = ['var(--income-fill)','var(--expense-fill)','var(--invest-fill)'];
    const innerX = gx+groupPad/2;
    const innerW = groupW-groupPad;
    const barW = (innerW - barGap*2)/3;
    let bars = '';
    vals.forEach((v,vi)=>{
      const h = maxVal>0 ? Math.max(2,(v/maxVal)*chartH) : 2;
      const bx = innerX + vi*(barW+barGap);
      const by = padTop + (chartH-h);
      bars += '<rect x="'+bx.toFixed(1)+'" y="'+by.toFixed(1)+'" width="'+Math.max(0,barW).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2.5" fill="'+colors[vi]+'" opacity="'+(isSelected?1:0.4)+'"/>';
    });
    const short = MONTH_LABEL[m].split(' ')[0].slice(0,3);
    out += '<g data-evo-month="'+m+'" style="cursor:pointer;">'+
      '<rect x="'+gx.toFixed(1)+'" y="0" width="'+groupW.toFixed(1)+'" height="'+(padTop+chartH+4).toFixed(1)+'" rx="8" fill="'+(isSelected?'var(--surface-sunken)':'transparent')+'"/>'+
      bars+
      '<text x="'+(gx+groupW/2).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" font-size="9.5" fill="'+(isSelected?'var(--text)':'var(--text-tertiary)')+'" font-weight="'+(isSelected?'700':'400')+'">'+short+'</text>'+
    '</g>';
  });
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;overflow:visible;">'+out+'</svg>';
}

// Sólo los meses con datos reales de la meta (evita que meses futuros proyectados
// por cuotas de tarjeta —que sí extienden MONTHS— aparezcan como "incumplidos").
export function metaMonths(meta){
  return MONTHS.filter(m=> meta.historial[m]!=null);
}
export function metaAcumuladoActual(meta){
  const months = metaMonths(meta);
  return months.length ? meta.historial[months[months.length-1]] : 0;
}
// Ganancia estimada de la meta: lo acumulado menos lo que realmente aportaste (nunca el
// total) — es la base sobre la que se calcula su comisión, igual que en las plataformas.
export function metaGananciaEstimada(meta){
  return Math.max(0, metaAcumuladoActual(meta) - (meta.aportadoNeto||0));
}
export function metaRacha(meta){
  const months = metaMonths(meta);
  let racha = 0;
  for(let i=months.length-1;i>=0;i--){
    if(meta.checks[months[i]]) racha++;
    else break;
  }
  return racha;
}
export function metasForPlataforma(id){
  return METAS_INVERSION.filter(m=>m.plataformaId===id);
}
// Resumen combinado de las metas de UNA plataforma: suma de objetivo/acumulado, y una
// racha combinada que solo se prende si TODAS las metas de esa plataforma tienen racha
// activa hoy — en ese caso el número es la racha más corta (los meses en que las
// cumpliste TODAS a la vez), no la más larga.
export function platformMetasResumen(id){
  const metas = metasForPlataforma(id);
  const totalObjetivo = metas.reduce((s,m)=>s+m.montoObjetivo,0);
  const totalAcumulado = metas.reduce((s,m)=>s+metaAcumuladoActual(m),0);
  const rachas = metas.map(metaRacha);
  const rachaCombinada = (metas.length>0 && rachas.every(r=>r>0)) ? Math.min(...rachas) : 0;
  return {metas, totalObjetivo, totalAcumulado, rachaCombinada};
}
export function metaProgresoTotal(){
  const totalObjetivo = METAS_INVERSION.reduce((s,m)=>s+m.montoObjetivo,0);
  const totalAcumulado = METAS_INVERSION.reduce((s,m)=>s+metaAcumuladoActual(m),0);
  return {totalObjetivo, totalAcumulado};
}
// 12 cuadraditos (enero-diciembre del año en curso) para marcar a mano si cumpliste tu
// objetivo de inversión TOTAL ese mes — independiente de los checks de cada meta individual.
// Un mes sin marcar se ve igual que "no cumplido" (no hay forma de distinguir "todavía no
// llega" de "no lo marcaste"), lo cual está bien: es un hábito que tú llevas, no un cálculo.
// Racha del objetivo de inversión TOTAL — mismo criterio que metaRacha (cuenta hacia atrás
// desde el mes actual mientras esté marcado como cumplido), pero sobre METAS_TOTAL_CHECKS en
// vez de los checks de una meta puntual. Antes esto no generaba ninguna racha, a diferencia
// de las metas por plataforma, que sí la mostraban.
export function metaTotalRacha(){
  const year = todayISO().slice(0,4);
  const mesActual = todayISO().slice(0,7);
  const months = fullYearMonths(year).filter(m=>m<=mesActual);
  let racha = 0;
  for(let i=months.length-1;i>=0;i--){
    if(METAS_TOTAL_CHECKS[months[i]]) racha++;
    else break;
  }
  return racha;
}
export function renderMetaTotalChecksGrid(){
  const year = todayISO().slice(0,4);
  const months = fullYearMonths(year);
  const racha = metaTotalRacha();
  const cells = months.map(m=>{
    const checked = !!METAS_TOTAL_CHECKS[m];
    const monthIdx = parseInt(m.slice(5,7),10)-1;
    const short = MESES_LARGO[monthIdx].slice(0,3);
    const label = short.charAt(0).toUpperCase()+short.slice(1);
    return '<button class="meta-total-check-cell'+(checked?' done':'')+'" data-toggle-meta-total-check="'+m+'" aria-pressed="'+(checked?'true':'false')+'" aria-label="'+label+' '+year+(checked?': objetivo total cumplido':': no marcado')+'">'+
      '<span class="mcc-icon">'+(checked?ICONS.check:ICONS.close)+'</span><span class="mcc-label">'+label+'</span>'+
    '</button>';
  }).join('');
  return '<div class="meta-total-checks-label muted" style="display:flex;align-items:center;gap:6px;justify-content:space-between;">'+
      '<span>¿Cumpliste tu objetivo total cada mes?</span>'+
      (racha>0 ? '<span class="meta-racha-badge">'+racha+' 🔥</span>' : '')+
    '</div>'+
    '<div class="meta-total-checks-grid">'+cells+'</div>'+
    '<div class="meta-racha">'+(racha>0 ? 'Racha activa — cumpliste tu objetivo total '+racha+' '+(racha===1?'mes':'meses')+' seguidos hasta hoy' : 'Sin racha activa — marca los meses en que cumpliste tu objetivo total') +'</div>';
}

export function renderMetaEditForm(meta, plataformaId?){
  const d = state.metaDraft;
  const ctxId = meta ? meta.plataformaId : (plataformaId || state.addMetaPlataformaId);
  const ctxNombre = ctxId ? catInfo(ctxId).nombre : '';
  return '<div class="card meta-goal-card editing">'+
    (ctxNombre ? '<div class="meta-goal-ctx muted">'+(meta?'Meta en ':'Nueva meta en ')+ctxNombre+'</div>' : '')+
    '<label class="draft-label">Nombre de la meta</label>'+
    '<input type="text" class="draft-input" data-meta-field="nombre" value="'+d.nombre.replace(/"/g,'&quot;')+'" placeholder="Ej: Fondo de emergencia">'+
    '<label class="draft-label" style="margin-top:12px;">Monto objetivo</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-meta-field="montoObjetivo" value="'+d.montoObjetivo+'" placeholder="0">'+
    '<label class="draft-label" style="margin-top:12px;">Aporte mensual meta</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-meta-field="aporteMensualMeta" value="'+d.aporteMensualMeta+'" placeholder="0">'+
    '<label class="draft-label" style="margin-top:12px;">Plazo</label>'+
    segmentedHtml('meta-plazo', [{id:'corto',label:'Corto'},{id:'medio',label:'Medio'},{id:'largo',label:'Largo'}], d.plazo, false)+
    '<label class="draft-label" style="margin-top:12px;">Comisión anual / TAC (opcional)</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-meta-field="comision" value="'+d.comision+'" placeholder="Ej: 1.1">'+
    '<div class="platform-hint muted">El % que te cobra el fondo específico de esta meta — ponlo tú, la app no te sugiere ningún número. Se calcula sobre tu ganancia, no sobre el total ahorrado.</div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-meta-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-meta="'+(meta?meta.id:'nueva')+'">Guardar</button>'+
    '</div>'+
    (meta ? '<button class="budget-delete-link" data-delete-meta="'+meta.id+'">Eliminar meta</button>' : '')+
  '</div>';
}

// Antes los cuadraditos de check solo llegaban hasta el último mes con dato real
// (metaMonths) — así, si recién creaste la meta en agosto, septiembre en adelante ni
// aparecía. Ahora se extienden desde el primer mes con dato (o el mes actual, si la meta es
// nueva y todavía no tiene ninguno) hasta diciembre del año en curso, mismo criterio que ya
// usa la grilla del objetivo total: los meses futuros se ven igual que "no marcado" — no hay
// forma de distinguir "todavía no llega" de "no lo marcaste", y está bien así.
export function metaChecksMonths(meta){
  const year = todayISO().slice(0,4);
  const tracked = metaMonths(meta);
  const start = tracked.length ? tracked[0] : todayISO().slice(0,7);
  return fullYearMonths(year).filter(m=>m>=start);
}
export function renderMetaGoalCard(meta){
  if(state.editingMetaId===meta.id) return renderMetaEditForm(meta);

  const trackedMonths = metaMonths(meta);
  const acumulado = metaAcumuladoActual(meta);
  const pct = meta.montoObjetivo>0 ? (acumulado/meta.montoObjetivo)*100 : 0;
  const racha = metaRacha(meta);
  const comision = meta.comision;
  const gananciaMeta = metaGananciaEstimada(meta);
  const comisionRow = comision!=null ? (
    '<div class="platform-comision-row">'+
      '<span>Comisión anual: <b class="tabular">'+comision+'%</b></span>'+
      '<span class="muted tabular">≈ '+money(gananciaMeta*comision/100)+'/año sobre tu ganancia</span>'+
    '</div>'
  ) : '';
  const historialVals = trackedMonths.map(m=> meta.historial[m]);
  const checksRow = metaChecksMonths(meta).map(m=>{
    const short = MONTH_LABEL[m].split(' ')[0].slice(0,3);
    const done = !!meta.checks[m];
    return '<button class="meta-check-chip'+(done?' done':'')+'" data-toggle-meta-check="'+meta.id+'" data-toggle-meta-month="'+m+'">'+
      '<span class="mcc-icon">'+(done?ICONS.check:ICONS.close)+'</span><span class="mcc-label">'+short+'</span>'+
    '</button>';
  }).join('');

  return '<div class="card meta-goal-card">'+
    '<div class="meta-goal-head">'+
      '<span class="meta-goal-name">'+meta.nombre+'</span>'+
      plazoChip(meta.plazo)+
      (racha>0 ? '<span class="meta-racha-badge">'+racha+' 🔥</span>' : '')+
      '<button class="budget-edit-btn" data-edit-meta="'+meta.id+'" aria-label="Editar '+meta.nombre+'">'+ICONS.edit+'</button>'+
    '</div>'+
    '<div class="meta-goal-figs"><span class="tabular gastado">'+money(acumulado)+'</span><span class="of-text"> de '+money(meta.montoObjetivo)+'</span><span class="budget-pct tabular">'+Math.round(pct)+'%</span></div>'+
    '<div class="budget-track"><div class="budget-fill" style="width:'+Math.max(0,Math.min(100,pct))+'%;background:var(--accent);"></div></div>'+
    comisionRow+
    '<div class="meta-goal-spark-row">'+
      '<div class="meta-goal-spark">'+buildSparkline(historialVals, 120, 32, 'var(--accent)')+'</div>'+
      '<div class="meta-goal-aporte muted">Meta de aporte<br><span class="tabular" style="color:var(--text);font-weight:600;">'+money(meta.aporteMensualMeta)+'</span>/mes</div>'+
    '</div>'+
    '<div class="meta-check-row">'+checksRow+'</div>'+
    '<div class="meta-racha">'+(racha>0 ? 'Racha activa — cumpliste tu aporte '+racha+' '+(racha===1?'mes':'meses')+' seguidos hasta hoy' : 'Sin racha activa — marca los meses en que cumpliste tu aporte') +'</div>'+
  '</div>';
}

// Los 12 meses de un año completo (enero-diciembre), independiente de MONTHS (que solo
// tiene los meses que realmente se han usado en Transacciones/Presupuesto). Evolución
// quiere ver el año entero aunque los meses sin datos salgan en cero — así que generamos
// las llaves y sus etiquetas al vuelo, sin tocar el MONTHS global (eso rompería el resto
// de la app: navegación de Balance, metas, plataformas, etc).
export function fullYearMonths(year){
  const out = [];
  for(let m=1;m<=12;m++){
    const key = year+'-'+String(m).padStart(2,'0');
    if(!MONTH_LABEL[key]) MONTH_LABEL[key] = monthLabelFor(key);
    out.push(key);
  }
  return out;
}

export function renderEvolucionView(){
  const year = todayISO().slice(0,4);
  const months = fullYearMonths(year);
  const mesActual = todayISO().slice(0,7);
  const selMonth = (state.evoSelectedMonth && months.includes(state.evoSelectedMonth)) ? state.evoSelectedMonth : mesActual;
  const sel = monthTotals(selMonth);

  const legendRow = '<div class="evo-legend-row">'+
      '<span class="evo-legend-item"><span class="evo-dot" style="background:var(--income-fill)"></span>Ingresos</span>'+
      '<span class="evo-legend-item"><span class="evo-dot" style="background:var(--expense-fill)"></span>Gastos</span>'+
      '<span class="evo-legend-item"><span class="evo-dot" style="background:var(--invest-fill)"></span>Inversiones</span>'+
    '</div>';

  const detailRow = '<div class="evo-detail-row">'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Ingresos</span><span class="evo-detail-value tabular">'+money(sel.ingresos)+'</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Gastos</span><span class="evo-detail-value tabular">'+money(sel.gastos)+'</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Inversiones</span><span class="evo-detail-value tabular">'+money(sel.inversiones)+'</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de ahorro</span><span class="evo-detail-value tabular">'+Math.round(sel.tasaAhorro)+'%</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de gastos</span><span class="evo-detail-value tabular">'+Math.round(sel.tasaGastos)+'%</span></div>'+
    '</div>';

  const yr = yearTotals(selMonth.slice(0,4));
  const yearRow = '<div class="evo-detail-row">'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Ingresos</span><span class="evo-detail-value tabular">'+money(yr.ingresos)+'</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Gastos</span><span class="evo-detail-value tabular">'+money(yr.gastos)+'</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Inversiones</span><span class="evo-detail-value tabular">'+money(yr.inversiones)+'</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de ahorro</span><span class="evo-detail-value tabular">'+Math.round(yr.tasaAhorro)+'%</span></div>'+
      '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de gastos</span><span class="evo-detail-value tabular">'+Math.round(yr.tasaGastos)+'%</span></div>'+
    '</div>';

  const html =
    '<div class="section-title" style="margin-top:4px;">Ingresos, gastos e inversiones por mes</div>'+
    '<div class="card evo-card">'+
      legendRow+
      buildEvolucionBars(months, selMonth)+
      '<div class="evo-caption muted">Toca un mes para ver el detalle</div>'+
      '<div class="evo-detail-month">'+MONTH_LABEL[selMonth]+'</div>'+
      detailRow+
    '</div>'+

    '<div class="section-title">Total del año '+yr.year+'</div>'+
    '<div class="card evo-card">'+
      '<div class="evo-detail-month">Enero – Diciembre '+yr.year+'</div>'+
      yearRow+
    '</div>'+

    '<div class="evo-caption muted" style="padding:0 4px;">¿Buscas tus metas de inversión y tus plataformas? Ahora viven juntas en <b>Inversiones</b>.</div>'+
    '<div style="height:12px;"></div>';

  document.getElementById('resumen-content').innerHTML = html;
}

