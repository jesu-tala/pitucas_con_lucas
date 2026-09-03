import { ensureMonthExists } from './shared-expenses';
import { getTx } from './sheet';
import { CATEGORIES, PAYMENT_METHODS, TRANSACTIONS, todayISO } from './state';
import { Transaction } from './types';
/* ===================== HELPERS ===================== */
export function txsOfMonth(m){ return TRANSACTIONS.filter(t=>t.fecha.slice(0,7)===m); }
export function catInfo(id){ return CATEGORIES[id] || {nombre:'Sin categoría', color:'neutral', icon:'more', tipo:'gasto'}; }

// Your salary doesn't send an email (unlike a card purchase), so it never gets imported by
// itself — this detects that a new month has already started without you having registered a
// "sueldo"-category income yet, to suggest it with the last time's amount as a reference (you
// confirm it or adjust it, it's never added by itself without you seeing it).
export function lastSalaryTx(){
  const candidates = TRANSACTIONS.filter(t=>t.categorias.some(c=>c.cat==='sueldo')).slice().sort((a,b)=> b.fecha.localeCompare(a.fecha));
  return candidates[0] || null;
}
export function currentMonthHasSalary(){
  return txsOfMonth(todayISO().slice(0,7)).some(t=>t.categorias.some(c=>c.cat==='sueldo'));
}

// Lightweight term chip for goals and platforms — doesn't restructure anything, it just lets
// you see at a glance what's short/medium/long term within the same per-platform organization
// we already have.
export const GOAL_TERM = {
  corto:{label:'Corto', color:'sky'},
  medio:{label:'Medio', color:'sage'},
  largo:{label:'Largo', color:'lavender'}
};
export function termChip(plazo){
  if(!plazo || !GOAL_TERM[plazo]) return '';
  const p = GOAL_TERM[plazo];
  return '<span class="plazo-chip" style="background:var(--cat-'+p.color+'-fill);color:var(--cat-'+p.color+'-ink);">'+p.label+'</span>';
}
// If a transaction ended up pointing at a payment method that no longer exists (or never had
// one, e.g. old data from before the field was required), this used to return an object
// without "corto" — and since the row's text is built directly from medio.corto, JS showed it
// literally as the word "undefined" instead of something readable.
export function paymentMethodInfo(id){ return PAYMENT_METHODS[id] || {nombre:'Medio desconocido', corto:'Sin medio', icon:'card'}; }
// Small icon next to the last digits of the payment method in the Transactions list — a card
// if it's a card, a money bag if it's cash. The other payment methods (checking account, etc.)
// stay without an icon here, same as today.
export function paymentMethodTagIcon(medio){
  if(medio.icon==='card') return '💳';
  if(medio.icon==='cash') return '💰';
  return '';
}

export function catTotalAmount(t){ return t.categorias.reduce((s,c)=>s+c.monto,0); }

// A pending item (receivable from a person, or reimbursement of an expense) may not have an
// expected amount yet (reimbursements: you don't always know how much you'll get back until it
// arrives). While it's not paid, it counts as "expected amount" (0 if not known yet — i.e. it's
// still your share of the expense until it's resolved). Once paid/linked to a real deposit, it
// reports the amount that actually arrived (montoRecibido), not the estimate.
export function pendingEffectiveAmount(p){
  if(p.pagado) return p.montoRecibido!=null ? p.montoRecibido : (p.monto||0);
  return p.monto!=null ? p.monto : 0;
}
export function receivableTotal(t){ return t.porCobrar.reduce((s,p)=>s+pendingEffectiveAmount(p),0); }

// ---- Netting of receivables (splits with friends) vs. reimbursements ----
//
// Two cases that look similar but are accounted for differently:
//  · type 'persona' (you split a bill, someone owes you their share): that money was NEVER
//    your expense — you just fronted it. It's deducted from "Expenses" AS SOON as you split it
//    (not when you get paid), in the same month as the original transaction. When you get paid,
//    it only settles the receivable: it doesn't come back in as income nor get subtracted from
//    the expense again.
//  · type 'reembolso' (health insurer, insurance, your employer): that expense WAS 100% yours —
//    the reimbursement is money that comes back later, and is shown as a credit in the month it
//    arrives ("Reimbursed this month" card), without touching the original month.
// Since the netting happens when you split (not when the deposit is received), a month that's
// already closed doesn't change because of a reimbursement or payment that arrives later — it
// only changes if you edit that old transaction.
export function netExpenseTx(t){
  if(t.tipo!=='gasto') return catTotalAmount(t);
  const personSplits = (t.porCobrar||[]).filter(p=>p.tipo==='persona').reduce((s,p)=>s+(p.monto||0),0);
  return Math.max(catTotalAmount(t) - personSplits, 0);
}
// Factor to proportionally split the netting if the expense is divided across categories.
export function netExpenseFactor(t){
  const gross = catTotalAmount(t);
  return gross>0 ? netExpenseTx(t)/gross : 1;
}
export function catNetAmount(t, c){
  if(t.tipo!=='gasto') return c.monto;
  return c.monto * netExpenseFactor(t);
}
// An income that's actually just a friend paying you back their share (linked to a 'persona'
// type pending item) isn't new money — it was already deducted from the expense when it was
// split, so it must not be added again as "Income" or it would count twice in your favor.
export function incomeIsPersonSettlement(t){
  if(t.tipo!=='ingreso') return false;
  const link = pendingLinkedTo(t.id);
  if(!link) return false;
  const expenseTx = getTx(link.expenseTxId);
  const p = expenseTx && expenseTx.porCobrar[link.idx];
  return !!(p && p.tipo==='persona');
}
export function netIncomeTx(t){
  if(t.tipo!=='ingreso') return catTotalAmount(t);
  return incomeIsPersonSettlement(t) ? 0 : catTotalAmount(t);
}
// The "really yours" amount of a transaction for Balance/Budget/Evolution aggregates — replaces
// catTotalAmount(t) in those calculations (never in the transaction's own view, which keeps
// showing the full real amount you paid or received).
export function aggregatedTxAmount(t){
  if(t.tipo==='gasto') return netExpenseTx(t);
  if(t.tipo==='ingreso') return netIncomeTx(t);
  return catTotalAmount(t);
}

// All the pending items (persona or reembolso) across every transaction that aren't paid yet —
// for the "link a deposit" flow from the income side.
export function allPendingReceivables(){
  const out = [];
  TRANSACTIONS.forEach(t=>{
    (t.porCobrar||[]).forEach((p,idx)=>{
      if(!p.pagado) out.push({expenseTxId:t.id, idx, comercio:t.comercio, fecha:t.fecha, persona:p.persona, monto:p.monto, tipo:p.tipo||'persona'});
    });
  });
  return out.sort((a,b)=> b.fecha.localeCompare(a.fecha));
}
// If this income is already linked to some pending item, finds it (so it can be shown and
// "remove link" can be offered from the income's detail).
export function pendingLinkedTo(incomeTxId){
  for(const t of TRANSACTIONS){
    for(let idx=0; idx<(t.porCobrar||[]).length; idx++){
      if(t.porCobrar[idx].linkedTxId===incomeTxId) return {expenseTxId:t.id, idx, comercio:t.comercio, persona:t.porCobrar[idx].persona};
    }
  }
  return null;
}
export function resolvePending(expenseTxId, idx, incomeTxId){
  const expenseTx = getTx(expenseTxId), incomeTx = getTx(incomeTxId);
  if(!expenseTx || !incomeTx || !expenseTx.porCobrar[idx]) return false;
  const p = expenseTx.porCobrar[idx];
  p.pagado = true;
  p.montoRecibido = incomeTx.monto;
  p.linkedTxId = incomeTx.id;
  return true;
}
// Turns a receivable (type 'persona') that was never paid into a real expense in the CURRENT
// month — a new transaction is created (the original isn't edited, since it already closed its
// month with the netting applied) and the pending item is removed from the original transaction.
export function writeOffReceivable(expenseTxId, idx){
  const expenseTx = getTx(expenseTxId);
  if(!expenseTx || !expenseTx.porCobrar[idx]) return false;
  const p = expenseTx.porCobrar[idx];
  if(p.pagado || p.tipo!=='persona') return false;
  const amount = Math.round(p.monto||0);
  if(amount<=0){ expenseTx.porCobrar.splice(idx,1); return true; }
  // It used to fall into a fixed "otros_gastos" category that no longer exists in the default
  // category set — if the original transaction had no category, neither does this one: it's
  // left "Sin categoría" (same state already supported elsewhere in the app, with its chip to
  // assign one).
  const catId = expenseTx.categorias[0] ? expenseTx.categorias[0].cat : null;
  const newTx: Transaction = {
    id:'perdida-'+Date.now(), fecha: todayISO(), hora:'12:00',
    comercio: (p.persona||'Cuenta por cobrar')+' — nunca pagó',
    monto: amount, medio: expenseTx.medio, tipo:'gasto', recurrencia:'variable', estado:'confirmado',
    categorias: catId ? [{cat:catId, monto:amount}] : [], porCobrar:[], reglaAuto:false,
    nota:'Dada por perdida: '+(p.persona||'esta persona')+' nunca pagó su parte de "'+expenseTx.comercio+'" ('+dayLabel(expenseTx.fecha)+').'
  };
  TRANSACTIONS.push(newTx);
  ensureMonthExists(newTx.fecha.slice(0,7));
  expenseTx.porCobrar.splice(idx,1);
  return true;
}
// How much you got reimbursed in a given month — counted in the month the deposit arrived (not
// the month of the original expense), because that's when that money actually came back into
// your pocket.
export function monthlyReimbursementTotal(monthKey){
  let total = 0, count = 0;
  TRANSACTIONS.forEach(t=>{
    (t.porCobrar||[]).forEach(p=>{
      if(p.tipo==='reembolso' && p.pagado && p.linkedTxId){
        const incomeTx = getTx(p.linkedTxId);
        if(incomeTx && incomeTx.fecha.slice(0,7)===monthKey){
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
  const days=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return days[d.getDay()]+' '+d.getDate()+' de '+months[d.getMonth()];
}
// Leaves only the first letter capitalized ("miércoles 12 de agosto" -> "Miércoles 12 de
// agosto") — used only in the Transactions date header; the rest of dayLabel()'s uses (a
// transaction's detail, for example) stay as-is, in lowercase.
export function capitalizeFirst(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

export function applyLockRule(tx){
  // Simulates the rule: future (and existing) transactions from the same merchant inherit
  // category/type/recurrence (including whether they end up as "fixed" — see the
  // Fixed/Variable/Investment block in Balance).
  const cat = tx.categorias[0] ? tx.categorias[0].cat : null;
  TRANSACTIONS.forEach(t=>{
    if(t.comercio===tx.comercio && t.id!==tx.id){
      t.reglaAuto = true;
      t.tipo = tx.tipo;
      t.recurrencia = tx.recurrencia;
      if(cat) t.categorias = [{cat, monto: catTotalAmount(t) || t.monto}];
    }
  });
  tx.reglaAuto = true;
}

export function allCollected(t){
  return t.porCobrar.length>0 && t.porCobrar.every(p=>p.pagado);
}
// 'persona' (you split a bill with someone) and 'reembolso' (health insurer/insurance/employer)
// look similar but are different cases — this allows filtering and showing them separately.
export function hasReceivableType(t, tipo){
  return (t.porCobrar||[]).some(p=>p.tipo===tipo);
}
