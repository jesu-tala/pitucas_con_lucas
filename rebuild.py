import re
import subprocess
import sys

SRC = 'src/plata-clara.html'

# ---- 1) Chequear tipos de src/**/*.ts con tsc (sin emitir nada) ----
# noEmitOnError:true en tsconfig.json ya haría que tsc no emita nada si hay errores, pero acá
# ni siquiera se le pide emitir (--noEmit): desde que src/app.ts se separó en muchos módulos
# (ver DOCUMENTACION.md sección 2) el que arma el JS final es esbuild, no tsc -- tsc queda
# como un paso puramente de chequeo, corrido ANTES, para no perder la propiedad que tenía
# antes de la migración a TypeScript: un typo de categoría, un campo que falta en una
# transacción o una función llamada con el argumento equivocado se atrapan acá, antes de
# llegar siquiera a empaquetar nada (esbuild no chequea tipos -- solo los borra y empaqueta).
tsc = subprocess.run(['npx', 'tsc', '-p', 'tsconfig.json', '--noEmit'], capture_output=True, text=True)
if tsc.returncode != 0:
    print("ERROR DE TYPESCRIPT — no se generó nada. Arregla esto antes de seguir:\n")
    print(tsc.stdout)
    print(tsc.stderr)
    sys.exit(1)

# ---- 2) Empaquetar src/app.ts (y todo lo que importa) con esbuild a dist/app.js ----
# --bundle sigue los imports entre los módulos de src/ y arma un único archivo; --format=iife
# lo envuelve en una única IIFE (mismo resultado final que la IIFE manual que tenía el
# app.ts de una sola pieza); --target=es2019 mantiene el mismo nivel de sintaxis que usaba
# tsc antes. Sin minificar y con --keep-names a propósito: rebuild.py más abajo ubica la línea
# ancla regenerateCuotasFor(...) por texto y arma window.__debug con los nombres reales de
# variables/funciones (TX, CATS, state, render, etc.) -- minificar o dejar que esbuild
# renombre identificadores de nivel superior rompería esa inyección y, con ella, los ~45
# tests de Playwright que leen window.__debug.*. --tree-shaking=false por el mismo motivo:
# alguna función solo la toca window.__debug (nada del código de la app la llama de verdad,
# ej. sumaMetasGastoPct) y el tree-shaking normal de esbuild la habría borrado del bundle por
# "no la usa nadie" -- acá "nadie" incluye a los tests, así que se desactiva.
esbuild = subprocess.run(
    ['npx', 'esbuild', 'src/app.ts', '--bundle', '--format=iife', '--target=es2019',
     '--outfile=dist/app.js', '--keep-names', '--tree-shaking=false'],
    capture_output=True, text=True
)
if esbuild.returncode != 0:
    print("ERROR DE ESBUILD — no se generó nada. Arregla esto antes de seguir:\n")
    print(esbuild.stdout)
    print(esbuild.stderr)
    sys.exit(1)

with open('dist/app.js', encoding='utf-8') as f:
    inline_js = f.read().rstrip('\n')

with open(SRC, encoding='utf-8') as f:
    src = f.read()

# Locate the single inline <script> ... </script> block (el placeholder que dice "esto se genera
# solo" -- ver plata-clara.html). Su contenido real no se usa: lo que va ahí es inline_js, recién
# compilado desde app.ts.
m = re.search(r'<script>\n(.*)\n</script>\s*$', src, re.S)
assert m, "no se encontró el <script> inline al final del archivo"
prefix = src[:m.start()]  # everything before "<script>\n"
suffix = src[m.end():]    # everything after "\n</script>" (should be empty/whitespace)

# El anchor se busca sin asumir una indentación fija -- el compilador reformatea el código
# (tsc pasaba 2 espacios a 4; esbuild los deja en 2 pero además normaliza comillas simples a
# dobles), así que se captura la indentación real de esa línea y se acepta cualquiera de las
# dos comillas.
anchor_re = re.compile(r'''^([ \t]*)regenerateCuotasFor\((['"])t31\2\);[ \t]*$''', re.M)
anchor_matches = list(anchor_re.finditer(inline_js))
assert len(anchor_matches) == 1, f"ancla encontrada {len(anchor_matches)} veces (se esperaba 1)"
indent = anchor_matches[0].group(1)
quote = anchor_matches[0].group(2)
anchor = indent + "regenerateCuotasFor(" + quote + "t31" + quote + ");"

debug_block = anchor + "\n\n" + indent + """window.__debug = {
""" + indent + """  TX: TX, CATS: CATS, MEDIOS: MEDIOS, PRESUPUESTOS: PRESUPUESTOS,
""" + indent + """  METAS_INVERSION: METAS_INVERSION, PLATAFORMA_DATA: PLATAFORMA_DATA,
""" + indent + """  PLANIFICADOR: PLANIFICADOR, MONTHS: MONTHS, MONTH_LABEL: MONTH_LABEL,
""" + indent + """  state: state, render: render, monthTotals: monthTotals, yearTotals: yearTotals,
""" + indent + """  metaAcumuladoActual: metaAcumuladoActual, metaProgresoTotal: metaProgresoTotal,
""" + indent + """  platformIds: platformIds, platformAportadoNeto: platformAportadoNeto,
""" + indent + """  platformValorActual: platformValorActual, computeDefaultPlanBase: computeDefaultPlanBase,
""" + indent + """  ensureMedioForSugerido: ensureMedioForSugerido, guessMedioIdFromSuggestion: guessMedioIdFromSuggestion,
""" + indent + """  lastSueldoTx: lastSueldoTx, mesActualTieneSueldo: mesActualTieneSueldo, todayISO: todayISO,
""" + indent + """  parseCartolaPDF: parseCartolaPDF, buscarTxParecida: buscarTxParecida, crearTxDesdeMovimiento: crearTxDesdeMovimiento,
""" + indent + """  METAS_GASTO_PCT: METAS_GASTO_PCT, metaInversionPct: metaInversionPct, metaInversionMensualCLP: metaInversionMensualCLP,
""" + indent + """  ingresoMensualReferencia: ingresoMensualReferencia, sumaMetasGastoPct: sumaMetasGastoPct,
""" + indent + """  presupuestoTotalMensual: presupuestoTotalMensual, sumaPresupuestosCategorias: sumaPresupuestosCategorias,
""" + indent + """  pgBytesToArrayBuffer: pgBytesToArrayBuffer, tienePorCobrarTipo: tienePorCobrarTipo,
""" + indent + """  get DATOS_TRANSFERENCIA(){ return DATOS_TRANSFERENCIA; }, set DATOS_TRANSFERENCIA(v){ DATOS_TRANSFERENCIA = v; },
""" + indent + """  buildCobroWhatsAppText: buildCobroWhatsAppText, datosTransferenciaCompletos: datosTransferenciaCompletos,
""" + indent + """  ensureCuentaVistaMedio: ensureCuentaVistaMedio, ensureMedioDesconocido: ensureMedioDesconocido,
""" + indent + """  importCartolaRows: importCartolaRows, catInfo: catInfo, darPorPerdida: darPorPerdida,
""" + indent + """  catIconMarkup: catIconMarkup, updateSyncIndicator: updateSyncIndicator,
""" + indent + """  inversionesMonthsCalendarYear: inversionesMonthsCalendarYear, moneyShort: moneyShort,
""" + indent + """  activePlatformIds: activePlatformIds, pendientesGlobales: pendientesGlobales,
""" + indent + """  pendienteVinculadaA: pendienteVinculadaA, metaTotalRacha: metaTotalRacha,
""" + indent + """  metaChecksMonths: metaChecksMonths, metaRacha: metaRacha, METAS_TOTAL_CHECKS: METAS_TOTAL_CHECKS,
""" + indent + """  fullYearMonths: fullYearMonths, moneyPlain: moneyPlain, money: money, proyeccionAportes: proyeccionAportes,
""" + indent + """  notifApiSupported: notifApiSupported, pushWorkerConfigured: pushWorkerConfigured,
""" + indent + """  checkPresupuestoPushAvisos: checkPresupuestoPushAvisos, enviarPushHogar: enviarPushHogar,
""" + indent + """  get PRESUPUESTO_AVISOS_ENVIADOS(){ return PRESUPUESTO_AVISOS_ENVIADOS; },
""" + indent + """  set PRESUPUESTO_AVISOS_ENVIADOS(v){ PRESUPUESTO_AVISOS_ENVIADOS = v; },
""" + indent + """  catGastoEnMes: catGastoEnMes, txDesdeImportEmail: txDesdeImportEmail, reglasAgrupadas: reglasAgrupadas,
""" + indent + """  categoriasConColor: categoriasConColor, buildDonut: buildDonut, enviarPushPrueba: enviarPushPrueba,
""" + indent + """  presupuestoAvisoTexto: presupuestoAvisoTexto, intentarAbrirArchivoCartola: intentarAbrirArchivoCartola,
""" + indent + """  get GRUPOS(){ return GRUPOS; }, set GRUPOS(v){ GRUPOS = v; },
""" + indent + """  get GRUPO_PARTICIPANTES(){ return GRUPO_PARTICIPANTES; }, set GRUPO_PARTICIPANTES(v){ GRUPO_PARTICIPANTES = v; },
""" + indent + """  get GASTOS_COMPARTIDOS(){ return GASTOS_COMPARTIDOS; }, set GASTOS_COMPARTIDOS(v){ GASTOS_COMPARTIDOS = v; },
""" + indent + """  get SALDOS_PAGADOS(){ return SALDOS_PAGADOS; }, set SALDOS_PAGADOS(v){ SALDOS_PAGADOS = v; },
""" + indent + """  get MAPEO_CATEGORIAS(){ return MAPEO_CATEGORIAS; }, set MAPEO_CATEGORIAS(v){ MAPEO_CATEGORIAS = v; },
""" + indent + """  saldoGrupo: saldoGrupo, transferenciasSugeridas: transferenciasSugeridas, repartirIguales: repartirIguales,
""" + indent + """  participantesDeGrupo: participantesDeGrupo, gastosDeGrupo: gastosDeGrupo,
""" + indent + """  sincronizarGastosCompartidos: sincronizarGastosCompartidos, participanteIdDeUsuario: participanteIdDeUsuario,
""" + indent + """  clasificarGastoCompartidoAjeno: clasificarGastoCompartidoAjeno, ensureMedioGrupoCompartido: ensureMedioGrupoCompartido,
""" + indent + """  get currentUser(){ return currentUser; }, set currentUser(v){ currentUser = v; }
""" + indent + """};"""

inline_js_debug = inline_js.replace(anchor, debug_block, 1)

def build(prefix_html, js_body, suffix_html, pdfjs_local=False):
    p = prefix_html
    if pdfjs_local:
        p = p.replace(
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            'pdf.min.js'
        )
    return p + '<script>\n' + js_body + '\n</script>' + suffix_html

# index.html / test.html: identical to source (CDN pdf.js), no debug block.
# Todo lo generado va a public/ -- es exactamente lo que se sube a Cloudflare Pages (ver
# sección 8 de DOCUMENTACION.md), junto con sw.js, manifest.json, icons/, pdf.min.js/pdf.worker.min.js.
out_index = build(prefix, inline_js, suffix, pdfjs_local=False)
with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(out_index)
with open('public/test.html', 'w', encoding='utf-8') as f:
    f.write(out_index)

# test_debug.html: local pdf.js + debug block injected.
out_debug = build(prefix, inline_js_debug, suffix, pdfjs_local=True)
with open('public/test_debug.html', 'w', encoding='utf-8') as f:
    f.write(out_debug)

# extracted.js / extracted_debug.js: just the JS bodies, for node --check.
with open('public/extracted.js', 'w', encoding='utf-8') as f:
    f.write(inline_js)
with open('public/extracted_debug.js', 'w', encoding='utf-8') as f:
    f.write(inline_js_debug)

print("OK — archivos regenerados (app.ts -> tsc -> dist/app.js -> index.html/test.html/etc).")
print("test_debug.html script tags:")
