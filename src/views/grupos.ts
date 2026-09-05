import { catInfo, dayLabel } from '../helpers';
import { ICONS, catIconMarkup } from '../icons';
import { expensesOfGroup, participantsOfGroup, participantIdForUser, computeShareAmounts, shareAmountsSum, groupBalances, suggestedTransfers } from '../shared-expenses';
import { segmentedHtml } from '../sheet';
import { CATEGORIES, CATEGORY_MAPPINGS, CONTACTS, GROUPS, GROUP_PARTICIPANTS, PAID_BALANCES, money, state } from '../state';
import { SharedExpense } from '../types';
import { currentUser } from '../supabase';
/* ===================== GROUPS (shared expenses) ===================== */
// Round avatar with the participant's initial + color -- same category-color reuse approach
// (--cat-<color>-fill/ink) so as not to invent a new palette.
export function avatarHtml(nombre, color, size?){
  const s = size||28;
  const inicial = (nombre||'?').trim().charAt(0).toUpperCase() || '?';
  return '<span class="avatar-circle" style="width:'+s+'px;height:'+s+'px;font-size:'+Math.round(s*0.42)+'px;'+
    '--fill:var(--cat-'+(color||'lavender')+'-fill);--ink:var(--cat-'+(color||'lavender')+'-ink);">'+inicial+'</span>';
}

export function groupScreenHead(title){
  return '<div class="menu-screen-head"><button class="menu-back-btn" data-group-back aria-label="Volver a Grupos">'+ICONS.chevL+'</button><h2 class="menu-screen-title">'+title+'</h2></div>';
}

export function myParticipantInGroup(groupId){
  if(!currentUser) return null;
  return GROUP_PARTICIPANTS.find(p=>p.grupo_id===groupId && p.user_id===currentUser.id) || null;
}

// Draft for "Share with a group" (transaction detail): by default it's shared with the first
// group, assumes you paid, and splits equally among ALL participants (you included) -- all of
// that is uncheckable/changeable afterward. Also doubles as the state shape for "divide this
// expense with someone" when there's NO group (see defaultPersonaSplitDraft in
// shared-expenses.ts) -- both flows share the exact same draft fields, event handlers and render
// function (renderSplitDraftForm, below); the ONLY thing that differs between them is groupId
// (a real id here, null for the no-group case) and where "confirm" commits the result (Supabase
// vs. the transaction's own porCobrar -- see the data-share-confirm handler in events.ts).
export function defaultShareDraft(txId, groupId?){
  const gid = groupId || (GROUPS[0] ? GROUPS[0].id : null);
  if(!gid) return null;
  const participantes = participantsOfGroup(gid);
  const mi = myParticipantInGroup(gid);
  return {
    txId, groupId: gid, divisionTipo:'iguales',
    pagadoPorId: mi ? mi.id : (participantes[0] ? participantes[0].id : null),
    participantesIncluidos: participantes.map(p=>p.id),
    customValues: {}, extraParticipants: []
  };
}

// Universe of participants a draft can offer, for either flow: group members if d.groupId is
// set, otherwise "Tú" (the account owner, fixed id 'tu') + known contacts + any ad-hoc name
// typed into THIS draft via "+ agregar persona" (extraParticipants) -- deduped, in that order.
export function shareDraftParticipants(d){
  if(d.groupId) return participantsOfGroup(d.groupId);
  const nombres = ['Tú', ...CONTACTS, ...d.extraParticipants];
  const seen = new Set();
  const out: {id:string, nombre:string, color:string}[] = [];
  nombres.forEach(n=>{
    const id = n==='Tú' ? 'tu' : n;
    if(seen.has(id)) return;
    seen.add(id);
    out.push({id, nombre:n, color:'lavender'});
  });
  return out;
}

export function renderShareGroupSection(tx){
  if(tx.tipo!=='gasto' || tx.sharedByOthers) return '';
  if(tx.groupId){
    const g = GROUPS.find(x=>x.id===tx.groupId);
    return '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="sheet-block-title">Compartido con un grupo</div>'+
      '<p class="muted" style="font-size:12.5px;margin:0;">Este gasto ya se compartió con <b>'+(g?g.nombre:'un grupo')+'</b>. Para cambiar el reparto, hazlo desde la vista del grupo.</p>'+
    '</div>';
  }
  if(!GROUPS.length) return '';
  const d = (state.shareDraft && state.shareDraft.txId===tx.id && state.shareDraft.groupId) ? state.shareDraft : null;
  if(!d){
    return '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="sheet-block-title">Compartir con un grupo</div>'+
      '<button class="split-add" data-share-open="'+tx.id+'">'+ICONS.users+' Elegir un grupo</button>'+
    '</div>';
  }
  return renderSplitDraftForm(tx, d);
}

// The one shared "3 modalities + who pays + who's in it + live preview, hard-validated" picker,
// used both by "share with a group" (renderShareGroupSection, above) and by "divide this expense
// with someone" when there's no group (renderChargeSplitBlock in sheet.ts) -- same component,
// same data-share-* attributes/state.shareDraft, same event handlers in events.ts; the two call
// sites differ only in seeding (defaultShareDraft vs defaultPersonaSplitDraft) and in what
// data-share-confirm actually commits to (see events.ts). Sum-must-match-total is a HARD rule:
// the confirm button stays disabled until it does, for all 3 modalities alike (before this
// feature, only 'iguales' had that guarantee -- 'pct'/'montos' didn't exist in the UI at all).
export function renderSplitDraftForm(tx, d){
  const participantes = shareDraftParticipants(d);
  const reparto = computeShareAmounts(tx.monto, d);
  const suma = shareAmountsSum(reparto, d.participantesIncluidos);
  const ok = suma===tx.monto && d.participantesIncluidos.length>0;
  const remaining = tx.monto - suma;
  const modalidadSeg = segmentedHtml('division-tipo', [
    {id:'iguales', label:'Por partes'}, {id:'pct', label:'Por %'}, {id:'montos', label:'Monto fijo'}
  ], d.divisionTipo);
  const groupSelectHtml = !d.groupId ? '' :
    '<label class="draft-label">Grupo</label>'+
    '<select data-share-group>'+GROUPS.map(g=>'<option value="'+g.id+'" '+(g.id===d.groupId?'selected':'')+'>'+g.icono+' '+g.nombre+'</option>').join('')+'</select>';
  const rows = participantes.map(p=>{
    const incluido = d.participantesIncluidos.includes(p.id);
    const raw = d.customValues[p.id] || '';
    // "Por partes": each included person gets a "número de partes" input (a weight, not %/$ --
    // blank means 1 part, same as everyone starting equal) plus a live read-only readout of what
    // that weight actually works out to in pesos -- changing ANY one person's parts shifts
    // everyone else's peso amount too (the denominator moves), so this readout gets repainted for
    // every row on every keystroke (see the data-share-value handler in events.ts), not just the
    // row being edited.
    const valueField = !incluido ? '<span class="tabular muted">—</span>'
      : d.divisionTipo==='iguales'
        ? '<span class="num-wrap"><input type="text" inputmode="decimal" data-share-value="'+p.id+'" value="'+raw+'" placeholder="1" style="width:44px;"><span>partes</span></span>'+
          '<span class="tabular muted" data-share-computed="'+p.id+'" style="margin-left:8px;font-size:12px;flex-shrink:0;">'+money(reparto[p.id]||0)+'</span>'
        : '<span class="num-wrap"><input type="text" inputmode="decimal" data-share-value="'+p.id+'" value="'+raw+'"><span>'+(d.divisionTipo==='pct'?'%':'$')+'</span></span>';
    return '<div class="split-row" style="align-items:center;">'+
      '<input type="checkbox" data-share-include="'+p.id+'" '+(incluido?'checked':'')+' style="width:18px;height:18px;flex-shrink:0;margin-right:8px;">'+
      avatarHtml(p.nombre, p.color, 24)+
      '<span style="flex:1;margin-left:8px;">'+p.nombre+'</span>'+
      valueField+
    '</div>';
  }).join('');
  const addPersonRow = d.groupId ? '' :
    '<div class="split-row" style="align-items:center;">'+
      '<input type="text" class="draft-input" data-share-new-name placeholder="Agregar otra persona…" style="flex:1;">'+
      '<button type="button" class="split-add" data-share-add-name style="margin-left:8px;width:auto;padding:0 14px;">'+ICONS.plus+'</button>'+
    '</div>';
  return '<div class="sheet-block card" style="padding:16px;">'+
    '<div class="sheet-block-title">'+(d.groupId?'Compartir con un grupo':'Dividir este gasto')+'</div>'+
    groupSelectHtml+
    '<label class="draft-label" style="margin-top:12px;">¿Cómo se divide?</label>'+modalidadSeg+
    '<label class="draft-label" style="margin-top:12px;">¿Quién pagó?</label>'+
    segmentedHtml('compartir-pagador', participantes.map(p=>({id:p.id,label:p.nombre})), d.pagadoPorId)+
    '<label class="draft-label" style="margin-top:12px;">¿Entre quiénes se divide?</label>'+
    rows+addPersonRow+
    '<div class="split-remaining"><span>Total repartido</span><span class="'+(ok?'ok':'bad')+' tabular">'+money(suma)+' de '+money(tx.monto)+'</span></div>'+
    '<div class="field-error" style="'+(ok?'display:none;':'')+'">'+(remaining>0?'Faltan '+money(remaining)+' por repartir':(remaining<0?'Sobran '+money(-remaining)+' por repartir':''))+'</div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-share-cancel>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-share-confirm="'+tx.id+'" '+(ok?'':'disabled')+'>'+(d.groupId?'Compartir':'Guardar reparto')+'</button>'+
    '</div>'+
  '</div>';
}

export function renderGroupsView(){
  document.getElementById('header-title').textContent = 'Grupos';
  if(state.openGroupId) renderGroupDetail(state.openGroupId);
  else renderGroupsList();
}

export function renderGroupsList(){
  const cont = document.getElementById('view-root');
  if(state.joiningGroup){ cont.innerHTML = renderJoinGroupForm(); return; }
  if(state.creatingGroup){ cont.innerHTML = renderCreateGroupForm(); return; }

  if(!GROUPS.length){
    cont.innerHTML =
      '<div class="empty-state" style="padding:40px 20px;text-align:center;">'+
        '<div style="font-size:38px;">👥</div>'+
        '<p class="muted" style="margin:12px 0 20px;">Todavía no tienes ningún grupo. Crea uno para dividir gastos con tu pareja, tu familia, tus roomies o un viaje.</p>'+
        '<button class="save-tx-btn" data-group-create-open>'+ICONS.plus+' Crear grupo</button>'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);margin-top:10px;" data-group-join-open>Unirme con un código</button>'+
      '</div>';
    return;
  }

  const cards = GROUPS.map(g=>{
    const mi = myParticipantInGroup(g.id);
    const myBalance = mi ? (groupBalances(g.id).find(s=>s.participantId===mi.id)||{balance:0}).balance : 0;
    const n = participantsOfGroup(g.id).length;
    const balanceTxt = myBalance===0 ? 'Todo saldado' : (myBalance>0 ? 'Te deben '+money(myBalance) : 'Debes '+money(-myBalance));
    return '<li><button class="menu-list-item" data-group-open="'+g.id+'">'+
      '<span class="menu-item-icon" style="font-size:20px;">'+(g.icono||'👥')+'</span>'+
      '<span class="menu-item-label">'+g.nombre+'<span class="menu-item-sub">'+n+' participante'+(n===1?'':'s')+' · '+balanceTxt+'</span></span>'+
      '<span class="menu-item-chev">'+ICONS.chevL+'</span>'+
    '</button></li>';
  }).join('');

  cont.innerHTML =
    '<ul class="menu-list">'+cards+'</ul>'+
    '<div style="display:flex;gap:10px;margin-top:16px;">'+
      '<button class="save-tx-btn" style="flex:1;" data-group-create-open>'+ICONS.plus+' Crear grupo</button>'+
      '<button class="save-tx-btn" style="flex:1;background:var(--surface-sunken);color:var(--text);" data-group-join-open>Unirme con un código</button>'+
    '</div>';
}

export function renderCreateGroupForm(){
  const d = state.groupDraft;
  const iconos = ['👥','🏠','❤️','✈️','🎉','🎓'];
  return groupScreenHead('Crear grupo')+
    '<div class="sheet-block card" style="padding:16px;">'+
      '<label class="draft-label">Nombre</label>'+
      '<input type="text" class="draft-input" data-group-draft-field="nombre" value="'+d.nombre+'" placeholder="Ej: Depto, Familia, Viaje a Chiloé">'+
      '<label class="draft-label" style="margin-top:12px;">Ícono</label>'+
      '<div class="icon-picker emoji-icon-picker">'+iconos.map(em=>'<button type="button" data-group-draft-icon="'+em+'" class="'+(d.icono===em?'active':'')+'">'+em+'</button>').join('')+'</div>'+
      '<div class="platform-hint muted" style="margin-top:10px;">Quedas tú como primer participante -- después puedes invitar a alguien más con cuenta, o agregar a alguien sin cuenta que tú administres.</div>'+
      '<div style="display:flex;gap:10px;margin-top:16px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-group-create-cancel>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-group-create-confirm>Crear</button>'+
      '</div>'+
    '</div>';
}

export function renderJoinGroupForm(){
  const d = state.joinDraft;
  return groupScreenHead('Unirme a un grupo')+
    '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="platform-hint muted" style="margin-bottom:12px;">Pide el código de invitación a quien creó el grupo (Menú del grupo -> Invitar).</div>'+
      '<label class="draft-label">Código de invitación</label>'+
      '<input type="text" class="draft-input" data-join-draft-field="inviteCode" value="'+d.inviteCode+'" placeholder="Pega el código acá">'+
      '<label class="draft-label" style="margin-top:12px;">Tu nombre en este grupo</label>'+
      '<input type="text" class="draft-input" data-join-draft-field="nombre" value="'+d.nombre+'" placeholder="Como quieres que te vean los demás">'+
      '<div style="display:flex;gap:10px;margin-top:16px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-group-join-cancel>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-group-join-confirm>Unirme</button>'+
      '</div>'+
    '</div>';
}

/* ===================== Group detail: 3 Tricount-style sub-tabs =====================
   Same visual/structural pattern as "Resumen" (.subtabs/.subtab, see inversiones.ts
   renderSummarySubtabsInner) -- just without drag-to-reorder (only 3 fixed tabs, nothing to
   rearrange). The balance engine itself (groupBalances/suggestedTransfers, shared-expenses.ts)
   is untouched: these tabs only render what it already computes. */
export const GROUP_TABS_META = {
  gastos: {label:'Gastos'},
  balances: {label:'Balances'},
  transferencias: {label:'Transferencias'}
};
export function renderGroupSubtabsInner(){
  return Object.keys(GROUP_TABS_META).map(id=>
    '<button class="subtab '+(state.groupDetailTab===id?'active':'')+'" data-group-tab="'+id+'">'+GROUP_TABS_META[id].label+'</button>'
  ).join('');
}

// Best-effort category icon for a shared expense's feed row. categoria_origen is only ever a
// NAME in whoever registered it own taxonomy (never an id -- see the note on SHARED_EXPENSES in
// types.ts), so this can only succeed two ways: (a) I registered it myself, so the name is one
// of MY OWN categories -- direct match by nombre; or (b) reusing the exact same learned mapping
// (CATEGORY_MAPPINGS) that syncSharedExpenses() already builds for "my share" of someone else's
// expense (menu.ts) -- same lookup, just read-only here. No new classification logic invented:
// if neither resolves (nobody's mapped that origin category yet), the row falls back to the
// same generic icon used everywhere else in the app for "no category".
export function categoryForSharedExpense(g: SharedExpense, groupId: string){
  if(!g.categoria_origen || !currentUser) return null;
  if(g.registrado_por===currentUser.id){
    const id = Object.keys(CATEGORIES).find(k=>CATEGORIES[k].nombre===g.categoria_origen);
    return id ? catInfo(id) : null;
  }
  const registradorParticipanteId = participantIdForUser(groupId, g.registrado_por);
  const mapeo = registradorParticipanteId ? CATEGORY_MAPPINGS.find(m=>
    m.user_id===currentUser.id && m.de_participante===registradorParticipanteId && m.categoria_ajena===g.categoria_origen
  ) : null;
  return mapeo ? catInfo(mapeo.categoria_propia) : null;
}
// Same circular icon class Transactions uses for its category icon (.tx-avatar,
// --fill/--ink from the category color) -- not the nested-only .cat-row-icon (that one only
// gets its background/size from CSS scoped under `.cat-rows .split-row`, the editable category
// rows inside a transaction's detail, so it would render as an unstyled bare icon anywhere else).
function catAvatarHtml(ci){
  return '<span class="tx-avatar" style="--fill:'+(ci?'var(--cat-'+ci.color+'-fill)':'var(--surface-sunken)')+';--ink:'+(ci?'var(--cat-'+ci.color+'-ink)':'var(--text-tertiary)')+'">'+(ci?catIconMarkup(ci.icon):ICONS.more)+'</span>';
}

// ---------- Tab 1: Gastos -- feed of EVERY expense in the group (all members, not just mine) ----------
export function renderGroupExpenseDetailCard(gasto: SharedExpense, groupId: string){
  const participantes = participantsOfGroup(groupId);
  const pagador = participantes.find(p=>p.id===gasto.pagado_por);
  const ci = categoryForSharedExpense(gasto, groupId);
  return '<div class="sheet-block card" style="padding:16px;margin-top:10px;">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'+
      catAvatarHtml(ci)+
      '<span style="flex:1;">'+
        '<span class="sheet-block-title" style="margin:0;display:block;">'+gasto.descripcion+'</span>'+
        '<span class="muted" style="font-size:12px;">'+dayLabel(gasto.fecha)+'</span>'+
      '</span>'+
      '<span class="tabular" style="font-weight:700;">'+money(gasto.monto)+'</span>'+
    '</div>'+
    '<div class="muted" style="font-size:12.5px;margin-bottom:8px;">Pagó '+(pagador?pagador.nombre:'?')+'</div>'+
    (gasto.reparto||[]).map(r=>{
      const p = participantes.find(pp=>pp.id===r.participante_id);
      return '<div class="split-row" style="align-items:center;">'+avatarHtml(p?p.nombre:'?', p?p.color:'neutral', 24)+
        '<span style="flex:1;margin-left:8px;">'+(p?p.nombre:'?')+'</span>'+
        '<span class="tabular muted">'+money(r.monto)+'</span></div>';
    }).join('')+
    '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);width:100%;margin-top:12px;" data-group-expense-close>Cerrar</button>'+
  '</div>';
}
export function renderGroupGastosTab(groupId){
  const participantes = participantsOfGroup(groupId);
  const gastos = expensesOfGroup(groupId).slice().sort((a,b)=> b.fecha.localeCompare(a.fecha));
  const total = gastos.reduce((s,g)=>s+g.monto,0);
  const abierto = state.openGroupExpenseId ? gastos.find(g=>g.id===state.openGroupExpenseId) : null;

  return '<div class="card stat-tile" style="padding:16px;text-align:center;margin-bottom:14px;">'+
      '<div class="stat-label">Total gastado por el grupo</div>'+
      '<div class="stat-value tabular" style="font-size:24px;">'+money(total)+'</div>'+
    '</div>'+
    '<div class="sheet-block card" style="padding:16px;">'+
    (gastos.length ? '<div class="tx-list" style="box-shadow:none;border:none;">'+gastos.map(gc=>{
      const pagador = participantes.find(p=>p.id===gc.pagado_por);
      const ci = categoryForSharedExpense(gc, groupId);
      const entre = (gc.reparto||[]).map(r=>{
        const p = participantes.find(pp=>pp.id===r.participante_id);
        return p ? p.nombre : '?';
      }).join(', ');
      return '<div class="tx-item" data-group-expense-open="'+gc.id+'">'+
        catAvatarHtml(ci)+
        '<span class="tx-info">'+
          '<span class="tx-name">'+gc.descripcion+'</span>'+
          '<span class="tx-sub">'+dayLabel(gc.fecha)+' · pagó '+(pagador?pagador.nombre:'?')+' · entre '+entre+'</span>'+
        '</span>'+
        '<span class="tx-right"><span class="tx-amount tabular">'+money(gc.monto)+'</span></span>'+
      '</div>';
    }).join('')+'</div>' : '<p class="muted" style="padding:8px 0;">Todavía no hay gastos en este grupo.</p>')+
    '<button class="split-add" data-group-create-expense-open="'+groupId+'">'+ICONS.plus+' Agregar un gasto</button>'+
  '</div>'+
  (abierto ? renderGroupExpenseDetailCard(abierto, groupId) : '');
}

// ---------- Tab 2: Balances -- net balance per person + minimal suggested transfers ----------
export function renderGroupBalancesTab(groupId){
  const balances = groupBalances(groupId);
  const transfers = suggestedTransfers(groupId);
  const mi = myParticipantInGroup(groupId);

  const personSection = '<div class="sheet-block card" style="padding:16px;margin-bottom:14px;">'+
    '<div class="sheet-block-title">Saldo por persona</div>'+
    balances.map(s=>{
      const isMe = !!(mi && s.participantId===mi.id);
      return '<div class="split-row" style="align-items:center;">'+
        avatarHtml(s.nombre, s.color)+
        '<span style="flex:1;margin-left:10px;">'+s.nombre+(isMe?' (tú)':'')+'</span>'+
        '<span class="tabular" style="color:'+(s.balance>0?'var(--income-ink)':s.balance<0?'var(--expense-ink)':'var(--text-secondary)')+';font-weight:600;">'+
          (s.balance===0?'Al día':(s.balance>0?'Le deben ':'Debe ')+money(Math.abs(s.balance)))+
        '</span>'+
      '</div>';
    }).join('')+
    '<button class="split-add" data-group-add-participant-open="'+groupId+'">'+ICONS.plus+' Agregar persona</button>'+
    (state.addingParticipant ? renderAddParticipantForm(groupId) : '')+
  '</div>';

  const transferSection = '<div class="sheet-block card" style="padding:16px;">'+
    '<div class="sheet-block-title">Reembolsos sugeridos</div>'+
    (transfers.length ? transfers.map(t=>{
      const from = balances.find(b=>b.participantId===t.from);
      const to = balances.find(b=>b.participantId===t.to);
      const involvesMe = !!(mi && (t.from===mi.id || t.to===mi.id));
      return '<div class="split-row" style="align-items:center;'+(involvesMe?'background:var(--accent-soft);border-radius:10px;padding:6px 8px;margin:2px -8px;':'')+'">'+
        avatarHtml(from?from.nombre:'?', from?from.color:'neutral', 26)+
        '<span style="flex:1;margin-left:8px;">'+(from?from.nombre:'?')+' → '+(to?to.nombre:'?')+'</span>'+
        '<span class="tabular" style="font-weight:600;margin-right:8px;">'+money(t.monto)+'</span>'+
        '<button class="chip" data-mark-transfer-paid="'+groupId+'|'+t.from+'|'+t.to+'|'+Math.round(t.monto)+'">Marcar como pagado</button>'+
      '</div>';
    }).join('') : '<p class="muted" style="padding:8px 0;">Ya está todo al día -- no hay transferencias pendientes.</p>')+
  '</div>';

  return personSection+transferSection;
}

// ---------- Tab 3: Transferencias -- history of settlements already made + manual entry ----------
export function renderManualTransferForm(groupId){
  const d = state.manualTransferDraft;
  const participantes = participantsOfGroup(groupId);
  const ok = d.deId && d.aId && d.deId!==d.aId && d.monto>0;
  return '<div class="sheet-block card" style="padding:12px;background:var(--surface-sunken);">'+
    '<label class="draft-label">De</label>'+
    '<select data-manual-transfer-field="deId">'+participantes.map(p=>'<option value="'+p.id+'" '+(p.id===d.deId?'selected':'')+'>'+p.nombre+'</option>').join('')+'</select>'+
    '<label class="draft-label" style="margin-top:10px;">A</label>'+
    '<select data-manual-transfer-field="aId">'+participantes.map(p=>'<option value="'+p.id+'" '+(p.id===d.aId?'selected':'')+'>'+p.nombre+'</option>').join('')+'</select>'+
    '<label class="draft-label" style="margin-top:10px;">Monto</label>'+
    '<input type="text" inputmode="decimal" class="draft-input amount tabular" data-manual-transfer-field="monto" value="'+(d.monto||'')+'" placeholder="0">'+
    '<label class="draft-label" style="margin-top:10px;">Fecha</label>'+
    '<input type="date" class="draft-input" data-manual-transfer-field="fecha" value="'+d.fecha+'">'+
    (d.deId===d.aId ? '<p class="muted" style="font-size:12px;margin:8px 0 0;">Elige dos personas distintas.</p>' : '')+
    '<div style="display:flex;gap:10px;margin-top:12px;">'+
      '<button class="save-tx-btn" style="background:var(--surface);color:var(--text);flex:1;" data-manual-transfer-cancel>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-manual-transfer-confirm="'+groupId+'" '+(ok?'':'disabled')+'>Registrar</button>'+
    '</div>'+
  '</div>';
}
export function renderGroupTransferenciasTab(groupId){
  const participantes = participantsOfGroup(groupId);
  const nombreDe = id => { const p = participantes.find(x=>x.id===id); return p ? p.nombre : '?'; };
  const colorDe = id => { const p = participantes.find(x=>x.id===id); return p ? p.color : 'neutral'; };
  const historial = PAID_BALANCES.filter(s=>s.grupo_id===groupId).slice().sort((a,b)=> b.fecha.localeCompare(a.fecha));

  const historyCard = '<div class="sheet-block card" style="padding:16px;margin-bottom:14px;">'+
    '<div class="sheet-block-title">Historial de transferencias</div>'+
    (historial.length ? historial.map(s=>{
      return '<div class="split-row" style="align-items:center;">'+
        avatarHtml(nombreDe(s.de_participante), colorDe(s.de_participante), 26)+
        '<span style="flex:1;margin-left:8px;">'+nombreDe(s.de_participante)+' → '+nombreDe(s.a_participante)+'</span>'+
        '<span class="tabular" style="font-weight:600;margin-right:8px;">'+money(s.monto)+'</span>'+
        '<span class="muted" style="font-size:11.5px;">'+dayLabel(s.fecha)+'</span>'+
      '</div>';
    }).join('') : '<p class="muted" style="padding:8px 0;">Todavía no hay transferencias registradas.</p>')+
  '</div>';

  const manualCard = state.showManualTransferForm ? renderManualTransferForm(groupId) :
    '<button class="split-add" data-manual-transfer-open="'+groupId+'">'+ICONS.plus+' Registrar una transferencia</button>';

  return historyCard+manualCard;
}

export function renderGroupDetail(groupId){
  const g = GROUPS.find(x=>x.id===groupId);
  const cont = document.getElementById('view-root');
  if(!g){ state.openGroupId = null; renderGroupsList(); return; }

  const tab = state.groupDetailTab || 'gastos';
  const subtabsHtml = '<div class="subtabs">'+renderGroupSubtabsInner()+'</div>';
  const contentHtml = tab==='balances' ? renderGroupBalancesTab(groupId)
    : tab==='transferencias' ? renderGroupTransferenciasTab(groupId)
    : renderGroupGastosTab(groupId);

  // Delete group: only whoever created it can do it (same rule as the delete policy in
  // Supabase) -- it deletes the group and, in cascade, all its expenses/balances/participants
  // for everyone, so it's not offered to just any member by mistake. Rendered on every tab
  // (not tab-specific), same as before the tabs existed.
  const canDelete = !!(currentUser && g.creado_por===currentUser.id);
  const deleteBlock = !canDelete ? '' :
    (state.confirmDeleteGroupId===groupId
      ? '<div class="sheet-block card" style="padding:16px;margin-top:14px;">'+
          '<p class="muted" style="font-size:12.5px;margin:0 0 10px;">¿Seguro que quieres eliminar "'+g.nombre+'"? Se borran todos sus gastos y saldos, para todos los participantes. No se puede deshacer.</p>'+
          '<div style="display:flex;gap:8px;">'+
            '<button class="save-tx-btn" style="flex:1;background:var(--surface-sunken);color:var(--text);" data-cancel-delete-group>Cancelar</button>'+
            '<button class="save-tx-btn" style="flex:1;background:var(--cat-pink-fill);color:var(--expense-ink);" data-confirm-delete-group="'+groupId+'">Sí, eliminar</button>'+
          '</div>'+
        '</div>'
      : '<button class="split-add" style="color:var(--expense-ink);margin-top:14px;" data-ask-delete-group="'+groupId+'">'+ICONS.trash+' Eliminar grupo</button>');

  cont.innerHTML = groupScreenHead(g.nombre)+subtabsHtml+contentHtml+deleteBlock;
}

export function renderAddParticipantForm(groupId){
  const d = state.participantDraft;
  return '<div class="sheet-block card" style="padding:12px;margin-top:10px;background:var(--surface-sunken);">'+
    '<label class="draft-label">Nombre</label>'+
    '<input type="text" class="draft-input" data-participant-draft-field="nombre" value="'+d.nombre+'" placeholder="Sin cuenta -- la administras tú">'+
    '<div style="display:flex;gap:10px;margin-top:10px;">'+
      '<button class="save-tx-btn" style="background:var(--surface);color:var(--text);flex:1;" data-group-add-participant-cancel>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-group-add-participant-confirm="'+groupId+'">Agregar</button>'+
    '</div>'+
  '</div>';
}
