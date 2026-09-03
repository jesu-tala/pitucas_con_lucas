import { phone } from './events';
import { render } from './render';
import { monthLabelFor } from './shared-expenses';
import { CATEGORIES, CATEGORY_SEED_DEFAULTS, TRANSFER_INFO, PAYMENT_METHODS, SPENDING_GOAL_PCT, INVESTMENT_GOALS, TOTAL_GOAL_CHECKS, MONTHS, MONTH_LABEL, PLANNER, PLATFORM_DATA, BUDGETS, BUDGET_ALERTS_SENT, TRANSACTIONS, currentMonthIndex, getPlannerDefaults, importIdCounter, goalIdCounter, monthlyBudgetTotal, setTransferInfo, setSharedExpenses, setGroups, setGroupParticipants, setImportIdCounter, setCategoryMappings, setSpendingGoalPct, setInvestmentGoals, setTotalGoalChecks, setGoalIdCounter, setPlanner, setPlatformData, setBudgets, setBudgetAlertsSent, setMonthlyBudgetTotal, setPaidBalances, setTransactions, state, todayISO } from './state';
import { absorbImportedRows, loadSharedExpenses, checkBudgetPushAlerts, groupsRealtimeChannel, setGroupsRealtimeChannel, subscribeToGroupsLive } from './views/menu';
/* ===================== SUPABASE: ACCOUNTS + CLOUD SAVING =====================
   Up to this point everything ran the same as the mockup: it rendered with the sample data
   (Fran/Cata/Sushi Itto, etc.) while it's resolved whether there's a real session or not. Everything
   below replaces that sample data with the real household data of the person
   who signed in (or with a freshly created empty state, if it's a new account) —
   they're never mixed nor saved over the demo data. */
export const SUPABASE_URL = 'https://wuxdctmhbuttzssiknkt.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_uLIIyeomS52mPIie__KvAA_ErW-lYhb';
// Push notifications: the public VAPID key (safe to have here, it's public by design —
// the private one lives ONLY as a secret in the Cloudflare Worker) and the URL of that Worker, which is
// the one that actually sends the notifications (see cloudflare-worker/worker.js).
export const VAPID_PUBLIC_KEY = 'BBVwNyDtQKLPpTNpIRMLpl13w9_3ucBwbZKyStc-v5LFU3shPh9Q7HfrmDxR4m60riF1-3dGth9Iwe3BOTgF_uk';
// Replace this with the real URL of your Worker once you deploy it (Cloudflare
// shows it to you as soon as you create the Worker, something like https://your-worker.your-account.workers.dev).
export const PUSH_WORKER_URL = 'https://curly-thunder-b4c6.talajesu.workers.dev';
// The actual creation of the client (and everything below that depends on it existing) was moved
// to initSupabaseAuth() -- if this ran as a module-level side effect (just from
// importing this file), it would run BEFORE the first render() with the sample
// data that app.ts does on startup, reversing the order the app had as a single
// piece (further down, in the original file, that startup happened textually after the
// first render()). app.ts calls initSupabaseAuth() by hand, after that first render(),
// to preserve the same order.
export let sb: any = null;

export let currentUser = null;          // Supabase Auth user object, or null if there's no session
export let currentHouseholdId = null;   // uuid of the household whose data is currently loaded
export let authMode = 'login';          // 'login' | 'signup' — which auth-gate tab is active
export let suppressAutoSave = true;     // true while loaded data is being applied (so as not to
                                  // save back what was just read)
export let saveTimer = null;
export let lastSavedBlobJSON = null;    // last state already saved in Supabase — so as not to save again
                                  // (nor show "Saving…") when the DOM changed but the
                                  // actual data is the same (see writeStateToSupabase)

export function emptyAppStateBlob(){
  const ym = todayISO().slice(0,7);
  const catsBase = {};
  Object.keys(CATEGORY_SEED_DEFAULTS).forEach(function(k){ catsBase[k] = Object.assign({}, CATEGORY_SEED_DEFAULTS[k]); });
  const monthLabelObj = {}; monthLabelObj[ym] = monthLabelFor(ym);
  return {
    transacciones: [],
    categorias: catsBase,
    mediosPago: {efectivo:{nombre:'Efectivo', corto:'Efectivo', icon:'cash'}},
    presupuestos: {},
    monthlyBudgetTotal: 0,
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

// The same format already used by "JSON Backup" (buildBackupJSON), extended with the
// total-goal checks and the months — previously those two didn't travel in the backup.
export function buildFullStateBlob(){
  return {
    // sharedByOthers is never persisted -- it's recalculated on its own from gastos_compartidos/
    // gasto_reparto every time (see syncSharedExpenses), so it can never end up
    // out of sync with the real source or duplicated.
    transacciones: TRANSACTIONS.filter(t=>!t.sharedByOthers), categorias: CATEGORIES, mediosPago: PAYMENT_METHODS,
    presupuestos: BUDGETS, monthlyBudgetTotal: monthlyBudgetTotal,
    metasGastoPct: SPENDING_GOAL_PCT, datosTransferencia: TRANSFER_INFO,
    metasInversion: INVESTMENT_GOALS, plataformas: PLATFORM_DATA, planificador: PLANNER,
    metasTotalChecks: TOTAL_GOAL_CHECKS, presupuestoAvisosEnviados: BUDGET_ALERTS_SENT,
    months: MONTHS, monthLabel: MONTH_LABEL
  };
}

// CATEGORIES, PAYMENT_METHODS, MONTHS and MONTH_LABEL are const — they get emptied and refilled in the
// same object/array, never reassigned. TRANSACTIONS, BUDGETS, INVESTMENT_GOALS,
// PLATFORM_DATA, PLANNER and TOTAL_GOAL_CHECKS are let — those do get reassigned directly.
export function applyStateBlob(blob){
  Object.keys(CATEGORIES).forEach(function(k){ delete CATEGORIES[k]; });
  Object.assign(CATEGORIES, blob.categorias || {});
  Object.keys(PAYMENT_METHODS).forEach(function(k){ delete PAYMENT_METHODS[k]; });
  Object.assign(PAYMENT_METHODS, blob.mediosPago || {});

  setTransactions(blob.transacciones || []);
  setBudgets(blob.presupuestos || {});
  setMonthlyBudgetTotal(blob.monthlyBudgetTotal || 0);
  setSpendingGoalPct(blob.metasGastoPct || {fijo:45, variable:17});
  setTransferInfo(blob.datosTransferencia || {nombre:'', rut:'', banco:'', tipoCuenta:'', numeroCuenta:'', email:''});
  setInvestmentGoals(blob.metasInversion || []);
  setPlatformData(blob.plataformas || {});
  setTotalGoalChecks(blob.metasTotalChecks || {});
  setBudgetAlertsSent(blob.presupuestoAvisosEnviados || {});

  const ym = todayISO().slice(0,7);
  const meses = (blob.months && blob.months.length) ? blob.months.slice().sort() : [ym];
  MONTHS.length = 0;
  meses.forEach(function(m){ MONTHS.push(m); });
  Object.keys(MONTH_LABEL).forEach(function(k){ delete MONTH_LABEL[k]; });
  const ml = blob.monthLabel || {};
  MONTHS.forEach(function(m){ MONTH_LABEL[m] = ml[m] || monthLabelFor(m); });

  setPlanner(blob.planificador || getPlannerDefaults());

  // so new ids continue after what was loaded, not from the fixed demo number
  setGoalIdCounter(INVESTMENT_GOALS.reduce(function(mx,m){
    const n = parseInt(String(m.id).replace(/[^0-9]/g,''),10);
    return isNaN(n) ? mx : Math.max(mx,n);
  }, 0));
  setImportIdCounter(TRANSACTIONS.reduce(function(mx,t){
    if(!/^timp/.test(t.id)) return mx;
    const n = parseInt(t.id.replace('timp',''),10);
    return isNaN(n) ? mx : Math.max(mx,n);
  }, 0));

  state.monthIndex = currentMonthIndex();
  state.tab = 'transacciones'; state.summarySub = 'balance'; state.menuSection = null;
  state.openTxId = null; state.creatingNew = false; state.draftTx = null;
  state.categoryFilter = null; state.categoryFilterMonth = null; state.evolutionSelectedMonth = null;
  state.editingPlatformId = null; state.creatingPlatform = false;
  state.confirmDeletePlatformId = null; state.confirmArchivePlatformId = null; state.confirmDeleteTxId = null;
  state.demoMode = false;
}

/* ---------- save indicator (small pill next to the title) ----------
   As requested: normal saving (while typing, when tapping something) should happen quietly, without
   telling her in words that it's "Saving…" or "Saved" — it's understood on its own, without us
   saying it. The only time it IS worth notifying is when something really went wrong
   (no connection, it didn't save) — that could make her lose data without realizing it, so
   that case is still shown. */
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

/* ---------- save to Supabase (with a short wait so it doesn't write on every keystroke) ---------- */
export async function writeStateToSupabase(){
  if(!sb || !currentHouseholdId) return;
  const blobJSON = JSON.stringify(buildFullStateBlob());
  // Almost everything that happens in the app (switching tabs, opening a transaction, filtering)
  // ends up in a repaint of the phone, and that's why it schedules a save (see autoSaveObserver
  // below) — but most of those repaints didn't change any real data, only the
  // screen. If the state is identical to the last one saved, there's nothing to write:
  // no call to Supabase and no "Saving…/Saved" on screen. That way the indicator appears
  // only when something new was actually saved.
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
    // Right after an actual save (not just any repaint) is the only moment when
    // a category's spending could have changed -- that's why it's checked here whether some
    // budget just crossed a threshold, not on every render.
    checkBudgetPushAlerts();
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
// Any data change in this app almost always ends up in a re-render of some
// piece of the phone — there's no single "the state changed" point to hook into (there are
// dozens of handlers, each calling its own render*()). Instead of instrumenting each
// one, the entire phone DOM is observed: any repaint schedules a save
// (with a short wait, so a burst of clicks only saves once at the end) — the check for
// "did anything actually change?" stays inside writeStateToSupabase (above), not here, so
// navigating between screens schedules a save that later gets discarded on its own, without touching the network.
// NOTE: the "Saving…/Saved" indicator itself lives INSIDE #phone and gets updated
// on every save — if it's not excluded here, every update of the indicator triggers a
// mutation, which schedules ANOTHER save, which updates the indicator again... an
// infinite "Saving/Saved" loop without the user having touched anything. That's why
// a batch of mutations is ignored when ALL of them happened inside the indicator itself.
// syncIndicatorEl/autoSaveObserver and the rest of the startup (registering the
// auth-form listener, checking whether there was already a session open) live inside initSupabaseAuth() below
// -- see the note next to "export let sb" about why they can't be
// module-level side effects up here.

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
// When the app opens, we still don't know whether a session was already active — before having that
// answer from Supabase, we used to show the "Sign in" form directly, so
// anyone who already had a session open would see a flash of that screen before getting into their
// data. Now, while that question is being resolved, only a neutral loader is shown (neither
// form nor app) — the form is only shown once it's confirmed there really is no session.
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
      // sb.auth.onAuthStateChange continues on its own from here (SIGNED_IN event)
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if(error) throw error;
      if(!data.session){
        // project with email confirmation enabled: there's no session until they confirm
        setAuthLoading(false);
        switchAuthMode('login');
        showAuthHint('Cuenta creada — revisa tu correo ('+email+') para confirmarla, y después inicia sesión aquí.', true);
        return;
      }
      // if the project doesn't require confirmation, it already arrives with a session and onAuthStateChange continues on its own
    }
  }catch(err){
    setAuthLoading(false);
    showAuthError(translateAuthError(err));
  }
}
// The auth-form listener lives inside initSupabaseAuth() below.

/* ---------- load/save the real household after authenticating ---------- */
export async function onAuthenticated(user){
  if(currentUser && currentUser.id===user.id) return; // already loaded, don't repeat
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
    // The household's import code (import_token) is used for the email import AND
    // for push notifications (so the Worker can validate "which household is this" without
    // having your session) — it's fetched here, as soon as there's a household, so as not to depend on her
    // opening the "Import from your email" screen first. If it fails, it's not serious: that
    // screen retries it on its own, and the push simply won't be sent for now.
    try{
      const { data: hhRow, error: hhErr } = await sb.from('households').select('import_token').eq('id', currentHouseholdId).single();
      if(!hhErr && hhRow){ state.importToken = hhRow.import_token; state.emailImportLoaded = true; }
    }catch(e){ console.error('Pitucas sin lucas — error precargando el código de importación:', e); }
    const { data: stateRow, error: stateErr } = await sb.from('app_state').select('data').eq('household_id', currentHouseholdId).single();
    if(stateErr) throw stateErr;
    const blob = (stateRow && stateRow.data) || {};
    suppressAutoSave = true;
    if(!blob || !Object.keys(blob).length){
      applyStateBlob(emptyAppStateBlob());
      lastSavedBlobJSON = null; // forces the initial save below, even though it's empty
      await writeStateToSupabase(); // saves the freshly built empty state
    } else {
      applyStateBlob(blob);
      lastSavedBlobJSON = JSON.stringify(buildFullStateBlob()); // it's already saved as-is in Supabase
    }
    document.getElementById('auth-gate').hidden = true;
    clearAuthError(); clearAuthHint();
    render();
    setTimeout(function(){
      suppressAutoSave = false;
      absorbImportedRows();
      loadSharedExpenses();
      subscribeToGroupsLive();
    }, 0);
  }catch(err){
    console.error('Pitucas sin lucas — error cargando datos del hogar:', err);
    setAuthLoading(false);
    showAuthForm(); // if it fails, the form needs to be shown so she can see the error (it was hidden)
    showAuthError(translateAuthError(err));
  }
}

export function resetToLoggedOutState(){
  suppressAutoSave = true;
  applyStateBlob(emptyAppStateBlob());
  setGroups([]); setGroupParticipants([]); setSharedExpenses([]); setPaidBalances([]); setCategoryMappings([]);
  state.workspace = 'personal'; state.openGroupId = null;
  if(groupsRealtimeChannel && sb){ sb.removeChannel(groupsRealtimeChannel); setGroupsRealtimeChannel(null); }
  state.emailImportLoaded = false; state.emailImportError = null; state.importToken = null;
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

/* ---------- startup: create the client, hook up all the listeners, check the session ----------
   All of this used to be module-level code at the end of the original app.ts (which is why it only ran
   after the first render() with sample data, which happens a few lines above in the
   original file). Here it stays as an explicit function that app.ts calls by hand at the same
   point, to preserve exactly the same order now that this file is a separate module
   (if this ran as a side effect of just importing the file, it would run ahead of that
   first render()). */
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
  // If the tab gets hidden (switching apps, the screen turns off, etc.) it's better to save
  // right away instead of waiting the 1200ms, in case it doesn't get reopened in time.
  document.addEventListener('visibilitychange', function(){
    if(document.hidden && saveTimer){ clearTimeout(saveTimer); writeStateToSupabase(); }
  });

  document.getElementById('auth-form').addEventListener('submit', function(e: any){
    e.preventDefault();
    handleAuthSubmit();
  });

  /* ---------- was there already a session open? ---------- */
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
