import { catInfo, dayLabel, txsOfMonth } from '../helpers';
import { ICONS, catIconMarkup } from '../icons';
import { render } from '../render';
import { ensureMonthExists } from '../shared-expenses';
import { getTx, segmentedHtml } from '../sheet';
import { CATEGORIES, TRANSFER_INFO, SHARED_EXPENSES, GROUPS, GROUP_PARTICIPANTS, CATEGORY_MAPPINGS, PAYMENT_METHODS, BUDGETS, BUDGET_ALERTS_SENT, TRANSACTIONS, fmt, importIdCounter, money, nextImportId, setSharedExpenses, setGroups, setGroupParticipants, setCategoryMappings, setPaidBalances, state, todayISO } from '../state';
import { PUSH_WORKER_URL, VAPID_PUBLIC_KEY, buildFullStateBlob, currentHouseholdId, currentUser, sb, translateAuthError } from '../supabase';
import { CategoryMapping, Transaction } from '../types';
import { toast } from '../ui/toasts';
import { generalCatIdFor, isPlatformArchived } from './inversiones';
import { catMonthExpense } from './presupuesto';
/* ===================== MENU (Phase 4) ===================== */
export const CATEGORY_ICON_CHOICES = ['tags','cart','car','utensils','home','film','heart','repeat','briefcase','laptop','plusCircle','trending','bank','coin','card','cash','users','layers','sparkle','more'];
export const CATEGORY_COLOR_CHOICES = ['lavender','mint','peach','sky','pink','butter','sage','neutral'];
export const MEDIO_ICON_CHOICES = ['card','bank','cash','coin'];
// Curated set of emojis for a category's icon — it's not the full Unicode set (that's
// covered by the "or type any other emoji" field, which uses the phone's native emoji
// keyboard, same as WhatsApp). This grid is just a shortcut for the most common ones.
export const CAT_EMOJI_CHOICES = ['🛒','🍽️','🚕','🏠','💊','🍻','📺','💼','✨','🌱','🪙','🛍️','✈️','🎁','🐜','🏃','🎬',
  '🐾','👶','📚','💻','🎮','🎵','💅','☕','🍕','🧴','💡','🚌','⛽','🧹','🏥','🎓','🧸','📱','🖥️','🎂','🏋️',
  '⚽','🎨','📦','🧳','🏦','💵','📈','🚗','🧾','🎗️'];

export function isCategoryInUse(catId){ return TRANSACTIONS.some(t=>t.categorias.some(c=>c.cat===catId)); }
export function isPaymentMethodInUse(medioId){ return TRANSACTIONS.some(t=>t.medio===medioId); }
// Other categories of the same type (expense/income/investment) that already use this color --
// used to warn in the category editor, because two categories of the same type with the
// same color look like a single block in the pie charts (they can't be told apart).
export function categoriesWithColor(tipo, color, excludeId){
  return Object.keys(CATEGORIES)
    .filter(id => id!==excludeId && CATEGORIES[id].tipo===tipo && CATEGORIES[id].color===color)
    .map(id => CATEGORIES[id].nombre);
}

// Groups transactions flagged with reglaAuto by comercio, for the "Reglas de clasificación"
// (classification rules) screen — this only reads, nothing new is created here (rules are
// born from the lock icon inside a transaction's detail view, in applyLockRule).
export function groupedRules(){
  const map = {};
  TRANSACTIONS.forEach(t=>{
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

/* ---------- actual downloads: CSV and JSON ---------- */
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
export function buildTransactionsCSV(){
  const header = ['fecha','hora','comercio','monto','tipo','categoria','medio','recurrencia','estado'];
  const rows = TRANSACTIONS.slice().sort((a,b)=> (b.fecha+b.hora).localeCompare(a.fecha+a.hora)).map(t=>{
    const catNames = t.categorias.map(c=>catInfo(c.cat).nombre).join(' / ');
    const medioNombre = PAYMENT_METHODS[t.medio] ? PAYMENT_METHODS[t.medio].nombre : t.medio;
    return [t.fecha, t.hora, csvEscape(t.comercio), t.monto, t.tipo, csvEscape(catNames), csvEscape(medioNombre), t.recurrencia, t.estado].join(',');
  });
  // ﻿: BOM so that Excel opens accents and ñ correctly on Windows.
  return '﻿'+header.join(',')+'\n'+rows.join('\n');
}
export function buildBackupJSON(){
  const snapshot = Object.assign({app:'Pitucas sin lucas', version:2, exportadoEl: todayISO()}, buildFullStateBlob());
  return JSON.stringify(snapshot, null, 2);
}

/* ---------- import statement CSV (simple parser) ---------- */
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
export function parseStatementCSV(text){
  const lines = String(text||'').split(/\r\n|\n|\r/).map(l=>l.trim()).filter(l=>l.length>0);
  lines.shift(); // first line = header, always discarded
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
export function importStatementRows(rows){
  const reglaByComercio = {};
  groupedRules().forEach(r=>{ reglaByComercio[r.comercio] = r; });
  let conRegla = 0, pendientes = 0;
  rows.forEach(row=>{
    const regla = reglaByComercio[row.descripcion];
    const tipo = regla ? regla.tipo : (row.monto<0 ? 'gasto' : 'ingreso');
    const monto = Math.abs(row.monto);
    const categorias = regla && regla.cat ? [{cat:regla.cat, monto}] : [];
    const estado = regla && regla.cat ? 'confirmado' : 'pendiente';
    if(regla && regla.cat) conRegla++; else pendientes++;
    TRANSACTIONS.unshift({
      id: 'timp'+(nextImportId()), fecha: row.fecha, hora:'00:00', comercio: row.descripcion,
      monto, medio: ensureCheckingAccountMethod(), tipo, recurrencia: regla ? regla.recurrencia : 'variable', estado,
      categorias, porCobrar:[], reglaAuto: !!(regla && regla.cat), nota:'Importado desde cartola CSV'
    });
  });
  return {creadas: rows.length, conRegla, pendientes};
}

/* ---------- main screen ---------- */
export function renderMenuMain(){
  const nReglas = groupedRules().length;
  const items = [
    {section:'cuenta', icon:'lockSmall', label:'Mi cuenta', sub: currentUser ? currentUser.email : 'Sesión'},
    {section:'categorias', icon:'tags', label:'Categorías', sub: Object.keys(CATEGORIES).length+' categorías'},
    {section:'medios', icon:'card', label:'Medios de pago', sub: Object.keys(PAYMENT_METHODS).length+' medios de pago'},
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

/* ---------- categories ---------- */
export function renderMenuCatEditForm(){
  const d = state.catDraft;
  const isNew = state.editingCategoryId==='nueva';
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
    '<div class="color-picker">'+CATEGORY_COLOR_CHOICES.map(c=>'<button type="button" data-cat-draft-color="'+c+'" class="'+(d.color===c?'active':'')+'" style="--sw:var(--cat-'+c+'-fill)"></button>').join('')+'</div>'+
    (function(){
      const excludeId = isNew ? null : state.editingCategoryId;
      const colision = categoriesWithColor(d.tipo, d.color, excludeId);
      return colision.length
        ? '<div class="file-format-hint" style="color:var(--expense-ink);">Ese color ya lo usa "'+colision.join('", "')+'" -- en los gráficos de torta se van a ver como un solo bloque. Prueba otro color.</div>'
        : '';
    })()+
    '<div style="display:flex;gap:10px;margin-top:16px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-cat-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-cat="'+(isNew?'nueva':state.editingCategoryId)+'">Guardar</button>'+
    '</div>'+
    (!isNew && !isCategoryInUse(state.editingCategoryId) ? '<button class="budget-delete-link" data-delete-cat="'+state.editingCategoryId+'">Eliminar categoría</button>' : '')+
    (!isNew && isCategoryInUse(state.editingCategoryId) ? '<div class="file-format-hint">No se puede eliminar: tiene transacciones asociadas.</div>' : '')+
  '</div>';
}
export function renderMenuCategorias(){
  if(state.editingCategoryId){
    document.getElementById('view-root').innerHTML = menuScreenHead('Categorías')+renderMenuCatEditForm();
    return;
  }
  function rowFor(id){
    const c = CATEGORIES[id];
    return '<div class="card menu-item-card">'+
      '<span class="menu-item-card-icon" style="--fill:var(--cat-'+c.color+'-fill);--ink:var(--cat-'+c.color+'-ink)">'+catIconMarkup(c.icon)+'</span>'+
      '<div class="menu-item-card-body"><div class="menu-item-card-name">'+c.nombre+'</div></div>'+
      '<div class="menu-item-card-actions"><button class="budget-edit-btn" data-edit-cat="'+id+'" aria-label="Editar '+c.nombre+'">'+ICONS.edit+'</button></div>'+
    '</div>';
  }
  function readonlyRowFor(id){
    const c = CATEGORIES[id];
    return '<div class="card menu-item-card">'+
      '<span class="menu-item-card-icon" style="--fill:var(--cat-'+c.color+'-fill);--ink:var(--cat-'+c.color+'-ink)">'+catIconMarkup(c.icon)+'</span>'+
      '<div class="menu-item-card-body"><div class="menu-item-card-name">'+c.nombre+'</div><div class="menu-item-card-sub">Se administra desde Inversiones</div></div>'+
    '</div>';
  }
  const gastoIds = Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo==='gasto');
  const ingresoIds = Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo==='ingreso');
  // A closed/archived platform is not shown here — "closing" it removes it from all active
  // views, same as in Inversiones (its transaction history stays intact, it's just no longer
  // managed from this side; it can be reopened in Inversiones and it shows up again).
  const inversionIds = Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo==='inversion' && !isPlatformArchived(k));
  document.getElementById('view-root').innerHTML = menuScreenHead('Categorías')+
    '<div class="menu-list-divider">Gastos</div>'+gastoIds.map(rowFor).join('')+
    '<div class="menu-list-divider">Ingresos</div>'+ingresoIds.map(rowFor).join('')+
    '<button class="budget-add-link" data-add-cat style="margin:2px 0 16px;">+ Agregar categoría</button>'+
    '<div class="menu-list-divider">Inversión</div>'+
    '<p class="muted" style="font-size:12px;margin:0 0 8px;">Estas categorías nacen solas cuando creas una plataforma o meta en Inversiones.</p>'+
    inversionIds.map(readonlyRowFor).join('');
}

/* ---------- payment methods ---------- */
export function renderMenuPaymentMethodEditForm(){
  const d = state.medioDraft;
  const isNew = state.editingPaymentMethodId==='nueva';
  return '<div class="card" style="padding:16px;">'+
    '<label class="draft-label">Nombre</label>'+
    '<input type="text" class="draft-input" data-payment-method-draft-field="nombre" value="'+d.nombre+'" placeholder="Ej: Mastercard Falabella">'+
    '<label class="draft-label" style="margin-top:12px;">Detalle (opcional)</label>'+
    '<input type="text" class="draft-input" data-payment-method-draft-field="corto" value="'+d.corto+'" placeholder="Ej: •••• 1234">'+
    '<label class="draft-label" style="margin-top:12px;">Ícono</label>'+
    '<div class="icon-picker" style="grid-template-columns:repeat(4,1fr);">'+MEDIO_ICON_CHOICES.map(ic=>'<button type="button" data-payment-method-draft-icon="'+ic+'" class="'+(d.icon===ic?'active':'')+'">'+ICONS[ic]+'</button>').join('')+'</div>'+
    '<div style="display:flex;gap:10px;margin-top:16px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-payment-method-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-payment-method="'+(isNew?'nueva':state.editingPaymentMethodId)+'">Guardar</button>'+
    '</div>'+
    (!isNew && !isPaymentMethodInUse(state.editingPaymentMethodId) ? '<button class="budget-delete-link" data-delete-payment-method="'+state.editingPaymentMethodId+'">Eliminar medio de pago</button>' : '')+
    (!isNew && isPaymentMethodInUse(state.editingPaymentMethodId) ? '<div class="file-format-hint">No se puede eliminar: tiene transacciones asociadas.</div>' : '')+
  '</div>';
}
export function renderMenuMedios(){
  if(state.editingPaymentMethodId){
    document.getElementById('view-root').innerHTML = menuScreenHead('Medios de pago')+renderMenuPaymentMethodEditForm();
    return;
  }
  const rows = Object.keys(PAYMENT_METHODS).map(id=>{
    const m = PAYMENT_METHODS[id];
    return '<div class="card menu-item-card">'+
      '<span class="menu-item-card-icon" style="--fill:var(--surface-sunken);--ink:var(--text-secondary);">'+ICONS[m.icon]+'</span>'+
      '<div class="menu-item-card-body"><div class="menu-item-card-name">'+m.nombre+'</div><div class="menu-item-card-sub">'+m.corto+'</div></div>'+
      '<div class="menu-item-card-actions"><button class="budget-edit-btn" data-edit-payment-method="'+id+'" aria-label="Editar '+m.nombre+'">'+ICONS.edit+'</button></div>'+
    '</div>';
  }).join('');
  document.getElementById('view-root').innerHTML = menuScreenHead('Medios de pago')+
    rows+'<button class="budget-add-link" data-add-payment-method style="margin:2px 0 4px;">+ Agregar medio de pago</button>';
}

/* ---------- classification rules ---------- */
export function renderMenuReglas(){
  const reglas = groupedRules();
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
            '<button class="budget-edit-btn" data-delete-rule="'+encodeURIComponent(r.comercio)+'" aria-label="Eliminar regla de '+r.comercio+'">'+ICONS.trash+'</button>'+
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

/* ---------- export / backup / import ---------- */
export function renderMenuExportar(){
  document.getElementById('view-root').innerHTML = menuScreenHead('Exportar a Excel')+
    '<div class="card" style="padding:16px;">'+
      '<div class="menu-item-card" style="padding:0;margin-bottom:16px;">'+
        '<span class="menu-item-card-icon" style="--fill:var(--cat-sage-fill);--ink:var(--cat-sage-ink)">'+ICONS.trending+'</span>'+
        '<div class="menu-item-card-body"><div class="menu-item-card-name">'+TRANSACTIONS.length+' transacciones</div><div class="menu-item-card-sub">Se exportan todas, sin importar el filtro o mes abierto</div></div>'+
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
        (s.pendientes>0 ? '<button class="save-tx-btn" style="width:100%;margin-top:10px;" data-goto-pending>Ir a categorizarlas</button>' : '')+
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

/* ---------- reconcile with the bank statement (PDF) ----------
   Reads the statement PDF (checking account or credit card statement) directly in the
   browser with pdf.js — the file never gets uploaded to any server of ours.
   Extracts each movement by position (column) instead of just text order, because the
   plain text of these PDFs isn't enough to tell apart the charge/credit/balance column
   (they're all just consecutive numbers). The column coordinates were measured against
   real Banco Edwards statements (checking account and Visa/Mastercard card) — the same
   bank issues both with the same format. */
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
      // pdf.js gives y in PDF coordinates (0 = BOTTOM edge of the page) — we flip it
      // so "top" grows downward, like any normal reading of the page.
      words.push({ text: text, x0: it.transform[4], top: viewport.height - it.transform[5] });
    });
    pages.push(words);
  }
  return pages;
}

export function groupRows(words){
  // Groups by proximity (not by a fixed grid) because in the same visual row, the fecha
  // column can end up 1-2pt above/below the detalle or monto column (different font
  // baseline) — a fixed rounding grid was splitting them into two different rows right at
  // the rounding boundary.
  const TOL = 4;
  const sorted = words.slice().sort(function(a,b){ return a.top-b.top; });
  const rows = [];
  sorted.forEach(function(w){
    let row = null;
    for(let i=rows.length-1;i>=0;i--){
      if(Math.abs(rows[i].top - w.top) <= TOL){ row = rows[i]; break; }
      if(rows[i].top < w.top - TOL) break; // no more possible closer rows
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

// Returns a plain object with one text key per column of "cols" (e.g. fecha,
// detalle, cargo, abono for CC_COLS) -- Record<string,string> because the keys are
// dynamic (they depend on which "cols" is passed in: CC_COLS or TC_COLS), but each value
// always ends up being that column's text, already joined and trimmed.
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

// From the first page, extracts the period's "HASTA" (through) date (year/month context),
// because the checking-account rows only carry day/month, without a year.
export function contextoAnioCuentaCorriente(pagesWords){
  const t = (pagesWords[0]||[]).map(function(w){ return w.text; }).join(' ');
  const fechas = t.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  if(!fechas.length) return {year: new Date().getFullYear(), month: new Date().getMonth()+1};
  // the last DD/MM/YYYY date that appears in the header is the "HASTA" (through) date
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
        // normally fecha+detalle+monto already come together in the same grouped row; only
        // if this row comes "bare" (no detalle or montos) is it completed with the next one
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
    if(cargo===null && abono===null) return; // row with no amounts (opening/closing balance, noise)
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
    // Sometimes pdf.js hands back the merchant name stuck to the operation code in a single
    // piece of text (e.g. "270711605897 VIRTUAL*RECAUDACION"), which starts inside the
    // "codigo" column even though it visually extends into "detalle" — so we strip the
    // numeric code from the start and use the rest as part of the detalle/comercio.
    const codigoSinNumero = r.codigo.replace(/^\d{6,}\s*/, '').trim();
    const detalleCompleto = (codigoSinNumero+' '+r.detalle).replace(/\s+/g,' ').trim();
    const filaCompleta = (r.codigo+' '+r.detalle).toUpperCase();
    let esEspecial = null;
    if(/MONTO CANCELADO/.test(filaCompleta)) esEspecial = 'pago_recibido'; // a payment made to the card, not a purchase
    movimientos.push({
      fecha: fechaISO,
      detalle: detalleCompleto,
      comercioSugerido: detalleCompleto,
      monto: monto<0 ? monto : -Math.abs(monto), // on a card statement, every purchase is an expense
      tipoMov: 'gasto',
      esEspecial: esEspecial
    });
  });
  return movimientos;
}

export async function parseStatementPDF(arrayBuffer, password){
  if(!ensurePdfJs()) throw new Error('No se pudo cargar el lector de PDF (revisa tu conexión a internet).');
  let pagesWords;
  try{
    pagesWords = await extractPdfPagesWords(arrayBuffer, password);
  }catch(err){
    // pdf.js throws this when the PDF is password-protected and the password is missing or
    // wrong — a clearer message than the library's generic one.
    if(err && err.name==='PasswordException') throw new Error('PDF_PASSWORD_REQUERIDA');
    throw err;
  }
  const tipo = detectarTipoCartola(pagesWords);
  if(tipo==='cuenta_corriente') return {tipo, movimientos: parseCuentaCorrienteMovs(pagesWords)};
  if(tipo==='tarjeta_nacional') return {tipo, movimientos: parseTarjetaNacionalMovs(pagesWords)};
  return {tipo:null, movimientos:[]};
}

// ---- Statements captured by email (Menu > "Reconciliar con la cartola") ----
// Converts the bytea that Supabase returns (hex text like "\\x2550..." or, depending on
// the client, already a byte array) into the ArrayBuffer that pdf.js needs.
export function pgBytesToArrayBuffer(val){
  if(val instanceof ArrayBuffer) return val;
  if(Array.isArray(val)) return new Uint8Array(val).buffer;
  let hex = String(val||'');
  if(hex.slice(0,2)==='\\x') hex = hex.slice(2);
  const bytes = new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++) bytes[i] = parseInt(hex.substr(i*2,2),16);
  return bytes.buffer;
}

export async function loadAvailableStatements(){
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

export async function useImportedStatement(id, password){
  const item = state.reconciliar.disponibles.find(function(d){ return d.id===id; });
  if(!item) return;
  state.reconciliar.cargando = true;
  state.reconciliar.errorPassword = null;
  renderMenuView();
  try{
    const { data, error } = await sb.from('cartolas_importadas').select('contenido').eq('id', id).single();
    if(error) throw error;
    const buf = pgBytesToArrayBuffer(data.contenido);
    const res = await parseStatementPDF(buf, password);
    state.reconciliar.cargando = false;
    if(!res.tipo){
      state.reconciliar.error = 'No reconocí el formato de este PDF — pruébalo subiéndolo a mano para revisar.';
      renderMenuView();
      return;
    }
    state.reconciliar.archivo = item.nombre_archivo || (item.tipo==='cuenta_corriente' ? 'Cartola cuenta corriente' : 'Estado de cuenta tarjeta');
    res.movimientos.forEach(function(m){ m.__match = findSimilarTx(m); });
    state.reconciliar.tipo = res.tipo;
    state.reconciliar.movimientos = res.movimientos;
    state.reconciliar.usandoId = null;
    renderMenuView();
    // It's marked "procesada" (processed) in the background — if this were to fail, worst
    // case it gets offered to you again next month (no risk of losing anything by mismarking it).
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

// Statement picked by hand with "Elegir archivo PDF" (Menu > Reconciliar). Unlike the ones
// that arrive by email, here the file never leaves the browser — if it asks for a password,
// its ArrayBuffer is kept in memory (never the password) while the same kind of field used
// for email statements is shown, and reading is retried when the user presses "Abrir".
export async function tryOpenStatementFile(buffer, nombre, password){
  state.reconciliar.cargando = true;
  state.reconciliar.error = null;
  state.reconciliar.errorPassword = null;
  renderMenuView();
  try{
    // pdf.js takes "ownership" of the ArrayBuffer we pass it (it transfers it to its internal
    // worker and leaves it unusable afterward) — that's why we always send it a COPY
    // (slice(0)) and keep the original intact in state, so we can retry with another
    // password as many times as needed without asking for the file again.
    const res = await parseStatementPDF(buffer.slice(0), password);
    state.reconciliar.cargando = false;
    state.reconciliar.archivoBuffer = null;
    state.reconciliar.archivoNombrePendiente = null;
    if(!res.tipo){
      state.reconciliar.error = 'No reconocí el formato de este PDF — por ahora solo lee cartolas de cuenta corriente y estados de cuenta de tarjeta de crédito de Banco Edwards / Banco de Chile.';
      renderMenuView();
      return;
    }
    state.reconciliar.archivo = nombre;
    res.movimientos.forEach(function(m){ m.__match = findSimilarTx(m); });
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

// Looks for whether a similar transaction already exists (same date ±1 day, same amount,
// same ingreso/gasto direction) — so we don't suggest adding what's already there.
export function findSimilarTx(mov){
  const montoAbs = Math.abs(mov.monto);
  return TRANSACTIONS.find(function(t){
    if(t.tipo !== mov.tipoMov) return false;
    if(Math.abs(t.monto - montoAbs) > 1) return false;
    const d1 = new Date(t.fecha+'T00:00:00'), d2 = new Date(mov.fecha+'T00:00:00');
    const diffDias = Math.abs(d1.getTime()-d2.getTime()) / 86400000;
    return diffDias <= 2;
  }) || null;
}

// The list of statements that already arrived by email on their own (still unused) — each
// one with a button to open it, which asks for the PDF's password right there (that
// password is never saved).
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
        '<input type="password" inputmode="numeric" class="draft-input" data-statement-password-input placeholder="Últimos 4 dígitos de tu RUT antes del dígito verificador" value="'+(R.passwordDraft||'')+'">'+
        (R.errorPassword ? '<div class="field-error">'+R.errorPassword+'</div>' : '')+
        '<div style="display:flex;gap:8px;margin-top:10px;">'+
          '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-statement-cancel>Cancelar</button>'+
          '<button class="save-tx-btn" style="flex:1;" data-statement-open="'+d.id+'">Abrir</button>'+
        '</div>'+
      '</div>';
    }
    return '<div class="card" style="padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">'+
      '<div style="min-width:0;">'+
        '<div style="font-weight:700;font-size:13.5px;">'+label+'</div>'+
        '<div class="muted" style="font-size:12px;">Llegó por correo el '+fechaTxt+'</div>'+
      '</div>'+
      '<button class="chip" data-statement-use="'+d.id+'">Usar esta</button>'+
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
        '<input type="password" inputmode="numeric" class="draft-input" data-statement-password-input placeholder="Últimos 4 dígitos de tu RUT antes del dígito verificador" value="'+(R.passwordDraft||'')+'">'+
        (R.errorPassword ? '<div class="field-error">'+R.errorPassword+'</div>' : '')+
        '<div style="display:flex;gap:8px;margin-top:10px;">'+
          '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-reconcile-file-cancel>Cancelar</button>'+
          '<button class="save-tx-btn" style="flex:1;" data-reconcile-file-open>Abrir</button>'+
        '</div>'+
      '</div>';
    return;
  }
  if(!R.movimientos.length && !R.error){
    document.getElementById('view-root').innerHTML = head+
      renderCartolasDisponiblesBlock()+
      '<div class="card file-drop-card">'+ICONS.inbox+
        '<p>Sube el PDF de tu cuenta corriente o de tu estado de cuenta de tarjeta de crédito. La app compara cada movimiento contra lo que ya tienes registrado — nunca sube el archivo a ningún servidor, se lee acá mismo en tu navegador.</p>'+
        '<label class="save-tx-btn" style="display:inline-block;cursor:pointer;">Elegir archivo PDF<input type="file" accept="application/pdf" data-reconcile-file-input style="display:none;"></label>'+
      '</div>';
    return;
  }
  if(R.error){
    document.getElementById('view-root').innerHTML = head+
      '<div class="card placeholder-card">'+ICONS.ban+'<h3>No se pudo leer</h3><p>'+R.error+'</p>'+
      '<button class="save-tx-btn" style="margin-top:12px;" data-reconcile-reset>Probar con otro archivo</button></div>';
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
    const comprasRegistradas = txsOfMonth(ym).filter(function(t){ return t.tipo==='gasto' && PAYMENT_METHODS[t.medio] && PAYMENT_METHODS[t.medio].icon==='card'; }).reduce(function(s,t){ return s+t.monto; },0);
    resumenTarjeta = '<div class="card" style="padding:14px 16px;margin-bottom:14px;">'+
      '<div class="sheet-block-title" style="margin-bottom:6px;">Pago de tarjeta este mes</div>'+
      '<p class="muted" style="margin-bottom:4px;">Se pagó '+money(totalPagos)+' en '+pagosTarjeta.length+' cargo'+(pagosTarjeta.length===1?'':'s')+' de tarjeta de crédito.</p>'+
      '<p class="muted">Tienes '+money(comprasRegistradas)+' en compras con tarjeta registradas este mes — esto es solo referencial, la cartola de tarjeta detalla cada compra por separado.</p>'+
    '</div>';
  }

  function filaHtml(m, idx, yaRegistrada){
    // When it's not registered yet, besides "+ Agregar" (which classifies it as a normal
    // gasto/ingreso) we offer "No es gasto" for movements that shouldn't count in the
    // statistics -- e.g. a transfer between the user's own accounts -- without having to add
    // it first and then go mark it from the detail view.
    const acciones = yaRegistrada
      ? '<span class="tx-state state-cobrado-inline">Ya registrada</span>'
      : '<div style="display:flex;gap:6px;">'+
          '<button class="chip" data-reconcile-add="'+idx+'">+ Agregar</button>'+
          '<button class="chip" style="background:var(--surface-sunken);color:var(--text-secondary);" data-reconcile-not-expense="'+idx+'">No es gasto</button>'+
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
    (sinMatch.length ? '<button class="budget-add-link" data-reconcile-add-all style="margin-bottom:10px;">Agregar los '+sinMatch.length+' que faltan</button>' : '')+
    listaHtml+
    '<button class="budget-add-link" data-reconcile-reset style="margin-top:10px;">Probar con otro archivo</button>';
}

export function createTxFromMovement(m, opts?: {noEsGasto?: boolean}){
  opts = opts || {};
  const reglaByComercio = {};
  groupedRules().forEach(function(r){ reglaByComercio[r.comercio] = r; });
  const regla = reglaByComercio[m.comercioSugerido];
  const catId = m.esEspecial==='sueldo' ? 'sueldo' : (regla && regla.cat ? regla.cat : null);
  // This used to always be "Cuenta Vista", no matter which statement the movement came
  // from — so purchases pulled from your CARD STATEMENT (which by definition are never
  // cash nor from your checking account) ended up mislabeled. Now it's chosen based on the
  // statement: checking account → Cuenta Vista; credit card → a generic card payment
  // method (she can rename it or reassign the transaction later, from the detail view).
  const medioId = state.reconciliar.tipo === 'tarjeta_nacional' ? ensureUnknownPaymentMethod() : ensureCheckingAccountMethod();
  // opts.noEsGasto: for movements that appear on the statement but aren't a real gasto or
  // ingreso (e.g. a transfer between the user's own accounts) -- same 'no_es_gasto' state
  // that the "No es gasto" button uses in a normal transaction's detail view, so it's
  // excluded from the gasto/ingreso totals but recorded so it doesn't show up as pending again.
  TRANSACTIONS.unshift({
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

/* ---------- financial advisory (coming soon) ---------- */
export function renderMenuAsesoria(){
  document.getElementById('view-root').innerHTML = menuScreenHead('Asesoría financiera con Claude')+
    '<div class="card placeholder-card">'+ICONS.sparkle+'<h3>Próximamente</h3>'+
    '<p>La idea es conectar un asistente con acceso a tus transacciones, presupuestos y metas de inversión, para que puedas preguntarle directamente sobre tu plata — por ejemplo "¿en qué categoría me estoy pasando este mes?" o "¿cómo voy con la meta del pie del depto?".</p>'+
    '<p class="muted" style="margin-top:10px;">Todavía no está disponible en esta maqueta.</p>'+
    '</div>';
}

/* ---------- my account (session) ---------- */
export function transferInfoComplete(){
  const d = TRANSFER_INFO;
  return !!(d.nombre || d.rut || d.banco || d.tipoCuenta || d.numeroCuenta || d.email);
}
export function renderDatosTransferenciaCard(){
  const d = TRANSFER_INFO;
  if(state.editingTransferInfo){
    const dr = state.transferInfoDraft;
    return '<div class="card" style="padding:16px;margin-top:14px;">'+
      '<div class="budget-total-label">Datos de transferencia</div>'+
      '<p class="cat-picker-hint" style="margin:6px 0 10px;">Se usan solo para armar el texto que copias al pedir un cobro pendiente — no se comparten con nadie más.</p>'+
      '<label class="draft-label">Nombre</label>'+
      '<input type="text" class="draft-input" data-transfer-info-input="nombre" value="'+dr.nombre+'" placeholder="Nombre completo">'+
      '<label class="draft-label" style="margin-top:10px;">RUT</label>'+
      '<input type="text" class="draft-input" data-transfer-info-input="rut" value="'+dr.rut+'" placeholder="12.345.678-9">'+
      '<label class="draft-label" style="margin-top:10px;">Banco</label>'+
      '<input type="text" class="draft-input" data-transfer-info-input="banco" value="'+dr.banco+'" placeholder="Ej: Banco Estado">'+
      '<label class="draft-label" style="margin-top:10px;">Tipo de cuenta</label>'+
      '<input type="text" class="draft-input" data-transfer-info-input="tipoCuenta" value="'+dr.tipoCuenta+'" placeholder="Cuenta RUT, Vista, Corriente…">'+
      '<label class="draft-label" style="margin-top:10px;">Número de cuenta</label>'+
      '<input type="text" class="draft-input" data-transfer-info-input="numeroCuenta" value="'+dr.numeroCuenta+'" placeholder="0000000000">'+
      '<label class="draft-label" style="margin-top:10px;">Email (opcional)</label>'+
      '<input type="text" class="draft-input" data-transfer-info-input="email" value="'+dr.email+'" placeholder="tucorreo@ejemplo.cl">'+
      '<div style="display:flex;gap:10px;margin-top:14px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-transfer-info>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-save-transfer-info>Guardar</button>'+
      '</div>'+
    '</div>';
  }
  const completos = transferInfoComplete();
  return '<div class="card" style="padding:16px;margin-top:14px;">'+
    '<div class="budget-total-head">'+
      '<span class="budget-total-label">Datos de transferencia</span>'+
      '<button class="budget-edit-btn" data-edit-transfer-info aria-label="Editar datos de transferencia">'+ICONS.edit+'</button>'+
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
// Text ready to paste into WhatsApp with a transaction's pending charges (type "persona",
// unpaid), plus your transfer info if you already set it up in Mi cuenta. Reimbursements
// (health insurance, insurer, etc.) don't go in here — that's money an institution owes
// YOU, not something you send to a WhatsApp group so they transfer it to you.
export function buildChargeWhatsAppText(t){
  const pendientes = (t.porCobrar||[]).filter(p=>p.tipo==='persona' && !p.pagado);
  if(pendientes.length===0) return null;
  const lines = ['Pendiente de pago'];
  pendientes.forEach(p=>{ lines.push((p.persona||'Sin nombre')+' '+fmt.format(Math.round(p.monto||0))); });
  const d = TRANSFER_INFO;
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

/* ---------- import from your email (Gmail + Apps Script) ---------- */
export async function loadEmailImportScreen(){
  if(!sb || !currentHouseholdId){
    state.emailImportLoading = false;
    state.emailImportError = 'No hay conexión con el servidor todavía.';
    renderMenuView();
    return;
  }
  try{
    const { data: hh, error: hhErr } = await sb.from('households').select('import_token').eq('id', currentHouseholdId).single();
    if(hhErr) throw hhErr;
    state.importToken = hh ? hh.import_token : null;
    state.emailImportLoaded = true;
  }catch(err){
    console.error('Pitucas sin lucas — error cargando importación por correo:', err);
    state.emailImportError = translateAuthError(err);
  }
  state.emailImportLoading = false;
  renderMenuView();
}

export function guessPaymentMethodIdFromSuggestion(sug){
  if(!sug) return null;
  const m = String(sug).match(/(\d{4})\D*$/);
  if(!m) return null;
  const last4 = m[1];
  const found = Object.keys(PAYMENT_METHODS).find(function(id){ return (PAYMENT_METHODS[id].corto||'').indexOf(last4)>=0; });
  return found || null;
}
// The bank email already carries the last 4 digits of the card used (e.g. "****0507") —
// if a payment method with those digits already exists, that one is used. If not, instead
// of falling back to "Efectivo" (which looks wrong and forces correcting every transaction
// by hand), a new payment method with those digits is created on its own, so the card
// "appears" automatically. Later, from Menu > Medios de pago, she can rename it (e.g.
// "Visa BCH" instead of "Tarjeta ****0507") without losing the link to the transactions
// already assigned to that payment method.
export function ensurePaymentMethodForSuggestion(sug){
  // Some rules in the email script know the movement came out of the checking account
  // (a transfer, a Racional purchase) even though there's no card number to read — in
  // those cases they send the literal text 'cuenta_vista' instead of "****NNNN".
  if(sug==='cuenta_vista') return ensureCheckingAccountMethod();
  const existing = guessPaymentMethodIdFromSuggestion(sug);
  if(existing) return existing;
  if(!sug) return null;
  const m = String(sug).match(/(\d{4})\D*$/);
  if(!m) return null;
  const last4 = m[1];
  const id = 'tarjeta_'+last4;
  if(!PAYMENT_METHODS[id]){
    PAYMENT_METHODS[id] = { nombre: 'Tarjeta •••• '+last4, corto: '•••• '+last4, icon: 'card' };
  }
  return id;
}
// "Generic" payment methods for when we KNOW a transaction wasn't cash (it came from a
// bank email, or a statement/account summary) but we couldn't identify which specific
// card or account — before, in those cases, it fell back to the first payment method in
// the list (which on a new account is literally "Efectivo"), showing card purchases as if
// they'd been cash. Better to honestly show "sin identificar" (unidentified) and let her
// fix it by hand if she wants, than to invent a payment method that doesn't correspond.
export function ensureCheckingAccountMethod(){
  const id = 'cuenta_vista';
  if(!PAYMENT_METHODS[id]){ PAYMENT_METHODS[id] = {nombre:'Cuenta Vista', corto:'Cta. Vista', icon:'bank'}; }
  return id;
}
export function ensureUnknownPaymentMethod(){
  const id = 'medio_desconocido';
  if(!PAYMENT_METHODS[id]){ PAYMENT_METHODS[id] = {nombre:'Medio sin identificar', corto:'Sin identificar', icon:'card'}; }
  return id;
}
// An email import can tell WHICH platform a contribution went to (from the sender/subject),
// but never which of that platform's goals it was for -- so the best it can do on its own is
// that platform's "General" bucket (see generalCatIdFor/investmentCatOptions in
// views/inversiones.ts); she can reclassify it to a specific goal later from the transaction's
// detail, same as any other auto-classified import.
export function guessCatIdFromImportRow(row){
  if(row.tipo!=='inversion') return null; // gasto/ingreso: let her choose, same as in CSV import
  const f = (row.fuente||'').toLowerCase();
  const candidatos = ['racional','fintual','banco_chile','buda'];
  const found = candidatos.find(function(id){ return CATEGORIES[id] && f.indexOf(id.replace('_',''))>=0; });
  return found ? generalCatIdFor(found) : null;
}

// Previously, what the Google script found in the email sat in a separate inbox
// ("Importar desde tu correo") waiting for her to approve them one by one. Now they're
// added directly to Transacciones, marked as "pendiente" (no category) just like any
// other unclassified transaction — so she reviews them in the same place where she
// already reviews everything else, instead of having to remember to visit a separate screen.
// Builds the transaction that results from a row imported by email -- kept separate from
// absorbImportedRows so it can be tested without needing a real Supabase connection.
// This used to only try to guess the category for investments (guessCatIdFromImportRow)
// and ALWAYS left any imported gasto/ingreso pending, even if a classification rule
// already existed for that same comercio (e.g. "Copec Providencia" -> Transporte) — CSV
// statement import did use them (see importStatementRows), this one didn't. Now it checks
// the same rules, so it behaves the same regardless of where the transaction came from.
export function txFromEmailImport(row): Transaction {
  const reglaByComercio = {};
  groupedRules().forEach(function(r){ reglaByComercio[r.comercio] = r; });
  const regla = reglaByComercio[row.comercio];
  const catId = (regla && regla.cat) ? regla.cat : guessCatIdFromImportRow(row);
  const medioId = ensurePaymentMethodForSuggestion(row.medio_sugerido) || ensureUnknownPaymentMethod();
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
      TRANSACTIONS.unshift(txFromEmailImport(row));
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

/* ---------- Shared expenses: sync with Supabase ----------
   These tables NEVER travel inside app_state (see supabase/schema_gastos_compartidos.sql) —
   they're read/written directly, and "my share" of an expense that someone else recorded is
   recalculated right here every time (syncSharedExpenses), it's never persisted. */
export function ensureSharedExpensePaymentMethod(){
  const id = 'grupo_compartido';
  if(!PAYMENT_METHODS[id]){ PAYMENT_METHODS[id] = {nombre:'Gasto de grupo', corto:'Grupo', icon:'users'}; }
  return id;
}
// The participant (with an account) that corresponds to this user_id within this group, or
// null if that user isn't a member (shouldn't happen if the tables are consistent, but an
// expense from a group I'm no longer a member of shouldn't break the app).
export function participantIdForUser(groupId, userId){
  const p = GROUP_PARTICIPANTS.find(x=>x.grupo_id===groupId && x.user_id===userId);
  return p ? p.id : null;
}

// Recalculates, from SHARED_EXPENSES/GROUP_PARTICIPANTS/CATEGORY_MAPPINGS already loaded
// in memory, the "my share" (sharedByOthers) entries for expenses that someone else in the
// group paid and recorded. Pure with respect to the network: it never calls Supabase, it
// only reads/writes TRANSACTIONS — that's why it can be tested with test data injected
// directly (see audit_gastos_compartidos.js). It's called after loadSharedExpenses() and
// again every time a live (realtime) change arrives — there's never a need to call it "to
// undo" something: it always starts by deleting the old entries and rebuilds them all from
// scratch.
export function syncSharedExpenses(){
  // Mutates TRANSACTIONS in place (splice), never reassigns it -- TRANSACTIONS is exposed
  // on window.__debug (and anywhere else that has saved a reference to the array) as the
  // array itself, not as a copy recalculated each time; reassigning it here would leave
  // those old references pointing at an array that's no longer the real one.
  for(let i=TRANSACTIONS.length-1;i>=0;i--){ if(TRANSACTIONS[i].sharedByOthers) TRANSACTIONS.splice(i,1); }
  if(!currentUser) return;
  SHARED_EXPENSES.forEach(g=>{
    const miParticipanteId = participantIdForUser(g.grupo_id, currentUser.id);
    if(!miParticipanteId) return;                    // no longer a member of that group
    if(g.pagado_por===miParticipanteId) return;       // I paid: my share is already in MY real transaction (porCobrar)
    const miReparto = (g.reparto||[]).find(r=>r.participante_id===miParticipanteId);
    if(!miReparto || miReparto.monto<=0) return;       // none of this expense is mine

    const registradorParticipanteId = participantIdForUser(g.grupo_id, g.registrado_por);
    const mapeo = registradorParticipanteId ? CATEGORY_MAPPINGS.find(m=>
      m.user_id===currentUser.id && m.de_participante===registradorParticipanteId && m.categoria_ajena===g.categoria_origen
    ) : null;

    const pagador = GROUP_PARTICIPANTS.find(p=>p.id===g.pagado_por);
    const grupo = GROUPS.find(gr=>gr.id===g.grupo_id);
    const tx: Transaction = {
      id: 'compartido-'+g.id,
      fecha: g.fecha, hora:'12:00',
      comercio: g.descripcion,
      monto: Math.round(miReparto.monto),
      medio: ensureSharedExpensePaymentMethod(),
      tipo:'gasto', recurrencia:'variable',
      estado: mapeo ? 'confirmado' : 'pendiente',
      categorias: mapeo ? [{cat: mapeo.categoria_propia, monto: Math.round(miReparto.monto)}] : [],
      porCobrar: [], reglaAuto:false,
      nota: 'Tu parte de "'+g.descripcion+'"'+(pagador?' — pagó '+pagador.nombre:'')+(grupo?' · grupo '+grupo.nombre:''),
      groupId: g.grupo_id, sharedExpenseId: g.id, sharedByOthers:true,
      suggestedOriginCategory: mapeo ? null : (g.categoria_origen||null)
    };
    TRANSACTIONS.push(tx);
    ensureMonthExists(tx.fecha.slice(0,7));
  });
}

// Manually classify a sharedByOthers entry with no category — besides setting the
// category on THIS transaction, it learns the mapping so the next expenses from the SAME
// person with that SAME source category classify themselves automatically the next time
// they get recalculated (syncSharedExpenses). It never creates new categories.
export async function classifySharedExpenseFromOthers(txId, catId){
  const tx = getTx(txId);
  if(!tx || !tx.sharedByOthers || !tx.sharedExpenseId) return false;
  const g = SHARED_EXPENSES.find(x=>x.id===tx.sharedExpenseId);
  tx.categorias = [{cat:catId, monto:tx.monto}];
  tx.estado = 'confirmado';
  tx.suggestedOriginCategory = null;
  if(g && currentUser){
    const registradorParticipanteId = participantIdForUser(g.grupo_id, g.registrado_por);
    if(registradorParticipanteId && g.categoria_origen){
      // The local mapping is ALWAYS updated (syncSharedExpenses classifying the next
      // expenses on its own depends on this, regardless of whether the remote write
      // manages to connect) — sb only decides whether an attempt is also made to save it
      // to Supabase for the next session; if that fails or there's no connection, this
      // session's mapping keeps working the same.
      setCategoryMappings(CATEGORY_MAPPINGS.filter(m=>!(m.user_id===currentUser.id && m.de_participante===registradorParticipanteId && m.categoria_ajena===g.categoria_origen)));
      const nuevo = {user_id:currentUser.id, de_participante:registradorParticipanteId, categoria_ajena:g.categoria_origen, categoria_propia:catId};
      CATEGORY_MAPPINGS.push(nuevo as CategoryMapping);
      if(sb){
        try{
          await sb.from('mapeo_categorias').upsert(nuevo, {onConflict:'user_id,de_participante,categoria_ajena'});
        }catch(err){ console.error('Pitucas sin lucas — error guardando el mapeo de categorías:', err); }
      }
    }
  }
  return true;
}

// Fetches everything about shared expenses at once (groups I'm a member of, their
// participants, their expenses + split, the already-recorded balances, and my own category
// mapping) and recalculates "my share". Called after loading the session and again when a
// live change arrives.
export async function loadSharedExpenses(){
  if(!sb || !currentUser) return;
  try{
    const [{data:grupos, error:eG}, {data:saldos, error:eS}, {data:mapeo, error:eM}] = await Promise.all([
      sb.from('grupos').select('*'),
      sb.from('saldos_pagados').select('*'),
      sb.from('mapeo_categorias').select('*').eq('user_id', currentUser.id)
    ]);
    if(eG) throw eG; if(eS) throw eS; if(eM) throw eM;
    setGroups(grupos||[]); setPaidBalances(saldos||[]); setCategoryMappings(mapeo||[]);
    const grupoIds = GROUPS.map(g=>g.id);
    if(!grupoIds.length){ setGroupParticipants([]); setSharedExpenses([]); syncSharedExpenses(); return; }

    const { data:participantes, error:eP } = await sb.from('grupo_participantes').select('*').in('grupo_id', grupoIds);
    if(eP) throw eP;
    setGroupParticipants(participantes||[]);

    const { data:gastos, error:eGA } = await sb.from('gastos_compartidos').select('*, gasto_reparto(*)').in('grupo_id', grupoIds).order('fecha', {ascending:false});
    if(eGA) throw eGA;
    setSharedExpenses((gastos||[]).map(g=>Object.assign({}, g, {reparto: g.gasto_reparto||[]})));

    syncSharedExpenses();
    render();
  }catch(err){
    console.error('Pitucas sin lucas — error cargando gastos compartidos:', err);
  }
}

// Realtime: any change made by ANY member of a group (creating/editing/deleting an
// expense, adding a participant, settling balances) reloads and recalculates for everyone
// else, without them having to leave and re-enter the app.
export let groupsRealtimeChannel = null;
// supabase.ts clears it to null on logout (resetToLoggedOutState) -- see the note about
// setters in state.ts.
export function setGroupsRealtimeChannel(v){ groupsRealtimeChannel = v; }
export function subscribeToGroupsLive(){
  if(!sb || groupsRealtimeChannel) return;
  groupsRealtimeChannel = sb.channel('gastos-compartidos')
    .on('postgres_changes', {event:'*', schema:'public', table:'grupos'}, loadSharedExpenses)
    .on('postgres_changes', {event:'*', schema:'public', table:'grupo_participantes'}, loadSharedExpenses)
    .on('postgres_changes', {event:'*', schema:'public', table:'gastos_compartidos'}, loadSharedExpenses)
    .on('postgres_changes', {event:'*', schema:'public', table:'gasto_reparto'}, loadSharedExpenses)
    .on('postgres_changes', {event:'*', schema:'public', table:'saldos_pagados'}, loadSharedExpenses)
    .subscribe();
}

export async function createGroup(nombre, icono){
  if(!sb || !currentUser) return {data:null, error:null};
  const { data, error } = await sb.from('grupos').insert({nombre, icono: icono||'👥', creado_por: currentUser.id}).select().single();
  if(error){ console.error('Pitucas sin lucas — error creando grupo:', error); return {data:null, error}; }
  await loadSharedExpenses();
  return {data, error:null};
}

export async function deleteGroup(groupId){
  if(!sb) return false;
  const { error } = await sb.from('grupos').delete().eq('id', groupId);
  if(error){ console.error('Pitucas sin lucas — error eliminando grupo:', error); return false; }
  await loadSharedExpenses();
  return true;
}

export async function joinGroup(inviteCode, nombre){
  if(!sb) return false;
  const { error } = await sb.rpc('unirse_a_grupo', {p_invite_code:inviteCode, p_nombre:nombre});
  if(error){ console.error('Pitucas sin lucas — error uniéndose al grupo:', error); return false; }
  await loadSharedExpenses();
  return true;
}

export async function addParticipantWithoutAccount(groupId, nombre, color){
  if(!sb) return null;
  const { data, error } = await sb.from('grupo_participantes').insert({grupo_id:groupId, nombre, color: color||'mint'}).select().single();
  if(error){ console.error('Pitucas sin lucas — error agregando participante:', error); return null; }
  await loadSharedExpenses();
  return data;
}

// Creates the shared expense + its split, and locally builds the transaction for whoever
// is recording it (tx_origen): if she paid, it's a normal transaction with porCobrar
// netting out everyone else's share (same as a regular friends split); if someone else
// paid, it's just a receipt (state 'no_es_gasto') that doesn't affect her budget — her own
// share, if she has one, reaches her the same as anyone else via syncSharedExpenses.
export async function crearGastoCompartido(opts){
  // opts: {groupId, descripcion, categoriaOrigen, monto, fecha, pagadoPorId, divisionTipo, reparto: {participanteId: monto}, medio}
  if(!sb || !currentUser) return null;
  const soyYoQuienPago = participantIdForUser(opts.groupId, currentUser.id)===opts.pagadoPorId;
  const miParticipanteId = participantIdForUser(opts.groupId, currentUser.id);
  const miParte = miParticipanteId!=null ? (opts.reparto[miParticipanteId]||0) : 0;
  const otrosSplits = Object.keys(opts.reparto).filter(pid=>pid!==miParticipanteId).map(pid=>({persona: (GROUP_PARTICIPANTS.find(p=>p.id===pid)||{}).nombre||'', monto: opts.reparto[pid], pagado:false, tipo:'persona' as const, montoRecibido:null, linkedTxId:null, groupId:opts.groupId, participanteId:pid}));

  const txOrigen: Transaction = soyYoQuienPago ? {
    id:'gasto-'+Date.now(), fecha:opts.fecha, hora:todayISO()===opts.fecha ? new Date().toTimeString().slice(0,5) : '12:00',
    comercio:opts.descripcion, monto:Math.round(opts.monto), medio:opts.medio||ensureSharedExpensePaymentMethod(),
    tipo:'gasto', recurrencia:'variable', estado: otrosSplits.length ? 'por_cobrar' : 'confirmado',
    categorias: opts.categoriaId ? [{cat:opts.categoriaId, monto:Math.round(opts.monto)}] : [],
    porCobrar: otrosSplits.map(s=>({...s, sharedExpenseId:undefined})), reglaAuto:false, nota:'',
    groupId: opts.groupId
  } : {
    id:'gasto-'+Date.now(), fecha:opts.fecha, hora:'12:00',
    comercio:opts.descripcion, monto:Math.round(opts.monto), medio:opts.medio||ensureSharedExpensePaymentMethod(),
    tipo:'gasto', recurrencia:'variable', estado:'no_es_gasto',
    categorias:[], porCobrar:[], reglaAuto:false,
    nota:'Registrado por ti para el grupo, pero lo pagó otra persona — no cuenta en tu presupuesto.',
    groupId: opts.groupId
  };
  TRANSACTIONS.push(txOrigen);
  ensureMonthExists(txOrigen.fecha.slice(0,7));

  const { data: gasto, error } = await sb.from('gastos_compartidos').insert({
    grupo_id: opts.groupId, descripcion: opts.descripcion, categoria_origen: opts.categoriaOrigen||null,
    monto: Math.round(opts.monto), fecha: opts.fecha, pagado_por: opts.pagadoPorId,
    registrado_por: currentUser.id, division_tipo: opts.divisionTipo||'iguales', tx_origen_id: txOrigen.id
  }).select().single();
  if(error){ console.error('Pitucas sin lucas — error creando gasto compartido:', error); return null; }
  txOrigen.sharedExpenseId = gasto.id;
  txOrigen.porCobrar.forEach(p=>{ p.sharedExpenseId = gasto.id; });

  const filas = Object.keys(opts.reparto).map(pid=>({gasto_compartido_id:gasto.id, participante_id:pid, monto:Math.round(opts.reparto[pid])}));
  const { error: eR } = await sb.from('gasto_reparto').insert(filas);
  if(eR) console.error('Pitucas sin lucas — error creando el reparto del gasto:', eR);

  await loadSharedExpenses();
  return gasto;
}

// Shares an expense transaction that ALREADY EXISTS (created by the app's normal flow)
// with a group -- unlike crearGastoCompartido (which builds a brand new transaction from
// scratch for "Agregar un gasto" in the group view), this one reuses the transaction as is,
// with its category/comercio/monto/fecha already set, and just adds the split to it -- it's
// the "Compartir con un grupo" (share with a group) flow inside a transaction's detail view.
export async function shareExistingTransaction(txId, groupId, pagadoPorId, divisionTipo, reparto){
  if(!sb || !currentUser) return null;
  const tx = getTx(txId);
  if(!tx) return null;
  const miParticipanteId = participantIdForUser(groupId, currentUser.id);
  const soyYoQuienPago = miParticipanteId!=null && miParticipanteId===pagadoPorId;
  const otrosSplits = Object.keys(reparto).filter(pid=>pid!==miParticipanteId).map(pid=>({
    persona: (GROUP_PARTICIPANTS.find(p=>p.id===pid)||{}).nombre||'', monto: reparto[pid], pagado:false,
    tipo:'persona' as const, montoRecibido:null, linkedTxId:null, groupId, participanteId:pid
  }));

  if(soyYoQuienPago){
    tx.porCobrar = tx.porCobrar.concat(otrosSplits);
    if(otrosSplits.length) tx.estado = 'por_cobrar';
  } else {
    // The money didn't come out of my pocket -- this transaction becomes just a receipt
    // (doesn't count toward my budget); my own share, if I have one, reaches me the same
    // as any other participant via syncSharedExpenses.
    tx.categorias = []; tx.porCobrar = []; tx.estado = 'no_es_gasto';
    tx.nota = (tx.nota?tx.nota+' — ':'')+'Compartido con el grupo, pero lo pagó otra persona — no cuenta en tu presupuesto.';
  }
  tx.groupId = groupId;

  const { data: gasto, error } = await sb.from('gastos_compartidos').insert({
    grupo_id: groupId, descripcion: tx.comercio, categoria_origen: tx.categorias[0] ? catInfo(tx.categorias[0].cat).nombre : null,
    monto: Math.round(tx.monto), fecha: tx.fecha, pagado_por: pagadoPorId,
    registrado_por: currentUser.id, division_tipo: divisionTipo||'iguales', tx_origen_id: tx.id
  }).select().single();
  if(error){ console.error('Pitucas sin lucas — error compartiendo la transacción:', error); return null; }
  tx.sharedExpenseId = gasto.id;
  tx.porCobrar.forEach(p=>{ if(p.groupId===groupId && p.sharedExpenseId===undefined) p.sharedExpenseId = gasto.id; });

  const filas = Object.keys(reparto).map(pid=>({gasto_compartido_id:gasto.id, participante_id:pid, monto:Math.round(reparto[pid])}));
  const { error: eR } = await sb.from('gasto_reparto').insert(filas);
  if(eR) console.error('Pitucas sin lucas — error creando el reparto del gasto:', eR);

  await loadSharedExpenses();
  return gasto;
}

// Just an accounting record — it never creates a real transaction. The money that's
// actually transferred should arrive on its own via statement/email and get uploaded
// through the app's normal import flows (deliberately: no forced transactions here).
export async function registerPaidBalance(groupId, deParticipanteId, aParticipanteId, monto){
  if(!sb) return false;
  const { error } = await sb.from('saldos_pagados').insert({grupo_id:groupId, de_participante:deParticipanteId, a_participante:aParticipanteId, monto:Math.round(monto)});
  if(error){ console.error('Pitucas sin lucas — error registrando el saldo pagado:', error); return false; }
  await loadSharedExpenses();
  return true;
}

/* ---------- real push notifications (Cloudflare Worker + Web Push) ----------
   Two alerts: (1) "a new transaction arrived from your email" -- triggered by the Apps
   Script, straight to the Worker, without going through here. (2) "you crossed 80/90/100%
   of a budget" -- can only happen while the app is open (an imported transaction never
   arrives with a category set, so it can never push a budget over the line on its own
   without her classifying it first) -- see checkBudgetPushAlerts() below. This section is
   only responsible for: enabling/disabling the browser permission, and sending alerts to
   the Worker. */
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
export async function enableNotifications(){
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
export async function disableNotifications(){
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
// Asks the Worker to send a push to every subscribed device for this household. Never
// throws or blocks anything else: a push is a small extra heads-up, never something the
// saving of real data depends on.
// Returns true/false based on whether the alert WAS ACTUALLY ATTEMPTED to be sent (not
// whether it arrived -- it's fire and forget). The return value matters: whoever calls
// this decides whether it's worth marking "already alerted" based on that result -- if the
// Worker isn't configured yet (for example, before jesu deploys it), the alert shouldn't
// be burned as if it had already been sent, or the day it gets deployed that past alert
// will never reach her.
export function enviarPushHogar(title, message?, url?){
  if(!pushWorkerConfigured() || !sb || !currentHouseholdId || !state.importToken) return false;
  fetch(PUSH_WORKER_URL+'/notify', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ household_id: currentHouseholdId, token: state.importToken, title: title, message: message||'', url: url||'./index.html' })
  }).catch(function(err){ console.error('Pitucas sin lucas — error mandando notificación push:', err); });
  return true;
}
// Unlike enviarPushHogar() (which is "fire and forget", never knowing whether it actually
// reached a device), this one DOES wait for the Worker's real response and shows it to the
// user -- built for the "Enviar aviso de prueba" (send test alert) button in Menu >
// Notificaciones, so problems can be diagnosed without guessing when something doesn't arrive.
export async function sendTestPush(){
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
// Title/message for the budget push -- kept separate from checkBudgetPushAlerts() so the
// exact text can be tested without needing a real Supabase session (which is the only
// thing missing in the test environment, see shot_notificaciones_push.js).
export function budgetAlertText(catNombre, umbral, gastado, meta){
  return {
    titulo: catNombre+': has alcanzado el '+umbral+'% de tu presupuesto mensual!',
    mensaje: money(gastado)+' de '+money(meta)
  };
}
// Compares, category by category, whether the current month's spending just crossed a
// threshold (80/90/100%) that hadn't been alerted yet -- and if so, sends the push and
// marks it as already alerted (BUDGET_ALERTS_SENT) so it doesn't repeat. Called after any
// change that could move a category's spending (saving/editing/reclassifying a
// transaction) -- see the data-save-tx / data-cat-select / etc. below.
export function checkBudgetPushAlerts(){
  // Note: uses TODAY's calendar month, not MONTHS[state.monthIndex] -- that one is just the
  // month currently being looked at on screen (Balance/Presupuesto might be showing a past
  // month while a change is being saved), and a budget is always about the current month.
  const month = todayISO().slice(0,7);
  Object.keys(BUDGETS).forEach(function(catId){
    const cfg = BUDGETS[catId];
    if(!cfg || !cfg.meta || !cfg.alertas) return;
    const gastado = catMonthExpense(catId, month);
    const pct = (gastado/cfg.meta)*100;
    [80,90,100].forEach(function(umbral){
      if(!cfg.alertas[umbral] || pct<umbral) return;
      const key = catId+'|'+month+'|'+umbral;
      if(BUDGET_ALERTS_SENT[key]) return;
      const cat = catInfo(catId);
      const aviso = budgetAlertText(cat.nombre, umbral, gastado, cfg.meta);
      const seIntento = enviarPushHogar(aviso.titulo, aviso.mensaje);
      // Only marked "already alerted" if sending was actually attempted -- if the Worker
      // isn't configured yet, this threshold crossing stays available to be alerted on the
      // day it is, instead of being lost forever.
      if(seIntento) BUDGET_ALERTS_SENT[key] = true;
    });
  });
}

export function renderMenuImportarCorreo(){
  const head = menuScreenHead('Importar desde tu correo');
  if(state.emailImportLoading){
    document.getElementById('view-root').innerHTML = head+'<div class="card placeholder-card">Cargando…</div>';
    return;
  }
  if(state.emailImportError){
    document.getElementById('view-root').innerHTML = head+
      '<div class="card placeholder-card">'+ICONS.ban+'<h3>No se pudo cargar</h3><p>'+state.emailImportError+'</p>'+
      '<button class="save-tx-btn" style="margin-top:12px;" data-reload-email-import>Reintentar</button></div>';
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
  // Test button: sends a real alert and shows the Worker's response as is (unlike the
  // automatic transaction/budget alert, which is "fire and forget" and never tells you if
  // something failed along the way). Only makes sense if this device is already subscribed.
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

