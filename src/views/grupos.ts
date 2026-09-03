import { dayLabel } from '../helpers';
import { ICONS } from '../icons';
import { gastosDeGrupo, participantesDeGrupo, repartirIguales, saldoGrupo, transferenciasSugeridas } from '../shared-expenses';
import { segmentedHtml } from '../sheet';
import { GRUPOS, GRUPO_PARTICIPANTES, money, state } from '../state';
import { currentUser } from '../supabase';
/* ===================== GRUPOS (gastos compartidos) ===================== */
// Avatar redondo con la inicial + color del participante -- mismo criterio de reuso de
// colores de categoría (--cat-<color>-fill/ink) para no inventar una paleta nueva.
export function avatarHtml(nombre, color, size?){
  const s = size||28;
  const inicial = (nombre||'?').trim().charAt(0).toUpperCase() || '?';
  return '<span class="avatar-circle" style="width:'+s+'px;height:'+s+'px;font-size:'+Math.round(s*0.42)+'px;'+
    '--fill:var(--cat-'+(color||'lavender')+'-fill);--ink:var(--cat-'+(color||'lavender')+'-ink);">'+inicial+'</span>';
}

export function grupoScreenHead(title){
  return '<div class="menu-screen-head"><button class="menu-back-btn" data-grupo-back aria-label="Volver a Grupos">'+ICONS.chevL+'</button><h2 class="menu-screen-title">'+title+'</h2></div>';
}

export function miParticipanteEnGrupo(grupoId){
  if(!currentUser) return null;
  return GRUPO_PARTICIPANTES.find(p=>p.grupo_id===grupoId && p.user_id===currentUser.id) || null;
}

// Borrador de "Compartir con un grupo" (detalle de transacción): por defecto se comparte con
// el primer grupo, se asume que pagaste tú, y se divide en partes iguales entre TODOS los
// participantes (vos incluida) -- todo eso es desmarcable/cambiable después.
// NOTA de alcance: esta primera pasada solo ofrece partes iguales -- "montos"/"%" (reparto
// personalizado) queda para una próxima pasada, el esquema/backend ya los soporta.
export function defaultCompartirDraft(txId, grupoId?){
  const gid = grupoId || (GRUPOS[0] ? GRUPOS[0].id : null);
  if(!gid) return null;
  const participantes = participantesDeGrupo(gid);
  const mi = miParticipanteEnGrupo(gid);
  return {
    txId, grupoId: gid,
    pagadoPorId: mi ? mi.id : (participantes[0] ? participantes[0].id : null),
    participantesIncluidos: participantes.map(p=>p.id)
  };
}

export function renderCompartirGrupoSection(tx){
  if(tx.tipo!=='gasto' || tx.compartidoAjeno) return '';
  if(tx.grupoId){
    const g = GRUPOS.find(x=>x.id===tx.grupoId);
    return '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="sheet-block-title">Compartido con un grupo</div>'+
      '<p class="muted" style="font-size:12.5px;margin:0;">Este gasto ya se compartió con <b>'+(g?g.nombre:'un grupo')+'</b>. Para cambiar el reparto, hazlo desde la vista del grupo.</p>'+
    '</div>';
  }
  if(!GRUPOS.length) return '';
  const d = (state.compartirDraft && state.compartirDraft.txId===tx.id) ? state.compartirDraft : null;
  if(!d){
    return '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="sheet-block-title">Compartir con un grupo</div>'+
      '<button class="split-add" data-compartir-abrir="'+tx.id+'">'+ICONS.users+' Elegir un grupo</button>'+
    '</div>';
  }
  const participantes = participantesDeGrupo(d.grupoId);
  const reparto = repartirIguales(tx.monto, d.participantesIncluidos);
  const suma = d.participantesIncluidos.reduce((s,pid)=>s+(reparto[pid]||0),0);
  const ok = suma===tx.monto;
  return '<div class="sheet-block card" style="padding:16px;">'+
    '<div class="sheet-block-title">Compartir con un grupo</div>'+
    '<label class="draft-label">Grupo</label>'+
    '<select data-compartir-grupo>'+GRUPOS.map(g=>'<option value="'+g.id+'" '+(g.id===d.grupoId?'selected':'')+'>'+g.icono+' '+g.nombre+'</option>').join('')+'</select>'+
    '<label class="draft-label" style="margin-top:12px;">¿Quién pagó?</label>'+
    segmentedHtml('compartir-pagador', participantes.map(p=>({id:p.id,label:p.nombre})), d.pagadoPorId)+
    '<label class="draft-label" style="margin-top:12px;">¿Entre quiénes se divide? (partes iguales)</label>'+
    participantes.map(p=>{
      const incluido = d.participantesIncluidos.includes(p.id);
      return '<div class="split-row" style="align-items:center;">'+
        '<input type="checkbox" data-compartir-incluir="'+p.id+'" '+(incluido?'checked':'')+' style="width:18px;height:18px;flex-shrink:0;margin-right:8px;">'+
        avatarHtml(p.nombre, p.color, 24)+
        '<span style="flex:1;margin-left:8px;">'+p.nombre+'</span>'+
        '<span class="tabular muted">'+(incluido?money(reparto[p.id]||0):'—')+'</span>'+
      '</div>';
    }).join('')+
    '<div class="split-remaining"><span>Total repartido</span><span class="'+(ok?'ok':'bad')+' tabular">'+money(suma)+' de '+money(tx.monto)+'</span></div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-compartir-cancelar>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-compartir-confirmar="'+tx.id+'" '+(d.participantesIncluidos.length && ok ? '' : 'disabled')+'>Compartir</button>'+
    '</div>'+
  '</div>';
}

export function renderGruposView(){
  document.getElementById('header-title').textContent = 'Grupos';
  if(state.grupoAbiertoId) renderGrupoDetalle(state.grupoAbiertoId);
  else renderGruposLista();
}

export function renderGruposLista(){
  const cont = document.getElementById('view-root');
  if(state.uniendoAGrupo){ cont.innerHTML = renderUnirseAGrupoForm(); return; }
  if(state.creandoGrupo){ cont.innerHTML = renderCrearGrupoForm(); return; }

  if(!GRUPOS.length){
    cont.innerHTML =
      '<div class="empty-state" style="padding:40px 20px;text-align:center;">'+
        '<div style="font-size:38px;">👥</div>'+
        '<p class="muted" style="margin:12px 0 20px;">Todavía no tienes ningún grupo. Crea uno para dividir gastos con tu pareja, tu familia, tus roomies o un viaje.</p>'+
        '<button class="save-tx-btn" data-grupo-crear-abrir>'+ICONS.plus+' Crear grupo</button>'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);margin-top:10px;" data-grupo-unirse-abrir>Unirme con un código</button>'+
      '</div>';
    return;
  }

  const cards = GRUPOS.map(g=>{
    const mi = miParticipanteEnGrupo(g.id);
    const miSaldo = mi ? (saldoGrupo(g.id).find(s=>s.participanteId===mi.id)||{saldo:0}).saldo : 0;
    const n = participantesDeGrupo(g.id).length;
    const saldoTxt = miSaldo===0 ? 'Todo saldado' : (miSaldo>0 ? 'Te deben '+money(miSaldo) : 'Debes '+money(-miSaldo));
    return '<li><button class="menu-list-item" data-grupo-abrir="'+g.id+'">'+
      '<span class="menu-item-icon" style="font-size:20px;">'+(g.icono||'👥')+'</span>'+
      '<span class="menu-item-label">'+g.nombre+'<span class="menu-item-sub">'+n+' participante'+(n===1?'':'s')+' · '+saldoTxt+'</span></span>'+
      '<span class="menu-item-chev">'+ICONS.chevL+'</span>'+
    '</button></li>';
  }).join('');

  cont.innerHTML =
    '<ul class="menu-list">'+cards+'</ul>'+
    '<div style="display:flex;gap:10px;margin-top:16px;">'+
      '<button class="save-tx-btn" style="flex:1;" data-grupo-crear-abrir>'+ICONS.plus+' Crear grupo</button>'+
      '<button class="save-tx-btn" style="flex:1;background:var(--surface-sunken);color:var(--text);" data-grupo-unirse-abrir>Unirme con un código</button>'+
    '</div>';
}

export function renderCrearGrupoForm(){
  const d = state.grupoDraft;
  const iconos = ['👥','🏠','❤️','✈️','🎉','🎓'];
  return grupoScreenHead('Crear grupo')+
    '<div class="sheet-block card" style="padding:16px;">'+
      '<label class="draft-label">Nombre</label>'+
      '<input type="text" class="draft-input" data-grupo-draft-field="nombre" value="'+d.nombre+'" placeholder="Ej: Depto, Familia, Viaje a Chiloé">'+
      '<label class="draft-label" style="margin-top:12px;">Ícono</label>'+
      '<div class="icon-picker emoji-icon-picker">'+iconos.map(em=>'<button type="button" data-grupo-draft-icon="'+em+'" class="'+(d.icono===em?'active':'')+'">'+em+'</button>').join('')+'</div>'+
      '<div class="platform-hint muted" style="margin-top:10px;">Quedas tú como primer participante -- después puedes invitar a alguien más con cuenta, o agregar a alguien sin cuenta que tú administres.</div>'+
      '<div style="display:flex;gap:10px;margin-top:16px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-grupo-crear-cancelar>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-grupo-crear-confirmar>Crear</button>'+
      '</div>'+
    '</div>';
}

export function renderUnirseAGrupoForm(){
  const d = state.joinDraft;
  return grupoScreenHead('Unirme a un grupo')+
    '<div class="sheet-block card" style="padding:16px;">'+
      '<div class="platform-hint muted" style="margin-bottom:12px;">Pide el código de invitación a quien creó el grupo (Menú del grupo -> Invitar).</div>'+
      '<label class="draft-label">Código de invitación</label>'+
      '<input type="text" class="draft-input" data-join-draft-field="inviteCode" value="'+d.inviteCode+'" placeholder="Pega el código acá">'+
      '<label class="draft-label" style="margin-top:12px;">Tu nombre en este grupo</label>'+
      '<input type="text" class="draft-input" data-join-draft-field="nombre" value="'+d.nombre+'" placeholder="Como quieres que te vean los demás">'+
      '<div style="display:flex;gap:10px;margin-top:16px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-grupo-unirse-cancelar>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-grupo-unirse-confirmar>Unirme</button>'+
      '</div>'+
    '</div>';
}

export function renderGrupoDetalle(grupoId){
  const g = GRUPOS.find(x=>x.id===grupoId);
  const cont = document.getElementById('view-root');
  if(!g){ state.grupoAbiertoId = null; renderGruposLista(); return; }
  const participantes = participantesDeGrupo(grupoId);
  const saldos = saldoGrupo(grupoId);
  const transferencias = transferenciasSugeridas(grupoId);
  const gastos = gastosDeGrupo(grupoId);
  const mi = miParticipanteEnGrupo(grupoId);
  const miSaldo = mi ? (saldos.find(s=>s.participanteId===mi.id)||{saldo:0}).saldo : 0;

  const balanceCard =
    '<div class="card stat-tile" style="padding:20px;text-align:center;margin-bottom:14px;'+
      'background:'+(miSaldo>0?'var(--income-fill)':miSaldo<0?'var(--expense-fill)':'var(--surface)')+';">'+
      '<div class="stat-label">'+(miSaldo===0?'Estás al día':(miSaldo>0?'Te deben en total':'Debes en total'))+'</div>'+
      '<div class="stat-value tabular" style="font-size:26px;color:'+(miSaldo>0?'var(--income-ink)':miSaldo<0?'var(--expense-ink)':'var(--text)')+';">'+money(Math.abs(miSaldo))+'</div>'+
    '</div>';

  const desglose = '<div class="sheet-block card" style="padding:16px;margin-bottom:14px;">'+
    '<div class="sheet-block-title">Por persona</div>'+
    saldos.map(s=>{
      const sugerida = transferencias.find(t=> t.de===s.participanteId || t.a===s.participanteId);
      return '<div class="split-row" style="align-items:center;">'+
        avatarHtml(s.nombre, s.color)+
        '<span style="flex:1;margin-left:10px;">'+s.nombre+'</span>'+
        '<span class="tabular" style="color:'+(s.saldo>0?'var(--income-ink)':s.saldo<0?'var(--expense-ink)':'var(--text-secondary)')+';font-weight:600;">'+
          (s.saldo===0?'Al día':(s.saldo>0?'+':'−')+money(Math.abs(s.saldo)))+
        '</span>'+
        (s.saldo!==0 ? '<button class="chip" style="margin-left:8px;" data-grupo-saldar="'+grupoId+'|'+s.participanteId+'">Saldar</button>' : '')+
      '</div>';
    }).join('')+
    '<button class="split-add" data-grupo-agregar-participante-abrir="'+grupoId+'">'+ICONS.plus+' Agregar persona</button>'+
    (state.agregandoParticipante ? renderAgregarParticipanteForm(grupoId) : '')+
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
    '<button class="split-add" data-grupo-crear-gasto-abrir="'+grupoId+'">'+ICONS.plus+' Agregar un gasto</button>'+
  '</div>';

  cont.innerHTML = grupoScreenHead(g.nombre)+balanceCard+desglose+feed;
}

export function renderAgregarParticipanteForm(grupoId){
  const d = state.participanteDraft;
  return '<div class="sheet-block card" style="padding:12px;margin-top:10px;background:var(--surface-sunken);">'+
    '<label class="draft-label">Nombre</label>'+
    '<input type="text" class="draft-input" data-participante-draft-field="nombre" value="'+d.nombre+'" placeholder="Sin cuenta -- la administras tú">'+
    '<div style="display:flex;gap:10px;margin-top:10px;">'+
      '<button class="save-tx-btn" style="background:var(--surface);color:var(--text);flex:1;" data-grupo-agregar-participante-cancelar>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-grupo-agregar-participante-confirmar="'+grupoId+'">Agregar</button>'+
    '</div>'+
  '</div>';
}

