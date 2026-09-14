import { Category, Group, GroupParticipant, InvestmentGoal, PlatformData, SharedExpense, Transaction } from './types';
import {
  CATEGORY_SEED_DEFAULTS, GROUPS, GROUP_PARTICIPANTS, PAID_BALANCES, SHARED_EXPENSES, CATEGORY_MAPPINGS,
  setCategoryMappings, setGroupParticipants, setGroups, setPaidBalances, setSharedExpenses, state
} from './state';
import { applyStateBlob, buildFullStateBlob, currentUser, sb, setSb } from './supabase';
import { groupsRealtimeChannel, setGroupsRealtimeChannel, subscribeToGroupsLive } from './views/menu';
import { render } from './render';

/* ===================== MODO DEMO: datos sintéticos =====================
   "Reemplazo, no ocultamiento": activar demo no enmascara los números reales (eso era el
   comportamiento viejo, ver money()/moneyPlainMasked() en state.ts) -- reemplaza TODA la data
   por un set sintético fijo y curado que se ve completo, mientras la data real queda intacta
   en memoria (nunca en el storage/Supabase real -- ver enterDemoMode) hasta que se desactiva.

   Mecanismo central: buildFullStateBlob()/applyStateBlob() (supabase.ts) ya son el único punto
   por el que pasa TODO el estado persistible al cargar una cuenta real -- reusarlos acá es
   literalmente "una sola fuente de datos conmutable" en vez de parchar pantalla por pantalla:
   entrar a demo hace un snapshot con buildFullStateBlob() y aplica el blob sintético con
   applyStateBlob(); salir aplica de vuelta el snapshot guardado. Grupos/gastos compartidos viven
   en tablas aparte (fuera de app_state, ver DOCUMENTACION.md sección 5) así que esas 5
   colecciones (GROUPS/GROUP_PARTICIPANTS/SHARED_EXPENSES/PAID_BALANCES/CATEGORY_MAPPINGS) se
   guardan/restauran a mano junto al blob.

   Sin efectos secundarios: mientras demo está activo, `sb` (el cliente de Supabase) se pone en
   null -- todo el código de la app ya revisa "if(!sb) return" antes de escribir o leer de
   Supabase (guardado automático, crear/eliminar grupo, importar por correo, leer boleta con
   OCR...), así que nulear esa única referencia bloquea todos esos caminos a la vez, sin tener
   que tocar cada función una por una. Los pocos caminos que NO dependían de `sb` (notificaciones
   push, reconciliar una cartola) se bloquean a mano con su propio chequeo de state.demoMode
   (ver enableNotifications/disableNotifications/sendTestPush/tryOpenStatementFile/
   useImportedStatement/importStatementRows en views/menu.ts). */

let realSnapshot: { blob: any; grupos: Group[]; participantes: GroupParticipant[]; gastosCompartidos: SharedExpense[]; saldosPagados: any[]; mapeoCategorias: any[]; sb: any } | null = null;

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function pad2(n: number): string { return n < 10 ? '0' + n : '' + n; }
function ymdOf(d: Date): string { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function ymOf(d: Date): string { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
// Day `day` of the month that is `monthsBack` months before today (clamped to that month's
// actual last day, e.g. day 31 in a 30-day month) -- this is what keeps the demo's dates always
// falling in the current month/year no matter when it's opened, while the fixture's CONTENT
// (amounts, comercios, categorías) stays exactly the same every time.
function dateInMonth(monthsBack: number, day: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return ymdOf(d);
}
function monthKey(monthsBack: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  return ymOf(d);
}
function monthLabelOf(monthsBack: number): string {
  const NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - monthsBack);
  return NOMBRES[d.getMonth()] + ' ' + d.getFullYear();
}

function demoCategories(): Record<string, Category> {
  const out: Record<string, Category> = {};
  Object.keys(CATEGORY_SEED_DEFAULTS).forEach(k => { out[k] = Object.assign({}, (CATEGORY_SEED_DEFAULTS as any)[k]); });
  // Las 4 plataformas de inversión de ejemplo (no están en CATEGORY_SEED_DEFAULTS -- esas nunca
  // se copian a una cuenta nueva de verdad, pero el demo SÍ quiere mostrar Inversiones lleno).
  out.fintual = { nombre: 'Fintual', tipo: 'inversion', colorHue: 160, icon: 'trending' };
  out.racional = { nombre: 'Racional', tipo: 'inversion', colorHue: 30, icon: 'trending' };
  out.banco_chile = { nombre: 'Banco de Chile', tipo: 'inversion', colorHue: 50, icon: 'bank' };
  out.buda = { nombre: 'Buda (cripto)', tipo: 'inversion', colorHue: 340, icon: 'coin' };
  return out;
}

function demoTransactions(): Transaction[] {
  const tx: Transaction[] = [];
  let n = 0;
  const id = () => 'demo_t' + (++n);
  // 5 meses de historia (mes actual + 4 anteriores) -- sueldo, gastos fijos/variables e
  // inversión en cada uno, para que Evolución/tasa de ahorro y Balance por año tengan datos.
  const sueldos = [1250000, 1250000, 1220000, 1200000, 1200000]; // [actual, -1, -2, -3, -4]
  for (let m = 4; m >= 0; m--) {
    const sueldo = sueldos[m];
    tx.push({ id: id(), fecha: dateInMonth(m, 25), hora: '07:50', comercio: 'Sueldo', monto: sueldo, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: sueldo }], porCobrar: [], reglaAuto: false, nota: '' });
    tx.push({ id: id(), fecha: dateInMonth(m, 5), hora: '10:00', comercio: 'Arriendo depto', monto: 380000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 380000 }], porCobrar: [], reglaAuto: true, nota: '' });
    tx.push({ id: id(), fecha: dateInMonth(m, 20), hora: '19:10', comercio: 'Jumbo Ñuñoa', monto: 48000 + m * 1000, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 48000 + m * 1000 }], porCobrar: [], reglaAuto: false, nota: '' });
    tx.push({ id: id(), fecha: dateInMonth(m, 14), hora: '18:00', comercio: 'Netflix', monto: 7990, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'suscripciones', monto: 7990 }], porCobrar: [], reglaAuto: true, nota: '' });
    tx.push({ id: id(), fecha: dateInMonth(m, 8), hora: '08:10', comercio: 'Copec Providencia', monto: 19000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 19000 }], porCobrar: [], reglaAuto: true, nota: '' });
    tx.push({ id: id(), fecha: dateInMonth(m, 10), hora: '10:00', comercio: 'Aporte Fintual', monto: 100000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'fintual', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' });
  }
  // ---- Mes actual: ejemplos de las demás features (reembolso, cobro a una persona, cuotas,
  // no-es-gasto, entradas por clasificar) para que se luzcan en Transacciones/Balance. ----
  tx.push({
    id: id(), fecha: dateInMonth(0, 12), hora: '12:30', comercio: 'Farmacias Ahumada', monto: 15200, medio: 'debito_bci',
    tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 15200 }],
    porCobrar: [{ persona: 'Isapre', monto: null, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }],
    reglaAuto: false, nota: 'Reembolso de la isapre en camino'
  });
  tx.push({
    id: id(), fecha: dateInMonth(0, 6), hora: '21:00', comercio: 'Restobar Lastarria', monto: 64000, medio: 'visa_bch',
    tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 64000 }],
    porCobrar: [
      { persona: 'Caro', monto: 21333, divisionValor: 1, pagado: true, tipo: 'persona', montoRecibido: 21333, linkedTxId: null },
      { persona: 'Pancho', monto: 21333, divisionValor: 1, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }
    ],
    pagadorDivisionValor: 1, reglaAuto: false, nota: 'Cumpleaños'
  });
  tx.push({
    id: id(), fecha: dateInMonth(0, 15), hora: '16:20', comercio: 'Falabella · Notebook', monto: 30000, medio: 'visa_bch',
    tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 30000 }],
    porCobrar: [], reglaAuto: false, nota: '', cuotas: { total: 3, montoTotal: 90000 }
  });
  tx.push({
    id: id(), fecha: dateInMonth(0, 3), hora: '14:10', comercio: 'Transferencia entre mis cuentas', monto: 200000, medio: 'cuenta_vista',
    tipo: 'gasto', recurrencia: 'variable', estado: 'no_es_gasto', categorias: [], porCobrar: [], reglaAuto: false, nota: 'Traspaso, no es un gasto real'
  });
  tx.push({
    id: id(), fecha: dateInMonth(0, 16), hora: '09:00', comercio: 'Freelance diseño web', monto: 180000, medio: 'cuenta_vista',
    tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'pololos_extra', monto: 180000 }], porCobrar: [], reglaAuto: false, nota: ''
  });
  tx.push({
    id: id(), fecha: dateInMonth(0, 2), hora: '12:00', comercio: 'Venta bicicleta vieja', monto: 40000, medio: 'efectivo',
    tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: ''
  });
  return tx;
}

function demoBudgets() {
  return {
    supermercado: { meta: 180000, alertas: { 80: true, 90: true, 100: true } },
    transporte: { meta: 90000, alertas: { 80: true, 90: false, 100: true } },
    restoranes: { meta: 60000, alertas: { 80: true, 90: true, 100: true } },
    hogar: { meta: 420000, alertas: { 80: false, 90: false, 100: true } },
    salud: { meta: 30000, alertas: { 80: true, 90: true, 100: true } },
    suscripciones: { meta: 15000, alertas: { 80: true, 90: true, 100: true } }
  };
}

function demoPlatformData(): Record<string, PlatformData> {
  const hist = (base: number, step: number) => {
    const out: Record<string, number> = {};
    for (let m = 4; m >= 0; m--) out[monthKey(m)] = base + (4 - m) * step;
    return out;
  };
  return {
    fintual: { valorHistorial: hist(81600, 105000), fechaActualizacion: dateInMonth(0, 10), tasaAnual: null, comision: null, plazo: 'largo' },
    racional: { valorHistorial: hist(40800, 33000), fechaActualizacion: dateInMonth(1, 10), tasaAnual: null, comision: null, plazo: 'largo' },
    banco_chile: { valorHistorial: hist(3700000, 450000), fechaActualizacion: dateInMonth(0, 5), tasaAnual: null, comision: null, plazo: null },
    buda: { valorHistorial: hist(200000, 15000), fechaActualizacion: dateInMonth(1, 1), tasaAnual: null, comision: null, plazo: 'largo' }
  };
}

function demoInvestmentGoals(): InvestmentGoal[] {
  const startMonth = monthKey(4);
  return [
    { id: 'demo_m1', nombre: 'Fondo de emergencia', montoObjetivo: 3000000, aporteMensualMeta: 150000, plataformaId: 'banco_chile', plazo: 'corto', comision: null, startMonth, startingAmount: 2080000, checks: { [monthKey(4)]: true, [monthKey(3)]: true, [monthKey(2)]: true, [monthKey(1)]: true, [monthKey(0)]: true } },
    { id: 'demo_m2', nombre: 'Pie departamento', montoObjetivo: 8000000, aporteMensualMeta: 300000, plataformaId: 'banco_chile', plazo: 'medio', comision: null, startMonth, startingAmount: 3120000, checks: { [monthKey(4)]: true, [monthKey(3)]: true, [monthKey(2)]: true, [monthKey(1)]: true, [monthKey(0)]: true } },
    { id: 'demo_m3', nombre: 'Jubilación (APV)', aporteMensualMeta: 100000, plataformaId: 'fintual', plazo: 'largo', comision: null, startMonth, startingAmount: 0, checks: { [monthKey(4)]: true, [monthKey(3)]: true, [monthKey(2)]: true, [monthKey(1)]: true, [monthKey(0)]: true } },
    { id: 'demo_m4', nombre: 'Cripto largo plazo', aporteMensualMeta: 40000, plataformaId: 'buda', plazo: 'largo', comision: null, startMonth, startingAmount: 0, checks: { [monthKey(4)]: true, [monthKey(3)]: true, [monthKey(2)]: false, [monthKey(1)]: true, [monthKey(0)]: true } }
  ];
}

// El grupo de gastos compartidos vive FUERA de app_state (ver nota grande arriba) -- "Tú" tiene
// que apuntar al currentUser REAL (si hay sesión) para que myParticipantInGroup() te reconozca
// dentro del grupo sintético; sin sesión (ej. la vista previa sin login) cae a un id cualquiera.
function demoGroupsBundle() {
  const myId = currentUser ? (currentUser as any).id : 'demo-sin-sesion';
  const grupoId = 'demo_g1';
  const pYo = 'demo_p1', pCaro = 'demo_p2';
  const grupos: Group[] = [{ id: grupoId, nombre: 'Depto con Caro', icono: '🏠', creado_por: myId, invite_code: 'DEMO01', created_at: dateInMonth(1, 1) + 'T00:00:00Z' }];
  const participantes: GroupParticipant[] = [
    { id: pYo, grupo_id: grupoId, user_id: myId, nombre: 'Tú', color: 'lavender' },
    { id: pCaro, grupo_id: grupoId, user_id: null, nombre: 'Caro', color: 'mint' }
  ];
  const gastosCompartidos: SharedExpense[] = [
    {
      id: 'demo_se1', grupo_id: grupoId, descripcion: 'Supermercado del depto', categoria_origen: 'supermercado', monto: 64000,
      fecha: dateInMonth(0, 9), pagado_por: pYo, registrado_por: myId, division_tipo: 'iguales', tx_origen_id: null,
      reparto: [
        { id: 'demo_sp1', gasto_compartido_id: 'demo_se1', participante_id: pYo, monto: 32000 },
        { id: 'demo_sp2', gasto_compartido_id: 'demo_se1', participante_id: pCaro, monto: 32000 }
      ]
    },
    {
      id: 'demo_se2', grupo_id: grupoId, descripcion: 'Cuenta de la luz', categoria_origen: 'hogar', monto: 45000,
      fecha: dateInMonth(0, 4), pagado_por: pCaro, registrado_por: myId, division_tipo: 'iguales', tx_origen_id: null,
      reparto: [
        { id: 'demo_sp3', gasto_compartido_id: 'demo_se2', participante_id: pYo, monto: 22500 },
        { id: 'demo_sp4', gasto_compartido_id: 'demo_se2', participante_id: pCaro, monto: 22500 }
      ]
    }
  ];
  return { grupos, participantes, gastosCompartidos };
}

function buildDemoBlob() {
  const months: string[] = [];
  const monthLabel: Record<string, string> = {};
  for (let m = 4; m >= 0; m--) { const k = monthKey(m); months.push(k); monthLabel[k] = monthLabelOf(m); }
  return {
    transacciones: demoTransactions(),
    categorias: demoCategories(),
    mediosPago: {
      visa_bch: { nombre: 'Visa Banco de Chile', corto: '•••• 4821', icon: 'card' },
      debito_bci: { nombre: 'Débito BCI', corto: '•••• 9034', icon: 'card' },
      cuenta_vista: { nombre: 'Cuenta Vista', corto: 'Cta. Vista', icon: 'bank' },
      efectivo: { nombre: 'Efectivo', corto: 'Efectivo', icon: 'cash' }
    },
    presupuestos: demoBudgets(),
    monthlyBudgetTotal: 900000,
    metasGastoPct: { fijo: 45, variable: 17 },
    datosTransferencia: { nombre: 'Cuenta de ejemplo', rut: '11.111.111-1', banco: 'Banco de Chile', tipoCuenta: 'Cuenta Vista', numeroCuenta: '000000000', email: 'demo@ejemplo.cl' },
    metasInversion: demoInvestmentGoals(),
    plataformas: demoPlatformData(),
    planificador: { base: 900000, metaPcts: {} },
    metasTotalChecks: {},
    presupuestoAvisosEnviados: {},
    months, monthLabel,
    contactos: ['Caro', 'Pancho']
  };
}

export function isDemoActive(): boolean { return realSnapshot !== null; }

export function enterDemoMode(){
  if(realSnapshot) return; // ya está activo -- no pisar el snapshot real con uno del propio demo
  const { grupos, participantes, gastosCompartidos } = { grupos: clone(GROUPS), participantes: clone(GROUP_PARTICIPANTS), gastosCompartidos: clone(SHARED_EXPENSES) };
  realSnapshot = {
    blob: buildFullStateBlob(),
    grupos, participantes, gastosCompartidos,
    saldosPagados: clone(PAID_BALANCES), mapeoCategorias: clone(CATEGORY_MAPPINGS),
    sb
  };
  // Corta la suscripción en vivo a las tablas de grupos ANTES de nulear `sb` -- si quedara
  // colgada, un cambio remoto real podría intentar refetchear con `sb` ya en null.
  if(groupsRealtimeChannel && sb){ sb.removeChannel(groupsRealtimeChannel); setGroupsRealtimeChannel(null); }
  setSb(null);
  applyStateBlob(buildDemoBlob());
  const bundle = demoGroupsBundle();
  setGroups(bundle.grupos);
  setGroupParticipants(bundle.participantes);
  setSharedExpenses(bundle.gastosCompartidos);
  setPaidBalances([]);
  setCategoryMappings([]);
  state.demoMode = true; // applyStateBlob() lo deja en false -- se pisa después, a propósito
  render();
}

export function exitDemoMode(){
  if(!realSnapshot) return;
  const snap = realSnapshot;
  realSnapshot = null; // liberar antes de renderizar, por si algo dispara otro toggle en el medio
  applyStateBlob(snap.blob);
  setGroups(snap.grupos);
  setGroupParticipants(snap.participantes);
  setSharedExpenses(snap.gastosCompartidos);
  setPaidBalances(snap.saldosPagados);
  setCategoryMappings(snap.mapeoCategorias);
  setSb(snap.sb);
  state.demoMode = false;
  if(snap.sb) subscribeToGroupsLive();
  render();
}
