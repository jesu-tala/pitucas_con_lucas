import { ensureMonthExists } from './shared-expenses';
import { getTx } from './sheet';
import { CATEGORIES, INVESTMENT_GOALS, PAYMENT_METHODS, TRANSACTIONS, todayISO } from './state';
import { GoalTerm, IncomeNature, Transaction } from './types';
/* ===================== HELPERS ===================== */
export function txsOfMonth(m){ return TRANSACTIONS.filter(t=>t.fecha.slice(0,7)===m); }
// An investment-type transaction never categorizes to a Platform id directly anymore (see the
// note on INVESTMENT_GOALS in state.ts) -- its categorias[].cat is either a Goal's id, or that
// Goal's platform's "<platformId>__general" catch-all bucket. catInfo() resolves all three
// shapes (plain category, Goal, General bucket) so every existing caller (Transactions list,
// Balance/Budget donuts, the classification-rules editor, filters...) keeps working without
// having to know which kind of id it got.
export function catInfo(id){
  if(CATEGORIES[id]) return CATEGORIES[id];
  const goal = INVESTMENT_GOALS.find(m=>m.id===id);
  if(goal){
    const plat = CATEGORIES[goal.plataformaId] || {colorHue:265, icon:'trending'};
    return {nombre:goal.nombre, tipo:'inversion', colorHue:plat.colorHue, icon:plat.icon, plataformaId:goal.plataformaId, goalId:goal.id};
  }
  if(typeof id==='string' && id.endsWith('__general')){
    const platId = id.slice(0, -'__general'.length);
    const plat = CATEGORIES[platId];
    if(plat) return {nombre:plat.nombre+' · General', tipo:'inversion', colorHue:plat.colorHue, icon:plat.icon, plataformaId:platId, general:true};
  }
  return {nombre:'Sin categoría', colorHue:265, icon:'more', tipo:'gasto'};
}
// "Ver transacciones →" on a platform card wants every transaction that rolls up into that
// platform -- any of its goals, or its General bucket -- not just an exact id match (a bare
// platform id is never itself a transaction's category anymore, see catInfo() above). `catId` is
// what's actually stored on the transaction; `filterId` is what's being filtered by (may be a
// platform id, from data-platform-see-more, or a Goal/General id, from a donut legend click).
export function categoryFilterMatches(catId, filterId){
  if(catId===filterId) return true;
  if(CATEGORIES[filterId] && CATEGORIES[filterId].tipo==='inversion'){
    if(catId===filterId+'__general') return true;
    const goal = INVESTMENT_GOALS.find(m=>m.id===catId);
    if(goal && goal.plataformaId===filterId) return true;
  }
  return false;
}

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
export const GOAL_TERM: Record<GoalTerm, {label:string, color:string}> = {
  corto:{label:'Corto', color:'sky'},
  medio:{label:'Medio', color:'sage'},
  largo:{label:'Largo', color:'lavender'}
};
export function termChip(plazo: GoalTerm | null | undefined){
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
// reports the amount that actually arrived so far (see receivableAssignedTotal below) -- while
// PARTIALLY paid, that's the confirmed amount, not the original estimate.
export function pendingEffectiveAmount(p){
  const estado = receivableEstado(p);
  if(estado==='saldado') return receivableAssignedTotal(p);
  // 'parcial' es un estado nuevo (ver receivableEstado) -- persona y reembolso lo tratan
  // distinto: un reembolso neta progresivamente a medida que se confirma cada parte (igual que
  // siempre netea "apenas se sabe", ver la nota grande más abajo), así que acá SÍ cuenta lo
  // asignado hasta ahora. Un cobro de persona, en cambio, ya se descontó COMPLETO del gasto al
  // compartirlo -- cuánto de la devolución ya llegó es irrelevante para esa cuenta (nunca lo fue,
  // ni antes de que existiera "parcial"): sigue mostrando el monto esperado completo.
  if(estado==='parcial' && p.tipo==='reembolso') return receivableAssignedTotal(p);
  return p.monto!=null ? p.monto : 0;
}
export function receivableTotal(t){ return t.porCobrar.reduce((s,p)=>s+pendingEffectiveAmount(p),0); }

// ---- Conciliar cobros/reembolsos: montos parciales y varios depósitos ----------------------
//
// Antes, vincular un depósito a un por-cobrar era un solo movimiento, todo o nada (resolvePending
// más abajo): un depósito, un por-cobrar, el monto completo del depósito. Este prompt generaliza
// eso a montos parciales y varios-a-varios (un depósito puede saldar VARIOS por-cobrar; un
// por-cobrar puede saldarse con VARIOS depósitos) -- sin crear un mecanismo paralelo: sigue
// siendo la misma fila porCobrar de siempre, con un registro nuevo (`asignaciones`, ver
// ReceivableAssignment en types.ts) de qué depósito aportó cuánto. pagado/montoRecibido/
// linkedTxId (los campos de un solo vínculo, de antes de este prompt) se mantienen por
// compatibilidad con datos ya guardados -- receivableAssignedTotal los lee como una asignación
// implícita única cuando `asignaciones` todavía no existe en la fila.
//
// Todo se centraliza acá: el saldo de un por-cobrar (cuánto se le ha asignado, y su estado
// pendiente/parcial/saldado) se calcula SIEMPRE desde estas funciones -- nunca hay un campo de
// estado guardado aparte que se pueda desincronizar de lo realmente asignado.
export function receivableAssignedTotal(p): number {
  if(p.asignaciones && p.asignaciones.length) return p.asignaciones.reduce((s,a)=>s+(a.monto||0),0);
  if(p.pagado && p.linkedTxId) return p.montoRecibido!=null ? p.montoRecibido : (p.monto||0);
  return 0;
}
// Un por-cobrar sin monto esperado conocido (ej. un reembolso anticipado antes de que la isapre
// diga cuánto) no tiene noción de "parcial" -- cualquier asignación lo cierra directamente,
// igual que antes de este prompt (resolvePending siempre marcaba pagado=true de una).
export function receivableEstado(p): 'pendiente' | 'parcial' | 'saldado' {
  const asignado = receivableAssignedTotal(p);
  if(asignado<=0) return 'pendiente';
  const monto = p.monto;
  if(monto==null || monto<=0) return 'saldado';
  return asignado < monto ? 'parcial' : 'saldado';
}
// Único lugar donde pagado/montoRecibido se escriben -- así nunca quedan desincronizados de lo
// que `asignaciones` realmente dice. pagado=true solo al quedar SALDADO por completo (no
// "parcial"): el resto de la app ya trata pagado como "totalmente resuelto" (allCollected, el
// tag "Saldado"/"Reembolsado" en Transacciones, writeOffReceivable...), y mantener ese
// significado exacto es lo que evita tener que tocar cada lector existente.
function syncPagadoFromAsignaciones(p){
  p.pagado = receivableEstado(p)==='saldado';
  p.montoRecibido = receivableAssignedTotal(p);
}
// Asigna (parcial o total) un monto de un depósito a un por-cobrar -- el reemplazo general de
// resolvePending() de más abajo. Si ese mismo depósito ya le había aportado algo antes, se SUMA
// (nunca se reemplaza ni duplica la fila). A propósito NO se topa al saldo pendiente del propio
// por-cobrar -- un depósito puede superar lo que se debía (sobre-reembolso/sobre-cobro, caso
// real y ya soportado: ver reimbursementExcess), y esa plata de más se sigue viendo reflejada en
// `asignaciones` para que el cálculo del excedente (netIncomeTx) tenga con qué trabajar.
export function assignIncomeToReceivable(expenseTxId, idx, incomeTxId, monto): boolean {
  const expenseTx = getTx(expenseTxId), incomeTx = getTx(incomeTxId);
  if(!expenseTx || !incomeTx || !expenseTx.porCobrar[idx]) return false;
  const p = expenseTx.porCobrar[idx];
  const amt = Math.round(monto||0);
  if(amt<=0) return false;
  if(!p.asignaciones) p.asignaciones = [];
  const existing = p.asignaciones.find(a=>a.incomeTxId===incomeTxId);
  if(existing) existing.monto += amt; else p.asignaciones.push({incomeTxId, monto: amt});
  syncPagadoFromAsignaciones(p);
  return true;
}
// Deshace lo que un depósito puntual le había aportado a un por-cobrar -- lo que hayan aportado
// otros depósitos a esa misma fila queda intacto.
export function removeIncomeAssignment(expenseTxId, idx, incomeTxId): boolean {
  const expenseTx = getTx(expenseTxId);
  if(!expenseTx || !expenseTx.porCobrar[idx]) return false;
  const p = expenseTx.porCobrar[idx];
  if(p.asignaciones && p.asignaciones.length){
    const before = p.asignaciones.length;
    p.asignaciones = p.asignaciones.filter(a=>a.incomeTxId!==incomeTxId);
    if(p.asignaciones.length===before) return false;
    syncPagadoFromAsignaciones(p);
    return true;
  }
  // Dato de un solo vínculo directo, de antes de `asignaciones` -- desvincularlo es volver a
  // como estaba antes de resolvePending().
  if(p.linkedTxId===incomeTxId){
    p.pagado = false; p.montoRecibido = null; p.linkedTxId = null;
    return true;
  }
  return false;
}
// Todos los por-cobrar (de cualquier transacción) a los que este depósito puntual le aportó
// algo -- para "ver los pagos ya asignados" desde el lado del depósito, y para poder deshacer
// cada asignación por separado. Un mismo depósito puede aparecer repartido en varias filas (uno
// de los casos nuevos de este prompt: "un depósito repartido entre varios por-cobrar").
export function receivablesLinkedFrom(incomeTxId){
  const out: {expenseTxId:string, idx:number, comercio:string, persona:string, tipo:string, montoAsignado:number}[] = [];
  TRANSACTIONS.forEach(t=>{
    (t.porCobrar||[]).forEach((p,idx)=>{
      if(p.asignaciones && p.asignaciones.length){
        const a = p.asignaciones.find(x=>x.incomeTxId===incomeTxId);
        if(a) out.push({expenseTxId:t.id, idx, comercio:t.comercio, persona:p.persona, tipo:p.tipo||'persona', montoAsignado:a.monto});
      } else if(p.linkedTxId===incomeTxId){
        out.push({expenseTxId:t.id, idx, comercio:t.comercio, persona:p.persona, tipo:p.tipo||'persona', montoAsignado: p.montoRecibido!=null?p.montoRecibido:(p.monto||0)});
      }
    });
  });
  return out;
}
// Todo lo que un depósito puntual aportó, sumado a través de CUALQUIER por-cobrar de CUALQUIER
// transacción -- lo que no cubre nada de esto sigue siendo ingreso normal (ver netIncomeTx). Un
// simple total de receivablesLinkedFrom, para donde solo hace falta la cifra.
export function incomeAssignedTotal(incomeTxId): number {
  return receivablesLinkedFrom(incomeTxId).reduce((s,l)=>s+l.montoAsignado, 0);
}

// ---- Netting of receivables (splits with friends) vs. reimbursements ----
//
// Two cases that look similar but are accounted for differently:
//  · type 'persona' (you split a bill, someone owes you their share): that money was NEVER
//    your expense — you just fronted it. It's deducted from "Expenses" AS SOON as you split it
//    (not when you get paid), in the same month as the original transaction. When you get paid,
//    it only settles the receivable: it doesn't come back in as income nor get subtracted from
//    the expense again.
//  · type 'reembolso' (health insurer, insurance, your employer): that expense WAS 100% yours,
//    but the reimbursement is a "contra-gasto" -- a recovery of that same expense, not new
//    money -- so it reduces the expense's NET cost in its own category, exactly the same way a
//    'persona' split does (see netExpenseTx below). This applies as soon as the amount is known
//    (an EXPECTED reembolso marked porCobrar at registration time already nets down before a
//    peso arrives -- pendingEffectiveAmount falls back to the estimate while unpaid), and
//    updates to the real montoRecibido once it's actually collected. Whether it was anticipated
//    upfront or applied later against an already-closed expense (an unexpected deposit linked
//    back to it, see applyUnexpectedReimbursement below) makes no difference here: both paths
//    end up as the exact same porCobrar row shape, netted identically.
// Since the netting happens as soon as the reembolso/split exists (not necessarily when the
// deposit is received), a month that's already closed doesn't change on its own when a deposit
// arrives later — it only changes if you edit that old transaction (add/resolve a porCobrar row
// on it), which is exactly what receiving/linking a reembolso does.
// This now covers 3 cases for 'persona', not 2 -- the third (direccion:'debo') was added
// alongside the "divide with someone, with or without a group" feature (see
// ReceivableItem.direccion and Transaction.pagador/divisionTipo in types.ts):
//  · no 'persona' rows: the whole thing is your expense, same as ever.
//  · 'persona' rows with direccion 'me_deben' (or absent -- old data, same meaning): YOU paid the
//    full catTotalAmount(t) and fronted everyone else's share, so their shares net OFF your
//    expense as soon as you split it (unchanged from before this feature).
//  · a SINGLE 'persona' row with direccion 'debo': someone ELSE paid, and this transaction only
//    exists in your ledger to track your own relationship to them (see commitPersonaSplit in
//    shared-expenses.ts, which guarantees a 'debo' row is always alone). catTotalAmount(t) is the
//    whole bill, but you never actually fronted any of it -- your real expense is exactly that
//    row's own amount (your computed share), full stop. It would be wrong to do
//    "catTotalAmount(t) - thatRow" (that nets your OWN share off your OWN expense, leaving ~0);
//    it's equally wrong to count catTotalAmount(t) in full (that's the whole bill, not what you
//    owe). The debo row's amount IS the answer directly -- a 'debo' transaction never has
//    'reembolso' rows of its own either (you don't get reimbursed for someone else's bill).
// Id canónico del balde "sin categoría". catInfo() devuelve el mismo objeto de respaldo para
// CUALQUIER id que no resuelva (una categoría borrada, un null, un id viejo), así que agrupar por
// el id crudo generaba un segmento distinto por cada uno, todos rotulados igual. Todo lo que no
// resuelve se mapea acá para que sea un solo balde.
export const SIN_CATEGORIA_ID = '__sin_categoria';
export function catBucketId(catId){
  return catResuelve(catId) ? catId : SIN_CATEGORIA_ID;
}
// ¿Este id corresponde a algo real (categoría, meta o bucket General de una plataforma)?
export function catResuelve(catId){
  if(catId===FILTRO_APORTE_FIJO) return true;
  if(CATEGORIES[catId]) return true;
  if(INVESTMENT_GOALS.some(m=>m.id===catId)) return true;
  if(typeof catId==='string' && catId.endsWith('__general')){
    return !!CATEGORIES[catId.slice(0, -'__general'.length)];
  }
  return false;
}
export function netExpenseTx(t){
  if(t.tipo!=='gasto') return catTotalAmount(t);
  const deboRow = (t.porCobrar||[]).find(p=>p.tipo==='persona' && p.direccion==='debo');
  if(deboRow) return Math.max(deboRow.monto||0, 0);
  const personSplits = (t.porCobrar||[]).filter(p=>p.tipo==='persona').reduce((s,p)=>s+(p.monto||0),0);
  const reembolsos = (t.porCobrar||[]).filter(p=>p.tipo==='reembolso').reduce((s,p)=>s+pendingEffectiveAmount(p),0);
  return Math.max(catTotalAmount(t) - personSplits - reembolsos, 0);
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
// Sobre-reembolso: a reembolso caps the expense's net cost at $0 (see netExpenseTx) -- it can
// never make an expense negative. But if MORE comes back than the expense actually cost (after
// any persona-splits are already netted off first), that extra isn't a "recovery" anymore: it's
// real money landing in your pocket, the one case where part of a reimbursement legitimately
// counts as Income (see netIncomeTx below). This is that leftover amount, in pesos -- 0 in the
// ordinary (partial or exact) reimbursement case, which needs no special handling at all.
export function reimbursementExcess(t){
  if(t.tipo!=='gasto') return 0;
  const personSplits = (t.porCobrar||[]).filter(p=>p.tipo==='persona').reduce((s,p)=>s+(p.monto||0),0);
  const disponibleParaReembolso = Math.max(catTotalAmount(t) - personSplits, 0);
  const reembolsos = (t.porCobrar||[]).filter(p=>p.tipo==='reembolso').reduce((s,p)=>s+pendingEffectiveAmount(p),0);
  return Math.max(reembolsos - disponibleParaReembolso, 0);
}
// An income transaction linked to a pending item (see resolvePending/applyUnexpectedReimbursement)
// isn't new money in the ordinary case -- it just settles something already accounted for
// elsewhere -- so it must not ALSO count as "Income" or it would count twice in your favor:
//  · linked to a 'persona' row (a friend paying back their share): that money was already
//    deducted from Expenses the moment you split the bill (see netExpenseTx) -- the deposit
//    itself counts for $0 of Income.
//  · linked to a 'reembolso' row (isapre/seguro/empleador): same idea -- the expense's category
//    already absorbed it as a contra-gasto (see netExpenseTx) -- EXCEPT for whatever part is a
//    sobre-reembolso (reimbursementExcess), which the expense side could never absorb (it's
//    floored at $0) and which is therefore real, legitimate Income.
// Not linked to anything (the normal case: salary, a sale, whatever) keeps counting in full.
// Generalizado para varios vínculos a la vez (un depósito puede repartirse entre varios
// por-cobrar, ver assignIncomeToReceivable) -- agrupado por gasto para no recalcular ni
// duplicar el sobre-reembolso de un mismo gasto más de una vez si este depósito le aportó a más
// de una de sus filas. Si el mismo gasto recibió aportes de VARIOS depósitos distintos, el
// sobre-reembolso de ese gasto se reparte entre ellos en proporción a cuánto aportó cada uno --
// para un solo depósito/un solo por-cobrar (el caso de siempre) esto da EXACTAMENTE el mismo
// resultado que antes: 0 para 'persona', reimbursementExcess(expenseTx) para 'reembolso'.
export function netIncomeTx(t){
  if(t.tipo!=='ingreso') return catTotalAmount(t);
  const links = receivablesLinkedFrom(t.id);
  if(!links.length) return catTotalAmount(t);
  // Agrupa por gasto -- si este depósito le aportó a más de una fila del MISMO gasto, el
  // sobre-reembolso de ese gasto (una cifra por transacción, ver reimbursementExcess) no debe
  // recalcularse/duplicarse por cada fila.
  const gastoIds = Array.from(new Set(links.map(l=>l.expenseTxId)));
  let cuentaComoIngreso = 0;
  gastoIds.forEach(expenseTxId=>{
    const expenseTx = getTx(expenseTxId);
    if(!expenseTx) return;
    const gastoLinks = links.filter(l=>l.expenseTxId===expenseTxId);
    // 'persona': esa plata ya se descontó del gasto al compartirlo (ver netExpenseTx) -- $0 de
    // esto cuenta como ingreso. Solo las filas 'reembolso' pueden generar sobre-reembolso.
    const exceso = reimbursementExcess(expenseTx);
    if(exceso<=0) return;
    // Si VARIOS depósitos distintos le aportaron a las filas 'reembolso' de este mismo gasto, el
    // sobre-reembolso se reparte entre ellos en proporción a cuánto aportó cada uno -- para un
    // solo depósito (el caso de siempre) esto da exactamente reimbursementExcess(expenseTx)
    // completo, igual que antes de este prompt.
    const totalAportadoAlGasto = (expenseTx.porCobrar||[]).filter(p=>p.tipo==='reembolso').reduce((s,p)=>s+receivableAssignedTotal(p),0);
    const aportadoPorEsteDeposito = gastoLinks.reduce((s,l)=>{
      const p = expenseTx.porCobrar[l.idx];
      return p && p.tipo==='reembolso' ? s + l.montoAsignado : s;
    },0);
    if(totalAportadoAlGasto>0) cuentaComoIngreso += exceso * (aportadoPorEsteDeposito/totalAportadoAlGasto);
  });
  return Math.round(cuentaComoIngreso);
}
// Same proportional-split idea as netExpenseFactor, for an income transaction that happens to
// carry categories of its own (uncommon for a reembolso-linked deposit specifically -- resolvePending/
// applyUnexpectedReimbursement never assign one -- but not impossible if the user categorizes it
// by hand afterward) -- keeps a per-category donut/breakdown consistent with the transaction-level
// netIncomeTx used everywhere else (month totals, tasa de ahorro, etc.).
export function netIncomeFactor(t){
  const gross = catTotalAmount(t);
  return gross>0 ? netIncomeTx(t)/gross : 1;
}

// ---- Income taxonomy: separating real "Ingreso" from everything else that happens to land in
// the account as a tipo:'ingreso' transaction (see IncomeNature in types.ts). SINGLE source of
// truth: every card and every ratio that needs to know "is this real income?" goes through
// incomeNatureOf/incomeNatureAmount, never re-derives it independently -- that's how a stray
// "traspaso entre mis cuentas" or an asset sale registered as plain income used to quietly
// inflate tasa de ahorro/% de inversión before this existed.
export function incomeNatureOf(t: Transaction): IncomeNature {
  const links = receivablesLinkedFrom(t.id);
  if(links.length){
    // A linked deposit's nature is ALWAYS whatever the pending item(s) it settles actually
    // are -- never an explicit override (naturalezaEntrada doesn't even apply here): the
    // settlement relationship is the ground truth, already established the moment it was
    // linked. Un mismo depósito repartido entre un cobro Y un reembolso (caso nuevo, ver
    // assignIncomeToReceivable) es infrecuente -- 'reembolso' manda en ese caso, porque implica
    // plata real llegando que conviene que se note, no solo una deuda entre personas saldándose.
    const tipos = new Set(links.map(l=>l.tipo));
    if(tipos.has('reembolso')) return 'reembolso';
    if(tipos.has('persona')) return 'cobro';
  }
  if(t.naturalezaEntrada) return t.naturalezaEntrada;
  // The only 2 categories that ship as unambiguously real income out of the box -- anything else
  // (a custom category, or none yet) needs a human tap before it's trusted as real income.
  if(t.categorias.some(c=>c.cat==='sueldo' || c.cat==='pololos_extra')) return 'ingreso';
  return 'por_clasificar';
}
// The peso amount of `t` (a tipo:'ingreso' transaction) that belongs to its own IncomeNature
// bucket -- the full gross amount for every nature EXCEPT 'reembolso', which is special: most of
// a reembolso already has its own home (a contra-gasto on the expense side, see netExpenseTx) and
// its own display card (reimbursementTotalForMonths, unrelated to this) -- only a genuine
// sobre-reembolso excess is new money that actually belongs on the income side, so that's the
// only part counted here (0 in the ordinary, fully-absorbed case).
// Uses t.monto, NOT catTotalAmount(t): a cobro/reembolso-settlement deposit is deliberately left
// uncategorized (see resolvePending/applyUnexpectedReimbursement in helpers.ts, neither ever
// assigns one) -- catTotalAmount would silently read $0 for it (it sums categorias[].monto, which
// is empty), undercounting real cash that landed in the account. t.monto is always the real
// amount regardless of whether it's been categorized.
export function incomeNatureAmount(t: Transaction): number {
  const nature = incomeNatureOf(t);
  // netIncomeTx(t) YA es exactamente "cuánto de este depósito cuenta como ingreso real" --
  // generalizado para varios vínculos a la vez (ver más arriba), da el mismo resultado que antes
  // para el caso de un solo vínculo.
  if(nature==='reembolso') return netIncomeTx(t);
  return t.monto;
}

// The "really yours" amount of a transaction for Balance/Budget/Evolution aggregates — replaces
// catTotalAmount(t) in those calculations (never in the transaction's own view, which keeps
// showing the full real amount you paid or received).
export function aggregatedTxAmount(t){
  if(t.tipo==='gasto') return netExpenseTx(t);
  if(t.tipo==='ingreso') return netIncomeTx(t);
  return catTotalAmount(t);
}

// All the pending items (persona or reembolso) across every transaction that aren't fully
// saldados yet -- for the "link a deposit" flow from the income side. Incluye los PARCIALMENTE
// saldados (todavía tienen algo pendiente) además de los que no tienen nada asignado -- `asignado`
// y `restante` dejan ver de un vistazo cuánto de cada uno ya está cubierto.
export function allPendingReceivables(){
  const out = [];
  TRANSACTIONS.forEach(t=>{
    (t.porCobrar||[]).forEach((p,idx)=>{
      if(p.pagado) return;
      const asignado = receivableAssignedTotal(p);
      const restante = p.monto!=null ? Math.max(p.monto - asignado, 0) : null;
      out.push({expenseTxId:t.id, idx, comercio:t.comercio, fecha:t.fecha, persona:p.persona, monto:p.monto, tipo:p.tipo||'persona', asignado, restante, estado: receivableEstado(p)});
    });
  });
  return out.sort((a,b)=> b.fecha.localeCompare(a.fecha));
}
// Si este depósito ya está vinculado a ALGÚN pendiente, encuentra el primero (para la tarjeta
// simple "Vinculado a X" del detalle del depósito) -- receivablesLinkedFrom (más arriba) da la
// lista completa cuando un mismo depósito está repartido entre varios.
export function pendingLinkedTo(incomeTxId){
  const links = receivablesLinkedFrom(incomeTxId);
  if(!links.length) return null;
  const first = links[0];
  return {expenseTxId:first.expenseTxId, idx:first.idx, comercio:first.comercio, persona:first.persona};
}
// Vínculo simple, todo-o-nada: asigna el monto COMPLETO del depósito a un por-cobrar de una
// sola vez -- un caso particular de assignIncomeToReceivable (arriba), que se generalizó a
// montos parciales y varios-a-varios. Se mantiene con este nombre y esta firma porque sigue
// siendo el atajo correcto para "este depósito es exactamente el pago de este pendiente" (el
// caso más común, y el que ya usan otros caminos existentes como applyUnexpectedReimbursement).
export function resolvePending(expenseTxId, idx, incomeTxId){
  const incomeTx = getTx(incomeTxId);
  if(!incomeTx) return false;
  return assignIncomeToReceivable(expenseTxId, idx, incomeTxId, incomeTx.monto);
}
// Caso B de reembolso ("inesperado"): un depósito llega sin haber sido anticipado como porCobrar
// -- en vez de crear un sistema paralelo, se aplica exactamente como si el reembolso SÍ se
// hubiera anticipado (Caso A): se crea la misma fila 'reembolso' en porCobrar del gasto elegido,
// ya pagada, apuntando a este depósito. netExpenseTx/netIncomeTx/reimbursementExcess (arriba) no
// distinguen entre ambos casos desde acá en adelante -- es la misma máquina.
export function applyUnexpectedReimbursement(gastoTxId, incomeTxId){
  const gastoTx = getTx(gastoTxId), incomeTx = getTx(incomeTxId);
  if(!gastoTx || !incomeTx || gastoTx.tipo!=='gasto') return false;
  gastoTx.porCobrar.push({
    persona: incomeTx.comercio || 'Reembolso', monto: incomeTx.monto, pagado: true,
    tipo:'reembolso', montoRecibido: incomeTx.monto, linkedTxId: incomeTx.id
  });
  // Mismo criterio que en todo el resto de la app (ver events.ts): cualquier transacción con
  // contenido en porCobrar queda en estado 'por_cobrar', sin importar si ya está paga -- así se
  // le pinta el tag "Reembolso" (sheet.ts) y aparece donde corresponde en Transacciones.
  gastoTx.estado = 'por_cobrar';
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
    nota:'Dada por perdida: '+(p.persona||'esta persona')+' nunca pagó su parte de "'+expenseTx.comercio+'" ('+dayLabel(expenseTx.fecha)+').',
    // An explicit action she took in the app (tapping "dar por perdida"), not an automated
    // import -- treated as 'manual' so reconciliation against a bank statement never touches it.
    origen:'manual'
  };
  TRANSACTIONS.push(newTx);
  ensureMonthExists(newTx.fecha.slice(0,7));
  expenseTx.porCobrar.splice(idx,1);
  return true;
}
// How much you got reimbursed across a set of months — counted in the month the deposit arrived
// (not the month of the original expense), because that's when that money actually came back
// into your pocket. Takes an array of 'YYYY-MM' keys so a single month (Balance month mode) and
// a full year's worth of months (Balance year mode) share the exact same counting logic.
export function reimbursementTotalForMonths(monthKeys){
  let total = 0, count = 0;
  TRANSACTIONS.forEach(t=>{
    (t.porCobrar||[]).forEach(p=>{
      if(p.tipo==='reembolso' && p.pagado && p.linkedTxId){
        const incomeTx = getTx(p.linkedTxId);
        if(incomeTx && monthKeys.includes(incomeTx.fecha.slice(0,7))){
          total += (p.montoRecibido!=null ? p.montoRecibido : 0);
          count++;
        }
      }
    });
  });
  return {total, count};
}
export function monthlyReimbursementTotal(monthKey){
  return reimbursementTotalForMonths([monthKey]);
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
      if(cat){
        t.categorias = [{cat, monto: catTotalAmount(t) || t.monto}];
        if(t.estado==='pendiente') t.estado='confirmado';
      }
    }
  });
  tx.reglaAuto = true;
}

// Sets a transaction's monto to newMonto and rescales its categorias proportionally, so
// catTotalAmount() (what Balance/Presupuesto/Evolución actually sum) stays in sync — same
// rounding approach as the manual monto-edit field in events.ts (data-tx-field="monto"): a
// single category gets the new amount directly, several are rescaled preserving their split,
// with the last one absorbing the rounding remainder so the sum lands exactly on newMonto.
// Used to turn "Pago en cuotas" ON/OFF and to resize the number of cuotas: the transaction's
// own monto has to become THAT MONTH's cuota amount (montoTotal / total), never the full
// purchase price, since that's what gets counted every month it appears in (see
// regenerateInstallmentsFor in shared-expenses.ts, which just copies monto/categorias as-is
// into every projected future installment).
export function applyCuotaMonto(t: Transaction, newMonto: number){
  t.monto = newMonto;
  if(t.categorias.length===1){
    t.categorias[0].monto = newMonto;
  } else if(t.categorias.length>1){
    const oldTotal = catTotalAmount(t);
    if(oldTotal>0){
      let asignado = 0;
      t.categorias.forEach((c,idx)=>{
        if(idx===t.categorias.length-1){ c.monto = newMonto - asignado; }
        else { c.monto = Math.round(c.monto/oldTotal*newMonto); asignado += c.monto; }
      });
    }
  }
}

export function allCollected(t){
  return t.porCobrar.length>0 && t.porCobrar.every(p=>p.pagado);
}
// 'persona' (you split a bill with someone) and 'reembolso' (health insurer/insurance/employer)
// look similar but are different cases — this allows filtering and showing them separately.
export function hasReceivableType(t, tipo){
  return (t.porCobrar||[]).some(p=>p.tipo===tipo);
}
