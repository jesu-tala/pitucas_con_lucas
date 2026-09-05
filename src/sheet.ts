import { allCollected, catInfo, dayLabel, paymentMethodInfo, pendingEffectiveAmount, pendingLinkedTo, allPendingReceivables, receivableTotal, hasReceivableType } from './helpers';
import { ICONS, catIconMarkup } from './icons';
import { render } from './render';
import { ensureMonthExists, safeEvalExpr } from './shared-expenses';
import { CATEGORIES, CONTACTS, INVESTMENT_GOALS, PAYMENT_METHODS, TRANSACTIONS, money, moneyPlainMasked, state, todayISO } from './state';
import { ReceivableItem, Transaction } from './types';
import { toast } from './ui/toasts';
import { renderShareGroupSection, renderSplitDraftForm } from './views/grupos';
import { activePlatformIds, investmentCatOptions, isPlatformArchived, platformIds } from './views/inversiones';
import { advFilterCount } from './views/transacciones';
/* ===================== DETAIL SHEET ===================== */
export function getTx(id){ return TRANSACTIONS.find(t=>t.id===id); }

export function segmentedHtml(name, options, value, disabled?){
  return '<div class="segmented" data-seg="'+name+'">'+options.map(o=>
    '<button data-seg-val="'+o.id+'" class="'+(value===o.id?'active':'')+'" '+(disabled?'disabled':'')+'>'+o.label+'</button>'
  ).join('')+'</div>';
}

// Category rows are always editable (select + amount/％ + delete), with the $/％
// switch above and "Add category" always visible — so you classify or split without
// first having to enter a separate "edit mode". `allowSplit` is turned off for investments
// (there the platform is a single one, not something split across several).
// isInvest transactions offer each of their platforms' Goals + "General" bucket options
// (investmentCatOptions) instead of the plain CATEGORIES list -- see the note on
// INVESTMENT_GOALS in state.ts. renderInvestGoalEmptyState() is shown instead of this whole
// block when there isn't a single goal to offer yet (see renderSheetContent).
function investOrPlainOptions(tipo, selectedCat){
  if(tipo==='inversion') return investmentCatOptions(selectedCat).map(o=>({value:o.value, label:o.label}));
  return Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo===tipo).map(k=>{
    const icon = CATEGORIES[k].icon;
    const label = (ICONS[icon]===undefined ? icon+' ' : '')+CATEGORIES[k].nombre;
    return {value:k, label};
  });
}
export function renderCategoryRows(t, allowSplit){
  const unit = allowSplit ? (state.splitCategoryUnit[t.id] || '$') : '$';
  const list = t.categorias.length ? t.categorias : [{cat:'', monto:t.monto}];
  const rows = list.map((c,idx)=>{
    const ci = c.cat ? catInfo(c.cat) : null;
    const opts = '<option value="">Sin categoría</option>'+investOrPlainOptions(t.tipo, c.cat).map(o=>
      '<option value="'+o.value+'" '+(c.cat===o.value?'selected':'')+'>'+o.label+'</option>'
    ).join('');
    const shown = unit==='%' ? (t.monto ? Math.round((c.monto/t.monto)*1000)/10 : 0) : c.monto;
    return '<div class="split-row" data-cat-row="'+idx+'">'+
      '<span class="cat-row-icon" style="--fill:'+(ci?'var(--cat-'+ci.color+'-fill)':'var(--surface-sunken)')+';--ink:'+(ci?'var(--cat-'+ci.color+'-ink)':'var(--text-tertiary)')+'">'+(ci?catIconMarkup(ci.icon):ICONS.more)+'</span>'+
      '<select data-cat-select="'+idx+'">'+opts+'</select>'+
      '<span class="num-wrap"><input type="text" inputmode="decimal" data-cat-amount="'+idx+'" value="'+shown+'">'+
      '<span>'+unit+'</span></span>'+
      (list.length>1 && allowSplit ? '<button class="rm-btn" data-cat-remove="'+idx+'">'+ICONS.trash+'</button>' : '')+
    '</div>';
  }).join('');
  if(!allowSplit) return '<div class="cat-rows">'+rows+'</div>';
  const sum = t.categorias.reduce((s,c)=>s+c.monto,0);
  const diff = t.monto - sum;
  const ok = Math.abs(diff) < 1;
  return '<div class="cat-rows">'+
    '<div class="split-mode-row"><span class="muted" style="font-size:12.5px;">Repartir el monto total</span>'+
      '<div class="mini-toggle"><button data-catunit="$" class="'+(unit==='$'?'active':'')+'">$</button><button data-catunit="%" class="'+(unit==='%'?'active':'')+'">%</button></div>'+
    '</div>'+
    rows+
    '<button class="split-add" data-add-cat-row="'+t.id+'">'+ICONS.plus+' Agregar categoría</button>'+
    (t.categorias.length>0 ? '<div class="split-remaining"><span>Por asignar</span><span class="'+(ok?'ok':'bad')+' tabular">'+money(diff)+'</span></div>' : '')+
  '</div>';
}

// Committed persona rows once a split already exists: same per-person settlement UI as before
// this feature (paid checkbox, masked amount, link-a-deposit, write-off, remove) — none of that
// is touched, it's the "manage an already-agreed split" concern, distinct from "create/edit the
// split", which now goes entirely through renderSplitDraftForm (views/grupos.ts). The only new
// thing here is a fixed (non-editable) label per row instead of a free-typed name/amount, since
// renaming or re-amounting now happens by reopening the draft ("Editar reparto") rather than
// inline — that's what makes the "sum must match the total, always" rule actually enforceable.
function renderPersonaSettlementRows(t){
  const personaEntries = t.porCobrar.map((p,idx)=>({p,idx})).filter(x=>x.p.tipo==='persona');
  if(personaEntries.length===0){
    return '<button class="split-add" data-charge-split-open="'+t.id+'">'+ICONS.users+' Dividir este gasto con alguien</button>';
  }
  const rows = personaEntries.map(({p,idx})=>{
    const isDebo = p.direccion==='debo';
    // 'debo' (someone else paid, you owe THEM): the label reads "Le debes a <payer>". Absent or
    // 'me_deben' (you paid, unchanged from before this feature): "<persona> te debe".
    const etiqueta = isDebo ? 'Le debes a '+(p.persona||'esta persona') : (p.persona||'Sin nombre')+' te debe';
    const nameField = '<span style="flex:1;min-width:0;"><span class="persona-label" style="font-size:13px;font-weight:600;">'+etiqueta+'</span></span>';
    const amtField = '<span class="persona-amt tabular" style="font-size:13px;font-weight:500;width:96px;text-align:right;flex-shrink:0;">'+moneyPlainMasked(pendingEffectiveAmount(p))+'</span>';
    // Linking to an incoming deposit only makes sense when money comes TO you ('me_deben') — a
    // 'debo' row settles when YOU pay someone else, there's no deposit to link, just a manual
    // "mark as paid" (the chk-pagado button, offered either way).
    const linkBtn = (!p.pagado && !isDebo) ? '<button class="link-btn" data-link-pending="'+idx+'" aria-label="Vincular a un depósito">'+ICONS.inbox+'</button>' : '';
    // Same reasoning for "dar por perdida": that only ever applies to money owed TO you that
    // never arrives — you can't "write off" a debt you owe.
    const writeOffLink = (!p.pagado && !isDebo)
      ? '<button class="split-toggle-link" data-write-off="'+idx+'" style="display:block;margin:-2px 0 10px;font-size:11px;">Dar por perdida — pasarla a gasto de este mes</button>'
      : '';
    return '<div>'+
      '<div class="split-row'+(p.pagado?' paid':'')+'" data-charge-row="'+idx+'">'+
        '<button class="chk-pagado'+(p.pagado?' checked':'')+'" data-toggle-paid="'+idx+'" aria-label="Marcar como '+(isDebo?'pagado':'cobrado')+'" aria-pressed="'+(p.pagado?'true':'false')+'">'+ICONS.check+'</button>'+
        nameField+ amtField+ linkBtn+
        '<button class="rm-btn" data-charge-remove="'+idx+'">'+ICONS.trash+'</button>'+
      '</div>'+
      writeOffLink+
    '</div>';
  }).join('');
  return rows+'<button class="split-toggle-link" data-charge-split-open="'+t.id+'" style="display:block;margin-top:4px;">Editar reparto</button>';
}

export function renderChargeSplitBlock(t){
  const mode = state.splitCollectMode[t.id] || t.porCobrar.length>0;
  if(!mode){
    return '';
  }
  // "Charge someone" and "Pending reimbursement" are separate actions — if this transaction
  // only has committed rows of one type, the reimbursement side of this block specializes: it
  // doesn't offer to add a reimbursement once it's already a pure persona split (soloPersona).
  // The persona side (renderPersonaSettlementRows/renderSplitDraftForm) is no longer gated this
  // way — dividing a gasto with someone is now a universal action (see the feature's scope),
  // not something hidden away just because a reimbursement happens to already exist on it.
  const hasPersona = hasReceivableType(t,'persona');
  const hasReembolso = hasReceivableType(t,'reembolso');
  const soloPersona = hasPersona && !hasReembolso;
  const soloReembolso = hasReembolso && !hasPersona;
  const unit = state.splitCollectUnit[t.id] || '$';
  const todosPagados = allCollected(t);

  // ---- persona: creating/editing the split now goes through the shared draft+picker
  // (renderSplitDraftForm) also used by "share with a group" — see state.shareDraft's doc
  // comment in views/grupos.ts for why both flows share one component. ----
  const personaDraftOpen = state.shareDraft && state.shareDraft.txId===t.id && !state.shareDraft.groupId;
  const personaSection = personaDraftOpen ? renderSplitDraftForm(t, state.shareDraft) : renderPersonaSettlementRows(t);

  // ---- reembolso: UNCHANGED logic/behavior, just no longer sharing a rendering loop with
  // persona rows (which used to live in the same t.porCobrar.map(...) above). ----
  const reembolsoRows = t.porCobrar.map((p,idx)=>({p,idx})).filter(x=>x.p.tipo==='reembolso').map(({p,idx})=>{
    const montoConocido = p.monto!=null;
    const shown = !montoConocido ? '' : (unit==='%' ? Math.round((p.monto/t.monto)*1000)/10 : p.monto);
    const nameField = p.pagado
      ? '<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;"><span class="pend-tipo-tag">Reembolso</span><span class="persona-label" style="font-size:13px;font-weight:600;">'+(p.persona||'Sin nombre')+'</span></span>'
      : '<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;"><span class="pend-tipo-tag">Reembolso</span>'+
          '<input type="text" class="persona-label" style="width:100%;" data-charge-name="'+idx+'" value="'+p.persona+'" placeholder="Isapre, seguro…"></span>';
    const amtField = p.pagado
      ? '<span class="persona-amt tabular" style="font-size:13px;font-weight:500;width:96px;text-align:right;flex-shrink:0;">'+
          moneyPlainMasked(pendingEffectiveAmount(p))+' '+unit+
          (p.montoRecibido!=null && p.monto!=null && p.montoRecibido!==p.monto ? '<span class="pend-esperado muted">de '+moneyPlainMasked(p.monto)+' esperado</span>' : '')+
        '</span>'
      : '<span class="num-wrap persona-amt"><input type="text" inputmode="decimal" data-charge-amount="'+idx+'" value="'+shown+'" placeholder="Por confirmar"><span>'+unit+'</span></span>';
    const linkBtn = p.pagado ? '' : '<button class="link-btn" data-link-pending="'+idx+'" aria-label="Vincular a un depósito">'+ICONS.inbox+'</button>';
    return '<div>'+
      '<div class="split-row'+(p.pagado?' paid':'')+'" data-charge-row="'+idx+'">'+
        '<button class="chk-pagado'+(p.pagado?' checked':'')+'" data-toggle-paid="'+idx+'" aria-label="Marcar '+(p.persona||'este reembolso')+' como pagado" aria-pressed="'+(p.pagado?'true':'false')+'">'+ICONS.check+'</button>'+
        nameField+ amtField+ linkBtn+
        '<button class="rm-btn" data-charge-remove="'+idx+'">'+ICONS.trash+'</button>'+
      '</div>'+
    '</div>';
  }).join('');

  const totalCobro = receivableTotal(t);
  const deboRow = t.porCobrar.find(p=>p.tipo==='persona' && p.direccion==='debo');
  // "Your part of the expense": normally what's left after netting off what others owe you (and
  // any reimbursement you're expecting — same quirk as before this feature, see the comment on
  // netExpenseTx in helpers.ts for why that's not identical to the aggregates' accounting). When
  // someone else paid (a 'debo' row), t.monto is the whole bill, not what you're really out —
  // your part IS that row's own amount, full stop.
  const tuParte = deboRow ? pendingEffectiveAmount(deboRow) : (t.monto - totalCobro);
  const bad = tuParte < 0;
  const tieneCobroPersonaPendiente = t.porCobrar.some(p=>p.tipo==='persona' && !p.pagado && p.direccion!=='debo');
  const copyBtn = tieneCobroPersonaPendiente
    ? '<button class="boleta-entry-link" data-copy-charge="'+t.id+'">'+ICONS.copy+' Copiar para WhatsApp</button>'
    : '';
  return '<div class="split-block">'+
    (todosPagados ? '<div class="cobro-banner-done">'+ICONS.checkCircle+'<span>Ya te pagaron/reembolsaron todo lo de esta transacción.</span></div>' : '')+
    (soloReembolso ? '' : '<button class="boleta-entry-link" data-open-receipt="'+t.id+'">'+ICONS.camera+' Subir foto de la boleta y repartir automático</button>')+
    personaSection+
    '<div class="split-mode-row" style="margin-top:14px;"><span class="muted" style="font-size:12.5px;">Reembolso pendiente</span>'+
      '<div class="mini-toggle"><button data-chargeunit="$" class="'+(unit==='$'?'active':'')+'">$</button><button data-chargeunit="%" class="'+(unit==='%'?'active':'')+'">%</button></div>'+
    '</div>'+
    (reembolsoRows || '<p class="muted" style="font-size:12.5px;padding:6px 0;">Agrega el reembolso que esperas por este gasto (isapre, seguro, etc).</p>')+
    (soloPersona ? '' : '<button class="split-add" data-add-reimbursement-row="'+t.id+'">'+ICONS.plus+' Agregar reembolso</button>')+
    '<div class="split-remaining"><span>Tu parte del gasto</span><span class="'+(bad?'bad':'ok')+' tabular">'+money(tuParte)+'</span></div>'+
    copyBtn+
  '</div>';
}

// Compact category row for "New transaction" — same visual component already used by
// an existing transaction's detail (round avatar with the category's emoji/icon
// + a native <select> next to it, which on tap expands to just the options), instead of the
// big grid of chips that used to be shown always open. Since a newly
// created transaction only supports one category (it can be split into several afterwards,
// once saved, from its own detail), this row has no amount/% or "add another" button.
export function renderDraftCategoryRow(d){
  const chosen = d.categorias[0] ? d.categorias[0].cat : '';
  if(d.tipo==='inversion' && INVESTMENT_GOALS.length===0) return renderInvestGoalEmptyState();
  const ci = chosen ? catInfo(chosen) : null;
  const opts = '<option value="">Sin categoría</option>'+investOrPlainOptions(d.tipo, chosen).map(o=>
    '<option value="'+o.value+'" '+(chosen===o.value?'selected':'')+'>'+o.label+'</option>'
  ).join('');
  return '<div class="cat-rows"><div class="split-row" data-draft-cat-row>'+
    '<span class="cat-row-icon" style="--fill:'+(ci?'var(--cat-'+ci.color+'-fill)':'var(--surface-sunken)')+';--ink:'+(ci?'var(--cat-'+ci.color+'-ink)':'var(--text-tertiary)')+'">'+(ci?catIconMarkup(ci.icon):ICONS.more)+'</span>'+
    '<select data-draft-cat-select>'+opts+'</select>'+
  '</div></div>';
}
export function catPickerGrid(tipoFilter, attrName, selectedId?){
  // A closed platform isn't offered for classifying new transactions (you no longer use it),
  // but if an old transaction is already pointing at it, it keeps showing as selected.
  return '<div class="cat-picker-grid">'+Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo===tipoFilter && (tipoFilter!=='inversion' || !isPlatformArchived(k) || k===selectedId)).map(k=>{
    const c = CATEGORIES[k];
    const sel = k===selectedId;
    return '<button class="cat-picker-chip" data-'+attrName+'="'+k+'" '+(sel?'style="background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);"':'')+'>'+catIconMarkup(c.icon)+' '+c.nombre+'</button>';
  }).join('')+'</div>';
}
// Same chip-grid look as catPickerGrid, but for classifying an investment-type transaction for
// the first time (needsClassifying in renderSheetContent) -- offers Goals + General buckets
// (investmentCatOptions) instead of a flat CATEGORIES list. Reuses the same data-pick-cat
// attribute, so the existing click handler in events.ts (which just sets t.categorias to
// whatever value it got) doesn't need to know or care which kind of picker produced it.
export function investCatPickerGrid(selectedId?){
  return '<div class="cat-picker-grid">'+investmentCatOptions(selectedId).map(o=>{
    const sel = o.value===selectedId;
    return '<button class="cat-picker-chip" data-pick-cat="'+o.value+'" '+(sel?'style="background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);"':'')+'>'+catIconMarkup(o.icon)+' '+o.label+'</button>';
  }).join('')+'</div>';
}
// Shown instead of the category picker for an investment-type transaction when there isn't a
// single Goal to offer yet (INVESTMENT_GOALS is empty) -- requirement from the user: don't show
// an effectively-empty picker, tell her she needs a goal first and take her straight there.
// contextPlatformId lets a caller with a known platform in mind (e.g. an already-open
// platform's "+ Agregar meta") pre-select it; otherwise it falls back to the first active
// platform (or the first platform at all, if every one is closed).
export function renderInvestGoalEmptyState(contextPlatformId?){
  const platId = contextPlatformId || activePlatformIds()[0] || platformIds()[0] || '';
  return '<div class="card placeholder-card" style="padding:18px 14px;">'+ICONS.inbox+
    '<h3>No tienes metas creadas</h3>'+
    '<p>Crea tu primera meta de inversión para poder clasificar tus aportes.</p>'+
    (platId ? '<button class="save-tx-btn" style="width:100%;margin-top:10px;" data-goto-create-goal="'+platId+'">+ Crear meta de inversión</button>' : '')+
  '</div>';
}

export function renderSheetContent(t){
  const isIncome = t.tipo==='ingreso';
  const isInvest = t.tipo==='inversion';
  const cats = t.categorias;
  const needsClassifying = cats.length===0 && t.estado==='pendiente';

  // Before, you had to tap the category to enter a separate "edit mode" (chip -> grid).
  // Now, except for the first classification of an imported transaction (needsClassifying, which
  // still shows the big icon grid to choose for the first time), the category
  // always shows as editable rows with a select — same as the rest of the app. An investment
  // transaction with no goal to offer yet gets the "No tienes metas creadas" empty state
  // instead of either of those (see renderInvestGoalEmptyState).
  const categoriaSection = (isInvest && INVESTMENT_GOALS.length===0)
    ? renderInvestGoalEmptyState()
    : needsClassifying
      ? (t.sharedByOthers
          ? '<p class="cat-picker-hint">Este es tu parte de un gasto de grupo'+(t.suggestedOriginCategory?' que la otra persona anotó como "'+t.suggestedOriginCategory+'"':'')+'. Elige tu categoría y la próxima vez que registre algo así se va a clasificar sola.</p>'
          : '<p class="cat-picker-hint">Todavía no le has puesto categoría. Elige una para clasificarla (y luego puedes activar el candado para que se repita sola).</p>')+
        (isInvest ? investCatPickerGrid() : catPickerGrid(t.tipo, 'pick-cat'))
      : renderCategoryRows(t, !isInvest);

  // Before, a transaction already created as an investment stayed with a fixed chip ("edited in
  // Phase 4") and, conversely, one imported as an expense/income couldn't be switched to an
  // investment — for example a transfer to Fintual that arrives on its own from email. Now all 3 options
  // are always available here, same as when creating a new transaction.
  const tipoSelector = segmentedHtml('tipo', [{id:'gasto',label:'Gasto'},{id:'ingreso',label:'Ingreso'},{id:'inversion',label:'Inversión'}], t.tipo);

  const recurrenciaSelector = segmentedHtml('recurrencia', [
    {id:'variable',label:'Variable'},{id:'mensual',label:'Mensual'},{id:'anual',label:'Anual'}
  ], t.recurrencia);

  const cuotaBlock = (t.tipo!=='gasto' || isInvest) ? '' :
    t.cuotaProyectada
      ? '<div class="sheet-block card" style="padding:16px;"><div class="cuota-note">'+ICONS.layers+'<span>Esta es la cuota '+t.cuotaNumero+' de '+t.cuotaTotal+' de la compra en <b>'+t.comercio+'</b>. Se generó sola a partir de la cuota 1 y va a dejar de aparecer después de la cuota '+t.cuotaTotal+'.</span></div></div>'
      : '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Pago en cuotas</div>'+
          '<div class="cuota-row"><span class="cuota-icon">'+ICONS.layers+'</span>'+
          '<span class="cuota-text">La pagaste en cuotas y quieres verla los próximos meses</span>'+
          '<button class="switch '+(t.cuotas?'on':'')+'" data-toggle-installments="'+t.id+'" aria-label="Pago en cuotas" aria-pressed="'+(t.cuotas?'true':'false')+'"></button></div>'+
          (t.cuotas ? '<div class="cuota-stepper-wrap"><span class="cs-label">Número de cuotas</span>'+
            '<div class="stepper"><button data-installments-step="-1" data-tx="'+t.id+'" aria-label="Menos cuotas">'+ICONS.minus+'</button>'+
            '<span class="count tabular">'+t.cuotas.total+'</span>'+
            '<button data-installments-step="1" data-tx="'+t.id+'" aria-label="Más cuotas">'+ICONS.plus+'</button></div></div>' : '')+
        '</div>';

  const medioOptsExisting = Object.keys(PAYMENT_METHODS).map(function(k){
    return '<option value="'+k+'" '+(t.medio===k?'selected':'')+'>'+PAYMENT_METHODS[k].nombre+'</option>';
  }).join('');

  // The delete button no longer depends on the transaction being imported by email — see
  // sheet-bottom-actions below, which now offers deleting any transaction. Here only
  // the informational note about where it came from remains, without its own duplicate delete button.
  const importedBlock = !t.importadoEmail ? '' :
    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Importada desde tu correo</div>'+
      '<p class="muted" style="font-size:12.5px;margin:0;">Esta transacción se agregó sola a partir de un correo de tu banco.</p>'+
    '</div>';

  // Detail layout, wrapped in .card cards (one per section) — same visual
  // criteria used in the rest of the app. The order groups what goes together: Amount/Date
  // with the payment method (all "when and with what"), Type with Recurrence (all "what kind of
  // movement it is"), and leaves Installments/Category/auto-rule/actions each in its own card —
  // the features (installments, reimbursements, receivables) stay intact, only the wrapper changes.
  const tipoRecurrenciaCard = isInvest
    ? '<div class="sheet-block card" style="padding:16px;">'+
        '<div class="draft-label" style="margin-bottom:7px;">Tipo</div>'+tipoSelector+
      '</div>'
    : '<div class="sheet-block card" style="padding:16px;">'+
        '<div class="draft-label" style="margin-bottom:7px;">Tipo</div>'+tipoSelector+
        '<div class="draft-label" style="margin:16px 0 7px;">Recurrencia</div>'+recurrenciaSelector+
        '<p class="cat-picker-hint" style="margin-top:8px;">"Mensual" y "Anual" cuentan como <b>gasto fijo</b> en tus metas de Resumen · Balance — "Variable" es todo lo demás. No existe una opción separada llamada "Fijo".</p>'+
      '</div>';

  return '<div class="sheet-top">'+
      '<div class="merchant" id="sheet-title-el">'+t.comercio+'</div>'+
      '<div class="meta">'+dayLabel(t.fecha)+' · '+t.hora+' · '+paymentMethodInfo(t.medio).nombre+'</div>'+
      '<div class="sheet-amount '+(isIncome?'pos':'')+' tabular">'+(isIncome?'+':'')+money(t.monto)+'</div>'+
      '<div class="meta" data-note-echo style="margin-top:6px;'+(t.nota?'':'display:none;')+'">'+(t.nota||'')+'</div>'+
    '</div>'+

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Nombre, monto y fecha</div>'+
      '<div class="draft-field"><label class="draft-label">Nombre</label>'+
        '<input type="text" class="draft-input" data-tx-field="comercio" data-tx="'+t.id+'" value="'+t.comercio.replace(/"/g,'&quot;')+'"></div>'+
      '<div class="draft-field"><label class="draft-label">Monto</label>'+
        '<div class="edit-amount-row">'+
          '<input type="text" inputmode="decimal" class="draft-input tabular" data-tx-field="monto" data-tx="'+t.id+'" value="'+t.monto+'">'+
          '<span class="edit-amount-echo tabular">'+(isIncome?'+':'')+money(t.monto)+'</span>'+
        '</div>'+
      '</div>'+
      '<div class="edit-field-pair">'+
        '<div class="edit-field-col draft-field"><label class="draft-label">Fecha</label>'+
          '<input type="date" class="draft-input" data-tx-field="fecha" data-tx="'+t.id+'" value="'+t.fecha+'"></div>'+
        '<div class="edit-field-col draft-field"><label class="draft-label">Hora</label>'+
          '<input type="time" class="draft-input" data-tx-field="hora" data-tx="'+t.id+'" value="'+t.hora+'"></div>'+
      '</div>'+
      '<div class="muted edit-day-hint">'+dayLabel(t.fecha)+'</div>'+
      '<div class="draft-field" style="margin:14px 0 0;"><label class="draft-label">Con qué pagaste</label>'+
        '<select class="draft-select" data-tx-payment-method-select="'+t.id+'">'+medioOptsExisting+'</select>'+
      '</div>'+
    '</div>'+

    tipoRecurrenciaCard+
    cuotaBlock+

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Categoría'+(cats.length>1?'s':'')+'</div>'+categoriaSection+
    '</div>'+

    (isInvest ? '' :
    '<div class="sheet-block card lock-card'+(t.reglaAuto?' active-rule':'')+'" style="padding:14px 16px;"><div class="lock-row">'+
      '<span class="lock-icon">'+ICONS.lock+'</span>'+
      '<span class="lock-text">'+(t.reglaAuto ? 'Ya clasificamos siempre así lo de <b>'+t.comercio+'</b>' : 'Clasificar siempre así los gastos de <b>'+t.comercio+'</b>')+'</span>'+
      '<button class="switch '+(t.reglaAuto?'on':'')+'" data-toggle-lock="'+t.id+'" aria-label="Activar regla automática" aria-pressed="'+(t.reglaAuto?'true':'false')+'"></button>'+
    '</div></div>')+

    (isInvest ? '' :
    isIncome
      ? (function(){
          const vinculo = pendingLinkedTo(t.id);
          // Before, this card appeared in the detail of ANY income as soon as there was some
          // pending item anywhere else in the app — so a salary with its normal category
          // ("August Salary") also showed it, which made no sense: a categorized salary
          // is never the money for a charge or reimbursement. Now the card is only offered when
          // this income doesn't yet have a category assigned (an ambiguous deposit, like
          // "Transfer from Fran", is exactly the case where it could be the payment for a pending item)
          // — unless it's already linked, in which case it's always shown so it can be viewed/removed.
          if(!vinculo && (t.categorias.length>0 || allPendingReceivables().length===0)) return '';
          return '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Cobros y reembolsos</div>'+
            (vinculo
              ? '<div class="cobro-banner-done">'+ICONS.checkCircle+'<span>Vinculado a '+(vinculo.persona||'un pendiente')+' · '+vinculo.comercio+'</span></div>'+
                '<button class="split-toggle-link" data-unlink-income="'+t.id+'">Quitar vínculo</button>'
              : '<p class="muted" style="font-size:12.5px;margin:0 0 10px;">Si este depósito corresponde a un cobro o reembolso pendiente, vincúlalo para tacharlo de la lista.</p>'+
                '<button class="action-btn" data-open-link-income="'+t.id+'">'+ICONS.inbox+' Vincular a un pendiente</button>')+
          '</div>';
        })()
      : '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Acciones rápidas</div><div class="quick-actions">'+
          '<button class="action-btn '+(t.estado==='confirmado'?'selected':'')+'" data-action="confirmar" data-tx="'+t.id+'">'+ICONS.checkCircle+' Confirmar gasto</button>'+
          '<button class="action-btn '+(hasReceivableType(t,'persona')?'selected':'')+'" data-action="porcobrar_persona" data-tx="'+t.id+'">'+ICONS.users+' Por cobrar a alguien</button>'+
          '<button class="action-btn '+(hasReceivableType(t,'reembolso')?'selected':'')+'" data-action="porcobrar_reembolso" data-tx="'+t.id+'">'+ICONS.inbox+' Reembolso pendiente</button>'+
          '<button class="action-btn '+(t.estado==='no_es_gasto'?'selected':'')+'" data-action="noesgasto" data-tx="'+t.id+'">'+ICONS.ban+' No es gasto</button>'+
        '</div></div>'+
        (t.estado==='por_cobrar' ? '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Cobros y reembolsos pendientes</div>'+renderChargeSplitBlock(t)+'</div>' : '')
    )

    + renderShareGroupSection(t)

    + '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Nota</div>'+
        '<input type="text" class="draft-input nota-input" data-tx-field="nota" data-tx="'+t.id+'" value="'+(t.nota||'').replace(/"/g,'&quot;')+'" placeholder="Agregar notas personales">'+
      '</div>'

    + importedBlock
    + (state.confirmDeleteTxId===t.id
        ? '<div class="sheet-delete-confirm">'+
            '<p class="muted" style="font-size:12.5px;margin:0 0 10px;">¿Seguro que quieres eliminar esta transacción? No se puede deshacer.</p>'+
            '<div style="display:flex;gap:8px;">'+
              '<button class="save-tx-btn" style="flex:1;background:var(--surface-sunken);color:var(--text);" data-cancel-delete-tx="'+t.id+'">Cancelar</button>'+
              '<button class="save-tx-btn" style="flex:1;background:var(--cat-pink-fill);color:var(--expense-ink);" data-confirm-delete-tx="'+t.id+'">Sí, eliminar</button>'+
            '</div></div>'
        : '<div class="sheet-bottom-actions">'+
            '<button class="sheet-delete-btn" data-ask-delete-tx="'+t.id+'" aria-label="Eliminar transacción">'+ICONS.trash+'</button>'+
            '<button class="sheet-done-btn" data-close-sheet-done>'+ICONS.check+' Listo</button>'+
          '</div>')
    ;
}

export function openSheet(txId){
  state.openTxId = txId;
  state.creatingNew = false;
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
  setTimeout(()=>{ const b=document.getElementById('sheet-close-btn'); if(b) b.focus(); }, 260);
}
export let draftIdCounter = 1;
export let paymentMethodIdCounter = 0;
// events.ts increments this counter from outside (adding a new card/payment method inside the
// mini-form of the new-transaction sheet) -- see the note about setters in state.ts.
export function setPaymentMethodIdCounter(v){ paymentMethodIdCounter = v; }
export function openNewTxSheet(tipoInicial?){
  state.openTxId = null;
  state.creatingNew = true;
  state.draftTx = {
    // Before this was always 'visa_bch' — a payment method that only exists in the sample data.
    // In a real account (which starts with just "Cash"), that id didn't exist in PAYMENT_METHODS: the
    // selector below showed "Cash" as the browser's default (since it couldn't find the
    // marked option), but internally the draft kept pointing at 'visa_bch' — if you didn't
    // touch the selector, it would save like that, broken. Now it starts with the first real payment
    // method you already have, so what shows as selected and what gets saved always match.
    comercio:'', monto:0, fecha: todayISO(), hora:'12:00', medio: Object.keys(PAYMENT_METHODS)[0] || 'efectivo',
    tipo: tipoInicial || 'gasto', recurrencia:'variable', categorias:[], porCobrar:[]
  };
  state.addingPaymentMethod = false;
  state.newPaymentMethodDraft = {nombre:'', ultimos4:''};
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
  setTimeout(()=>{ const el=document.querySelector<HTMLElement>('[data-draft-field="comercio"]'); if(el) el.focus(); }, 260);
}
export function openFilterSheet(){
  state.openTxId = null;
  state.creatingNew = false;
  state.filterSheetOpen = true;
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
}
export function closeSheet(){
  state.openTxId = null;
  state.creatingNew = false;
  state.draftTx = null;
  state.filterSheetOpen = false;
  state.linkFlow = null;
  state.boleta = null;
  state.confirmDeleteTxId = null;
  document.getElementById('sheet-overlay').classList.remove('open');
}

/* ---------- link a deposit to a pending item (or vice versa) ---------- */
export function openLinkFromPending(expenseTxId, idx){
  state.linkFlow = {mode:'fromPendiente', expenseTxId, idx};
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
}
export function openLinkFromIncome(incomeTxId){
  state.linkFlow = {mode:'fromIngreso', incomeTxId};
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
}
export function renderLinkFlowContent(){
  const lf = state.linkFlow;
  if(lf.mode==='fromPendiente'){
    const gastoTx = getTx(lf.expenseTxId);
    const p = gastoTx ? gastoTx.porCobrar[lf.idx] : null;
    if(!gastoTx || !p) return '<div class="sheet-top"><div class="merchant">Ya no existe</div></div>';
    const ingresos = TRANSACTIONS.filter(t=>t.tipo==='ingreso').slice().sort((a,b)=> (b.fecha+b.hora).localeCompare(a.fecha+a.hora));
    const rows = ingresos.map(t=>{
      const yaVinculado = pendingLinkedTo(t.id);
      return '<button class="link-pick-row" data-pick-income="'+t.id+'">'+
        '<span class="link-pick-body"><span class="link-pick-name">'+t.comercio+'</span>'+
          '<span class="link-pick-sub">'+dayLabel(t.fecha)+(yaVinculado?' · ya vinculado a '+yaVinculado.comercio:'')+'</span></span>'+
        '<span class="link-pick-amt tabular pos">+'+money(t.monto)+'</span>'+
      '</button>';
    }).join('');
    return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
        '<div class="merchant" style="font-size:17px;">¿Qué depósito corresponde?</div>'+
        '<div class="meta">Elige el ingreso que corresponde a '+(p.persona||'este pendiente')+' — '+gastoTx.comercio+'.</div>'+
      '</div>'+
      (ingresos.length? rows : '<div class="card placeholder-card">'+ICONS.inbox+'<h3>No tienes ingresos registrados</h3><p>Cuando tengas una transacción de ingreso, aparecerá acá para vincularla.</p></div>');
  } else {
    const ingresoTx = getTx(lf.incomeTxId);
    if(!ingresoTx) return '<div class="sheet-top"><div class="merchant">Ya no existe</div></div>';
    const pendientes = allPendingReceivables();
    const rows = pendientes.map(p=>{
      const montoTxt = p.monto!=null ? money(p.monto)+' esperado' : 'monto por confirmar';
      return '<button class="link-pick-row" data-pick-pending="'+p.expenseTxId+'|'+p.idx+'">'+
        '<span class="link-pick-body"><span class="link-pick-name">'+(p.persona||'Sin nombre')+
          (p.tipo==='reembolso'?' <span class="pend-tipo-tag" style="margin-left:4px;">Reembolso</span>':'')+'</span>'+
          '<span class="link-pick-sub">'+p.comercio+' · '+dayLabel(p.fecha)+'</span></span>'+
        '<span class="link-pick-amt tabular muted">'+montoTxt+'</span>'+
      '</button>';
    }).join('');
    return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
        '<div class="merchant" style="font-size:17px;">¿A qué pendiente corresponde?</div>'+
        '<div class="meta">Este depósito de '+money(ingresoTx.monto)+' ('+ingresoTx.comercio+') se vinculará a lo que elijas.</div>'+
      '</div>'+
      (pendientes.length? rows : '<div class="card placeholder-card">'+ICONS.checkCircle+'<h3>No tienes pendientes</h3><p>No hay ningún cobro o reembolso pendiente para vincular todavía.</p></div>');
  }
}

/* ---------- split a receipt with friends (simulated — no OCR or real link) ---------- */
export let receiptItemIdCounter = 0;
// events.ts adds items to the "split receipt" assistant from outside -- see the note about
// setters in state.ts.
export function nextReceiptItemId(){ receiptItemIdCounter++; return receiptItemIdCounter; }
// A couple of sample receipts so "scanning" doesn't always show the same thing — none of
// this comes from a real photo, it's just to practice the assign-and-split flow.
export const RECEIPT_EXAMPLES = [
  {comercio:'Sushi Itto Providencia', items:[
    {nombre:'Roll California x2', monto:14000},{nombre:'Sashimi mixto', monto:16000},
    {nombre:'Bebidas (3)', monto:6000},{nombre:'Propina sugerida', monto:3600}
  ]},
  {comercio:'Pizzería Don Telmo', items:[
    {nombre:'Pizza familiar', monto:18000},{nombre:'Papas fritas', monto:6000},
    {nombre:'Cervezas (4)', monto:16000}
  ]}
];
export function receiptPeople(){ return ['Yo'].concat(CONTACTS); }
export function openReceiptFlow(expenseTxId){
  const gastoTx = getTx(expenseTxId);
  if(!gastoTx) return;
  state.boleta = {step:'capturar', expenseTxId, comercio: gastoTx.comercio, items:[], asign:{}, propinaUnit:'%', propinaValor:''};
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
}
export function receiptPersonTotals(){
  const b = state.boleta;
  const totals = {};
  receiptPeople().forEach(p=>totals[p]=0);
  b.items.forEach(item=>{
    const asignados = b.asign[item.id] || [];
    if(asignados.length===0) return;
    const share = item.monto / asignados.length;
    asignados.forEach(p=>{ totals[p] = (totals[p]||0) + share; });
  });
  return totals;
}
export function receiptTotal(){ return state.boleta.items.reduce((s,i)=>s+i.monto,0); }
// Tip: a % (over the items' subtotal) or a fixed amount — it's added on top of the
// items and multiplies equally what each person owes (nobody "gets out" of the
// tip just because they ate less, it's split proportionally to what each one consumed).
export function receiptTipAmount(){
  const b = state.boleta;
  const v = b.propinaValor==='' ? null : safeEvalExpr(String(b.propinaValor));
  if(v==null || v<=0) return 0;
  return b.propinaUnit==='%' ? Math.round(receiptTotal()*v/100) : Math.round(v);
}
export function receiptTotalWithTip(){ return receiptTotal() + receiptTipAmount(); }
export function receiptPersonTotalsWithTip(){
  const subtotal = receiptTotal();
  const propina = receiptTipAmount();
  const base = receiptPersonTotals();
  if(propina<=0 || subtotal<=0) return base;
  const factor = (subtotal+propina)/subtotal;
  const out = {};
  Object.keys(base).forEach(p=>{ out[p] = base[p]*factor; });
  return out;
}
export function renderReceiptCapture(){
  const b = state.boleta;
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">Boleta de '+(b.comercio||'esta transacción')+'</div>'+
      '<div class="meta">Sácale una foto o súbela desde tu galería y la convertimos en una lista de items para repartir.</div>'+
    '</div>'+
    '<div class="boleta-capture-row">'+
      '<button class="boleta-capture-btn" data-receipt-capture="camara">'+ICONS.camera+'<span>Tomar foto</span></button>'+
      '<button class="boleta-capture-btn" data-receipt-capture="galeria">'+ICONS.image+'<span>Elegir de galería</span></button>'+
    '</div>'+
    '<div class="file-format-hint">Esta maqueta simula el resultado con una boleta de ejemplo — no procesa fotos de verdad.</div>';
}
export function renderReceiptProcessing(){
  return '<div class="boleta-processing"><div class="boleta-spinner"></div><span>Leyendo tu boleta…</span></div>';
}
export function renderReceiptItems(){
  const b = state.boleta;
  const rows = b.items.map((item,idx)=>
    '<div class="split-row" data-receipt-item-row="'+idx+'">'+
      '<input type="text" data-receipt-item-name="'+idx+'" value="'+item.nombre+'" placeholder="Nombre del item">'+
      '<span class="num-wrap"><input type="text" inputmode="decimal" data-receipt-item-amount="'+idx+'" value="'+item.monto+'"><span>$</span></span>'+
      '<button class="rm-btn" data-receipt-item-remove="'+idx+'">'+ICONS.trash+'</button>'+
    '</div>'
  ).join('');
  const total = receiptTotal();
  const canContinue = b.items.length>0 && total>0;
  const quickChips = [10,15,20].map(pct=>
    '<button class="boleta-tip-chip'+(b.propinaUnit==='%' && Number(b.propinaValor)===pct?' active':'')+'" data-receipt-tip-quick="'+pct+'">'+pct+'%</button>'
  ).join('');
  const propinaCard = '<div class="card boleta-propina-card">'+
    '<div class="split-mode-row"><span class="muted" style="font-size:12.5px;">¿Agregaste propina?</span>'+
      '<div class="mini-toggle"><button data-receipt-tip-unit="%" class="'+(b.propinaUnit==='%'?'active':'')+'">%</button><button data-receipt-tip-unit="$" class="'+(b.propinaUnit==='$'?'active':'')+'">$</button></div>'+
    '</div>'+
    (b.propinaUnit==='%' ? '<div class="boleta-tip-chips">'+quickChips+'</div>' : '')+
    '<span class="num-wrap"><input type="text" inputmode="decimal" data-receipt-tip-input value="'+b.propinaValor+'" placeholder="'+(b.propinaUnit==='%'?'Otro %':'Monto $')+'"><span>'+b.propinaUnit+'</span></span>'+
  '</div>';
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">'+(b.comercio||'Tu boleta')+'</div>'+
      '<div class="meta">Revisa los items — puedes editarlos, agregar o borrar antes de repartir.</div>'+
    '</div>'+
    rows+
    '<button class="split-add" data-receipt-add-item>'+ICONS.plus+' Agregar item</button>'+
    propinaCard+
    '<div id="boleta-totals-summary">'+renderReceiptItemsTotalsSummary()+'</div>'+
    '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-receipt-goto="asignar" '+(canContinue?'':'disabled')+'>Continuar</button>';
}
// The totals summary for the "items" step lives in its own block with a fixed id so it can
// be refreshed on its own (without re-rendering the whole sheet) while the user keeps typing
// in an amount or the tip — that way the input doesn't lose focus mid-typing.
export function renderReceiptItemsTotalsSummary(){
  const total = receiptTotal();
  const propina = receiptTipAmount();
  const totalConPropina = receiptTotalWithTip();
  return propina>0
    ? '<div class="split-remaining"><span>Subtotal (sin propina)</span><span class="tabular muted">'+money(total)+'</span></div>'+
      '<div class="split-remaining"><span>Propina</span><span class="tabular">'+money(propina)+'</span></div>'+
      '<div class="split-remaining"><span>Total con propina</span><span class="tabular" style="font-weight:800;">'+money(totalConPropina)+'</span></div>'
    : '<div class="split-remaining"><span>Total de la boleta</span><span class="tabular">'+money(total)+'</span></div>';
}
export function renderReceiptAssign(){
  const b = state.boleta;
  const personas = receiptPeople();
  const itemBlocks = b.items.map(item=>{
    const asignados = b.asign[item.id] || [];
    const chips = personas.map(p=>
      '<button class="boleta-person-chip'+(asignados.includes(p)?' active':'')+'" data-receipt-toggle-person="'+item.id+'|'+p+'">'+p+'</button>'
    ).join('');
    return '<div class="card boleta-item-block">'+
      '<div class="boleta-item-head"><span class="boleta-item-name">'+item.nombre+'</span><span class="boleta-item-amt tabular">'+money(item.monto)+'</span></div>'+
      '<div class="boleta-person-chips">'+chips+'</div>'+
      (asignados.length===0 ? '<div class="file-format-hint" style="margin-top:8px;">Sin asignar todavía.</div>' : '')+
    '</div>';
  }).join('');
  const totals = receiptPersonTotalsWithTip();
  const totalsSin = receiptPersonTotals();
  const conPropina = receiptTipAmount()>0;
  const sinAsignar = b.items.some(i=>!(b.asign[i.id]||[]).length);
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">¿Quién se comió qué?</div>'+
      '<div class="meta">Toca los nombres de cada item — si lo comieron entre varios, se divide en partes iguales.</div>'+
    '</div>'+
    itemBlocks+
    '<div class="card boleta-totals-card">'+
      personas.map(p=>receiptTotalRowHtml(p, totalsSin[p]||0, totals[p]||0, conPropina, false)).join('')+
    '</div>'+
    '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-receipt-goto="resumen" '+(sinAsignar?'disabled':'')+'>Continuar</button>'+
    (sinAsignar ? '<div class="field-error">Asigna cada item a al menos una persona para continuar.</div>' : '');
}
// Row for one person's total — if there's a tip, shows the amount without tip (small, on top)
// and the amount with tip (what they actually owe) below.
export function receiptTotalRowHtml(nombre, sinPropina, conPropinaMonto, showBoth, esYo){
  const amt = showBoth
    ? '<span class="amt-group"><span class="muted tabular boleta-amt-sin">'+money(sinPropina)+' sin propina</span><span class="amt tabular">'+money(conPropinaMonto)+'</span></span>'
    : '<span class="amt tabular">'+money(conPropinaMonto)+'</span>';
  return '<div class="boleta-total-row"><span class="name">'+nombre+(esYo?' (tú)':'')+'</span>'+amt+'</div>';
}
export function renderReceiptSummary(){
  const b = state.boleta;
  const totals = receiptPersonTotalsWithTip();
  const totalsSin = receiptPersonTotals();
  const conPropina = receiptTipAmount()>0;
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">Así queda repartido</div>'+
      '<div class="meta">Total de la boleta: '+money(receiptTotalWithTip())+(conPropina?' (incluye propina)':'')+'</div>'+
    '</div>'+
    '<div class="card boleta-totals-card">'+
      receiptPeople().map(p=>receiptTotalRowHtml(p, totalsSin[p]||0, totals[p]||0, conPropina, p==='Yo')).join('')+
    '</div>'+
    '<div class="boleta-preview-banner">'+ICONS.sparkle+'<span>Próximamente: vas a poder mandarles un link para que cada uno marque lo que consumió, sin que tengas que calcular tú.</span></div>'+
    '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-receipt-save>Guardar reparto en la transacción</button>';
}
export function renderReceiptSheetContent(){
  const step = state.boleta.step;
  if(step==='capturar') return renderReceiptCapture();
  if(step==='procesando') return renderReceiptProcessing();
  if(step==='items') return renderReceiptItems();
  if(step==='asignar') return renderReceiptAssign();
  return renderReceiptSummary();
}
export function saveReceipt(){
  const b = state.boleta;
  const gastoTx = getTx(b.expenseTxId);
  if(!gastoTx) return;
  const totals = receiptPersonTotalsWithTip();
  const nuevoPorCobrar: ReceivableItem[] = receiptPeople().filter(p=>p!=='Yo' && totals[p]>0).map(p=>(
    {persona:p, monto:Math.round(totals[p]), pagado:false, tipo:'persona' as const, montoRecibido:null, linkedTxId:null}
  ));
  // the photo replaces whatever manual split existed before on this transaction — it's the source of truth
  // for who consumed what; the expense's total amount isn't touched, it's still what you paid.
  gastoTx.porCobrar = nuevoPorCobrar;
  if(nuevoPorCobrar.length>0) gastoTx.estado = 'por_cobrar';
  state.splitCollectMode[gastoTx.id] = true;
  state.boleta = null;
  closeSheet();
  render();
  openSheet(gastoTx.id);
  toast('Reparto guardado en la transacción');
}
// Before this used ICONS[icon] directly — works for an icon with a name from the fixed set (the
// payment methods: 'card', 'bank', 'cash'), but most expense/income categories
// use a plain emoji as their icon (see catIconMarkup above), so ICONS[icon] gave
// "undefined" and the filter's category chips showed as "undefined Home", "undefined
// Supermarket", etc. catIconMarkup already resolves both cases (known name or plain emoji).
export function chipToggle(attrName, id, label, icon, active){
  return '<button class="cat-picker-chip" data-'+attrName+'="'+id+'" '+(active?'style="background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);"':'')+'>'+(icon?catIconMarkup(icon)+' ':'')+label+'</button>';
}
export function renderFilterSheetContent(){
  const af = state.advFilters;
  // Investment platforms themselves are never a transaction's category anymore (see the note
  // on INVESTMENT_GOALS in state.ts) -- filtering by them here would be a dead option that
  // never matches anything, so they're swapped for the same Goal/General options the category
  // picker itself offers.
  const catChips = '<div class="cat-picker-grid">'+
    chipToggle('toggle-filter-cat','__sin_cat__','Sin categoría', null, af.cats.includes('__sin_cat__'))+
    Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo!=='inversion').map(k=>chipToggle('toggle-filter-cat', k, CATEGORIES[k].nombre, CATEGORIES[k].icon, af.cats.includes(k))).join('')+
    investmentCatOptions().map(o=>chipToggle('toggle-filter-cat', o.value, o.label, o.icon, af.cats.includes(o.value))).join('')+
  '</div>';
  const medioChips = '<div class="cat-picker-grid">'+
    Object.keys(PAYMENT_METHODS).map(k=>chipToggle('toggle-filter-medio', k, PAYMENT_METHODS[k].nombre, PAYMENT_METHODS[k].icon, af.medios.includes(k))).join('')+
  '</div>';
  const count = advFilterCount();
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">Filtros</div>'+
      '<div class="meta">Filtra las transacciones por categoría, tarjeta o fecha.</div>'+
    '</div>'+
    '<div class="sheet-block"><div class="sheet-block-title">Categoría</div>'+catChips+'</div>'+
    '<div class="sheet-block"><div class="sheet-block-title">Tarjeta / medio</div>'+medioChips+'</div>'+
    '<div class="sheet-block"><div class="sheet-block-title">Rango de fechas</div>'+
      '<div class="filter-date-row">'+
        '<input type="date" data-filter-date="from" value="'+(af.dateFrom||'')+'" aria-label="Desde">'+
        '<input type="date" data-filter-date="to" value="'+(af.dateTo||'')+'" aria-label="Hasta">'+
      '</div>'+
    '</div>'+
    '<div class="sheet-block" style="display:flex;gap:10px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-clear-advfilters>Limpiar'+(count?' ('+count+')':'')+'</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-apply-advfilters>Ver resultados</button>'+
    '</div>';
}
export function renderNewTxSheetContent(d){
  const tipoOpts = [{id:'gasto',label:'Gasto'},{id:'ingreso',label:'Ingreso'},{id:'inversion',label:'Inversión'}];
  const medioOpts = Object.keys(PAYMENT_METHODS).map(k=>'<option value="'+k+'" '+(d.medio===k?'selected':'')+'>'+PAYMENT_METHODS[k].nombre+'</option>').join('')+
    '<option value="__nuevo_medio__">+ Agregar tarjeta o medio nuevo…</option>';
  const canSave = d.comercio.trim().length>0 && d.monto>0;
  const nm = state.newPaymentMethodDraft;
  const isInvestDraft = d.tipo==='inversion';
  const newPaymentMethodForm = state.addingPaymentMethod
    ? '<div class="new-medio-form">'+
        '<label class="draft-label">Nombre de la tarjeta o medio</label>'+
        '<input type="text" class="draft-input" data-new-payment-method-field="nombre" value="'+nm.nombre.replace(/"/g,'&quot;')+'" placeholder="Ej: Visa Falabella, Mach…">'+
        '<label class="draft-label" style="margin-top:12px;">Últimos 4 dígitos (opcional)</label>'+
        '<input type="text" inputmode="numeric" maxlength="4" class="draft-input" data-new-payment-method-field="ultimos4" value="'+nm.ultimos4.replace(/"/g,'&quot;')+'" placeholder="Ej: 1234">'+
        '<div style="display:flex;gap:10px;margin-top:12px;">'+
          '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-new-payment-method>Cancelar</button>'+
          '<button class="save-tx-btn" style="flex:1;" data-save-new-payment-method '+(nm.nombre.trim()?'':'disabled')+'>Agregar</button>'+
        '</div>'+
      '</div>'
    : '';
  // Same .sheet-block/.card wrapper used by an already-created transaction's detail
  // (before, this sheet was a flat list of loose fields, very different from how it looks
  // afterwards when opening that same transaction) — groups the same things the detail groups: amount and
  // date, type + recurrence, category (with the compact icon + select row), payment method.
  return '<div class="sheet-top" style="padding-top:4px;">'+
      '<div class="meta" style="font-size:13px;font-weight:700;color:var(--text);">Nueva transacción</div>'+
    '</div>'+

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Comercio y monto</div>'+
      '<div class="draft-field"><label class="draft-label">Comercio</label>'+
        '<input type="text" class="draft-input" data-draft-field="comercio" value="'+d.comercio.replace(/"/g,'&quot;')+'" placeholder="Ej: Jumbo, Uber, Sueldo…"></div>'+
      '<div class="draft-field" style="margin-top:14px;"><label class="draft-label">Monto</label>'+
        '<input type="text" inputmode="decimal" class="draft-input amount tabular" data-draft-field="monto" value="'+(d.monto||'')+'" placeholder="0"></div>'+
      '<div class="draft-field" style="margin-top:14px;"><label class="draft-label">Fecha</label>'+
        '<input type="date" class="draft-input" data-draft-field="fecha" value="'+d.fecha+'"></div>'+
    '</div>'+

    '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="draft-label" style="margin-bottom:7px;">Tipo</div>'+segmentedHtml('draft-tipo', tipoOpts, d.tipo)+
      (isInvestDraft ? '' :
        '<div class="draft-label" style="margin:16px 0 7px;">Recurrencia</div>'+
        segmentedHtml('draft-recurrencia', [{id:'variable',label:'Variable'},{id:'mensual',label:'Mensual'},{id:'anual',label:'Anual'}], d.recurrencia))+
    '</div>'+

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Categoría</div>'+renderDraftCategoryRow(d)+'</div>'+

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Medio de pago</div>'+
      (state.addingPaymentMethod ? '' : '<select class="draft-select" data-draft-field="medio">'+medioOpts+'</select>')+
      newPaymentMethodForm+
    '</div>'+

    '<button class="save-tx-btn" data-save-draft="1" '+(canSave?'':'disabled')+'>Guardar transacción</button>'+
    (canSave?'':'<div class="field-error">Ponle un nombre de comercio y un monto para poder guardar.</div>');
}
export function saveDraftTx(){
  const d = state.draftTx;
  if(!d || d.comercio.trim().length===0 || !(d.monto>0)) return null;
  draftIdCounter++;
  const id = 'manual-'+Date.now()+'-'+draftIdCounter;
  const tx: Transaction = {
    id, fecha:d.fecha, hora:d.hora, comercio:d.comercio.trim(), monto:Math.round(d.monto),
    medio:d.medio, tipo:d.tipo, recurrencia:d.recurrencia,
    estado: d.categorias.length>0 ? 'confirmado' : 'pendiente',
    categorias: d.categorias.length>0 ? [{cat:d.categorias[0].cat, monto:Math.round(d.monto)}] : [],
    porCobrar:[], reglaAuto:false, nota:'',
    origen:'manual' // typed by hand right here -- the reconciliation engine (reconcile.ts) can never touch this
  };
  TRANSACTIONS.push(tx);
  ensureMonthExists(tx.fecha.slice(0,7));
  if(state.createExpenseFromGroupId){
    // Comes from "Add an expense" inside a group -- events.ts sets up the rest (leaves
    // state.shareDraft preloaded with this group) as soon as we get back with the transaction
    // created, so here we just leave its detail open instead of closing the sheet.
    state.openTxId = id; state.creatingNew = false;
    renderSheet();
    document.getElementById('sheet-content').scrollTop = 0;
  } else {
    state.categoryFilter=null; state.categoryFilterMonth=null; state.filter='todas'; state.tab='transacciones';
    closeSheet();
    render();
    toast('Transacción agregada');
  }
  return tx;
}
export function renderSheet(){
  if(state.boleta){
    const contentEl = document.getElementById('sheet-content');
    contentEl.innerHTML = renderReceiptSheetContent();
    document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
    return;
  }
  if(state.linkFlow){
    const contentEl = document.getElementById('sheet-content');
    contentEl.innerHTML = renderLinkFlowContent();
    document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
    return;
  }
  if(state.filterSheetOpen){
    const contentEl = document.getElementById('sheet-content');
    contentEl.innerHTML = renderFilterSheetContent();
    document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
    return;
  }
  if(state.creatingNew){
    const contentEl = document.getElementById('sheet-content');
    contentEl.innerHTML = renderNewTxSheetContent(state.draftTx);
    document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
    return;
  }
  if(!state.openTxId){ return; }
  const t = getTx(state.openTxId);
  if(!t){ closeSheet(); return; }
  const contentEl = document.getElementById('sheet-content');
  contentEl.innerHTML = renderSheetContent(t);
  document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
}

