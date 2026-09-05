import { catInfo, catNetAmount, netExpenseTx, monthlyReimbursementTotal, reimbursementTotalForMonths, aggregatedTxAmount, txsOfMonth } from '../helpers';
import { ICONS, catIconMarkup } from '../icons';
import { segmentedHtml } from '../sheet';
import { CATEGORIES, SPENDING_GOAL_PCT, MONTHS, BUDGETS, money, monthlyBudgetTotal, state, todayISO } from '../state';
import { referenceMonthlyIncome, monthlyInvestmentGoalCLP, investmentGoalPct, monthSwitcherHtml, yearSwitcherHtml, renderDonutBlock, renderGoalSummaryCard } from '../ui/donut';
import { yearTotals, fullYearMonths } from './evolucion';
/* ===================== BUDGET (Phase 2) ===================== */
export function catMonthExpense(catId, monthKey){
  return txsOfMonth(monthKey)
    .filter(t=>t.tipo==='gasto' && t.estado!=='no_es_gasto')
    .reduce((sum,t)=> sum + t.categorias.filter(c=>c.cat===catId).reduce((s,c)=>s+catNetAmount(t,c),0), 0);
}
export function priorMonths(monthKey, n){
  const idx = MONTHS.indexOf(monthKey);
  const result = [];
  for(let i=idx-1; i>=0 && result.length<n; i--){ result.push(MONTHS[i]); }
  return result;
}
export function catPromedio3Meses(catId, monthKey){
  const prior = priorMonths(monthKey, 3);
  if(prior.length===0) return null;
  const total = prior.reduce((s,m)=>s+catMonthExpense(catId,m),0);
  return total/prior.length;
}
export function catGastoMesAnterior(catId, monthKey){
  const prior = priorMonths(monthKey, 1);
  if(prior.length===0) return null;
  return catMonthExpense(catId, prior[0]);
}
export function budgetZoneColor(pct){
  return pct>=100 ? 'var(--expense-fill)' : pct>=80 ? 'var(--cat-butter-fill)' : 'var(--income-fill)';
}
export function renderBudgetBar(pct){
  const w = Math.max(0, Math.min(100, pct));
  return '<div class="budget-track"><div class="budget-fill" style="width:'+w+'%;background:'+budgetZoneColor(pct)+';"></div></div>';
}
export function budgetAlertBadge(pct, alertas){
  if(!alertas) return '';
  const crossed = [100,90,80].find(t=>alertas[t] && pct>=t);
  if(crossed===undefined) return '';
  const tone = crossed>=100 ? 'bad' : crossed>=90 ? 'bad' : 'ok';
  const label = crossed>=100 ? 'Llegaste al 100% de tu meta' : 'Ya vas en el '+crossed+'% de tu meta';
  return '<span class="meta-status '+tone+'" style="margin-top:8px;">'+label+'</span>';
}
export function renderBudgetEditForm(catId, cfg){
  const cat = catInfo(catId);
  const d = state.budgetDraft;
  const alertChip = (t)=> '<button class="alert-chip'+(d.alertas[t]?' active':'')+'" data-toggle-alert="'+t+'">'+t+'%</button>';
  return '<div class="card budget-cat-card editing">'+
    '<div class="budget-cat-head">'+
      '<span class="budget-cat-icon" style="--fill:var(--cat-'+cat.color+'-fill);--ink:var(--cat-'+cat.color+'-ink)">'+catIconMarkup(cat.icon)+'</span>'+
      '<span class="budget-cat-name">'+cat.nombre+'</span>'+
    '</div>'+
    '<label class="draft-label">Meta mensual</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-budget-goal-input value="'+d.meta+'" placeholder="0">'+
    '<label class="draft-label" style="margin-top:12px;">Avisarme al</label>'+
    '<div class="alert-chip-row">'+alertChip(80)+alertChip(90)+alertChip(100)+'</div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-budget-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-budget="'+catId+'">Guardar</button>'+
    '</div>'+
    (cfg ? '<button class="budget-delete-link" data-delete-budget="'+catId+'">Eliminar presupuesto</button>' : '')+
  '</div>';
}
export function renderBudgetCatCard(catId){
  const cat = catInfo(catId);
  const month = MONTHS[state.monthIndex];
  const cfg = BUDGETS[catId];

  if(state.editingBudgetCat===catId){
    return renderBudgetEditForm(catId, cfg);
  }

  if(!cfg){
    return '<div class="card budget-cat-card empty">'+
      '<span class="budget-cat-icon" style="--fill:var(--cat-'+cat.color+'-fill);--ink:var(--cat-'+cat.color+'-ink)">'+catIconMarkup(cat.icon)+'</span>'+
      '<span class="budget-cat-name">'+cat.nombre+'</span>'+
      '<button class="budget-add-link" data-edit-budget="'+catId+'">+ Agregar presupuesto</button>'+
    '</div>';
  }

  const gastado = catMonthExpense(catId, month);
  const meta = cfg.meta;
  const pct = meta>0 ? (gastado/meta)*100 : 0;
  const promedio3 = catPromedio3Meses(catId, month);
  const mesAnterior = catGastoMesAnterior(catId, month);
  const contexto = 'Prom. 3 meses: '+(promedio3===null?'sin datos':money(Math.round(promedio3)))+
    ' · Mes anterior: '+(mesAnterior===null?'sin datos':money(mesAnterior));

  return '<div class="card budget-cat-card">'+
    '<div class="budget-cat-head">'+
      '<span class="budget-cat-icon" style="--fill:var(--cat-'+cat.color+'-fill);--ink:var(--cat-'+cat.color+'-ink)">'+catIconMarkup(cat.icon)+'</span>'+
      '<span class="budget-cat-name">'+cat.nombre+'</span>'+
      '<button class="budget-edit-btn" data-edit-budget="'+catId+'" aria-label="Editar presupuesto de '+cat.nombre+'">'+ICONS.edit+'</button>'+
    '</div>'+
    '<div class="budget-cat-figs"><span class="tabular gastado">'+money(gastado)+'</span><span class="of-text"> de '+money(meta)+'</span><span class="budget-pct tabular">'+Math.round(pct)+'%</span></div>'+
    renderBudgetBar(pct)+
    budgetAlertBadge(pct, cfg.alertas)+
    '<div class="budget-context muted">'+contexto+'</div>'+
    '<button class="budget-ver-mas" data-budget-see-more="'+catId+'">Ver transacciones →</button>'+
  '</div>';
}
// How much the budgets you've already set per category add up to, in total — so we can flag
// (small, without interrupting) whether those categories already match the month's total budget
// or whether there's still a difference left to assign/adjust.
export function sumaPresupuestosCategorias(){
  return Object.keys(BUDGETS).reduce((s,id)=>s+(BUDGETS[id].meta||0),0);
}
export function renderBudgetCatsCalce(meta){
  const sumaCats = sumaPresupuestosCategorias();
  if(sumaCats===0) return '';
  const diff = meta - sumaCats;
  if(Math.abs(diff) < 1){
    return '<div class="budget-cats-calce ok">'+ICONS.checkCircle+' Tus categorías calzan justo con el presupuesto total ('+money(sumaCats)+').</div>';
  }
  if(diff > 0){
    return '<div class="budget-cats-calce">Categorías: '+money(sumaCats)+' asignados · quedan '+money(diff)+' del total sin repartir.</div>';
  }
  return '<div class="budget-cats-calce warn">Categorías: '+money(sumaCats)+' asignados · '+money(Math.abs(diff))+' más que tu presupuesto total.</div>';
}
export function renderBudgetTotalCard(month){
  const monthTx = txsOfMonth(month);
  const gastoTotal = monthTx.filter(t=>t.tipo==='gasto' && t.estado!=='no_es_gasto').reduce((s,t)=>s+netExpenseTx(t),0);
  const meta = monthlyBudgetTotal;
  const pct = meta>0 ? (gastoTotal/meta)*100 : 0;
  const restante = meta - gastoTotal;

  if(state.editingBudgetTotal){
    return '<div class="card budget-total-card editing">'+
      '<div class="budget-total-label">Presupuesto total del mes</div>'+
      '<input type="text" inputmode="decimal" class="draft-input tabular" data-budget-total-input value="'+state.budgetTotalDraft+'" placeholder="0" style="margin-top:8px;">'+
      '<div style="display:flex;gap:10px;margin-top:12px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-budget-total>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-save-budget-total>Guardar</button>'+
      '</div>'+
    '</div>';
  }

  return '<div class="card budget-total-card">'+
    '<div class="budget-total-head">'+
      '<span class="budget-total-label">Presupuesto total del mes</span>'+
      '<button class="budget-edit-btn" data-edit-budget-total aria-label="Editar presupuesto total">'+ICONS.edit+'</button>'+
    '</div>'+
    '<div class="budget-total-note muted">Son tus gastos del mes — no incluye lo que aportas a inversión (eso se ve aparte en Balance).</div>'+
    '<div class="budget-total-figs"><span class="tabular gastado">'+money(gastoTotal)+'</span><span class="of-text"> de '+money(meta)+'</span></div>'+
    renderBudgetBar(pct)+
    '<div class="budget-total-remaining muted">'+(restante>=0 ? 'Te quedan '+money(restante)+' · llevas el '+Math.round(pct)+'% de tu presupuesto' : 'Te pasaste por '+money(Math.abs(restante))+' · ya usaste el '+Math.round(pct)+'% de tu presupuesto')+'</div>'+
    renderBudgetCatsCalce(meta)+
  '</div>';
}
// Fixed/Variable goals (% of your income, editable) + Investment (read-only, it comes
// from your goals in the Investments tab) — with a small warning if the 3 together go over 100%
// of your income (you can't allocate more than you earn).
export function renderMetasGastoCard(){
  const metaInvPct = investmentGoalPct();
  const suma = SPENDING_GOAL_PCT.fijo + SPENDING_GOAL_PCT.variable + metaInvPct;
  const ref = referenceMonthlyIncome();
  const fijoCLP = ref>0 ? Math.round(ref*SPENDING_GOAL_PCT.fijo/100) : null;
  const variableCLP = ref>0 ? Math.round(ref*SPENDING_GOAL_PCT.variable/100) : null;
  const inversionCLP = monthlyInvestmentGoalCLP();

  if(state.editingSpendingGoals){
    return '<div class="card metas-gasto-card editing">'+
      '<div class="budget-total-label">Metas de Fijo / Variable (% de tus ingresos)</div>'+
      '<div class="metas-gasto-inputs">'+
        '<label class="metas-gasto-input-row"><span>Fijo</span><input type="text" inputmode="decimal" class="draft-input tabular" data-spending-goals-input="fijo" value="'+state.spendingGoalsDraft.fijo+'" placeholder="0">%</label>'+
        '<label class="metas-gasto-input-row"><span>Variable</span><input type="text" inputmode="decimal" class="draft-input tabular" data-spending-goals-input="variable" value="'+state.spendingGoalsDraft.variable+'" placeholder="0">%</label>'+
      '</div>'+
      '<div class="metas-gasto-inversion-note muted">+ Inversión: '+Math.round(metaInvPct)+'% (desde Inversiones, no se edita acá)</div>'+
      '<div style="display:flex;gap:10px;margin-top:12px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-spending-goals>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-save-spending-goals>Guardar</button>'+
      '</div>'+
    '</div>';
  }

  return '<div class="card metas-gasto-card">'+
    '<div class="budget-total-head">'+
      '<span class="budget-total-label">Metas de Fijo / Variable / Inversión</span>'+
      '<button class="budget-edit-btn" data-edit-spending-goals aria-label="Editar metas de Fijo/Variable">'+ICONS.edit+'</button>'+
    '</div>'+
    '<div class="metas-gasto-figs">'+
      '<span class="metas-gasto-fig"><b class="tabular">'+SPENDING_GOAL_PCT.fijo+'%</b> Fijo'+(fijoCLP!=null?'<span class="metas-gasto-fig-abs tabular">'+money(fijoCLP)+'</span>':'')+'</span>'+
      '<span class="metas-gasto-fig"><b class="tabular">'+SPENDING_GOAL_PCT.variable+'%</b> Variable'+(variableCLP!=null?'<span class="metas-gasto-fig-abs tabular">'+money(variableCLP)+'</span>':'')+'</span>'+
      '<span class="metas-gasto-fig"><b class="tabular">'+Math.round(metaInvPct)+'%</b> Inversión'+(inversionCLP>0?'<span class="metas-gasto-fig-abs tabular">'+money(inversionCLP)+'</span>':'')+'</span>'+
    '</div>'+
    '<div class="'+(Math.round(suma)>100?'budget-cats-calce warn':'budget-cats-calce')+'" style="border-top:none;padding-top:0;">'+
      (Math.round(suma)>100
        ? 'Suman '+Math.round(suma)+'% de tus ingresos — más del 100%, no calzan.'
        : 'Suman '+Math.round(suma)+'% de tus ingresos.')+
    '</div>'+
  '</div>';
}
export function renderBudgetView(){
  const month = MONTHS[state.monthIndex];
  const gastoCatIds = Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo==='gasto');
  const conPresupuesto = gastoCatIds.filter(id=>BUDGETS[id]);
  const sinPresupuesto = gastoCatIds.filter(id=>!BUDGETS[id]);

  const conHtml = conPresupuesto.length
    ? conPresupuesto.map(renderBudgetCatCard).join('')
    : '<div class="empty-state" style="padding:20px 4px;">'+ICONS.inbox+'<div>Todavía no tienes categorías con presupuesto.</div></div>';
  const sinHtml = sinPresupuesto.map(renderBudgetCatCard).join('');

  document.getElementById('resumen-content').innerHTML =
    monthSwitcherHtml()+
    renderBudgetTotalCard(month)+
    renderMetasGastoCard()+
    '<div class="section-title">Categorías con presupuesto</div>'+
    conHtml+
    (sinPresupuesto.length ? '<div class="section-title">Sin presupuesto</div>'+sinHtml : '')+
    '<div style="height:12px;"></div>';
}

// The period selector above Balance (Mes/Año) — SAME view either way, just a different range of
// transactions feeding it (renderDonutBlock/renderGoalSummaryCard don't care which period they're
// handed, see ui/donut.ts). Year mode always shows the CURRENT calendar year, no navigation —
// same scope decision Evolución already made for its own year total.
function balancePeriodoSelectorHtml(){
  return segmentedHtml('balance-periodo', [{id:'mes',label:'Mes'},{id:'año',label:'Año'}], state.balancePeriodo);
}

export function renderBalanceView(){
  if(state.balancePeriodo==='año'){ renderBalanceViewAnio(); return; }

  const month = MONTHS[state.monthIndex];
  const monthTx = txsOfMonth(month);
  let ingresos=0, gastos=0, inversiones=0;
  monthTx.forEach(t=>{
    if(t.estado==='no_es_gasto') return;
    const monto = aggregatedTxAmount(t);
    if(t.tipo==='ingreso') ingresos += monto;
    else if(t.tipo==='gasto') gastos += monto;
    else if(t.tipo==='inversion') inversiones += monto;
  });
  const balance = ingresos - gastos - inversiones;

  const html =
    balancePeriodoSelectorHtml()+
    monthSwitcherHtml()+
    '<div class="stat-grid">'+
      '<div class="card stat-tile stat-ingresos"><div class="stat-label">Ingresos</div><div class="stat-value tabular">'+money(ingresos)+'</div></div>'+
      '<div class="card stat-tile stat-gastos"><div class="stat-label">Gastos</div><div class="stat-value tabular">'+money(gastos)+'</div></div>'+
      '<div class="card stat-tile stat-inversiones"><div class="stat-label">Inversiones</div><div class="stat-value tabular">'+money(inversiones)+'</div></div>'+
      '<div class="card stat-tile stat-balance"><div class="stat-label">Balance</div><div class="stat-value tabular" style="color:'+(balance>=0?'var(--income-ink)':'var(--expense-ink)')+'">'+money(balance)+'</div></div>'+
    '</div>'+
    renderReembolsoCard(monthlyReimbursementTotal(month), 'Reembolsado este mes')+
    renderGoalSummaryCard(monthTx, ingresos, investmentGoalPct())+
    renderDonutBlock('Ingresos por categoría','De dónde llegó la plata este mes','ingreso',monthTx)+
    renderDonutBlock('Gastos por categoría','A dónde se te fue la plata este mes','gasto',monthTx)+
    renderDonutBlock('Inversiones por categoría','Tus aportes por plataforma este mes','inversion',monthTx);

  document.getElementById('resumen-content').innerHTML = html;
}

// Year mode: SAME donut/goal-card components as month mode, just fed a full calendar year's
// transactions instead of one month's — reusing yearTotals()/fullYearMonths() from
// views/evolucion.ts (the exact same functions that build Evolución's own "Total del año" card)
// so Balance's annual totals are GUARANTEED to match Evolución's number-for-number, not just
// "recomputed the same way by coincidence".
function renderBalanceViewAnio(){
  const year = todayISO().slice(0,4);
  const yr = yearTotals(year);
  const yearTx = fullYearMonths(year).flatMap(m=>txsOfMonth(m));
  const balance = yr.ingresos - yr.gastos - yr.inversiones;

  // ---- Year-mode target % for the Investment goal ----
  // SPENDING_GOAL_PCT.fijo/.variable are already plain percentages of income (a ratio), so they
  // mean exactly the same thing whether "income" is one month's or a full year's worth — no
  // rescaling needed there, AS LONG AS both the achieved-% numerator (fijo/variable pesos) and
  // denominator (ingresos) are switched to year-sums together, which renderGoalSummaryCard
  // already does by construction (it derives both from whatever periodTx/ingresos it's handed).
  //
  // The Investment goal is different: its target originates as monthlyInvestmentGoalCLP(), a
  // FIXED MONTHLY PESO amount (the sum of every goal's aporteMensualMeta) — not already a
  // period-invariant ratio. Comparing a whole year of actual investment pesos against a single
  // month's peso target (or against investmentGoalPct(), which is defined relative to ONE
  // month's reference income) would silently mix a multi-month numerator against a one-month
  // denominator and produce a meaningless, too-easy-to-clear percentage.
  // The fix: scale the peso target by how many months of the year have actually elapsed so far
  // (never all 12 — that would project months that haven't happened yet), then express that
  // scaled peso target as a % of the year's actual accumulated income:
  const mesesTranscurridos = fullYearMonths(year).filter(m=>m<=todayISO().slice(0,7));
  const objetivoInversionAcumulado = monthlyInvestmentGoalCLP()*mesesTranscurridos.length;
  const metaInvPctAnio = yr.ingresos>0 ? (objetivoInversionAcumulado/yr.ingresos)*100 : 0;

  const html =
    balancePeriodoSelectorHtml()+
    yearSwitcherHtml(year)+
    '<div class="stat-grid">'+
      '<div class="card stat-tile stat-ingresos"><div class="stat-label">Ingresos</div><div class="stat-value tabular">'+money(yr.ingresos)+'</div></div>'+
      '<div class="card stat-tile stat-gastos"><div class="stat-label">Gastos</div><div class="stat-value tabular">'+money(yr.gastos)+'</div></div>'+
      '<div class="card stat-tile stat-inversiones"><div class="stat-label">Inversiones</div><div class="stat-value tabular">'+money(yr.inversiones)+'</div></div>'+
      '<div class="card stat-tile stat-balance"><div class="stat-label">Balance</div><div class="stat-value tabular" style="color:'+(balance>=0?'var(--income-ink)':'var(--expense-ink)')+'">'+money(balance)+'</div></div>'+
    '</div>'+
    renderReembolsoCard(reimbursementTotalForMonths(fullYearMonths(year)), 'Reembolsado este año')+
    renderGoalSummaryCard(yearTx, yr.ingresos, metaInvPctAnio)+
    renderDonutBlock('Ingresos por categoría','De dónde llegó la plata este año','ingreso',yearTx)+
    renderDonutBlock('Gastos por categoría','A dónde se te fue la plata este año','gasto',yearTx)+
    renderDonutBlock('Inversiones por categoría','Tus aportes por plataforma este año','inversion',yearTx);

  document.getElementById('resumen-content').innerHTML = html;
}

// How much they got reimbursed over the period (isapre, supplemental insurance, etc.) —
// informational, it doesn't subtract from "Expenses" above: the full expense did come out of
// their pocket at the time, this just shows how much of that money has already come back.
// `r` is a {total,count} already computed for whatever period (one month or a full year) the
// caller is showing — see reimbursementTotalForMonths in helpers.ts.
export function renderReembolsoCard(r, label){
  if(r.count===0) return '';
  return '<div class="card reembolso-card">'+
    '<span class="reembolso-icon">'+ICONS.checkCircle+'</span>'+
    '<div><div class="reembolso-label">'+label+'</div>'+
    '<div class="reembolso-value tabular">'+money(r.total)+'</div></div>'+
  '</div>';
}

export function renderComingSoon(sub){
  document.getElementById('resumen-content').innerHTML =
    '<div class="card placeholder-card">'+ICONS.sparkle+'<h3>Próximamente</h3><p>Esta sección todavía no está lista.</p></div>';
}

