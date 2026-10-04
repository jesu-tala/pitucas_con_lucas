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
  // Presentes solo en una línea de compra en cuotas de una cartola de tarjeta (ver
  // parseTarjetaNacionalMovs en views/menu.ts). `monto` ya viene siendo el valor de la CUOTA de
  // este mes, no el de la operación completa -- montoOperacion queda aparte, solo informativo.
  cuotaNumero?: number;
  cuotaTotal?: number;
  montoOperacion?: number;
  __match?: Transaction | null;
}

export interface AgregarDiffItem { movimiento: StatementMovement; confianza: MatchConfidence; txPropuesta: Partial<Transaction>; }
export interface EliminarDiffItem { tx: Transaction; motivo: string; }
export interface RevisarDiffItem { movimiento: StatementMovement; confianza: MatchConfidence; candidatos: Transaction[]; }
export interface ManualIgnoradaDiffItem { tx: Transaction; motivo: string; }
// Una línea de la cartola que SÍ corresponde a una transacción que ya existe en la app.
//
// Antes esto no era un grupo: cuando el matching encontraba un único calce claro, el código
// hacía `return` y la línea desaparecía del diff sin dejar rastro. Funcionaba para no duplicar,
// pero perdía todo lo demás: la transacción no quedaba marcada como respaldada por la cartola,
// no había forma de revisar el calce, y --el caso que motivó esto-- un gasto subido a mano con
// un monto aproximado nunca podía quedar emparejado con su línea real.
//
// `requiereConfirmacion` es true para toda transacción protegida (manual o sin origen): un
// merge sobre algo que la usuaria escribió a mano SIEMPRE lo confirma ella, aunque el calce sea
// de confianza alta.
export interface MergearDiffItem {
  movimiento: StatementMovement;
  tx: Transaction;
  confianza: MatchConfidence;
  requiereConfirmacion: boolean;
  // El monto de la cartola difiere del de la transacción -- el caso típico del gasto subido a
  // mano "más o menos". null si son iguales. Actualizar el monto es opcional y lo decide la
  // usuaria al aplicar el merge (ver aplicarMerge).
  diferenciaMonto: number | null;
}

export interface ReconcileDiff {
  agregar: AgregarDiffItem[];
  mergear: MergearDiffItem[];
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
// Cuánto puede diferir el monto para seguir considerándose "el mismo gasto, tipeado a ojo".
// Proporcional, porque errar $500 en una compra de $46.000 es normal y en una de $900 no lo es;
// con un piso para que los montos chicos tengan algo de holgura, y un techo para que una compra
// grande no se coma otra distinta ($50.000 contra $46.000 NO deben calzar).
const TOLERANCIA_PCT = 0.015;      // 1,5%
const TOLERANCIA_MIN = 100;
const TOLERANCIA_MAX = 3000;
function toleranciaMonto(monto: number): number {
  const prop = Math.abs(monto) * TOLERANCIA_PCT;
  return Math.min(TOLERANCIA_MAX, Math.max(TOLERANCIA_MIN, prop));
}
// Extends findSimilarTx's old "same tipo + amount + date within a couple days" idea into three
// levels instead of a single yes/no -- findSimilarTx itself is left completely untouched (still
// used by the old movement-by-movement "+ Agregar" flow) so its existing behavior/tests keep
// working exactly as before; this is a separate, richer function for the new diff.
export function matchConfidence(mov: StatementMovement, tx: Transaction): MatchConfidence | null {
  if(tx.tipo !== mov.tipoMov) return null;
  // Desempate por número de cuota. Doce cuotas de la misma compra tienen el MISMO monto y el
  // mismo comercio, y solo se distinguen por su fecha -- que en una cuota proyectada es una
  // estimación (ver dateForInstallment), no un dato del banco. Si la cartola dice "03/12" y la
  // transacción dice que es otra cuota, no son la misma por mucho que todo lo demás coincida.
  // Solo se exige cuando AMBOS lados lo traen: la cuota 1 es la compra original y no lleva
  // cuotaNumero, así que pedirlo siempre la dejaría sin poder calzar nunca.
  if(mov.cuotaNumero != null && tx.cuotaNumero != null && mov.cuotaNumero !== tx.cuotaNumero) return null;
  const montoAbs = Math.abs(mov.monto);
  const montoDiff = Math.abs(tx.monto - montoAbs);
  const diffDias = daysBetween(tx.fecha, mov.fecha);
  const movComercioTxt = mov.comercioSugerido || mov.detalle || '';
  const na = normalizeComercio(movComercioTxt), nb = normalizeComercio(tx.comercio);
  const comercioClose = comerciosSonParecidos(na, nb);

  // Alta: exact amount, close date, comercio clearly the same.
  // El monto EXACTO es requisito de 'alta' y no se negocia: 'alta' es el único nivel con el que
  // algo puede pasar sin que la usuaria confirme, así que no puede depender de una tolerancia.
  if(montoDiff===0 && diffDias<=2 && comercioClose) return 'alta';
  // Media: exact amount + close date, but comercio doesn't match well or is missing on one side.
  if(montoDiff===0 && diffDias<=2) return 'media';
  // Media también cuando el monto es APROXIMADO pero el comercio y la fecha calzan bien. Este es
  // el caso central del merge: un gasto subido a mano "más o menos" ($46.000 cuando la cartola
  // dice $45.990) antes no calzaba con NADA --montoDiff tenía que ser 0-- así que la línea de la
  // cartola se proponía como una transacción nueva y terminabas con el gasto duplicado.
  //
  // Queda en 'media', nunca en 'alta', y eso es lo que lo hace seguro: un merge de confianza
  // media siempre pide confirmación, y un calce de cualquier nivel impide que se proponga
  // eliminar la transacción -- así que ensanchar acá reduce las propuestas equivocadas de los
  // tres lados (menos duplicados, menos borrados, menos ruido en "revisar"), no las aumenta.
  if(montoDiff<=toleranciaMonto(tx.monto) && diffDias<=2 && comercioClose) return 'media';
  // Baja: everything else still worth surfacing -- a peso or two of rounding, or a wider date
  // window (statement cut-off dates aren't always calendar-month-aligned, and a card
  // installment's projected date is only ever a guess -- see regenerateInstallmentsFor).
  if(montoDiff<=2 && diffDias<=5) return 'baja';
  return null;
}
function nivel(c: MatchConfidence): number { return c==='alta' ? 3 : c==='media' ? 2 : 1; }

/* ---------- período a reconciliar: el del corte de la tarjeta, no el mes calendario ----------
   statementPeriod() devuelve el rango de las fechas que la cartola TRAE. Sirve, pero está
   sesgado: si la cartola no tiene ningún movimiento el día 25, el rango arranca el 27 o el 28, y
   entonces una transacción del 25 parece "no respaldada por esta cartola" y se propone eliminar.

   Esta función corrige eso alineando la ventana al día de corte configurado en el medio de pago.
   Con corte el 24, la ventana es del 25 del mes anterior al 24 de este -- el período real de la
   facturación, tenga o no movimientos en los bordes.

   Una cartola no dice de QUÉ tarjeta es, solo si es de tarjeta o de cuenta. Con varias tarjetas
   de cortes distintos se toma la ventana más ANCHA que cubra a todas: ensanchar solo puede
   reducir las propuestas de borrado equivocadas (más transacciones quedan "dentro del período y
   respaldadas"), mientras angostar podría proponer borrar algo legítimo. Ante la duda, la opción
   que no borra. */
export function diasCorteDeFamilia(tipoCartola: string | null): number[] {
  const iconEsperado = tipoCartola==='tarjeta_nacional' ? 'card' : tipoCartola==='cuenta_corriente' ? 'bank' : null;
  if(!iconEsperado) return [];
  return Object.keys(PAYMENT_METHODS)
    .filter(id => PAYMENT_METHODS[id] && PAYMENT_METHODS[id].icon===iconEsperado)
    .map(id => PAYMENT_METHODS[id].diaCorte)
    .filter(d => typeof d==='number' && d>=1 && d<=31) as number[];
}
// La ventana de facturación con corte `dia` que CONTIENE a la fecha dada.
function ventanaDeCorte(fechaISO: string, dia: number): {desde: string; hasta: string} {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  // El último día del mes acota el corte: con corte 31 en febrero, cierra el 28/29.
  const ultimoDia = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();
  const cierreEsteMes = Math.min(dia, ultimoDia(y, m));
  // Si la fecha ya pasó el cierre de su propio mes, la ventana es la que cierra el mes siguiente.
  let yHasta = y, mHasta = m;
  if(d > cierreEsteMes){ mHasta = m + 1; if(mHasta > 12){ mHasta = 1; yHasta = y + 1; } }
  const cierre = Math.min(dia, ultimoDia(yHasta, mHasta));
  let yDesde = yHasta, mDesde = mHasta - 1;
  if(mDesde < 1){ mDesde = 12; yDesde = yHasta - 1; }
  const aperturaDia = Math.min(dia, ultimoDia(yDesde, mDesde)) + 1;
  return {
    desde: yDesde+'-'+pad(mDesde)+'-'+pad(aperturaDia),
    hasta: yHasta+'-'+pad(mHasta)+'-'+pad(cierre)
  };
}
export function periodoDeReconciliacion(movimientos: StatementMovement[], tipoCartola: string | null): {desde: string; hasta: string} | null {
  const derivado = statementPeriod(movimientos);
  if(!derivado) return null;
  const dias = diasCorteDeFamilia(tipoCartola);
  if(!dias.length) return derivado;   // sin corte configurado, el comportamiento de siempre

  let desde = derivado.desde, hasta = derivado.hasta;
  dias.forEach(dia => {
    const v = ventanaDeCorte(derivado.hasta, dia);
    if(v.desde < desde) desde = v.desde;
    if(v.hasta > hasta) hasta = v.hasta;
  });
  return {desde, hasta};
}

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
  // La ventana del CORTE de la tarjeta si está configurado, no solo las fechas que la cartola
  // trae -- ver periodoDeReconciliacion. Solo afecta a qué transacciones se consideran parte de
  // este período; el mes calendario del resto de la app no se toca.
  const periodo = periodoDeReconciliacion(movimientos, tipoCartola);

  const agregar: AgregarDiffItem[] = [];
  const mergear: MergearDiffItem[] = [];
  const revisar: RevisarDiffItem[] = [];
  const eliminarPropuesto: EliminarDiffItem[] = [];
  const manualesIgnoradas: ManualIgnoradaDiffItem[] = [];

  // Un calce único deja de ser un `return` silencioso y pasa a ser una propuesta de merge. Las
  // ya conciliadas sí se saltean: su línea quedó registrada en fuenteLineaId y volver a
  // proponerlas sería ruido en cada re-run.
  const proponerMerge = (mov: StatementMovement, tx: Transaction, confianza: MatchConfidence) => {
    if(tx.conciliada) return;
    // Math.abs: en una cartola de tarjeta los cargos llegan con signo negativo (ver
    // parseTarjetaNacionalMovs) mientras las transacciones guardan el monto en positivo.
    // matchConfidence ya compara con abs; sin hacerlo acá, la diferencia de un cargo de $19.999
    // contra un gasto de $20.000 daba -$39.999 en vez de -$1.
    const dif = Math.round(Math.abs(mov.monto)) - Math.round(tx.monto);
    mergear.push({
      movimiento: mov, tx, confianza,
      // Toda transacción protegida (manual, o sin origen) exige confirmación explícita, sin
      // importar la confianza del calce: es la regla no negociable de este archivo aplicada al
      // merge, no solo al borrado.
      requiereConfirmacion: isProtectedOrigin(tx) || confianza!=='alta',
      diferenciaMonto: dif===0 ? null : dif
    });
  };

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

    if(candidatosAlta.length===1){ proponerMerge(mov, candidatosAlta[0], 'alta'); return; }
    if(candidatosAlta.length>1){ revisar.push({movimiento:mov, confianza:'alta', candidatos:candidatosAlta}); return; }
    if(candidatosMedia.length===1){ proponerMerge(mov, candidatosMedia[0], 'media'); return; }
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

  return {agregar, mergear, eliminarPropuesto, revisar, manualesIgnoradas};
}

/* ---------- aplicar un merge ----------
   Esto SÍ muta, y por eso vive aparte de buildReconcileDiff: el diff solo propone.

   Por defecto escribe DOS cosas y nada más: `conciliada` y `fuenteLineaId`. Es deliberadamente
   conservador, porque del otro lado hay trabajo que la usuaria hizo a mano y que no se puede
   reconstruir: la categoría que eligió, su nota, y sobre todo sus filas de porCobrar --muchas
   veces el gasto se subió a mano justamente para poder cobrarle a alguien, y perder eso sería
   caótico.

   El monto NO se sobrescribe salvo que se pida con `actualizarMonto`. Y aun pidiéndolo, los
   montos de porCobrar NO se reescalan: lo que alguien te debe es un acuerdo con esa persona, no
   algo que deba moverse porque el banco redondeó distinto. La función devuelve el efecto para
   que la pantalla lo muestre en vez de que pase callado. */
export interface MergeResult {
  ok: boolean;
  montoAntes: number;
  montoDespues: number;
  // Lo que seguía debiendo gente antes y después: si cambian, es un descuadre que avisar.
  porCobrarTotal: number;
  porCobrarRecalculado: boolean;
}
export function aplicarMerge(tx: Transaction, mov: StatementMovement, actualizarMonto: boolean): MergeResult {
  const montoAntes = tx.monto;
  const porCobrarTotal = (tx.porCobrar||[]).reduce((s,p)=>s+(p.monto||0), 0);
  if(!tx || !mov) return {ok:false, montoAntes, montoDespues:montoAntes, porCobrarTotal, porCobrarRecalculado:false};

  tx.conciliada = true;
  // Guardar la línea es lo que hace idempotente el re-run: buildReconcileDiff ya saltea toda
  // línea cuyo fuenteLineaId aparezca en alguna transacción.
  if(mov.fuenteLineaId) tx.fuenteLineaId = mov.fuenteLineaId;

  // Math.abs por el mismo motivo que en proponerMerge: sin esto, actualizar el monto desde una
  // línea de tarjeta dejaba el gasto con monto NEGATIVO, que descuadra todos los agregados.
  const montoCartola = Math.round(Math.abs(mov.monto));
  if(actualizarMonto && montoCartola!==Math.round(tx.monto)){
    tx.monto = montoCartola;
    // Si el gasto tenía UNA sola categoría, su monto es el monto del gasto: dejarlo viejo
    // descuadraría la transacción consigo misma. Con varias categorías no se reparte a ciegas
    // --no hay forma de saber a cuál corresponde la diferencia-- y se deja como está.
    if((tx.categorias||[]).length===1) tx.categorias[0].monto = tx.monto;
  }

  return {ok:true, montoAntes, montoDespues: tx.monto, porCobrarTotal, porCobrarRecalculado:false};
}
