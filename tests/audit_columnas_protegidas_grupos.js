// Guarda el arreglo de backend/supabase/fix_grupos_columnas_protegidas.sql desde el lado del
// cliente.
//
// El problema que ese archivo cierra: ninguna política de UPDATE del esquema tiene WITH CHECK,
// así que RLS solo controla QUÉ FILAS se tocan, nunca QUÉ COLUMNAS -- cualquier miembro de un
// grupo podía hacer `update grupos set creado_por = auth.uid()` y con eso ganar el permiso de
// DELETE (que la política restringe a quien creó el grupo), borrando en cascada los gastos de
// todos. El arreglo son permisos por columna en Supabase: el rol `authenticated` deja de poder
// escribir creado_por / invite_code / user_id / registrado_por / import_token.
//
// Ese arreglo vive en la base de datos, así que la suite no lo puede ejercitar directamente
// (corre sin conexión, con sb en null). Lo que SÍ puede hacer -- y es justo lo que evita el
// fallo más probable de aquí en adelante -- es vigilar el otro lado del contrato: que la app
// nunca empiece a escribir una de esas columnas. Si alguien agrega mañana un
// `.update({creado_por: ...})` o `.update({user_id: ...})`, esto falla acá, en la suite, en vez
// de fallar contra la base con un "permission denied" difícil de rastrear.
//
// No necesita navegador: lee el código fuente de src/ y revisa cada llamada .update()/.upsert()
// sobre las 4 tablas afectadas.
const fs = require('fs');
const path = require('path');
const { check, finish } = require('./lib/test_kit');

const SRC = path.join(__dirname, '..', 'src');

// Las MISMAS columnas que otorga fix_grupos_columnas_protegidas.sql. Si cambia una, tiene que
// cambiar en los dos lados -- por eso están escritas explícitas acá, no deducidas.
const PERMITIDAS = {
  grupos: ['nombre', 'icono'],
  grupo_participantes: ['nombre', 'color'],
  gastos_compartidos: ['grupo_id', 'descripcion', 'categoria_origen', 'monto', 'fecha', 'pagado_por', 'division_tipo', 'tx_origen_id'],
  households: ['nombre'],
};

function archivosTs(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivosTs(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  });
  return out;
}

// Separa por comas de PRIMER nivel (una llamada anidada con comas adentro no debe partir la
// propiedad en dos) y devuelve el nombre de cada propiedad, soportando tanto `grupo_id: x`
// como la forma corta `{nombre}` que usa editGroupParticipant.
function clavesDelObjeto(texto) {
  const partes = [];
  let nivel = 0, actual = '';
  for (const ch of texto) {
    if (ch === '{' || ch === '(' || ch === '[') nivel++;
    if (ch === '}' || ch === ')' || ch === ']') nivel--;
    if (ch === ',' && nivel === 0) { partes.push(actual); actual = ''; continue; }
    actual += ch;
  }
  partes.push(actual);
  return partes
    .map(p => (p.includes(':') ? p.slice(0, p.indexOf(':')) : p).trim())
    .filter(p => /^[A-Za-z_$][\w$]*$/.test(p));
}

// Toma el objeto literal balanceado que sigue a .update( / .upsert(
function objetoLiteralDespuesDe(tramo, desde) {
  const abre = tramo.indexOf('{', desde);
  if (abre === -1) return null;
  let nivel = 0;
  for (let i = abre; i < tramo.length; i++) {
    if (tramo[i] === '{') nivel++;
    else if (tramo[i] === '}') { nivel--; if (nivel === 0) return tramo.slice(abre + 1, i); }
  }
  return null;
}

const escrituras = [];  // {tabla, columnas, archivo}
archivosTs(SRC).forEach(archivo => {
  const src = fs.readFileSync(archivo, 'utf-8');
  Object.keys(PERMITIDAS).forEach(tabla => {
    const re = new RegExp("from\\('" + tabla + "'\\)", 'g');
    let m;
    while ((m = re.exec(src))) {
      // El tramo de esta llamada llega hasta el próximo .from(...) o el final del archivo.
      const siguiente = src.indexOf(".from('", m.index + 6);
      const tramo = src.slice(m.index, siguiente === -1 ? src.length : siguiente);
      ['.update(', '.upsert('].forEach(metodo => {
        const pos = tramo.indexOf(metodo);
        if (pos === -1) return;
        const obj = objetoLiteralDespuesDe(tramo, pos);
        if (obj === null) return;
        escrituras.push({ tabla, columnas: clavesDelObjeto(obj), archivo: path.relative(SRC, archivo) });
      });
    }
  });
});

console.log('escrituras encontradas:', JSON.stringify(escrituras));

// Control positivo: si el detector dejara de encontrar las escrituras que HOY existen de
// verdad, este test pasaría sin revisar nada (un test que puede aprobar por no encontrar nada
// no sirve). Estas dos son las únicas que la app hace hoy sobre estas tablas.
const editaNombreParticipante = escrituras.some(e => e.tabla === 'grupo_participantes' && e.columnas.length === 1 && e.columnas[0] === 'nombre');
const editaGastoCompartido = escrituras.some(e => e.tabla === 'gastos_compartidos' &&
  ['grupo_id', 'pagado_por', 'division_tipo'].every(c => e.columnas.includes(c)));
check('(control) el detector encuentra la escritura real de grupo_participantes ({nombre})', editaNombreParticipante, escrituras);
check('(control) el detector encuentra la escritura real de gastos_compartidos (grupo_id/pagado_por/division_tipo)', editaGastoCompartido, escrituras);

// Lo que de verdad vigila este test.
escrituras.forEach(e => {
  const prohibidas = e.columnas.filter(c => !PERMITIDAS[e.tabla].includes(c));
  check('la app no escribe columnas protegidas en ' + e.tabla + ' (' + e.archivo + ')', prohibidas.length === 0,
    prohibidas.length ? { prohibidas, permitidas: PERMITIDAS[e.tabla] } : undefined);
});

// Y explícitamente las 5 columnas que son la escalada en sí, por si alguna vez se escriben
// desde un camino que el detector de arriba no cubra (una llamada armada dinámicamente, etc.).
const TEXTO_SRC = archivosTs(SRC).map(f => fs.readFileSync(f, 'utf-8')).join('\n');
[
  ['creado_por', 'grupos'],
  ['invite_code', 'grupos'],
  ['registrado_por', 'gastos_compartidos'],
  ['import_token', 'households'],
].forEach(([columna, tabla]) => {
  const enUpdate = new RegExp("update\\([^)]*\\b" + columna + "\\s*[:}]").test(TEXTO_SRC);
  check('ningún .update() de la app menciona ' + columna + ' (' + tabla + ')', !enUpdate);
});

finish();
