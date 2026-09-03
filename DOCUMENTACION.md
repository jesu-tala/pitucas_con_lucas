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
  types.ts            — interfaces/tipos compartidos (Transaccion, Grupo, Categoria, etc.)
  icons.ts            — set de íconos SVG (ICONS) + helpers de ícono
  state.ts            — el objeto `state` de UI, TODAS las variables de datos mutables (TX,
                         CATS, MEDIOS, PRESUPUESTOS, METAS_INVERSION, PLATAFORMA_DATA,
                         PLANIFICADOR, GRUPOS, etc. — ver sección 3) y sus setters (ver más
                         abajo, "por qué hay setXxx() en vez de reasignar directo")
  helpers.ts          — formateo de moneda/fecha y demás utilidades sin estado propio
  shared-expenses.ts  — motor de balances de gastos compartidos (funciones puras) +
                         regenerateCuotasFor (cuotas de tarjeta)
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
  abierto, borradores en edición, etc.) más un conjunto de variables de datos (`TX`, `CATS`,
  `MEDIOS`, `PRESUPUESTOS`, `METAS_INVERSION`, `PLATAFORMA_DATA`, `PLANIFICADOR`,
  `METAS_TOTAL_CHECKS`), todas definidas en `state.ts`.
- Tiene una función `render()` central que redibuja lo que corresponda según `state.tab` /
  `state.resumenSub`, más `renderSheet()` para la hoja modal inferior (detalle de transacción,
  nueva transacción, filtros, etc.).
- Construye HTML por concatenación de strings (no hay ningún framework de componentes ni
  virtual DOM) y lo asigna a `innerHTML` de los contenedores (`#view-root`, `#resumen-content`,
  `#sheet-content`, etc.).
- Todos los clics/inputs se manejan con **event delegation** sobre un único contenedor
  (`phone.addEventListener('click'|'change'|'input'|'focusout'|..., …)`, todo en `events.ts`),
  leyendo atributos `data-*` de los elementos para decidir qué hacer. No hay listeners
  individuales por fila.

Un detalle propio de haber pasado de una sola IIFE a módulos ES de verdad: varias de las
variables de `state.ts` (`TX`, `PRESUPUESTOS`, `METAS_INVERSION`, `PLATAFORMA_DATA`,
`PLANIFICADOR`, `METAS_TOTAL_CHECKS`, `GRUPOS`, `GRUPO_PARTICIPANTES`, `GASTOS_COMPARTIDOS`,
`SALDOS_PAGADOS`, `MAPEO_CATEGORIAS`, `DATOS_TRANSFERENCIA`, `presupuestoTotalMensual`, entre
otras) no solo se mutan en el mismo objeto/arreglo — se **reasignan enteras** desde otros
archivos (por ejemplo al cargar el estado real desde Supabase, o al filtrar `TX` tras borrar
una transacción). Un `import { TX } from './state'` de ES modules es de solo lectura para quien
importa (TypeScript lo marca como error: "Cannot assign to 'TX' because it is an import"), así
que `state.ts` (y, para un par de contadores locales, `sheet.ts`/`views/menu.ts`) exporta
también un `setTX(v)`/`setGRUPOS(v)`/etc. por cada una de estas variables, y los módulos que
necesitan reemplazar el valor completo llaman al setter en vez de reasignar directo. `CATS`,
`MEDIOS`, `MONTHS` y `MONTH_LABEL` no tienen setter porque nunca se reasignan así: se vacían y
se vuelven a llenar en el mismo objeto/arreglo, como siempre.

`esbuild` empaqueta todos estos módulos en un único IIFE al compilar (`--format=iife`), así que
el archivo final que corre en el navegador es, otra vez, un solo script autocontenido — la
división en módulos es solo para editar el código, no cambia nada de lo que se sube a
Cloudflare Pages ni de cómo corre la app (ver sección 6 y 8).

## 3. Modelo de datos

Todo vive en memoria (variables `let`/`const` a nivel de módulo) y se serializa completo a
Supabase (ver sección 5) o a un respaldo JSON descargable (Menú → Respaldo en JSON).

- **`TX`** (array): cada transacción es
  `{id, fecha, hora, comercio, monto, medio, tipo, recurrencia, estado, categorias:[{cat,monto}], porCobrar:[...], reglaAuto, nota}`.
  - `tipo`: `'gasto' | 'ingreso' | 'inversion'`.
  - `recurrencia`: `'variable' | 'mensual' | 'anual'` (mensual/anual cuentan como "gasto fijo"
    en las metas de Balance; el resto es "variable").
  - `estado`: `'confirmado' | 'pendiente' | 'por_cobrar' | 'no_es_gasto'`. Una transacción sin
    categoría queda en `'pendiente'` — **la categoría es opcional al crear una transacción a
    mano**, así que una transacción sin categoría es invisible para cualquier filtro por
    categoría salvo que se active "Sin categoría" en Filtros.
  - `categorias`: array porque un gasto se puede dividir en varias categorías (`allowSplit` en
    `renderCategoriaRows`); una inversión nunca se divide (siempre una sola).
  - `porCobrar`: `[{persona, monto, pagado, tipo:'persona'|'reembolso', montoRecibido,
    linkedTxId}]`. `'persona'` = alguien te debe su parte (se descuenta de Gastos al dividir,
    no cuando te pagan). `'reembolso'` = plata que vuelve después (isapre, seguro), el gasto ya
    fue 100% tuyo y el reembolso se ve como crédito en el mes en que llega.
  - `cuotas: {total}` (opcional) — compras en cuotas; `regenerateCuotasFor(txId)` genera
    transacciones-cuota futuras (`cuotaProyectada`, `cuotaNumero`, `cuotaTotal`) y extiende
    `MONTHS` si hace falta.
- **`CATS`** (objeto, `id → {nombre, tipo, color, icon}`): categorías. `icon` casi siempre es
  un emoji suelto (ej. `'🛒'`); las 4 categorías de tipo `'inversion'` (fintual, racional,
  banco_chile, buda) usan un nombre del set `ICONS` en vez de emoji — **son las plataformas de
  inversión reales**, no categorías libres. `catIconMarkup(name)` resuelve ambos casos (ícono
  con nombre → SVG; cualquier otra cosa → `<span class="emoji-icon">`).
- **`MEDIOS`** (objeto, `id → {nombre, corto, icon}`): medios de pago (tarjetas, cuenta vista,
  efectivo). `icon` sí es siempre un nombre del set `ICONS` (`'card' | 'bank' | 'cash'`).
- **`PRESUPUESTOS`** (objeto, `catId → {meta, alertas:{80,90,100}}`) + `presupuestoTotalMensual`.
- **`METAS_INVERSION`** (array): metas estilo "Fintual" — `{id, nombre, montoObjetivo,
  aporteMensualMeta, plataformaId, plazo, comision, aportadoNeto, historial:{mes:monto},
  checks:{mes:bool}}`. Cada meta vive DENTRO de una plataforma (`plataformaId`); una plataforma
  puede tener 0, 1 o varias metas.
- **`PLATAFORMA_DATA`** (objeto, `id → {valorHistorial:{mes:monto}, fechaActualizacion,
  tasaAnual, comision, plazo}`): valor aproximado que la usuaria actualiza a mano de vez en
  cuando. El "aportado neto" de una plataforma **no** se guarda acá: siempre se calcula desde
  las transacciones `tipo:'inversion'` ya clasificadas con esa categoría/plataforma.
- **`PLANIFICADOR`** (`{base, metaPcts:{metaId:pct}}`): "cuánto de mi excedente mensual mando a
  cada meta", agrupado por plazo (Corto/Medio/Largo).
- **`METAS_TOTAL_CHECKS`** (`{mes:bool}`): check manual mes a mes de "¿cumplí mi objetivo de
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
(`cargarGastosCompartidos()` + realtime, ver sección 5). Son `let` a nivel de módulo, igual que
`TX`/`CATS`, pero su única fuente de verdad es Supabase — nunca se editan "a mano" salvo en
tests (`window.__debug`).

- **`GRUPOS`**: `{id, nombre, icono, creado_por, invite_code, created_at}`.
- **`GRUPO_PARTICIPANTES`**: `{id, grupo_id, user_id, nombre, color}` — `user_id` es `null`
  cuando el participante no tiene cuenta propia (alguien sin la app, administrado por otro
  miembro del grupo, ej. "Pancho" pagando en efectivo).
- **`GASTOS_COMPARTIDOS`**: `{id, grupo_id, descripcion, categoria_origen, monto, fecha,
  pagado_por, registrado_por, division_tipo:'iguales'|'montos'|'pct', tx_origen_id, reparto:
  [GastoReparto]}`. `categoria_origen` es el **nombre** de la categoría de quien registró (no
  un id: cada usuaria tiene su propia taxonomía de categorías) — es lo que alimenta el mapeo
  aprendido, ver más abajo.
- **`SALDOS_PAGADOS`**: `{id, grupo_id, de_participante, a_participante, monto, fecha}` — un
  registro puramente contable de "ya nos pusimos al día". **Nunca crea una transacción real**:
  la plata que de verdad se transfiere debe llegar sola por cartola/correo del banco y subirse
  por los flujos normales de importación de la app (decisión explícita de la usuaria: nada de
  transacciones forzadas al saldar cuentas).
- **`MAPEO_CATEGORIAS`**: `{id, user_id, de_participante, categoria_ajena, categoria_propia}` —
  el mapeo aprendido "la categoría que anotó tal persona → mi categoría", **escopado por
  participante de origen** (`de_participante`), no solo por nombre de categoría: así "Otros" de
  tu pareja y "Otros" de tu roomie pueden mapear cada uno a una categoría tuya distinta. Nunca
  se auto-crea una categoría nueva a partir de esto.

**"Mi parte" de un gasto que registró otra persona nunca se persiste** en ningún lado propio:
`sincronizarGastosCompartidos()` la recalcula por completo cada vez (al cargar sesión y en cada
evento realtime) desde `GASTOS_COMPARTIDOS`/`MAPEO_CATEGORIAS`, y la agrega a `TX` **en
memoria** como una transacción con `compartidoAjeno:true` (id `'compartido-'+gastoId`). Por eso
`buildFullStateBlob()` filtra `TX.filter(t=>!t.compartidoAjeno)` antes de guardar — si se
guardara, quedaría duplicada o desincronizada apenas la otra persona editara o borrara el gasto
original. Reglas del motor (`saldoGrupo`, `transferenciasSugeridas`, ambas funciones puras
cubiertas por `audit_gastos_compartidos.js`):

- Si **pagué yo**, mi propia transacción real ya lleva las partes de los demás en `porCobrar`
  (mismo mecanismo que "Por cobrar a alguien" de toda la vida) — no genera ninguna entrada
  derivada para mí.
- Si **pagó otra persona pero yo la registré** (ej. pagó en efectivo alguien sin cuenta), mi
  transacción "ancla" pasa a `estado:'no_es_gasto'` (un recibo puro, no cuenta en mi
  presupuesto) y mi propia parte me llega igual que a cualquier otro participante, vía la
  entrada derivada.
- Si **pagó y registró otra persona**, toda mi parte llega solo como entrada derivada. Sin un
  mapeo aprendido todavía, queda `estado:'pendiente'` con `categoriaOrigenSugerida` (la
  categoría que puso quien registró, mostrada como sugerencia en el detalle) — clasificarla a
  mano (`clasificarGastoCompartidoAjeno`) aprende el mapeo para que el próximo gasto de esa
  misma persona con esa misma categoría de origen se clasifique solo.
- El balance por participante es `pagado - correspondido +/- saldos_pagados`, neteado a la
  mínima cantidad de transferencias sugeridas con un algoritmo greedy deudor/acreedor
  (`transferenciasSugeridas`).

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
`<select>` nativo (`renderCategoriaRows` / `renderDraftCategoriaRow`), no con una grilla de
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
  no es gasto.
- **Compartir con un grupo** (solo gastos propios, no en una entrada `compartidoAjeno`):
  cerrado por defecto ("Elegir un grupo"); al abrirlo, elegir grupo, quién pagó (segmented) y
  entre quiénes se divide (checkboxes, partes iguales con vista previa en vivo del reparto y
  chequeo de que suma el total exacto) — "Compartir" llama `compartirTransaccionExistente`.
  Una vez compartida, la sección pasa a una tarjeta de solo lectura ("ya se compartió con
  &lt;grupo&gt;"); para cambiar el reparto hay que hacerlo desde la vista del grupo. **Alcance
  de esta primera pasada: solo partes iguales** — "montos"/"%" (reparto personalizado) queda
  para una próxima pasada, el esquema/backend ya los soporta (`division_tipo`).
  Una entrada `compartidoAjeno` (mi parte de un gasto que registró otra persona) reutiliza el
  mismo flujo de clasificación de siempre (`needsClassifying` → `catPickerGrid`) cuando todavía
  no tiene categoría, mostrando además la sugerencia de la categoría de origen; tocar una
  categoría llama `clasificarGastoCompartidoAjeno` en vez del flujo normal, que además de
  clasificar esta transacción aprende el mapeo para la próxima vez (ver sección 3).
- **Nota** libre.
- Eliminar (con confirmación) y "Listo" al fondo.

### Grupos
Gastos compartidos estilo Tricount. Sin ningún grupo creado: pantalla vacía con botones "Crear
un grupo" / "Unirme con un código". Con grupos: lista de tarjetas (una por grupo) con un
resumen del saldo propio.

Detalle de un grupo (`renderGrupoDetalle`):
- **Tarjeta de balance propio** (coloreada según el signo: te deben / debes).
- **Desglose por persona**: avatar + nombre + saldo de cada participante, con un botón "Saldar"
  cuando corresponde — llama `registrarSaldoPagado`, que **solo** escribe un registro contable
  (`saldos_pagados`) y nunca crea ninguna transacción (ver sección 3, es una decisión explícita
  y no negociable).
- **Feed de gastos del grupo**, reutilizando la estética de fila de Transacciones (`.tx-item`).
- **Agregar un gasto** (dentro del grupo) y **agregar un participante sin cuenta propia** (solo
  nombre + color, para alguien que no usa la app).
- Invitar a alguien más al grupo comparte el `invite_code` (uuid); unirse pide ese código + el
  nombre con el que se quiere aparecer (`unirseAGrupo`, RPC `unirse_a_grupo` en Supabase).

### Resumen → Balance
Donut de gasto por categoría del mes + card "Fijo · Variable · Inversión" con barras de
progreso contra tus propias metas (`METAS_GASTO_PCT.fijo/variable`, más `metaInversionPct()`
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
- **Card de totales** ("Total invertido"): dos cuadrados compactos, Aportado neto y
  Ganancia/pérdida aprox. (más chicos que los de Balance, `.stat-grid-compact`).
- **Objetivo de inversión (año actual)**: progreso acumulado vs. objetivo de todas las metas +
  una línea chica "Aporte mensual objetivo" (mismo monto que define el % de Inversión de
  Balance) + grilla de 12 meses para marcar "¿cumpliste tu objetivo total?" con racha (🔥) si
  hay meses seguidos cumplidos.
- **Mis plataformas**: acordeón de una sola apertura por plataforma. Colapsada solo muestra
  nombre + hace cuánto se actualizó + valor total. Abierta muestra valor/aportado, comisión
  (si no tiene metas propias), y sus metas (cada una con progreso, comisión — separada y en
  letra chica de la barra de progreso —, sparkline, y checks mensuales que se extienden desde
  el primer mes con dato real hasta diciembre del año en curso, no solo hasta el último dato).
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
(`suscribirseAGruposEnVivo`) — cualquier cambio (propio o de otro participante) dispara un
refetch completo y recalcula todo (`cargarGastosCompartidos` → `sincronizarGastosCompartidos`),
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
     de variables/funciones reales (`TX`, `CATS`, `state`, `render`, etc.) — si esbuild
     minificara o renombrara identificadores de nivel superior, esos nombres dejarían de
     existir en el bundle y la inyección (y con ella, los ~45 tests de Playwright que leen
     `window.__debug.*`) se rompería.
   - **`--tree-shaking=false`**: por el mismo motivo. Algunas funciones solo las toca
     `window.__debug` — ningún camino real de la app las llama (ej. `sumaMetasGastoPct`) — y el
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
   (`regenerateCuotasFor('t31');` o `regenerateCuotasFor("t31");`, según la comilla que haya
   usado esbuild), exponiendo las variables/funciones internas que los tests necesitan tocar
   directamente (`TX`, `state`, `render`, `todayISO`, `metaInversionPct`, `pendientesGlobales`,
   `GRUPOS`, `GASTOS_COMPARTIDOS`, `saldoGrupo`, etc. — la lista crece cada vez que un test
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
  ingresos/gastos/inversiones por mes, totales de plataformas, etc.) directamente desde `TX` y
  compara contra lo que la UI muestra en cada vista, para atrapar discrepancias entre vistas
  (ej. Balance vs. Evolución vs. Inversiones) que un test puntual no vería.
- **`audit_gastos_compartidos.js`**: mismo patrón que `audit_consistency.js` pero para el motor
  de balances de grupos — fixture de 3 participantes (uno sin cuenta) inyectada directo por
  `window.__debug` (`GRUPOS`/`GRUPO_PARTICIPANTES`/`GASTOS_COMPARTIDOS`/`SALDOS_PAGADOS`), y
  compara a mano `saldoGrupo`/`transferenciasSugeridas`/`sincronizarGastosCompartidos` contra
  lo esperado, incluyendo que el mapeo aprendido "pegue" solo en un resync y que no haya doble
  conteo en `monthTotals`.
- **`shot_compartir_grupo.js`** / **`shot_clasificar_ajeno.js`**: la parte de UI de gastos
  compartidos (abrir/cerrar el form de "Compartir con un grupo", recalculo en vivo del reparto,
  clasificar la entrada derivada de un gasto ajeno y ver que el mapeo aprendido se aplique solo
  a un gasto nuevo). Como la escritura real a Supabase (`compartirTransaccionExistente`,
  `crearGrupo`, `unirseAGrupo`, etc.) depende de `sb` (bloqueado por la política de red del
  sandbox de test), estos tests inyectan el estado de grupos directo por `window.__debug` —
  igual que `audit_gastos_compartidos.js` — y verifican la UI sobre ese estado, no el viaje de
  ida y vuelta a la base de datos.
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
  (`state.platformAbierta`) — abrir una cierra cualquier otra que estuviera abierta.
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
