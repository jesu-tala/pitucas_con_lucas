import { allCobrado, catInfo, dayLabel, medioInfo, pendienteMontoEfectivo, pendienteVinculadaA, pendientesGlobales, porCobrarTotal, tienePorCobrarTipo } from './helpers';
import { ICONS, catIconMarkup } from './icons';
import { render } from './render';
import { ensureMonthExists, safeEvalExpr } from './shared-expenses';
import { CATS, CONTACTOS, MEDIOS, TX, money, moneyPlainMasked, state, todayISO } from './state';
import { PorCobrarItem, Transaccion } from './types';
import { toast } from './ui/toasts';
import { renderCompartirGrupoSection } from './views/grupos';
import { isPlatformArchived } from './views/inversiones';
import { advFilterCount } from './views/transacciones';
/* ===================== DETAIL SHEET ===================== */
export function getTx(id){ return TX.find(t=>t.id===id); }

export function segmentedHtml(name, options, value, disabled?){
  return '<div class="segmented" data-seg="'+name+'">'+options.map(o=>
    '<button data-seg-val="'+o.id+'" class="'+(value===o.id?'active':'')+'" '+(disabled?'disabled':'')+'>'+o.label+'</button>'
  ).join('')+'</div>';
}

// Filas de categoría siempre editables (select + monto/％ + borrar), con el conmutador $/％
// arriba y "Agregar categoría" siempre visible — así clasificas o repartes sin tener que
// primero entrar a un "modo edición" aparte. `allowSplit` se apaga para inversiones (ahí la
// plataforma es una sola, no algo que se reparte entre varias).
export function renderCategoriaRows(t, allowSplit){
  const unit = allowSplit ? (state.splitCatUnit[t.id] || '$') : '$';
  const catOptions = Object.keys(CATS).filter(k=>CATS[k].tipo===t.tipo && (t.tipo!=='inversion' || !isPlatformArchived(k) || (t.categorias[0] && t.categorias[0].cat===k)));
  const list = t.categorias.length ? t.categorias : [{cat:'', monto:t.monto}];
  const rows = list.map((c,idx)=>{
    const ci = c.cat ? catInfo(c.cat) : null;
    const opts = '<option value="">Sin categoría</option>'+catOptions.map(k=>{
      const icon = CATS[k].icon;
      const label = (ICONS[icon]===undefined ? icon+' ' : '')+CATS[k].nombre;
      return '<option value="'+k+'" '+(c.cat===k?'selected':'')+'>'+label+'</option>';
    }).join('');
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
    '<button class="split-add" data-add-catrow="'+t.id+'">'+ICONS.plus+' Agregar categoría</button>'+
    (t.categorias.length>0 ? '<div class="split-remaining"><span>Por asignar</span><span class="'+(ok?'ok':'bad')+' tabular">'+money(diff)+'</span></div>' : '')+
  '</div>';
}

export function renderCobroSplitBlock(t){
  const mode = state.splitCobroMode[t.id] || t.porCobrar.length>0;
  if(!mode){
    return '';
  }
  // "Por cobrar a alguien" y "Reembolso pendiente" son acciones separadas — si esta
  // transacción solo tiene filas de un tipo (el caso normal, entrando por una u otra acción
  // rápida), este bloque se especializa: no se ofrece agregar del otro tipo, para no mezclar
  // "cobrarle a una persona" con "un reembolso que esperas". Si ya tiene de ambos tipos (por
  // ejemplo, datos de antes de este cambio), se muestran ambas opciones para no bloquear nada.
  const hasPersona = tienePorCobrarTipo(t,'persona');
  const hasReembolso = tienePorCobrarTipo(t,'reembolso');
  const soloPersona = hasPersona && !hasReembolso;
  const soloReembolso = hasReembolso && !hasPersona;
  const unit = state.splitCobroUnit[t.id] || '$';
  const usedNames = t.porCobrar.map(p=>p.persona);
  const suggestions = soloReembolso ? [] : CONTACTOS.filter(c=>!usedNames.includes(c));
  const todosPagados = allCobrado(t);
  const rows = t.porCobrar.map((p,idx)=>{
    const isReembolso = p.tipo==='reembolso';
    const montoConocido = p.monto!=null;
    const shown = !montoConocido ? '' : (unit==='%' ? Math.round((p.monto/t.monto)*1000)/10 : p.monto);
    const tipoTag = isReembolso ? '<span class="pend-tipo-tag">Reembolso</span>' : '';
    const nameField = p.pagado
      ? '<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">'+tipoTag+'<span class="persona-label" style="font-size:13px;font-weight:600;">'+(p.persona||'Sin nombre')+'</span></span>'
      : '<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">'+tipoTag+
          '<input type="text" class="persona-label" style="width:100%;" data-cobro-name="'+idx+'" value="'+p.persona+'" placeholder="'+(isReembolso?'Isapre, seguro…':'Nombre')+'"></span>';
    const amtField = p.pagado
      ? '<span class="persona-amt tabular" style="font-size:13px;font-weight:500;width:96px;text-align:right;flex-shrink:0;">'+
          moneyPlainMasked(pendienteMontoEfectivo(p))+' '+unit+
          (isReembolso && p.montoRecibido!=null && p.monto!=null && p.montoRecibido!==p.monto ? '<span class="pend-esperado muted">de '+moneyPlainMasked(p.monto)+' esperado</span>' : '')+
        '</span>'
      : '<span class="num-wrap persona-amt"><input type="text" inputmode="decimal" data-cobro-amount="'+idx+'" value="'+shown+'" placeholder="'+(isReembolso?'Por confirmar':'0')+'"><span>'+unit+'</span></span>';
    const vincularBtn = p.pagado ? '' : '<button class="link-btn" data-link-pendiente="'+idx+'" aria-label="Vincular a un depósito">'+ICONS.inbox+'</button>';
    // "Dar por perdida" solo aplica a partes de una persona (una cuenta por cobrar real) —
    // un reembolso que nunca llega no necesita esto: ese gasto ya contaba 100% como tuyo.
    const darPorPerdidaLink = (!p.pagado && !isReembolso)
      ? '<button class="split-toggle-link" data-dar-por-perdida="'+idx+'" style="display:block;margin:-2px 0 10px;font-size:11px;">Dar por perdida — pasarla a gasto de este mes</button>'
      : '';
    return '<div>'+
      '<div class="split-row'+(p.pagado?' paid':'')+'" data-cobro-row="'+idx+'">'+
        '<button class="chk-pagado'+(p.pagado?' checked':'')+'" data-toggle-pagado="'+idx+'" aria-label="Marcar '+(p.persona||'esta persona')+' como pagado" aria-pressed="'+(p.pagado?'true':'false')+'">'+ICONS.check+'</button>'+
        nameField+ amtField+ vincularBtn+
        '<button class="rm-btn" data-cobro-remove="'+idx+'">'+ICONS.trash+'</button>'+
      '</div>'+
      darPorPerdidaLink+
    '</div>';
  }).join('');
  const totalCobro = porCobrarTotal(t);
  const tuParte = t.monto - totalCobro;
  const bad = tuParte < 0;
  const emptyHint = soloReembolso
    ? 'Agrega el reembolso que esperas por este gasto (isapre, seguro, etc).'
    : soloPersona
      ? 'Agrega a quién le cobras este gasto.'
      : 'Agrega a quién le cobras, o un reembolso que esperas por este gasto.';
  const tieneCobroPersonaPendiente = t.porCobrar.some(p=>p.tipo==='persona' && !p.pagado);
  const copiarBtn = tieneCobroPersonaPendiente
    ? '<button class="boleta-entry-link" data-copy-cobro="'+t.id+'">'+ICONS.copy+' Copiar para WhatsApp</button>'
    : '';
  return '<div class="split-block">'+
    (todosPagados ? '<div class="cobro-banner-done">'+ICONS.checkCircle+'<span>Ya te pagaron/reembolsaron todo lo de esta transacción.</span></div>' : '')+
    (soloReembolso ? '' : '<button class="boleta-entry-link" data-open-boleta="'+t.id+'">'+ICONS.camera+' Subir foto de la boleta y repartir automático</button>')+
    (suggestions.length? '<div class="contact-chips">'+suggestions.map(c=>'<button class="contact-chip" data-add-contact="'+c+'">+ '+c+'</button>').join('')+'</div>' : '')+
    '<div class="split-mode-row"><span class="muted" style="font-size:12.5px;">A cuánto le corresponde a cada uno</span>'+
      '<div class="mini-toggle"><button data-cobrounit="$" class="'+(unit==='$'?'active':'')+'">$</button><button data-cobrounit="%" class="'+(unit==='%'?'active':'')+'">%</button></div>'+
    '</div>'+
    (rows || '<p class="muted" style="font-size:12.5px;padding:6px 0;">'+emptyHint+'</p>')+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
      (soloReembolso ? '' : '<button class="split-add" data-add-cobrorow="'+t.id+'">'+ICONS.plus+' Agregar persona</button>')+
      (soloPersona ? '' : '<button class="split-add" data-add-reembolsorow="'+t.id+'">'+ICONS.plus+' Agregar reembolso</button>')+
    '</div>'+
    '<div class="split-remaining"><span>Tu parte del gasto</span><span class="'+(bad?'bad':'ok')+' tabular">'+money(tuParte)+'</span></div>'+
    copiarBtn+
  '</div>';
}

// Fila compacta de categoría para "Nueva transacción" — mismo componente visual que ya usa
// el detalle de una transacción existente (avatar redondo con el emoji/ícono de la categoría
// + un <select> nativo al lado, que al tocarlo despliega solo las opciones), en vez de la
// grilla grande de chips que se mostraba antes siempre abierta. Como una transacción recién
// creada solo admite una categoría (se puede dividir en varias después, ya guardada, desde
// su propio detalle), esta fila no tiene monto/% ni botón de "agregar otra".
export function renderDraftCategoriaRow(d){
  const catTipo = d.tipo==='inversion' ? 'inversion' : d.tipo;
  const catOptions = Object.keys(CATS).filter(k=>CATS[k].tipo===catTipo && (catTipo!=='inversion' || !isPlatformArchived(k)));
  const chosen = d.categorias[0] ? d.categorias[0].cat : '';
  const ci = chosen ? catInfo(chosen) : null;
  const opts = '<option value="">Sin categoría</option>'+catOptions.map(k=>{
    const icon = CATS[k].icon;
    const label = (ICONS[icon]===undefined ? icon+' ' : '')+CATS[k].nombre;
    return '<option value="'+k+'" '+(chosen===k?'selected':'')+'>'+label+'</option>';
  }).join('');
  return '<div class="cat-rows"><div class="split-row" data-draft-cat-row>'+
    '<span class="cat-row-icon" style="--fill:'+(ci?'var(--cat-'+ci.color+'-fill)':'var(--surface-sunken)')+';--ink:'+(ci?'var(--cat-'+ci.color+'-ink)':'var(--text-tertiary)')+'">'+(ci?catIconMarkup(ci.icon):ICONS.more)+'</span>'+
    '<select data-draft-cat-select>'+opts+'</select>'+
  '</div></div>';
}
export function catPickerGrid(tipoFilter, attrName, selectedId?){
  // Una plataforma cerrada no se ofrece para clasificar transacciones nuevas (ya no la usas),
  // pero si una transacción vieja ya quedó apuntando a ella, se sigue mostrando seleccionada.
  return '<div class="cat-picker-grid">'+Object.keys(CATS).filter(k=>CATS[k].tipo===tipoFilter && (tipoFilter!=='inversion' || !isPlatformArchived(k) || k===selectedId)).map(k=>{
    const c = CATS[k];
    const sel = k===selectedId;
    return '<button class="cat-picker-chip" data-'+attrName+'="'+k+'" '+(sel?'style="background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);"':'')+'>'+catIconMarkup(c.icon)+' '+c.nombre+'</button>';
  }).join('')+'</div>';
}

export function renderSheetContent(t){
  const isIncome = t.tipo==='ingreso';
  const isInvest = t.tipo==='inversion';
  const cats = t.categorias;
  const needsClassifying = cats.length===0 && t.estado==='pendiente';

  // Antes había que tocar la categoría para entrar a un "modo edición" aparte (chip -> grilla).
  // Ahora, salvo la primera clasificación de un movimiento importado (needsClassifying, que
  // sigue mostrando la grilla grande de íconos para elegir por primera vez), la categoría
  // siempre se ve como filas editables con select — igual que el resto de la app.
  const categoriaSection = needsClassifying
    ? (t.compartidoAjeno
        ? '<p class="cat-picker-hint">Este es tu parte de un gasto de grupo'+(t.categoriaOrigenSugerida?' que la otra persona anotó como "'+t.categoriaOrigenSugerida+'"':'')+'. Elige tu categoría y la próxima vez que registre algo así se va a clasificar sola.</p>'
        : '<p class="cat-picker-hint">Todavía no le has puesto categoría. Elige una para clasificarla (y luego puedes activar el candado para que se repita sola).</p>')+
      catPickerGrid(t.tipo, 'pick-cat')
    : renderCategoriaRows(t, !isInvest);

  // Antes una transacción ya creada como inversión quedaba con un chip fijo ("se edita en la
  // Fase 4") y, al revés, una importada como gasto/ingreso no se podía pasar a inversión — por
  // ejemplo, una transferencia a Fintual que llega sola desde el correo. Ahora las 3 opciones
  // siempre están disponibles acá, igual que al crear una transacción nueva.
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
          '<button class="switch '+(t.cuotas?'on':'')+'" data-toggle-cuotas="'+t.id+'" aria-label="Pago en cuotas" aria-pressed="'+(t.cuotas?'true':'false')+'"></button></div>'+
          (t.cuotas ? '<div class="cuota-stepper-wrap"><span class="cs-label">Número de cuotas</span>'+
            '<div class="stepper"><button data-cuotas-step="-1" data-tx="'+t.id+'" aria-label="Menos cuotas">'+ICONS.minus+'</button>'+
            '<span class="count tabular">'+t.cuotas.total+'</span>'+
            '<button data-cuotas-step="1" data-tx="'+t.id+'" aria-label="Más cuotas">'+ICONS.plus+'</button></div></div>' : '')+
        '</div>';

  const medioOptsExisting = Object.keys(MEDIOS).map(function(k){
    return '<option value="'+k+'" '+(t.medio===k?'selected':'')+'>'+MEDIOS[k].nombre+'</option>';
  }).join('');

  // El botón de borrar ya no depende de que la transacción venga importada por correo — ver
  // sheet-bottom-actions más abajo, que ahora ofrece borrar cualquier transacción. Acá solo
  // queda el aviso informativo de dónde salió, sin su propio botón de borrar duplicado.
  const importedBlock = !t.importadoEmail ? '' :
    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Importada desde tu correo</div>'+
      '<p class="muted" style="font-size:12.5px;margin:0;">Esta transacción se agregó sola a partir de un correo de tu banco.</p>'+
    '</div>';

  // Formato del detalle, encapsulado en tarjetas .card (una por sección) — mismo criterio
  // visual que usamos en el resto de la app. El orden agrupa lo que va junto: Monto/Fecha
  // con el medio de pago (todo "cuándo y con qué"), Tipo con Recurrencia (todo "qué tipo de
  // movimiento es"), y deja Cuotas/Categoría/regla-automática/acciones cada una en la suya —
  // las funciones (cuotas, reembolsos, por-cobrar) siguen intactas, solo cambia el envoltorio.
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
      '<div class="meta">'+dayLabel(t.fecha)+' · '+t.hora+' · '+medioInfo(t.medio).nombre+'</div>'+
      '<div class="sheet-amount '+(isIncome?'pos':'')+' tabular">'+(isIncome?'+':'')+money(t.monto)+'</div>'+
      '<div class="meta" data-nota-echo style="margin-top:6px;'+(t.nota?'':'display:none;')+'">'+(t.nota||'')+'</div>'+
    '</div>'+

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Monto y fecha</div>'+
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
        '<select class="draft-select" data-tx-medio-select="'+t.id+'">'+medioOptsExisting+'</select>'+
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
          const vinculo = pendienteVinculadaA(t.id);
          // Antes esta tarjeta aparecía en el detalle de CUALQUIER ingreso apenas hubiera algún
          // pendiente en algún otro lado de la app — así que un sueldo con su categoría normal
          // ("Sueldo Agosto") también la mostraba, sin ningún sentido: un sueldo categorizado
          // nunca es la plata de un cobro o reembolso. Ahora la tarjeta solo se ofrece cuando
          // este ingreso todavía no tiene categoría asignada (un depósito ambiguo, tipo
          // "Transferencia de Fran", es justo el caso en que podría ser el pago de un pendiente)
          // — salvo que ya esté vinculado, en cuyo caso siempre se muestra para poder verlo/quitarlo.
          if(!vinculo && (t.categorias.length>0 || pendientesGlobales().length===0)) return '';
          return '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Cobros y reembolsos</div>'+
            (vinculo
              ? '<div class="cobro-banner-done">'+ICONS.checkCircle+'<span>Vinculado a '+(vinculo.persona||'un pendiente')+' · '+vinculo.comercio+'</span></div>'+
                '<button class="split-toggle-link" data-unlink-ingreso="'+t.id+'">Quitar vínculo</button>'
              : '<p class="muted" style="font-size:12.5px;margin:0 0 10px;">Si este depósito corresponde a un cobro o reembolso pendiente, vincúlalo para tacharlo de la lista.</p>'+
                '<button class="action-btn" data-open-link-ingreso="'+t.id+'">'+ICONS.inbox+' Vincular a un pendiente</button>')+
          '</div>';
        })()
      : '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Acciones rápidas</div><div class="quick-actions">'+
          '<button class="action-btn '+(t.estado==='confirmado'?'selected':'')+'" data-action="confirmar" data-tx="'+t.id+'">'+ICONS.checkCircle+' Confirmar gasto</button>'+
          '<button class="action-btn '+(tienePorCobrarTipo(t,'persona')?'selected':'')+'" data-action="porcobrar_persona" data-tx="'+t.id+'">'+ICONS.users+' Por cobrar a alguien</button>'+
          '<button class="action-btn '+(tienePorCobrarTipo(t,'reembolso')?'selected':'')+'" data-action="porcobrar_reembolso" data-tx="'+t.id+'">'+ICONS.inbox+' Reembolso pendiente</button>'+
          '<button class="action-btn '+(t.estado==='no_es_gasto'?'selected':'')+'" data-action="noesgasto" data-tx="'+t.id+'">'+ICONS.ban+' No es gasto</button>'+
        '</div></div>'+
        (t.estado==='por_cobrar' ? '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Cobros y reembolsos pendientes</div>'+renderCobroSplitBlock(t)+'</div>' : '')
    )

    + renderCompartirGrupoSection(t)

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
export let medioIdCounter = 0;
// events.ts incrementa este contador desde afuera (agregar tarjeta/medio nuevo dentro del
// mini-form de la hoja de nueva transacción) -- ver la nota de setters en state.ts.
export function setMedioIdCounter(v){ medioIdCounter = v; }
export function openNewTxSheet(tipoInicial?){
  state.openTxId = null;
  state.creatingNew = true;
  state.draftTx = {
    // Antes esto era siempre 'visa_bch' — un medio que solo existe en los datos de ejemplo.
    // En una cuenta real (que empieza solo con "Efectivo"), ese id no existía en MEDIOS: el
    // selector de abajo mostraba "Efectivo" por default del navegador (al no encontrar la
    // opción marcada), pero por dentro el borrador seguía apuntando a 'visa_bch' — si no
    // tocabas el selector, se guardaba así, roto. Ahora arranca con el primer medio real que
    // ya tengas, así lo que se ve seleccionado y lo que se guarda siempre calzan.
    comercio:'', monto:0, fecha: todayISO(), hora:'12:00', medio: Object.keys(MEDIOS)[0] || 'efectivo',
    tipo: tipoInicial || 'gasto', recurrencia:'variable', categorias:[], porCobrar:[]
  };
  state.addingMedio = false;
  state.newMedioDraft = {nombre:'', ultimos4:''};
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

/* ---------- vincular un depósito a un pendiente (o viceversa) ---------- */
export function openLinkFromPendiente(gastoTxId, idx){
  state.linkFlow = {mode:'fromPendiente', gastoTxId, idx};
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
}
export function openLinkFromIngreso(ingresoTxId){
  state.linkFlow = {mode:'fromIngreso', ingresoTxId};
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
}
export function renderLinkFlowContent(){
  const lf = state.linkFlow;
  if(lf.mode==='fromPendiente'){
    const gastoTx = getTx(lf.gastoTxId);
    const p = gastoTx ? gastoTx.porCobrar[lf.idx] : null;
    if(!gastoTx || !p) return '<div class="sheet-top"><div class="merchant">Ya no existe</div></div>';
    const ingresos = TX.filter(t=>t.tipo==='ingreso').slice().sort((a,b)=> (b.fecha+b.hora).localeCompare(a.fecha+a.hora));
    const rows = ingresos.map(t=>{
      const yaVinculado = pendienteVinculadaA(t.id);
      return '<button class="link-pick-row" data-pick-ingreso="'+t.id+'">'+
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
    const ingresoTx = getTx(lf.ingresoTxId);
    if(!ingresoTx) return '<div class="sheet-top"><div class="merchant">Ya no existe</div></div>';
    const pendientes = pendientesGlobales();
    const rows = pendientes.map(p=>{
      const montoTxt = p.monto!=null ? money(p.monto)+' esperado' : 'monto por confirmar';
      return '<button class="link-pick-row" data-pick-pendiente="'+p.gastoTxId+'|'+p.idx+'">'+
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

/* ---------- dividir boleta con amigos (simulado — sin OCR ni link real) ---------- */
export let boletaItemIdCounter = 0;
// events.ts agrega ítems al asistente de "dividir boleta" desde afuera -- ver la nota de
// setters en state.ts.
export function nextBoletaItemId(){ boletaItemIdCounter++; return boletaItemIdCounter; }
// Un par de boletas de ejemplo para que "escanear" no muestre siempre lo mismo — nada de
// esto viene de una foto real, es solo para practicar el flujo de asignar y repartir.
export const BOLETA_EJEMPLOS = [
  {comercio:'Sushi Itto Providencia', items:[
    {nombre:'Roll California x2', monto:14000},{nombre:'Sashimi mixto', monto:16000},
    {nombre:'Bebidas (3)', monto:6000},{nombre:'Propina sugerida', monto:3600}
  ]},
  {comercio:'Pizzería Don Telmo', items:[
    {nombre:'Pizza familiar', monto:18000},{nombre:'Papas fritas', monto:6000},
    {nombre:'Cervezas (4)', monto:16000}
  ]}
];
export function boletaPersonas(){ return ['Yo'].concat(CONTACTOS); }
export function openBoletaFlow(gastoTxId){
  const gastoTx = getTx(gastoTxId);
  if(!gastoTx) return;
  state.boleta = {step:'capturar', gastoTxId, comercio: gastoTx.comercio, items:[], asign:{}, propinaUnit:'%', propinaValor:''};
  document.getElementById('sheet-overlay').classList.add('open');
  renderSheet();
  document.getElementById('sheet-content').scrollTop = 0;
}
export function boletaPersonTotals(){
  const b = state.boleta;
  const totals = {};
  boletaPersonas().forEach(p=>totals[p]=0);
  b.items.forEach(item=>{
    const asignados = b.asign[item.id] || [];
    if(asignados.length===0) return;
    const share = item.monto / asignados.length;
    asignados.forEach(p=>{ totals[p] = (totals[p]||0) + share; });
  });
  return totals;
}
export function boletaTotal(){ return state.boleta.items.reduce((s,i)=>s+i.monto,0); }
// Propina: un % (sobre el subtotal de los items) o un monto fijo — se suma aparte de los
// items y multiplica por igual lo que le corresponde a cada persona (nadie se "salva" de la
// propina solo porque comió menos, se reparte proporcional a lo que consumió cada uno).
export function boletaPropinaMonto(){
  const b = state.boleta;
  const v = b.propinaValor==='' ? null : safeEvalExpr(String(b.propinaValor));
  if(v==null || v<=0) return 0;
  return b.propinaUnit==='%' ? Math.round(boletaTotal()*v/100) : Math.round(v);
}
export function boletaTotalConPropina(){ return boletaTotal() + boletaPropinaMonto(); }
export function boletaPersonTotalsConPropina(){
  const subtotal = boletaTotal();
  const propina = boletaPropinaMonto();
  const base = boletaPersonTotals();
  if(propina<=0 || subtotal<=0) return base;
  const factor = (subtotal+propina)/subtotal;
  const out = {};
  Object.keys(base).forEach(p=>{ out[p] = base[p]*factor; });
  return out;
}
export function renderBoletaCapturar(){
  const b = state.boleta;
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">Boleta de '+(b.comercio||'esta transacción')+'</div>'+
      '<div class="meta">Sácale una foto o súbela desde tu galería y la convertimos en una lista de items para repartir.</div>'+
    '</div>'+
    '<div class="boleta-capture-row">'+
      '<button class="boleta-capture-btn" data-boleta-capture="camara">'+ICONS.camera+'<span>Tomar foto</span></button>'+
      '<button class="boleta-capture-btn" data-boleta-capture="galeria">'+ICONS.image+'<span>Elegir de galería</span></button>'+
    '</div>'+
    '<div class="file-format-hint">Esta maqueta simula el resultado con una boleta de ejemplo — no procesa fotos de verdad.</div>';
}
export function renderBoletaProcesando(){
  return '<div class="boleta-processing"><div class="boleta-spinner"></div><span>Leyendo tu boleta…</span></div>';
}
export function renderBoletaItems(){
  const b = state.boleta;
  const rows = b.items.map((item,idx)=>
    '<div class="split-row" data-boleta-item-row="'+idx+'">'+
      '<input type="text" data-boleta-item-nombre="'+idx+'" value="'+item.nombre+'" placeholder="Nombre del item">'+
      '<span class="num-wrap"><input type="text" inputmode="decimal" data-boleta-item-monto="'+idx+'" value="'+item.monto+'"><span>$</span></span>'+
      '<button class="rm-btn" data-boleta-item-remove="'+idx+'">'+ICONS.trash+'</button>'+
    '</div>'
  ).join('');
  const total = boletaTotal();
  const canContinue = b.items.length>0 && total>0;
  const quickChips = [10,15,20].map(pct=>
    '<button class="boleta-tip-chip'+(b.propinaUnit==='%' && Number(b.propinaValor)===pct?' active':'')+'" data-boleta-propina-quick="'+pct+'">'+pct+'%</button>'
  ).join('');
  const propinaCard = '<div class="card boleta-propina-card">'+
    '<div class="split-mode-row"><span class="muted" style="font-size:12.5px;">¿Agregaste propina?</span>'+
      '<div class="mini-toggle"><button data-boleta-propina-unit="%" class="'+(b.propinaUnit==='%'?'active':'')+'">%</button><button data-boleta-propina-unit="$" class="'+(b.propinaUnit==='$'?'active':'')+'">$</button></div>'+
    '</div>'+
    (b.propinaUnit==='%' ? '<div class="boleta-tip-chips">'+quickChips+'</div>' : '')+
    '<span class="num-wrap"><input type="text" inputmode="decimal" data-boleta-propina-input value="'+b.propinaValor+'" placeholder="'+(b.propinaUnit==='%'?'Otro %':'Monto $')+'"><span>'+b.propinaUnit+'</span></span>'+
  '</div>';
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">'+(b.comercio||'Tu boleta')+'</div>'+
      '<div class="meta">Revisa los items — puedes editarlos, agregar o borrar antes de repartir.</div>'+
    '</div>'+
    rows+
    '<button class="split-add" data-boleta-add-item>'+ICONS.plus+' Agregar item</button>'+
    propinaCard+
    '<div id="boleta-totals-summary">'+renderBoletaItemsTotalsSummary()+'</div>'+
    '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-boleta-goto="asignar" '+(canContinue?'':'disabled')+'>Continuar</button>';
}
// El resumen de totales del paso "items" vive en su propio bloque con id fijo para poder
// refrescarlo solo (sin re-renderizar todo el sheet) mientras la usuaria sigue escribiendo
// en un monto o en la propina — así no pierde el foco del input a medio tipeo.
export function renderBoletaItemsTotalsSummary(){
  const total = boletaTotal();
  const propina = boletaPropinaMonto();
  const totalConPropina = boletaTotalConPropina();
  return propina>0
    ? '<div class="split-remaining"><span>Subtotal (sin propina)</span><span class="tabular muted">'+money(total)+'</span></div>'+
      '<div class="split-remaining"><span>Propina</span><span class="tabular">'+money(propina)+'</span></div>'+
      '<div class="split-remaining"><span>Total con propina</span><span class="tabular" style="font-weight:800;">'+money(totalConPropina)+'</span></div>'
    : '<div class="split-remaining"><span>Total de la boleta</span><span class="tabular">'+money(total)+'</span></div>';
}
export function renderBoletaAsignar(){
  const b = state.boleta;
  const personas = boletaPersonas();
  const itemBlocks = b.items.map(item=>{
    const asignados = b.asign[item.id] || [];
    const chips = personas.map(p=>
      '<button class="boleta-person-chip'+(asignados.includes(p)?' active':'')+'" data-boleta-toggle-person="'+item.id+'|'+p+'">'+p+'</button>'
    ).join('');
    return '<div class="card boleta-item-block">'+
      '<div class="boleta-item-head"><span class="boleta-item-name">'+item.nombre+'</span><span class="boleta-item-amt tabular">'+money(item.monto)+'</span></div>'+
      '<div class="boleta-person-chips">'+chips+'</div>'+
      (asignados.length===0 ? '<div class="file-format-hint" style="margin-top:8px;">Sin asignar todavía.</div>' : '')+
    '</div>';
  }).join('');
  const totals = boletaPersonTotalsConPropina();
  const totalsSin = boletaPersonTotals();
  const conPropina = boletaPropinaMonto()>0;
  const sinAsignar = b.items.some(i=>!(b.asign[i.id]||[]).length);
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">¿Quién se comió qué?</div>'+
      '<div class="meta">Toca los nombres de cada item — si lo comieron entre varios, se divide en partes iguales.</div>'+
    '</div>'+
    itemBlocks+
    '<div class="card boleta-totals-card">'+
      personas.map(p=>boletaTotalRowHtml(p, totalsSin[p]||0, totals[p]||0, conPropina, false)).join('')+
    '</div>'+
    '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-boleta-goto="resumen" '+(sinAsignar?'disabled':'')+'>Continuar</button>'+
    (sinAsignar ? '<div class="field-error">Asigna cada item a al menos una persona para continuar.</div>' : '');
}
// Fila de un total por persona — si hay propina, muestra el monto sin propina (chico, arriba)
// y el monto con propina (el que realmente le corresponde pagar) debajo.
export function boletaTotalRowHtml(nombre, sinPropina, conPropinaMonto, showBoth, esYo){
  const amt = showBoth
    ? '<span class="amt-group"><span class="muted tabular boleta-amt-sin">'+money(sinPropina)+' sin propina</span><span class="amt tabular">'+money(conPropinaMonto)+'</span></span>'
    : '<span class="amt tabular">'+money(conPropinaMonto)+'</span>';
  return '<div class="boleta-total-row"><span class="name">'+nombre+(esYo?' (tú)':'')+'</span>'+amt+'</div>';
}
export function renderBoletaResumen(){
  const b = state.boleta;
  const totals = boletaPersonTotalsConPropina();
  const totalsSin = boletaPersonTotals();
  const conPropina = boletaPropinaMonto()>0;
  return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">'+
      '<div class="merchant" style="font-size:17px;">Así queda repartido</div>'+
      '<div class="meta">Total de la boleta: '+money(boletaTotalConPropina())+(conPropina?' (incluye propina)':'')+'</div>'+
    '</div>'+
    '<div class="card boleta-totals-card">'+
      boletaPersonas().map(p=>boletaTotalRowHtml(p, totalsSin[p]||0, totals[p]||0, conPropina, p==='Yo')).join('')+
    '</div>'+
    '<div class="boleta-preview-banner">'+ICONS.sparkle+'<span>Próximamente: vas a poder mandarles un link para que cada uno marque lo que consumió, sin que tengas que calcular tú.</span></div>'+
    '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-boleta-guardar>Guardar reparto en la transacción</button>';
}
export function renderBoletaSheetContent(){
  const step = state.boleta.step;
  if(step==='capturar') return renderBoletaCapturar();
  if(step==='procesando') return renderBoletaProcesando();
  if(step==='items') return renderBoletaItems();
  if(step==='asignar') return renderBoletaAsignar();
  return renderBoletaResumen();
}
export function guardarBoleta(){
  const b = state.boleta;
  const gastoTx = getTx(b.gastoTxId);
  if(!gastoTx) return;
  const totals = boletaPersonTotalsConPropina();
  const nuevoPorCobrar: PorCobrarItem[] = boletaPersonas().filter(p=>p!=='Yo' && totals[p]>0).map(p=>(
    {persona:p, monto:Math.round(totals[p]), pagado:false, tipo:'persona' as const, montoRecibido:null, linkedTxId:null}
  ));
  // la foto reemplaza el reparto manual que hubiera antes en esta transacción — es la fuente de verdad
  // sobre quién consumió qué; el monto total del gasto no se toca, sigue siendo lo que tú pagaste.
  gastoTx.porCobrar = nuevoPorCobrar;
  if(nuevoPorCobrar.length>0) gastoTx.estado = 'por_cobrar';
  state.splitCobroMode[gastoTx.id] = true;
  state.boleta = null;
  closeSheet();
  render();
  openSheet(gastoTx.id);
  toast('Reparto guardado en la transacción');
}
// Antes usaba ICONS[icon] directo — funciona para un ícono con nombre del set fijo (los
// medios de pago: 'card', 'bank', 'cash'), pero la mayoría de las categorías de gasto/ingreso
// usan un emoji suelto como ícono (ver catIconMarkup más arriba), así que ICONS[icon] daba
// "undefined" y los chips de categoría del filtro se veían como "undefined Hogar", "undefined
// Supermercado", etc. catIconMarkup ya resuelve ambos casos (nombre conocido o emoji suelto).
export function chipToggle(attrName, id, label, icon, active){
  return '<button class="cat-picker-chip" data-'+attrName+'="'+id+'" '+(active?'style="background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);"':'')+'>'+(icon?catIconMarkup(icon)+' ':'')+label+'</button>';
}
export function renderFilterSheetContent(){
  const af = state.advFilters;
  const catChips = '<div class="cat-picker-grid">'+
    chipToggle('toggle-filter-cat','__sin_cat__','Sin categoría', null, af.cats.includes('__sin_cat__'))+
    Object.keys(CATS).map(k=>chipToggle('toggle-filter-cat', k, CATS[k].nombre, CATS[k].icon, af.cats.includes(k))).join('')+
  '</div>';
  const medioChips = '<div class="cat-picker-grid">'+
    Object.keys(MEDIOS).map(k=>chipToggle('toggle-filter-medio', k, MEDIOS[k].nombre, MEDIOS[k].icon, af.medios.includes(k))).join('')+
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
  const medioOpts = Object.keys(MEDIOS).map(k=>'<option value="'+k+'" '+(d.medio===k?'selected':'')+'>'+MEDIOS[k].nombre+'</option>').join('')+
    '<option value="__nuevo_medio__">+ Agregar tarjeta o medio nuevo…</option>';
  const canSave = d.comercio.trim().length>0 && d.monto>0;
  const nm = state.newMedioDraft;
  const isInvestDraft = d.tipo==='inversion';
  const newMedioForm = state.addingMedio
    ? '<div class="new-medio-form">'+
        '<label class="draft-label">Nombre de la tarjeta o medio</label>'+
        '<input type="text" class="draft-input" data-new-medio-field="nombre" value="'+nm.nombre.replace(/"/g,'&quot;')+'" placeholder="Ej: Visa Falabella, Mach…">'+
        '<label class="draft-label" style="margin-top:12px;">Últimos 4 dígitos (opcional)</label>'+
        '<input type="text" inputmode="numeric" maxlength="4" class="draft-input" data-new-medio-field="ultimos4" value="'+nm.ultimos4.replace(/"/g,'&quot;')+'" placeholder="Ej: 1234">'+
        '<div style="display:flex;gap:10px;margin-top:12px;">'+
          '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-new-medio>Cancelar</button>'+
          '<button class="save-tx-btn" style="flex:1;" data-save-new-medio '+(nm.nombre.trim()?'':'disabled')+'>Agregar</button>'+
        '</div>'+
      '</div>'
    : '';
  // Mismo envoltorio de tarjetas .sheet-block/.card que usa el detalle de una transacción ya
  // creada (antes esta hoja era una lista plana de campos sueltos, muy distinta a como se ve
  // después al abrir esa misma transacción) — agrupa lo mismo que agrupa el detalle: monto y
  // fecha, tipo + recurrencia, categoría (con la fila compacta de ícono + select), medio de pago.
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

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Categoría</div>'+renderDraftCategoriaRow(d)+'</div>'+

    '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Medio de pago</div>'+
      (state.addingMedio ? '' : '<select class="draft-select" data-draft-field="medio">'+medioOpts+'</select>')+
      newMedioForm+
    '</div>'+

    '<button class="save-tx-btn" data-save-draft="1" '+(canSave?'':'disabled')+'>Guardar transacción</button>'+
    (canSave?'':'<div class="field-error">Ponle un nombre de comercio y un monto para poder guardar.</div>');
}
export function saveDraftTx(){
  const d = state.draftTx;
  if(!d || d.comercio.trim().length===0 || !(d.monto>0)) return null;
  draftIdCounter++;
  const id = 'manual-'+Date.now()+'-'+draftIdCounter;
  const tx: Transaccion = {
    id, fecha:d.fecha, hora:d.hora, comercio:d.comercio.trim(), monto:Math.round(d.monto),
    medio:d.medio, tipo:d.tipo, recurrencia:d.recurrencia,
    estado: d.categorias.length>0 ? 'confirmado' : 'pendiente',
    categorias: d.categorias.length>0 ? [{cat:d.categorias[0].cat, monto:Math.round(d.monto)}] : [],
    porCobrar:[], reglaAuto:false, nota:''
  };
  TX.push(tx);
  ensureMonthExists(tx.fecha.slice(0,7));
  if(state.crearGastoDesdeGrupoId){
    // Viene de "Agregar un gasto" dentro de un grupo -- events.ts arma el resto (deja
    // state.compartirDraft precargado con este grupo) apenas volvemos con la transacción
    // creada, así que acá solo dejamos su detalle abierto en vez de cerrar la hoja.
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
    contentEl.innerHTML = renderBoletaSheetContent();
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

