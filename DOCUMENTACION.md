# Pitucas sin lucas — Documentación técnica

App de finanzas personales (Chile, pesos CLP), originalmente para uso individual y ahora
también con gastos compartidos entre grupos (pareja, familia, roomies). El código fuente vive
en `src/*.ts` (TypeScript, organizado en módulos por vista/sección — ver sección 2), chequeado
con `tsc` y empaquetado con `esbuild` en un único script, que se inserta en el HTML de
`src/plata-clara.html` (ver sección 2 y 6) — pensado para que cualquier sesión de Claude (o
cualquier desarrollador) pueda retomarla, entenderla y seguir extendiéndola sin tener que
releer miles de líneas desde cero.

Última actualización de este documento: septiembre 2026.

Estructura del repo:

```
src/            código fuente: *.ts (TypeScript, en módulos -- ver sección 2) + plata-clara.html
                (HTML/CSS de la vitrina)
public/         lo que genera rebuild.py (index.html, test.html, test_debug.html, extracted*.js)
                más lo que ya iba tal cual (sw.js, manifest.json, icons/, pdf.min.js, pdf.worker.min.js)
                -- este directorio completo es lo que se sube a Cloudflare Pages (ver sección 8)
backend/        supabase/ (esquema SQL), cloudflare-worker/ (push notifications), apps-script/
                (importador de correo) -- cada uno se despliega por su cuenta, no por Cloudflare Pages
tests/          suite de Playwright: lib/test_kit.js, run_all_tests.js, shot_*.js, audit_*.js,
                smoke_test.js, fixtures/ (PDFs y datos de ejemplo)
preview/        preview.html generado por rebuild_preview.py, nunca se sube a producción
dist/           salida de esbuild (dist/app.js), generado, no se versiona (.gitignore)
```

## 1. Qué es la app

"Pitucas sin lucas" es una app de bolsillo (mobile-first, se ve como un teléfono en una vitrina
de escritorio) para llevar transacciones, presupuesto, balance mensual e inversiones. Tiene
cuenta real (login con Supabase) y también un "Modo demo" que enmascara todos los montos con
`$••••••` para poder mostrar la pantalla sin exponer cifras reales.

Cuatro pestañas principales:

- **Transacciones** — lista de movimientos, con filtros (Todas / Entradas / Por cobrar /
  Pendientes) y filtros avanzados (categoría, medio de pago, rango de fechas).
- **Resumen** — cuatro sub-pestañas: Balance, Presupuesto, Evolución, Inversiones.
- **Grupos** — gastos compartidos estilo Tricount: crear/unirse a un grupo (pareja, familia,
  roomies, un viaje), ver quién le debe a quién, y compartir un gasto propio con el grupo desde
  el detalle de cualquier transacción (ver sección 4).
- **Menú** — cuenta, categorías, medios de pago, reglas automáticas, exportar/respaldar,
  importar cartola (CSV o PDF), modo demo, y "Asesoría financiera con Claude" (placeholder,
  todavía no implementado).

## 2. Arquitectura

El código fuente vive en `src/` como varios módulos TypeScript (ES modules de verdad, con
`import`/`export`) organizados principalmente por vista/pantalla — ver el árbol completo más
abajo. Hasta septiembre 2026 todo esto era un único archivo `src/app.ts` de ~7500 líneas (una
sola IIFE, sin módulos); se partió en archivos más chicos por legibilidad y para que cada
pantalla se pueda tocar sin desplazarse por miles de líneas de las otras, pero el
comportamiento en tiempo de ejecución es idéntico — es literalmente el mismo código, solo
reorganizado en archivos. `src/app.ts` sigue existiendo, pero ahora es solo el punto de
entrada delgado: importa cada módulo y corre el arranque (registrar listeners, el primer
render() con los datos de ejemplo, recién después conectar Supabase).

`rebuild.py` hace dos pasos para convertir `src/*.ts` en JS: primero `tsc -p tsconfig.json
--noEmit` chequea tipos sobre TODOS los módulos de una (con `noEmitOnError:true` de todos
modos en `tsconfig.json`: cualquier error de tipos aborta el rebuild sin tocar nada de
`public/`); recién si eso pasa limpio, **esbuild** empaqueta `src/app.ts` y todo lo que
importa (`--bundle --format=iife`) en un único `dist/app.js` — esa es la única razón por la
que hay un bundler en este proyecto ahora (ver sección 6, punto 2, para el detalle de esa
decisión). Ese `dist/app.js` se inserta dentro de `src/plata-clara.html`
— que no lleva el `<script>` de la app escrito a mano, solo el HTML/CSS de la "vitrina" (el
marco de teléfono, los estilos) más un placeholder que dice "esto se genera solo" — para
producir `public/index.html`, `public/test.html`, `public/test_debug.html`, etc. (ver sección 6
para el detalle completo del pipeline). **Nunca se edita `dist/app.js` ni el `<script>` de
`src/plata-clara.html` a mano — los únicos archivos que se editan son los de `src/`.**

Árbol de `src/` (cada archivo exporta lo que otros módulos necesitan; ver los propios archivos
para el detalle función por función):

```
src/
  app.ts              — punto de entrada: importa todo lo demás y corre el arranque
  globals.d.ts        — declaraciones ambient para pdfjsLib y window.supabase (cargan como
                         <script src> externos, no son módulos)
  types.ts            — interfaces/tipos compartidos (Transaction, Group, Category, etc.)
  icons.ts            — set de íconos SVG (ICONS) + helpers de ícono
  state.ts            — el objeto `state` de UI, TODAS las variables de datos mutables (TRANSACTIONS,
                         CATEGORIES, PAYMENT_METHODS, BUDGETS, INVESTMENT_GOALS, PLATFORM_DATA,
                         PLANNER, GROUPS, etc. — ver sección 3) y sus setters (ver más
                         abajo, "por qué hay setXxx() en vez de reasignar directo")
  helpers.ts          — formateo de moneda/fecha y demás utilidades sin estado propio
  shared-expenses.ts  — motor de balances de gastos compartidos (funciones puras) +
                         regenerateInstallmentsFor (cuotas de tarjeta)
  sheet.ts            — la hoja modal inferior (detalle de transacción, nueva transacción,
                         filtros, dividir boleta, etc.) — un dispatcher grande y compartido
                         por todas las vistas, no se dividió más
  events.ts           — todos los handlers delegados (click/change/input/focusout/pointer*)
                         sobre el contenedor `phone` — mismo motivo que sheet.ts
  render.ts           — el dispatcher central render()
  supabase.ts         — cliente de Supabase, auth, guardado automático, indicador de sync
  ui/
    toasts.ts, tabbar.ts, donut.ts  — widgets chicos compartidos por varias vistas
  views/
    transacciones.ts, presupuesto.ts, evolucion.ts, inversiones.ts, menu.ts, grupos.ts
                       — una vista/sub-vista por archivo (menu.ts queda grande, ~1600 líneas,
                         porque la pestaña Menú es así de grande — no se forzó una
                         subdivisión artificial)
```

Es, en conjunto, el mismo estilo de siempre (sin frameworks de UI, sin virtual DOM) que:

- Guarda todo el estado de la app en un objeto `state` (tab activo, filtros, qué sheet está
  abierto, borradores en edición, etc.) más un conjunto de variables de datos (`TRANSACTIONS`, `CATEGORIES`,
  `PAYMENT_METHODS`, `BUDGETS`, `INVESTMENT_GOALS`, `PLATFORM_DATA`, `PLANNER`,
  `TOTAL_GOAL_CHECKS`), todas definidas en `state.ts`.
- Tiene una función `render()` central que redibuja lo que corresponda según `state.tab` /
  `state.summarySub`, más `renderSheet()` para la hoja modal inferior (detalle de transacción,
  nueva transacción, filtros, etc.).
- Construye HTML por concatenación de strings (no hay ningún framework de componentes ni
  virtual DOM) y lo asigna a `innerHTML` de los contenedores (`#view-root`, `#resumen-content`,
  `#sheet-content`, etc.).
- Todos los clics/inputs se manejan con **event delegation** sobre un único contenedor
  (`phone.addEventListener('click'|'change'|'input'|'focusout'|..., …)`, todo en `events.ts`),
  leyendo atributos `data-*` de los elementos para decidir qué hacer. No hay listeners
  individuales por fila.

Un detalle propio de haber pasado de una sola IIFE a módulos ES de verdad: varias de las
variables de `state.ts` (`TRANSACTIONS`, `BUDGETS`, `INVESTMENT_GOALS`, `PLATFORM_DATA`,
`PLANNER`, `TOTAL_GOAL_CHECKS`, `GROUPS`, `GROUP_PARTICIPANTS`, `SHARED_EXPENSES`,
`PAID_BALANCES`, `CATEGORY_MAPPINGS`, `TRANSFER_INFO`, `monthlyBudgetTotal`, entre
otras) no solo se mutan en el mismo objeto/arreglo — se **reasignan enteras** desde otros
archivos (por ejemplo al cargar el estado real desde Supabase, o al filtrar `TRANSACTIONS` tras borrar
una transacción). Un `import { TRANSACTIONS } from './state'` de ES modules es de solo lectura para quien
importa (TypeScript lo marca como error: "Cannot assign to 'TRANSACTIONS' because it is an import"), así
que `state.ts` (y, para un par de contadores locales, `sheet.ts`/`views/menu.ts`) exporta
también un `setTransactions(v)`/`setGroups(v)`/etc. por cada una de estas variables, y los módulos que
necesitan reemplazar el valor completo llaman al setter en vez de reasignar directo. `CATEGORIES`,
`PAYMENT_METHODS`, `MONTHS` y `MONTH_LABEL` no tienen setter porque nunca se reasignan así: se vacían y
se vuelven a llenar en el mismo objeto/arreglo, como siempre.

`esbuild` empaqueta todos estos módulos en un único IIFE al compilar (`--format=iife`), así que
el archivo final que corre en el navegador es, otra vez, un solo script autocontenido — la
división en módulos es solo para editar el código, no cambia nada de lo que se sube a
Cloudflare Pages ni de cómo corre la app (ver sección 6 y 8).

## 3. Modelo de datos

Todo vive en memoria (variables `let`/`const` a nivel de módulo) y se serializa completo a
Supabase (ver sección 5) o a un respaldo JSON descargable (Menú → Respaldo en JSON).

- **`TRANSACTIONS`** (array): cada transacción es
  `{id, fecha, hora, comercio, monto, medio, tipo, recurrencia, estado, categorias:[{cat,monto}], porCobrar:[...], reglaAuto, nota}`.
  - `tipo`: `'gasto' | 'ingreso' | 'inversion'`.
  - `recurrencia`: `'variable' | 'mensual' | 'anual'` (mensual/anual cuentan como "gasto fijo"
    en las metas de Balance; el resto es "variable").
  - `estado`: `'confirmado' | 'pendiente' | 'por_cobrar' | 'no_es_gasto'`. Una transacción sin
    categoría queda en `'pendiente'` — **la categoría es opcional al crear una transacción a
    mano**, así que una transacción sin categoría es invisible para cualquier filtro por
    categoría salvo que se active "Sin categoría" en Filtros.
  - `categorias`: array porque un gasto se puede dividir en varias categorías (`allowSplit` en
    `renderCategoryRows`); una inversión nunca se divide (siempre una sola). Para `tipo:'inversion'`,
    `cat` **nunca** es el id de una plataforma directamente — apunta al id de una `INVESTMENT_GOALS`
    (meta) específica, o al bucket `"<platformId>__general"` de esa plataforma para un aporte que no
    es de ninguna meta puntual (ver `investmentCatOptions()` en `views/inversiones.ts`). `catInfo(id)`
    (en `helpers.ts`) resuelve las tres formas (categoría normal, meta, bucket General) para que el
    resto de la app (lista de Transacciones, donuts de Balance/Presupuesto, editor de reglas,
    filtros...) no tenga que saber cuál de las tres recibió.
  - `porCobrar`: `[{persona, monto, pagado, tipo:'persona'|'reembolso', montoRecibido,
    linkedTxId, direccion?:'me_deben'|'debo'}]`. `'persona'` = dividiste este gasto con alguien;
    `direccion` dice hacia dónde va la plata — `'me_deben'` (o ausente, mismo significado en
    datos viejos) es el caso de toda la vida: pagaste tú, esa persona te debe su parte (se
    descuenta de Gastos al dividir, no cuando te pagan). `'debo'` es el caso simétrico agregado
    junto con "Dividir este gasto" (sección 4): pagó OTRA persona y tú le debes tu propia
    parte — siempre una única fila (esta app no lleva un libro N-a-N entre personas sueltas, solo
    tu propia relación con quien pagó de verdad; para eso está un Grupo real). `'reembolso'` =
    plata que vuelve después (isapre, seguro), el gasto ya fue 100% tuyo y el reembolso se ve
    como crédito en el mes en que llega — no tiene noción de dirección, ese flujo no cambió.
    La transacción misma puede llevar además `pagador` (quién pagó de verdad, ausente = "Tú") y
    `divisionTipo` (`'iguales'|'montos'|'pct'`, qué modalidad armó el reparto actual) una vez que
    tiene un split de tipo `'persona'`.
  - `cuotas: {total}` (opcional) — compras en cuotas; `regenerateInstallmentsFor(txId)` genera
    transacciones-cuota futuras (`cuotaProyectada`, `cuotaNumero`, `cuotaTotal`) y extiende
    `MONTHS` si hace falta.
- **`CATEGORIES`** (objeto, `id → {nombre, tipo, color, icon}`): categorías. `icon` casi siempre es
  un emoji suelto (ej. `'🛒'`); las categorías de tipo `'inversion'` (fintual, racional,
  banco_chile, buda, + cualquier plataforma que la usuaria agregue) usan un nombre del set `ICONS`
  en vez de emoji — **son las plataformas de inversión reales**, no categorías libres, y una
  transacción nunca las usa directamente como su `cat` (ver la nota sobre `categorias` más arriba y
  sobre `INVESTMENT_GOALS` más abajo). `catIconMarkup(name)` resuelve ambos casos (ícono
  con nombre → SVG; cualquier otra cosa → `<span class="emoji-icon">`).
- **`PAYMENT_METHODS`** (objeto, `id → {nombre, corto, icon}`): medios de pago (tarjetas, cuenta vista,
  efectivo). `icon` sí es siempre un nombre del set `ICONS` (`'card' | 'bank' | 'cash'`).
- **`BUDGETS`** (objeto, `catId → {meta, alertas:{80,90,100}}`) + `monthlyBudgetTotal`.
- **`INVESTMENT_GOALS`** (array, tipado `InvestmentGoal[]` en `types.ts`): metas estilo
  "Fintual" — `{id, nombre, montoObjetivo?, aporteMensualMeta?, plataformaId, plazo, comision,
  startMonth, startingAmount, checks:{mes:bool}}`. Cada meta vive DENTRO de una plataforma
  (`plataformaId`); una plataforma puede tener 0, 1 o varias metas. `montoObjetivo` y
  `aporteMensualMeta` son **ambos opcionales, de forma independiente** — distinguen dos
  naturalezas de meta: una de **stock** (juntar un total, ej. el pie de un depto: `montoObjetivo`
  puesto, con o sin un aporte mensual fijo encima) y una de **flujo** (aportar cada mes, sin un
  total que alcanzar: sin `montoObjetivo`). Con `aporteMensualMeta` puesto, ese monto suma al
  "aporte mensual objetivo" total y por lo tanto al % de Inversión de Balance
  (`monthlyInvestmentGoalCLP`/`investmentGoalPct` en `ui/donut.ts`) y al objetivo anual de
  Inversiones (`annualInvestmentGoalProgress`, ver más abajo); sin él ("aporta lo que puedas"), no
  suma a ninguno de los dos, pero lo que sí se aporte cuenta igual como inversión real (aportado
  neto / Total invertido) — solo que como aporte "sin objetivo fijo", nunca empujando la barra del
  objetivo anual más allá del 100%. `aportadoNeto`/`historial` **ya no se guardan a mano** — se
  calculan siempre desde las transacciones `tipo:'inversion'` categorizadas al id de la meta
  (`metaAportadoNeto(meta)` / `metaHistorialAt(meta, mes)` en `views/evolucion.ts`), más el seed
  manual de `startingAmount` (lo que ya tenía ahorrado antes de trackear la meta en la app) contado
  desde `startMonth` en adelante — así una meta que en la vida real partió antes de que se creara
  en la app puede hacerse retroceder sin inventar transacciones. `checks` sigue siendo 100% manual
  (el hábito de "cumplí mi aporte este mes"), no se puede inferir de una transacción.
- **`PLATFORM_DATA`** (objeto tipado `Record<string, PlatformData>`, `id → {valorHistorial:{mes:monto},
  fechaActualizacion, tasaAnual, comision, plazo, archivada?, sinValuacion?}`): valor aproximado
  que la usuaria actualiza a mano de vez en cuando. El "aportado neto" de una plataforma
  (`platformAportadoNeto(id)` en `views/inversiones.ts`) **no** se guarda acá: es un rollup de sus
  propias metas (`metaAportadoNeto` de cada una) más lo categorizado a su bucket
  `"<id>__general"` — nunca una suma directa de transacciones por `cat===id`, porque ninguna
  transacción usa ese id directamente (ver la nota sobre `categorias` más arriba). Una plataforma
  con `sinValuacion:true` no tiene valuación propia que trackear — su "valor" se define como
  exactamente lo aportado (`platformCurrentValue(id)` retorna `platformAportadoNeto(id)`), así que
  su ganancia/pérdida da siempre $0 por construcción, en cualquier lugar que ya calcule ganancia
  como `valor − aportado` sin tener que saber nada de `sinValuacion`. Es el caso de **"Otros"**, una
  quinta plataforma sembrada junto a fintual/racional/banco_chile/buda para aportes puntuales sin
  plataforma ni meta propia — a diferencia de esas 4, nunca admite metas dentro
  (`goalCapablePlatformIds()` en `views/inversiones.ts` la excluye siempre como destino por
  defecto al crear una meta) y su acordeón no ofrece ni editar/actualizar valor, ni comisión, ni
  "+ Agregar meta" (nada de eso aplica cuando no hay valuación ni metas que administrar).
- **`PLANNER`** (`{base, metaPcts:{metaId:pct}}`): "cuánto de mi excedente mensual mando a
  cada meta", agrupado por plazo (Corto/Medio/Largo).
- **`TOTAL_GOAL_CHECKS`** (`{mes:bool}`): check manual mes a mes de "¿cumplí mi objetivo de
  inversión TOTAL este mes?", independiente de los checks de cada meta individual.
- **`MONTHS`** / **`MONTH_LABEL`**: lista de meses "conocidos" por la app (crece cuando una
  cuota o una transacción nueva cae en un mes que todavía no existía) — **no** es lo mismo que
  "los 12 meses del año calendario" (ver `fullYearMonths(year)` /
  `inversionesMonthsCalendarYear()`, que generan Jan-Dec del año actual sin tocar `MONTHS`, para
  gráficos que siempre deben mostrar el año completo).
- **`state`**: UI-only (tab activo, qué sheet está abierto, borradores en edición, modo demo,
  filtros, drag-and-drop de sub-tabs, etc.) — nunca se persiste tal cual, solo los datos de
  arriba.

### Gastos compartidos (grupos)

A diferencia de todo lo anterior, estas variables **no** viven en `app_state` (que es privado
por hogar) ni se serializan en `buildFullStateBlob()`: un grupo puede juntar participantes de
distintas cuentas/hogares, así que viven en tablas propias de Supabase y se sincronizan aparte
(`loadSharedExpenses()` + realtime, ver sección 5). Son `let` a nivel de módulo, igual que
`TRANSACTIONS`/`CATEGORIES`, pero su única fuente de verdad es Supabase — nunca se editan "a mano" salvo en
tests (`window.__debug`).

- **`GROUPS`**: `{id, nombre, icono, creado_por, invite_code, created_at}`.
- **`GROUP_PARTICIPANTS`**: `{id, grupo_id, user_id, nombre, color}` — `user_id` es `null`
  cuando el participante no tiene cuenta propia (alguien sin la app, administrado por otro
  miembro del grupo, ej. "Pancho" pagando en efectivo).
- **`SHARED_EXPENSES`**: `{id, grupo_id, descripcion, categoria_origen, monto, fecha,
  pagado_por, registrado_por, division_tipo:'iguales'|'montos'|'pct', tx_origen_id, reparto:
  [ExpenseSplit]}`. `categoria_origen` es el **nombre** de la categoría de quien registró (no
  un id: cada usuaria tiene su propia taxonomía de categorías) — es lo que alimenta el mapeo
  aprendido, ver más abajo.
- **`PAID_BALANCES`**: `{id, grupo_id, de_participante, a_participante, monto, fecha}` — un
  registro puramente contable de "ya nos pusimos al día". **Nunca crea una transacción real**:
  la plata que de verdad se transfiere debe llegar sola por cartola/correo del banco y subirse
  por los flujos normales de importación de la app (decisión explícita de la usuaria: nada de
  transacciones forzadas al saldar cuentas).
- **`CATEGORY_MAPPINGS`**: `{id, user_id, de_participante, categoria_ajena, categoria_propia}` —
  el mapeo aprendido "la categoría que anotó tal persona → mi categoría", **escopado por
  participante de origen** (`de_participante`), no solo por nombre de categoría: así "Otros" de
  tu pareja y "Otros" de tu roomie pueden mapear cada uno a una categoría tuya distinta. Nunca
  se auto-crea una categoría nueva a partir de esto.

**"Mi parte" de un gasto que registró otra persona nunca se persiste** en ningún lado propio:
`syncSharedExpenses()` la recalcula por completo cada vez (al cargar sesión y en cada
evento realtime) desde `SHARED_EXPENSES`/`CATEGORY_MAPPINGS`, y la agrega a `TRANSACTIONS` **en
memoria** como una transacción con `sharedByOthers:true` (id `'compartido-'+gastoId`). Por eso
`buildFullStateBlob()` filtra `TRANSACTIONS.filter(t=>!t.sharedByOthers)` antes de guardar — si se
guardara, quedaría duplicada o desincronizada apenas la otra persona editara o borrara el gasto
original. Reglas del motor (`groupBalances`, `suggestedTransfers`, ambas funciones puras
cubiertas por `audit_gastos_compartidos.js`):

- Si **pagué yo**, mi propia transacción real ya lleva las partes de los demás en `porCobrar`
  (mismo mecanismo que "Por cobrar a alguien" de toda la vida) — no genera ninguna entrada
  derivada para mí.
- Si **pagó otra persona pero yo la registré** (ej. pagó en efectivo alguien sin cuenta), mi
  transacción "ancla" pasa a `estado:'no_es_gasto'` (un recibo puro, no cuenta en mi
  presupuesto) y mi propia parte me llega igual que a cualquier otro participante, vía la
  entrada derivada.
- Si **pagó y registró otra persona**, toda mi parte llega solo como entrada derivada. Sin un
  mapeo aprendido todavía, queda `estado:'pendiente'` con `suggestedOriginCategory` (la
  categoría que puso quien registró, mostrada como sugerencia en el detalle) — clasificarla a
  mano (`classifySharedExpenseFromOthers`) aprende el mapeo para que el próximo gasto de esa
  misma persona con esa misma categoría de origen se clasifique solo.
- El balance por participante es `pagado - correspondido +/- saldos_pagados`, neteado a la
  mínima cantidad de transferencias sugeridas con un algoritmo greedy deudor/acreedor
  (`suggestedTransfers`).

No implementado todavía (a propósito, fuera de alcance de esta primera pasada): categorías
propias de grupo (se prefiere el mapeo aprendido salvo que se quede corto) y metas de inversión
en común.

## 4. Vistas y funcionalidades por pestaña

### Transacciones
Lista con chips de filtro rápido (Todas/Entradas/Por cobrar/Pendientes) + botón de filtros
avanzados (categoría, medio, rango de fechas — sheet aparte, `renderFilterSheetContent`).
Tocar una fila abre el detalle (`renderSheetContent`); el botón `+` (FAB, solo visible en esta
pestaña) abre "Nueva transacción" (`renderNewTxSheetContent`). Ambas hojas comparten estética:
tarjetas `.sheet-block.card` por sección, y la categoría se elige con un avatar redondo +
`<select>` nativo (`renderCategoryRows` / `renderDraftCategoryRow`), no con una grilla de
chips siempre abierta (esa grilla, `catPickerGrid`, solo se usa para la primera clasificación
de un movimiento importado sin categoría).

Dentro del detalle de una transacción:
- **Cuotas** (solo gastos): switch + stepper de número de cuotas.
- **Categoría(s)**: filas editables con split $/％ si el gasto se divide.
- **Regla automática**: "clasificar siempre así los gastos de X" (switch, `reglaAuto`).
- **Cobros y reembolsos** (solo ingresos): tarjeta para vincular este depósito a un pendiente
  de otra transacción. Solo aparece si el ingreso **no tiene categoría** (un depósito ambiguo,
  candidato real a ser el pago de un pendiente) o si ya está vinculado — un ingreso ya
  categorizado (sueldo, freelance, etc.) nunca la muestra.
- **Acciones rápidas** (solo gastos): confirmar / por cobrar a alguien / reembolso pendiente /
  no es gasto. "Por cobrar a alguien" ya no arma una fila adivinada 50/50 -- abre directamente
  el editor de reparto compartido (ver el bullet siguiente), es un toggle de 3 estados: sin
  reparto → abre el editor → cancelar (si nada se confirmó) / quitar reparto (si ya había uno).
- **Dividir este gasto** (solo gastos propios, no en una entrada `sharedByOthers`; con o sin
  grupo asociado): **un solo componente** (`renderSplitDraftForm` en `views/grupos.ts`, sobre
  `state.shareDraft`) para las dos situaciones — "Compartir con un grupo" (si `tx.groupId` está
  o se elige uno) y "Dividir este gasto con alguien" sin grupo (heredero de la vieja
  `renderChargeSplitBlock` de tipo `'persona'`). Ofrece las 3 modalidades (por partes/por
  %/monto fijo, segmented `division-tipo`; internamente `division_tipo` sigue guardando
  `'iguales'` para "por partes" -- es el mismo valor que ya tiene el check de Supabase, solo
  cambió el label y qué significa). "Por partes" YA NO reparte forzosamente en partes iguales:
  cada persona incluida tiene un campo de "número de partes" (un peso cualquiera, no %/$ --
  vacío cuenta como 1 parte, así que sin tocar nada sigue quedando parejo) con un lector en vivo
  al lado de a cuánto le sale (`splitByShares`, `shared-expenses.ts`) -- mover el peso de
  cualquiera repinta el monto de TODAS las filas, porque cambia el denominador compartido. Como
  el monto de cada persona se deriva, nunca se tipea directo, esta modalidad siempre cuadra
  exacto con el total por construcción (nada que balancear a mano, a diferencia de %/monto
  fijo). Quién pagó (segmented,
  participantes del grupo o "Tú" + contactos conocidos + los que se agreguen a mano),
  checkboxes de quiénes entran, vista previa en vivo (`money()`/`moneyPlainMasked()`, así el
  modo demo enmascara gratis) y un botón de confirmar (Compartir/Guardar reparto) que se
  mantiene deshabilitado hasta que la suma cuadre EXACTO con el total, en las 3 modalidades por
  igual (antes solo `'iguales'` tenía esa garantía, y solo para grupos). Con grupo, "Compartir"
  llama `shareExistingTransaction` (ya soportaba `division_tipo`/reparto genérico, solo la UI
  estaba fija en `'iguales'`) y, una vez compartida, la sección pasa a una tarjeta de solo
  lectura ("ya se compartió con &lt;grupo&gt;") — para cambiar el reparto hay que hacerlo desde
  la vista del grupo. Sin grupo, "Guardar reparto" escribe directo en `porCobrar` vía
  `commitPersonaSplit` (`shared-expenses.ts`): si pagaste tú (el único caso de antes de esta
  función), una fila `direccion:'me_deben'` por cada otro participante; si pagó otra persona,
  una única fila `direccion:'debo'` con tu propia parte (ver la nota sobre `porCobrar` en la
  sección 3) — `netExpenseTx()` (`helpers.ts`) sabe neteAR ambos casos. Una vez que ya hay un
  reparto de persona, la sección muestra las filas ya comprometidas (pagado/vincular
  depósito/dar por perdida, sin tocar) más un botón "Editar reparto" que reabre el mismo editor
  precargado (`draftFromExistingSplit`, que para "por partes" precarga el "número de partes" de
  cada quien con su monto ya comprometido -- reproduce el mismo reparto sin pretender recuperar
  los enteros originales). El redondeo lo absorbe siempre el ÚLTIMO participante de la lista,
  tanto en "por partes" (`splitByShares`) como en el caso especial de todos los pesos iguales
  (`splitEqually`, ambas en `shared-expenses.ts`).
  Una entrada `sharedByOthers` (mi parte de un gasto que registró otra persona) reutiliza el
  mismo flujo de clasificación de siempre (`needsClassifying` → `catPickerGrid`) cuando todavía
  no tiene categoría, mostrando además la sugerencia de la categoría de origen; tocar una
  categoría llama `classifySharedExpenseFromOthers` en vez del flujo normal, que además de
  clasificar esta transacción aprende el mapeo para la próxima vez (ver sección 3).
- **Nota** libre.
- Eliminar (con confirmación) y "Listo" al fondo.

### Grupos
Gastos compartidos estilo Tricount. Sin ningún grupo creado: pantalla vacía con botones "Crear
un grupo" / "Unirme con un código". Con grupos: lista de tarjetas (una por grupo) con un
resumen del saldo propio.

Detalle de un grupo (`renderGroupDetail`): 3 sub-tabs estilo Tricount (Gastos/Balances/
Transferencias), mismo patrón visual y estructural que los sub-tabs de "Resumen" (`.subtabs`/
`.subtab`, `data-group-tab`, respaldado por `state.groupDetailTab`) salvo que acá no hay
drag-to-reorder (son 3 pestañas fijas). **El motor de saldos no cambió para esta vista** —
`groupBalances()`/`suggestedTransfers()` (sección 3) son exactamente las mismas funciones puras
de siempre; las 3 pestañas solo renderizan lo que ya calculaban, hasta ahora `suggestedTransfers`
ni se mostraba en pantalla. El botón "Eliminar grupo" (y su confirmación) se sigue mostrando
igual en las 3 pestañas, no es específico de ninguna.

- **Gastos** (pestaña por defecto): total gastado por el grupo (suma de `expensesOfGroup`) +
  feed de TODOS los gastos del grupo (de cualquier participante, no solo los míos —
  `expensesOfGroup` ya traía esto), más reciente primero. Cada fila muestra un ícono de
  categoría (mismo círculo `.tx-avatar` que usa Transacciones), quién pagó, entre quiénes se
  dividió (resuelto desde `reparto`) y la fecha. El ícono de categoría es *best-effort*
  (`categoryForSharedExpense`, `views/grupos.ts`): `categoria_origen` es solo un **nombre** en la
  taxonomía de quien registró el gasto (nunca un id), así que solo se resuelve si (a) el gasto lo
  registré yo mismo (nombre igual a una de mis propias categorías) o (b) ya existe un mapeo
  aprendido (`CATEGORY_MAPPINGS`, el mismo que usa `syncSharedExpenses`) — si ninguna aplica,
  cae al ícono genérico de siempre. Tocar una fila expande su detalle (reparto completo,
  participante por participante) en una tarjeta `.sheet-block.card` inline, sin abrir un sheet
  aparte.
- **Balances**: (1) saldo neto de cada participante (avatar + nombre + saldo — verde si le
  deben, durazno si debe; por construcción siempre suman $0). (2) **Reembolsos sugeridos**
  (`suggestedTransfers`, el mismo algoritmo greedy de siempre): la lista mínima de
  transferencias que deja a todo el grupo en $0, **de TODO el grupo** (incluye lo que se deben
  otras personas entre sí, no solo lo mío) en formato "X → Y: $monto", destacando visualmente las
  que me involucran. Cada una tiene un botón "Marcar como pagado" que llama `registerPaidBalance`
  con esos dos participantes exactos. "Agregar persona" (sin cuenta propia) vive en esta pestaña,
  junto al desglose por persona.
- **Transferencias**: historial de `PAID_BALANCES` de este grupo (quién, cuánto, cuándo — más
  reciente primero) + un formulario para registrar una transferencia manual (alguien pagó por
  fuera de la app, entre cualquier par de participantes). El botón "Marcar como pagado" de
  Balances y este formulario manual llaman **exactamente la misma** `registerPaidBalance` — un
  solo camino para registrar un saldo pagado, sea sugerido o manual — que **solo** escribe un
  registro contable (`saldos_pagados`) y nunca crea ninguna transacción (ver sección 3, es una
  decisión explícita y no negociable).
- Invitar a alguien más al grupo comparte el `invite_code` (uuid); unirse pide ese código + el
  nombre con el que se quiere aparecer (`joinGroup`, RPC `unirse_a_grupo` en Supabase).

### Resumen → Balance
Donut de gasto por categoría del mes + card "Fijo · Variable · Inversión" con barras de
progreso contra tus propias metas (`SPENDING_GOAL_PCT.fijo/variable`, más `investmentGoalPct()`
para Inversión — **ese % sale solo de la suma de `aporteMensualMeta` de TODAS tus metas de
inversión, en todas las plataformas**, dividido por tu ingreso mensual de referencia; nunca se
edita directo acá, se define agregando/editando metas en Inversiones).

### Resumen → Presupuesto
Metas de gasto por categoría con alertas a 80/90/100%, promedio de los últimos 3 meses por
categoría.

### Resumen → Evolución
Barras mes a mes de Ingresos/Gastos/Inversiones + detalle del mes seleccionado + totales del
año.

### Resumen → Inversiones
- **Card de totales** ("Total invertido"): un cuadrado compacto con Aportado neto (más chico que
  los de Balance, `.stat-grid-compact`) — ya no muestra "Ganancia/pérdida aprox." (se sacó a
  pedido de la usuaria, no reintroducir).
- **Objetivo de inversión (año actual)**: es una métrica de **FLUJO**, no de stock — hasta
  septiembre 2026 esta card comparaba mal el acumulado histórico total contra el stock total de
  `montoObjetivo` de todas las metas, mostrándolo como si fuera algo anual cuando en realidad
  mezclaba dos cosas de naturaleza distinta (ver la nota sobre `montoObjetivo`/`aporteMensualMeta`
  en la sección 3). Ahora (`annualInvestmentGoalProgress(año)` en `views/evolucion.ts`): el
  denominador es `Σ(aporteMensualMeta) × 12` de las metas que tienen un aporte mensual fijo; el
  numerador de la barra es lo efectivamente aportado ESTE AÑO a esas mismas metas de aporte fijo
  (nunca acumulado histórico, nunca lo aportado a una meta de flujo libre o a "Otros"). Lo demás
  invertido este año sin un objetivo fijo detrás (metas de "aporta lo que puedas", buckets
  General, "Otros") se muestra aparte como una línea informativa ("+ $X en aportes sin objetivo
  fijo este año") — nunca empuja la barra más allá del 100%. Si ninguna meta tiene aporte
  mensual fijo, no se muestra una barra 0/$0: se explica que no hay objetivo anual que medir. Debajo:
  la línea chica "Aporte mensual objetivo" (mismo monto que define el % de Inversión de Balance)
  + grilla de 12 meses para marcar "¿cumpliste tu objetivo total?" con racha (🔥) si hay meses
  seguidos cumplidos — esa grilla y su racha (`TOTAL_GOAL_CHECKS`) son 100% independientes de este
  cálculo, nunca se tocan por esto.
- **Mis plataformas**: acordeón de una sola apertura por plataforma. Colapsada solo muestra
  nombre + hace cuánto se actualizó + valor total (o, si `sinValuacion`, directamente lo
  aportado — ver "Otros" más abajo, sin la etiqueta de actualización). Abierta muestra
  valor/aportado, comisión (si no tiene metas propias), y sus metas (cada una con progreso —
  omitido si la meta no tiene `montoObjetivo`, ver sección 3 —, comisión, sparkline, "Meta de
  aporte" —omitida si no tiene `aporteMensualMeta`— y checks mensuales que se extienden desde
  `startMonth` hasta diciembre del año en curso, no solo hasta el último mes con transacciones).
  El resumen combinado de metas de una plataforma (`platformGoalsSummary`) solo se muestra si al
  menos una de sus metas tiene `montoObjetivo` — si todas son de flujo puro, no tiene sentido un
  "$X de $0". Crear/editar una meta (`renderGoalEditForm`) pide nombre, **monto objetivo
  (opcional)**, **aporte mensual meta (opcional)** — dejar cualquiera de los dos en blanco es
  válido, ya no bloquea el guardado —, **cuánto tienes ahorrado hasta ahora** (`startingAmount`) y
  **desde qué mes partiste** con la meta (`startMonth`, `<input type="month">`) — así una meta que
  en la vida real es más vieja que el momento en que se creó en la app puede arrancar su historial
  antes, sin inventar transacciones. `platformAportadoNeto(id)` es la suma de `metaAportadoNeto()`
  de sus metas más lo categorizado a su bucket `"<id>__general"` (ver más abajo), nunca una suma
  directa de transacciones por `cat===id`.
  - **"Otros"**: quinta plataforma sembrada junto a fintual/racional/banco_chile/buda, para
    inversiones puntuales sin plataforma ni meta propia (ej. una compra suelta que no amerita
    crear una plataforma nueva). `PLATFORM_DATA.otros.sinValuacion===true`: no tiene valuación
    propia, así que su "valor" es siempre exactamente lo aportado y su ganancia/pérdida da $0 sin
    importar cuánto se le aporte. Nunca admite metas propias (su acordeón no ofrece "+ Agregar
    meta", ni editar/actualizar valor, ni comisión — no hay nada que actualizar) y su única opción
    de categorización es su bucket General, mostrado simplemente como "Otros" (sin el sufijo
    "· General" que sí llevan las demás plataformas, ya que nunca compite con una meta propia).
- **Categorización de una transacción `tipo:'inversion'`** (`renderCategoryRows`/
  `renderDraftCategoryRow`/`investCatPickerGrid` en `sheet.ts`, opciones armadas por
  `investmentCatOptions()` en `views/inversiones.ts`): ya no ofrece las plataformas — ofrece, por
  cada plataforma activa, sus propias metas + un bucket `"[Plataforma] · General"` para un aporte
  que no es de ninguna meta puntual (cuenta para el Aportado neto de la plataforma vía el rollup
  de arriba, pero no para el progreso de ninguna meta). Si `INVESTMENT_GOALS` está vacío, en vez
  del selector se muestra un estado vacío ("No tienes metas creadas") con un botón que lleva
  directo a Inversiones con el formulario de "nueva meta" ya abierto (`data-goto-create-goal`,
  ver `renderInvestGoalEmptyState` en `sheet.ts`).
- **Gráfico "Aportado vs. valor"**: eje X fijo enero-diciembre del año actual (con huecos nulos
  donde falta algún dato de alguna plataforma activa), eje Y con etiquetas aproximadas
  (`moneyShort`, ej. "$1,2M").
- **Planificador de sueldo**: reparte tu excedente mensual (ingresos − gastos) entre tus metas,
  agrupadas por plazo.
- **Simulador** (al final de la página, card chica y sutil, sin color de fondo llamativo):
  proyección a N años con retorno/inflación editables inline, y el "Aportando $X/mes" también
  es editable — si se deja vacío usa tu promedio real de los últimos 3 meses (que se muestra
  aparte, como referencia, debajo).
- **Disclaimer legal**, centrado, al final de toda la pestaña (después del simulador).

### Menú
Mi cuenta (login/logout), Categorías (crear/editar/emoji), Medios de pago, Reglas de
clasificación automática, Exportar a Excel (CSV), Respaldo en JSON, Importar CSV de cartola,
Importar desde tu correo (Gmail + Apps Script — automático), Reconciliar con la cartola (compara
un mes contra un PDF del banco, con parser de PDF con contraseña vía `pdf.js`), Modo demo,
Asesoría financiera con Claude (placeholder, "Próximamente").

## 5. Autenticación y guardado en la nube

Usa **Supabase** (`@supabase/supabase-js@2`, cargado por CDN). Dos tablas:

- `household_members` (`user_id → household_id`): a qué "hogar" pertenece cada cuenta.
- `app_state` (`household_id → data jsonb`): un solo blob JSON con **todo** el estado
  persistible (`buildFullStateBlob()` / `applyStateBlob()`), incluyendo `transacciones`,
  `categorias`, `mediosPago`, `presupuestos`, `metasGastoPct`, `datosTransferencia`,
  `metasInversion`, `plataformas`, `planificador`, `metasTotalChecks`, `months`, `monthLabel`.

Flujo: al cargar, `sb.auth.getSession()` decide si hay sesión → `onAuthenticated(user)` busca
el hogar y carga (o crea, si es cuenta nueva, `emptyAppStateBlob()`) su `app_state`, oculta el
`#auth-gate`, y solo entonces deja de `suppressAutoSave`. El guardado es automático
(debounced, `writeStateToSupabase`) y muestra un indicador silencioso
(`#sync-indicator`, `updateSyncIndicator(status)`) que solo se hace visible en `'error'`
("no se guardó").

**Nunca** se guarda ni se pide la contraseña de un PDF de cartola en ningún otro lugar que un
prompt puntual en el momento de abrirlo.

### Gastos compartidos: tablas propias (`schema_gastos_compartidos.sql`)

Agregado a lo anterior, **fuera** de `app_state` (ver sección 3 para el porqué): `grupos`,
`grupo_participantes`, `gastos_compartidos`, `gasto_reparto`, `saldos_pagados`,
`mapeo_categorias`. RLS con el mismo patrón que `household_members`/`is_household_member()`:
una función `is_grupo_member(gid)` `security definer` evita la referencia circular en las
políticas, y un trigger `handle_new_grupo()` agrega automáticamente a quien crea el grupo como
primer participante (mismo problema de "huevo y gallina" que `handle_new_user()`). Unirse a un
grupo usa una RPC `security definer` (`unirse_a_grupo(p_invite_code, p_nombre)`, mismo patrón
que `importar_transaccion()`) porque quien se une todavía no es miembro y no puede pasar por la
política normal de insert.

Sincronización en vivo: canal `postgres_changes` de Supabase Realtime suscrito a las 5 tablas
(`subscribeToGroupsLive`) — cualquier cambio (propio o de otro participante) dispara un
refetch completo y recalcula todo (`loadSharedExpenses` → `syncSharedExpenses`),
nunca un parche incremental.

## 6. Pipeline de build

Dos fuentes: **`src/*.ts`** (todo el código de la app, en TypeScript, como módulos — ver
sección 2 para el árbol completo) y **`src/plata-clara.html`** (el HTML/CSS de la vitrina —
marco de teléfono, estilos, el `<script>` final es solo un placeholder). `rebuild.py` hace, en
orden:

1. Chequea tipos con `tsc -p tsconfig.json --noEmit` sobre `src/**/*.ts` (así lo dice
   `"include"` en `tsconfig.json`, que hasta septiembre 2026 apuntaba solo a `src/app.ts`).
   **Cualquier** error de tipos aborta acá mismo, sin tocar ningún archivo de salida — un typo
   de categoría, un campo que falta en una transacción, una función llamada con el argumento
   equivocado, todo se atrapa antes de llegar siquiera a empaquetar nada. `tsc` no emite: solo
   chequea. `tsconfig.json` sigue teniendo `noEmitOnError:true` por las dudas, pero con
   `--noEmit` ni siquiera llega a intentar emitir.
2. Empaqueta con **esbuild** (`npx esbuild src/app.ts --bundle --format=iife --target=es2019
   --outfile=dist/app.js --keep-names --tree-shaking=false`): sigue los `import` desde
   `src/app.ts` a través de todos los módulos y arma un único `dist/app.js`, envuelto en una
   sola IIFE — el mismo resultado final que tenía el `app.ts` de una sola pieza, antes de que
   se dividiera en módulos.
   - **`--keep-names` y sin minificar**: el paso 4 de más abajo (inyectar `window.__debug`)
     ubica una línea del código por texto y arma un objeto literal citando decenas de nombres
     de variables/funciones reales (`TRANSACTIONS`, `CATEGORIES`, `state`, `render`, etc.) — si esbuild
     minificara o renombrara identificadores de nivel superior, esos nombres dejarían de
     existir en el bundle y la inyección (y con ella, los ~45 tests de Playwright que leen
     `window.__debug.*`) se rompería.
   - **`--tree-shaking=false`**: por el mismo motivo. Algunas funciones solo las toca
     `window.__debug` — ningún camino real de la app las llama (ej. `sumSpendingGoalPct`) — y el
     tree-shaking normal de esbuild las habría borrado del bundle por "no las usa nadie" (para
     esbuild, los tests no cuentan como "alguien").
   - **Por qué esbuild y no dejar que `tsc` compile directo a JS como antes**: el principio de
     "sin bundlers" documentado en la sección 6 original ya no aplica tal cual — se relajó a
     propósito para esta reorganización en módulos. Con el código repartido en ~20 archivos que
     se importan entre sí, algo tiene que resolver esos `import`/`export` a un único script
     (el navegador no va a cargar 20 `<script type="module">` por separado con rutas relativas
     servidas desde un HTML estático); esbuild hace exactamente eso, rápido y sin configuración
     casi ninguna. `tsc` con `module: "ES2022"` también podría emitir JS con `import`/`export`
     nativos, pero eso obligaría a servir 20 archivos `.js` sueltos (o a otra herramienta aparte
     para juntarlos) — esbuild deja el resultado final idéntico a como era antes (un solo
     `<script>` inline, autocontenido), que es lo que el resto del pipeline (y Cloudflare Pages,
     que no corre nada) espera.
3. Lee `src/plata-clara.html`, ubica el `<script>` final (por regex, sin asumir indentación
   fija ni tipo de comilla — esbuild deja 2 espacios de indentación pero normaliza comillas
   simples a dobles, a diferencia de como reformateaba `tsc` antes) y lo reemplaza por el
   contenido recién empaquetado de `dist/app.js`.
4. Inserta el bloque `window.__debug` justo después de una línea ancla
   (`regenerateInstallmentsFor('t31');` o `regenerateInstallmentsFor("t31");`, según la comilla que haya
   usado esbuild), exponiendo las variables/funciones internas que los tests necesitan tocar
   directamente (`TRANSACTIONS`, `state`, `render`, `todayISO`, `investmentGoalPct`, `allPendingReceivables`,
   `GROUPS`, `SHARED_EXPENSES`, `groupBalances`, etc. — la lista crece cada vez que un test
   nuevo necesita algo que no estaba expuesto) — pero solo en las variantes de test, no en
   `public/index.html`.
5. Genera los distintos archivos de salida, todos dentro de `public/`:

| Archivo | Para qué | Diferencia con la fuente |
|---|---|---|
| `public/index.html` | **Producción** (lo que se sube a Cloudflare Pages) | El JS recién empaquetado, sin nada de depuración |
| `public/test.html` | Mismo contenido que `index.html` | Usado por algunos tests que no necesitan `window.__debug` |
| `public/test_debug.html` | Toda la suite de Playwright corre contra este archivo | pdf.js local (no CDN) + bloque `window.__debug` inyectado |
| `public/extracted.js` / `public/extracted_debug.js` | Solo el JS, para `node --check` (verificar sintaxis rápido) | — |

**Nunca se edita `dist/app.js` a mano ni el `<script>` dentro de `src/plata-clara.html`** — son
generados, se pisan enteros en cada `rebuild.py`. Los únicos archivos fuente que se editan son
los de `src/*.ts` (ver el árbol en sección 2) y `src/plata-clara.html`.

`rebuild_preview.py` genera `preview/preview.html` a partir de `public/index.html`: el mismo
archivo pero con el `auth-gate` oculto desde el propio marcado (`hidden` en el HTML, no algo
que un script oculte después) para poder ver la app con datos de ejemplo sin depender de una
sesión real de Supabase — el visor de Artifacts de Claude bloquea las llamadas de red reales,
así que "Cerrar sesión" en esta vista previa simplemente recarga la página en vez de intentar
un logout real (que dejaría el auth-gate visible para siempre, sin forma de volver a entrar).
**Este archivo nunca se sube a producción.**

Comando típico después de editar algo bajo `src/` (o el CSS/HTML de `src/plata-clara.html`):

```bash
npx tsc -p tsconfig.json --noEmit   # chequeo rápido de tipos, sin generar nada (opcional, rebuild.py ya lo hace)
python3 rebuild.py                  # tsc --noEmit -> esbuild -> regenera public/index.html, public/test.html, public/test_debug.html, public/extracted*.js
python3 rebuild_preview.py          # regenera preview/preview.html (para mostrarla en el chat)
node tests/run_all_tests.js         # corre toda la batería de regresión
```

## 7. Testing

Todo vive en `tests/`. Playwright, sin ningún framework de test runner externo — cada archivo
es un script Node independiente.

- **`tests/lib/test_kit.js`**: helper compartido. `openApp()` abre `public/test_debug.html` en
  Chromium, oculta el auth-gate, espera 300ms; `check(label, condicion, extra?)` registra un
  pass/fail; `finish({context, browser, errors})` cierra el browser, agrega el check
  automático "sin errores de JS/consola", e imprime una línea `##SUMMARY##` en JSON que
  `run_all_tests.js` parsea.
- **`tests/run_all_tests.js`**: corre, en un solo proceso, todos los archivos que matchean
  `/^shot_.*\.js$/` más `smoke_test.js` y `/^audit_.*\.js$/`, todos dentro de `tests/`. Los
  scripts numerados (`shot17_x.js`, `shot2.js`, etc., sin guion bajo pegado a "shot") y los
  `debug_*.js` sueltos que existían de iteraciones viejas se borraron en la reorganización de
  septiembre 2026 — no eran parte de la suite mantenida, `run_all_tests.js` nunca los corría.
  Los PDFs y datos de ejemplo que usan los tests viven en `tests/fixtures/`.
- **`audit_consistency.js`**: no es un test de una sola cosa — recalcula "la verdad" (sumas de
  ingresos/gastos/inversiones por mes, totales de plataformas, etc.) directamente desde `TRANSACTIONS` y
  compara contra lo que la UI muestra en cada vista, para atrapar discrepancias entre vistas
  (ej. Balance vs. Evolución vs. Inversiones) que un test puntual no vería.
- **`audit_gastos_compartidos.js`**: mismo patrón que `audit_consistency.js` pero para el motor
  de balances de grupos — fixture de 3 participantes (uno sin cuenta) inyectada directo por
  `window.__debug` (`GROUPS`/`GROUP_PARTICIPANTS`/`SHARED_EXPENSES`/`PAID_BALANCES`), y
  compara a mano `groupBalances`/`suggestedTransfers`/`syncSharedExpenses` contra
  lo esperado, incluyendo que el mapeo aprendido "pegue" solo en un resync y que no haya doble
  conteo en `monthTotals`. También trae una segunda fixture de 4 participantes que fija, de forma
  explícita, los 3 invariantes que la pestaña "Balances" (ver sección 4) da por sentados: los
  saldos netos SIEMPRE suman $0, aplicar TODAS las transferencias sugeridas deja a todo el mundo
  en exactamente $0 (no solo los totales cuadrando por casualidad), y una transferencia manual
  (no sugerida) ajusta únicamente los dos saldos involucrados, en la dirección correcta.
- **`shot_compartir_grupo.js`** / **`shot_clasificar_ajeno.js`**: la parte de UI de gastos
  compartidos (abrir/cerrar el form de "Compartir con un grupo", recalculo en vivo del reparto,
  clasificar la entrada derivada de un gasto ajeno y ver que el mapeo aprendido se aplique solo
  a un gasto nuevo). Como la escritura real a Supabase (`shareExistingTransaction`,
  `createGroup`, `joinGroup`, etc.) depende de `sb` (bloqueado por la política de red del
  sandbox de test), estos tests inyectan el estado de grupos directo por `window.__debug` —
  igual que `audit_gastos_compartidos.js` — y verifican la UI sobre ese estado, no el viaje de
  ida y vuelta a la base de datos.
- **`shot_split_gasto_persona.js`**: el editor de reparto compartido (`renderSplitDraftForm`) en
  sus dos entradas (con y sin grupo) — las 3 modalidades sumando exacto al total (incluyendo el
  caso de redondeo de "partes iguales"), un reparto ad-hoc entre un subconjunto de participantes,
  el caso nuevo "otra persona pagó" (`direccion:'debo'`) y que `netExpenseTx()` lo netee bien,
  la regresión de una fila `porCobrar` legado (sin `pagador`/`divisionTipo`/`direccion`) y el
  enmascarado en modo demo. Misma limitación que `shot_compartir_grupo.js` con la escritura real
  a Supabase del caso con grupo.
- **`shot_grupo_detalle_tabs.js`**: UI de las 3 pestañas del detalle de un grupo (Gastos/
  Balances/Transferencias) — cambiar de pestaña, que cada una muestre lo que le corresponde
  (ícono de categoría/quién pagó/entre quiénes/fecha en Gastos; ambas secciones y el destacado de
  "me involucra" en Balances; historial + form manual en Transferencias), que "Marcar como
  pagado" y el formulario manual pasen por el mismo `registerPaidBalance`, y que el modo demo
  enmascare los montos nuevos. Mismo criterio que `shot_grupo_eliminar.js`: como `registerPaidBalance`
  tampoco puede escribir de verdad en este sandbox, esas dos acciones se verifican por su
  contrato de fallo explícito (toast, nunca silencio) — que el saldo resultante de una
  transferencia exitosa se refleje bien en `groupBalances`/en la pestaña Transferencias se prueba
  inyectando directo el `PAID_BALANCES` que una escritura real habría dejado.
- Convención: **todo bug fix o cambio de comportamiento agrega/actualiza un test** que bloquee
  que vuelva a pasar — nunca se corrige "a mano" sin dejar cobertura.
- Un test que NO necesita abrir el navegador (por ejemplo, comparar `manifest.json` contra
  `index.html`) puede saltarse `openApp()` y llamar `check()`/`finish({})` directo — ver
  `shot_manifest_consistency.js`.

## 8. Qué archivos subir a Cloudflare Pages

Cloudflare Pages sirve **archivos estáticos tal cual** — no hay ningún paso de build en el
servidor. Se sube el contenido de `public/` completo, tal cual, a la raíz del sitio:

```
public/index.html
public/manifest.json
public/sw.js
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/icon-512-maskable.png
```

(`public/test.html`, `public/test_debug.html`, `public/extracted*.js` y `public/pdf.min.js` /
`public/pdf.worker.min.js` son solo para desarrollo/tests locales — no hace falta subirlos.)

- `public/index.html` es el único que cambia cada vez que se edita la app — es el que hay que
  resubir después de cada `python3 rebuild.py`.
- `manifest.json` y los 3 íconos solo cambian si se retoca el manifest de PWA (nombre, colores,
  ícono) — no hace falta resubirlos en cada deploy normal, pero si `index.html` alguna vez
  cambia de nombre/branding, hay que actualizar `manifest.json` en el mismo commit (hay un test,
  `shot_manifest_consistency.js`, que bloquea que el nombre del manifest quede desincronizado
  del `<title>` de la app — esto pasó una vez: el manifest decía "Plata Clara", el nombre viejo
  de la app, mientras el resto ya decía "Pitucas sin lucas").
- No hace falta ningún `_redirects`, `_headers`, ni configuración de build en Cloudflare Pages
  — "framework preset: None", directorio de salida = la raíz donde estén estos archivos.
- `pdf.js` y `@supabase/supabase-js` se cargan desde CDN (`cdnjs.cloudflare.com` /
  `cdn.jsdelivr.net`) — no son archivos propios, no hay que subirlos.

## 9. Convenciones de diseño (para mantener consistencia si se agregan vistas nuevas)

- **Paleta**: fondo `--bg:#FFFCF9` (crema), acento `--accent:#8E7EE7` (lavanda), tinta/fondo por
  categoría semántica: ingreso `--income-fill/--income-ink` (verde menta), gasto
  `--expense-fill/--expense-ink` (durazno/rojo), inversión `--invest-fill/--invest-ink` (celeste
  azulado) — más 8 pares `--cat-<color>-fill/ink` (lavender/mint/peach/sky/pink/butter/sage/
  neutral) para categorías libres.
- **Tipografía**: una sola familia para todo el texto de la app (Plus Jakarta Sans, vía Google
  Fonts), con un acento editorial en cursiva (`--font-editorial`) solo para el nombre de la
  marca ("Pitucas sin lucas") en el auth-gate.
- **Montos**: `money(n)` (formato completo `$1.234`, se enmascara en Modo demo),
  `moneyPlain(n)` (sin `$`, para inputs), `moneyPlainMasked(n)` (sin `$`, enmascarado),
  `moneyShort(n)` (abreviado, `"$1,2M"` / `"$45K"`, para etiquetas de eje Y de gráficos).
- **Íconos de categoría**: emoji suelto por defecto (`catIconMarkup` resuelve emoji vs. ícono
  con nombre) — nunca un punto de color plano (`.cat-dot`, diseño descartado).
- **Tarjetas de detalle**: `.sheet-block.card` con `.sheet-block-title` como encabezado —
  mismo patrón en el detalle de una transacción existente y en "Nueva transacción".
- **Acordeón de una sola apertura**: patrón usado en plataformas de Inversiones
  (`state.openPlatformId`) — abrir una cierra cualquier otra que estuviera abierta.
- **Rachas**: 🔥 + contador cuando hay meses seguidos cumplidos hasta hoy (mismo patrón para
  metas individuales, el combinado de una plataforma, y el objetivo total).
- Nunca copiar código de referencia que la usuaria comparta tal cual — usarlo solo de guía e
  implementar con los patrones propios de la app (vanilla JS/TS, sin React/Tailwind).

## 10. Decisiones de producto acumuladas (para no perder el criterio ya acordado)

- Prioridad #1: **robustez** — que un cambio no rompa otra parte de la app; por eso la
  disciplina de agregar un test por cada fix.
- Se migró el código a TypeScript (`src/*.ts`, chequeado con `tsc`, ver sección 2 y 6) para
  tener chequeo de tipos en un archivo que ya venía creciendo mucho — **sin** adoptar React ni
  Tailwind: se mantiene la arquitectura de render por concatenación de strings + `window.__debug`.
  El principio de "nada de bundlers" que regía en un inicio sí se relajó, a propósito, en
  septiembre 2026: cuando el código se reorganizó en módulos por vista (ver sección 2), algo
  tenía que resolver los `import`/`export` entre archivos a un único script — se eligió
  **esbuild** por ser mínimo (sin configuración propia más allá de un comando en `rebuild.py`)
  y porque deja el resultado final idéntico a como era antes: un solo `<script>` inline,
  autocontenido, sin `npm run dev` ni nada corriendo en el servidor de hosting.
- Gastos compartidos estilo Tricount (uso entre pareja/roomies/familia, cálculo de quién le
  debe a quién) ya está implementado (ver secciones 3, 4 y 5). Roadmap declarado, no
  implementado todavía: categorías propias de grupo (se prefiere el mapeo aprendido salvo que
  se quede corto) y metas de inversión en común.
