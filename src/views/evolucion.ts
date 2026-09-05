import { catInfo, aggregatedTxAmount, termChip, txsOfMonth } from '../helpers';
import { ICONS } from '../icons';
import { monthLabelFor } from '../shared-expenses';
import { segmentedHtml } from '../sheet';
import { MONTHS_LONG, INVESTMENT_GOALS, TRANSACTIONS, TOTAL_GOAL_CHECKS, MONTHS, MONTH_LABEL, money, state, todayISO } from '../state';
import { activePlatformIds, platformAportadoNeto, platformCurrentValue } from './inversiones';
/* ===================== EVOLUTION (Phase 3) ===================== */
export function monthTotals(monthKey){
  const monthTx = txsOfMonth(monthKey);
  let ingresos=0, gastos=0, inversiones=0;
  monthTx.forEach(t=>{
    if(t.estado==='no_es_gasto') return;
    const monto = aggregatedTxAmount(t);
    if(t.tipo==='ingreso') ingresos += monto;
    else if(t.tipo==='gasto') gastos += monto;
    else if(t.tipo==='inversion') inversiones += monto;
  });
  return {
    ingresos, gastos, inversiones, balance: ingresos-gastos-inversiones,
    // Tasa de ahorro = cuánto de lo que ganaste realmente destinaste a invertir (no "lo que
    // sobró" -- eso puede incluir plata sin invertir todavía, sentada en la cuenta corriente,
    // que no es ahorro real en el sentido de construir patrimonio).
    tasaAhorro: ingresos>0 ? (inversiones/ingresos)*100 : 0,
    tasaGastos: ingresos>0 ? (gastos/ingresos)*100 : 0
  };
}

// Adds up all 12 months of the full year (January-December) to show the annual total in
// Evolution — income, expenses, investments, savings rate and spending rate, aggregated for
// the whole year, not just the months that already have activity (the missing ones count as
// $0, so they don't inflate or distort the sum).
export function yearTotals(year){
  const months = fullYearMonths(year);
  let ingresos=0, gastos=0, inversiones=0;
  months.forEach(m=>{
    const t = monthTotals(m);
    ingresos += t.ingresos; gastos += t.gastos; inversiones += t.inversiones;
  });
  return {
    year, months, ingresos, gastos, inversiones,
    // Tasa de ahorro = cuánto de lo que ganaste realmente destinaste a invertir (no "lo que
    // sobró" -- eso puede incluir plata sin invertir todavía, sentada en la cuenta corriente,
    // que no es ahorro real en el sentido de construir patrimonio).
    tasaAhorro: ingresos>0 ? (inversiones/ingresos)*100 : 0,
    tasaGastos: ingresos>0 ? (gastos/ingresos)*100 : 0
  };
}

// Future projection based ONLY on your real contribution pace (average of the last N months
// with data) — without inventing any return or rate of return, following the same principle
// as the rest of the app (we never suggest a growth %). It's "how much you will have put in"
// over that term, not a promise of how much your money will grow.
// The one place in the app where we DO invent a number — at the user's explicit request, to be
// able to project 20 years out. A moderate return by default, but stays editable in plain
// sight, never hidden as if it were a fact.
// Nota: hasta antes de este cambio la proyección aplicaba una tasa REAL (retorno descontado por
// inflación vía Fisher) para mostrar el resultado "en pesos de hoy" -- a pedido explícito de la
// usuaria ("quiero que quede en pesos nominal") se sacó ese descuento: el % de retorno se aplica
// directo, sin inflación de por medio, así que el número mostrado son pesos nominales del año
// en que se cumple la proyección, no poder de compra de hoy.
export let PROJECTION_ASSUMPTIONS = {retornoAnual:6};

export function projectedContributions(mesesPromedio, aniosProyeccion){
  const mesActual = todayISO().slice(0,7);
  const mesesConDatos = MONTHS.filter(m=>m<=mesActual).slice(-mesesPromedio);
  const promedioMensual = mesesConDatos.length
    ? mesesConDatos.reduce((s,m)=>s+monthTotals(m).inversiones,0)/mesesConDatos.length
    : 0;
  // The user can replace that average with their own monthly amount in the simulator (for
  // example, to see what would happen if they contributed more or less than their real
  // average) — if they haven't touched it (null), the real average keeps being used as always.
  const aporteMensualUsado = state.simulatedContribution!=null ? state.simulatedContribution : promedioMensual;
  const totalActual = activePlatformIds().reduce((s,id)=>s+platformCurrentValue(id),0);
  const aporteAnual = aporteMensualUsado*12;
  // Honest reference: only what was contributed, with no invented return %.
  const proyectadoSinRetorno = totalActual + aporteAnual*aniosProyeccion;

  // Projection with return, in nominal pesos -- straight compound growth on the return rate.
  const retornoAnual = PROJECTION_ASSUMPTIONS.retornoAnual;
  const r = retornoAnual/100;
  const factor = Math.pow(1+r, aniosProyeccion);
  const valorFuturoActual = totalActual*factor;
  const valorFuturoAportes = Math.abs(r)<0.0001 ? aporteAnual*aniosProyeccion : aporteAnual*((factor-1)/r);
  const proyectadoConRetorno = valorFuturoActual + valorFuturoAportes;

  return {promedioMensual, aporteMensualUsado, totalActual, proyectadoSinRetorno, proyectadoConRetorno, retornoAnual, meses:mesesConDatos, anios:aniosProyeccion};
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

export function buildEvolutionBars(months, selMonth){
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

// Every transaction categorized straight to this goal (see the note on INVESTMENT_GOALS in
// state.ts) -- a goal's progress is computed from these, never hand-typed.
export function metaContribTxs(meta){
  return TRANSACTIONS.filter(t=>t.tipo==='inversion' && t.categorias.some(c=>c.cat===meta.id));
}
// A transaction isn't split across goals (unlike gasto, investment rows aren't offered the
// split UI — see renderCategoryRows' allowSplit), but summing every matching row instead of
// assuming a single one is defensive and costs nothing.
export function metaContribAmount(t, metaId){
  return t.categorias.filter(c=>c.cat===metaId).reduce((s,c)=>s+c.monto,0);
}
// Total ever put into this goal: the seed from before it was tracked in the app (startingAmount,
// set on the goal's own form) plus every transaction categorized to it since. This is what used
// to be the hand-typed "aportadoNeto".
export function metaAportadoNeto(meta){
  const contribs = metaContribTxs(meta).reduce((s,t)=>s+metaContribAmount(t, meta.id), 0);
  return (meta.startingAmount||0) + contribs;
}
// Cumulative total as of a given month (inclusive) -- null before the goal's startMonth (not
// tracked yet, same "no data" meaning MONTHS/historial used before). This is what used to be a
// single hand-typed historial[monthKey] entry; now it's derived on the fly from real
// transactions, so it can't drift out of sync with what's actually categorized.
export function metaHistorialAt(meta, monthKey){
  const start = meta.startMonth || monthKey;
  if(monthKey < start) return null;
  const contribs = metaContribTxs(meta).filter(t=>t.fecha.slice(0,7)<=monthKey)
    .reduce((s,t)=>s+metaContribAmount(t, meta.id), 0);
  return (meta.startingAmount||0) + contribs;
}
// Sequential month range from the goal's startMonth through the latest month the app knows
// about (MONTHS' last entry, which always includes the current month -- see
// currentMonthIndex()). Built independently of MONTHS itself (rather than filtering it) because
// a goal can start earlier than MONTHS' own earliest entry.
export function metaMonths(meta){
  const start = meta.startMonth || todayISO().slice(0,7);
  const end = MONTHS[MONTHS.length-1] || start;
  const out = [];
  let y = parseInt(start.slice(0,4),10), m = parseInt(start.slice(5,7),10);
  const ey = parseInt(end.slice(0,4),10), em = parseInt(end.slice(5,7),10);
  while(y<ey || (y===ey && m<=em)){
    out.push(y+'-'+String(m).padStart(2,'0'));
    m++; if(m>12){ m=1; y++; }
  }
  return out;
}
export function metaAcumuladoActual(meta){
  return metaAportadoNeto(meta);
}
// Estimated profit of the goal: unlike a platform (which has its own manually-updated "current
// value" to compare against what was contributed), a goal has no value curve of its own --
// there's only ever been one place to type "what this is worth today" (the platform's Actualizar
// valor form). So a goal's estimated gain is its share of the PLATFORM's own gain, prorated by
// how much of that platform's total net contribution belongs to this goal -- same principle as
// the platform-level estimate (renderPlatformGroup), just split proportionally instead of
// invented from scratch. It's the base on which its own fee is calculated, same as on platforms.
export function metaGananciaEstimada(meta){
  const aportadoPlataforma = platformAportadoNeto(meta.plataformaId);
  if(aportadoPlataforma<=0) return 0;
  const gananciaPlataforma = Math.max(0, platformCurrentValue(meta.plataformaId) - aportadoPlataforma);
  const share = metaAportadoNeto(meta)/aportadoPlataforma;
  return gananciaPlataforma*share;
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
export function goalsForPlatform(id){
  return INVESTMENT_GOALS.filter(m=>m.plataformaId===id);
}
// Combined summary of the goals of ONE platform: sum of target/accumulated, and a combined
// streak that only lights up if ALL of that platform's goals have an active streak today — in
// that case the number is the shortest streak (the months in which you met ALL of them at
// once), not the longest.
export function platformGoalsSummary(id){
  const metas = goalsForPlatform(id);
  // A flow-only goal (no montoObjetivo -- see the note on InvestmentGoal in types.ts) has no
  // stock total to add here; ||0 keeps this a real STOCK sum instead of NaN as soon as one goal
  // in the platform lacks montoObjetivo (undefined+number===NaN in JS). This combined figure is
  // itself only meaningful (and only rendered, see renderPlatformGroup in views/inversiones.ts)
  // when at least one of the platform's goals actually has a montoObjetivo -- a platform whose
  // goals are all flow-only would otherwise show a meaningless "$X de $0 · 0%".
  const totalObjetivo = metas.reduce((s,m)=>s+(m.montoObjetivo||0),0);
  const totalAcumulado = metas.reduce((s,m)=>s+metaAcumuladoActual(m),0);
  const rachas = metas.map(metaRacha);
  const rachaCombinada = (metas.length>0 && rachas.every(r=>r>0)) ? Math.min(...rachas) : 0;
  return {metas, totalObjetivo, totalAcumulado, rachaCombinada};
}
// The investment objective is a FLOW metric (what you committed to invest THIS YEAR), never a
// STOCK one -- this replaces the old totalGoalProgress(), which mixed both natures: it compared
// the STOCK total of every goal's montoObjetivo against the STOCK lifetime accumulated-since-
// start total, mislabeled in the UI as if it were something annual. See the note on
// InvestmentGoal (types.ts) for the montoObjetivo/aporteMensualMeta stock/flow distinction.
//   - objetivoAnual: sum of aporteMensualMeta × 12, for every goal that HAS a fixed
//     aporteMensualMeta -- a flow-only "whatever I can" goal contributes $0 here, there's no
//     committed amount to multiply.
//   - aporteAnio: how much was ACTUALLY contributed this year to those SAME fixed-aporte goals
//     (never lifetime, never a flow-only goal's contributions) -- this is the progress bar's
//     numerator, so a flexible contribution elsewhere can never push it past 100%.
//   - otrosAporteAnio: everything else invested this year -- a flow-only goal's contributions
//     (no aporteMensualMeta), a platform's General bucket, or the "Otros" platform. Informational
//     only, NEVER added to the bar's numerator. Every tipo:'inversion' transaction (excluding a
//     'no_es_gasto' write-off, same exclusion aggregatedTxAmount/aportadoAcumuladoHastaMesONull
//     already apply) lands in exactly one of aporteAnio/otrosAporteAnio.
export function annualInvestmentGoalProgress(year){
  const fixedGoals = INVESTMENT_GOALS.filter(m=>m.aporteMensualMeta!=null);
  const fixedGoalIds = new Set(fixedGoals.map(m=>m.id));
  const objetivoAnual = fixedGoals.reduce((s,m)=>s+(m.aporteMensualMeta||0), 0) * 12;
  const aporteAnio = fixedGoals.reduce((s,m)=>
    s + metaContribTxs(m)
      .filter(t=>t.fecha.slice(0,4)===year && t.estado!=='no_es_gasto')
      .reduce((s2,t)=>s2+metaContribAmount(t, m.id), 0)
  , 0);
  let otrosAporteAnio = 0;
  TRANSACTIONS.forEach(t=>{
    if(t.tipo!=='inversion' || t.estado==='no_es_gasto' || t.fecha.slice(0,4)!==year) return;
    t.categorias.forEach(c=>{ if(!fixedGoalIds.has(c.cat)) otrosAporteAnio += c.monto; });
  });
  return {objetivoAnual, aporteAnio, otrosAporteAnio};
}
// 12 little squares (January-December of the current year) to mark by hand whether you hit
// your TOTAL investment goal that month — independent of each individual goal's own checks.
// An unmarked month looks the same as "not met" (there's no way to tell "hasn't arrived yet"
// apart from "you didn't mark it"), which is fine: it's a habit you keep, not a calculation.
// Streak of the TOTAL investment goal — same rule as metaRacha (counts backward from the
// current month while it's marked as met), but over TOTAL_GOAL_CHECKS instead of a single
// goal's checks. This used to not generate any streak, unlike the per-platform goals, which
// did show one.
export function metaTotalRacha(){
  const year = todayISO().slice(0,4);
  const mesActual = todayISO().slice(0,7);
  const months = fullYearMonths(year).filter(m=>m<=mesActual);
  let racha = 0;
  for(let i=months.length-1;i>=0;i--){
    if(TOTAL_GOAL_CHECKS[months[i]]) racha++;
    else break;
  }
  return racha;
}
export function renderTotalChecksGrid(){
  const year = todayISO().slice(0,4);
  const months = fullYearMonths(year);
  const racha = metaTotalRacha();
  const cells = months.map(m=>{
    const checked = !!TOTAL_GOAL_CHECKS[m];
    const monthIdx = parseInt(m.slice(5,7),10)-1;
    const short = MONTHS_LONG[monthIdx].slice(0,3);
    const label = short.charAt(0).toUpperCase()+short.slice(1);
    return '<button class="meta-total-check-cell'+(checked?' done':'')+'" data-toggle-goal-total-check="'+m+'" aria-pressed="'+(checked?'true':'false')+'" aria-label="'+label+' '+year+(checked?': objetivo total cumplido':': no marcado')+'">'+
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

export function renderGoalEditForm(meta, plataformaId?){
  const d = state.goalDraft;
  const ctxId = meta ? meta.plataformaId : (plataformaId || state.addGoalPlatformId);
  const ctxNombre = ctxId ? catInfo(ctxId).nombre : '';
  return '<div class="card meta-goal-card editing">'+
    (ctxNombre ? '<div class="meta-goal-ctx muted">'+(meta?'Meta en ':'Nueva meta en ')+ctxNombre+'</div>' : '')+
    '<label class="draft-label">Nombre de la meta</label>'+
    '<input type="text" class="draft-input" data-goal-field="nombre" value="'+d.nombre.replace(/"/g,'&quot;')+'" placeholder="Ej: Fondo de emergencia">'+
    '<label class="draft-label" style="margin-top:12px;">Monto objetivo (opcional)</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-goal-field="montoObjetivo" value="'+d.montoObjetivo+'" placeholder="Déjalo vacío si no juntas un total">'+
    '<div class="platform-hint muted">Ponlo solo si esta meta es juntar un total (ej. el pie de un depto) — muestra una barra de progreso hacia ese monto. Si es una meta de aporte mensual sin un total fijo, déjalo vacío.</div>'+
    '<label class="draft-label" style="margin-top:12px;">Aporte mensual meta (opcional)</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-goal-field="aporteMensualMeta" value="'+d.aporteMensualMeta+'" placeholder="Déjalo vacío si aportas lo que puedas">'+
    '<div class="platform-hint muted">Si tienes un monto fijo que aportas cada mes, ponlo acá — suma al objetivo de inversión del año y a tu meta de Inversión en Balance. Si prefieres aportar "lo que más puedas" sin comprometerte a un monto, déjalo vacío: igual cuenta como inversión real cuando aportes.</div>'+
    '<label class="draft-label" style="margin-top:12px;">¿Cuánto tienes ahorrado hasta ahora?</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-goal-field="aportadoInicial" value="'+d.aportadoInicial+'" placeholder="0">'+
    '<div class="platform-hint muted">Lo que ya tenías guardado para esta meta antes de empezar a registrarla acá. Se suma a lo que categorices desde el mes de inicio de abajo.</div>'+
    '<label class="draft-label" style="margin-top:12px;">¿Desde qué mes partiste con esta meta?</label>'+
    '<input type="month" class="draft-input" data-goal-field="mesInicio" value="'+d.mesInicio+'">'+
    '<div class="platform-hint muted">Si empezaste antes de usar la app, hazla partir en ese mes — así tus transacciones antiguas de ese período también cuentan para el progreso.</div>'+
    '<label class="draft-label" style="margin-top:12px;">Plazo</label>'+
    segmentedHtml('meta-plazo', [{id:'corto',label:'Corto'},{id:'medio',label:'Medio'},{id:'largo',label:'Largo'}], d.plazo, false)+
    '<label class="draft-label" style="margin-top:12px;">Comisión anual / TAC (opcional)</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-goal-field="comision" value="'+d.comision+'" placeholder="Ej: 1.1">'+
    '<div class="platform-hint muted">El % que te cobra el fondo específico de esta meta — ponlo tú, la app no te sugiere ningún número. Se calcula sobre tu ganancia, no sobre el total ahorrado.</div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-goal-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-goal="'+(meta?meta.id:'nueva')+'">Guardar</button>'+
    '</div>'+
    (meta ? '<button class="budget-delete-link" data-delete-goal="'+meta.id+'">Eliminar meta</button>' : '')+
  '</div>';
}

// The check squares used to only go up to the last month with real data (metaMonths) — so if
// you just created the goal in August, September onward wouldn't even show up. Now they extend
// from the first month with data (or the current month, if the goal is new and doesn't have
// any yet) through December of the current year, same rule the total-goal grid already uses:
// future months look the same as "unmarked" — there's no way to tell "hasn't arrived yet" apart
// from "you didn't mark it", and that's fine.
export function metaChecksMonths(meta){
  const year = todayISO().slice(0,4);
  const tracked = metaMonths(meta);
  const start = tracked.length ? tracked[0] : todayISO().slice(0,7);
  return fullYearMonths(year).filter(m=>m>=start);
}
export function renderGoalCard(meta){
  if(state.editingGoalId===meta.id) return renderGoalEditForm(meta);

  const trackedMonths = metaMonths(meta);
  const acumulado = metaAcumuladoActual(meta);
  const tieneObjetivo = meta.montoObjetivo!=null;
  const pct = (tieneObjetivo && meta.montoObjetivo>0) ? (acumulado/meta.montoObjetivo)*100 : 0;
  const racha = metaRacha(meta);
  const comision = meta.comision;
  const gananciaMeta = metaGananciaEstimada(meta);
  const comisionRow = comision!=null ? (
    '<div class="platform-comision-row">'+
      '<span>Comisión anual: <b class="tabular">'+comision+'%</b></span>'+
      '<span class="muted tabular">≈ '+money(gananciaMeta*comision/100)+'/año sobre tu ganancia</span>'+
    '</div>'
  ) : '';
  const historialVals = trackedMonths.map(m=> metaHistorialAt(meta,m));
  const checksRow = metaChecksMonths(meta).map(m=>{
    const short = MONTH_LABEL[m].split(' ')[0].slice(0,3);
    const done = !!meta.checks[m];
    return '<button class="meta-check-chip'+(done?' done':'')+'" data-toggle-goal-check="'+meta.id+'" data-toggle-goal-month="'+m+'">'+
      '<span class="mcc-icon">'+(done?ICONS.check:ICONS.close)+'</span><span class="mcc-label">'+short+'</span>'+
    '</button>';
  }).join('');

  // Stock progress (figs + bar) only applies to a goal with a total to save up to
  // (montoObjetivo) -- a flow goal (no total, whether or not it has a fixed monthly amount) has
  // nothing to show 0%/100% against, so this block is skipped entirely instead of rendering a
  // misleading "$X de $0 · 0%" (see the note on InvestmentGoal in types.ts).
  const stockBlock = tieneObjetivo ? (
    '<div class="meta-goal-figs"><span class="tabular gastado">'+money(acumulado)+'</span><span class="of-text"> de '+money(meta.montoObjetivo)+'</span><span class="budget-pct tabular">'+Math.round(pct)+'%</span></div>'+
    '<div class="budget-track"><div class="budget-fill" style="width:'+Math.max(0,Math.min(100,pct))+'%;background:var(--accent);"></div></div>'
  ) : '';
  // "Meta de aporte" only applies to a goal with a fixed monthly target -- a "contribute whatever
  // I can" goal (no aporteMensualMeta) has no such figure to show.
  const aporteBlock = meta.aporteMensualMeta!=null
    ? '<div class="meta-goal-aporte muted">Meta de aporte<br><span class="tabular" style="color:var(--text);font-weight:600;">'+money(meta.aporteMensualMeta)+'</span>/mes</div>'
    : '';

  return '<div class="card meta-goal-card">'+
    '<div class="meta-goal-head">'+
      '<span class="meta-goal-name">'+meta.nombre+'</span>'+
      termChip(meta.plazo)+
      (racha>0 ? '<span class="meta-racha-badge">'+racha+' 🔥</span>' : '')+
      '<button class="budget-edit-btn" data-edit-goal="'+meta.id+'" aria-label="Editar '+meta.nombre+'">'+ICONS.edit+'</button>'+
    '</div>'+
    stockBlock+
    comisionRow+
    '<div class="meta-goal-spark-row">'+
      '<div class="meta-goal-spark">'+buildSparkline(historialVals, 120, 32, 'var(--accent)')+'</div>'+
      aporteBlock+
    '</div>'+
    '<div class="meta-check-row">'+checksRow+'</div>'+
    '<div class="meta-racha">'+(racha>0 ? 'Racha activa — cumpliste tu aporte '+racha+' '+(racha===1?'mes':'meses')+' seguidos hasta hoy' : 'Sin racha activa — marca los meses en que cumpliste tu aporte') +'</div>'+
  '</div>';
}

// The 12 months of a full year (January-December), independent of MONTHS (which only has the
// months that have actually been used in Transactions/Budget). Evolution wants to show the
// whole year even if the months with no data come out at zero — so we generate the keys and
// their labels on the fly, without touching the global MONTHS (that would break the rest of
// the app: Balance navigation, goals, platforms, etc).
export function fullYearMonths(year){
  const out = [];
  for(let m=1;m<=12;m++){
    const key = year+'-'+String(m).padStart(2,'0');
    if(!MONTH_LABEL[key]) MONTH_LABEL[key] = monthLabelFor(key);
    out.push(key);
  }
  return out;
}

export function renderEvolutionView(){
  const year = todayISO().slice(0,4);
  const months = fullYearMonths(year);
  const mesActual = todayISO().slice(0,7);
  const selMonth = (state.evolutionSelectedMonth && months.includes(state.evolutionSelectedMonth)) ? state.evolutionSelectedMonth : mesActual;
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
      buildEvolutionBars(months, selMonth)+
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
