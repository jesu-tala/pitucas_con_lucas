/* ===================== DATA MODEL (types) =====================
   First step of the TypeScript migration: type the shared data model -- what Transactions and
   practically the rest of the app uses -- so the compiler catches at write time a typo'd
   category name, a missing field on a transaction, or a function called with the wrong
   argument. The rest of the app (DOM, event handlers, Supabase) is still untyped for now ("any"
   where needed) -- it gets typed function by function afterwards, starting with the
   Transactions ones, without touching the test suite or the existing HTML-string render
   architecture.

   Note on string literal values: the union types below (TxType, TxStatus, Recurrence,
   SplitType) keep their SPANISH literal values ('gasto', 'confirmado', 'mensual', 'iguales',
   etc.) even though the type ALIASES and every field/variable NAME are in English. This is
   deliberate: TxType's values are checked against a real Postgres constraint
   (transacciones_importadas.tipo, see backend/supabase/schema_importar_correo.sql) and copied
   verbatim from imported rows into a Transaction (see txFromEmailImport in views/menu.ts) --
   translating them would silently break that data flow. The other unions don't have a proven
   external contract, but are treated the same way for consistency and to avoid missing a
   comparison site somewhere in the codebase. */
export type TxType = 'gasto' | 'ingreso' | 'inversion';
export type TxStatus = 'confirmado' | 'pendiente' | 'por_cobrar' | 'no_es_gasto';
export type Recurrence = 'variable' | 'mensual';

// Where a transaction came from -- the non-negotiable rule behind automatic reconciliation
// (see reconcile.ts) is that it can ONLY ever touch 'auto-mail'/'auto-cartola' transactions,
// never 'manual' ones. Left OPTIONAL on purpose: the ~90 fixture/demo transactions in state.ts
// predate this field entirely, and a couple of derived/system transactions (see the comments
// next to each TRANSACTIONS.push(...) call, e.g. writeOffReceivable in helpers.ts) don't fit
// neatly into any of the three buckets either. A transaction with origen missing/undefined is
// treated as PROTECTED, exactly like 'manual' -- reconcile.ts's isAutomaticOrigin()/isProtectedOrigin()
// are the single source of truth for that safety rule, never a raw `=== 'manual'` check.
export type TxOrigen = 'manual' | 'auto-mail' | 'auto-cartola';

export interface AssignedCategory { cat: string; monto: number; }

export interface ReceivableItem {
  persona: string;
  monto: number | null;
  pagado: boolean;
  tipo: 'persona' | 'reembolso';
  montoRecibido: number | null;
  linkedTxId: string | null;
  // Only present if this split was born from "Share with a group" (see SHARED EXPENSES
  // below) -- a split built by hand between friends (the old flow) leaves them undefined.
  // The count in netExpenseTx()/hasReceivableType() is EXACTLY the same in both cases: this
  // is just extra metadata to be able to build the group view and the balance engine.
  groupId?: string;
  sharedExpenseId?: string;
  participantId?: string;
}

export interface InstallmentsInfo { total: number; }

export interface Transaction {
  id: string;
  fecha: string;    // 'YYYY-MM-DD'
  hora: string;     // 'HH:MM'
  comercio: string;
  monto: number;
  medio: string;    // PAYMENT_METHODS key
  tipo: TxType;
  recurrencia: Recurrence;
  estado: TxStatus;
  categorias: AssignedCategory[];
  porCobrar: ReceivableItem[];
  reglaAuto: boolean;
  nota: string;
  cuotas?: InstallmentsInfo;
  // Fields that only exist on the future installments that regenerateInstallmentsFor() generates by
  // itself from installment 1 (root.cuotas.total>1) -- not present on a normal transaction.
  cuotaOf?: string;
  cuotaNumero?: number;
  cuotaTotal?: number;
  cuotaProyectada?: boolean;
  // true on a transaction that arrived by itself via email (automatic import) -- different from
  // a bank statement PDF, which is uploaded by hand from Reconcile.
  importadoEmail?: boolean;
  // ---- Automatic reconciliation against a bank statement (see reconcile.ts) ----
  // origen: see the note on TxOrigen above -- who/what created this transaction, and therefore
  // whether reconcile.ts is even allowed to consider proposing to delete it.
  origen?: TxOrigen;
  // fuenteLineaId: a stable id built from a statement line's own fields (fecha+monto+detalle+
  // its position in the statement) -- see reconcile.ts's movementLineId(). Stamped on a
  // transaction created FROM that line (by createTxFromMovement, or by the diff's bulk "agregar")
  // so re-processing the exact same statement can never propose adding the same line twice, even
  // if fuzzy matching (matchConfidence) would fail to recognize it a second time -- this is the
  // hard guarantee idempotency needs; fuzzy matching alone is only ever a probabilistic signal.
  fuenteLineaId?: string;
  // ---- Shared expenses ----
  // groupId: present if THIS transaction (yours, real, editable) was shared with a group --
  // everyone else's split lives in porCobrar (above), same as an old-style friends split.
  groupId?: string;
  // sharedExpenseId: the id of the row in gastos_compartidos that this transaction originated
  // (if groupId is present) or that "my share" was derived from (if sharedByOthers is true).
  sharedExpenseId?: string;
  // sharedByOthers: true ONLY on a derived entry ("my share" of an expense that ANOTHER
  // person in the group registered) -- never persisted to app_state (buildFullStateBlob
  // filters it out) nor edited by hand: it's recalculated by itself from gasto_reparto every
  // time the app loads or a live change arrives, so it can never end up out of sync if the
  // other person edits/deletes the expense.
  sharedByOthers?: boolean;
  // Only on a sharedByOthers entry that has no category yet: the text of categoria_origen
  // (name+emoji in the taxonomy of whoever registered it) to show as a suggestion in
  // catPickerGrid -- never used as an id of your own category, it's only for display.
  suggestedOriginCategory?: string | null;
}

/* ---- Shared expenses: groups, participants and the expense itself (outside app_state) ----
   These rows live in Supabase (see supabase/schema_gastos_compartidos.sql), NEVER in the
   app_state blob (which is private per household and can't cross different accounts) -- a
   group brings together participants from any account, or even people with no account. */
export type SplitType = 'iguales' | 'montos' | 'pct';

// This interface mirrors the `grupos` table row-for-row -- supabase-js returns rows as plain
// objects keyed by column name, so these field names ARE the actual over-the-wire column names
// (see backend/supabase/schema_gastos_compartidos.sql) and stay Spanish/snake_case on purpose,
// even though the interface name itself is translated.
export interface Group {
  id: string;
  nombre: string;
  icono: string;
  creado_por: string;
  invite_code: string;
  created_at: string;
}

// Mirrors `grupo_participantes` -- see the note on Group above.
export interface GroupParticipant {
  id: string;
  grupo_id: string;
  user_id: string | null;  // null = no account, another member administers it
  nombre: string;
  color: string;
}

// Mirrors `gasto_reparto` -- see the note on Group above.
export interface ExpenseSplit {
  id: string;
  gasto_compartido_id: string;
  participante_id: string;
  monto: number;
}

// Mirrors `gastos_compartidos` -- see the note on Group above.
export interface SharedExpense {
  id: string;
  grupo_id: string;
  descripcion: string;
  categoria_origen: string | null;
  monto: number;
  fecha: string;
  pagado_por: string;      // GroupParticipant.id
  registrado_por: string;  // auth.users.id
  division_tipo: SplitType;
  tx_origen_id: string | null;
  reparto?: ExpenseSplit[]; // filled in when read together with its splits (join)
}

// Mirrors `saldos_pagados` -- see the note on Group above.
export interface PaidBalance {
  id: string;
  grupo_id: string;
  de_participante: string;
  a_participante: string;
  monto: number;
  fecha: string;
}

// Mirrors `mapeo_categorias` -- see the note on Group above.
export interface CategoryMapping {
  id: string;
  user_id: string;
  de_participante: string;
  categoria_ajena: string;
  categoria_propia: string;
}

// Net balance of a participant within a group, already resolved to "is owed" / "owes".
export interface ParticipantBalance {
  participantId: string;
  nombre: string;
  color: string;
  paid: number;
  owed: number;
  balance: number; // positive = is owed, negative = owes
}

// A transfer suggested by the minimal settlement ("who pays whom to settle everything").
export interface SuggestedTransfer {
  from: string;   // participantId
  to: string;     // participantId
  monto: number;
}

export interface Category {
  nombre: string;
  tipo: TxType;
  color: string;   // one of CATEGORY_COLOR_CHOICES
  icon: string;     // an ICONS name, or a bare emoji (see catIconMarkup)
}

export interface PaymentMethod {
  nombre: string;
  corto: string;
  icon: string;     // an ICONS name ('card' | 'bank' | 'cash' | ...)
}


/* ===================== STATE (types) =====================
   The state has ~80 fields -- typing all of them at once wasn't the goal of this first step.
   The ones the Transactions screen uses are typed here (that's the screen the migration was
   said to keep following, function by function); the rest is covered by the "[key: string]:
   any" index below, and gets added to this interface as more screens get typed -- without
   breaking anything in the meantime. */
export interface AdvFilters { cats: string[]; medios: string[]; dateFrom: string; dateTo: string; }

export interface AppState {
  tab: string;                         // transacciones | resumen | menu
  filter: string;                      // todas | entradas | porcobrar | reembolso | pendientes
  categoryFilter: string | null;
  categoryFilterMonth: string | null;
  searchQuery: string;
  advFilters: AdvFilters;
  openTxId: string | null;
  creatingNew: boolean;
  draftTx: any;
  confirmDeleteTxId: string | null;
  [key: string]: any;                  // rest of the state, still untyped
}
