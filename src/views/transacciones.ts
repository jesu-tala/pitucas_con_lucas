import { allCollected, capitalizeFirst, catInfo, categoryFilterMatches, dayLabel, netIncomeTx, lastSalaryTx, paymentMethodInfo, paymentMethodTagIcon, currentMonthHasSalary, pendingEffectiveAmount, hasReceivableType } from '../helpers';
import { ICONS, catIconMarkup } from '../icons';
import { getTx, openNewTxSheet, renderSheet } from '../sheet';
import { MONTH_LABEL, TRANSACTIONS, money, normalize, state, todayISO } from '../state';
/* ===================== TRANSACTIONS VIEW ===================== */
export function filteredTx(){
  // View 1 shows all transactions (not filtered by month, unlike Balance),
  // except when arriving via a category "drill-down" from Balance (which does bring a month).
  let list = TRANSACTIONS.slice().sort((a,b)=> (b.fecha+b.hora).localeCompare(a.fecha+a.hora));
  if(state.filter==='entradas') list = list.filter(t=>t.tipo==='ingreso');
  else if(state.filter==='porcobrar') list = list.filter(t=>t.estado==='por_cobrar' && hasReceivableType(t,'persona') && !allCollected(t));
  else if(state.filter==='reembolso') list = list.filter(t=>t.estado==='por_cobrar' && hasReceivableType(t,'reembolso') && !allCollected(t));
  else if(state.filter==='pendientes') list = list.filter(t=>t.estado==='pendiente');
  if(state.categoryFilter){
    // categoryFilter can be a plain category, a Goal's id, or (from a platform's "Ver
    // transacciones →") a platform id -- in which case it should match every transaction that
    // rolls up into that platform (any of its goals, or its General bucket), not just an exact
    // id (a bare platform id is never itself a transaction's category, see catInfo() in
    // helpers.ts).
    list = list.filter(t=>t.categorias.some(c=>categoryFilterMatches(c.cat, state.categoryFilter)));
  }
  if(state.categoryFilterMonth){
    list = list.filter(t=>t.fecha.slice(0,7)===state.categoryFilterMonth);
  }
  if(state.searchQuery.trim()){
    const q = normalize(state.searchQuery);
    list = list.filter(t=>normalize(t.comercio).includes(q));
  }
  const af = state.advFilters;
  if(af.cats.length){
    list = list.filter(t=> t.categorias.some(c=>af.cats.includes(c.cat)) || (t.categorias.length===0 && af.cats.includes('__sin_cat__')));
  }
  if(af.medios.length){
    list = list.filter(t=>af.medios.includes(t.medio));
  }
  if(af.dateFrom){ list = list.filter(t=>t.fecha>=af.dateFrom); }
  if(af.dateTo){ list = list.filter(t=>t.fecha<=af.dateTo); }
  return list;
}

export function renderFilterSummary(){
  // Aggregated summary over ALL transactions (the whole year), unless there's already an
  // active category/month filter — in that case it's computed over that same subset.
  const base = state.categoryFilter ? filteredTx() : TRANSACTIONS;
  if(state.filter==='entradas'){
    const ingresos = base.filter(t=>t.tipo==='ingreso').reduce((s,t)=>s+netIncomeTx(t),0);
    const reembolsos = base.reduce((s,t)=> s + t.porCobrar.filter(p=>p.pagado && p.tipo==='reembolso').reduce((ss,p)=>ss+pendingEffectiveAmount(p),0), 0);
    return '<div class="stat-grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px;">'+
      '<div class="card stat-tile stat-ingresos"><div class="stat-label">Ingresos</div><div class="stat-value tabular">'+money(ingresos)+'</div></div>'+
      '<div class="card stat-tile" style="background:var(--surface);border:1px solid var(--border);"><div class="stat-label">Reembolsos</div><div class="stat-value tabular">'+money(reembolsos)+'</div></div>'+
    '</div>';
  }
  if(state.filter==='porcobrar'){
    const relevantes = base.filter(t=>t.estado==='por_cobrar' && hasReceivableType(t,'persona'));
    const bruto = relevantes.reduce((s,t)=>s+t.monto,0);
    const pendiente = relevantes.reduce((s,t)=> s + t.porCobrar.filter(p=>p.tipo==='persona' && !p.pagado).reduce((ss,p)=>ss+p.monto,0), 0);
    const saldado = relevantes.reduce((s,t)=> s + t.porCobrar.filter(p=>p.tipo==='persona' && p.pagado).reduce((ss,p)=>ss+p.monto,0), 0);
    return '<div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px;">'+
      '<div class="card stat-tile" style="padding:11px 10px;background:var(--surface);border:1px solid var(--border);"><div class="stat-label" style="font-size:10.5px;">Salidas</div><div class="stat-value tabular" style="font-size:15px;">'+money(bruto)+'</div></div>'+
      '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--invest-fill) 16%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Por cobrar</div><div class="stat-value tabular" style="font-size:15px;color:var(--invest-ink);">'+money(pendiente)+'</div></div>'+
      '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--income-fill) 16%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Saldadas</div><div class="stat-value tabular" style="font-size:15px;color:var(--income-ink);">'+money(saldado)+'</div></div>'+
    '</div>';
  }
  if(state.filter==='reembolso'){
    const relevantes = base.filter(t=>t.estado==='por_cobrar' && hasReceivableType(t,'reembolso'));
    const bruto = relevantes.reduce((s,t)=>s+t.monto,0);
    const yaLlego = relevantes.reduce((s,t)=> s + t.porCobrar.filter(p=>p.tipo==='reembolso' && p.pagado).reduce((ss,p)=>ss+pendingEffectiveAmount(p),0), 0);
    const pendiente = relevantes.reduce((s,t)=> s + t.porCobrar.filter(p=>p.tipo==='reembolso' && !p.pagado).reduce((ss,p)=>ss+(p.monto||0),0), 0);
    return '<div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px;">'+
      '<div class="card stat-tile" style="padding:11px 10px;background:var(--surface);border:1px solid var(--border);"><div class="stat-label" style="font-size:10.5px;">Gasto original</div><div class="stat-value tabular" style="font-size:15px;">'+money(bruto)+'</div></div>'+
      '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--cat-mint-fill) 30%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Ya llegó</div><div class="stat-value tabular" style="font-size:15px;color:var(--cat-mint-ink);">'+money(yaLlego)+'</div></div>'+
      '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--invest-fill) 16%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Pendiente</div><div class="stat-value tabular" style="font-size:15px;color:var(--invest-ink);">'+money(pendiente)+'</div></div>'+
    '</div>';
  }
  if(state.filter==='pendientes'){
    const relevantes = base.filter(t=>t.estado==='pendiente');
    const total = relevantes.reduce((s,t)=>s+t.monto,0);
    return '<div class="card" style="padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">'+
      '<span class="muted" style="font-size:12.5px;">'+relevantes.length+' transacción'+(relevantes.length===1?'':'es')+' sin clasificar</span>'+
      '<span class="tabular" style="font-weight:500;font-size:14px;">'+money(total)+'</span>'+
    '</div>';
  }
  return '';
}

export function renderTxItem(t){
  const cats = t.categorias;
  const isUnclassified = cats.length===0 && t.estado!=='no_es_gasto';
  const primaryCat = cats[0] ? catInfo(cats[0].cat) : {nombre:'Sin categoría', color:'neutral', icon: isUnclassified?'question':'more'};
  const isMulti = cats.length>1;
  const isIncome = t.tipo==='ingreso';
  const isNoGasto = t.estado==='no_es_gasto';
  const isCobrado = t.estado==='por_cobrar' && allCollected(t);
  let amountClass = 'neg';
  if(isIncome) amountClass='pos';
  if(isNoGasto) amountClass='muted-amt';
  let sign = isIncome ? '+' : (isNoGasto?'':'');
  let amtDisplay = sign + money(t.monto);

  let leftLabel;
  if(t.cuotaProyectada) leftLabel = 'Cuota '+t.cuotaNumero+'/'+t.cuotaTotal;
  else if(isMulti) leftLabel = cats.length+' categorías';
  else if(isUnclassified) leftLabel = 'Sin clasificar';
  else leftLabel = primaryCat.nombre;

  let stateTag = '';
  if(isCobrado) stateTag = '<span class="tx-state state-cobrado-inline">'+(hasReceivableType(t,'reembolso')?'Reembolsado':'Cobrado')+'</span>';
  else if(t.estado==='por_cobrar') stateTag = hasReceivableType(t,'reembolso') ? '<span class="tx-state state-reembolso">Reembolso</span>' : '<span class="tx-state state-porcobrar">Por cobrar</span>';
  else if(t.estado==='no_es_gasto') stateTag = '<span class="tx-state state-noesgasto">No es gasto</span>';

  const medio = paymentMethodInfo(t.medio);

  return '<button class="tx-item" data-tx="'+t.id+'">'+
    '<span class="tx-avatar" style="--fill:var(--cat-'+primaryCat.color+'-fill);--ink:var(--cat-'+primaryCat.color+'-ink)">'+catIconMarkup(primaryCat.icon)+'</span>'+
    '<span class="tx-info">'+
      '<span class="tx-name'+(isCobrado?' tachado':'')+'">'+t.comercio+'</span>'+
      '<span class="tx-sub">'+(t.reglaAuto?'<span class="lock-badge">'+ICONS.lockSmall+'</span>':'')+
        '<span style="overflow:hidden;text-overflow:ellipsis;">'+leftLabel+'</span>'+stateTag+
      '</span>'+
    '</span>'+
    '<span class="tx-right">'+
      '<span class="tx-amount tabular '+amountClass+'">'+amtDisplay+'</span>'+
      '<div class="tx-right-sub">'+(paymentMethodTagIcon(medio)?'<span class="medio-tag-icon">'+paymentMethodTagIcon(medio)+'</span>':'')+medio.corto+'</div>'+
    '</span>'+
  '</button>';
}

export function advFilterCount(){
  const af = state.advFilters;
  return af.cats.length + af.medios.length + (af.dateFrom?1:0) + (af.dateTo?1:0);
}

export function renderTxResultsInner(){
  const list = filteredTx();
  let groupsHtml = '';
  if(list.length===0){
    groupsHtml = '<div class="empty-state">'+ICONS.inbox+'<div>No hay transacciones que calcen con esta búsqueda o filtro.</div></div>';
  } else {
    const groups = [];
    let lastDay=null, curGroup=null;
    list.forEach(t=>{
      if(t.fecha!==lastDay){ curGroup={fecha:t.fecha, items:[]}; groups.push(curGroup); lastDay=t.fecha; }
      curGroup.items.push(t);
    });
    groupsHtml = groups.map(g=>
      '<div class="day-group"><div class="day-label">'+capitalizeFirst(dayLabel(g.fecha))+'</div><div class="tx-list">'+
      g.items.map(renderTxItem).join('')+'</div></div>'
    ).join('');
  }
  return renderFilterSummary() + groupsHtml;
}

// Re-renders only the results (not the search box) so as not to lose focus/cursor
// while the person keeps typing in the search box.
export function renderTxResultsOnly(){
  const el = document.getElementById('tx-results');
  if(el) el.innerHTML = renderTxResultsInner();
}

export function renderTransactionsView(){
  document.getElementById('header-title').textContent = 'Transacciones';
  const chips = [
    {id:'todas',label:'Todas'},
    {id:'entradas',label:'Entradas'},
    {id:'porcobrar',label:'Por cobrar'},
    {id:'reembolso',label:'Reembolso'},
    {id:'pendientes',label:'Pendientes'}
  ];
  let chipsHtml = chips.map(c=>'<button class="chip '+(state.filter===c.id?'active':'')+'" data-filter="'+c.id+'">'+c.label+'</button>').join('');
  let filterPill = '';
  if(state.categoryFilter){
    const pillLabel = catInfo(state.categoryFilter).nombre + (state.categoryFilterMonth ? ' · '+MONTH_LABEL[state.categoryFilterMonth] : '');
    filterPill = '<button class="chip filter-active" data-clear-catfilter="1">'+pillLabel+' '+ICONS.close+'</button>';
  }
  const advCount = advFilterCount();

  const searchRow =
    '<div class="search-row">'+
      '<div class="search-field">'+
        '<span class="search-icon">'+ICONS.search+'</span>'+
        '<input type="text" class="search-input" id="tx-search-input" placeholder="Buscar por comercio, ej: uber" value="'+(state.searchQuery||'').replace(/"/g,'&quot;')+'">'+
        '<button class="search-clear" id="tx-search-clear" data-clear-search aria-label="Borrar búsqueda" '+(state.searchQuery?'':'hidden')+'>'+ICONS.close+'</button>'+
      '</div>'+
      '<button class="filter-open-btn'+(advCount?' active':'')+'" data-open-filters aria-label="Filtros">'+ICONS.filterFunnel+(advCount?'<span class="filter-badge">'+advCount+'</span>':'')+'</button>'+
    '</div>';

  let sueldoBanner = '';
  if(state.filter==='todas' && !state.categoryFilter && !state.searchQuery.trim()){
    const ym = todayISO().slice(0,7);
    const last = lastSalaryTx();
    if(last && !currentMonthHasSalary() && state.salaryBannerDismissedMonth!==ym){
      sueldoBanner = '<div class="card sueldo-suggestion">'+
        '<div class="sueldo-suggestion-title">¿Ya te llegó tu sueldo de '+(MONTH_LABEL[ym]||ym)+'?</div>'+
        '<div class="sueldo-suggestion-sub">Como no manda correo, no se agrega sola — la última vez fue '+money(last.monto)+'.</div>'+
        '<div class="sueldo-suggestion-actions">'+
          '<button class="chip" data-dismiss-salary-suggestion>Todavía no</button>'+
          '<button class="save-tx-btn" data-confirm-salary-suggestion="'+last.id+'">Confirmar o ajustar</button>'+
        '</div>'+
      '</div>';
    }
  }

  document.getElementById('view-root').innerHTML =
    searchRow +
    '<div class="chip-row">'+filterPill+chipsHtml+'</div>'+
    sueldoBanner+
    '<div id="tx-results">'+renderTxResultsInner()+'</div>'+
    '<div style="height:64px;"></div>';
}

// Opens the "new transaction" sheet pre-filled with the data from the last time the
// salary was recorded, so the user only has to confirm the amount (if it didn't change)
// or adjust it (if it did) before saving — it's never saved on its own without her seeing it first.
export function openSalarySuggestionSheet(lastId){
  const last = getTx(lastId);
  const ym = todayISO().slice(0,7);
  const mesNombre = (MONTH_LABEL[ym]||'').split(' ')[0] || '';
  openNewTxSheet('ingreso');
  state.draftTx.comercio = mesNombre ? ('Sueldo '+mesNombre) : 'Sueldo';
  state.draftTx.monto = last ? last.monto : 0;
  state.draftTx.medio = last ? last.medio : state.draftTx.medio;
  state.draftTx.recurrencia = 'mensual';
  state.draftTx.categorias = [{cat:'sueldo', monto: last ? last.monto : 0}];
  renderSheet();
}

