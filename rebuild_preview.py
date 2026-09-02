import re

# La vista previa de debug se arma a partir de index.html (la salida YA compilada de
# rebuild.py -- app.ts pasado por tsc), no directamente de plata-clara.html: desde que el
# código de la app vive en app.ts, plata-clara.html solo tiene el "cascarón" HTML/CSS y un
# placeholder donde antes iba el script inline. Por eso este script se corre SIEMPRE
# después de `python3 rebuild.py` en el mismo directorio.
SRC = 'index.html'
with open(SRC, encoding='utf-8') as f:
    src = f.read()

# El único cambio real es que el auth-gate arranca oculto en el propio marcado (no depende de
# que un script externo lo oculte después), así que la app se ve de inmediato con los datos de
# ejemplo — el resto del archivo queda IGUAL que producción (incluyendo supabase-js: si logra
# cargar y no encuentra sesión, no importa, el gate ya está oculto de todos modos). Este archivo
# NUNCA se sube a producción — index.html no lo toca.
assert '<div class="auth-gate" id="auth-gate">' in src, "no se encontró el auth-gate esperado"
out = src.replace(
    '<div class="auth-gate" id="auth-gate">',
    '<div class="auth-gate" id="auth-gate" hidden>',
    1
)

# Aviso visible (chico, discreto) de que esto es una vista previa de depuración, no la app real.
out = out.replace(
    '<main class="view-scroll" id="view-root"></main>',
    '<div style="position:absolute;top:0;left:0;right:0;z-index:50;background:#7c3aed;color:#fff;'
    'font-size:10.5px;font-weight:700;text-align:center;padding:3px 0;letter-spacing:.02em;">'
    'VISTA PREVIA DE DEBUG — datos de ejemplo, no tu cuenta real</div>'
    '<main class="view-scroll" id="view-root" style="margin-top:18px;"></main>',
    1
)

# "Cerrar sesión" en la vista previa: en producción esto llama a Supabase de verdad y
# vuelve a mostrar el auth-gate para que la usuaria inicie sesión de nuevo. Pero en esta
# vista previa NO hay backend real accesible (el CSP del Artifact bloquea las llamadas de
# red de Supabase), así que si alguien hace clic en "Cerrar sesión" dentro del demo, el
# auth-gate queda visible (hidden=false) para siempre y no hay forma de volver a entrar —
# se ve como "ahora solo veo iniciar sesión". Para la vista previa, que "cerrar sesión"
# simplemente recargue la página, así siempre vuelve a mostrar la app con datos de ejemplo.
#
# El cuerpo exacto de handleLogout() cambia de formato según cómo lo reimprima tsc (indentación,
# saltos de línea de los if de una línea, etc.) -- por eso esto se busca con una expresión regular
# en vez de un string fijo: desde "async function handleLogout" hasta la primera línea que cierra
# con la MISMA indentación con la que abrió (\1 captura esa indentación, sea cual sea).
handleLogout_re = re.compile(r'([ \t]*)async function handleLogout\(\) \{\n(?:.*\n)*?\1\}')
matches = list(handleLogout_re.finditer(out))
assert len(matches) == 1, f"no se encontró handleLogout tal como se esperaba (encontrado {len(matches)} veces)"
indent = matches[0].group(1)
new_logout = indent + "async function handleLogout() {\n" + indent + "    location.reload();\n" + indent + "}"
out = handleLogout_re.sub(new_logout, out, count=1)

with open('preview/preview.html', 'w', encoding='utf-8') as f:
    f.write(out)

print("OK — preview/preview.html regenerado desde index.html (con los fixes de hoy, incluyendo que 'Cerrar sesión' recargue la página en vez de dejar el auth-gate visible para siempre).")
