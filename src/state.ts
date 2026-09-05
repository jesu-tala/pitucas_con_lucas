import { monthLabelFor } from './shared-expenses';
import { AppState, Category, SharedExpense, Group, GroupParticipant, CategoryMapping, PaymentMethod, PaidBalance, Transaction, InvestmentGoal, PlatformData } from './types';
import { monthTotals } from './views/evolucion';
import { round1 } from './views/inversiones';
/* ===================== DATA MODEL ===================== */
// Default categories ("category design" phase) — name, type, color and icon defined on
// request: the icon is now directly an emoji (not a name from the ICONS set above), thanks to
// catIconMarkup(). The 'inversion' type ones (fintual/racional/banco_chile/buda) are NOT free
// categories: they're the real investment platforms, tied to PLATFORM_DATA and to
// INVESTMENT_GOALS.plataformaId — that's why they were left with their usual icon instead of
// an emoji.
export const CATEGORIES: Record<string, Category> = {
  supermercado:{nombre:'Supermercado', tipo:'gasto', color:'mint', icon:'🛒'},
  restoranes:{nombre:'Restoranes y bares', tipo:'gasto', color:'peach', icon:'🍽️'},
  transporte:{nombre:'Transporte', tipo:'gasto', color:'sky', icon:'🚕'},
  hogar:{nombre:'Hogar', tipo:'gasto', color:'lavender', icon:'🏠'},
  salud:{nombre:'Salud', tipo:'gasto', color:'pink', icon:'💊'},
  entretenimiento:{nombre:'Entretenimiento', tipo:'gasto', color:'neutral', icon:'🎬'},
  deporte:{nombre:'Deporte', tipo:'gasto', color:'mint', icon:'🏃'},
  carrete:{nombre:'Carrete', tipo:'gasto', color:'butter', icon:'🍻'},
  suscripciones:{nombre:'Suscripciones', tipo:'gasto', color:'sage', icon:'📺'},
  compras:{nombre:'Compras', tipo:'gasto', color:'peach', icon:'🛍️'},
  viajes:{nombre:'Viajes', tipo:'gasto', color:'sky', icon:'✈️'},
  regalos:{nombre:'Regalos y donaciones', tipo:'gasto', color:'lavender', icon:'🎁'},
  gastos_hormiga:{nombre:'Gastos hormiga', tipo:'gasto', color:'neutral', icon:'🐜'},

  sueldo:{nombre:'Sueldo', tipo:'ingreso', color:'mint', icon:'💼'},
  pololos_extra:{nombre:'Pololos extra', tipo:'ingreso', color:'sky', icon:'✨'},

  fintual:{nombre:'Fintual', tipo:'inversion', color:'mint', icon:'trending'},
  racional:{nombre:'Racional', tipo:'inversion', color:'peach', icon:'trending'},
  banco_chile:{nombre:'Banco de Chile', tipo:'inversion', color:'butter', icon:'bank'},
  buda:{nombre:'Buda (cripto)', tipo:'inversion', color:'pink', icon:'coin'},
  // "Otros": a catch-all system-seeded platform (same family as the 4 above -- not something
  // the user creates by hand via "+ Agregar nueva plataforma") for one-off investments that
  // don't belong anywhere else and don't warrant their own platform/goal (see PLATFORM_DATA.otros
  // below and platformCurrentValue()/investmentCatOptions() in views/inversiones.ts). Placed
  // last on purpose: several fallbacks (activePlatformIds()[0], etc.) pick "the first active
  // platform" as a default when creating a goal, and 'otros' can never host a goal -- see
  // goalCapablePlatformIds() in views/inversiones.ts for the explicit guard against that anyway.
  otros:{nombre:'Otros', tipo:'inversion', color:'sage', icon:'layers'}
};
// Snapshot of the "factory" categories (only gasto/ingreso, no investment platforms — each
// person creates those from scratch) — taken ONCE here, before anything touches it, so the
// initial state of a truly new account can be built without dragging along the sample data
// (Fran/Cata/Sushi Itto, etc.) from this mockup.
export const CATEGORY_SEED_DEFAULTS = (function(){
  const out = {};
  Object.keys(CATEGORIES).forEach(function(k){ if(CATEGORIES[k].tipo!=='inversion') out[k] = Object.assign({}, CATEGORIES[k]); });
  return out;
})();
export const PAYMENT_METHODS: Record<string, PaymentMethod> = {
  visa_bch:{nombre:'Visa Banco de Chile', corto:'•••• 4821', icon:'card'},
  debito_bci:{nombre:'Débito BCI', corto:'•••• 9034', icon:'card'},
  cuenta_vista:{nombre:'Cuenta Vista', corto:'Cta. Vista', icon:'bank'},
  efectivo:{nombre:'Efectivo', corto:'Efectivo', icon:'cash'}
};
export const CONTACTS = ['Cata','Fran','Pancho','Mamá'];

// Budget (Phase 2): monthly goal + alerts per expense category.
// Only the categories present here have a budget assigned; the rest are shown with a
// "+ Add budget" to simulate the empty state.
export let BUDGETS = {
  supermercado:{meta:180000, alertas:{80:true,90:true,100:true}},
  transporte:{meta:90000, alertas:{80:true,90:false,100:true}},
  restoranes:{meta:60000, alertas:{80:true,90:true,100:true}},
  hogar:{meta:420000, alertas:{80:false,90:false,100:true}},
  salud:{meta:30000, alertas:{80:true,90:true,100:true}},
  suscripciones:{meta:15000, alertas:{80:true,90:true,100:true}}
};
export let monthlyBudgetTotal = 900000;

// Fixed/Variable goals as a % of your income (editable in Budget) — the Investment one is
// NOT stored here: it comes by itself from the sum of "aporteMensualMeta" of your goals in
// Investments, so the same number isn't written in two places of the app.
export let SPENDING_GOAL_PCT = {fijo:45, variable:17};

// Your transfer info (Menu > My account) — so a pending charge + how you can be paid can be
// copied in one shot, ready to paste into WhatsApp. It's never sent anywhere by itself: it's
// only used to build the text that YOU decide to copy and paste.
export let TRANSFER_INFO = {nombre:'', rut:'', banco:'', tipoCuenta:'', numeroCuenta:'', email:''};

// Fintual-style investment goals (Phase 3): target + monthly goal contribution + accumulated
// amount history per month + manual completion check per month.
export let goalIdCounter = 5;
export let importIdCounter = 0; // id counter for transactions created via "Import statement CSV" (Menu)
// Still untyped (left for a future pass of the migration, as discussed -- this first pass
// focused on the Transactions data model). "any[]" is explicit on purpose, so an inferred type
// from the sample data doesn't sneak in by accident.
//
// Investment-category redesign: a transaction never categorizes directly to a Platform anymore
// -- it points at a specific Goal's id, or at that platform's "<platformId>__general" catch-all
// bucket (see investmentCatOptions() in views/inversiones.ts). Because of that, a Goal's progress
// is no longer a manually-typed running total (the old aportadoNeto/historial fields) -- it's
// computed straight from whichever transactions are categorized to it (see metaAportadoNeto()/
// metaHistorialAt() in views/evolucion.ts). What DOES still need to be stored by hand is the seed
// for "money I'd already put in before I started tracking this in the app": startMonth (which
// month this goal starts counting transactions from) + startingAmount (the balance at the start
// of that month, before any of the transactions on record). historial/checks used to be a single
// object seeded once at creation; checks (the manual "did I make my planned contribution this
// month?" mark) is untouched, still hand-ticked -- it's a habit tracker, not something that could
// ever be inferred from a transaction.
export let INVESTMENT_GOALS: InvestmentGoal[] = [
  {
    id:'m1', nombre:'Fondo de emergencia', montoObjetivo:3000000, aporteMensualMeta:150000, plataformaId:'banco_chile', plazo:'corto', comision:null,
    // This goal predates the app by a few months (per the user's own account) -- startingAmount
    // is what she'd already saved before April 2026 (2150000, the old aportadoNeto minus the
    // 70000 that t44+t69 below now contribute for real), so the total keeps landing in the same
    // place as before the redesign instead of jumping.
    startMonth:'2026-04', startingAmount:2080000,
    checks:{'2026-04':true,'2026-05':true,'2026-06':false,'2026-07':true,'2026-08':true}
  },
  {
    id:'m2', nombre:'Pie departamento', montoObjetivo:8000000, aporteMensualMeta:300000, plataformaId:'banco_chile', plazo:'medio', comision:null,
    // Same idea: old aportadoNeto (3200000) minus the 80000 that t17+t57 now contribute for real.
    startMonth:'2026-04', startingAmount:3120000,
    checks:{'2026-04':true,'2026-05':true,'2026-06':true,'2026-07':true,'2026-08':true}
  },
  // fintual/racional/buda didn't have any goal of their own before this redesign -- their old
  // "Aporte X" transactions categorized straight to the platform. Rather than dumping all of
  // that history into an anonymous "General" bucket, each platform gets one plausible goal to
  // receive it (see the categorias reassignment on the transactions below), starting from
  // scratch (startingAmount:0) since there's no pre-app history to seed for these three.
  {
    id:'m3', nombre:'APV Fintual', montoObjetivo:3000000, aporteMensualMeta:100000, plataformaId:'fintual', plazo:'largo', comision:null,
    startMonth:'2026-04', startingAmount:0, checks:{}
  },
  {
    id:'m4', nombre:'Portafolio Racional', montoObjetivo:1500000, aporteMensualMeta:50000, plataformaId:'racional', plazo:'largo', comision:null,
    startMonth:'2026-04', startingAmount:0, checks:{}
  },
  {
    id:'m5', nombre:'Cripto especulativo', montoObjetivo:300000, aporteMensualMeta:20000, plataformaId:'buda', plazo:'corto', comision:null,
    startMonth:'2026-04', startingAmount:0, checks:{}
  }
];

// Manual month-by-month check of "did I hit my TOTAL investment goal this month?" —
// independent of each individual goal's own checks (those already exist inside each goal).
// It's a mark you set by hand, not something the app calculates on its own: a month can be
// missing (hasn't arrived yet, or you simply haven't marked it) and that looks the same as
// "unmarked", never as "false".
export let TOTAL_GOAL_CHECKS = {'2026-01':true,'2026-02':true,'2026-03':true,'2026-04':true,'2026-05':true,'2026-06':false,'2026-07':true,'2026-08':true};

// Which budget alerts (catId+month+threshold, e.g. "supermercado|2026-09|80") have already
// been sent as a push notification, so it's not repeated every time the month's spending is
// recalculated — see checkBudgetPushAlerts(). Travels in the backup/app_state so it
// doesn't re-notify as soon as the app reloads on another device.
export let BUDGET_ALERTS_SENT = {};

// Investments by platform (Phase 4): approximate value the user updates by hand every now and
// then (valorHistorial = what was entered each month), date of the last real update and an
// optional annual growth rate (off by default, with no percentage suggested by the app). "Net
// contributed" isn't stored here — it's always calculated from the already-classified
// investment-type transactions.
export const UPDATE_THRESHOLD_DAYS = 30;
export let PLATFORM_DATA: Record<string, PlatformData> = {
  fintual:{
    valorHistorial:{'2026-04':81600,'2026-05':185400,'2026-06':291200,'2026-07':395600,'2026-08':504000},
    fechaActualizacion:'2026-08-20', tasaAnual:null, comision:null, plazo:'largo'
  },
  racional:{
    valorHistorial:{'2026-04':40800,'2026-05':91800,'2026-06':142800,'2026-07':143500,'2026-08':206000},
    fechaActualizacion:'2026-07-10', tasaAnual:null, comision:null, plazo:'largo'
  },
  banco_chile:{
    // This is the savings account where "Fondo de emergencia" + "Pie departamento" live (not
    // the APV, which is actually in Fintual) — that's why the value here is the sum of those
    // two goals month by month.
    // No term of its own: its two goals already bring their own (corto/medio) separately.
    valorHistorial:{'2026-04':3700000,'2026-05':4150000,'2026-06':4500000,'2026-07':5000000,'2026-08':5500000},
    fechaActualizacion:'2026-06-15', tasaAnual:null, comision:null, plazo:null
  },
  buda:{
    valorHistorial:{'2026-04':0,'2026-05':0,'2026-06':0,'2026-07':46000,'2026-08':17500},
    fechaActualizacion:'2026-08-25', tasaAnual:null, comision:null, plazo:null
  },
  // "Otros": no valuation of its own to track (sinValuacion) -- its "value" is always exactly
  // what's been contributed to it (see platformCurrentValue() in views/inversiones.ts), so
  // there's never anything to type into valorHistorial/fechaActualizacion by hand.
  otros:{
    valorHistorial:{}, fechaActualizacion:null, tasaAnual:null, comision:null, plazo:null, sinValuacion:true
  }
};

// Salary planner (Phase 4, sub-section within Investments).
// It no longer splits the whole salary (fixed + free): now it's purely "how much of my
// monthly surplus goes to each investment goal", grouped by term (Short/Medium/Long, the same
// term system that already exists in Investments), plus a sub-split of how the long-term leg
// is made up (ETF/crypto/speculative).
export function computeDefaultPlanBase(){
  const currentMonth = todayISO().slice(0,7);
  const t = monthTotals(currentMonth);
  return Math.max(0, Math.round(t.ingresos - t.gastos));
}
export function computeDefaultGoalPcts(base){
  const out = {};
  INVESTMENT_GOALS.forEach(m=>{
    // A flow-only goal with no fixed aporteMensualMeta ("contribute whatever I can") has no
    // amount to suggest a %-split from -- it defaults to 0%, same as it would if base were 0.
    out[m.id] = base>0 ? round1((m.aporteMensualMeta||0)/base*100) : 0;
  });
  return out;
}
export function getPlannerDefaults(){
  const base = computeDefaultPlanBase();
  return {
    base,
    metaPcts: computeDefaultGoalPcts(base)
  };
}
// PLANNER is initialized further below, after declaring TRANSACTIONS and MONTHS — its default
// value depends on monthTotals(), which needs both already defined.

// Each transaction: id, fecha, hora, comercio, monto, medio, tipo, recurrencia, estado, categorias:[{cat,monto}],
// porCobrar:[{persona,monto,pagado,tipo:'persona'|'reembolso',montoRecibido,linkedTxId,direccion?}] (persona = name
// or entity that owes you/is reimbursing you, or -- for a 'persona' row with direccion:'debo' -- whoever you
// actually owe; monto can be null when it's a reimbursement of unknown amount; montoRecibido/linkedTxId are only
// filled in when linking a real deposit — see resolvePending; direccion is 'me_deben' (or absent, same meaning
// on old data) unless someone else paid, see ReceivableItem in types.ts and commitPersonaSplit in
// shared-expenses.ts), reglaAuto, nota. A transaction may also carry pagador/divisionTipo (see types.ts) once it
// has a 'persona' split.
export let TRANSACTIONS: Transaction[] = [
  {id:'t1',fecha:'2026-08-28',hora:'09:12',comercio:'Jumbo Ñuñoa',monto:45000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:31500},{cat:'hogar',monto:13500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t2',fecha:'2026-08-28',hora:'08:05',comercio:'Copec Providencia',monto:18000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:18000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t3',fecha:'2026-08-27',hora:'20:40',comercio:'Uber',monto:6200,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:6200}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t4',fecha:'2026-08-27',hora:'13:15',comercio:'Copec Las Condes',monto:22000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:22000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t5',fecha:'2026-08-26',hora:'21:03',comercio:'Restobar Lastarria',monto:64000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'por_cobrar',categorias:[{cat:'restoranes',monto:64000}],porCobrar:[{persona:'Cata',monto:21333,pagado:true,tipo:'persona',montoRecibido:21333,linkedTxId:null},{persona:'Fran',monto:21333,pagado:true,tipo:'persona',montoRecibido:21333,linkedTxId:'t72'}],reglaAuto:false,nota:'Cumpleaños Cata'},
  {id:'t6',fecha:'2026-08-25',hora:'07:50',comercio:'Sueldo Agosto',monto:1250000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1250000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t7',fecha:'2026-08-24',hora:'19:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t8',fecha:'2026-08-23',hora:'12:30',comercio:'Farmacias Ahumada',monto:15200,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'por_cobrar',categorias:[{cat:'salud',monto:15200}],porCobrar:[{persona:'Isapre',monto:null,pagado:false,tipo:'reembolso',montoRecibido:null,linkedTxId:null}],reglaAuto:false,nota:'Espero reembolso de la isapre'},
  {id:'t9',fecha:'2026-08-22',hora:'10:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m3',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t70',fecha:'2026-08-16',hora:'11:40',comercio:'Retiro parcial Buda',monto:-20000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'m5',monto:-20000}],porCobrar:[],reglaAuto:false,nota:'Retiro'},
  {id:'t71',fecha:'2026-07-20',hora:'10:00',comercio:'Reembolso Isapre',monto:7500,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[],porCobrar:[],reglaAuto:false,nota:''},
  // Fran transferred you her share of Restobar Lastarria (t5) — a real deposit, linked to that
  // 'persona' type pending item. That money must NOT add to "Income": it was already deducted
  // from "Expenses" when the bill was split, so counting it again here would double it in your
  // favor.
  {id:'t72',fecha:'2026-08-27',hora:'10:15',comercio:'Transferencia de Fran',monto:21333,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[],porCobrar:[],reglaAuto:false,nota:'Su parte de la cena en Restobar Lastarria'},
  {id:'t10',fecha:'2026-08-21',hora:'18:22',comercio:'Cine Hoyts Costanera',monto:12000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'entretenimiento',monto:12000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t11',fecha:'2026-08-20',hora:'09:00',comercio:'Freelance diseño web',monto:180000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'pololos_extra',monto:180000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t30',fecha:'2026-08-28',hora:'19:45',comercio:'Compra Transbank *8842',monto:12500,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'pendiente',categorias:[],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t31',fecha:'2026-08-10',hora:'16:20',comercio:'Falabella · Notebook',monto:90000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'hogar',monto:90000}],porCobrar:[],reglaAuto:false,nota:'',cuotas:{total:3}},
  {id:'t32',fecha:'2026-08-07',hora:'13:30',comercio:'Sushi Bar Vitacura',monto:36000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'por_cobrar',categorias:[{cat:'restoranes',monto:36000}],porCobrar:[{persona:'Pancho',monto:18000,pagado:true,tipo:'persona',montoRecibido:18000,linkedTxId:null}],reglaAuto:false,nota:''},
  {id:'t12',fecha:'2026-08-18',hora:'11:00',comercio:'Líder Express',monto:23800,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:23800}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t13',fecha:'2026-08-15',hora:'14:10',comercio:'Transferencia entre mis cuentas',monto:200000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'variable',estado:'no_es_gasto',categorias:[],porCobrar:[],reglaAuto:false,nota:'Traspaso, no es un gasto real'},
  {id:'t14',fecha:'2026-08-12',hora:'08:40',comercio:'Copec Providencia',monto:19500,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:19500}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t15',fecha:'2026-08-05',hora:'10:00',comercio:'Arriendo Depto',monto:380000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'hogar',monto:380000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t16',fecha:'2026-08-01',hora:'09:00',comercio:'Aporte Racional',monto:60000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m4',monto:60000}],porCobrar:[],reglaAuto:false,nota:''},

  {id:'t17',fecha:'2026-07-31',hora:'10:00',comercio:'Aporte Banco de Chile',monto:50000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m2',monto:50000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t18',fecha:'2026-07-28',hora:'09:00',comercio:'Sueldo Julio',monto:1250000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1250000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t19',fecha:'2026-07-26',hora:'20:00',comercio:'Jumbo Ñuñoa',monto:52000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:52000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t20',fecha:'2026-07-24',hora:'13:00',comercio:'Copec Las Condes',monto:21000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:21000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t21',fecha:'2026-07-20',hora:'19:30',comercio:'Rappi Delivery',monto:14500,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'restoranes',monto:14500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t22',fecha:'2026-07-18',hora:'09:00',comercio:'Freelance diseño web',monto:150000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'pololos_extra',monto:150000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t23',fecha:'2026-07-15',hora:'11:00',comercio:'Farmacias Cruz Verde',monto:9800,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'por_cobrar',categorias:[{cat:'salud',monto:9800}],porCobrar:[{persona:'Seguro complementario',monto:8000,pagado:true,tipo:'reembolso',montoRecibido:7500,linkedTxId:'t71'}],reglaAuto:false,nota:''},
  {id:'t24',fecha:'2026-07-14',hora:'18:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t25',fecha:'2026-07-10',hora:'10:00',comercio:'Arriendo Depto',monto:380000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'hogar',monto:380000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t26',fecha:'2026-07-08',hora:'12:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m3',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t27',fecha:'2026-07-05',hora:'21:00',comercio:'Cine Hoyts Costanera',monto:12000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'entretenimiento',monto:12000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t28',fecha:'2026-07-03',hora:'10:00',comercio:'Aporte Buda',monto:40000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'m5',monto:40000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t29',fecha:'2026-07-02',hora:'08:20',comercio:'Uber',monto:5400,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:5400}],porCobrar:[],reglaAuto:false,nota:''},

  {id:'t33',fecha:'2026-06-25',hora:'07:50',comercio:'Sueldo Junio',monto:1220000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1220000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t34',fecha:'2026-06-18',hora:'09:00',comercio:'Freelance diseño web',monto:90000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'pololos_extra',monto:90000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t35',fecha:'2026-06-20',hora:'19:10',comercio:'Jumbo Ñuñoa',monto:48000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:48000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t36',fecha:'2026-06-22',hora:'13:05',comercio:'Copec Las Condes',monto:20500,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:20500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t37',fecha:'2026-06-14',hora:'19:40',comercio:'Rappi Delivery',monto:16000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'restoranes',monto:16000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t38',fecha:'2026-06-10',hora:'10:00',comercio:'Arriendo Depto',monto:380000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'hogar',monto:380000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t39',fecha:'2026-06-12',hora:'18:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t40',fecha:'2026-06-08',hora:'11:20',comercio:'Farmacias Cruz Verde',monto:11200,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'salud',monto:11200}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t41',fecha:'2026-06-06',hora:'21:00',comercio:'Cine Hoyts Costanera',monto:12000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'entretenimiento',monto:12000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t42',fecha:'2026-06-05',hora:'10:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m3',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t43',fecha:'2026-06-03',hora:'10:00',comercio:'Aporte Racional',monto:50000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m4',monto:50000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t44',fecha:'2026-06-02',hora:'10:00',comercio:'Aporte Banco de Chile',monto:40000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m1',monto:40000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t45',fecha:'2026-05-25',hora:'07:50',comercio:'Sueldo Mayo',monto:1200000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1200000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t46',fecha:'2026-05-16',hora:'09:00',comercio:'Freelance diseño web',monto:60000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'pololos_extra',monto:60000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t47',fecha:'2026-05-19',hora:'19:30',comercio:'Jumbo Ñuñoa',monto:50500,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:50500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t48',fecha:'2026-05-21',hora:'08:10',comercio:'Copec Providencia',monto:19000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:19000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t49',fecha:'2026-05-11',hora:'20:45',comercio:'Uber',monto:5800,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:5800}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t50',fecha:'2026-05-09',hora:'19:15',comercio:'Rappi Delivery',monto:13200,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'restoranes',monto:13200}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t51',fecha:'2026-05-10',hora:'10:00',comercio:'Arriendo Depto',monto:380000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'hogar',monto:380000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t52',fecha:'2026-05-12',hora:'18:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t53',fecha:'2026-05-07',hora:'12:30',comercio:'Farmacias Ahumada',monto:13500,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'salud',monto:13500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t54',fecha:'2026-05-04',hora:'21:00',comercio:'Cine Hoyts Costanera',monto:12000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'entretenimiento',monto:12000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t55',fecha:'2026-05-05',hora:'10:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m3',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t56',fecha:'2026-05-03',hora:'10:00',comercio:'Aporte Racional',monto:50000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m4',monto:50000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t57',fecha:'2026-05-02',hora:'10:00',comercio:'Aporte Banco de Chile',monto:30000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m2',monto:30000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t58',fecha:'2026-04-25',hora:'07:50',comercio:'Sueldo Abril',monto:1200000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1200000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t59',fecha:'2026-04-14',hora:'12:00',comercio:'Venta bicicleta',monto:40000,medio:'efectivo',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t60',fecha:'2026-04-20',hora:'19:20',comercio:'Jumbo Ñuñoa',monto:46000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:46000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t61',fecha:'2026-04-22',hora:'13:00',comercio:'Copec Las Condes',monto:18500,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:18500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t62',fecha:'2026-04-08',hora:'19:00',comercio:'Rappi Delivery',monto:11000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'restoranes',monto:11000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t63',fecha:'2026-04-10',hora:'10:00',comercio:'Arriendo Depto',monto:380000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'hogar',monto:380000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t64',fecha:'2026-04-12',hora:'18:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t65',fecha:'2026-04-06',hora:'11:00',comercio:'Farmacias Cruz Verde',monto:8900,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'salud',monto:8900}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t66',fecha:'2026-04-03',hora:'21:00',comercio:'Cine Hoyts Costanera',monto:12000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'entretenimiento',monto:12000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t67',fecha:'2026-04-05',hora:'10:00',comercio:'Aporte Fintual',monto:80000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m3',monto:80000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t68',fecha:'2026-04-03',hora:'10:00',comercio:'Aporte Racional',monto:40000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m4',monto:40000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t69',fecha:'2026-04-02',hora:'10:00',comercio:'Aporte Banco de Chile',monto:30000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'m1',monto:30000}],porCobrar:[],reglaAuto:false,nota:''}
];

// Now that TRANSACTIONS and INVESTMENT_GOALS already exist, the real default can be computed
// (income − expenses of the current month, and the % per goal that its monthly goal
// contribution covers).
export let PLANNER = getPlannerDefaults();

/* ---- Shared expenses: data synced from Supabase, NEVER from app_state ----
   Unlike TRANSACTIONS/CATEGORIES/PAYMENT_METHODS/etc. (which live in app_state, private per
   household), this is read/written directly on the tables in
   supabase/schema_gastos_compartidos.sql -- a group can bring together participants from
   different accounts/households, so it can't live in a blob that's private to a single
   household. In demo mode (or before the real session loads) these stay empty arrays;
   syncSharedExpenses() fills them in after auth. */
export let GROUPS: Group[] = [];
export let GROUP_PARTICIPANTS: GroupParticipant[] = [];
export let SHARED_EXPENSES: SharedExpense[] = [];
export let PAID_BALANCES: PaidBalance[] = [];
export let CATEGORY_MAPPINGS: CategoryMapping[] = [];

export const MONTHS = ['2026-04','2026-05','2026-06','2026-07','2026-08'];
export const MONTH_LABEL = {'2026-04':'Abril 2026','2026-05':'Mayo 2026','2026-06':'Junio 2026','2026-07':'Julio 2026','2026-08':'Agosto 2026'};
export const MONTHS_LONG=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// The index of TODAY's REAL month within MONTHS — never "the last month in the array", because
// card installments (regenerateInstallmentsFor) push future months forward into MONTHS (if you
// bought something in 6 installments this month, MONTHS extends several months into the
// future), and that's why Balance/Budget must always open on today's month, not that future one.
export function currentMonthIndex(){
  const ym = todayISO().slice(0,7);
  if(!MONTHS.includes(ym)){ MONTHS.push(ym); MONTHS.sort(); if(!MONTH_LABEL[ym]) MONTH_LABEL[ym] = monthLabelFor(ym); }
  return MONTHS.indexOf(ym);
}

export const fmt = new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
// In Demo mode, any displayed (non-editable) amount is masked right here — a single point of
// change that covers the whole app without touching each view one by one.
export function money(n){ return state.demoMode ? '$••••••' : fmt.format(Math.round(n)); }
export function moneyPlain(n){ return new Intl.NumberFormat('es-CL',{maximumFractionDigits:0}).format(Math.round(n)); }
// moneyPlain() by itself is NOT masked (it's also used by editable inputs, which must keep
// showing the real number while being filled in) — for read-only text that should use the
// "plain" format (no "$"), like the donut's center or a chart's labels, you need to go through
// here instead of moneyPlain() directly.
export function moneyPlainMasked(n){ return state.demoMode ? '••••••' : moneyPlain(n); }
// Abbreviated format ("$1,2M", "$45K") for the Y-axis labels of the investments chart -- these
// are "approx" values on purpose, not each exact peso, so showing the full amount there doesn't
// make sense. Comma as the decimal separator, like the rest of the app's Chilean formatting.
export function moneyShort(n){
  const abs = Math.abs(Math.round(n));
  const sign = n<0 ? '−' : '';
  if(abs>=1000000) return sign+'$'+(abs/1000000).toFixed(abs>=10000000?0:1).replace('.',',')+'M';
  if(abs>=1000) return sign+'$'+Math.round(abs/1000)+'K';
  return sign+'$'+abs;
}
// Short name of a month (1=enero ... 12=diciembre), reusing MONTHS_LONG instead of keeping
// another separate list of names.
export function monthAbbr(monthNum1based){
  const s = MONTHS_LONG[monthNum1based-1];
  return s.charAt(0).toUpperCase()+s.slice(1,3);
}


/* ===================== STATE ===================== */
export const state: AppState = {
  tab:'transacciones',        // transacciones | resumen | menu
  summarySub:'balance',       // balance | presupuesto | evolucion | inversiones
  filter:'todas',             // todas | entradas | porcobrar | pendientes
  categoryFilter:null,        // cat id or null
  categoryFilterMonth:null,   // 'YYYY-MM' or null, set together with categoryFilter from a Balance drill-down
  monthIndex: currentMonthIndex(),
  openTxId:null,
  creatingNew:false,
  draftTx:null,
  splitCategoryMode:{},       // per tx id: bool
  splitCategoryUnit:{},       // per tx id: '%'|'$'
  splitCollectMode:{},
  splitCollectUnit:{},
  categoryEditMode:{},        // per tx id: bool — true while the category is being re-picked
  searchQuery:'',             // free text to search by merchant in Transactions
  advFilters:{cats:[], medios:[], dateFrom:'', dateTo:''},
  filterSheetOpen:false,
  addingPaymentMethod:false,  // true while the "add card" mini-form is shown
  newPaymentMethodDraft:{nombre:'', ultimos4:''},
  editingBudgetCat:null,       // catId being edited inline, or null
  budgetDraft:{meta:'', alertas:{80:true,90:true,100:true}},
  editingBudgetTotal:false,
  budgetTotalDraft:'',
  editingSpendingGoals:false,
  spendingGoalsDraft:{fijo:'', variable:''},
  editingTransferInfo:false,
  transferInfoDraft:{nombre:'', rut:'', banco:'', tipoCuenta:'', numeroCuenta:'', email:''},
  editingGoalId:null,          // id of the goal being edited, or 'nueva', or null
  goalDraft:{nombre:'', montoObjetivo:'', aporteMensualMeta:'', plazo:'', comision:''},
  addGoalPlatformId:null,      // platform a new goal will end up associated with
  evolutionSelectedMonth:null, // month tapped on the Evolution chart, or null (= latest month)
  openPlatformId:null,         // id of the platform with its accordion expanded in Investments, or null (all closed)
  editingPlatformId:null,      // id of the platform being edited ("update value"), or null
  platformDraft:{valor:'', tasaAnual:'', comision:'', plazo:''},
  creatingPlatform:false,      // true while the "new platform" form is shown
  confirmDeletePlatformId:null, // id of the platform showing "are you sure?" before actually deleting it
  confirmArchivePlatformId:null, // same "are you sure?" but for "closing" a platform (reversible, but still asked)
  newPlatformDraft:{nombre:'', icon:'bank', color:'butter', valor:'', plazo:''},
  // Monthly amount the user typed by hand in the Investments simulator, replacing the real
  // average of their last 3 months -- null while untouched (uses the average).
  simulatedContribution:null,
  summarySubOrder:['balance','presupuesto','evolucion','inversiones'], // order of Summary sub-tabs, reorderable via drag and drop
  subtabDragId:null,           // id of the sub-tab currently being dragged, or null

  // ---- Menu ----
  menuSection:null,            // null | 'categorias' | 'medios' | 'reglas' | 'exportar' | 'respaldo' | 'importar' | 'demo' | 'asesoria' | 'cuenta' | 'importarcorreo' | 'notificaciones'
  emailImportLoaded:false,     // whether the import code has already been loaded at least once
  emailImportLoading:false,
  emailImportError:null,
  importToken:null,             // household's import code (households.import_token), for Apps Script and the push Worker
  // ---- Push notifications (new imported transaction, budget alert) ----
  notifLoaded:false,            // whether this browser's subscription status has already been checked at least once
  notifLoading:false,
  notifError:null,
  notifSubscribed:false,        // whether THIS browser already has a push subscription saved
  notifBusy:false,              // subscribing/unsubscribing right now (disables the button)
  notifTestBusy:false,          // sending the test notification right now
  notifTestResult:null,         // text with the Worker's actual result (unlike enviarPushHogar, this one DOES wait for the response)
  confirmDeleteTxId:null,       // id of the transaction showing "are you sure you want to delete it?"
  salaryBannerDismissedMonth:null, // 'YYYY-MM' of the month "Not now" was tapped on the salary suggestion
  editingCategoryId:null,      // catId being edited, 'nueva', or null
  catDraft:{nombre:'', tipo:'gasto', color:'sage', icon:'more'},
  editingPaymentMethodId:null, // medioId being edited, 'nueva', or null (different from the mini-form inside the new-transaction sheet)
  medioDraft:{nombre:'', corto:'', icon:'card'},
  demoMode:false,
  importSummary:null,          // result of the last CSV imported, to show on screen
  reconciliar:{
    archivo:null,               // name of the PDF that was read
    cargando:false,
    error:null,
    tipo:null,                  // 'cuenta_corriente' | 'tarjeta_nacional'
    movimientos:[],             // [{fecha,detalle,monto,tipoMov,esEspecial,yaRegistrada,idSugerido}]
    pagosTarjeta: null,         // separate summary for the "CARGO POR PAGO TC" rows
    disponibles:[],             // statements that arrived by themselves via email, not used yet
    usandoId:null,              // id of the one about to be opened (asking for the password), or null
    passwordDraft:'',
    errorPassword:null,
    archivoBuffer:null,          // ArrayBuffer of a manually chosen PDF that asked for a password, while waiting for it to be typed
    archivoNombrePendiente:null, // name of that file, or null if none is pending a password
    // ids of eliminarPropuesto transactions checked in the automatic-reconciliation review
    // (see reconcile.ts/renderReconcileDiffSection) -- "Eliminar seleccionadas" only acts on
    // these, and only after this per-item confirmation; reset whenever a (new) statement loads.
    eliminarSeleccionados:[]
  },

  // ---- Pending charges and reimbursements (link a deposit to a pending item, or vice versa) ----
  linkFlow:null,                // null | {mode:'fromPendiente', expenseTxId, idx} | {mode:'fromIngreso', incomeTxId}

  // ---- Split receipt (simulated: no OCR or real link) ----
  boleta:null,                 // null when the assistant is closed, or {step, expenseTxId, comercio, items, asign} —
                                // always tied to an already-existing transaction marked "por cobrar"

  // ---- Shared expenses ----
  workspace:'personal',        // 'personal' | groupId — which workspace is being viewed right now
  openGroupId:null,            // groupId whose detail view is open, or null (group list)
  creatingGroup:false,          // true while the "Create group" form is shown
  groupDraft:{nombre:'', icono:'👥'},
  joiningGroup:false,           // true while the "Join with a code" form is shown
  joinDraft:{inviteCode:'', nombre:''},
  addingParticipant:false,      // true while "Add person" (no account) inside a group is shown
  participantDraft:{nombre:''},
  settleWithId:null,            // participantId being "Settled up" right now, or null
  // "Share with a group" inside a expense transaction's detail/creation:
  shareDraft:null,              // null, or {groupId, pagadoPorId, divisionTipo, participantesIncluidos:[], montosManuales:{}}
  confirmDeleteGroupId:null,
  // ---- Group detail: 3 Tricount-style sub-tabs (see views/grupos.ts renderGroupDetail) ----
  groupDetailTab:'gastos',      // 'gastos' | 'balances' | 'transferencias' -- which sub-tab is open
  openGroupExpenseId:null,      // id of the SharedExpense whose inline detail card is expanded in "Gastos", or null
  showManualTransferForm:false, // true while "Registrar una transferencia" (manual, Tab "Transferencias") is open
  manualTransferDraft:null,     // null, or {deId, aId, monto, fecha}
  // groupId of origin when "new transaction" was opened from a group's "Add an expense"
  // button (instead of Transactions' +) -- saveDraftTx() uses it to, on save, leave the
  // transaction open in its detail with "Share with a group" already pre-filled with this
  // group, instead of going back to the Transactions list like in the normal flow.
  createExpenseFromGroupId:null
};
export let subtabDrag = null;         // transient drag bookkeeping (not part of state: not rendered directly)
export let suppressNextSubtabClick = false;

// Before connecting the real account this returned a fixed date ('2026-08-28', the demo
// mockup's "today") — with real data it has to be today's actual date.
export function todayISO(){
  const d = new Date();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return d.getFullYear()+'-'+mm+'-'+dd;
}
export function normalize(s){
  return (s||'').toString().toLowerCase().normalize('NFD').replace(new RegExp('[̀-ͯ]','g'),'');
}


/* ===================== SETTERS =====================
   Several of the variables above (TRANSACTIONS, BUDGETS, INVESTMENT_GOALS, PLATFORM_DATA,
   PLANNER, TOTAL_GOAL_CHECKS, BUDGET_ALERTS_SENT, GROUPS, GROUP_PARTICIPANTS, SHARED_EXPENSES,
   PAID_BALANCES, CATEGORY_MAPPINGS, TRANSFER_INFO, monthlyBudgetTotal) aren't just mutated in
   place -- they get REASSIGNED wholesale from other modules (for example when loading the real
   state from Supabase, or when filtering TRANSACTIONS after deleting a transaction). An
   ES-modules `import { TRANSACTIONS }` is read-only (TS2632: "Cannot assign to 'TRANSACTIONS'
   because it is an import"), so the modules that need to replace the whole value call these
   setters instead of reassigning directly -- they're the only place outside this file where
   these variables' value changes from the root. CATEGORIES, PAYMENT_METHODS, MONTHS and
   MONTH_LABEL aren't here because they're never reassigned like that: they're emptied and
   refilled in the same object/array (a plain old const). */
export function setTransactions(v: Transaction[]){ TRANSACTIONS = v; }
export function setBudgets(v){ BUDGETS = v; }
export function setMonthlyBudgetTotal(v){ monthlyBudgetTotal = v; }
export function setSpendingGoalPct(v){ SPENDING_GOAL_PCT = v; }
export function setTransferInfo(v){ TRANSFER_INFO = v; }
export function setInvestmentGoals(v){ INVESTMENT_GOALS = v; }
export function setPlatformData(v){ PLATFORM_DATA = v; }
export function setTotalGoalChecks(v){ TOTAL_GOAL_CHECKS = v; }
export function setBudgetAlertsSent(v){ BUDGET_ALERTS_SENT = v; }
export function setPlanner(v){ PLANNER = v; }
export function setGroups(v: Group[]){ GROUPS = v; }
export function setGroupParticipants(v: GroupParticipant[]){ GROUP_PARTICIPANTS = v; }
export function setSharedExpenses(v: SharedExpense[]){ SHARED_EXPENSES = v; }
export function setPaidBalances(v: PaidBalance[]){ PAID_BALANCES = v; }
export function setCategoryMappings(v: CategoryMapping[]){ CATEGORY_MAPPINGS = v; }
// goalIdCounter/importIdCounter/subtabDrag/suppressNextSubtabClick: same reason, other modules
// (events.ts, views/menu.ts, supabase.ts) reassign them wholesale (or increment them, which
// also counts as reassigning the binding).
export function setGoalIdCounter(v){ goalIdCounter = v; }
export function setImportIdCounter(v){ importIdCounter = v; }
export function nextImportId(){ importIdCounter++; return importIdCounter; }
export function setSubtabDrag(v){ subtabDrag = v; }
export function setSuppressNextSubtabClick(v){ suppressNextSubtabClick = v; }
