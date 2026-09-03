import { catInfo, dayLabel, txsOfMonth } from '../helpers';
import { ICONS, catIconMarkup } from '../icons';
import { render } from '../render';
import { ensureMonthExists } from '../shared-expenses';
import { getTx, segmentedHtml } from '../sheet';
import { CATS, DATOS_TRANSFERENCIA, GASTOS_COMPARTIDOS, GRUPOS, GRUPO_PARTICIPANTES, MAPEO_CATEGORIAS, MEDIOS, PRESUPUESTOS, PRESUPUESTO_AVISOS_ENVIADOS, TX, fmt, importIdCounter, money, nextImportId, setGASTOS_COMPARTIDOS, setGRUPOS, setGRUPO_PARTICIPANTES, setMAPEO_CATEGORIAS, setSALDOS_PAGADOS, state, todayISO } from '../state';
import { PUSH_WORKER_URL, VAPID_PUBLIC_KEY, buildFullStateBlob, currentHouseholdId, currentUser, sb, translateAuthError } from '../supabase';
import { MapeoCategoria, Transaccion } from '../types';
import { toast } from '../ui/toasts';
import { isPlatformArchived } from './inversiones';
import { catGastoEnMes } from './presupuesto';
/* ===================== MENÚ (Fase 4) ===================== */
export const CAT_ICON_CHOICES = ['tags','cart','car','utensils','home','film','heart','repeat','briefcase','laptop','plusCircle','trending','bank','coin','card','cash','users','layers','sparkle','more'];
export const CAT_COLOR_CHOICES = ['lavender','mint','peach','sky','pink','butter','sage','neutral'];
export const MEDIO_ICON_CHOICES = ['card','bank','cash','coin'];
// Set curado de emojis para el ícono de una categoría — no es el set completo de Unicode (eso
// se cubre con el campo "o escribe cualquier otro emoji", que usa el teclado de emojis nativo
// del celular, igual que en WhatsApp). Este grid es solo un atajo para los más comunes.
export const CAT_EMOJI_CHOICES = ['🛒','🍽️','🚕','🏠','💊','🍻','📺','💼','✨','🌱','🪙','🛍️','✈️','🎁','🐜','🏃','🎬',
  '🐾','👶','📚','💻','🎮','🎵','💅','☕','🍕','🧴','💡','🚌','⛽','🧹','🏥','🎓','🧸','📱','🖥️','🎂','🏋️',
  '⚽','🎨','📦','🧳','🏦','💵','📈','🚗','🧾','🎗️'];

export function catEnUso(catId){ return TX.some(t=>t.categorias.some(c=>c.cat===catId)); }
export function medioEnUso(medioId){ return TX.some(t=>t.medio===medioId); }
// Otras categorías del mismo tipo (gasto/ingreso/inversión) que ya usan este color -- se
// usa para avisar en el editor de categorías, porque dos categorías del mismo tipo con el
// mismo color se ven como un solo bloque en los gráficos de torta (no se pueden distinguir).
export function categoriasConColor(tipo, color, excludeId){
  return Object.keys(CATS)
    .filter(id => id!==excludeId && CATS[id].tipo===tipo && CATS[id].color===color)
    .map(id => CATS[id].nombre);
}

// Agrupa las transacciones marcadas con reglaAuto por comercio, para la pantalla de
// "Reglas de clasificación" — se lee, no se crea nada nuevo acá (las reglas nacen del
// candado dentro del detalle de una transacción, en applyLockRule).
export function reglasAgrupadas(){
  const map = {};
  TX.forEach(t=>{
    if(!t.reglaAuto) return;
    (map[t.comercio] = map[t.comercio] || []).push(t);
  });
  return Object.keys(map).map(comercio=>{
    const txs = map[comercio].slice().sort((a,b)=> (b.fecha+b.hora).localeCompare(a.fecha+a.hora));
    const recent = txs[0];
    return {
      comercio, count: txs.length, tipo: recent.tipo, recurrencia: recent.recurrencia,
      cat: recent.categorias[0] ? recent.categorias[0].cat : null
    };
  }).sort((a,b)=>a.comercio.localeCompare(b.comercio));
}

export function menuScreenHead(title){
  return '<div class="menu-screen-head"><button class="menu-back-btn" data-menu-back aria-label="Volver al menú">'+ICONS.chevL+'</button><h2 class="menu-screen-title">'+title+'</h2></div>';
}

/* ---------- descargas reales: CSV y JSON ---------- */
export function downloadFile(filename, content, mime){
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
export function csvEscape(s){
  s = String(s==null ? '' : s);
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
export function buildTransaccionesCSV(){
  const header = ['fecha','hora','comercio','monto','tipo','categoria','medio','recurrencia','estado'];
  const rows = TX.slice().sort((a,b)=> (b.fecha+b.hora).localeCompare(a.fecha+a.hora)).map(t=>{
    const catNames = t.categorias.map(c=>catInfo(c.cat).nombre).join(' / ');
    const medioNombre = MEDIOS[t.medio] ? MEDIOS[t.medio].nombre : t.medio;
    return [t.fecha, t.hora, csvEscape(t.comercio), t.monto, t.tipo, csvEscape(catNames), csvEscape(medioNombre), t.recurrencia, t.estado].join(',');
  });
  // ﻿: BOM para que Excel abra bien los acentos y la ñ en Windows.
  return '﻿'+header.join(',')+'\n'+rows.join('\n');
}
export function buildBackupJSON(){
  const snapshot = Object.assign({app:'Pitucas sin lucas', version:2, exportadoEl: todayISO()}, buildFullStateBlob());
  return JSON.stringify(snapshot, null, 2);
}

/* ---------- importar CSV de cartola (parser simple) ---------- */
export function splitCsvLine(line){
  const out = []; let cur='', inQ=false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch==='"'){ inQ = !inQ; continue; }
    if(ch===',' && !inQ){ out.push(cur); cur=''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
export function normalizeFecha(raw){
  raw = String(raw||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return null;
}
export function parseCsvMonto(raw){
  raw = String(raw||'').trim().replace(/\$/g,'').replace(/\s/g,'');
  if(raw==='') return NaN;
  const neg = /^-/.test(raw) || /^\(.*\)$/.test(raw);
  raw = raw.replace(/[()\-]/g,'');
  if(raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g,'').replace(',','.');
  else if(raw.includes(',')) raw = raw.replace(',','.');
  else raw = raw.replace(/\.(?=\d{3}(\D|$))/g,'');
  const v = parseFloat(raw);
  if(isNaN(v)) return NaN;
  return neg ? -v : v;
}
export function parseCartolaCSV(text){
  const lines = String(text||'').split(/\r\n|\n|\r/).map(l=>l.trim()).filter(l=>l.length>0);
  lines.shift(); // primera línea = encabezado, se descarta siempre
  const rows = [], errors = [];
  lines.forEach((line, idx)=>{
    const parts = splitCsvLine(line);
    if(parts.length<3){ errors.push('Línea '+(idx+2)+': formato inválido'); return; }
    const fecha = normalizeFecha(parts[0]);
    const descripcion = (parts[1]||'').trim();
    const monto = parseCsvMonto(parts[2]);
    if(!fecha || !descripcion || isNaN(monto)){ errors.push('Línea '+(idx+2)+': no se pudo leer la fecha, descripción o monto'); return; }
    rows.push({fecha, descripcion, monto});
  });
  return {rows, errors};
}
export function importCartolaRows(rows){
  const reglaByComercio = {};
  reglasAgrupadas().forEach(r=>{ reglaByComercio[r.comercio] = r; });
  let conRegla = 0, pendientes = 0;
  rows.forEach(row=>{
    const regla = reglaByComercio[row.descripcion];
    const tipo = regla ? regla.tipo : (row.monto<0 ? 'gasto' : 'ingreso');
    const monto = Math.abs(row.monto);
    const categorias = regla && regla.cat ? [{cat:regla.cat, monto}] : [];
    const estado = regla && regla.cat ? 'confirmado' : 'pendiente';
    if(regla && regla.cat) conRegla++; else pendientes++;
    TX.unshift({
      id: 'timp'+(nextImportId()), fecha: row.fecha, hora:'00:00', comercio: row.descripcion,
      monto, medio: ensureCuentaVistaMedio(), tipo, recurrencia: regla ? regla.recurrencia : 'variable', estado,
      categorias, porCobrar:[], reglaAuto: !!(regla && regla.cat), nota:'Importado desde cartola CSV'
    });
  });
  return {creadas: rows.length, conRegla, pendientes};
}

/* ---------- pantalla principal ---------- */
export function renderMenuMain(){
  const nReglas = reglasAgrupadas().length;
  const items = [
    {section:'cuenta', icon:'lockSmall', label:'Mi cuenta', sub: currentUser ? currentUser.email : 'Sesión'},
    {section:'categorias', icon:'tags', label:'Categorías', sub: Object.keys(CATS).length+' categorías'},
    {section:'medios', icon:'card', label:'Medios de pago', sub: Object.keys(MEDIOS).length+' medios de pago'},
    {section:'reglas', icon:'lockSmall', label:'Reglas de clasificación', sub: nReglas+' regla'+(nReglas===1?'':'s')+' automática'+(nReglas===1?'':'s')},
    {section:'exportar', icon:'trending', label:'Exportar a Excel', sub:'Descarga tus transacciones en un CSV'},
    {section:'respaldo', icon:'inbox', label:'Respaldo en JSON', sub:'Descarga una copia completa de tus datos'},
    {section:'importar', icon:'plusCircle', label:'Importar CSV de cartola', sub:'Sube movimientos desde un archivo de tu banco'},
    {section:'importarcorreo', icon:'inbox', label:'Importar desde tu correo', sub:'Automático, vía Gmail'},
    {section:'notificaciones', icon:'bell', label:'Notificaciones', sub: state.notifSubscribed ? 'Activadas en este dispositivo' : 'Avísame de transacciones y presupuesto'},
    {section:'reconciliar', icon:'checkCircle', label:'Reconciliar con la cartola', sub:'Compara un mes contra el PDF de tu banco'},
    {section:'demo', icon:'lock', label:'Modo demo', sub: state.demoMode ? 'Activado' : 'Desactivado'},
    {section:'asesoria', icon:'sparkle', label:'Asesoría financiera con Claude', sub:'Próximamente'}
  ];
  document.getElementById('view-root').innerHTML =
    '<ul class="menu-list">'+items.map(i=>
      '<li><button class="menu-list-item" data-menu-open="'+i.section+'">'+
        '<span class="menu-item-icon">'+ICONS[i.icon]+'</span>'+
        '<span class="menu-item-label">'+i.label+'<span class="menu-item-sub">'+i.sub+'</span></span>'+
        '<span class="menu-item-chev">'+ICONS.chevL+'</span>'+
      '</button></li>'
    ).join('')+'</ul>';
}

/* ---------- categorías ---------- */
export function renderMenuCatEditForm(){
  const d = state.catDraft;
  const isNew = state.editingCatId==='nueva';
  return '<div class="card" style="padding:16px;">'+
    '<label class="draft-label">Nombre</label>'+
    '<input type="text" class="draft-input" data-cat-draft-field="nombre" value="'+d.nombre+'" placeholder="Ej: Mascotas">'+
    '<label class="draft-label" style="margin-top:12px;">Tipo</label>'+
    segmentedHtml('cat-draft-tipo', [{id:'gasto',label:'Gasto'},{id:'ingreso',label:'Ingreso'}], d.tipo, !isNew)+
    (!isNew ? '<div class="platform-hint muted">El tipo no se puede cambiar una vez creada la categoría.</div>' : '')+
    '<label class="draft-label" style="margin-top:12px;">Ícono</label>'+
    '<div class="icon-picker emoji-icon-picker">'+CAT_EMOJI_CHOICES.map(em=>'<button type="button" data-cat-draft-icon="'+em+'" class="'+(d.icon===em?'active':'')+'">'+em+'</button>').join('')+'</div>'+
    '<input type="text" class="draft-input" data-cat-draft-field="icon" value="'+d.icon+'" maxlength="8" placeholder="O escribe/pega cualquier otro emoji 😊" style="margin-top:8px;text-align:center;">'+
    '<label class="draft-label" style="margin-top:12px;">Color</label>'+
    '<div class="color-picker">'+CAT_COLOR_CHOICES.map(c=>'<button type="button" data-cat-draft-color="'+c+'" class="'+(d.color===c?'active':'')+'" style="--sw:var(--cat-'+c+'-fill)"></button>').join('')+'</div>'+
    (function(){
      const excludeId = isNew ? null : state.editingCatId;
      const colision = categoriasConColor(d.tipo, d.color, excludeId);
      return colision.length
        ? '<div class="file-format-hint" style="color:var(--expense-ink);">Ese color ya lo usa "'+colision.join('", "')+'" -- en los gráficos de torta se van a ver como un solo bloque. Prueba otro color.</div>'
        : '';
    })()+
    '<div style="display:flex;gap:10px;margin-top:16px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-cat-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-cat="'+(isNew?'nueva':state.editingCatId)+'">Guardar</button>'+
    '</div>'+
    (!isNew && !catEnUso(state.editingCatId) ? '<button class="budget-delete-link" data-delete-cat="'+state.editingCatId+'">Eliminar categoría</button>' : '')+
    (!isNew && catEnUso(state.editingCatId) ? '<div class="file-format-hint">No se puede eliminar: tiene transacciones asociadas.</div>' : '')+
  '</div>';
}
export function renderMenuCategorias(){
  if(state.editingCatId){
    document.getElementById('view-root').innerHTML = menuScreenHead('Categorías')+renderMenuCatEditForm();
    return;
  }
  function rowFor(id){
    const c = CATS[id];
    return '<div class="card menu-item-card">'+
      '<span class="menu-item-card-icon" style="--fill:var(--cat-'+c.color+'-fill);--ink:var(--cat-'+c.color+'-ink)">'+catIconMarkup(c.icon)+'</span>'+
      '<div class="menu-item-card-body"><div class="menu-item-card-name">'+c.nombre+'</div></div>'+
      '<div class="menu-item-card-actions"><button class="budget-edit-btn" data-edit-cat="'+id+'" aria-label="Editar '+c.nombre+'">'+ICONS.edit+'</button></div>'+
    '</div>';
  }
  function readonlyRowFor(id){
    const c = CATS[id];
    return '<div class="card menu-item-card">'+
      '<span class="menu-item-card-icon" style="--fill:var(--cat-'+c.color+'-fill);--ink:var(--cat-'+c.color+'-ink)">'+catIconMarkup(c.icon)+'</span>'+
      '<div class="menu-item-card-body"><div class="menu-item-card-name">'+c.nombre+'</div><div class="menu-item-card-sub">Se administra desde Inversiones</div></div>'+
    '</div>';
  }
  const gastoIds = Object.keys(CATS).filter(k=>CATS[k].tipo==='gasto');
  const ingresoIds = Object.keys(CATS).filter(k=>CATS[k].tipo==='ingreso');
  // Una plataforma cerrada no se muestra acá — "cerrar" la saca de todas las vistas activas,
  // igual que en Inversiones (su historial de transacciones sigue intacto, solo se deja de
  // administrar desde este lado; se puede reabrir en Inversiones y vuelve a aparecer).
  const inversionIds = Object.keys(CATS).filter(k=>CATS[k].tipo==='inversion' && !isPlatformArchived(k));
  document.getElementById('view-root').innerHTML = menuScreenHead('Categorías')+
    '<div class="menu-list-divider">Gastos</div>'+gastoIds.map(rowFor).join('')+
    '<div class="menu-list-divider">Ingresos</div>'+ingresoIds.map(rowFor).join('')+
    '<button class="budget-add-link" data-add-cat style="margin:2px 0 16px;">+ Agregar categoría</button>'+
    '<div class="menu-list-divider">Inversión</div>'+
    '<p class="muted" style="font-size:12px;margin:0 0 8px;">Estas categorías nacen solas cuando creas una plataforma o meta en Inversiones.</p>'+
    inversionIds.map(readonlyRowFor).join('');
}

/* ---------- medios de pago ---------- */
export function renderMenuMedioEditForm(){
  const d = state.medioDraft;
  const isNew = state.editingMedioId==='nueva';
  return '<div class="card" style="padding:16px;">'+
    '<label class="draft-label">Nombre</label>'+
    '<input type="text" class="draft-input" data-medio-draft-field="nombre" value="'+d.nombre+'" placeholder="Ej: Mastercard Falabella">'+
    '<label class="draft-label" style="margin-top:12px;">Detalle (opcional)</label>'+
    '<input type="text" class="draft-input" data-medio-draft-field="corto" value="'+d.corto+'" placeholder="Ej: •••• 1234">'+
    '<label class="draft-label" style="margin-top:12px;">Ícono</label>'+
    '<div class="icon-picker" style="grid-template-columns:repeat(4,1fr);">'+MEDIO_ICON_CHOICES.map(ic=>'<button type="button" data-medio-draft-icon="'+ic+'" class="'+(d.icon===ic?'active':'')+'">'+ICONS[ic]+'</button>').join('')+'</div>'+
    '<div style="display:flex;gap:10px;margin-top:16px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-medio-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-medio="'+(isNew?'nueva':state.editingMedioId)+'">Guardar</button>'+
    '</div>'+
    (!isNew && !medioEnUso(state.editingMedioId) ? '<button class="budget-delete-link" data-delete-medio="'+state.editingMedioId+'">Eliminar medio de pago</button>' : '')+
    (!isNew && medioEnUso(state.editingMedioId) ? '<div class="file-format-hint">No se puede eliminar: tiene transacciones asociadas.</div>' : '')+
  '</div>';
}
export function renderMenuMedios(){
  if(state.editingMedioId){
    document.getElementById('view-root').innerHTML = menuScreenHead('Medios de pago')+renderMenuMedioEditForm();
    return;
  }
  const rows = Object.keys(MEDIOS).map(id=>{
    const m = MEDIOS[id];
    return '<div class="card menu-item-card">'+
      '<span class="menu-item-card-icon" style="--fill:var(--surface-sunken);--ink:var(--text-secondary);">'+ICONS[m.icon]+'</span>'+
      '<div class="menu-item-card-body"><div class="menu-item-card-name">'+m.nombre+'</div><div class="menu-item-card-sub">'+m.corto+'</div></div>'+
      '<div class="menu-item-card-actions"><button class="budget-edit-btn" data-edit-medio="'+id+'" aria-label="Editar '+m.nombre+'">'+ICONS.edit+'</button></div>'+
    '</div>';
  }).join('');
  document.getElementById('view-root').innerHTML = menuScreenHead('Medios de pago')+
    rows+'<button class="budget-add-link" data-add-medio style="margin:2px 0 4px;">+ Agregar medio de pago</button>';
}

/* ---------- reglas de clasificación ---------- */
export function renderMenuReglas(){
  const reglas = reglasAgrupadas();
  document.getElementById('view-root').innerHTML = menuScreenHead('Reglas de clasificación')+
    '<p class="muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.5;">Cuando activas el candado dentro del detalle de una transacción, esa categoría, tipo y recurrencia se aplican a futuras compras del mismo comercio. Acá puedes revisarlas y eliminarlas.</p>'+
    (reglas.length===0 ?
      '<div class="card placeholder-card">'+ICONS.lockSmall+'<h3>Todavía no tienes reglas</h3><p>Actívalas desde el detalle de cualquier transacción, con el ícono de candado.</p></div>'
    : reglas.map(r=>{
        const cat = r.cat ? catInfo(r.cat) : null;
        return '<div class="card rule-card">'+
          '<div class="rule-card-head">'+
            '<span class="rule-card-comercio">'+r.comercio+'</span>'+
            '<span class="rule-card-count">'+r.count+' transac.</span>'+
            '<button class="budget-edit-btn" data-delete-regla="'+encodeURIComponent(r.comercio)+'" aria-label="Eliminar regla de '+r.comercio+'">'+ICONS.trash+'</button>'+
          '</div>'+
          '<div class="rule-card-detail">'+
            (cat ? '<span class="rule-card-catchip" style="--fill:var(--cat-'+cat.color+'-fill);--ink:var(--cat-'+cat.color+'-ink)">'+catIconMarkup(cat.icon)+' '+cat.nombre+'</span>' : '')+
            '<span>'+(r.tipo==='gasto'?'Gasto':r.tipo==='ingreso'?'Ingreso':'Inversión')+'</span>'+
            '<span>·</span><span>'+(r.recurrencia==='mensual'?'Fijo mensual':'Variable')+'</span>'+
          '</div>'+
        '</div>';
      }).join('')
    );
}

/* ---------- exportar / respaldo / importar ---------- */
export function renderMenuExportar(){
  document.getElementById('view-root').innerHTML = menuScreenHead('Exportar a Excel')+
    '<div class="card" style="padding:16px;">'+
      '<div class="menu-item-card" style="padding:0;margin-bottom:16px;">'+
        '<span class="menu-item-card-icon" style="--fill:var(--cat-sage-fill);--ink:var(--cat-sage-ink)">'+ICONS.trending+'</span>'+
        '<div class="menu-item-card-body"><div class="menu-item-card-name">'+TX.length+' transacciones</div><div class="menu-item-card-sub">Se exportan todas, sin importar el filtro o mes abierto</div></div>'+
      '</div>'+
      '<button class="save-tx-btn" data-export-csv style="width:100%;">Descargar CSV</button>'+
      '<div class="file-format-hint">Se abre directo en Excel, Google Sheets o Numbers. Columnas: <code>fecha, hora, comercio, monto, tipo, categoria, medio, recurrencia, estado</code>.</div>'+
    '</div>';
}
export function renderMenuRespaldo(){
  document.getElementById('view-root').innerHTML = menuScreenHead('Respaldo en JSON')+
    '<div class="card" style="padding:16px;">'+
      '<div class="menu-item-card" style="padding:0;margin-bottom:16px;">'+
        '<span class="menu-item-card-icon" style="--fill:var(--cat-sky-fill);--ink:var(--cat-sky-ink)">'+ICONS.inbox+'</span>'+
        '<div class="menu-item-card-body"><div class="menu-item-card-name">Copia completa de tus datos</div><div class="menu-item-card-sub">Transacciones, categorías, medios, presupuestos, metas y plataformas</div></div>'+
      '</div>'+
      '<button class="save-tx-btn" data-export-json style="width:100%;">Descargar JSON</button>'+
      '<div class="file-format-hint">Pensado para guardar una copia de respaldo o migrarla más adelante — no se puede volver a importar desde esta maqueta.</div>'+
    '</div>';
}
export function renderMenuImportar(){
  const s = state.importSummary;
  document.getElementById('view-root').innerHTML = menuScreenHead('Importar CSV de cartola')+(
    s ?
      '<div class="card" style="padding:16px;">'+
        '<div class="menu-item-card" style="padding:0;margin-bottom:14px;">'+
          '<span class="menu-item-card-icon" style="--fill:var(--cat-mint-fill);--ink:var(--cat-mint-ink)">'+ICONS.checkCircle+'</span>'+
          '<div class="menu-item-card-body"><div class="menu-item-card-name">'+s.archivo+'</div><div class="menu-item-card-sub">'+s.creadas+' fila'+(s.creadas===1?'':'s')+' leída'+(s.creadas===1?'':'s')+'</div></div>'+
        '</div>'+
        '<div class="rule-card-detail" style="margin-bottom:8px;">'+ICONS.check+'<span>'+s.creadas+' transacciones creadas</span></div>'+
        '<div class="rule-card-detail" style="margin-bottom:8px;">'+ICONS.lockSmall+'<span>'+s.conRegla+' categorizadas automáticamente por una regla existente</span></div>'+
        '<div class="rule-card-detail" style="margin-bottom:'+(s.errores.length?'8px':'0')+';">'+ICONS.question+'<span>'+s.pendientes+' quedaron pendientes de categorizar</span></div>'+
        (s.errores.length ? '<div class="rule-card-detail" style="color:var(--expense-ink);">'+s.errores.length+' fila'+(s.errores.length===1?'':'s')+' no se pudo leer</div>' : '')+
        '<button class="budget-add-link" data-import-again style="margin-top:14px;">Importar otro archivo</button>'+
        (s.pendientes>0 ? '<button class="save-tx-btn" style="width:100%;margin-top:10px;" data-goto-pendientes>Ir a categorizarlas</button>' : '')+
      '</div>'
    :
      '<div class="card file-drop-card">'+
        ICONS.inbox+
        '<p>Sube un archivo CSV con tus movimientos. Cada fila necesita fecha, descripción del comercio y monto (negativo para gastos, positivo para ingresos).</p>'+
        '<label class="save-tx-btn" style="display:inline-block;cursor:pointer;">Elegir archivo<input type="file" accept=".csv,text/csv" data-csv-file-input style="display:none;"></label>'+
        '<div class="file-format-hint">Formato esperado: <code>fecha,descripcion,monto</code><br>Ej: <code>2026-08-20,Jumbo Ñuñoa,-45000</code></div>'+
      '</div>'
  );
}

/* ---------- reconciliar con la cartola (PDF) ----------
   Lee el PDF de la cartola (cuenta corriente o estado de cuenta de tarjeta de crédito)
   directo en el navegador con pdf.js — el archivo nunca se sube a ningún servidor nuestro.
   Extrae cada movimiento por posición (columna) en vez de solo el orden del texto, porque
   el texto plano de estos PDF no alcanza a distinguir columna de cargo/abono/saldo (todas
   son solo números seguidos). Las coordenadas de las columnas fueron medidas contra
   cartolas reales de Banco Edwards (cuenta corriente y tarjeta Visa/Mastercard) — el mismo
   banco emite ambas con el mismo formato. */
export const RECON_PDFJS_VERSION = '3.11.174';
export const CC_COLS = { fecha:[15,50], detalle:[50,236], sucursal:[236,343], cargo:[343,419], abono:[419,533], saldo:[533,650] };
export const TC_COLS = { lugar:[20,97], fecha:[97,140], codigo:[140,194], detalle:[194,379], monto_op:[379,441], monto_pagar:[441,503], ncuota:[503,534], valor_cuota:[534,650] };

export function ensurePdfJs(){
  if(typeof pdfjsLib === 'undefined') return false;
  if(!pdfjsLib.GlobalWorkerOptions.workerSrc){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+RECON_PDFJS_VERSION+'/pdf.worker.min.js';
  }
  return true;
}

export function parseMontoCLP(s){
  if(!s) return null;
  const neg = /-/.test(s);
  const digits = s.replace(/[^0-9]/g,'');
  if(!digits) return null;
  const v = parseInt(digits,10);
  return neg ? -v : v;
}

export async function extractPdfPagesWords(arrayBuffer, password){
  const params: {data: any; password?: any} = {data: arrayBuffer};
  if(password) params.password = password;
  const pdf = await pdfjsLib.getDocument(params).promise;
  const pages = [];
  for(let p=1; p<=pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({scale:1});
    const content = await page.getTextContent();
    const words = [];
    content.items.forEach(function(it){
      const text = (it.str||'').trim();
      if(!text) return;
      // pdf.js da y en coordenadas PDF (0 = borde INFERIOR de la página) — lo damos vuelta
      // para que "top" crezca hacia abajo, como en cualquier lectura normal de la página.
      words.push({ text: text, x0: it.transform[4], top: viewport.height - it.transform[5] });
    });
    pages.push(words);
  }
  return pages;
}

export function groupRows(words){
  // Agrupa por cercanía (no por una grilla fija) porque en el mismo renglón visual, la
  // columna de la fecha puede quedar 1-2pt más arriba/abajo que la del detalle o el monto
  // (distinta línea base de fuente) — una grilla fija de redondeo los partía en dos filas
  // distintas justo en el límite del redondeo.
  const TOL = 4;
  const sorted = words.slice().sort(function(a,b){ return a.top-b.top; });
  const rows = [];
  sorted.forEach(function(w){
    let row = null;
    for(let i=rows.length-1;i>=0;i--){
      if(Math.abs(rows[i].top - w.top) <= TOL){ row = rows[i]; break; }
      if(rows[i].top < w.top - TOL) break; // ya no hay filas más cercanas posibles
    }
    if(!row){ row = {top:w.top, items:[]}; rows.push(row); }
    row.items.push(w);
    row.top = (row.top*(row.items.length-1) + w.top)/row.items.length;
  });
  rows.sort(function(a,b){ return a.top-b.top; });
  return rows.map(function(r){ return r.items.slice().sort(function(a,b){ return a.x0-b.x0; }); });
}

export function bucketColumn(x0, cols){
  for(const name in cols){
    const r = cols[name];
    if(x0 >= r[0] && x0 < r[1]) return name;
  }
  return null;
}

// Devuelve un objeto plano con una clave de texto por cada columna de "cols" (ej. fecha,
// detalle, cargo, abono para CC_COLS) -- Record<string,string> porque las claves son
// dinámicas (dependen de qué "cols" se le pase: CC_COLS o TC_COLS), pero el valor de cada una
// siempre termina siendo el texto de esa columna ya unido y recortado.
export function bucketizeRow(row, cols): Record<string, string> {
  const out: Record<string, string[]> = {};
  Object.keys(cols).forEach(function(k){ out[k] = []; });
  row.forEach(function(w){
    const b = bucketColumn(w.x0, cols);
    if(b) out[b].push(w.text);
  });
  const flat: Record<string, string> = {};
  Object.keys(out).forEach(function(k){ flat[k] = out[k].join(' ').trim(); });
  return flat;
}

export function detectarTipoCartola(pagesWords){
  const t = (pagesWords[0]||[]).map(function(w){ return w.text; }).join(' ').toUpperCase();
  if(t.indexOf('TARJETA DE CR') !== -1 && t.indexOf('NACIONAL') !== -1) return 'tarjeta_nacional';
  if(t.indexOf('CUENTA CORRIENTE') !== -1) return 'cuenta_corriente';
  return null;
}

// De la primera página saca la fecha "HASTA" del período (contexto de año/mes), porque las
// filas de la cuenta corriente solo traen día/mes, sin año.
export function contextoAnioCuentaCorriente(pagesWords){
  const t = (pagesWords[0]||[]).map(function(w){ return w.text; }).join(' ');
  const fechas = t.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  if(!fechas.length) return {year: new Date().getFullYear(), month: new Date().getMonth()+1};
  // la última fecha DD/MM/AAAA que aparece en el encabezado es la fecha "HASTA"
  const ultima = fechas[fechas.length-1];
  const [dd,mm,yyyy] = ultima.split('/').map(Number);
  return {year: yyyy, month: mm};
}
export function fechaConContexto(ddmm, ctx){
  const m = ddmm.match(/^(\d{2})\/(\d{2})$/);
  if(!m) return null;
  const dd = m[1], mm = parseInt(m[2],10);
  const year = (mm <= ctx.month) ? ctx.year : (ctx.year-1);
  return year+'-'+String(mm).padStart(2,'0')+'-'+dd;
}

export function parseCuentaCorrienteMovs(pagesWords){
  const ctx = contextoAnioCuentaCorriente(pagesWords);
  const merged = [];
  pagesWords.forEach(function(words){
    const rows = groupRows(words).map(function(r){ return bucketizeRow(r, CC_COLS); });
    let i=0;
    while(i<rows.length){
      const r = rows[i];
      if(/^\d{2}\/\d{2}$/.test(r.fecha)){
        // normalmente fecha+detalle+monto ya vienen juntos en la misma fila agrupada; solo
        // si esta fila viene "pelada" (sin detalle ni montos) se completa con la siguiente
        if(r.detalle && (r.cargo || r.abono)){
          merged.push({ fecha:r.fecha, detalle:r.detalle, cargo:r.cargo, abono:r.abono });
          i += 1;
        } else {
          const nxt = rows[i+1] || {detalle:'',sucursal:'',cargo:'',abono:'',saldo:''};
          const detalle = (r.detalle+' '+nxt.detalle).replace(/\s+/g,' ').trim();
          merged.push({ fecha: r.fecha, detalle: detalle, cargo: r.cargo||nxt.cargo, abono: r.abono||nxt.abono });
          i += 2;
        }
      } else {
        i += 1;
      }
    }
  });
  const movimientos = [];
  merged.forEach(function(r){
    const fechaISO = fechaConContexto(r.fecha, ctx);
    if(!fechaISO) return;
    const cargo = parseMontoCLP(r.cargo);
    const abono = parseMontoCLP(r.abono);
    if(cargo===null && abono===null) return; // fila sin montos (saldo inicial/final, ruido)
    const detalleUpper = r.detalle.toUpperCase();
    let esEspecial = null;
    if(/SUELDO/.test(detalleUpper)) esEspecial = 'sueldo';
    else if(/CARGO POR PAGO TC|PAGO TARJETA DE CREDITO|PAGO TARJETA DE CR/.test(detalleUpper)) esEspecial = 'pago_tarjeta';
    const contraparte = r.detalle.match(/(?:DE|A)\s*:\s*(.+?)(?:\s+(?:INTERNET|CENTRAL))?$/i);
    const comercioSugerido = contraparte ? contraparte[1].trim() : r.detalle.replace(/\s+(INTERNET|CENTRAL)$/i,'').trim();
    movimientos.push({
      fecha: fechaISO,
      detalle: r.detalle,
      comercioSugerido: comercioSugerido || r.detalle,
      monto: abono!==null ? abono : -Math.abs(cargo),
      tipoMov: abono!==null ? 'ingreso' : 'gasto',
      esEspecial: esEspecial
    });
  });
  return movimientos;
}

export function parseTarjetaNacionalMovs(pagesWords){
  const merged = [];
  pagesWords.forEach(function(words){
    const rows = groupRows(words).map(function(r){ return bucketizeRow(r, TC_COLS); });
    rows.forEach(function(r){
      if(/^\d{2}\/\d{2}\/\d{2}$/.test(r.fecha) && /\$/.test(r.monto_op)) merged.push(r);
    });
  });
  const movimientos = [];
  merged.forEach(function(r){
    const [dd,mm,yy] = r.fecha.split('/');
    const fechaISO = '20'+yy+'-'+mm+'-'+dd;
    const monto = parseMontoCLP(r.monto_op);
    if(monto===null) return;
    // A veces pdf.js entrega el nombre del comercio pegado al código de operación en un solo
    // texto (p.ej. "270711605897 VIRTUAL*RECAUDACION"), que arranca dentro de la columna
    // "codigo" aunque se extienda visualmente hacia "detalle" — así que sacamos el código
    // numérico del inicio y usamos el resto como parte del detalle/comercio.
    const codigoSinNumero = r.codigo.replace(/^\d{6,}\s*/, '').trim();
    const detalleCompleto = (codigoSinNumero+' '+r.detalle).replace(/\s+/g,' ').trim();
    const filaCompleta = (r.codigo+' '+r.detalle).toUpperCase();
    let esEspecial = null;
    if(/MONTO CANCELADO/.test(filaCompleta)) esEspecial = 'pago_recibido'; // pago hecho a la tarjeta, no una compra
    movimientos.push({
      fecha: fechaISO,
      detalle: detalleCompleto,
      comercioSugerido: detalleCompleto,
      monto: monto<0 ? monto : -Math.abs(monto), // en la cartola de tarjeta, toda compra es un gasto
      tipoMov: 'gasto',
      esEspecial: esEspecial
    });
  });
  return movimientos;
}

export async function parseCartolaPDF(arrayBuffer, password){
  if(!ensurePdfJs()) throw new Error('No se pudo cargar el lector de PDF (revisa tu conexión a internet).');
  let pagesWords;
  try{
    pagesWords = await extractPdfPagesWords(arrayBuffer, password);
  }catch(err){
    // pdf.js lanza este código cuando el PDF tiene clave y falta o está mala — un mensaje
    // más claro que el genérico de la librería.
    if(err && err.name==='PasswordException') throw new Error('PDF_PASSWORD_REQUERIDA');
    throw err;
  }
  const tipo = detectarTipoCartola(pagesWords);
  if(tipo==='cuenta_corriente') return {tipo, movimientos: parseCuentaCorrienteMovs(pagesWords)};
  if(tipo==='tarjeta_nacional') return {tipo, movimientos: parseTarjetaNacionalMovs(pagesWords)};
  return {tipo:null, movimientos:[]};
}

// ---- Cartolas capturadas por correo (Menú > "Reconciliar con la cartola") ----
// Convierte el bytea que devuelve Supabase (texto hexadecimal tipo "\\x2550..." o, según el
// cliente, ya un array de bytes) al ArrayBuffer que pdf.js necesita.
export function pgBytesToArrayBuffer(val){
  if(val instanceof ArrayBuffer) return val;
  if(Array.isArray(val)) return new Uint8Array(val).buffer;
  let hex = String(val||'');
  if(hex.slice(0,2)==='\\x') hex = hex.slice(2);
  const bytes = new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++) bytes[i] = parseInt(hex.substr(i*2,2),16);
  return bytes.buffer;
}

export async function cargarCartolasDisponibles(){
  if(!sb || !currentHouseholdId) return;
  try{
    const { data, error } = await sb.from('cartolas_importadas')
      .select('id,tipo,nombre_archivo,recibido_en')
      .eq('household_id', currentHouseholdId)
      .eq('procesado', false)
      .order('recibido_en', {ascending:false});
    if(error) throw error;
    state.reconciliar.disponibles = data || [];
  }catch(err){
    console.error('Pitucas sin lucas — error cargando cartolas por correo:', err);
    state.reconciliar.disponibles = [];
  }
  if(state.menuSection==='reconciliar') renderMenuView();
}

export async function usarCartolaImportada(id, password){
  const item = state.reconciliar.disponibles.find(function(d){ return d.id===id; });
  if(!item) return;
  state.reconciliar.cargando = true;
  state.reconciliar.errorPassword = null;
  renderMenuView();
  try{
    const { data, error } = await sb.from('cartolas_importadas').select('contenido').eq('id', id).single();
    if(error) throw error;
    const buf = pgBytesToArrayBuffer(data.contenido);
    const res = await parseCartolaPDF(buf, password);
    state.reconciliar.cargando = false;
    if(!res.tipo){
      state.reconciliar.error = 'No reconocí el formato de este PDF — pruébalo subiéndolo a mano para revisar.';
      renderMenuView();
      return;
    }
    state.reconciliar.archivo = item.nombre_archivo || (item.tipo==='cuenta_corriente' ? 'Cartola cuenta corriente' : 'Estado de cuenta tarjeta');
    res.movimientos.forEach(function(m){ m.__match = buscarTxParecida(m); });
    state.reconciliar.tipo = res.tipo;
    state.reconciliar.movimientos = res.movimientos;
    state.reconciliar.usandoId = null;
    renderMenuView();
    // Se marca "procesada" en segundo plano — si esto fallara, en el peor caso te la vuelve
    // a ofrecer el próximo mes (no hay riesgo de perder nada por marcarla mal).
    sb.from('cartolas_importadas').update({procesado:true}).eq('id', id).then(function(){}, function(){});
  }catch(err){
    state.reconciliar.cargando = false;
    if(err && err.message==='PDF_PASSWORD_REQUERIDA'){
      state.reconciliar.errorPassword = password ? 'Esa clave no abrió el archivo — pruébala de nuevo.' : 'Este PDF pide una clave.';
    } else {
      state.reconciliar.errorPassword = 'No se pudo leer el archivo: '+(err && err.message ? err.message : err);
    }
    renderMenuView();
  }
}

// Cartola elegida a mano con "Elegir archivo PDF" (Menú > Reconciliar). A diferencia de las
// que llegan por correo, acá el archivo nunca sale del navegador — si pide clave, se guarda su
// ArrayBuffer en memoria (nunca la clave) mientras se muestra el mismo tipo de campo que usan
// las cartolas de correo, y se vuelve a intentar leer cuando el usuario aprieta "Abrir".
export async function intentarAbrirArchivoCartola(buffer, nombre, password){
  state.reconciliar.cargando = true;
  state.reconciliar.error = null;
  state.reconciliar.errorPassword = null;
  renderMenuView();
  try{
    // pdf.js toma "posesión" del ArrayBuffer que le pasamos (lo transfiere a su worker interno
    // y lo deja inutilizable después) — por eso siempre le mandamos una COPIA (slice(0)) y
    // guardamos el original intacto en el estado, para poder reintentar con otra clave las
    // veces que haga falta sin volver a pedir el archivo.
    const res = await parseCartolaPDF(buffer.slice(0), password);
    state.reconciliar.cargando = false;
    state.reconciliar.archivoBuffer = null;
    state.reconciliar.archivoNombrePendiente = null;
    if(!res.tipo){
      state.reconciliar.error = 'No reconocí el formato de este PDF — por ahora solo lee cartolas de cuenta corriente y estados de cuenta de tarjeta de crédito de Banco Edwards / Banco de Chile.';
      renderMenuView();
      return;
    }
    state.reconciliar.archivo = nombre;
    res.movimientos.forEach(function(m){ m.__match = buscarTxParecida(m); });
    state.reconciliar.tipo = res.tipo;
    state.reconciliar.movimientos = res.movimientos;
    renderMenuView();
  }catch(err){
    state.reconciliar.cargando = false;
    if(err && err.message==='PDF_PASSWORD_REQUERIDA'){
      state.reconciliar.archivoBuffer = buffer;
      state.reconciliar.archivoNombrePendiente = nombre;
      state.reconciliar.errorPassword = password ? 'Esa clave no abrió el archivo — pruébala de nuevo.' : 'Este PDF pide una clave.';
    } else {
      state.reconciliar.archivoBuffer = null;
      state.reconciliar.archivoNombrePendiente = null;
      state.reconciliar.error = 'No se pudo leer el archivo: '+(err && err.message ? err.message : err);
    }
    renderMenuView();
  }
}

// Busca si ya existe una transacción parecida (misma fecha ±1 día, mismo monto, mismo
// sentido ingreso/gasto) — para no sugerir agregar lo que ya está.
export function buscarTxParecida(mov){
  const montoAbs = Math.abs(mov.monto);
  return TX.find(function(t){
    if(t.tipo !== mov.tipoMov) return false;
    if(Math.abs(t.monto - montoAbs) > 1) return false;
    const d1 = new Date(t.fecha+'T00:00:00'), d2 = new Date(mov.fecha+'T00:00:00');
    const diffDias = Math.abs(d1.getTime()-d2.getTime()) / 86400000;
    return diffDias <= 2;
  }) || null;
}

// La lista de cartolas que ya llegaron solas por correo (todavía sin usar) — cada una con
// un botón para abrirla, que pide la clave del PDF ahí mismo (nunca se guarda esa clave).
export function renderCartolasDisponiblesBlock(){
  const R = state.reconciliar;
  if(!R.disponibles.length) return '';
  const tipoLabel = {cuenta_corriente:'Cartola cuenta corriente', tarjeta_nacional:'Estado de cuenta tarjeta'};
  const filas = R.disponibles.map(function(d){
    const abriendo = R.usandoId===d.id;
    const label = tipoLabel[d.tipo] || d.nombre_archivo || 'Cartola';
    const fechaTxt = dayLabel(d.recibido_en.slice(0,10));
    if(abriendo){
      return '<div class="card" style="padding:14px;margin-bottom:8px;">'+
        '<div style="font-weight:700;font-size:13.5px;margin-bottom:2px;">'+label+'</div>'+
        '<div class="muted" style="font-size:12px;margin-bottom:10px;">Llegó por correo el '+fechaTxt+'</div>'+
        '<input type="password" inputmode="numeric" class="draft-input" data-cartola-password-input placeholder="Clave del PDF (4 últimos dígitos de tu RUT)" value="'+(R.passwordDraft||'')+'">'+
        (R.errorPassword ? '<div class="field-error">'+R.errorPassword+'</div>' : '')+
        '<div style="display:flex;gap:8px;margin-top:10px;">'+
          '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cartola-cancelar>Cancelar</button>'+
          '<button class="save-tx-btn" style="flex:1;" data-cartola-abrir="'+d.id+'">Abrir</button>'+
        '</div>'+
      '</div>';
    }
    return '<div class="card" style="padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">'+
      '<div style="min-width:0;">'+
        '<div style="font-weight:700;font-size:13.5px;">'+label+'</div>'+
        '<div class="muted" style="font-size:12px;">Llegó por correo el '+fechaTxt+'</div>'+
      '</div>'+
      '<button class="chip" data-cartola-usar="'+d.id+'">Usar esta</button>'+
    '</div>';
  }).join('');
  return '<div class="section-title" style="margin-top:0;">Llegaron solas por correo</div>'+filas;
}

export function renderMenuReconciliar(){
  const R = state.reconciliar;
  const head = menuScreenHead('Reconciliar con la cartola');
  if(R.cargando){
    document.getElementById('view-root').innerHTML = head+'<div class="card placeholder-card">'+ICONS.inbox+'<h3>Leyendo tu PDF…</h3></div>';
    return;
  }
  if(R.archivoNombrePendiente){
    document.getElementById('view-root').innerHTML = head+
      '<div class="card" style="padding:14px;">'+
        '<div style="font-weight:700;font-size:13.5px;margin-bottom:2px;">'+R.archivoNombrePendiente+'</div>'+
        '<div class="muted" style="font-size:12px;margin-bottom:10px;">Este PDF está protegido con clave.</div>'+
        '<input type="password" inputmode="numeric" class="draft-input" data-cartola-password-input placeholder="Clave del PDF (4 últimos dígitos de tu RUT)" value="'+(R.passwordDraft||'')+'">'+
        (R.errorPassword ? '<div class="field-error">'+R.errorPassword+'</div>' : '')+
        '<div style="display:flex;gap:8px;margin-top:10px;">'+
          '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-reconciliar-archivo-cancelar>Cancelar</button>'+
          '<button class="save-tx-btn" style="flex:1;" data-reconciliar-archivo-abrir>Abrir</button>'+
        '</div>'+
      '</div>';
    return;
  }
  if(!R.movimientos.length && !R.error){
    document.getElementById('view-root').innerHTML = head+
      renderCartolasDisponiblesBlock()+
      '<div class="card file-drop-card">'+ICONS.inbox+
        '<p>Sube el PDF de tu cuenta corriente o de tu estado de cuenta de tarjeta de crédito. La app compara cada movimiento contra lo que ya tienes registrado — nunca sube el archivo a ningún servidor, se lee acá mismo en tu navegador.</p>'+
        '<label class="save-tx-btn" style="display:inline-block;cursor:pointer;">Elegir archivo PDF<input type="file" accept="application/pdf" data-reconciliar-file-input style="display:none;"></label>'+
      '</div>';
    return;
  }
  if(R.error){
    document.getElementById('view-root').innerHTML = head+
      '<div class="card placeholder-card">'+ICONS.ban+'<h3>No se pudo leer</h3><p>'+R.error+'</p>'+
      '<button class="save-tx-btn" style="margin-top:12px;" data-reconciliar-reset>Probar con otro archivo</button></div>';
    return;
  }
  const normales = R.movimientos.filter(function(m){ return m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido'; });
  const pagosTarjeta = R.movimientos.filter(function(m){ return m.esEspecial==='pago_tarjeta'; });
  const conMatch = normales.filter(function(m){ return !!m.__match; });
  const sinMatch = normales.filter(function(m){ return !m.__match; });

  let resumenTarjeta = '';
  if(pagosTarjeta.length){
    const totalPagos = pagosTarjeta.reduce(function(s,m){ return s+Math.abs(m.monto); },0);
    const ym = R.movimientos[0] ? R.movimientos[0].fecha.slice(0,7) : todayISO().slice(0,7);
    const comprasRegistradas = txsOfMonth(ym).filter(function(t){ return t.tipo==='gasto' && MEDIOS[t.medio] && MEDIOS[t.medio].icon==='card'; }).reduce(function(s,t){ return s+t.monto; },0);
    resumenTarjeta = '<div class="card" style="padding:14px 16px;margin-bottom:14px;">'+
      '<div class="sheet-block-title" style="margin-bottom:6px;">Pago de tarjeta este mes</div>'+
      '<p class="muted" style="margin-bottom:4px;">Se pagó '+money(totalPagos)+' en '+pagosTarjeta.length+' cargo'+(pagosTarjeta.length===1?'':'s')+' de tarjeta de crédito.</p>'+
      '<p class="muted">Tienes '+money(comprasRegistradas)+' en compras con tarjeta registradas este mes — esto es solo referencial, la cartola de tarjeta detalla cada compra por separado.</p>'+
    '</div>';
  }

  function filaHtml(m, idx, yaRegistrada){
    // Cuando todavía no está registrado, además de "+ Agregar" (que la clasifica como
    // gasto/ingreso normal) se ofrece "No es gasto" para movimientos que no deberían contar en
    // las estadísticas -- ej. un traspaso entre sus propias cuentas -- sin tener que agregarla
    // primero y después ir a marcarla desde el detalle.
    const acciones = yaRegistrada
      ? '<span class="tx-state state-cobrado-inline">Ya registrada</span>'
      : '<div style="display:flex;gap:6px;">'+
          '<button class="chip" data-reconciliar-agregar="'+idx+'">+ Agregar</button>'+
          '<button class="chip" style="background:var(--surface-sunken);color:var(--text-secondary);" data-reconciliar-noesgasto="'+idx+'">No es gasto</button>'+
        '</div>';
    return '<div class="card" style="padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">'+
      '<div style="min-width:0;">'+
        '<div style="font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(m.comercioSugerido||m.detalle)+'</div>'+
        '<div class="muted" style="font-size:12px;">'+dayLabel(m.fecha)+(m.esEspecial==='sueldo'?' · Sueldo':'')+'</div>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">'+
        '<span class="tabular" style="font-weight:600;">'+(m.tipoMov==='ingreso'?'+':'')+money(Math.abs(m.monto))+'</span>'+
        acciones+
      '</div>'+
    '</div>';
  }

  const listaHtml = normales.map(function(m, idx){ return filaHtml(m, idx, !!m.__match); }).join('');

  document.getElementById('view-root').innerHTML = head+
    '<div class="card placeholder-card" style="padding:14px;margin-bottom:14px;">'+
      '<p class="muted" style="margin:0;">'+R.archivo+' — '+normales.length+' movimiento'+(normales.length===1?'':'s')+', '+conMatch.length+' ya registrado'+(conMatch.length===1?'':'s')+', '+sinMatch.length+' para revisar.</p>'+
    '</div>'+
    resumenTarjeta+
    (sinMatch.length ? '<button class="budget-add-link" data-reconciliar-agregar-todo style="margin-bottom:10px;">Agregar los '+sinMatch.length+' que faltan</button>' : '')+
    listaHtml+
    '<button class="budget-add-link" data-reconciliar-reset style="margin-top:10px;">Probar con otro archivo</button>';
}

export function crearTxDesdeMovimiento(m, opts?: {noEsGasto?: boolean}){
  opts = opts || {};
  const reglaByComercio = {};
  reglasAgrupadas().forEach(function(r){ reglaByComercio[r.comercio] = r; });
  const regla = reglaByComercio[m.comercioSugerido];
  const catId = m.esEspecial==='sueldo' ? 'sueldo' : (regla && regla.cat ? regla.cat : null);
  // Antes esto era siempre "Cuenta Vista", sin importar de qué cartola venía el movimiento —
  // así, las compras sacadas de tu ESTADO DE CUENTA DE TARJETA (que por definición nunca son
  // en efectivo ni de tu cuenta corriente) quedaban mal etiquetadas. Ahora se elige según la
  // cartola: cuenta corriente → Cuenta Vista; tarjeta de crédito → un medio genérico de
  // tarjeta (ella puede renombrarlo o reasignar la transacción después, desde el detalle).
  const medioId = state.reconciliar.tipo === 'tarjeta_nacional' ? ensureMedioDesconocido() : ensureCuentaVistaMedio();
  // opts.noEsGasto: para movimientos que aparecen en la cartola pero no son ni un gasto ni un
  // ingreso real (ej. un traspaso entre sus propias cuentas) -- mismo estado 'no_es_gasto' que
  // usa el botón "No es gasto" del detalle de una transacción normal, así queda excluido de los
  // totales de gasto/ingreso pero registrado para que no vuelva a aparecer como pendiente.
  TX.unshift({
    id: 'trec'+(nextImportId()), fecha: m.fecha, hora:'00:00', comercio: m.comercioSugerido || m.detalle,
    monto: Math.abs(m.monto), medio: medioId, tipo: m.tipoMov,
    recurrencia: m.esEspecial==='sueldo' ? 'mensual' : 'variable',
    estado: opts.noEsGasto ? 'no_es_gasto' : (catId ? 'confirmado' : 'pendiente'),
    categorias: (!opts.noEsGasto && catId) ? [{cat:catId, monto:Math.abs(m.monto)}] : [],
    porCobrar:[], reglaAuto:false,
    nota: opts.noEsGasto ? 'Agregada al reconciliar con la cartola — marcada como "no es gasto"' : 'Agregada al reconciliar con la cartola'
  });
  ensureMonthExists(m.fecha.slice(0,7));
}

/* ---------- modo demo ---------- */
export function renderMenuDemo(){
  document.getElementById('view-root').innerHTML = menuScreenHead('Modo demo')+
    '<div class="card" style="padding:16px;">'+
      '<div class="menu-item-card" style="padding:0;">'+
        '<span class="menu-item-card-icon" style="--fill:var(--cat-butter-fill);--ink:var(--cat-butter-ink)">'+ICONS.lock+'</span>'+
        '<div class="menu-item-card-body"><div class="menu-item-card-name">Ocultar montos reales</div><div class="menu-item-card-sub">Útil para mostrar la app en público sin revelar tus números</div></div>'+
        '<button class="switch '+(state.demoMode?'on':'')+'" data-toggle-demo aria-label="Activar modo demo" aria-pressed="'+(state.demoMode?'true':'false')+'"></button>'+
      '</div>'+
      '<div class="platform-hint muted" style="margin-top:14px;">Cuando está activado, los montos se reemplazan por "$••••••" en pantallas, tarjetas y gráficos. Los formularios donde tú editas un monto siguen mostrando el número real mientras los completas.</div>'+
    '</div>';
}

/* ---------- asesoría (Próximamente) ---------- */
export function renderMenuAsesoria(){
  document.getElementById('view-root').innerHTML = menuScreenHead('Asesoría financiera con Claude')+
    '<div class="card placeholder-card">'+ICONS.sparkle+'<h3>Próximamente</h3>'+
    '<p>La idea es conectar un asistente con acceso a tus transacciones, presupuestos y metas de inversión, para que puedas preguntarle directamente sobre tu plata — por ejemplo "¿en qué categoría me estoy pasando este mes?" o "¿cómo voy con la meta del pie del depto?".</p>'+
    '<p class="muted" style="margin-top:10px;">Todavía no está disponible en esta maqueta.</p>'+
    '</div>';
}

/* ---------- mi cuenta (sesión) ---------- */
export function datosTransferenciaCompletos(){
  const d = DATOS_TRANSFERENCIA;
  return !!(d.nombre || d.rut || d.banco || d.tipoCuenta || d.numeroCuenta || d.email);
}
export function renderDatosTransferenciaCard(){
  const d = DATOS_TRANSFERENCIA;
  if(state.editingDatosTransferencia){
    const dr = state.datosTransferenciaDraft;
    return '<div class="card" style="padding:16px;margin-top:14px;">'+
      '<div class="budget-total-label">Datos de transferencia</div>'+
      '<p class="cat-picker-hint" style="margin:6px 0 10px;">Se usan solo para armar el texto que copias al pedir un cobro pendiente — no se comparten con nadie más.</p>'+
      '<label class="draft-label">Nombre</label>'+
      '<input type="text" class="draft-input" data-datos-transferencia-input="nombre" value="'+dr.nombre+'" placeholder="Nombre completo">'+
      '<label class="draft-label" style="margin-top:10px;">RUT</label>'+
      '<input type="text" class="draft-input" data-datos-transferencia-input="rut" value="'+dr.rut+'" placeholder="12.345.678-9">'+
      '<label class="draft-label" style="margin-top:10px;">Banco</label>'+
      '<input type="text" class="draft-input" data-datos-transferencia-input="banco" value="'+dr.banco+'" placeholder="Ej: Banco Estado">'+
      '<label class="draft-label" style="margin-top:10px;">Tipo de cuenta</label>'+
      '<input type="text" class="draft-input" data-datos-transferencia-input="tipoCuenta" value="'+dr.tipoCuenta+'" placeholder="Cuenta RUT, Vista, Corriente…">'+
      '<label class="draft-label" style="margin-top:10px;">Número de cuenta</label>'+
      '<input type="text" class="draft-input" data-datos-transferencia-input="numeroCuenta" value="'+dr.numeroCuenta+'" placeholder="0000000000">'+
      '<label class="draft-label" style="margin-top:10px;">Email (opcional)</label>'+
      '<input type="text" class="draft-input" data-datos-transferencia-input="email" value="'+dr.email+'" placeholder="tucorreo@ejemplo.cl">'+
      '<div style="display:flex;gap:10px;margin-top:14px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-datos-transferencia>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-save-datos-transferencia>Guardar</button>'+
      '</div>'+
    '</div>';
  }
  const completos = datosTransferenciaCompletos();
  return '<div class="card" style="padding:16px;margin-top:14px;">'+
    '<div class="budget-total-head">'+
      '<span class="budget-total-label">Datos de transferencia</span>'+
      '<button class="budget-edit-btn" data-edit-datos-transferencia aria-label="Editar datos de transferencia">'+ICONS.edit+'</button>'+
    '</div>'+
    (completos
      ? '<div class="datos-transferencia-figs">'+
          (d.nombre ? '<div>'+d.nombre+'</div>' : '')+
          (d.rut ? '<div>RUT '+d.rut+'</div>' : '')+
          ((d.banco||d.tipoCuenta) ? '<div>'+[d.banco,d.tipoCuenta].filter(Boolean).join(' · ')+'</div>' : '')+
          (d.numeroCuenta ? '<div>Cuenta '+d.numeroCuenta+'</div>' : '')+
          (d.email ? '<div>'+d.email+'</div>' : '')+
        '</div>'
      : '<p class="cat-picker-hint" style="margin:6px 0 0;">Agrégalos para poder copiar, listo para pegar en WhatsApp, un cobro pendiente junto con cómo te pueden transferir.</p>')+
  '</div>';
}
export function renderMenuCuenta(){
  const email = currentUser ? currentUser.email : '—';
  document.getElementById('view-root').innerHTML = menuScreenHead('Mi cuenta')+
    '<div class="card menu-item-card" style="padding:16px;">'+
      '<span class="menu-item-card-icon" style="--fill:var(--accent-soft);--ink:var(--accent-ink)">'+ICONS.lockSmall+'</span>'+
      '<div class="menu-item-card-body"><div class="menu-item-card-name">'+email+'</div><div class="menu-item-card-sub">Tus datos están protegidos: solo tú (o quien invites más adelante a tu hogar) puede verlos.</div></div>'+
    '</div>'+
    renderDatosTransferenciaCard()+
    '<button class="budget-delete-link" style="margin-top:14px;" data-auth-logout>Cerrar sesión</button>';
}
// Texto listo para pegar en WhatsApp con los cobros pendientes (tipo "persona", sin pagar)
// de una transacción, más tus datos de transferencia si ya los configuraste en Mi cuenta.
// Los reembolsos (isapre, seguro, etc.) no entran acá — eso es plata que TE deben a ti desde
// una institución, no algo que le mandas a un grupo de WhatsApp para que te transfieran.
export function buildCobroWhatsAppText(t){
  const pendientes = (t.porCobrar||[]).filter(p=>p.tipo==='persona' && !p.pagado);
  if(pendientes.length===0) return null;
  const lines = ['Pendiente de pago'];
  pendientes.forEach(p=>{ lines.push((p.persona||'Sin nombre')+' '+fmt.format(Math.round(p.monto||0))); });
  const d = DATOS_TRANSFERENCIA;
  const datosLines = [];
  if(d.nombre) datosLines.push(d.nombre);
  if(d.banco || d.tipoCuenta) datosLines.push([d.banco,d.tipoCuenta].filter(Boolean).join(' · '));
  if(d.numeroCuenta) datosLines.push('Cuenta '+d.numeroCuenta);
  if(d.rut) datosLines.push('RUT '+d.rut);
  if(d.email) datosLines.push(d.email);
  if(datosLines.length){
    lines.push('');
    lines.push('Datos transferencia');
    datosLines.forEach(l=>lines.push(l));
  }
  return lines.join('\n');
}

/* ---------- importar desde tu correo (Gmail + Apps Script) ---------- */
export async function loadImportCorreoScreen(){
  if(!sb || !currentHouseholdId){
    state.importCorreoLoading = false;
    state.importCorreoError = 'No hay conexión con el servidor todavía.';
    renderMenuView();
    return;
  }
  try{
    const { data: hh, error: hhErr } = await sb.from('households').select('import_token').eq('id', currentHouseholdId).single();
    if(hhErr) throw hhErr;
    state.importToken = hh ? hh.import_token : null;
    state.importCorreoLoaded = true;
  }catch(err){
    console.error('Pitucas sin lucas — error cargando importación por correo:', err);
    state.importCorreoError = translateAuthError(err);
  }
  state.importCorreoLoading = false;
  renderMenuView();
}

export function guessMedioIdFromSuggestion(sug){
  if(!sug) return null;
  const m = String(sug).match(/(\d{4})\D*$/);
  if(!m) return null;
  const last4 = m[1];
  const found = Object.keys(MEDIOS).find(function(id){ return (MEDIOS[id].corto||'').indexOf(last4)>=0; });
  return found || null;
}
// El correo del banco ya trae los últimos 4 dígitos de la tarjeta usada (ej. "****0507") —
// si ya existe un medio de pago con esos dígitos, se usa ese. Si no, en vez de caer en
// "Efectivo" (que queda mal y obliga a corregir cada transacción a mano), se crea solo un
// medio nuevo con esos dígitos, para que la tarjeta "aparezca" automáticamente. Después,
// desde Menú > Medios de pago, ella puede renombrarlo (ej. "Visa BCH" en vez de "Tarjeta
// ****0507") sin perder el vínculo con las transacciones ya asignadas a ese medio.
export function ensureMedioForSugerido(sug){
  // Algunas reglas del script de correo saben que el movimiento salió de la cuenta corriente
  // (una transferencia, una compra de Racional) aunque no haya ningún número de tarjeta que
  // leer — en esos casos mandan el texto literal 'cuenta_vista' en vez de "****NNNN".
  if(sug==='cuenta_vista') return ensureCuentaVistaMedio();
  const existing = guessMedioIdFromSuggestion(sug);
  if(existing) return existing;
  if(!sug) return null;
  const m = String(sug).match(/(\d{4})\D*$/);
  if(!m) return null;
  const last4 = m[1];
  const id = 'tarjeta_'+last4;
  if(!MEDIOS[id]){
    MEDIOS[id] = { nombre: 'Tarjeta •••• '+last4, corto: '•••• '+last4, icon: 'card' };
  }
  return id;
}
// Medios "genéricos" para cuando SABEMOS que una transacción no fue en efectivo (llegó de
// un correo bancario, o de una cartola/estado de cuenta) pero no logramos identificar cuál
// tarjeta o cuenta específica — antes, en esos casos, se caía en el primer medio de la lista
// (que en una cuenta nueva es literalmente "Efectivo"), mostrando compras con tarjeta como si
// hubieran sido en efectivo. Mejor mostrar honestamente "sin identificar" y que ella lo
// corrija a mano si quiere, que inventar un medio que no corresponde.
export function ensureCuentaVistaMedio(){
  const id = 'cuenta_vista';
  if(!MEDIOS[id]){ MEDIOS[id] = {nombre:'Cuenta Vista', corto:'Cta. Vista', icon:'bank'}; }
  return id;
}
export function ensureMedioDesconocido(){
  const id = 'medio_desconocido';
  if(!MEDIOS[id]){ MEDIOS[id] = {nombre:'Medio sin identificar', corto:'Sin identificar', icon:'card'}; }
  return id;
}
export function guessCatIdFromImportRow(row){
  if(row.tipo!=='inversion') return null; // gasto/ingreso: que ella elija, igual que en la importación CSV
  const f = (row.fuente||'').toLowerCase();
  const candidatos = ['racional','fintual','banco_chile','buda'];
  return candidatos.find(function(id){ return CATS[id] && f.indexOf(id.replace('_',''))>=0; }) || null;
}

// Antes, lo que el script de Google encontraba en el correo quedaba en una bandeja aparte
// ("Importar desde tu correo") esperando que ella la aprobara una por una. Ahora se agregan
// directo a Transacciones, marcadas como "pendiente" (sin categoría) igual que cualquier
// otra transacción sin clasificar — así las revisa en el mismo lugar donde ya revisa todo
// lo demás, en vez de tener que acordarse de visitar una pantalla aparte.
// Arma la transacción que resulta de una fila importada por correo -- separado de
// absorbImportedRows para poder testearlo sin necesitar una conexión real a Supabase.
// Antes esto solo intentaba adivinar la categoría para inversiones (guessCatIdFromImportRow)
// y dejaba SIEMPRE pendiente cualquier gasto/ingreso importado, aunque ya existiera una regla
// de clasificación para ese mismo comercio (ej. "Copec Providencia" -> Transporte) — la
// importación por CSV de cartola sí las usaba (ver importCartolaRows), esta no. Ahora consulta
// las mismas reglas, para que se comporte igual sin importar de dónde vino la transacción.
export function txDesdeImportEmail(row): Transaccion {
  const reglaByComercio = {};
  reglasAgrupadas().forEach(function(r){ reglaByComercio[r.comercio] = r; });
  const regla = reglaByComercio[row.comercio];
  const catId = (regla && regla.cat) ? regla.cat : guessCatIdFromImportRow(row);
  const medioId = ensureMedioForSugerido(row.medio_sugerido) || ensureMedioDesconocido();
  return {
    id: 'temail'+(nextImportId()), fecha: row.fecha, hora: row.hora || '00:00', comercio: row.comercio,
    monto: Math.round(row.monto), medio: medioId, tipo: row.tipo,
    recurrencia: regla ? regla.recurrencia : 'variable',
    estado: catId ? 'confirmado' : 'pendiente',
    categorias: catId ? [{cat:catId, monto:Math.round(row.monto)}] : [],
    porCobrar:[], reglaAuto: !!(regla && regla.cat), nota:'Importado automáticamente desde tu correo',
    importadoEmail:true
  };
}
export async function absorbImportedRows(){
  if(!sb || !currentHouseholdId) return;
  try{
    const { data: rows, error } = await sb.from('transacciones_importadas').select('*')
      .eq('household_id', currentHouseholdId).eq('procesado', false).order('fecha', {ascending:true});
    if(error) throw error;
    if(!rows || !rows.length) return;
    rows.forEach(function(row){
      TX.unshift(txDesdeImportEmail(row));
      ensureMonthExists(row.fecha.slice(0,7));
    });
    render();
    toast(rows.length===1 ? 'Se agregó 1 transacción desde tu correo' : 'Se agregaron '+rows.length+' transacciones desde tu correo');
    const ids = rows.map(function(r){ return r.id; });
    await sb.from('transacciones_importadas').update({procesado:true}).in('id', ids);
  }catch(err){
    console.error('Pitucas sin lucas — error agregando transacciones importadas:', err);
  }
}

/* ---------- Gastos compartidos: sincronización con Supabase ----------
   Estas tablas NUNCA viajan en app_state (ver supabase/schema_gastos_compartidos.sql) — se
   leen/escriben directo, y "mi parte" de un gasto que registró otra persona se recalcula acá
   mismo cada vez (sincronizarGastosCompartidos), nunca se persiste. */
export function ensureMedioGrupoCompartido(){
  const id = 'grupo_compartido';
  if(!MEDIOS[id]){ MEDIOS[id] = {nombre:'Gasto de grupo', corto:'Grupo', icon:'users'}; }
  return id;
}
// El participante (con cuenta) que corresponde a este user_id dentro de este grupo, o null
// si ese usuario no es miembro (no debería pasar si las tablas están consistentes, pero un
// gasto de un grupo del que ya no soy miembro no debe romper la app).
export function participanteIdDeUsuario(grupoId, userId){
  const p = GRUPO_PARTICIPANTES.find(x=>x.grupo_id===grupoId && x.user_id===userId);
  return p ? p.id : null;
}

// Recalcula, desde GASTOS_COMPARTIDOS/GRUPO_PARTICIPANTES/MAPEO_CATEGORIAS ya cargados en
// memoria, las entradas "mi parte" (compartidoAjeno) de gastos que pagó y registró alguien
// más del grupo. Pura respecto a la red: no llama a Supabase, solo lee/escribe TX — por eso
// se puede probar con datos de prueba inyectados directo (ver audit_gastos_compartidos.js).
// Se llama después de cargarGastosCompartidos() y de nuevo cada vez que llega un cambio en
// vivo (realtime) — nunca hace falta llamarla "para deshacer" algo: siempre parte borrando
// las entradas viejas y las vuelve a construir todas desde cero.
export function sincronizarGastosCompartidos(){
  // Muta TX en el lugar (splice), nunca lo reasigna -- TX se expone en window.__debug (y en
  // cualquier otro lugar que haya guardado una referencia al arreglo) como el arreglo mismo,
  // no como una copia recalculada cada vez; reasignarlo acá dejaría esas referencias viejas
  // apuntando a un arreglo que ya no es el real.
  for(let i=TX.length-1;i>=0;i--){ if(TX[i].compartidoAjeno) TX.splice(i,1); }
  if(!currentUser) return;
  GASTOS_COMPARTIDOS.forEach(g=>{
    const miParticipanteId = participanteIdDeUsuario(g.grupo_id, currentUser.id);
    if(!miParticipanteId) return;                    // ya no soy miembro de ese grupo
    if(g.pagado_por===miParticipanteId) return;       // pagué yo: mi parte ya está en MI transacción real (porCobrar)
    const miReparto = (g.reparto||[]).find(r=>r.participante_id===miParticipanteId);
    if(!miReparto || miReparto.monto<=0) return;       // no me toca nada de este gasto

    const registradorParticipanteId = participanteIdDeUsuario(g.grupo_id, g.registrado_por);
    const mapeo = registradorParticipanteId ? MAPEO_CATEGORIAS.find(m=>
      m.user_id===currentUser.id && m.de_participante===registradorParticipanteId && m.categoria_ajena===g.categoria_origen
    ) : null;

    const pagador = GRUPO_PARTICIPANTES.find(p=>p.id===g.pagado_por);
    const grupo = GRUPOS.find(gr=>gr.id===g.grupo_id);
    const tx: Transaccion = {
      id: 'compartido-'+g.id,
      fecha: g.fecha, hora:'12:00',
      comercio: g.descripcion,
      monto: Math.round(miReparto.monto),
      medio: ensureMedioGrupoCompartido(),
      tipo:'gasto', recurrencia:'variable',
      estado: mapeo ? 'confirmado' : 'pendiente',
      categorias: mapeo ? [{cat: mapeo.categoria_propia, monto: Math.round(miReparto.monto)}] : [],
      porCobrar: [], reglaAuto:false,
      nota: 'Tu parte de "'+g.descripcion+'"'+(pagador?' — pagó '+pagador.nombre:'')+(grupo?' · grupo '+grupo.nombre:''),
      grupoId: g.grupo_id, gastoCompartidoId: g.id, compartidoAjeno:true,
      categoriaOrigenSugerida: mapeo ? null : (g.categoria_origen||null)
    };
    TX.push(tx);
    ensureMonthExists(tx.fecha.slice(0,7));
  });
}

// Clasificar a mano una entrada compartidoAjeno sin categoría — además de ponerle la
// categoría a ESTA transacción, aprende el mapeo para que los próximos gastos de la MISMA
// persona con esa MISMA categoría de origen se clasifiquen solos la próxima vez que se
// recalculen (sincronizarGastosCompartidos). No crea categorías nuevas nunca.
export async function clasificarGastoCompartidoAjeno(txId, catId){
  const tx = getTx(txId);
  if(!tx || !tx.compartidoAjeno || !tx.gastoCompartidoId) return false;
  const g = GASTOS_COMPARTIDOS.find(x=>x.id===tx.gastoCompartidoId);
  tx.categorias = [{cat:catId, monto:tx.monto}];
  tx.estado = 'confirmado';
  tx.categoriaOrigenSugerida = null;
  if(g && currentUser){
    const registradorParticipanteId = participanteIdDeUsuario(g.grupo_id, g.registrado_por);
    if(registradorParticipanteId && g.categoria_origen){
      // El mapeo local se actualiza SIEMPRE (de eso depende que sincronizarGastosCompartidos
      // clasifique solos los próximos gastos, sin depender de que la escritura remota logre
      // conectarse) — sb solo decide si además se intenta guardar en Supabase para la próxima
      // sesión; si falla o no hay conexión, el mapeo de esta sesión sigue funcionando igual.
      setMAPEO_CATEGORIAS(MAPEO_CATEGORIAS.filter(m=>!(m.user_id===currentUser.id && m.de_participante===registradorParticipanteId && m.categoria_ajena===g.categoria_origen)));
      const nuevo = {user_id:currentUser.id, de_participante:registradorParticipanteId, categoria_ajena:g.categoria_origen, categoria_propia:catId};
      MAPEO_CATEGORIAS.push(nuevo as MapeoCategoria);
      if(sb){
        try{
          await sb.from('mapeo_categorias').upsert(nuevo, {onConflict:'user_id,de_participante,categoria_ajena'});
        }catch(err){ console.error('Pitucas sin lucas — error guardando el mapeo de categorías:', err); }
      }
    }
  }
  return true;
}

// Trae todo lo de gastos compartidos de una vez (grupos donde soy miembro, sus participantes,
// sus gastos + reparto, los saldos ya registrados, y mi propio mapeo de categorías) y recalcula
// "mi parte". Se llama después de cargar la sesión y de nuevo cuando llega un cambio en vivo.
export async function cargarGastosCompartidos(){
  if(!sb || !currentUser) return;
  try{
    const [{data:grupos, error:eG}, {data:saldos, error:eS}, {data:mapeo, error:eM}] = await Promise.all([
      sb.from('grupos').select('*'),
      sb.from('saldos_pagados').select('*'),
      sb.from('mapeo_categorias').select('*').eq('user_id', currentUser.id)
    ]);
    if(eG) throw eG; if(eS) throw eS; if(eM) throw eM;
    setGRUPOS(grupos||[]); setSALDOS_PAGADOS(saldos||[]); setMAPEO_CATEGORIAS(mapeo||[]);
    const grupoIds = GRUPOS.map(g=>g.id);
    if(!grupoIds.length){ setGRUPO_PARTICIPANTES([]); setGASTOS_COMPARTIDOS([]); sincronizarGastosCompartidos(); return; }

    const { data:participantes, error:eP } = await sb.from('grupo_participantes').select('*').in('grupo_id', grupoIds);
    if(eP) throw eP;
    setGRUPO_PARTICIPANTES(participantes||[]);

    const { data:gastos, error:eGA } = await sb.from('gastos_compartidos').select('*, gasto_reparto(*)').in('grupo_id', grupoIds).order('fecha', {ascending:false});
    if(eGA) throw eGA;
    setGASTOS_COMPARTIDOS((gastos||[]).map(g=>Object.assign({}, g, {reparto: g.gasto_reparto||[]})));

    sincronizarGastosCompartidos();
    render();
  }catch(err){
    console.error('Pitucas sin lucas — error cargando gastos compartidos:', err);
  }
}

// Realtime: cualquier cambio hecho por CUALQUIER miembro de un grupo (crear/editar/borrar un
// gasto, agregar un participante, saldar cuentas) recarga y recalcula para todos los demás,
// sin que tengan que salir y volver a entrar a la app.
export let gruposRealtimeChannel = null;
// supabase.ts lo limpia a null al cerrar sesión (resetToLoggedOutState) -- ver la nota de
// setters en state.ts.
export function setGruposRealtimeChannel(v){ gruposRealtimeChannel = v; }
export function suscribirseAGruposEnVivo(){
  if(!sb || gruposRealtimeChannel) return;
  gruposRealtimeChannel = sb.channel('gastos-compartidos')
    .on('postgres_changes', {event:'*', schema:'public', table:'grupos'}, cargarGastosCompartidos)
    .on('postgres_changes', {event:'*', schema:'public', table:'grupo_participantes'}, cargarGastosCompartidos)
    .on('postgres_changes', {event:'*', schema:'public', table:'gastos_compartidos'}, cargarGastosCompartidos)
    .on('postgres_changes', {event:'*', schema:'public', table:'gasto_reparto'}, cargarGastosCompartidos)
    .on('postgres_changes', {event:'*', schema:'public', table:'saldos_pagados'}, cargarGastosCompartidos)
    .subscribe();
}

export async function crearGrupo(nombre, icono){
  if(!sb || !currentUser) return {data:null, error:null};
  const { data, error } = await sb.from('grupos').insert({nombre, icono: icono||'👥', creado_por: currentUser.id}).select().single();
  if(error){ console.error('Pitucas sin lucas — error creando grupo:', error); return {data:null, error}; }
  await cargarGastosCompartidos();
  return {data, error:null};
}

export async function eliminarGrupo(grupoId){
  if(!sb) return false;
  const { error } = await sb.from('grupos').delete().eq('id', grupoId);
  if(error){ console.error('Pitucas sin lucas — error eliminando grupo:', error); return false; }
  await cargarGastosCompartidos();
  return true;
}

export async function unirseAGrupo(inviteCode, nombre){
  if(!sb) return false;
  const { error } = await sb.rpc('unirse_a_grupo', {p_invite_code:inviteCode, p_nombre:nombre});
  if(error){ console.error('Pitucas sin lucas — error uniéndose al grupo:', error); return false; }
  await cargarGastosCompartidos();
  return true;
}

export async function agregarParticipanteSinCuenta(grupoId, nombre, color){
  if(!sb) return null;
  const { data, error } = await sb.from('grupo_participantes').insert({grupo_id:grupoId, nombre, color: color||'mint'}).select().single();
  if(error){ console.error('Pitucas sin lucas — error agregando participante:', error); return null; }
  await cargarGastosCompartidos();
  return data;
}

// Crea el gasto compartido + su reparto, y arma localmente la transacción de quien registra
// (tx_origen): si pagó ella, es una transacción normal con porCobrar netiando la parte de
// los demás (igual que un split de amigos de siempre); si pagó otra persona, es solo un
// recibo (estado 'no_es_gasto') que no afecta su presupuesto — su propia parte, si le toca,
// le llega igual que a cualquiera vía sincronizarGastosCompartidos.
export async function crearGastoCompartido(opts){
  // opts: {grupoId, descripcion, categoriaOrigen, monto, fecha, pagadoPorId, divisionTipo, reparto: {participanteId: monto}, medio}
  if(!sb || !currentUser) return null;
  const soyYoQuienPago = participanteIdDeUsuario(opts.grupoId, currentUser.id)===opts.pagadoPorId;
  const miParticipanteId = participanteIdDeUsuario(opts.grupoId, currentUser.id);
  const miParte = miParticipanteId!=null ? (opts.reparto[miParticipanteId]||0) : 0;
  const otrosSplits = Object.keys(opts.reparto).filter(pid=>pid!==miParticipanteId).map(pid=>({persona: (GRUPO_PARTICIPANTES.find(p=>p.id===pid)||{}).nombre||'', monto: opts.reparto[pid], pagado:false, tipo:'persona' as const, montoRecibido:null, linkedTxId:null, grupoId:opts.grupoId, participanteId:pid}));

  const txOrigen: Transaccion = soyYoQuienPago ? {
    id:'gasto-'+Date.now(), fecha:opts.fecha, hora:todayISO()===opts.fecha ? new Date().toTimeString().slice(0,5) : '12:00',
    comercio:opts.descripcion, monto:Math.round(opts.monto), medio:opts.medio||ensureMedioGrupoCompartido(),
    tipo:'gasto', recurrencia:'variable', estado: otrosSplits.length ? 'por_cobrar' : 'confirmado',
    categorias: opts.categoriaId ? [{cat:opts.categoriaId, monto:Math.round(opts.monto)}] : [],
    porCobrar: otrosSplits.map(s=>({...s, gastoCompartidoId:undefined})), reglaAuto:false, nota:'',
    grupoId: opts.grupoId
  } : {
    id:'gasto-'+Date.now(), fecha:opts.fecha, hora:'12:00',
    comercio:opts.descripcion, monto:Math.round(opts.monto), medio:opts.medio||ensureMedioGrupoCompartido(),
    tipo:'gasto', recurrencia:'variable', estado:'no_es_gasto',
    categorias:[], porCobrar:[], reglaAuto:false,
    nota:'Registrado por ti para el grupo, pero lo pagó otra persona — no cuenta en tu presupuesto.',
    grupoId: opts.grupoId
  };
  TX.push(txOrigen);
  ensureMonthExists(txOrigen.fecha.slice(0,7));

  const { data: gasto, error } = await sb.from('gastos_compartidos').insert({
    grupo_id: opts.grupoId, descripcion: opts.descripcion, categoria_origen: opts.categoriaOrigen||null,
    monto: Math.round(opts.monto), fecha: opts.fecha, pagado_por: opts.pagadoPorId,
    registrado_por: currentUser.id, division_tipo: opts.divisionTipo||'iguales', tx_origen_id: txOrigen.id
  }).select().single();
  if(error){ console.error('Pitucas sin lucas — error creando gasto compartido:', error); return null; }
  txOrigen.gastoCompartidoId = gasto.id;
  txOrigen.porCobrar.forEach(p=>{ p.gastoCompartidoId = gasto.id; });

  const filas = Object.keys(opts.reparto).map(pid=>({gasto_compartido_id:gasto.id, participante_id:pid, monto:Math.round(opts.reparto[pid])}));
  const { error: eR } = await sb.from('gasto_reparto').insert(filas);
  if(eR) console.error('Pitucas sin lucas — error creando el reparto del gasto:', eR);

  await cargarGastosCompartidos();
  return gasto;
}

// Comparte una transacción de gasto QUE YA EXISTE (creada por el flujo normal de la app) con
// un grupo -- a diferencia de crearGastoCompartido (que arma una transacción nueva desde
// cero para "Agregar un gasto" en la vista de grupo), esta reusa la transacción tal cual,
// con su categoría/comercio/monto/fecha ya puestos, y solo le agrega el reparto -- es el
// flujo "Compartir con un grupo" dentro del detalle de una transacción.
export async function compartirTransaccionExistente(txId, grupoId, pagadoPorId, divisionTipo, reparto){
  if(!sb || !currentUser) return null;
  const tx = getTx(txId);
  if(!tx) return null;
  const miParticipanteId = participanteIdDeUsuario(grupoId, currentUser.id);
  const soyYoQuienPago = miParticipanteId!=null && miParticipanteId===pagadoPorId;
  const otrosSplits = Object.keys(reparto).filter(pid=>pid!==miParticipanteId).map(pid=>({
    persona: (GRUPO_PARTICIPANTES.find(p=>p.id===pid)||{}).nombre||'', monto: reparto[pid], pagado:false,
    tipo:'persona' as const, montoRecibido:null, linkedTxId:null, grupoId, participanteId:pid
  }));

  if(soyYoQuienPago){
    tx.porCobrar = tx.porCobrar.concat(otrosSplits);
    if(otrosSplits.length) tx.estado = 'por_cobrar';
  } else {
    // La plata no salió de mi bolsillo -- esta transacción pasa a ser solo un recibo (no
    // cuenta en mi presupuesto); mi propia parte, si me toca, me llega igual que a cualquier
    // otro participante vía sincronizarGastosCompartidos.
    tx.categorias = []; tx.porCobrar = []; tx.estado = 'no_es_gasto';
    tx.nota = (tx.nota?tx.nota+' — ':'')+'Compartido con el grupo, pero lo pagó otra persona — no cuenta en tu presupuesto.';
  }
  tx.grupoId = grupoId;

  const { data: gasto, error } = await sb.from('gastos_compartidos').insert({
    grupo_id: grupoId, descripcion: tx.comercio, categoria_origen: tx.categorias[0] ? catInfo(tx.categorias[0].cat).nombre : null,
    monto: Math.round(tx.monto), fecha: tx.fecha, pagado_por: pagadoPorId,
    registrado_por: currentUser.id, division_tipo: divisionTipo||'iguales', tx_origen_id: tx.id
  }).select().single();
  if(error){ console.error('Pitucas sin lucas — error compartiendo la transacción:', error); return null; }
  tx.gastoCompartidoId = gasto.id;
  tx.porCobrar.forEach(p=>{ if(p.grupoId===grupoId && p.gastoCompartidoId===undefined) p.gastoCompartidoId = gasto.id; });

  const filas = Object.keys(reparto).map(pid=>({gasto_compartido_id:gasto.id, participante_id:pid, monto:Math.round(reparto[pid])}));
  const { error: eR } = await sb.from('gasto_reparto').insert(filas);
  if(eR) console.error('Pitucas sin lucas — error creando el reparto del gasto:', eR);

  await cargarGastosCompartidos();
  return gasto;
}

// Solo un registro contable — nunca crea una transacción real. La plata que de verdad se
// transfiere debería llegar sola por cartola/correo y subirse por los flujos normales de
// importación de la app (a propósito: nada de transacciones forzadas acá).
export async function registrarSaldoPagado(grupoId, deParticipanteId, aParticipanteId, monto){
  if(!sb) return false;
  const { error } = await sb.from('saldos_pagados').insert({grupo_id:grupoId, de_participante:deParticipanteId, a_participante:aParticipanteId, monto:Math.round(monto)});
  if(error){ console.error('Pitucas sin lucas — error registrando el saldo pagado:', error); return false; }
  await cargarGastosCompartidos();
  return true;
}

/* ---------- notificaciones push reales (Cloudflare Worker + Web Push) ----------
   Dos avisos: (1) "llegó una transacción nueva de tu correo" -- lo dispara el Apps Script,
   directo al Worker, sin pasar por acá. (2) "cruzaste el 80/90/100% de un presupuesto" --
   solo puede pasar mientras la app está abierta (una transacción importada nunca llega con
   categoría puesta, así que jamás empuja un presupuesto por sí sola sin que ella la
   clasifique primero) -- ver checkPresupuestoPushAvisos() más abajo. Esta sección solo se
   encarga de: activar/desactivar el permiso del navegador, y mandarle avisos al Worker. */
export function pushWorkerConfigured(){
  return typeof PUSH_WORKER_URL==='string' && PUSH_WORKER_URL.indexOf('PEGA_AQUI')===-1;
}
export function notifApiSupported(){
  return typeof navigator!=='undefined' && 'serviceWorker' in navigator &&
    typeof window!=='undefined' && 'PushManager' in window &&
    typeof Notification!=='undefined';
}
export function urlBase64ToUint8Array_(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;++i) out[i] = rawData.charCodeAt(i);
  return out;
}
export async function loadNotifStatus(){
  state.notifLoading = true; state.notifError = null;
  renderMenuView();
  try{
    if(!notifApiSupported()){
      state.notifSubscribed = false;
    }else{
      const reg = await navigator.serviceWorker.getRegistration('./sw.js').catch(function(){ return null; });
      const sub = reg ? await reg.pushManager.getSubscription().catch(function(){ return null; }) : null;
      state.notifSubscribed = !!sub;
    }
    state.notifLoaded = true;
  }catch(err){
    console.error('Pitucas sin lucas — error revisando el estado de notificaciones:', err);
    state.notifError = 'No se pudo revisar el estado de las notificaciones.';
  }
  state.notifLoading = false;
  renderMenuView();
}
export async function activarNotificaciones(){
  if(state.notifBusy) return;
  state.notifBusy = true; state.notifError = null; renderMenuView();
  try{
    if(!notifApiSupported()) throw new Error('Este navegador no soporta notificaciones push.');
    if(!pushWorkerConfigured()) throw new Error('Todavía falta desplegar el Worker de notificaciones (ver DOCUMENTACION.md).');
    const permission = await Notification.requestPermission();
    if(permission!=='granted') throw new Error('No diste el permiso de notificaciones (revísalo en los ajustes del navegador/celular).');
    const reg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array_(VAPID_PUBLIC_KEY) });
    }
    const json = sub.toJSON();
    if(!sb || !currentHouseholdId) throw new Error('No hay conexión con el servidor todavía.');
    const { error } = await sb.from('push_subscriptions').upsert({
      household_id: currentHouseholdId, endpoint: json.endpoint,
      p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent
    }, { onConflict:'household_id,endpoint' });
    if(error) throw error;
    state.notifSubscribed = true;
    toast('Notificaciones activadas en este dispositivo');
  }catch(err){
    console.error('Pitucas sin lucas — error activando notificaciones:', err);
    state.notifError = err && err.message ? err.message : 'No se pudo activar las notificaciones.';
  }
  state.notifBusy = false;
  renderMenuView();
}
export async function desactivarNotificaciones(){
  if(state.notifBusy) return;
  state.notifBusy = true; state.notifError = null; renderMenuView();
  try{
    if(notifApiSupported()){
      const reg = await navigator.serviceWorker.getRegistration('./sw.js').catch(function(){ return null; });
      const sub = reg ? await reg.pushManager.getSubscription().catch(function(){ return null; }) : null;
      if(sub){
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(function(){});
        if(sb && currentHouseholdId){
          await sb.from('push_subscriptions').delete().eq('household_id', currentHouseholdId).eq('endpoint', endpoint);
        }
      }
    }
    state.notifSubscribed = false;
    toast('Notificaciones desactivadas en este dispositivo');
  }catch(err){
    console.error('Pitucas sin lucas — error desactivando notificaciones:', err);
    state.notifError = err && err.message ? err.message : 'No se pudo desactivar las notificaciones.';
  }
  state.notifBusy = false;
  renderMenuView();
}
// Le pide al Worker que le mande un push a todos los dispositivos suscritos de este hogar.
// Nunca lanza ni bloquea nada más: un push es un avisito extra, jamás algo de lo que
// dependa el guardado de datos reales.
// Devuelve true/false según si el aviso SE INTENTÓ mandar de verdad (no si llegó -- es fire
// and forget). El valor de retorno importa: quien llama a esto decide si vale la pena marcar
// "ya avisado" con ese resultado -- si el Worker todavía no está configurado (por ejemplo,
// antes de que jesu lo despliegue), no hay que quemar el aviso como si ya se hubiera mandado,
// o el día que lo despliegue esa alerta pasada nunca le va a llegar.
export function enviarPushHogar(title, message?, url?){
  if(!pushWorkerConfigured() || !sb || !currentHouseholdId || !state.importToken) return false;
  fetch(PUSH_WORKER_URL+'/notify', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ household_id: currentHouseholdId, token: state.importToken, title: title, message: message||'', url: url||'./index.html' })
  }).catch(function(err){ console.error('Pitucas sin lucas — error mandando notificación push:', err); });
  return true;
}
// A diferencia de enviarPushHogar() (que es "dispara y olvida", nunca sabe si de verdad
// llegó a algún dispositivo), esta SÍ espera la respuesta real del Worker y se la muestra a
// la usuaria -- pensada para el botón "Enviar aviso de prueba" del Menú > Notificaciones,
// para poder diagnosticar sin adivinar cuando algo no llega.
export async function enviarPushPrueba(){
  if(state.notifTestBusy) return;
  state.notifTestBusy = true; state.notifTestResult = null; renderMenuView();
  try{
    if(!pushWorkerConfigured()) throw new Error('Todavía falta desplegar el Worker de notificaciones.');
    if(!sb || !currentHouseholdId || !state.importToken) throw new Error('No hay conexión con el servidor todavía -- espera un momento y prueba de nuevo.');
    const res = await fetch(PUSH_WORKER_URL+'/notify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ household_id: currentHouseholdId, token: state.importToken, title: 'Aviso de prueba', message: 'Si ves esto, las notificaciones están funcionando.', url: './index.html' })
    });
    let data = null;
    try{ data = await res.json(); }catch(e){}
    if(!res.ok){
      state.notifTestResult = 'El Worker respondió con un error ('+res.status+'): '+(data && data.error ? data.error : 'sin más detalle.');
    }else if(data && data.delivered>0){
      state.notifTestResult = 'El Worker mandó el aviso a '+data.delivered+' dispositivo(s). Si aun así no te llegó, revisa que las notificaciones estén permitidas para este sitio en los ajustes de tu celular/navegador.';
    }else{
      state.notifTestResult = (data && data.note) ? data.note : 'El Worker respondió, pero no hay ningún dispositivo suscrito en tu hogar para mandarle el aviso -- prueba desactivar y activar notificaciones de nuevo en este dispositivo.';
    }
  }catch(err){
    state.notifTestResult = 'No se pudo hacer la prueba: '+(err && err.message ? err.message : err);
  }
  state.notifTestBusy = false;
  renderMenuView();
}
// Título/mensaje del push de presupuesto -- separado de checkPresupuestoPushAvisos() para
// poder testear el texto exacto sin necesitar una sesión de Supabase real (que es lo único
// que falta en el entorno de test, ver shot_notificaciones_push.js).
export function presupuestoAvisoTexto(catNombre, umbral, gastado, meta){
  return {
    titulo: catNombre+': has alcanzado el '+umbral+'% de tu presupuesto mensual!',
    mensaje: money(gastado)+' de '+money(meta)
  };
}
// Compara, categoría por categoría, si el gasto del mes actual acaba de cruzar un umbral
// (80/90/100%) que no se había avisado todavía -- y si es así, manda el push y lo marca
// como ya avisado (PRESUPUESTO_AVISOS_ENVIADOS) para no repetirlo. Se llama después de
// cualquier cambio que pueda mover el gasto de una categoría (guardar/editar/reclasificar
// una transacción) -- ver los data-save-tx / data-cat-select / etc. más abajo.
export function checkPresupuestoPushAvisos(){
  // Ojo: usa el mes calendario de HOY, no MONTHS[state.monthIndex] -- ese es solo el mes que
  // se está mirando en pantalla (Balance/Presupuesto pueden estar mostrando un mes pasado
  // mientras se guarda un cambio), y un presupuesto siempre es sobre el mes en curso.
  const month = todayISO().slice(0,7);
  Object.keys(PRESUPUESTOS).forEach(function(catId){
    const cfg = PRESUPUESTOS[catId];
    if(!cfg || !cfg.meta || !cfg.alertas) return;
    const gastado = catGastoEnMes(catId, month);
    const pct = (gastado/cfg.meta)*100;
    [80,90,100].forEach(function(umbral){
      if(!cfg.alertas[umbral] || pct<umbral) return;
      const key = catId+'|'+month+'|'+umbral;
      if(PRESUPUESTO_AVISOS_ENVIADOS[key]) return;
      const cat = catInfo(catId);
      const aviso = presupuestoAvisoTexto(cat.nombre, umbral, gastado, cfg.meta);
      const seIntento = enviarPushHogar(aviso.titulo, aviso.mensaje);
      // Solo se marca "ya avisado" si de verdad se intentó mandar -- si el Worker todavía no
      // está configurado, este cruce de umbral queda disponible para avisarse el día que sí
      // lo esté, en vez de perderse para siempre.
      if(seIntento) PRESUPUESTO_AVISOS_ENVIADOS[key] = true;
    });
  });
}

export function renderMenuImportarCorreo(){
  const head = menuScreenHead('Importar desde tu correo');
  if(state.importCorreoLoading){
    document.getElementById('view-root').innerHTML = head+'<div class="card placeholder-card">Cargando…</div>';
    return;
  }
  if(state.importCorreoError){
    document.getElementById('view-root').innerHTML = head+
      '<div class="card placeholder-card">'+ICONS.ban+'<h3>No se pudo cargar</h3><p>'+state.importCorreoError+'</p>'+
      '<button class="save-tx-btn" style="margin-top:12px;" data-reload-import-correo>Reintentar</button></div>';
    return;
  }
  const credBlock =
    '<div class="card" style="padding:16px;margin-bottom:14px;">'+
      '<div class="sheet-block-title" style="margin-bottom:8px;">Datos para tu Apps Script</div>'+
      '<p class="muted" style="margin-bottom:12px;">Un script de Google Apps Script (gratis, corre dentro de tu propia cuenta de Gmail) revisa cada cierto tiempo tus correos de notificación bancaria y manda cada transacción para acá. Estos dos códigos son los únicos datos que necesita — no sirven para nada más que eso.</p>'+
      '<label class="draft-label">Household ID</label>'+
      '<div style="display:flex;gap:8px;margin-bottom:12px;">'+
        '<input class="draft-input" readonly value="'+(currentHouseholdId||'')+'" style="font-size:11.5px;">'+
        '<button class="budget-edit-btn" data-copy-text="'+(currentHouseholdId||'')+'" aria-label="Copiar Household ID">'+ICONS.copy+'</button>'+
      '</div>'+
      '<label class="draft-label">Código de importación</label>'+
      '<div style="display:flex;gap:8px;">'+
        '<input class="draft-input" readonly value="'+(state.importToken||'')+'" style="font-size:11.5px;">'+
        '<button class="budget-edit-btn" data-copy-text="'+(state.importToken||'')+'" aria-label="Copiar código de importación">'+ICONS.copy+'</button>'+
      '</div>'+
    '</div>';
  const infoBlock = '<div class="card placeholder-card">'+ICONS.checkCircle+'<h3>Se agregan solas</h3>'+
    '<p>Cuando el script encuentre una transacción nueva en tu correo, la agrega directo a tu pestaña de <b>Transacciones</b>, marcada como pendiente (sin categoría) para que la clasifiques ahí mismo — igual que cualquier otra transacción sin clasificar. Si alguna se agregó por error, ábrela y elimínala desde ahí.</p></div>';
  document.getElementById('view-root').innerHTML = head+credBlock+infoBlock;
}

export function renderMenuNotificaciones(){
  const head = menuScreenHead('Notificaciones');
  if(!notifApiSupported()){
    document.getElementById('view-root').innerHTML = head+
      '<div class="card placeholder-card">'+ICONS.ban+'<h3>No disponible en este navegador</h3>'+
      '<p>Este navegador no soporta notificaciones push. Prueba desde Chrome/Safari en tu celular, idealmente con la app instalada en tu pantalla de inicio.</p></div>';
    return;
  }
  if(state.notifLoading){
    document.getElementById('view-root').innerHTML = head+'<div class="card placeholder-card">Cargando…</div>';
    return;
  }
  const errorBlock = state.notifError ? '<div class="file-format-hint" style="margin-bottom:12px;">'+state.notifError+'</div>' : '';
  const statusBlock = '<div class="card placeholder-card">'+
    (state.notifSubscribed ? ICONS.checkCircle : ICONS.bell)+
    '<h3>'+(state.notifSubscribed ? 'Activadas en este dispositivo' : 'Notificaciones desactivadas')+'</h3>'+
    '<p>Te avisamos apenas llega una transacción nueva desde tu correo, y cuando un presupuesto de categoría cruza el 80%, 90% o 100% de su meta. Esto se activa por separado en cada celular/computador donde uses la app.</p>'+
    '<button class="save-tx-btn" style="margin-top:12px;" data-notif-toggle'+(state.notifBusy?' disabled':'')+'>'+
      (state.notifBusy ? 'Un momento…' : (state.notifSubscribed ? 'Desactivar en este dispositivo' : 'Activar en este dispositivo'))+
    '</button></div>';
  // Botón de prueba: manda un aviso real y muestra la respuesta del Worker tal cual (a
  // diferencia del aviso automático por transacción/presupuesto, que es "dispara y olvida" y
  // nunca te avisa si algo falló en el camino). Solo tiene sentido si este dispositivo ya
  // está suscrito.
  const testBlock = !state.notifSubscribed ? '' :
    '<div class="card placeholder-card" style="margin-top:12px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);" data-notif-test'+(state.notifTestBusy?' disabled':'')+'>'+
        (state.notifTestBusy ? 'Enviando…' : 'Enviar aviso de prueba')+
      '</button>'+
      (state.notifTestResult ? '<p class="platform-hint" style="margin-top:10px;">'+state.notifTestResult+'</p>' : '')+
    '</div>';
  document.getElementById('view-root').innerHTML = head+errorBlock+statusBlock+testBlock;
}

export function renderMenuView(){
  document.getElementById('header-title').textContent = 'Menú';
  if(state.menuSection==='cuenta') renderMenuCuenta();
  else if(state.menuSection==='categorias') renderMenuCategorias();
  else if(state.menuSection==='medios') renderMenuMedios();
  else if(state.menuSection==='reglas') renderMenuReglas();
  else if(state.menuSection==='exportar') renderMenuExportar();
  else if(state.menuSection==='respaldo') renderMenuRespaldo();
  else if(state.menuSection==='importar') renderMenuImportar();
  else if(state.menuSection==='importarcorreo') renderMenuImportarCorreo();
  else if(state.menuSection==='notificaciones') renderMenuNotificaciones();
  else if(state.menuSection==='reconciliar') renderMenuReconciliar();
  else if(state.menuSection==='demo') renderMenuDemo();
  else if(state.menuSection==='asesoria') renderMenuAsesoria();
  else renderMenuMain();
}

