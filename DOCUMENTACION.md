# Pitucas sin lucas — Documentación técnica

App de finanzas personales para uso individual (Chile, pesos CLP). Un solo archivo HTML/JS,
sin build, pensado para que cualquier sesión de Claude (o cualquier desarrollador) pueda
retomarla, entenderla y seguir extendiéndola sin tener que releer 7000+ líneas desde cero.

Última actualización de este documento: septiembre 2026.

## 1. Qué es la app

"Pitucas sin lucas" es una app de bolsillo (mobile-first, se ve como un teléfono en una vitrina
de escritorio) para llevar transacciones, presupuesto, balance mensual e inversiones. Tiene
cuenta real (login con Supabase) y también un "Modo demo" que enmascara todos los montos con
`$••••••` para poder mostrar la pantalla sin exponer cifras reales.

Tres pestañas principales:

- **Transacciones** — lista de movimientos, con filtros (Todas / Entradas / Por cobrar /
  Pendientes) y filtros avanzados (categoría, medio de pago, rango de fechas).
- **Resumen** — cuatro sub-pestañas: Balance, Presupuesto, Evolución, Inversiones.
- **Menú** — cuenta, categorías, medios de pago, reglas automáticas, exportar/respaldar,
  importar cartola (CSV o PDF), modo demo, y "Asesoría financiera con Claude" (placeholder,
  todavía no implementado).

## 2. Arquitectura

Un único archivo fuente: `plata-clara.html`. Es una IIFE de JavaScript vanilla (sin
frameworks, sin build step) que:

- Guarda todo el estado de la app en un objeto `state` (tab activo, filtros, qué sheet está
  abierto, borradores en edición, etc.) más un conjunto de variables de datos (`TX`, `CATS`,
  `MEDIOS`, `PRESUPUESTOS`, `METAS_INVERSION`, `PLATAFORMA_DATA`, `PLANIFICADOR`,
  `METAS_TOTAL_CHECKS`).
- Tiene una función `render()` central que redibuja lo que corresponda según `state.tab` /
  `state.resumenSub`, más `renderSheet()` para la hoja modal inferior (detalle de transacción,
  nueva transacción, filtros, etc.).
- Construye HTML por concatenación de strings (no hay ningún framework de componentes ni
  virtual DOM) y lo asigna a `innerHTML` de los contenedores (`#view-root`, `#resumen-content`,
  `#sheet-content`, etc.).
- Todos los clics/inputs se manejan con **event delegation** sobre un único contenedor
  (`phone.addEventListener('click'|'change'|'input'|'focusout'|..., …)`), leyendo atributos
  `data-*` de los elementos para decidir qué hacer. No hay listeners individuales por fila.

No hay ningún paso de build para producción: `plata-clara.html` **es** el código, y
`rebuild.py` simplemente lo copia/deriva a los distintos archivos que hacen falta (ver
sección 6).

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
- **Nota** libre.
- Eliminar (con confirmación) y "Listo" al fondo.

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

## 6. Pipeline de build (todo corre localmente, sin bundlers)

`plata-clara.html` es la única fuente de verdad. `rebuild.py` la lee, separa el `<script>`
inline del resto del HTML, y genera:

| Archivo | Para qué | Diferencia con la fuente |
|---|---|---|
| `index.html` | **Producción** (lo que se sube a Cloudflare Pages) | Idéntico a la fuente, sin nada de depuración |
| `test.html` | Mismo contenido que `index.html` | Usado por algunos tests que no necesitan `window.__debug` |
| `test_debug.html` | Toda la suite de Playwright corre contra este archivo | pdf.js local (no CDN) + bloque `window.__debug` inyectado |
| `extracted.js` / `extracted_debug.js` | Solo el JS, para `node --check` (verificar sintaxis rápido) | — |

El bloque `window.__debug` se inyecta justo después de una línea ancla
(`regenerateCuotasFor('t31');`) y expone las variables/funciones internas que los tests
necesitan tocar directamente (`TX`, `state`, `render`, `todayISO`, `metaInversionPct`,
`pendientesGlobales`, etc. — la lista crece cada vez que un test nuevo necesita algo que no
estaba expuesto).

`rebuild_preview.py` genera `preview/preview.html`: el mismo archivo pero con el `auth-gate`
oculto desde el propio marcado (`hidden` en el HTML, no algo que un script oculte después) para
poder ver la app con datos de ejemplo sin depender de una sesión real de Supabase — el visor de
Artifacts de Claude bloquea las llamadas de red reales, así que "Cerrar sesión" en esta vista
previa simplemente recarga la página en vez de intentar un logout real (que dejaría el
auth-gate visible para siempre, sin forma de volver a entrar). **Este archivo nunca se sube a
producción.**

Comando típico después de editar `plata-clara.html`:

```bash
python3 rebuild.py           # regenera index.html/test.html/test_debug.html/extracted*.js
python3 rebuild_preview.py   # regenera preview/preview.html (para mostrarla en el chat)
node run_all_tests.js        # corre toda la batería de regresión
```

## 7. Testing

Playwright, sin ningún framework de test runner externo — cada archivo es un script Node
independiente.

- **`lib/test_kit.js`**: helper compartido. `openApp()` abre `test_debug.html` en Chromium,
  oculta el auth-gate, espera 300ms; `check(label, condicion, extra?)` registra un
  pass/fail; `finish({context, browser, errors})` cierra el browser, agrega el check
  automático "sin errores de JS/consola", e imprime una línea `##SUMMARY##` en JSON que
  `run_all_tests.js` parsea.
- **`run_all_tests.js`**: corre, en un solo proceso, todos los archivos que matchean
  `/^shot_.*\.js$/` más `smoke_test.js` y `/^audit_.*\.js$/`. Archivos `shot17_x.js`,
  `shot2.js`, etc. (sin guion bajo pegado a "shot") **no** son parte de la suite mantenida —
  son restos de iteraciones viejas, no hace falta arreglarlos ni borrarlos.
- **`audit_consistency.js`**: no es un test de una sola cosa — recalcula "la verdad" (sumas de
  ingresos/gastos/inversiones por mes, totales de plataformas, etc.) directamente desde `TX` y
  compara contra lo que la UI muestra en cada vista, para atrapar discrepancias entre vistas
  (ej. Balance vs. Evolución vs. Inversiones) que un test puntual no vería.
- Convención: **todo bug fix o cambio de comportamiento agrega/actualiza un test** que bloquee
  que vuelva a pasar — nunca se corrige "a mano" sin dejar cobertura.
- Un test que NO necesita abrir el navegador (por ejemplo, comparar `manifest.json` contra
  `index.html`) puede saltarse `openApp()` y llamar `check()`/`finish({})` directo — ver
  `shot_manifest_consistency.js`.

## 8. Qué archivos subir a Cloudflare Pages

Cloudflare Pages sirve **archivos estáticos tal cual** — no hay ningún paso de build en el
servidor. Hay que subir, todos juntos y en la raíz del sitio (respetando la carpeta `icons/`):

```
index.html
manifest.json
icons/icon-192.png
icons/icon-512.png
icons/icon-512-maskable.png
```

- `index.html` es el único que cambia cada vez que se edita la app — es el que hay que
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
  implementar con los patrones propios de la app (vanilla JS, sin React/TS/Tailwind).

## 10. Decisiones de producto acumuladas (para no perder el criterio ya acordado)

- Prioridad #1: **robustez** — que un cambio no rompa otra parte de la app; por eso la
  disciplina de agregar un test por cada fix.
- Se evaluó migrar a TypeScript/React/Tailwind/Vite y se descartó por ahora: se prefiere
  mantener el archivo único + expandir la batería de Playwright.
- Roadmap declarado (no implementado todavía): uso compartido entre pareja/roomies/familia
  (gastos divididos, metas de inversión en común) y, más adelante, algo tipo Tricount (gastos
  de grupo con cálculo de quién le debe a quién) — a evaluar si conviene dejar la puerta abierta
  desde el modelo de datos actual.
