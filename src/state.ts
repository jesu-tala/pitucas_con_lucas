import { monthLabelFor } from './shared-expenses';
import { AppState, Categoria, GastoCompartido, Grupo, GrupoParticipante, MapeoCategoria, Medio, SaldoPagado, Transaccion } from './types';
import { monthTotals } from './views/evolucion';
import { round1 } from './views/inversiones';
/* ===================== DATA MODEL ===================== */
// Categorías por defecto (Fase "diseño de categorías") — nombre, tipo, color e ícono definidos
// a pedido: el ícono ahora es directamente un emoji (no un nombre del set ICONS de arriba),
// gracias a catIconMarkup(). Las de tipo 'inversion' (fintual/racional/banco_chile/buda) NO son
// categorías libres: son las plataformas de inversión reales, ligadas a PLATAFORMA_DATA y a
// METAS_INVERSION.plataformaId — por eso se dejaron con su ícono de siempre en vez de emoji.
export const CATS: Record<string, Categoria> = {
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
  buda:{nombre:'Buda (cripto)', tipo:'inversion', color:'pink', icon:'coin'}
};
// Snapshot de categorías "de fábrica" (solo gasto/ingreso, sin plataformas de inversión —
// esas las crea cada quien desde cero) — se toma UNA vez acá, antes de que nada la toque,
// para poder armar el estado inicial de una cuenta nueva de verdad sin arrastrar los datos
// de ejemplo (Fran/Cata/Sushi Itto, etc.) de esta maqueta.
export const CATS_SEED_DEFAULTS = (function(){
  const out = {};
  Object.keys(CATS).forEach(function(k){ if(CATS[k].tipo!=='inversion') out[k] = Object.assign({}, CATS[k]); });
  return out;
})();
export const MEDIOS: Record<string, Medio> = {
  visa_bch:{nombre:'Visa Banco de Chile', corto:'•••• 4821', icon:'card'},
  debito_bci:{nombre:'Débito BCI', corto:'•••• 9034', icon:'card'},
  cuenta_vista:{nombre:'Cuenta Vista', corto:'Cta. Vista', icon:'bank'},
  efectivo:{nombre:'Efectivo', corto:'Efectivo', icon:'cash'}
};
export const CONTACTOS = ['Cata','Fran','Pancho','Mamá'];

// Presupuesto (Fase 2): meta mensual + alertas por categoría de gasto.
// Sólo las categorías presentes acá tienen presupuesto asignado; el resto
// se muestra con un "+ Agregar presupuesto" para simular el estado vacío.
export let PRESUPUESTOS = {
  supermercado:{meta:180000, alertas:{80:true,90:true,100:true}},
  transporte:{meta:90000, alertas:{80:true,90:false,100:true}},
  restoranes:{meta:60000, alertas:{80:true,90:true,100:true}},
  hogar:{meta:420000, alertas:{80:false,90:false,100:true}},
  salud:{meta:30000, alertas:{80:true,90:true,100:true}},
  suscripciones:{meta:15000, alertas:{80:true,90:true,100:true}}
};
export let presupuestoTotalMensual = 900000;

// Metas de Fijo/Variable como % de tus ingresos (editable en Presupuesto) — la de Inversión
// NO se guarda acá: sale sola de la suma de "aporteMensualMeta" de tus metas en Inversiones,
// para no tener el mismo número escrito en dos partes de la app.
export let METAS_GASTO_PCT = {fijo:45, variable:17};

// Tus datos de transferencia (Menú > Mi cuenta) — para poder copiar de un tiro, en formato
// listo para pegar en WhatsApp, un cobro pendiente + cómo te pueden transferir. Nunca se
// manda a ninguna parte sola: solo se usa para armar el texto que TÚ decides copiar y pegar.
export let DATOS_TRANSFERENCIA = {nombre:'', rut:'', banco:'', tipoCuenta:'', numeroCuenta:'', email:''};

// Metas de inversión estilo Fintual (Fase 3): objetivo + aporte mensual meta +
// historial de monto acumulado por mes + check manual de cumplimiento por mes.
export let metaIdCounter = 3;
export let importIdCounter = 0; // contador de ids para transacciones creadas por "Importar CSV de cartola" (Menú)
// Todavía sin tipar (queda para una próxima pasada de la migración, según lo conversado --
// esta primera pasada se enfocó en el modelo de datos de Transacciones). "any[]" es explícito
// a propósito, para no dejar pasar un tipo inferido de la data de ejemplo por accidente.
export let METAS_INVERSION: any[] = [
  {
    id:'m1', nombre:'Fondo de emergencia', montoObjetivo:3000000, aporteMensualMeta:150000, plataformaId:'banco_chile', plazo:'corto', comision:null,
    // aportadoNeto: cuánto de lo acumulado es plata que tú pusiste (a diferencia de las
    // plataformas, acá no hay transacciones por meta para calcularlo solo, así que se
    // guarda directo) — la diferencia con "acumulado" es la ganancia real de esta meta.
    aportadoNeto:2150000,
    historial:{'2026-04':1700000,'2026-05':1850000,'2026-06':1900000,'2026-07':2050000,'2026-08':2200000},
    checks:{'2026-04':true,'2026-05':true,'2026-06':false,'2026-07':true,'2026-08':true}
  },
  {
    id:'m2', nombre:'Pie departamento', montoObjetivo:8000000, aporteMensualMeta:300000, plataformaId:'banco_chile', plazo:'medio', comision:null,
    aportadoNeto:3200000,
    historial:{'2026-04':2000000,'2026-05':2300000,'2026-06':2600000,'2026-07':2950000,'2026-08':3300000},
    checks:{'2026-04':true,'2026-05':true,'2026-06':true,'2026-07':true,'2026-08':true}
  }
];

// Check manual mes a mes de "¿cumplí mi objetivo de inversión TOTAL este mes?" — independiente
// de los checks de cada meta individual (esos ya existen dentro de cada meta). Es una marca
// que tú pones a mano, no algo que la app calcule sola: un mes puede faltar (todavía no llega,
// o simplemente no lo has marcado) y eso se ve igual que "no marcado", nunca como "false".
export let METAS_TOTAL_CHECKS = {'2026-01':true,'2026-02':true,'2026-03':true,'2026-04':true,'2026-05':true,'2026-06':false,'2026-07':true,'2026-08':true};

// Qué avisos de presupuesto (catId+mes+umbral, ej. "supermercado|2026-09|80") ya se mandaron
// como notificación push, para no repetirla cada vez que se recalcula el gasto del mes —
// ver checkPresupuestoPushAvisos(). Viaja en el respaldo/app_state para no re-avisar apenas
// se recarga la app en otro dispositivo.
export let PRESUPUESTO_AVISOS_ENVIADOS = {};

// Inversiones por plataforma (Fase 4): valor aproximado que la usuaria actualiza a mano
// de vez en cuando (valorHistorial = lo que iba ingresando cada mes), fecha de la última
// actualización real y una tasa de crecimiento anual opcional (apagada por defecto, sin
// ningún porcentaje sugerido por la app). El "aportado neto" no se guarda acá — se calcula
// siempre desde las transacciones de tipo inversión ya clasificadas.
export const DIAS_UMBRAL_ACTUALIZACION = 30;
export let PLATAFORMA_DATA = {
  fintual:{
    valorHistorial:{'2026-04':81600,'2026-05':185400,'2026-06':291200,'2026-07':395600,'2026-08':504000},
    fechaActualizacion:'2026-08-20', tasaAnual:null, comision:null, plazo:'largo'
  },
  racional:{
    valorHistorial:{'2026-04':40800,'2026-05':91800,'2026-06':142800,'2026-07':143500,'2026-08':206000},
    fechaActualizacion:'2026-07-10', tasaAnual:null, comision:null, plazo:'largo'
  },
  banco_chile:{
    // Es la cuenta de ahorro donde viven "Fondo de emergencia" + "Pie departamento" (no el APV,
    // que en realidad está en Fintual) — por eso el valor acá es la suma de esas dos metas mes a mes.
    // Sin plazo propio: sus dos metas ya traen el suyo (corto/medio) por separado.
    valorHistorial:{'2026-04':3700000,'2026-05':4150000,'2026-06':4500000,'2026-07':5000000,'2026-08':5500000},
    fechaActualizacion:'2026-06-15', tasaAnual:null, comision:null, plazo:null
  },
  buda:{
    valorHistorial:{'2026-04':0,'2026-05':0,'2026-06':0,'2026-07':46000,'2026-08':17500},
    fechaActualizacion:'2026-08-25', tasaAnual:null, comision:null, plazo:null
  }
};

// Planificador de sueldo (Fase 4, sub-sección dentro de Inversiones).
// Ya no reparte el sueldo completo (fijo + libre): ahora es puramente "cuánto de mi
// excedente mensual mando a cada meta de inversión", agrupado por plazo (Corto/Medio/
// Largo, el mismo sistema de plazo que ya existe en Inversiones), más un sub-reparto de
// cómo se compone la pata de largo plazo (ETF/cripto/especulativo).
export function computeDefaultPlanBase(){
  const mesActual = todayISO().slice(0,7);
  const t = monthTotals(mesActual);
  return Math.max(0, Math.round(t.ingresos - t.gastos));
}
export function computeDefaultMetaPcts(base){
  const out = {};
  METAS_INVERSION.forEach(m=>{
    out[m.id] = base>0 ? round1(m.aporteMensualMeta/base*100) : 0;
  });
  return out;
}
export function getPlanificadorDefaults(){
  const base = computeDefaultPlanBase();
  return {
    base,
    metaPcts: computeDefaultMetaPcts(base)
  };
}
// PLANIFICADOR se inicializa más abajo, después de declarar TX y MONTHS — su valor por
// defecto depende de monthTotals(), que necesita ambos ya definidos.

// Cada transacción: id, fecha, hora, comercio, monto, medio, tipo, recurrencia, estado, categorias:[{cat,monto}],
// porCobrar:[{persona,monto,pagado,tipo:'persona'|'reembolso',montoRecibido,linkedTxId}] (persona = nombre o entidad
// que te debe/reembolsa; monto puede ser null cuando es un reembolso de monto desconocido; montoRecibido/linkedTxId
// se llenan solo al vincular un depósito real — ver resolvePendiente), reglaAuto, nota
export let TX: Transaccion[] = [
  {id:'t1',fecha:'2026-08-28',hora:'09:12',comercio:'Jumbo Ñuñoa',monto:45000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:31500},{cat:'hogar',monto:13500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t2',fecha:'2026-08-28',hora:'08:05',comercio:'Copec Providencia',monto:18000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:18000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t3',fecha:'2026-08-27',hora:'20:40',comercio:'Uber',monto:6200,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:6200}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t4',fecha:'2026-08-27',hora:'13:15',comercio:'Copec Las Condes',monto:22000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:22000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t5',fecha:'2026-08-26',hora:'21:03',comercio:'Restobar Lastarria',monto:64000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'por_cobrar',categorias:[{cat:'restoranes',monto:64000}],porCobrar:[{persona:'Cata',monto:21333,pagado:true,tipo:'persona',montoRecibido:21333,linkedTxId:null},{persona:'Fran',monto:21333,pagado:true,tipo:'persona',montoRecibido:21333,linkedTxId:'t72'}],reglaAuto:false,nota:'Cumpleaños Cata'},
  {id:'t6',fecha:'2026-08-25',hora:'07:50',comercio:'Sueldo Agosto',monto:1250000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1250000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t7',fecha:'2026-08-24',hora:'19:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t8',fecha:'2026-08-23',hora:'12:30',comercio:'Farmacias Ahumada',monto:15200,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'por_cobrar',categorias:[{cat:'salud',monto:15200}],porCobrar:[{persona:'Isapre',monto:null,pagado:false,tipo:'reembolso',montoRecibido:null,linkedTxId:null}],reglaAuto:false,nota:'Espero reembolso de la isapre'},
  {id:'t9',fecha:'2026-08-22',hora:'10:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'fintual',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t70',fecha:'2026-08-16',hora:'11:40',comercio:'Retiro parcial Buda',monto:-20000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'buda',monto:-20000}],porCobrar:[],reglaAuto:false,nota:'Retiro'},
  {id:'t71',fecha:'2026-07-20',hora:'10:00',comercio:'Reembolso Isapre',monto:7500,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[],porCobrar:[],reglaAuto:false,nota:''},
  // Fran te transfirió su parte de Restobar Lastarria (t5) — un depósito real, vinculado a ese
  // pendiente tipo 'persona'. Esa plata NO debe sumar en "Ingresos": ya se descontó de "Gastos"
  // al dividir la cuenta, así que contarla de nuevo acá la duplicaría a tu favor.
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
  {id:'t16',fecha:'2026-08-01',hora:'09:00',comercio:'Aporte Racional',monto:60000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'racional',monto:60000}],porCobrar:[],reglaAuto:false,nota:''},

  {id:'t17',fecha:'2026-07-31',hora:'10:00',comercio:'Aporte Banco de Chile',monto:50000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'banco_chile',monto:50000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t18',fecha:'2026-07-28',hora:'09:00',comercio:'Sueldo Julio',monto:1250000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1250000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t19',fecha:'2026-07-26',hora:'20:00',comercio:'Jumbo Ñuñoa',monto:52000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:52000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t20',fecha:'2026-07-24',hora:'13:00',comercio:'Copec Las Condes',monto:21000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:21000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t21',fecha:'2026-07-20',hora:'19:30',comercio:'Rappi Delivery',monto:14500,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'restoranes',monto:14500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t22',fecha:'2026-07-18',hora:'09:00',comercio:'Freelance diseño web',monto:150000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'pololos_extra',monto:150000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t23',fecha:'2026-07-15',hora:'11:00',comercio:'Farmacias Cruz Verde',monto:9800,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'por_cobrar',categorias:[{cat:'salud',monto:9800}],porCobrar:[{persona:'Seguro complementario',monto:8000,pagado:true,tipo:'reembolso',montoRecibido:7500,linkedTxId:'t71'}],reglaAuto:false,nota:''},
  {id:'t24',fecha:'2026-07-14',hora:'18:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t25',fecha:'2026-07-10',hora:'10:00',comercio:'Arriendo Depto',monto:380000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'hogar',monto:380000}],porCobrar:[],reglaAuto:true,nota:''},
  {id:'t26',fecha:'2026-07-08',hora:'12:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'fintual',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t27',fecha:'2026-07-05',hora:'21:00',comercio:'Cine Hoyts Costanera',monto:12000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'entretenimiento',monto:12000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t28',fecha:'2026-07-03',hora:'10:00',comercio:'Aporte Buda',monto:40000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'buda',monto:40000}],porCobrar:[],reglaAuto:false,nota:''},
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
  {id:'t42',fecha:'2026-06-05',hora:'10:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'fintual',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t43',fecha:'2026-06-03',hora:'10:00',comercio:'Aporte Racional',monto:50000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'racional',monto:50000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t44',fecha:'2026-06-02',hora:'10:00',comercio:'Aporte Banco de Chile',monto:40000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'banco_chile',monto:40000}],porCobrar:[],reglaAuto:false,nota:''},
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
  {id:'t55',fecha:'2026-05-05',hora:'10:00',comercio:'Aporte Fintual',monto:100000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'fintual',monto:100000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t56',fecha:'2026-05-03',hora:'10:00',comercio:'Aporte Racional',monto:50000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'racional',monto:50000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t57',fecha:'2026-05-02',hora:'10:00',comercio:'Aporte Banco de Chile',monto:30000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'banco_chile',monto:30000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t58',fecha:'2026-04-25',hora:'07:50',comercio:'Sueldo Abril',monto:1200000,medio:'cuenta_vista',tipo:'ingreso',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'sueldo',monto:1200000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t59',fecha:'2026-04-14',hora:'12:00',comercio:'Venta bicicleta',monto:40000,medio:'efectivo',tipo:'ingreso',recurrencia:'variable',estado:'confirmado',categorias:[],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t60',fecha:'2026-04-20',hora:'19:20',comercio:'Jumbo Ñuñoa',monto:46000,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'supermercado',monto:46000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t61',fecha:'2026-04-22',hora:'13:00',comercio:'Copec Las Condes',monto:18500,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'transporte',monto:18500}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t62',fecha:'2026-04-08',hora:'19:00',comercio:'Rappi Delivery',monto:11000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'restoranes',monto:11000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t63',fecha:'2026-04-10',hora:'10:00',comercio:'Arriendo Depto',monto:380000,medio:'cuenta_vista',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'hogar',monto:380000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t64',fecha:'2026-04-12',hora:'18:00',comercio:'Netflix',monto:7990,medio:'visa_bch',tipo:'gasto',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'suscripciones',monto:7990}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t65',fecha:'2026-04-06',hora:'11:00',comercio:'Farmacias Cruz Verde',monto:8900,medio:'debito_bci',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'salud',monto:8900}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t66',fecha:'2026-04-03',hora:'21:00',comercio:'Cine Hoyts Costanera',monto:12000,medio:'visa_bch',tipo:'gasto',recurrencia:'variable',estado:'confirmado',categorias:[{cat:'entretenimiento',monto:12000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t67',fecha:'2026-04-05',hora:'10:00',comercio:'Aporte Fintual',monto:80000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'fintual',monto:80000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t68',fecha:'2026-04-03',hora:'10:00',comercio:'Aporte Racional',monto:40000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'racional',monto:40000}],porCobrar:[],reglaAuto:false,nota:''},
  {id:'t69',fecha:'2026-04-02',hora:'10:00',comercio:'Aporte Banco de Chile',monto:30000,medio:'cuenta_vista',tipo:'inversion',recurrencia:'mensual',estado:'confirmado',categorias:[{cat:'banco_chile',monto:30000}],porCobrar:[],reglaAuto:false,nota:''}
];

// Ahora que TX y METAS_INVERSION ya existen, se puede calcular el default real
// (ingresos − gastos del mes actual, y el % por meta que cubre su aporte mensual meta).
export let PLANIFICADOR = getPlanificadorDefaults();

/* ---- Gastos compartidos: datos sincronizados desde Supabase, NUNCA desde app_state ----
   A diferencia de TX/CATS/MEDIOS/etc. (que viven en app_state, privado por hogar), esto se
   lee/escribe directo en las tablas de supabase/schema_gastos_compartidos.sql -- un grupo
   puede juntar participantes de cuentas/hogares distintos, así que no puede vivir en un
   blob que es privado de un solo hogar. En modo demo (o antes de que cargue la sesión real)
   quedan arreglos vacíos; sincronizarGastosCompartidos() los llena después de auth. */
export let GRUPOS: Grupo[] = [];
export let GRUPO_PARTICIPANTES: GrupoParticipante[] = [];
export let GASTOS_COMPARTIDOS: GastoCompartido[] = [];
export let SALDOS_PAGADOS: SaldoPagado[] = [];
export let MAPEO_CATEGORIAS: MapeoCategoria[] = [];

export const MONTHS = ['2026-04','2026-05','2026-06','2026-07','2026-08'];
export const MONTH_LABEL = {'2026-04':'Abril 2026','2026-05':'Mayo 2026','2026-06':'Junio 2026','2026-07':'Julio 2026','2026-08':'Agosto 2026'};
export const MESES_LARGO=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// El índice del mes REAL de hoy dentro de MONTHS — nunca "el último mes del arreglo", porque
// las cuotas de tarjeta (regenerateCuotasFor) empujan meses futuros hacia adelante en MONTHS
// (si compraste algo en 6 cuotas este mes, MONTHS se extiende varios meses hacia el futuro), y
// por eso Balance/Presupuesto deben abrir siempre en el mes de hoy, no en ese mes futuro.
export function currentMonthIndex(){
  const ym = todayISO().slice(0,7);
  if(!MONTHS.includes(ym)){ MONTHS.push(ym); MONTHS.sort(); if(!MONTH_LABEL[ym]) MONTH_LABEL[ym] = monthLabelFor(ym); }
  return MONTHS.indexOf(ym);
}

export const fmt = new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
// En Modo demo, cualquier monto mostrado (no editable) se enmascara acá mismo — un solo
// punto de cambio que cubre toda la app sin tocar cada vista una por una.
export function money(n){ return state.demoMode ? '$••••••' : fmt.format(Math.round(n)); }
export function moneyPlain(n){ return new Intl.NumberFormat('es-CL',{maximumFractionDigits:0}).format(Math.round(n)); }
// moneyPlain() por sí sola NO se enmascara (la usan también los inputs editables, que deben
// seguir mostrando el número real mientras se completan) — para texto de solo lectura que use
// el formato "plain" (sin "$"), como el centro del donut o las etiquetas de un gráfico, hay que
// pasar por acá en vez de moneyPlain() directo.
export function moneyPlainMasked(n){ return state.demoMode ? '••••••' : moneyPlain(n); }
// Formato abreviado ("$1,2M", "$45K") para las etiquetas del eje Y del gráfico de inversiones
// -- son valores "aprox" a propósito, no cada peso exacto, así que no tiene sentido mostrar el
// monto completo ahí. Coma como separador decimal, como el resto del formato chileno de la app.
export function moneyShort(n){
  const abs = Math.abs(Math.round(n));
  const sign = n<0 ? '−' : '';
  if(abs>=1000000) return sign+'$'+(abs/1000000).toFixed(abs>=10000000?0:1).replace('.',',')+'M';
  if(abs>=1000) return sign+'$'+Math.round(abs/1000)+'K';
  return sign+'$'+abs;
}
// Nombre corto de un mes (1=enero ... 12=diciembre), reusando MESES_LARGO en vez de mantener
// otra lista de nombres aparte.
export function monthAbbr(monthNum1based){
  const s = MESES_LARGO[monthNum1based-1];
  return s.charAt(0).toUpperCase()+s.slice(1,3);
}


/* ===================== STATE ===================== */
export const state: AppState = {
  tab:'transacciones',        // transacciones | resumen | menu
  resumenSub:'balance',       // balance | presupuesto | evolucion | inversiones
  filter:'todas',             // todas | entradas | porcobrar | pendientes
  categoryFilter:null,        // cat id or null
  categoryFilterMonth:null,   // 'YYYY-MM' or null, set together with categoryFilter from a Balance drill-down
  monthIndex: currentMonthIndex(),
  openTxId:null,
  creatingNew:false,
  draftTx:null,
  splitCatMode:{},            // per tx id: bool
  splitCatUnit:{},            // per tx id: '%'|'$'
  splitCobroMode:{},
  splitCobroUnit:{},
  categoryEditMode:{},        // per tx id: bool — true mientras se está reeligiendo la categoría
  searchQuery:'',             // texto libre para buscar por comercio en Transacciones
  advFilters:{cats:[], medios:[], dateFrom:'', dateTo:''},
  filterSheetOpen:false,
  addingMedio:false,          // true mientras se muestra el mini-formulario "agregar tarjeta"
  newMedioDraft:{nombre:'', ultimos4:''},
  editingBudgetCat:null,       // catId en edición inline, o null
  budgetDraft:{meta:'', alertas:{80:true,90:true,100:true}},
  editingBudgetTotal:false,
  budgetTotalDraft:'',
  editingMetasGasto:false,
  metasGastoDraft:{fijo:'', variable:''},
  editingDatosTransferencia:false,
  datosTransferenciaDraft:{nombre:'', rut:'', banco:'', tipoCuenta:'', numeroCuenta:'', email:''},
  editingMetaId:null,          // id de meta en edición, o 'nueva', o null
  metaDraft:{nombre:'', montoObjetivo:'', aporteMensualMeta:'', plazo:'', comision:''},
  addMetaPlataformaId:null,    // plataforma a la que quedará asociada una meta nueva
  evoSelectedMonth:null,       // mes tocado en el gráfico de Evolución, o null (= último mes)
  platformAbierta:null,        // id de la plataforma con el acordeón desplegado en Inversiones, o null (todas cerradas)
  editingPlatformId:null,      // id de plataforma en edición ("actualizar valor"), o null
  platformDraft:{valor:'', tasaAnual:'', comision:'', plazo:''},
  creatingPlatform:false,      // true mientras se muestra el formulario de "nueva plataforma"
  confirmDeletePlatformId:null, // id de la plataforma para la que se está mostrando "¿seguro?" antes de eliminarla de verdad
  confirmArchivePlatformId:null, // mismo "¿seguro?" pero para "cerrar" una plataforma (reversible, pero igual se pregunta)
  newPlatformDraft:{nombre:'', icon:'bank', color:'butter', valor:'', plazo:''},
  // Monto mensual que la usuaria escribió a mano en el simulador de Inversiones, reemplazando
  // el promedio real de sus últimos 3 meses -- null mientras no lo toque (usa el promedio).
  proySimulatedAporte:null,
  resumenSubOrder:['balance','presupuesto','evolucion','inversiones'], // orden de sub-tabs de Resumen, reordenable con drag and drop
  subtabDragId:null,           // id de la sub-tab que se está arrastrando ahora mismo, o null

  // ---- Menú ----
  menuSection:null,            // null | 'categorias' | 'medios' | 'reglas' | 'exportar' | 'respaldo' | 'importar' | 'demo' | 'asesoria' | 'cuenta' | 'importarcorreo' | 'notificaciones'
  importCorreoLoaded:false,     // si ya se cargó el código de importación al menos una vez
  importCorreoLoading:false,
  importCorreoError:null,
  importToken:null,             // código de importación del hogar (households.import_token), para el Apps Script y el Worker de push
  // ---- Notificaciones push (nueva transacción importada, alerta de presupuesto) ----
  notifLoaded:false,            // si ya se revisó el estado de la suscripción de este navegador al menos una vez
  notifLoading:false,
  notifError:null,
  notifSubscribed:false,        // si ESTE navegador ya tiene una suscripción push guardada
  notifBusy:false,              // activando/desactivando ahora mismo (deshabilita el botón)
  notifTestBusy:false,          // mandando el aviso de prueba ahora mismo
  notifTestResult:null,         // texto con el resultado real del Worker (a diferencia de enviarPushHogar, este SÍ espera la respuesta)
  confirmDeleteTxId:null,       // id de la transacción para la que se está mostrando "¿seguro que quieres borrarla?"
  sueldoBannerDescartadoMes:null, // 'YYYY-MM' del mes en que se apretó "Todavía no" en la sugerencia de sueldo
  editingCatId:null,           // catId en edición, 'nueva', o null
  catDraft:{nombre:'', tipo:'gasto', color:'sage', icon:'more'},
  editingMedioId:null,         // medioId en edición, 'nueva', o null (distinto del mini-form dentro de la hoja de nueva transacción)
  medioDraft:{nombre:'', corto:'', icon:'card'},
  demoMode:false,
  importSummary:null,          // resultado del último CSV importado, para mostrarlo en pantalla
  reconciliar:{
    archivo:null,               // nombre del PDF leído
    cargando:false,
    error:null,
    tipo:null,                  // 'cuenta_corriente' | 'tarjeta_nacional'
    movimientos:[],             // [{fecha,detalle,monto,tipoMov,esEspecial,yaRegistrada,idSugerido}]
    pagosTarjeta: null,         // resumen aparte para las filas "CARGO POR PAGO TC"
    disponibles:[],             // cartolas que llegaron solas por correo, todavía sin usar
    usandoId:null,              // id de la que se está por abrir (pidiendo la clave), o null
    passwordDraft:'',
    errorPassword:null,
    archivoBuffer:null,          // ArrayBuffer de un PDF elegido a mano que pidió clave, mientras se espera que la escriba
    archivoNombrePendiente:null  // nombre de ese archivo, o null si no hay ninguno pendiente de clave
  },

  // ---- Cobros y reembolsos pendientes (vincular un depósito a un pendiente, o viceversa) ----
  linkFlow:null,                // null | {mode:'fromPendiente', gastoTxId, idx} | {mode:'fromIngreso', ingresoTxId}

  // ---- Dividir boleta (simulado: sin OCR ni link real) ----
  boleta:null,                 // null cuando el asistente está cerrado, o {step, gastoTxId, comercio, items, asign} —
                                // siempre asociado a una transacción ya existente marcada "por cobrar"

  // ---- Gastos compartidos ----
  espacio:'personal',          // 'personal' | grupoId — qué espacio se está mirando ahora mismo
  grupoAbiertoId:null,         // grupoId cuya vista de detalle está abierta, o null (lista de grupos)
  creandoGrupo:false,          // true mientras se muestra el formulario "Crear grupo"
  grupoDraft:{nombre:'', icono:'👥'},
  uniendoAGrupo:false,         // true mientras se muestra el formulario "Unirme con un código"
  joinDraft:{inviteCode:'', nombre:''},
  agregandoParticipante:false, // true mientras se muestra "Agregar persona" (sin cuenta) dentro de un grupo
  participanteDraft:{nombre:''},
  saldarConId:null,            // participanteId con quien se está por registrar "Saldar cuentas", o null
  // "Compartir con un grupo" dentro del detalle/creación de una transacción de gasto:
  compartirDraft:null,         // null, o {grupoId, pagadoPorId, divisionTipo, participantesIncluidos:[], montosManuales:{}}
  confirmDeleteGrupoId:null
};
export let subtabDrag = null;         // bookkeeping transitorio del drag (no es parte de state: no se pinta directo)
export let suppressNextSubtabClick = false;

// Antes de conectar la cuenta real esto devolvía una fecha fija ('2026-08-28', el "hoy" de
// la maqueta de demostración) — con datos reales de verdad tiene que ser el día de hoy.
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
   Varias de las variables de arriba (TX, PRESUPUESTOS, METAS_INVERSION, PLATAFORMA_DATA,
   PLANIFICADOR, METAS_TOTAL_CHECKS, PRESUPUESTO_AVISOS_ENVIADOS, GRUPOS, GRUPO_PARTICIPANTES,
   GASTOS_COMPARTIDOS, SALDOS_PAGADOS, MAPEO_CATEGORIAS, DATOS_TRANSFERENCIA,
   presupuestoTotalMensual) no solo se mutan en el mismo objeto/arreglo -- se REASIGNAN
   enteras desde otros módulos (por ejemplo al cargar el estado real desde Supabase, o al
   filtrar TX tras borrar una transacción). Un import { TX } de ES modules es de solo lectura
   (TS2632: "Cannot assign to 'TX' because it is an import"), así que los módulos que
   necesitan reemplazar el valor completo llaman a estos setters en vez de reasignar
   directo -- son el único lugar fuera de este archivo donde el valor de estas variables
   cambia de raíz. CATS, MEDIOS, MONTHS y MONTH_LABEL no están acá porque nunca se reasignan
   así: se vacían y se vuelven a llenar en el mismo objeto/arreglo (const de toda la vida). */
export function setTX(v: Transaccion[]){ TX = v; }
export function setPRESUPUESTOS(v){ PRESUPUESTOS = v; }
export function setPresupuestoTotalMensual(v){ presupuestoTotalMensual = v; }
export function setMETAS_GASTO_PCT(v){ METAS_GASTO_PCT = v; }
export function setDATOS_TRANSFERENCIA(v){ DATOS_TRANSFERENCIA = v; }
export function setMETAS_INVERSION(v){ METAS_INVERSION = v; }
export function setPLATAFORMA_DATA(v){ PLATAFORMA_DATA = v; }
export function setMETAS_TOTAL_CHECKS(v){ METAS_TOTAL_CHECKS = v; }
export function setPRESUPUESTO_AVISOS_ENVIADOS(v){ PRESUPUESTO_AVISOS_ENVIADOS = v; }
export function setPLANIFICADOR(v){ PLANIFICADOR = v; }
export function setGRUPOS(v: Grupo[]){ GRUPOS = v; }
export function setGRUPO_PARTICIPANTES(v: GrupoParticipante[]){ GRUPO_PARTICIPANTES = v; }
export function setGASTOS_COMPARTIDOS(v: GastoCompartido[]){ GASTOS_COMPARTIDOS = v; }
export function setSALDOS_PAGADOS(v: SaldoPagado[]){ SALDOS_PAGADOS = v; }
export function setMAPEO_CATEGORIAS(v: MapeoCategoria[]){ MAPEO_CATEGORIAS = v; }
// metaIdCounter/importIdCounter/subtabDrag/suppressNextSubtabClick: mismo motivo, otros
// módulos (events.ts, views/menu.ts, supabase.ts) los reasignan por completo (o los
// incrementan, que también cuenta como reasignación del binding).
export function setMetaIdCounter(v){ metaIdCounter = v; }
export function setImportIdCounter(v){ importIdCounter = v; }
export function nextImportId(){ importIdCounter++; return importIdCounter; }
export function setSubtabDrag(v){ subtabDrag = v; }
export function setSuppressNextSubtabClick(v){ suppressNextSubtabClick = v; }
