/* ===================== DATA MODEL (tipos) =====================
   Primer paso de la migración a TypeScript: tipar el modelo de datos compartido -- lo que usa
   Transacciones y prácticamente todo el resto de la app -- para que el compilador atrape en el
   momento typos de nombre de categoría, campos que faltan en una transacción, o una función
   llamada con el argumento equivocado. El resto de la app (DOM, event handlers, Supabase) sigue
   sin tipar por ahora ("any" donde haga falta) — se va tipando función por función después,
   empezando por las de Transacciones, sin tocar el test suite ni la arquitectura de render con
   strings de HTML que ya existe. */
export type TipoTx = 'gasto' | 'ingreso' | 'inversion';
export type EstadoTx = 'confirmado' | 'pendiente' | 'por_cobrar' | 'no_es_gasto';
export type Recurrencia = 'variable' | 'mensual';

export interface CategoriaAsignada { cat: string; monto: number; }

export interface PorCobrarItem {
  persona: string;
  monto: number | null;
  pagado: boolean;
  tipo: 'persona' | 'reembolso';
  montoRecibido: number | null;
  linkedTxId: string | null;
  // Presentes solo si este split nació de "Compartir con un grupo" (ver GASTOS COMPARTIDOS
  // más abajo) — un split armado a mano entre amigos (el flujo viejo) los deja undefined.
  // La cuenta de gastoNetoTx()/tienePorCobrarTipo() es EXACTAMENTE la misma en ambos casos:
  // esto es solo metadata extra para poder armar la vista de grupo y el motor de balances.
  grupoId?: string;
  gastoCompartidoId?: string;
  participanteId?: string;
}

export interface CuotasInfo { total: number; }

export interface Transaccion {
  id: string;
  fecha: string;    // 'YYYY-MM-DD'
  hora: string;     // 'HH:MM'
  comercio: string;
  monto: number;
  medio: string;    // MEDIOS key
  tipo: TipoTx;
  recurrencia: Recurrencia;
  estado: EstadoTx;
  categorias: CategoriaAsignada[];
  porCobrar: PorCobrarItem[];
  reglaAuto: boolean;
  nota: string;
  cuotas?: CuotasInfo;
  // Campos que sólo existen en las cuotas futuras que regenerateCuotasFor() genera solas a
  // partir de la cuota 1 (root.cuotas.total>1) -- no están en una transacción normal.
  cuotaOf?: string;
  cuotaNumero?: number;
  cuotaTotal?: number;
  cuotaProyectada?: boolean;
  // true en una transacción que llegó sola por correo (importación automática) — distinto de
  // una cartola PDF, que se sube a mano desde Reconciliar.
  importadoEmail?: boolean;
  // ---- Gastos compartidos ----
  // grupoId: presente si ESTA transacción (tuya, real, editable) se compartió con un grupo —
  // el reparto de los demás vive en porCobrar (arriba), igual que un split de amigos de siempre.
  grupoId?: string;
  // gastoCompartidoId: el id de la fila en gastos_compartidos que esta transacción originó
  // (si grupoId está presente) o de la que "mi parte" se derivó (si compartidoAjeno es true).
  gastoCompartidoId?: string;
  // compartidoAjeno: true SOLO en una entrada derivada ("mi parte" de un gasto que registró
  // OTRA persona del grupo) — nunca se persiste en app_state (buildFullStateBlob la filtra) ni
  // se edita a mano: se recalcula sola desde gasto_reparto cada vez que carga la app o llega un
  // cambio en vivo, así que nunca puede quedar desincronizada si el otro edita/borra el gasto.
  compartidoAjeno?: boolean;
  // Solo en una entrada compartidoAjeno sin categoría todavía: el texto de categoria_origen
  // (nombre+emoji en la taxonomía de quien registró) para mostrarlo como sugerencia en
  // catPickerGrid — nunca se usa como id de categoría propia, es solo para mostrar.
  categoriaOrigenSugerida?: string | null;
}

/* ---- Gastos compartidos: grupos, participantes y el gasto en sí (fuera de app_state) ----
   Estas filas viven en Supabase (ver supabase/schema_gastos_compartidos.sql), NUNCA en el
   blob app_state (que es privado por hogar y no puede cruzar cuentas distintas) — un grupo
   junta participantes de cualquier cuenta, o incluso gente sin cuenta. */
export type DivisionTipo = 'iguales' | 'montos' | 'pct';

export interface Grupo {
  id: string;
  nombre: string;
  icono: string;
  creado_por: string;
  invite_code: string;
  created_at: string;
}

export interface GrupoParticipante {
  id: string;
  grupo_id: string;
  user_id: string | null;  // null = sin cuenta, lo administra otro miembro
  nombre: string;
  color: string;
}

export interface GastoReparto {
  id: string;
  gasto_compartido_id: string;
  participante_id: string;
  monto: number;
}

export interface GastoCompartido {
  id: string;
  grupo_id: string;
  descripcion: string;
  categoria_origen: string | null;
  monto: number;
  fecha: string;
  pagado_por: string;      // GrupoParticipante.id
  registrado_por: string;  // auth.users.id
  division_tipo: DivisionTipo;
  tx_origen_id: string | null;
  reparto?: GastoReparto[]; // se completa al leerlo junto con su reparto (join)
}

export interface SaldoPagado {
  id: string;
  grupo_id: string;
  de_participante: string;
  a_participante: string;
  monto: number;
  fecha: string;
}

export interface MapeoCategoria {
  id: string;
  user_id: string;
  de_participante: string;
  categoria_ajena: string;
  categoria_propia: string;
}

// Balance neto de un participante dentro de un grupo, ya resuelto a "le deben" / "debe".
export interface SaldoParticipante {
  participanteId: string;
  nombre: string;
  color: string;
  pagado: number;
  correspondido: number;
  saldo: number; // positivo = le deben, negativo = debe
}

// Una transferencia sugerida por el neteo mínimo ("quién le paga a quién para saldar todo").
export interface TransferenciaSugerida {
  de: string;   // participanteId
  a: string;    // participanteId
  monto: number;
}

export interface Categoria {
  nombre: string;
  tipo: TipoTx;
  color: string;   // uno de CAT_COLOR_CHOICES
  icon: string;     // nombre de ICONS, o un emoji suelto (ver catIconMarkup)
}

export interface Medio {
  nombre: string;
  corto: string;
  icon: string;     // nombre de ICONS ('card' | 'bank' | 'cash' | ...)
}


/* ===================== STATE (tipos) =====================
   El estado tiene ~80 campos -- tipar todos de una vez no era el objetivo de este primer paso.
   Se tipan acá los que usa la pantalla de Transacciones (que es por donde se dijo que iba a
   seguir la migración función por función); el resto queda cubierto por el índice "[key:
   string]: any" de abajo, y se va agregando a esta interfaz a medida que se tipan más pantallas
   -- sin que eso rompa nada mientras tanto. */
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
  [key: string]: any;                  // resto del estado, todavía sin tipar
}

