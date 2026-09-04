import { getTx } from './sheet';
import { SHARED_EXPENSES, GROUP_PARTICIPANTS, MONTHS_LONG, MONTHS, MONTH_LABEL, PAID_BALANCES, TRANSACTIONS, setTransactions, state } from './state';
import { SharedExpense, ExpenseSplit, GroupParticipant, ParticipantBalance, SuggestedTransfer } from './types';
/* ===================== SHARED EXPENSES: balance engine =====================
   Pure functions — they don't touch Supabase or the DOM, only GROUP_PARTICIPANTS/
   SHARED_EXPENSES/PAID_BALANCES already loaded in memory. That's why they're easy to cover
   with a test that recalculates "the truth" from scratch (same spirit as audit_consistency.js)
   and compares it. */

export function participantsOfGroup(groupId: string): GroupParticipant[] {
  return GROUP_PARTICIPANTS.filter(p=>p.grupo_id===groupId);
}
export function expensesOfGroup(groupId: string): SharedExpense[] {
  return SHARED_EXPENSES.filter(g=>g.grupo_id===groupId);
}
export function splitsOfExpense(g: SharedExpense): ExpenseSplit[] {
  return g.reparto || [];
}

// paid = everything this participant paid (was pagado_por) on group expenses.
// owed = their share of the split of ALL group expenses (whether they paid or not).
// balance = paid - owed - balances already registered in their favor/against them —
// positive means "this money is owed to them", negative "they owe this money".
export function groupBalances(groupId: string): ParticipantBalance[] {
  const participants = participantsOfGroup(groupId);
  const expenses = expensesOfGroup(groupId);
  const settlements = PAID_BALANCES.filter(s=>s.grupo_id===groupId);

  return participants.map(p=>{
    const paid = expenses.filter(g=>g.pagado_por===p.id).reduce((s,g)=>s+g.monto,0);
    const owed = expenses.reduce((s,g)=>{
      const item = splitsOfExpense(g).find(r=>r.participante_id===p.id);
      return s + (item ? item.monto : 0);
    },0);
    const paidToOthers = settlements.filter(s=>s.de_participante===p.id).reduce((s,x)=>s+x.monto,0);
    const receivedFromOthers = settlements.filter(s=>s.a_participante===p.id).reduce((s,x)=>s+x.monto,0);
    // Settling up: if I pay someone, my "pending owed" goes down (my debt shrinks) — that's
    // why paidToOthers ADDS to my balance (less negative) and receivedFromOthers SUBTRACTS
    // (what I was paid no longer counts as "owed to me").
    const balance = paid - owed + paidToOthers - receivedFromOthers;
    return {participantId:p.id, nombre:p.nombre, color:p.color, paid, owed, balance};
  });
}

// Minimal settlement: instead of "everyone owes everyone a little", builds the shortest
// possible list of transfers that leaves everyone at $0 — classic greedy algorithm (pairs
// whoever owes the most with whoever is owed the most, one at a time).
export function suggestedTransfers(groupId: string): SuggestedTransfer[] {
  const balances = groupBalances(groupId).map(s=>({id:s.participantId, balance:Math.round(s.balance)}));
  const debtors = balances.filter(s=>s.balance<0).map(s=>({id:s.id, monto:-s.balance})).sort((a,b)=>b.monto-a.monto);
  const creditors = balances.filter(s=>s.balance>0).map(s=>({id:s.id, monto:s.balance})).sort((a,b)=>b.monto-a.monto);
  const out: SuggestedTransfer[] = [];
  let i=0, j=0;
  while(i<debtors.length && j<creditors.length){
    const d = debtors[i], a = creditors[j];
    const monto = Math.min(d.monto, a.monto);
    if(monto>0) out.push({from:d.id, to:a.id, monto});
    d.monto -= monto; a.monto -= monto;
    if(d.monto<=0) i++;
    if(a.monto<=0) j++;
  }
  return out;
}

// Splits a total amount among N participants exactly (never a $1 difference from rounding):
// everyone gets the same floor, and the remainder (always < N) is handed out $1 at a time to
// the first participants in the list — same rule the app already uses for installments.
export function splitEqually(monto: number, participantIds: string[]): Record<string, number> {
  const n = participantIds.length;
  const out: Record<string, number> = {};
  if(n===0) return out;
  const floor = Math.floor(monto/n);
  let remainder = Math.round(monto) - floor*n;
  participantIds.forEach((id, idx)=>{
    out[id] = floor + (idx<remainder ? 1 : 0);
  });
  return out;
}

/* ----- Tricount-style expressions: "22000-5000", "64000/2", etc. ----- */
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

/* ----- months (for installment projections) ----- */
export function monthAddStr(ym, n){
  const [y,m] = ym.split('-').map(Number);
  const total = (y*12 + (m-1)) + n;
  const ny = Math.floor(total/12), nm = (total%12)+1;
  return ny + '-' + String(nm).padStart(2,'0');
}
export function monthLabelFor(ym){
  const [y,m] = ym.split('-').map(Number);
  const name = MONTHS_LONG[m-1];
  return name.charAt(0).toUpperCase()+name.slice(1)+' '+y;
}
export function ensureMonthExists(ym){
  if(!MONTHS.includes(ym)){
    MONTHS.push(ym);
    MONTHS.sort();
    MONTH_LABEL[ym] = monthLabelFor(ym);
  }
  state.monthIndex = Math.min(state.monthIndex, MONTHS.length-1);
}
export function dateForInstallment(rootFecha, monthsAhead){
  const ym = monthAddStr(rootFecha.slice(0,7), monthsAhead);
  const day = parseInt(rootFecha.slice(8,10),10);
  const [y,m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return ym + '-' + String(Math.min(day,lastDay)).padStart(2,'0');
}
export function regenerateInstallmentsFor(rootId){
  setTransactions(TRANSACTIONS.filter(t=> t.cuotaOf !== rootId));
  const root = getTx(rootId);
  if(root && root.cuotas && root.cuotas.total>1){
    for(let k=2;k<=root.cuotas.total;k++){
      const fecha = dateForInstallment(root.fecha, k-1);
      ensureMonthExists(fecha.slice(0,7));
      TRANSACTIONS.push({
        id: root.id+'-c'+k, fecha, hora: root.hora, comercio: root.comercio, monto: root.monto,
        medio: root.medio, tipo: root.tipo, recurrencia: root.recurrencia, estado:'confirmado',
        categorias: root.categorias.map(c=>({cat:c.cat, monto:c.monto})),
        porCobrar:[], reglaAuto:false, nota: root.nota,
        cuotaOf: root.id, cuotaNumero:k, cuotaTotal: root.cuotas.total, cuotaProyectada:true,
        // Same purchase as the root (installment 1), just a future month's charge -- inherits
        // its origen so reconcile.ts protects/allows it exactly like the root would be
        // protected/allowed (a manual cuota purchase's future installments stay manual too; an
        // auto-imported one's future installments stay reconcilable). No fuenteLineaId: unlike
        // the root, this row isn't (yet) backed by any specific statement line -- it only
        // becomes "backed" once a real future statement is reconciled against it, purely via
        // matchConfidence (fecha/monto/comercio), the same as any other automatic transaction.
        origen: root.origen
      });
    }
  }
}
