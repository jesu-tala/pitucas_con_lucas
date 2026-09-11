import { getTx } from './sheet';
import { SHARED_EXPENSES, GROUP_PARTICIPANTS, MONTHS_LONG, MONTHS, MONTH_LABEL, PAID_BALANCES, TRANSACTIONS, setTransactions, state } from './state';
import { SharedExpense, ExpenseSplit, GroupParticipant, ParticipantBalance, SuggestedTransfer, SplitType, Transaction, ReceivableItem } from './types';
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
// Un participante con historial no se puede eliminar sin corromper cuentas ya cerradas:
// grupo_participantes.id tiene on delete cascade desde gasto_reparto (schema_gastos_compartidos.sql),
// así que borrarlo se llevaría por delante su parte de cualquier gasto ya repartido -- el total
// de ese gasto dejaría de sumar lo que sumaba, y su "pagado_por" quedaría apuntando a nadie si
// fue quien pagó. Se revisa las 3 tablas donde puede aparecer: pagó un gasto, le tocó una
// parte de un reparto, o participó en una transferencia manual ya registrada.
export function participantHasHistory(participantId: string): boolean {
  if(SHARED_EXPENSES.some(g=>g.pagado_por===participantId)) return true;
  if(SHARED_EXPENSES.some(g=>splitsOfExpense(g).some(r=>r.participante_id===participantId))) return true;
  if(PAID_BALANCES.some(s=>s.de_participante===participantId || s.a_participante===participantId)) return true;
  return false;
}
export function splitsOfExpense(g: SharedExpense): ExpenseSplit[] {
  return g.reparto || [];
}
// The participant (with an account) that corresponds to this user_id within this group, or
// null if that user isn't a member (shouldn't happen if the tables are consistent, but an
// expense from a group I'm no longer a member of shouldn't break the app). Lives here (not in
// menu.ts, where it used to be defined) because it's pure data lookup over GROUP_PARTICIPANTS,
// same spirit as participantsOfGroup above — both views/menu.ts (learned category mapping) and
// views/grupos.ts (group detail tabs) need it, and this module is the shared home for pure
// group-data helpers so neither view has to import from the other.
export function participantIdForUser(groupId: string, userId: string | null): string | null {
  const p = GROUP_PARTICIPANTS.find(x=>x.grupo_id===groupId && x.user_id===userId);
  return p ? p.id : null;
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
// everyone gets the same floor, and the remainder (always < N) is absorbed by the LAST
// participant in the list, in one lump sum -- unlike installments (which hand it out $1 at a
// time to the first ones), a bill split reads oddly if "whoever happens to be first" silently
// gets charged a few pesos more than everyone else; putting the whole remainder on one person
// (last in the list, arbitrary but stable) keeps it dead simple to explain: "everyone pays the
// same, except <last person>, who covers the last few pesos of rounding".
export function splitEqually(monto: number, participantIds: string[]): Record<string, number> {
  const n = participantIds.length;
  const out: Record<string, number> = {};
  if(n===0) return out;
  const floor = Math.floor(monto/n);
  const remainder = Math.round(monto) - floor*n;
  participantIds.forEach((id, idx)=>{
    out[id] = floor + (idx===n-1 ? remainder : 0);
  });
  return out;
}

// "Por partes" (Splitwise/Tricount-style "shares"): each included participant gets an arbitrary
// positive number of "partes" (weights, not %/$) -- e.g. jesu 3, javi 2, Y 1 -- and the money is
// derived proportionally, never typed directly. This is the whole point of this modality: unlike
// pct/montos (where the person types money-ish numbers that must add up exactly, or saving stays
// blocked), a share split ALWAYS sums to the total by construction, whatever positive weights are
// chosen -- there's nothing to "balance" by hand. Same last-absorbs-the-remainder rounding rule as
// splitEqually (a plain equal split, weights all 1, is just a special case of this).
export function splitByShares(total: number, participantIds: string[], partes: Record<string, number>): Record<string, number> {
  const n = participantIds.length;
  const out: Record<string, number> = {};
  if(n===0) return out;
  const sumPartes = participantIds.reduce((s,id)=>s+Math.max(0,partes[id]||0),0);
  if(sumPartes<=0) return splitEqually(total, participantIds);
  let asignado = 0;
  participantIds.forEach((id, idx)=>{
    if(idx===n-1){ out[id] = total-asignado; return; }
    const monto = Math.round(total*Math.max(0,partes[id]||0)/sumPartes);
    out[id] = monto;
    asignado += monto;
  });
  return out;
}

// ---- The 3 split modalities, shared by BOTH call sites (a group's "share with a group" and a
// no-group transaction's "divide this expense with someone") -- see renderSplitDraftForm in
// views/grupos.ts for the one UI component both build on top of this. ----
//
// 'iguales' ("Por partes") reads each included participant's own typed "número de partes" from
// draft.customValues (a blank value defaults to 1 part, same as everyone starting equal) and
// derives the money via splitByShares -- always sums exactly, nothing to balance by hand.
// 'pct'/'montos' read each included participant's own typed value from draft.customValues (a
// percentage, or a plain amount) and round it -- nothing here tries to auto-balance what the user
// types: the "sum must match the total exactly" rule is enforced by disabling the confirm button
// (see renderSplitDraftForm), never by silently nudging a number the person typed themselves.
export function computeShareAmounts(total: number, draft): Record<string, number> {
  const ids: string[] = draft.participantesIncluidos;
  if(draft.divisionTipo==='iguales'){
    const partes: Record<string, number> = {};
    ids.forEach(id=>{
      const raw = draft.customValues[id];
      const v = (raw==null || raw==='') ? 1 : safeEvalExpr(raw);
      partes[id] = (v==null || v<=0) ? 1 : v;
    });
    return splitByShares(total, ids, partes);
  }
  const out: Record<string, number> = {};
  ids.forEach(id=>{
    const raw = draft.customValues[id];
    const v = (raw==null || raw==='') ? null : safeEvalExpr(raw);
    if(v==null){ out[id] = 0; return; }
    out[id] = draft.divisionTipo==='pct' ? Math.round(total*v/100) : Math.round(v);
  });
  return out;
}
export function shareAmountsSum(amounts: Record<string, number>, includedIds: string[]): number {
  return includedIds.reduce((s,id)=>s+(amounts[id]||0),0);
}

// A fresh "divide this expense with someone" draft for a transaction with NO group -- the
// no-group twin of defaultShareDraft (views/grupos.ts), which is for the "share with a group"
// case. Defaults to just "Tú" (the account owner), pre-selected both as the only participant
// and as the payer -- the sensible minimal starting point; the user checks in whoever else was
// there (and can change the payer to any of them, which is what produces the 'debo' case --
// see commitPersonaSplit below).
export function defaultPersonaSplitDraft(txId: string){
  return {
    txId, groupId: null, divisionTipo: 'iguales' as SplitType, pagadoPorId: 'tu',
    participantesIncluidos: ['tu'], customValues: {} as Record<string,string>, extraParticipants: [] as string[]
  };
}

// Rebuilds a no-group split draft FROM a transaction's already-committed porCobrar/pagador/
// divisionTipo -- used by "Editar reparto" so reopening it doesn't throw away whatever modality/
// amounts were chosen before. For a 'debo' split (someone else paid), only your own share and
// the payer were ever kept (see commitPersonaSplit) -- reopening reconstructs the minimal
// 2-person draft (you + whoever paid); anyone else who was really there has to be added back by
// hand, same deliberate scope limit as the rest of this feature (no full N-way ledger here).
export function draftFromExistingSplit(t: Transaction){
  // 'iguales' ("por partes") never stores the original weights that were typed (only the final
  // peso amount each person ended up with) -- reopening it as 'iguales' used to seed the "número
  // de partes" input with that raw peso amount instead (e.g. "21333"), which reads as nonsense
  // in a field meant for a small weight like "1" or "2". It also only did that for the OTHER
  // participants, never for whoever's implied share balances the total (see seed() below), so
  // the weights didn't add back up to the transaction's real total and "Guardar reparto" looked
  // broken (total repartido never matched). 'montos' (monto fijo) is always exact AND legible for
  // a reopened split, so 'iguales' collapses into it here; 'montos'/'pct' reopen as themselves,
  // both fully recoverable from the amounts already on record.
  const storedTipo: SplitType = t.divisionTipo || 'iguales';
  const divisionTipo: SplitType = storedTipo==='iguales' ? 'montos' : storedTipo;
  const personaRows = (t.porCobrar||[]).filter(p=>p.tipo==='persona');
  const deboRow = personaRows.find(p=>p.direccion==='debo');
  const seed = (id: string, monto: number, customValues: Record<string,string>) => {
    customValues[id] = divisionTipo==='pct'
      ? String(t.monto ? Math.round((monto/t.monto)*1000)/10 : 0)
      : String(monto);
  };
  if(t.pagador || deboRow){
    const pagadoPorId = t.pagador || (deboRow ? deboRow.persona : 'tu');
    const monto = deboRow ? (deboRow.monto||0) : 0;
    const customValues: Record<string,string> = {};
    // Both rows get seeded (not just "tu"): the payer's own implied share is whatever's left of
    // the total, so the two amounts always add back up to t.monto -- otherwise the payer's field
    // defaulted to blank/0 and the split could never balance back to the full amount.
    seed('tu', monto, customValues);
    seed(pagadoPorId, t.monto - monto, customValues);
    return {
      txId: t.id, groupId: null, divisionTipo, pagadoPorId,
      participantesIncluidos: ['tu', pagadoPorId], customValues, extraParticipants: [pagadoPorId]
    };
  }
  const participantesIncluidos = ['tu', ...personaRows.map(p=>p.persona)];
  const customValues: Record<string,string> = {};
  // Same reasoning: "tu" (the payer here) is never a row in porCobrar (only the OTHER people's
  // shares are), so its own implied amount -- the total minus everyone else's share -- has to be
  // seeded by hand too, or its field defaults to blank/0 and the total never balances.
  const sumaOtros = personaRows.reduce((s,p)=>s+(p.monto||0),0);
  seed('tu', t.monto - sumaOtros, customValues);
  personaRows.forEach(p=>seed(p.persona, p.monto||0, customValues));
  return {
    txId: t.id, groupId: null, divisionTipo, pagadoPorId: 'tu',
    participantesIncluidos, customValues, extraParticipants: personaRows.map(p=>p.persona)
  };
}

// Commits a "divide this expense with someone" draft (no group) into the transaction's own
// porCobrar -- the no-group twin of shareExistingTransaction (views/menu.ts), which writes to
// Supabase for the group case. Two shapes, matching ReceivableItem.direccion (see types.ts):
//  · payer is "Tú" (today's only case, unchanged): one row per OTHER included participant,
//    direccion 'me_deben' -- they owe you their computed share.
//  · payer is someone else: a SINGLE synthetic row for your own share, direccion 'debo' --
//    "you owe them" -- never a full row per other participant: this app only ever tracks YOUR
//    relationship to whoever actually paid, not a full N-way ledger between ad-hoc people (a
//    real Group is for that). The row's `persona` is the payer's name so it reads naturally
//    ("Le debes a Fran") and so buildChargeWhatsAppText/copy flows have something sensible to
//    show if this ever needs it.
// Any 'reembolso' rows already on the transaction are untouched -- this only ever replaces the
// 'persona' rows.
export function commitPersonaSplit(t: Transaction, draft, amounts: Record<string, number>){
  const reembolsoRows = (t.porCobrar||[]).filter(p=>p.tipo==='reembolso');
  let personaRows: ReceivableItem[];
  if(draft.pagadoPorId==='tu'){
    personaRows = draft.participantesIncluidos.filter(id=>id!=='tu').map(id=>({
      persona: id, monto: amounts[id]||0, pagado:false, tipo:'persona' as const,
      montoRecibido:null, linkedTxId:null, direccion:'me_deben' as const
    }));
    delete t.pagador;
  } else {
    personaRows = [{
      persona: draft.pagadoPorId, monto: amounts['tu']||0, pagado:false, tipo:'persona' as const,
      montoRecibido:null, linkedTxId:null, direccion:'debo' as const
    }];
    t.pagador = draft.pagadoPorId;
  }
  t.divisionTipo = draft.divisionTipo;
  t.porCobrar = personaRows.concat(reembolsoRows);
  t.estado = (personaRows.length>0 || reembolsoRows.length>0)
    ? 'por_cobrar'
    : (t.categorias.length>0 ? 'confirmado' : 'pendiente');
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

// Reformats a text input's value with Chilean-style thousands separators (1.234.567) live,
// as the user types, keeping the cursor in a sane spot (measured from the end of the string,
// which stays stable as digits get grouped from the right). Several money fields in this app
// (Monto objetivo, Aporte mensual, etc.) support typing a full arithmetic expression on save
// (safeEvalExpr, above -- "22000-5000", "64000/2") -- reformatting those mid-expression would
// mangle them, so this only kicks in when the current value is a plain number (just digits,
// maybe with separators already in it, maybe one leading "-"); anything else (an operator, a
// decimal comma, letters) is left completely alone.
export function liveFormatThousands(el){
  const raw = el.value;
  const negative = raw.trim().charAt(0)==='-';
  const digitsOnly = raw.replace(/[^\d]/g,'');
  const plainNumber = (negative ? '-' : '') + digitsOnly;
  if(raw.replace(/\./g,'') !== plainNumber || !digitsOnly) return;
  const cursorFromEnd = raw.length - (el.selectionStart==null ? raw.length : el.selectionStart);
  const formatted = (negative?'-':'') + digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  if(formatted===raw) return;
  el.value = formatted;
  const pos = Math.max(0, formatted.length - cursorFromEnd);
  el.setSelectionRange(pos, pos);
}

// liveFormatThousands() above inserts a "." into the input's DOM value purely for display, as
// the user types -- every place that also feeds that same value into safeEvalExpr(), or stores
// it in a draft string that gets safeEvalExpr()'d later at save time, needs the mark stripped
// first. Without this, typing "483000" ends up read back as "483.000" and misparsed as the
// decimal 483 (or worse, a mark landing mid-typing turns "483000" into "48.3000" -> 48.3 --
// exactly the "escribí 483000 y quedó en 48.3" bug this fixes). A real arithmetic expression
// ("22000-5000") is never touched by liveFormatThousands in the first place (see its own
// early-return above), so a "." only ever needs stripping when the rest of the string is a
// plain number -- this mirrors that same check.
export function stripThousandsMarks(raw){
  const negative = raw.trim().charAt(0)==='-';
  const digitsOnly = raw.replace(/[^\d]/g,'');
  const plainNumber = (negative ? '-' : '') + digitsOnly;
  return (digitsOnly && raw.replace(/\./g,'')===plainNumber) ? plainNumber : raw;
}
export function safeEvalMoneyExpr(raw){
  return safeEvalExpr(stripThousandsMarks(raw));
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
