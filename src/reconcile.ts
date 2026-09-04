/* ===================== AUTOMATIC RECONCILIATION (motor) =====================
   Pure functions -- like shared-expenses.ts's balance engine, they don't touch Supabase or the
   DOM, only TRANSACTIONS/PAYMENT_METHODS already loaded in memory, so they're easy to cover with
   a test that builds a small scenario by hand and checks the result (see
   tests/audit_reconcile_diff.js).

   NON-NEGOTIABLE RULES this file exists to enforce (see DOCUMENTACION.md and the feature
   request that shaped it):
   - Reconciliation can ONLY ever propose touching an 'auto-mail'/'auto-cartola' transaction --
     a 'manual' one (or one with no `origen` at all, i.e. legacy/fixture data -- see the note on
     TxOrigen in types.ts) is NEVER a delete candidate, even when the statement seems to
     contradict it. isProtectedOrigin() below is the ONE place that decides this, so every caller
     goes through it instead of repeating `t.origen==='manual'` (which would silently miss the
     undefined case).
   - Nothing is ever mutated here: buildReconcileDiff() only returns a proposal (agregar /
     eliminarPropuesto / revisar / manualesIgnoradas) for a screen to show and the user to
     confirm -- applying it (actually creating or deleting transactions) is the caller's job
     (views/menu.ts + events.ts), same split as shared-expenses.ts's groupBalances/
     suggestedTransfers vs. the code that acts on them. */
import { PAYMENT_METHODS, TRANSACTIONS, normalize } from './state';
import { Transaction, TxOrigen } from './types';

export type MatchConfidence = 'alta' | 'media' | 'baja';

// A parsed statement line -- the shape returned by parseCuentaCorrienteMovs/
// parseTarjetaNacionalMovs in views/menu.ts (kept loose/untyped there already, same convention).
export interface StatementMovement {
  fecha: string;
  detalle: string;
  comercioSugerido?: string;
  monto: number;
  tipoMov: 'gasto' | 'ingreso';
  esEspecial?: string | null;
  fuenteLineaId?: string;
  __match?: Transaction | null;
}

export interface AgregarDiffItem { movimiento: StatementMovement; confianza: MatchConfidence; txPropuesta: Partial<Transaction>; }
export interface EliminarDiffItem { tx: Transaction; motivo: string; }
export interface RevisarDiffItem { movimiento: StatementMovement; confianza: MatchConfidence; candidatos: Transaction[]; }
export interface ManualIgnoradaDiffItem { tx: Transaction; motivo: string; }

export interface ReconcileDiff {
  agregar: AgregarDiffItem[];
  eliminarPropuesto: EliminarDiffItem[];
  revisar: RevisarDiffItem[];
  manualesIgnoradas: ManualIgnoradaDiffItem[];
}

/* ---------- origin / protection ---------- */
// The only two origins reconciliation is ever allowed to touch.
export function isAutomaticOrigin(t: Transaction): boolean {
  return t.origen === 'auto-mail' || t.origen === 'auto-cartola';
}
// Everything else -- 'manual', or (deliberately) no `origen` at all, which covers every fixture/
// demo transaction in state.ts and a couple of derived transactions created before this field
// existed (see the comments on each TRANSACTIONS.push(...) site). Never eligible for
// eliminarPropuesto, no matter how well a statement line "matches" it.
export function isProtectedOrigin(t: Transaction): boolean {
  return !isAutomaticOrigin(t);
}

/* ---------- stable per-line id (idempotency) ---------- */
function hashString(s: string): string {
  let h = 5381;
  for(let i=0;i<s.length;i++){ h = ((h*33) ^ s.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}
// fecha + monto + comercio/detalle + the line's own position in the statement is enough to make
// a stable id per line: re-parsing the exact same PDF/CSV walks its rows in the same order, so
// the same line gets the same id every time -- that's the hard guarantee idempotency relies on
// (matchConfidence below is fuzzy/probabilistic on purpose, and can't be trusted alone for it).
export function movementLineId(m: {fecha:string; monto:number; detalle?:string; comercioSugerido?:string}, idx: number): string {
  const detalle = (m.detalle || m.comercioSugerido || '').trim();
  return 'ln' + hashString([m.fecha, Math.round(m.monto), detalle, idx].join('|'));
}

/* ---------- comercio normalization + fuzzy closeness ---------- */
export function normalizeComercio(s: string): string {
  return normalize(s || '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if(m===0) return n;
  if(n===0) return m;
  const dp = new Array(n+1);
  for(let j=0;j<=n;j++) dp[j] = j;
  for(let i=1;i<=m;i++){
    let prev = dp[0]; dp[0] = i;
    for(let j=1;j<=n;j++){
      const tmp = dp[j];
      dp[j] = a[i-1]===b[j-1] ? prev : 1 + Math.min(prev, dp[j], dp[j-1]);
      prev = tmp;
    }
  }
  return dp[n];
}
// "close match": one contains the other (handles a cuota line's "TIENDA CUOTA 03/12" containing
// the transaction's plain "TIENDA"), or a short edit distance relative to the shorter string.
function comerciosSonParecidos(na: string, nb: string): boolean {
  if(!na || !nb) return false;
  if(na===nb) return true;
  if(na.length>=3 && nb.length>=3 && (na.indexOf(nb)!==-1 || nb.indexOf(na)!==-1)) return true;
  const dist = levenshtein(na, nb);
  const umbral = Math.max(2, Math.floor(Math.min(na.length, nb.length)*0.3));
  return dist <= umbral;
}

function daysBetween(fechaA: string, fechaB: string): number {
  const d1 = new Date(fechaA+'T00:00:00').getTime();
  const d2 = new Date(fechaB+'T00:00:00').getTime();
  return Math.abs(d1-d2) / 86400000;
}

/* ---------- confidence ---------- */
// Extends findSimilarTx's old "same tipo + amount + date within a couple days" idea into three
// levels instead of a single yes/no -- findSimilarTx itself is left completely untouched (still
// used by the old movement-by-movement "+ Agregar" flow) so its existing behavior/tests keep
// working exactly as before; this is a separate, richer function for the new diff.
export function matchConfidence(mov: StatementMovement, tx: Transaction): MatchConfidence | null {
  if(tx.tipo !== mov.tipoMov) return null;
  const montoAbs = Math.abs(mov.monto);
  const montoDiff = Math.abs(tx.monto - montoAbs);
  const diffDias = daysBetween(tx.fecha, mov.fecha);
  const movComercioTxt = mov.comercioSugerido || mov.detalle || '';
  const na = normalizeComercio(movComercioTxt), nb = normalizeComercio(tx.comercio);
  const comercioClose = comerciosSonParecidos(na, nb);

  // Alta: exact amount, close date, comercio clearly the same.
  if(montoDiff===0 && diffDias<=2 && comercioClose) return 'alta';
  // Media: exact amount + close date, but comercio doesn't match well or is missing on one side.
  if(montoDiff===0 && diffDias<=2) return 'media';
  // Baja: everything else still worth surfacing -- a peso or two of rounding, or a wider date
  // window (statement cut-off dates aren't always calendar-month-aligned, and a card
  // installment's projected date is only ever a guess -- see regenerateInstallmentsFor).
  if(montoDiff<=2 && diffDias<=5) return 'baja';
  return null;
}
function nivel(c: MatchConfidence): number { return c==='alta' ? 3 : c==='media' ? 2 : 1; }

/* ---------- statement period (NOT a hardcoded calendar month) ---------- */
export function statementPeriod(movimientos: StatementMovement[]): {desde: string; hasta: string} | null {
  const fechas = movimientos.map(m=>m.fecha).filter(Boolean).sort();
  if(!fechas.length) return null;
  return {desde: fechas[0], hasta: fechas[fechas.length-1]};
}

// A statement showing a charge/reversal already cancelled/reverted -- the parser doesn't tag
// this specially (see parseCuentaCorrienteMovs/parseTarjetaNacionalMovs in views/menu.ts), so it's
// detected here from the line's own text.
function pareceAnulado(mov: StatementMovement): boolean {
  const t = ((mov.detalle||'')+' '+(mov.comercioSugerido||'')).toUpperCase();
  return /ANULAD|ANULACION|REVERS/.test(t);
}

// Which "family" of payment method a statement can possibly back -- a checking-account cartola
// can never confirm or contradict a card purchase and vice versa, so a transaction on the wrong
// family is never even considered a candidate for eliminarPropuesto/manualesIgnoradas (it simply
// isn't on THIS statement, by definition -- nothing to propose about it here).
function medioFamiliaCoincide(tx: Transaction, tipoCartola: string | null): boolean {
  const pm = PAYMENT_METHODS[tx.medio];
  if(!pm) return false;
  if(tipoCartola==='tarjeta_nacional') return pm.icon==='card';
  if(tipoCartola==='cuenta_corriente') return pm.icon==='bank';
  return false;
}

// Lightweight preview of what "Agregar" would create -- shown in the review screen. The actual
// creation (when the user confirms) still goes through createTxFromMovement (views/menu.ts),
// which already knows how to guess a category from a classification rule -- this is only for
// display, so it doesn't need to duplicate that logic.
function buildTxPropuesta(mov: StatementMovement, tipoCartola: string | null): Partial<Transaction> {
  const origen: TxOrigen = 'auto-cartola';
  return {
    fecha: mov.fecha,
    comercio: mov.comercioSugerido || mov.detalle,
    monto: Math.abs(mov.monto),
    tipo: mov.tipoMov,
    origen,
    fuenteLineaId: mov.fuenteLineaId
  };
}

/* ---------- the diff ---------- */
// Builds the full comparison between a parsed statement's movements and the automatic
// transactions already in the app for that same period -- never mutates anything, only returns
// a proposal. `tipoCartola` is `state.reconciliar.tipo` ('cuenta_corriente' | 'tarjeta_nacional').
export function buildReconcileDiff(movimientos: StatementMovement[], tipoCartola: string | null): ReconcileDiff {
  const normales = movimientos.filter(m => m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido');
  const periodo = statementPeriod(movimientos);

  const agregar: AgregarDiffItem[] = [];
  const revisar: RevisarDiffItem[] = [];
  const eliminarPropuesto: EliminarDiffItem[] = [];
  const manualesIgnoradas: ManualIgnoradaDiffItem[] = [];

  // ---- side A: for each statement line, is it already backed by something in the app? ----
  normales.forEach(mov => {
    // Hard idempotency guarantee: a line already turned into a transaction by a previous run of
    // THIS SAME statement is never proposed again, regardless of what the fuzzy matching below
    // would say (comercio text, rounding, etc. can drift enough to fool it on a second pass).
    if(mov.fuenteLineaId && TRANSACTIONS.some(t => t.fuenteLineaId===mov.fuenteLineaId)) return;

    const candidatosAlta: Transaction[] = [], candidatosMedia: Transaction[] = [], candidatosBaja: Transaction[] = [];
    TRANSACTIONS.forEach(t => {
      const c = matchConfidence(mov, t);
      if(c==='alta') candidatosAlta.push(t);
      else if(c==='media') candidatosMedia.push(t);
      else if(c==='baja') candidatosBaja.push(t);
    });

    if(candidatosAlta.length===1) return; // clearly already registered
    if(candidatosAlta.length>1){ revisar.push({movimiento:mov, confianza:'alta', candidatos:candidatosAlta}); return; }
    if(candidatosMedia.length===1) return; // single decent match (exact amount+date, weak comercio)
    if(candidatosMedia.length>1){ revisar.push({movimiento:mov, confianza:'media', candidatos:candidatosMedia}); return; }
    if(candidatosBaja.length>=1){ revisar.push({movimiento:mov, confianza:'baja', candidatos:candidatosBaja}); return; }

    // Nothing in the app resembles this line at all -- clean, unambiguous "missing".
    agregar.push({movimiento:mov, confianza:'alta', txPropuesta: buildTxPropuesta(mov, tipoCartola)});
  });

  // ---- side B & C: for each transaction that plausibly belongs on THIS statement, does the
  // statement back it? Only automatic transactions (auto-mail/auto-cartola) can ever become an
  // eliminarPropuesto candidate; protected ones (manual, or no origen at all) only ever get an
  // informational manualesIgnoradas entry -- they are NEVER touched. ----
  if(periodo){
    TRANSACTIONS
      .filter(t => medioFamiliaCoincide(t, tipoCartola) && t.fecha>=periodo.desde && t.fecha<=periodo.hasta)
      .forEach(t => {
        let mejor: MatchConfidence | null = null;
        let anulado = false;
        normales.forEach(mov => {
          const c = matchConfidence(mov, t);
          if(c && (!mejor || nivel(c) > nivel(mejor))) mejor = c;
          if(c && (c==='alta' || c==='media') && pareceAnulado(mov)) anulado = true;
        });
        // Any match at all (even a weak "baja" one), as long as it's not flagged anulado: leave
        // it alone -- ambiguous is not grounds to propose deletion, and a good match means it's
        // simply backed, nothing to say. Only "truly nothing backs it" or "explicitly anulado"
        // reach the push below.
        if(mejor && !anulado) return;

        if(isAutomaticOrigin(t)){
          eliminarPropuesto.push({
            tx: t,
            motivo: anulado
              ? 'La cartola muestra este cargo anulado o revertido.'
              : 'Esta cartola no muestra este movimiento en su período — puede que se haya anulado o que no corresponda.'
          });
        } else {
          manualesIgnoradas.push({
            tx: t,
            motivo: anulado
              ? 'La cartola la muestra anulada, pero es manual: nunca se toca ni se elimina.'
              : 'No aparece en esta cartola, pero es manual: nunca se toca.'
          });
        }
      });
  }

  return {agregar, eliminarPropuesto, revisar, manualesIgnoradas};
}
