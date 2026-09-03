import { ensureMonthExists } from './shared-expenses';
import { getTx } from './sheet';
import { CATS, MEDIOS, TX, todayISO } from './state';
import { Transaccion } from './types';
/* ===================== HELPERS ===================== */
export function txsOfMonth(m){ return TX.filter(t=>t.fecha.slice(0,7)===m); }
export function catInfo(id){ return CATS[id] || {nombre:'Sin categoría', color:'neutral', icon:'more', tipo:'gasto'}; }

// Tu sueldo no manda correo (a diferencia de una compra con tarjeta), así que nunca se
// importa solo — esto detecta que ya pasó a un mes nuevo sin que hayas registrado un
// ingreso con categoría "sueldo" todavía, para sugerírtelo con el monto de la última vez
// como referencia (la confirmas o la ajustas, nunca se agrega sola sin que la veas).
export function lastSueldoTx(){
  const candidatos = TX.filter(t=>t.categorias.some(c=>c.cat==='sueldo')).slice().sort((a,b)=> b.fecha.localeCompare(a.fecha));
  return candidatos[0] || null;
}
export function mesActualTieneSueldo(){
  return txsOfMonth(todayISO().slice(0,7)).some(t=>t.categorias.some(c=>c.cat==='sueldo'));
}

// Etiqueta liviana de plazo para metas y plataformas — no reestructura nada, solo te
// deja ver de un vistazo qué es corto/medio/largo plazo dentro de la misma organización
// por plataforma que ya tenemos.
export const PLAZO_META = {
  corto:{label:'Corto', color:'sky'},
  medio:{label:'Medio', color:'sage'},
  largo:{label:'Largo', color:'lavender'}
};
export function plazoChip(plazo){
  if(!plazo || !PLAZO_META[plazo]) return '';
  const p = PLAZO_META[plazo];
  return '<span class="plazo-chip" style="background:var(--cat-'+p.color+'-fill);color:var(--cat-'+p.color+'-ink);">'+p.label+'</span>';
}
// Si una transacción quedó apuntando a un medio que ya no existe (o nunca tuvo uno, ej. datos
// viejos de antes de que el campo fuera obligatorio), antes esto devolvía un objeto sin
// "corto" — y como el texto de la fila se arma con medio.corto directo, JS lo mostraba
// literalmente como la palabra "undefined" en vez de algo legible.
export function medioInfo(id){ return MEDIOS[id] || {nombre:'Medio desconocido', corto:'Sin medio', icon:'card'}; }
// Ícono chico junto a los últimos dígitos del medio de pago en la lista de Transacciones —
// tarjeta si es tarjeta, bolsa de plata si es efectivo. Los demás medios (cuenta vista, etc.)
// se quedan sin ícono acá, tal como están hoy.
export function medioTagIcon(medio){
  if(medio.icon==='card') return '💳';
  if(medio.icon==='cash') return '💰';
  return '';
}

export function catTotalMonto(t){ return t.categorias.reduce((s,c)=>s+c.monto,0); }

// Un pendiente (por cobrar de una persona, o reembolso de un gasto) puede no tener monto
// esperado todavía (reembolsos: no siempre sabes cuánto te van a devolver hasta que llega).
// Mientras no esté pagado, cuenta como "monto esperado" (0 si no se sabe todavía — o sea,
// sigue siendo tu parte del gasto hasta que se resuelva). Una vez pagado/vinculado a un
// depósito real, manda el monto que efectivamente llegó (montoRecibido), no el estimado.
export function pendienteMontoEfectivo(p){
  if(p.pagado) return p.montoRecibido!=null ? p.montoRecibido : (p.monto||0);
  return p.monto!=null ? p.monto : 0;
}
export function porCobrarTotal(t){ return t.porCobrar.reduce((s,p)=>s+pendienteMontoEfectivo(p),0); }

// ---- Neteo de cuentas por cobrar (splits con amigos) vs. reembolsos ----
//
// Dos casos que se ven parecidos pero se contabilizan distinto:
//  · tipo 'persona' (dividiste una boleta, alguien te debe su parte): esa plata NUNCA fue tu
//    gasto — solo la adelantaste. Se descuenta de "Gastos" DESDE que la divides (no cuando te
//    pagan), y en el mismo mes de la transacción original. Cuando te pagan, solo se salda la
//    cuenta por cobrar: no vuelve a entrar como ingreso ni se resta de nuevo del gasto.
//  · tipo 'reembolso' (isapre, seguro, tu empresa): ese gasto SÍ fue 100% tuyo — el reembolso
//    es plata que vuelve después, y se muestra como crédito en el mes en que llega (tarjeta
//    "Reembolsado este mes"), sin tocar el mes original.
// Como el neteo ocurre al dividir (no al recibir el depósito), un mes ya cerrado no cambia
// por un reembolso o pago que llega después — solo cambia si tú editas esa transacción vieja.
export function gastoNetoTx(t){
  if(t.tipo!=='gasto') return catTotalMonto(t);
  const personaSplits = (t.porCobrar||[]).filter(p=>p.tipo==='persona').reduce((s,p)=>s+(p.monto||0),0);
  return Math.max(catTotalMonto(t) - personaSplits, 0);
}
// Factor para repartir el neteo proporcionalmente si el gasto está dividido en categorías.
export function gastoNetoFactor(t){
  const bruto = catTotalMonto(t);
  return bruto>0 ? gastoNetoTx(t)/bruto : 1;
}
export function catMontoNeto(t, c){
  if(t.tipo!=='gasto') return c.monto;
  return c.monto * gastoNetoFactor(t);
}
// Un ingreso que en realidad es solo el pago de un amigo devolviéndote su parte (vinculado a
// un pendiente tipo 'persona') no es plata nueva — ya se descontó del gasto al dividir, así
// que no debe volver a sumar como "Ingresos" o se contaría dos veces a tu favor.
export function ingresoEsSaldoDePersona(t){
  if(t.tipo!=='ingreso') return false;
  const vinculo = pendienteVinculadaA(t.id);
  if(!vinculo) return false;
  const gastoTx = getTx(vinculo.gastoTxId);
  const p = gastoTx && gastoTx.porCobrar[vinculo.idx];
  return !!(p && p.tipo==='persona');
}
export function ingresoNetoTx(t){
  if(t.tipo!=='ingreso') return catTotalMonto(t);
  return ingresoEsSaldoDePersona(t) ? 0 : catTotalMonto(t);
}
// El monto "de verdad tuyo" de una transacción para agregados de Balance/Presupuesto/Evolución
// — reemplaza a catTotalMonto(t) en esos cálculos (nunca en la vista de la transacción misma,
// que sigue mostrando el monto real completo que pagaste o recibiste).
export function montoAgregadoTx(t){
  if(t.tipo==='gasto') return gastoNetoTx(t);
  if(t.tipo==='ingreso') return ingresoNetoTx(t);
  return catTotalMonto(t);
}

// Todos los pendientes (persona o reembolso) de todas las transacciones que todavía no
// están pagados — para el flujo "vincular un depósito" desde el lado del ingreso.
export function pendientesGlobales(){
  const out = [];
  TX.forEach(t=>{
    (t.porCobrar||[]).forEach((p,idx)=>{
      if(!p.pagado) out.push({gastoTxId:t.id, idx, comercio:t.comercio, fecha:t.fecha, persona:p.persona, monto:p.monto, tipo:p.tipo||'persona'});
    });
  });
  return out.sort((a,b)=> b.fecha.localeCompare(a.fecha));
}
// Si este ingreso ya está vinculado a algún pendiente, lo encuentra (para poder mostrarlo
// y ofrecer "quitar vínculo" desde el detalle del ingreso).
export function pendienteVinculadaA(ingresoTxId){
  for(const t of TX){
    for(let idx=0; idx<(t.porCobrar||[]).length; idx++){
      if(t.porCobrar[idx].linkedTxId===ingresoTxId) return {gastoTxId:t.id, idx, comercio:t.comercio, persona:t.porCobrar[idx].persona};
    }
  }
  return null;
}
export function resolvePendiente(gastoTxId, idx, ingresoTxId){
  const gastoTx = getTx(gastoTxId), ingresoTx = getTx(ingresoTxId);
  if(!gastoTx || !ingresoTx || !gastoTx.porCobrar[idx]) return false;
  const p = gastoTx.porCobrar[idx];
  p.pagado = true;
  p.montoRecibido = ingresoTx.monto;
  p.linkedTxId = ingresoTx.id;
  return true;
}
// Convierte una cuenta por cobrar (tipo 'persona') que nunca te pagaron en un gasto real del
// MES ACTUAL — se crea una transacción nueva (no se edita la original, que ya cerró su mes con
// el neteo aplicado) y se quita el pendiente de la transacción original.
export function darPorPerdida(gastoTxId, idx){
  const gastoTx = getTx(gastoTxId);
  if(!gastoTx || !gastoTx.porCobrar[idx]) return false;
  const p = gastoTx.porCobrar[idx];
  if(p.pagado || p.tipo!=='persona') return false;
  const monto = Math.round(p.monto||0);
  if(monto<=0){ gastoTx.porCobrar.splice(idx,1); return true; }
  // Antes caía en una categoría "otros_gastos" fija que ya no existe en el set de categorías
  // por defecto — si la transacción original no tenía categoría, esta tampoco: queda "Sin
  // categoría" (mismo estado ya soportado en el resto de la app, con su chip para asignarle una).
  const catId = gastoTx.categorias[0] ? gastoTx.categorias[0].cat : null;
  const nuevaTx: Transaccion = {
    id:'perdida-'+Date.now(), fecha: todayISO(), hora:'12:00',
    comercio: (p.persona||'Cuenta por cobrar')+' — nunca pagó',
    monto, medio: gastoTx.medio, tipo:'gasto', recurrencia:'variable', estado:'confirmado',
    categorias: catId ? [{cat:catId, monto}] : [], porCobrar:[], reglaAuto:false,
    nota:'Dada por perdida: '+(p.persona||'esta persona')+' nunca pagó su parte de "'+gastoTx.comercio+'" ('+dayLabel(gastoTx.fecha)+').'
  };
  TX.push(nuevaTx);
  ensureMonthExists(nuevaTx.fecha.slice(0,7));
  gastoTx.porCobrar.splice(idx,1);
  return true;
}
// Cuánto te reembolsaron en un mes dado — se cuenta en el mes en que llegó el depósito
// (no en el mes del gasto original), porque es cuando esa plata realmente volvió a tu bolsillo.
export function monthlyReembolsoTotal(monthKey){
  let total = 0, count = 0;
  TX.forEach(t=>{
    (t.porCobrar||[]).forEach(p=>{
      if(p.tipo==='reembolso' && p.pagado && p.linkedTxId){
        const ingresoTx = getTx(p.linkedTxId);
        if(ingresoTx && ingresoTx.fecha.slice(0,7)===monthKey){
          total += (p.montoRecibido!=null ? p.montoRecibido : 0);
          count++;
        }
      }
    });
  });
  return {total, count};
}

export function dayLabel(fecha){
  const d = new Date(fecha+'T00:00:00');
  const today = new Date(todayISO()+'T00:00:00');
  const diff = Math.round((today.getTime()-d.getTime())/86400000);
  if(diff===0) return 'Hoy';
  if(diff===1) return 'Ayer';
  const dias=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return dias[d.getDay()]+' '+d.getDate()+' de '+meses[d.getMonth()];
}
// Deja solo la primera letra en mayúscula ("miércoles 12 de agosto" -> "Miércoles 12 de
// agosto") — se usa nada más en el encabezado de fecha de Transacciones; el resto de los usos
// de dayLabel() (el detalle de una transacción, por ejemplo) se quedan tal cual, en minúscula.
export function capitalizeFirst(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

export function applyLockRule(tx){
  // Simula la regla: futuras (y existentes) transacciones del mismo comercio heredan categoría/tipo/recurrencia
  // (incluyendo si quedan como "fijo" — ver bloque Fijo/Variable/Inversión en Balance).
  const cat = tx.categorias[0] ? tx.categorias[0].cat : null;
  TX.forEach(t=>{
    if(t.comercio===tx.comercio && t.id!==tx.id){
      t.reglaAuto = true;
      t.tipo = tx.tipo;
      t.recurrencia = tx.recurrencia;
      if(cat) t.categorias = [{cat, monto: catTotalMonto(t) || t.monto}];
    }
  });
  tx.reglaAuto = true;
}

export function allCobrado(t){
  return t.porCobrar.length>0 && t.porCobrar.every(p=>p.pagado);
}
// 'persona' (dividiste una boleta con alguien) y 'reembolso' (isapre/seguro/empresa) se ven
// parecidos pero son casos distintos — esto permite filtrarlos y mostrarlos por separado.
export function tienePorCobrarTipo(t, tipo){
  return (t.porCobrar||[]).some(p=>p.tipo===tipo);
}

