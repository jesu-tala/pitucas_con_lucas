import { dayLabel } from '../helpers';
import { ICONS } from '../icons';
import { expensesOfGroup, participantsOfGroup, splitEqually, groupBalances, suggestedTransfers } from '../shared-expenses';
import { segmentedHtml } from '../sheet';
import { GROUPS, GROUP_PARTICIPANTS, money, state } from '../state';
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
// that is uncheckable/changeable afterward.
// SCOPE NOTE: this first pass only offers equal shares -- "montos"/"%" (custom split) is left
// for a future pass, the schema/backend already supports them.
export function defaultShareDraft(txId, groupId?){
  const gid = groupId || (GROUPS[0] ? GROUPS[0].id : null);
  if(!gid) return null;
  const participantes = participantsOfGroup(gid);
  const mi = myParticipantInGroup(gid);
  return {
    txId, groupId: gid,
    pagadoPorId: mi ? mi.id : (participantes[0] ? participantes[0].id : null),
    participantesIncluidos: participantes.map(p=>p.id)
  };
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
  const d = (state.shareDraft && state.shareDraft.txId===tx.id) ? state.shareDraft : null;
  if(!d){
    return '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="sheet-block-title">Compartir con un grupo</div>'+
      '<button class="split-add" data-share-open="'+tx.id+'">'+ICONS.users+' Elegir un grupo</button>'+
    '</div>';
  }
  const participantes = participantsOfGroup(d.groupId);
  const reparto = splitEqually(tx.monto, d.participantesIncluidos);
  const suma = d.participantesIncluidos.reduce((s,pid)=>s+(reparto[pid]||0),0);
  const ok = suma===tx.monto;
  return '<div class="sheet-block card" style="padding:16px;">'+
    '<div class="sheet-block-title">Compartir con un grupo</div>'+
    '<label class="draft-label">Grupo</label>'+
    '<select data-share-group>'+GROUPS.map(g=>'<option value="'+g.id+'" '+(g.id===d.groupId?'selected':'')+'>'+g.icono+' '+g.nombre+'</option>').join('')+'</select>'+
    '<label class="draft-label" style="margin-top:12px;">¿Quién pagó?</label>'+
    segmentedHtml('compartir-pagador', participantes.map(p=>({id:p.id,label:p.nombre})), d.pagadoPorId)+
    '<label class="draft-label" style="margin-top:12px;">¿Entre quiénes se divide? (partes iguales)</label>'+
    participantes.map(p=>{
      const incluido = d.participantesIncluidos.includes(p.id);
      return '<div class="split-row" style="align-items:center;">'+
        '<input type="checkbox" data-share-include="'+p.id+'" '+(incluido?'checked':'')+' style="width:18px;height:18px;flex-shrink:0;margin-right:8px;">'+
        avatarHtml(p.nombre, p.color, 24)+
        '<span style="flex:1;margin-left:8px;">'+p.nombre+'</span>'+
        '<span class="tabular muted">'+(incluido?money(reparto[p.id]||0):'—')+'</span>'+
      '</div>';
    }).join('')+
    '<div class="split-remaining"><span>Total repartido</span><span class="'+(ok?'ok':'bad')+' tabular">'+money(suma)+' de '+money(tx.monto)+'</span></div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-share-cancel>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-share-confirm="'+tx.id+'" '+(d.participantesIncluidos.length && ok ? '' : 'disabled')+'>Compartir</button>'+
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

export function renderGroupDetail(groupId){
  const g = GROUPS.find(x=>x.id===groupId);
  const cont = document.getElementById('view-root');
  if(!g){ state.openGroupId = null; renderGroupsList(); return; }
  const participantes = participantsOfGroup(groupId);
  const balances = groupBalances(groupId);
  const transfers = suggestedTransfers(groupId);
  const gastos = expensesOfGroup(groupId);
  const mi = myParticipantInGroup(groupId);
  const myBalance = mi ? (balances.find(s=>s.participantId===mi.id)||{balance:0}).balance : 0;

  const balanceCard =
    '<div class="card stat-tile" style="padding:20px;text-align:center;margin-bottom:14px;'+
      'background:'+(myBalance>0?'var(--income-fill)':myBalance<0?'var(--expense-fill)':'var(--surface)')+';">'+
      '<div class="stat-label">'+(myBalance===0?'Estás al día':(myBalance>0?'Te deben en total':'Debes en total'))+'</div>'+
      '<div class="stat-value tabular" style="font-size:26px;color:'+(myBalance>0?'var(--income-ink)':myBalance<0?'var(--expense-ink)':'var(--text)')+';">'+money(Math.abs(myBalance))+'</div>'+
    '</div>';

  const breakdown = '<div class="sheet-block card" style="padding:16px;margin-bottom:14px;">'+
    '<div class="sheet-block-title">Por persona</div>'+
    balances.map(s=>{
      return '<div class="split-row" style="align-items:center;">'+
        avatarHtml(s.nombre, s.color)+
        '<span style="flex:1;margin-left:10px;">'+s.nombre+'</span>'+
        '<span class="tabular" style="color:'+(s.balance>0?'var(--income-ink)':s.balance<0?'var(--expense-ink)':'var(--text-secondary)')+';font-weight:600;">'+
          (s.balance===0?'Al día':(s.balance>0?'+':'−')+money(Math.abs(s.balance)))+
        '</span>'+
        (s.balance!==0 ? '<button class="chip" style="margin-left:8px;" data-group-settle="'+groupId+'|'+s.participantId+'">Saldar</button>' : '')+
      '</div>';
    }).join('')+
    '<button class="split-add" data-group-add-participant-open="'+groupId+'">'+ICONS.plus+' Agregar persona</button>'+
    (state.addingParticipant ? renderAddParticipantForm(groupId) : '')+
  '</div>';

  const feed = '<div class="sheet-block card" style="padding:16px;">'+
    '<div class="sheet-block-title">Gastos del grupo</div>'+
    (gastos.length ? '<div class="tx-list" style="box-shadow:none;border:none;">'+gastos.map(gc=>{
      const pagador = participantes.find(p=>p.id===gc.pagado_por);
      return '<div class="tx-item" style="cursor:default;">'+
        avatarHtml(pagador?pagador.nombre:'?', pagador?pagador.color:'neutral', 40)+
        '<span class="tx-info">'+
          '<span class="tx-name">'+gc.descripcion+'</span>'+
          '<span class="tx-sub">'+dayLabel(gc.fecha)+' · pagó '+(pagador?pagador.nombre:'?')+'</span>'+
        '</span>'+
        '<span class="tx-right"><span class="tx-amount tabular">'+money(gc.monto)+'</span></span>'+
      '</div>';
    }).join('')+'</div>' : '<p class="muted" style="padding:8px 0;">Todavía no hay gastos en este grupo.</p>')+
    '<button class="split-add" data-group-create-expense-open="'+groupId+'">'+ICONS.plus+' Agregar un gasto</button>'+
  '</div>';

  // Delete group: only whoever created it can do it (same rule as the delete policy in
  // Supabase) -- it deletes the group and, in cascade, all its expenses/balances/participants
  // for everyone, so it's not offered to just any member by mistake.
  const canDelete = !!(currentUser && g.creado_por===currentUser.id);
  const deleteBlock = !canDelete ? '' :
    (state.confirmDeleteGroupId===groupId
      ? '<div class="sheet-block card" style="padding:16px;">'+
          '<p class="muted" style="font-size:12.5px;margin:0 0 10px;">¿Seguro que quieres eliminar "'+g.nombre+'"? Se borran todos sus gastos y saldos, para todos los participantes. No se puede deshacer.</p>'+
          '<div style="display:flex;gap:8px;">'+
            '<button class="save-tx-btn" style="flex:1;background:var(--surface-sunken);color:var(--text);" data-cancel-delete-group>Cancelar</button>'+
            '<button class="save-tx-btn" style="flex:1;background:var(--cat-pink-fill);color:var(--expense-ink);" data-confirm-delete-group="'+groupId+'">Sí, eliminar</button>'+
          '</div>'+
        '</div>'
      : '<button class="split-add" style="color:var(--expense-ink);" data-ask-delete-group="'+groupId+'">'+ICONS.trash+' Eliminar grupo</button>');

  cont.innerHTML = groupScreenHead(g.nombre)+balanceCard+breakdown+feed+deleteBlock;
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
