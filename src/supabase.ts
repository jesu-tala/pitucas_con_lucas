import { phone } from './events';
import { render } from './render';
import { monthLabelFor } from './shared-expenses';
import { CATS, CATS_SEED_DEFAULTS, DATOS_TRANSFERENCIA, MEDIOS, METAS_GASTO_PCT, METAS_INVERSION, METAS_TOTAL_CHECKS, MONTHS, MONTH_LABEL, PLANIFICADOR, PLATAFORMA_DATA, PRESUPUESTOS, PRESUPUESTO_AVISOS_ENVIADOS, TX, currentMonthIndex, getPlanificadorDefaults, importIdCounter, metaIdCounter, presupuestoTotalMensual, setDATOS_TRANSFERENCIA, setGASTOS_COMPARTIDOS, setGRUPOS, setGRUPO_PARTICIPANTES, setImportIdCounter, setMAPEO_CATEGORIAS, setMETAS_GASTO_PCT, setMETAS_INVERSION, setMETAS_TOTAL_CHECKS, setMetaIdCounter, setPLANIFICADOR, setPLATAFORMA_DATA, setPRESUPUESTOS, setPRESUPUESTO_AVISOS_ENVIADOS, setPresupuestoTotalMensual, setSALDOS_PAGADOS, setTX, state, todayISO } from './state';
import { absorbImportedRows, cargarGastosCompartidos, checkPresupuestoPushAvisos, gruposRealtimeChannel, setGruposRealtimeChannel, suscribirseAGruposEnVivo } from './views/menu';
/* ===================== SUPABASE: CUENTAS + GUARDADO EN LA NUBE =====================
   Hasta acá arriba todo corrió igual que la maqueta: se pintó con los datos de ejemplo
   (Fran/Cata/Sushi Itto, etc.) mientras se resuelve si hay o no una sesión real. Todo lo
   de abajo reemplaza esos datos de ejemplo por los datos reales del hogar de la persona
   que inició sesión (o por un estado vacío recién creado, si es una cuenta nueva) —
   nunca se mezclan ni se guardan encima de los de la demo. */
export const SUPABASE_URL = 'https://wuxdctmhbuttzssiknkt.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_uLIIyeomS52mPIie__KvAA_ErW-lYhb';
// Notificaciones push: la llave pública VAPID (segura de tener acá, es pública por diseño —
// la privada vive SOLO como secret en el Cloudflare Worker) y la URL de ese Worker, que es
// quien realmente manda los avisos (ver cloudflare-worker/worker.js).
export const VAPID_PUBLIC_KEY = 'BBVwNyDtQKLPpTNpIRMLpl13w9_3ucBwbZKyStc-v5LFU3shPh9Q7HfrmDxR4m60riF1-3dGth9Iwe3BOTgF_uk';
// Reemplaza esto por la URL real de tu Worker una vez que lo despliegues (Cloudflare te la
// muestra apenas creas el Worker, algo como https://tu-worker.tu-cuenta.workers.dev).
export const PUSH_WORKER_URL = 'https://curly-thunder-b4c6.talajesu.workers.dev';
// La creación real del cliente (y todo lo que depende de que exista, más abajo) se movió
// a initSupabaseAuth() -- si esto se ejecutara como efecto secundario de nivel de módulo (al
// simple hecho de importar este archivo), correría ANTES que el primer render() con los datos
// de ejemplo que hace app.ts al arrancar, invirtiendo el orden que tenía la app de una sola
// pieza (acá abajo, en el archivo original, ese arranque ocurría textualmente después del
// primer render()). app.ts llama a initSupabaseAuth() a mano, después de ese primer render(),
// para conservar el mismo orden.
export let sb: any = null;

export let currentUser = null;          // objeto user de Supabase Auth, o null si no hay sesión
export let currentHouseholdId = null;   // uuid del hogar cuyos datos están cargados ahora mismo
export let authMode = 'login';          // 'login' | 'signup' — qué pestaña del auth-gate está activa
export let suppressAutoSave = true;     // true mientras se están aplicando datos cargados (para no
                                  // reguardar de vuelta lo que se acaba de leer)
export let saveTimer = null;
export let lastSavedBlobJSON = null;    // último estado ya guardado en Supabase — para no reguardar
                                  // (ni mostrar "Guardando…") cuando el DOM cambió pero los
                                  // datos reales son los mismos (ver writeStateToSupabase)

export function emptyAppStateBlob(){
  const ym = todayISO().slice(0,7);
  const catsBase = {};
  Object.keys(CATS_SEED_DEFAULTS).forEach(function(k){ catsBase[k] = Object.assign({}, CATS_SEED_DEFAULTS[k]); });
  const monthLabelObj = {}; monthLabelObj[ym] = monthLabelFor(ym);
  return {
    transacciones: [],
    categorias: catsBase,
    mediosPago: {efectivo:{nombre:'Efectivo', corto:'Efectivo', icon:'cash'}},
    presupuestos: {},
    presupuestoTotalMensual: 0,
    metasGastoPct: {fijo:45, variable:17},
    datosTransferencia: {nombre:'', rut:'', banco:'', tipoCuenta:'', numeroCuenta:'', email:''},
    metasInversion: [],
    plataformas: {},
    planificador: {base:0, metaPcts:{}},
    metasTotalChecks: {},
    presupuestoAvisosEnviados: {},
    months: [ym],
    monthLabel: monthLabelObj
  };
}

// El mismo formato que ya usaba "Respaldo en JSON" (buildBackupJSON), extendido con los
// checks del objetivo total y con los meses — antes esos dos no viajaban en el respaldo.
export function buildFullStateBlob(){
  return {
    // compartidoAjeno nunca se persiste -- se recalcula sola desde gastos_compartidos/
    // gasto_reparto cada vez (ver sincronizarGastosCompartidos), así nunca puede quedar
    // desincronizada de la fuente real ni duplicarse.
    transacciones: TX.filter(t=>!t.compartidoAjeno), categorias: CATS, mediosPago: MEDIOS,
    presupuestos: PRESUPUESTOS, presupuestoTotalMensual: presupuestoTotalMensual,
    metasGastoPct: METAS_GASTO_PCT, datosTransferencia: DATOS_TRANSFERENCIA,
    metasInversion: METAS_INVERSION, plataformas: PLATAFORMA_DATA, planificador: PLANIFICADOR,
    metasTotalChecks: METAS_TOTAL_CHECKS, presupuestoAvisosEnviados: PRESUPUESTO_AVISOS_ENVIADOS,
    months: MONTHS, monthLabel: MONTH_LABEL
  };
}

// CATS, MEDIOS, MONTHS y MONTH_LABEL son const — se vacían y se vuelven a llenar en el
// mismo objeto/arreglo, nunca se reasignan. TX, PRESUPUESTOS, METAS_INVERSION,
// PLATAFORMA_DATA, PLANIFICADOR y METAS_TOTAL_CHECKS son let — esas sí se reasignan directo.
export function applyStateBlob(blob){
  Object.keys(CATS).forEach(function(k){ delete CATS[k]; });
  Object.assign(CATS, blob.categorias || {});
  Object.keys(MEDIOS).forEach(function(k){ delete MEDIOS[k]; });
  Object.assign(MEDIOS, blob.mediosPago || {});

  setTX(blob.transacciones || []);
  setPRESUPUESTOS(blob.presupuestos || {});
  setPresupuestoTotalMensual(blob.presupuestoTotalMensual || 0);
  setMETAS_GASTO_PCT(blob.metasGastoPct || {fijo:45, variable:17});
  setDATOS_TRANSFERENCIA(blob.datosTransferencia || {nombre:'', rut:'', banco:'', tipoCuenta:'', numeroCuenta:'', email:''});
  setMETAS_INVERSION(blob.metasInversion || []);
  setPLATAFORMA_DATA(blob.plataformas || {});
  setMETAS_TOTAL_CHECKS(blob.metasTotalChecks || {});
  setPRESUPUESTO_AVISOS_ENVIADOS(blob.presupuestoAvisosEnviados || {});

  const ym = todayISO().slice(0,7);
  const meses = (blob.months && blob.months.length) ? blob.months.slice().sort() : [ym];
  MONTHS.length = 0;
  meses.forEach(function(m){ MONTHS.push(m); });
  Object.keys(MONTH_LABEL).forEach(function(k){ delete MONTH_LABEL[k]; });
  const ml = blob.monthLabel || {};
  MONTHS.forEach(function(m){ MONTH_LABEL[m] = ml[m] || monthLabelFor(m); });

  setPLANIFICADOR(blob.planificador || getPlanificadorDefaults());

  // que los ids nuevos sigan después de lo cargado, no desde el número fijo de la demo
  setMetaIdCounter(METAS_INVERSION.reduce(function(mx,m){
    const n = parseInt(String(m.id).replace(/[^0-9]/g,''),10);
    return isNaN(n) ? mx : Math.max(mx,n);
  }, 0));
  setImportIdCounter(TX.reduce(function(mx,t){
    if(!/^timp/.test(t.id)) return mx;
    const n = parseInt(t.id.replace('timp',''),10);
    return isNaN(n) ? mx : Math.max(mx,n);
  }, 0));

  state.monthIndex = currentMonthIndex();
  state.tab = 'transacciones'; state.resumenSub = 'balance'; state.menuSection = null;
  state.openTxId = null; state.creatingNew = false; state.draftTx = null;
  state.categoryFilter = null; state.categoryFilterMonth = null; state.evoSelectedMonth = null;
  state.editingPlatformId = null; state.creatingPlatform = false;
  state.confirmDeletePlatformId = null; state.confirmArchivePlatformId = null; state.confirmDeleteTxId = null;
  state.demoMode = false;
}

/* ---------- indicador de guardado (pastilla chica junto al título) ----------
   A pedido: el guardado normal (mientras escribe, al tocar algo) debe pasar solo, sin
   avisarle con palabras que está "Guardando…" ni "Guardado" — se entiende solo, sin que se
   lo digamos. La única vez que SÍ vale la pena avisar es cuando algo salió mal de verdad
   (sin conexión, no se guardó) — eso sí puede llevarla a perder datos sin darse cuenta, así
   que ese caso se sigue mostrando. */
export let syncHideTimer = null;
export function updateSyncIndicator(status){
  const el = document.getElementById('sync-indicator');
  if(!el) return;
  clearTimeout(syncHideTimer);
  el.classList.toggle('error', status==='error');
  if(status==='error'){
    el.hidden = false; el.textContent = 'Sin conexión — no se guardó';
  } else {
    el.hidden = true;
  }
}

/* ---------- guardar en Supabase (con espera corta para no escribir en cada tecla) ---------- */
export async function writeStateToSupabase(){
  if(!sb || !currentHouseholdId) return;
  const blobJSON = JSON.stringify(buildFullStateBlob());
  // Casi todo lo que pasa en la app (cambiar de pestaña, abrir una transacción, filtrar)
  // termina en un repintado del teléfono, y por eso agenda un guardado (ver autoSaveObserver
  // más abajo) — pero la mayoría de esos repintados no cambiaron ningún dato real, solo la
  // pantalla. Si el estado es idéntico al último que se guardó, no hay nada que escribir:
  // ni llamada a Supabase ni "Guardando…/Guardado" en pantalla. Así el indicador aparece
  // solo cuando de verdad se guardó algo nuevo.
  if(blobJSON === lastSavedBlobJSON) return;
  updateSyncIndicator('saving');
  try{
    const { error } = await sb.from('app_state').update({
      data: JSON.parse(blobJSON),
      updated_at: new Date().toISOString(),
      updated_by: currentUser ? currentUser.id : null
    }).eq('household_id', currentHouseholdId);
    if(error){ console.error('Pitucas sin lucas — error guardando en Supabase:', error); updateSyncIndicator('error'); return; }
    lastSavedBlobJSON = blobJSON;
    updateSyncIndicator('saved');
    // Justo después de un guardado real (no de cualquier repintado) es el único momento en
    // que el gasto de una categoría pudo haber cambiado -- por eso se revisa acá si algún
    // presupuesto cruzó recién un umbral, no en cada render.
    checkPresupuestoPushAvisos();
  }catch(err){
    console.error('Pitucas sin lucas — error de red guardando en Supabase:', err);
    updateSyncIndicator('error');
  }
}
export function scheduleSave(){
  if(suppressAutoSave || !sb || !currentHouseholdId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeStateToSupabase, 1200);
}
// Cualquier cambio de datos en esta app termina, casi siempre, en un re-render de algún
// pedazo del teléfono — no hay un único punto "el estado cambió" al que engancharse (son
// decenas de handlers, cada uno llamando a su propio render*()). En vez de instrumentar cada
// uno, se observa el DOM del teléfono completo: cualquier repintado agenda un guardado
// (con espera corta, así una racha de clicks solo guarda una vez al final) — el chequeo de
// "¿en verdad cambió algo?" queda adentro de writeStateToSupabase (arriba), no acá, así que
// navegar entre pantallas agenda un guardado que después se descarta solo, sin tocar la red.
// OJO: el propio indicador "Guardando…/Guardado" vive DENTRO de #phone y se actualiza
// en cada guardado — si no se excluye acá, cada actualización del indicador dispara una
// mutación, que agenda OTRO guardado, que vuelve a actualizar el indicador... un loop
// infinito de "Guardando/Guardado" sin que la usuaria haya tocado nada. Por eso se ignora
// un lote de mutaciones cuando TODAS ocurrieron adentro del propio indicador.
// syncIndicatorEl/autoSaveObserver y el resto del arranque (registrar el listener del
// auth-form, revisar si ya había sesión abierta) viven dentro de initSupabaseAuth() más abajo
// -- ver la nota junto a "export let sb" sobre por qué no pueden ser efectos secundarios de
// nivel de módulo acá arriba.

/* ---------- auth-gate: UI ---------- */
export function showAuthError(msg){
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.hidden = false;
}
export function clearAuthError(){
  const el = document.getElementById('auth-error');
  el.hidden = true; el.textContent = '';
}
export function showAuthHint(msg, success){
  const el = document.getElementById('auth-hint');
  el.textContent = msg; el.hidden = false;
  el.classList.toggle('success', !!success);
}
export function clearAuthHint(){
  const el = document.getElementById('auth-hint');
  el.hidden = true; el.textContent = ''; el.classList.remove('success');
}
export function setAuthLoading(isLoading){
  const btn = document.getElementById('auth-submit-btn') as HTMLButtonElement;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Un momento…' : (authMode==='login' ? 'Iniciar sesión' : 'Crear cuenta');
}
// Al abrir la app, todavía no sabemos si ya había sesión iniciada — antes de tener esa
// respuesta de Supabase, mostrábamos directo el formulario de "Iniciar sesión", así que
// quien ya tenía sesión abierta veía un destello de esa pantalla antes de entrar a sus
// datos. Ahora, mientras se resuelve esa pregunta, se ve solo un loader neutro (ni
// formulario ni app) — recién se muestra el formulario si de verdad no hay sesión.
export function showAuthChecking(){
  document.getElementById('auth-checking').hidden = false;
  document.getElementById('auth-content').hidden = true;
}
export function showAuthForm(){
  document.getElementById('auth-checking').hidden = true;
  document.getElementById('auth-content').hidden = false;
}
export function switchAuthMode(mode){
  authMode = mode;
  clearAuthError(); clearAuthHint();
  document.querySelectorAll('[data-auth-tab]').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-auth-tab')===mode);
  });
  document.getElementById('auth-password').setAttribute('autocomplete', mode==='signup' ? 'new-password' : 'current-password');
  setAuthLoading(false);
}
export function translateAuthError(err){
  const msg = (err && err.message) || '';
  if(/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if(/User already registered/i.test(msg)) return 'Ya existe una cuenta con ese correo — intenta iniciar sesión.';
  if(/Password should be at least|password.*6/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if(/Unable to validate email|invalid.*email/i.test(msg)) return 'Ese correo no parece válido.';
  if(/Failed to fetch|NetworkError|network/i.test(msg)) return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
  return msg || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

export async function handleAuthSubmit(){
  if(!sb){ showAuthError('No se pudo cargar la conexión con el servidor. Recarga la página.'); return; }
  const email = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
  const password = (document.getElementById('auth-password') as HTMLInputElement).value;
  clearAuthError(); clearAuthHint();
  if(!email || !password){ showAuthError('Completa tu correo y tu contraseña.'); return; }
  if(password.length<6){ showAuthError('La contraseña debe tener al menos 6 caracteres.'); return; }
  setAuthLoading(true);
  try{
    if(authMode==='login'){
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw error;
      // sb.auth.onAuthStateChange sigue solo desde acá (evento SIGNED_IN)
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if(error) throw error;
      if(!data.session){
        // proyecto con confirmación de correo activada: no queda sesión hasta que confirme
        setAuthLoading(false);
        switchAuthMode('login');
        showAuthHint('Cuenta creada — revisa tu correo ('+email+') para confirmarla, y después inicia sesión aquí.', true);
        return;
      }
      // si el proyecto no pide confirmación, ya llega con sesión y onAuthStateChange sigue solo
    }
  }catch(err){
    setAuthLoading(false);
    showAuthError(translateAuthError(err));
  }
}
// El listener del auth-form vive dentro de initSupabaseAuth() más abajo.

/* ---------- cargar/guardar el hogar real tras autenticarse ---------- */
export async function onAuthenticated(user){
  if(currentUser && currentUser.id===user.id) return; // ya está cargado, no repetir
  currentUser = user;
  setAuthLoading(true);
  showAuthHint('Cargando tus datos…', false);
  try{
    const { data: memberRows, error: memberErr } = await sb.from('household_members').select('household_id').eq('user_id', user.id).limit(1);
    if(memberErr) throw memberErr;
    if(!memberRows || !memberRows.length){
      throw new Error('Tu cuenta todavía no tiene un hogar asociado. Cierra sesión, espera unos segundos y vuelve a entrar — se crea automáticamente al registrarte.');
    }
    currentHouseholdId = memberRows[0].household_id;
    // El código de importación (import_token) del hogar se usa para el import por correo Y
    // para las notificaciones push (así el Worker puede validar "de qué hogar es esto" sin
    // que tenga tu sesión) — se trae acá, apenas hay hogar, para no depender de que ella
    // abra la pantalla de "Importar desde tu correo" primero. Si falla, no es grave: esa
    // pantalla lo vuelve a intentar sola, y el push simplemente no se manda por ahora.
    try{
      const { data: hhRow, error: hhErr } = await sb.from('households').select('import_token').eq('id', currentHouseholdId).single();
      if(!hhErr && hhRow){ state.importToken = hhRow.import_token; state.importCorreoLoaded = true; }
    }catch(e){ console.error('Pitucas sin lucas — error precargando el código de importación:', e); }
    const { data: stateRow, error: stateErr } = await sb.from('app_state').select('data').eq('household_id', currentHouseholdId).single();
    if(stateErr) throw stateErr;
    const blob = (stateRow && stateRow.data) || {};
    suppressAutoSave = true;
    if(!blob || !Object.keys(blob).length){
      applyStateBlob(emptyAppStateBlob());
      lastSavedBlobJSON = null; // fuerza el guardado inicial de abajo, aunque esté vacío
      await writeStateToSupabase(); // deja guardado el estado vacío recién armado
    } else {
      applyStateBlob(blob);
      lastSavedBlobJSON = JSON.stringify(buildFullStateBlob()); // ya está guardado tal cual en Supabase
    }
    document.getElementById('auth-gate').hidden = true;
    clearAuthError(); clearAuthHint();
    render();
    setTimeout(function(){
      suppressAutoSave = false;
      absorbImportedRows();
      cargarGastosCompartidos();
      suscribirseAGruposEnVivo();
    }, 0);
  }catch(err){
    console.error('Pitucas sin lucas — error cargando datos del hogar:', err);
    setAuthLoading(false);
    showAuthForm(); // si falla, hay que mostrar el formulario para que vea el error (estaba oculto)
    showAuthError(translateAuthError(err));
  }
}

export function resetToLoggedOutState(){
  suppressAutoSave = true;
  applyStateBlob(emptyAppStateBlob());
  setGRUPOS([]); setGRUPO_PARTICIPANTES([]); setGASTOS_COMPARTIDOS([]); setSALDOS_PAGADOS([]); setMAPEO_CATEGORIAS([]);
  state.espacio = 'personal'; state.grupoAbiertoId = null;
  if(gruposRealtimeChannel && sb){ sb.removeChannel(gruposRealtimeChannel); setGruposRealtimeChannel(null); }
  state.importCorreoLoaded = false; state.importCorreoError = null; state.importToken = null;
  state.notifLoaded = false; state.notifError = null; state.notifSubscribed = false; state.notifBusy = false;
  state.notifTestBusy = false; state.notifTestResult = null;
  (document.getElementById('auth-email') as HTMLInputElement).value = '';
  (document.getElementById('auth-password') as HTMLInputElement).value = '';
  clearAuthError(); clearAuthHint();
  switchAuthMode('login');
  document.getElementById('auth-gate').hidden = false;
  showAuthForm();
  setTimeout(function(){ suppressAutoSave = false; }, 0);
}

export async function handleLogout(){
  clearTimeout(saveTimer);
  if(currentHouseholdId) await writeStateToSupabase();
  if(sb) await sb.auth.signOut();
  currentUser = null; currentHouseholdId = null;
  resetToLoggedOutState();
}

/* ---------- arranque: crear el cliente, enganchar todos los listeners, revisar sesión ----------
   Todo esto era código de nivel de módulo al final del app.ts original (por eso corría recién
   después del primer render() con datos de ejemplo, que ocurre unas líneas más arriba en el
   archivo original). Acá queda como una función explícita que app.ts llama a mano en el mismo
   punto, para conservar exactamente el mismo orden ahora que este archivo es un módulo aparte
   (si esto corriera como efecto secundario de solo importar el archivo, se adelantaría a ese
   primer render()). */
export function initSupabaseAuth(){
  sb = (typeof window!=='undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const syncIndicatorEl = document.getElementById('sync-indicator');
  const autoSaveObserver = new MutationObserver(function(mutList){
    const soloIndicador = syncIndicatorEl && mutList.every(function(m){
      return m.target === syncIndicatorEl || syncIndicatorEl.contains(m.target);
    });
    if(soloIndicador) return;
    scheduleSave();
  });
  autoSaveObserver.observe(phone, {childList:true, subtree:true, characterData:true});
  // Si la pestaña se oculta (se cambia de app, se apaga la pantalla, etc.) conviene guardar
  // de inmediato en vez de esperar los 1200ms, por si no vuelve a abrirse a tiempo.
  document.addEventListener('visibilitychange', function(){
    if(document.hidden && saveTimer){ clearTimeout(saveTimer); writeStateToSupabase(); }
  });

  document.getElementById('auth-form').addEventListener('submit', function(e: any){
    e.preventDefault();
    handleAuthSubmit();
  });

  /* ---------- ¿ya había una sesión abierta? ---------- */
  if(sb){
    sb.auth.onAuthStateChange(function(event, session){
      if(event==='SIGNED_OUT'){
        if(currentUser){ currentUser = null; currentHouseholdId = null; resetToLoggedOutState(); }
        return;
      }
      if(session && session.user) onAuthenticated(session.user);
    });
    sb.auth.getSession().then(function(res){
      const session = res && res.data && res.data.session;
      if(session && session.user) onAuthenticated(session.user);
      else { setAuthLoading(false); showAuthForm(); }
    }).catch(function(err){
      console.error('Pitucas sin lucas — error obteniendo la sesión:', err);
      setAuthLoading(false);
      showAuthForm();
      showAuthError('No se pudo conectar con el servidor. Revisa tu internet y recarga la página.');
    });
  } else {
    setAuthLoading(false);
    showAuthForm();
    showAuthError('No se pudo cargar la librería de conexión (revisa tu internet y recarga la página).');
  }
}
