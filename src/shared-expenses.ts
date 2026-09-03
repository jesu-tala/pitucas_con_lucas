import { getTx } from './sheet';
import { GASTOS_COMPARTIDOS, GRUPO_PARTICIPANTES, MESES_LARGO, MONTHS, MONTH_LABEL, SALDOS_PAGADOS, TX, setTX, state } from './state';
import { GastoCompartido, GastoReparto, GrupoParticipante, SaldoParticipante, TransferenciaSugerida } from './types';
/* ===================== GASTOS COMPARTIDOS: motor de balances =====================
   Funciones puras — no tocan Supabase ni el DOM, solo GRUPO_PARTICIPANTES/GASTOS_COMPARTIDOS/
   SALDOS_PAGADOS ya cargados en memoria. Por eso son fáciles de cubrir con un test que
   recalcule "la verdad" desde cero (mismo espíritu que audit_consistency.js) y las compare. */

export function participantesDeGrupo(grupoId: string): GrupoParticipante[] {
  return GRUPO_PARTICIPANTES.filter(p=>p.grupo_id===grupoId);
}
export function gastosDeGrupo(grupoId: string): GastoCompartido[] {
  return GASTOS_COMPARTIDOS.filter(g=>g.grupo_id===grupoId);
}
export function repartoDeGasto(g: GastoCompartido): GastoReparto[] {
  return g.reparto || [];
}

// pagado = todo lo que este participante pagó (fue pagado_por) en gastos del grupo.
// correspondido = su parte del reparto de TODOS los gastos del grupo (haya pagado él o no).
// saldo = pagado - correspondido - saldos ya registrados a su favor/en contra — positivo
// significa "le deben esta plata", negativo "debe esta plata".
export function saldoGrupo(grupoId: string): SaldoParticipante[] {
  const participantes = participantesDeGrupo(grupoId);
  const gastos = gastosDeGrupo(grupoId);
  const saldos = SALDOS_PAGADOS.filter(s=>s.grupo_id===grupoId);

  return participantes.map(p=>{
    const pagado = gastos.filter(g=>g.pagado_por===p.id).reduce((s,g)=>s+g.monto,0);
    const correspondido = gastos.reduce((s,g)=>{
      const item = repartoDeGasto(g).find(r=>r.participante_id===p.id);
      return s + (item ? item.monto : 0);
    },0);
    const pagadoAOtros = saldos.filter(s=>s.de_participante===p.id).reduce((s,x)=>s+x.monto,0);
    const recibidoDeOtros = saldos.filter(s=>s.a_participante===p.id).reduce((s,x)=>s+x.monto,0);
    // Saldar cuentas: si YO le pago a alguien, mi "correspondido pendiente" baja (mi deuda se
    // achica) — por eso pagadoAOtros SUMA a mi saldo (menos negativo) y recibidoDeOtros RESTA
    // (lo que me pagaron ya no cuenta como "me deben").
    const saldo = pagado - correspondido + pagadoAOtros - recibidoDeOtros;
    return {participanteId:p.id, nombre:p.nombre, color:p.color, pagado, correspondido, saldo};
  });
}

// Neteo mínimo: en vez de "todos le deben un poco a todos", arma la lista más corta posible
// de transferencias que deja a todo el mundo en $0 — algoritmo greedy clásico (empareja al
// que más debe con al que más le deben, uno a la vez).
export function transferenciasSugeridas(grupoId: string): TransferenciaSugerida[] {
  const saldos = saldoGrupo(grupoId).map(s=>({id:s.participanteId, saldo:Math.round(s.saldo)}));
  const deudores = saldos.filter(s=>s.saldo<0).map(s=>({id:s.id, monto:-s.saldo})).sort((a,b)=>b.monto-a.monto);
  const acreedores = saldos.filter(s=>s.saldo>0).map(s=>({id:s.id, monto:s.saldo})).sort((a,b)=>b.monto-a.monto);
  const out: TransferenciaSugerida[] = [];
  let i=0, j=0;
  while(i<deudores.length && j<acreedores.length){
    const d = deudores[i], a = acreedores[j];
    const monto = Math.min(d.monto, a.monto);
    if(monto>0) out.push({de:d.id, a:a.id, monto});
    d.monto -= monto; a.monto -= monto;
    if(d.monto<=0) i++;
    if(a.monto<=0) j++;
  }
  return out;
}

// Reparte un monto total entre N participantes de forma exacta (nunca $1 de diferencia por
// redondeo): todos reciben el mismo piso, y el resto (siempre < N) se reparte de a $1 entre
// los primeros participantes de la lista — mismo criterio que ya usa la app para cuotas.
export function repartirIguales(monto: number, participanteIds: string[]): Record<string, number> {
  const n = participanteIds.length;
  const out: Record<string, number> = {};
  if(n===0) return out;
  const piso = Math.floor(monto/n);
  let resto = Math.round(monto) - piso*n;
  participanteIds.forEach((id, idx)=>{
    out[id] = piso + (idx<resto ? 1 : 0);
  });
  return out;
}

/* ----- expresiones tipo Tricount: "22000-5000", "64000/2", etc. ----- */
export function safeEvalExpr(raw){
  const cleaned = String(raw).replace(/,/g,'.').replace(/\s+/g,'');
  if(cleaned==='' || !/^[0-9+\-*/().]*$/.test(cleaned)) return null;
  let pos = 0;
  function peek(){ return cleaned[pos]; }
  function parseExpr(){
    let v = parseTerm();
    while(peek()==='+' || peek()==='-'){ const op=peek(); pos++; const rhs=parseTerm(); v = op==='+' ? v+rhs : v-rhs; }
    return v;
  }
  function parseTerm(){
    let v = parseFactor();
    while(peek()==='*' || peek()==='/'){ const op=peek(); pos++; const rhs=parseFactor(); v = op==='*' ? v*rhs : v/rhs; }
    return v;
  }
  function parseFactor(){
    if(peek()==='('){ pos++; const v=parseExpr(); if(peek()===')') pos++; else throw 0; return v; }
    if(peek()==='-'){ pos++; return -parseFactor(); }
    if(peek()==='+'){ pos++; return parseFactor(); }
    const start=pos;
    while(/[0-9.]/.test(peek()||'')) pos++;
    if(start===pos) throw 0;
    return parseFloat(cleaned.slice(start,pos));
  }
  try{
    const result = parseExpr();
    if(pos!==cleaned.length) return null;
    return isFinite(result) ? result : null;
  }catch(e){ return null; }
}
export function formatEditableNumber(v){
  const r = Math.round(v*100)/100;
  return (Math.abs(r - Math.round(r))<0.001) ? String(Math.round(r)) : String(r);
}

/* ----- meses (para proyecciones de cuotas) ----- */
export function monthAddStr(ym, n){
  const [y,m] = ym.split('-').map(Number);
  const total = (y*12 + (m-1)) + n;
  const ny = Math.floor(total/12), nm = (total%12)+1;
  return ny + '-' + String(nm).padStart(2,'0');
}
export function monthLabelFor(ym){
  const [y,m] = ym.split('-').map(Number);
  const nombre = MESES_LARGO[m-1];
  return nombre.charAt(0).toUpperCase()+nombre.slice(1)+' '+y;
}
export function ensureMonthExists(ym){
  if(!MONTHS.includes(ym)){
    MONTHS.push(ym);
    MONTHS.sort();
    MONTH_LABEL[ym] = monthLabelFor(ym);
  }
  state.monthIndex = Math.min(state.monthIndex, MONTHS.length-1);
}
export function fechaForCuota(rootFecha, monthsAhead){
  const ym = monthAddStr(rootFecha.slice(0,7), monthsAhead);
  const day = parseInt(rootFecha.slice(8,10),10);
  const [y,m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return ym + '-' + String(Math.min(day,lastDay)).padStart(2,'0');
}
export function regenerateCuotasFor(rootId){
  setTX(TX.filter(t=> t.cuotaOf !== rootId));
  const root = getTx(rootId);
  if(root && root.cuotas && root.cuotas.total>1){
    for(let k=2;k<=root.cuotas.total;k++){
      const fecha = fechaForCuota(root.fecha, k-1);
      ensureMonthExists(fecha.slice(0,7));
      TX.push({
        id: root.id+'-c'+k, fecha, hora: root.hora, comercio: root.comercio, monto: root.monto,
        medio: root.medio, tipo: root.tipo, recurrencia: root.recurrencia, estado:'confirmado',
        categorias: root.categorias.map(c=>({cat:c.cat, monto:c.monto})),
        porCobrar:[], reglaAuto:false, nota: root.nota,
        cuotaOf: root.id, cuotaNumero:k, cuotaTotal: root.cuotas.total, cuotaProyectada:true
      });
    }
  }
}

