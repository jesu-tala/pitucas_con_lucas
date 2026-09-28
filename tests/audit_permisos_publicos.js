// Guarda el arreglo de backend/supabase/fix_permisos_publicos.sql desde el lado del repo.
//
// El problema que ese archivo cierra: PostgreSQL otorga EXECUTE sobre toda función nueva al
// rol especial PUBLIC, que incluye a `anon` -- el rol con el que responde la API REST cuando
// NO hay sesión, usando la anon key que está a la vista en el cliente. Los
// `grant execute ... to authenticated` del esquema no cierran nada: agregan un permiso que ya
// estaba. Comprobado contra la base real: roster_de_grupo respondía su error de negocio a una
// llamada sin ninguna sesión, y unirse_a_grupo insertaba participantes ilimitados en grupos
// ajenos (con auth.uid() en null el `on conflict (grupo_id, user_id)` nunca dispara, porque en
// un índice unique los NULL cuentan como distintos entre sí).
//
// Como es un permiso que vive en la base de datos, la suite no lo puede ejercitar: corre sin
// conexión, con sb en null. Lo que sí puede -- y es lo que evita que esto vuelva -- es vigilar
// el contrato en el SQL del repo: toda función SECURITY DEFINER nueva tiene que traer su
// `revoke execute ... from public`, o este test falla acá en vez de dejar la función abierta en
// producción sin que nadie se entere.
//
// No necesita navegador: lee backend/supabase/*.sql.
const fs = require('fs');
const path = require('path');
const { check, finish } = require('./lib/test_kit');

const SQL_DIR = path.join(__dirname, '..', 'backend', 'supabase');
const archivos = fs.readdirSync(SQL_DIR).filter(f => f.endsWith('.sql')).sort();
const CORPUS = archivos.map(f => fs.readFileSync(path.join(SQL_DIR, f), 'utf-8')).join('\n');

// Funciones a las que NO se les exige el revoke, cada una por un motivo escrito:
//   · las que devuelven trigger / event_trigger -> PostgreSQL se niega a ejecutarlas si no las
//     dispara un trigger de verdad, así que no son alcanzables desde la API.
//   · is_household_member / is_grupo_member -> las evalúan las políticas de RLS con los
//     permisos de quien consulta; revocarles PUBLIC rompería todas las políticas de un saque.
//     Sin sesión devuelven false siempre (comparan contra auth.uid(), que es null).
const EXENTAS_POR_NOMBRE = ['is_household_member', 'is_grupo_member'];

// ---------- parseo: cada definición de función del corpus ----------
const funciones = [];   // {nombre, esDefiner, devuelveTrigger, archivo}
archivos.forEach(f => {
  const src = fs.readFileSync(path.join(SQL_DIR, f), 'utf-8');
  const re = /create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  let m;
  while ((m = re.exec(src))) {
    const fin = src.indexOf('\n$$;', m.index);
    const cuerpo = src.slice(m.index, fin === -1 ? src.length : fin);
    funciones.push({
      nombre: m[1],
      esDefiner: /security\s+definer/i.test(cuerpo),
      devuelveTrigger: /returns\s+(trigger|event_trigger)\b/i.test(cuerpo),
      archivo: f,
    });
  }
});

const nombresDefiner = [...new Set(funciones.filter(f => f.esDefiner).map(f => f.nombre))].sort();
console.log('funciones security definer encontradas:', nombresDefiner.join(', '));

// ---------- controles positivos ----------
// Si el parseo dejara de encontrar las funciones, todo lo de abajo pasaría en verde sin revisar
// nada. Estas son las que de verdad existen hoy en el esquema.
const ESPERADAS = ['importar_cartola', 'importar_transaccion', 'obtener_suscripciones_push',
  'reclamar_participante', 'roster_de_grupo', 'unirse_a_grupo', 'verificar_household'];
const faltantes = ESPERADAS.filter(n => !nombresDefiner.includes(n));
check('(control) el parseo encuentra las 7 funciones security definer conocidas', faltantes.length === 0, { faltantes, encontradas: nombresDefiner });
check('(control) el parseo reconoce handle_new_user como función de trigger (exenta)',
  funciones.some(f => f.nombre === 'handle_new_user' && f.devuelveTrigger));
check('(control) el parseo NO marca handle_new_user como si necesitara revoke',
  funciones.filter(f => f.nombre === 'handle_new_user').every(f => f.devuelveTrigger));

// ---------- lo que de verdad vigila este test ----------
// Se exige el revoke EN EL MISMO ARCHIVO que define la función, no en cualquier parte del
// repo. Cada archivo se pega y se corre suelto en el SQL Editor, y una instalación nueva corre
// solo los schema_*.sql -- si el revoke viviera únicamente en un fix_*.sql aparte, la función
// quedaría abierta a PUBLIC en todo proyecto nuevo hasta que alguien se acordara de ese archivo.
const exigen = funciones.filter(f => f.esDefiner && !f.devuelveTrigger && !EXENTAS_POR_NOMBRE.includes(f.nombre));
exigen.forEach(f => {
  // El revoke usa solo los tipos (uuid, text) mientras la definición usa nombre+tipo
  // (p_invite_code uuid), así que se busca por nombre de función, no por firma completa.
  const re = new RegExp('revoke\\s+execute\\s+on\\s+function\\s+' + f.nombre + '\\s*\\([^)]*\\)\\s*from\\s+public', 'is');
  const src = fs.readFileSync(path.join(SQL_DIR, f.archivo), 'utf-8');
  check('revoca EXECUTE a public en el mismo archivo que la define: ' + f.nombre + ' (' + f.archivo + ')', re.test(src));
});

function cuerpoDe(f) {
  const src = fs.readFileSync(path.join(SQL_DIR, f.archivo), 'utf-8');
  const re = new RegExp('create\\s+or\\s+replace\\s+function\\s+' + f.nombre + '\\s*\\(');
  const i = src.search(re);
  const fin = src.indexOf('\n$$;', i);
  return src.slice(i, fin === -1 ? src.length : fin);
}

// Control positivo del detector de cuerpos: handle_new_user SÍ menciona app_state (es el
// trigger que le crea el blob vacío a cada cuenta nueva). Si esto se pusiera en verde, el
// regex dejó de encontrar los cuerpos y todas las comprobaciones de abajo pasarían en vacío.
check('(control) el detector ve que handle_new_user sí menciona app_state',
  /\bapp_state\b/.test(cuerpoDe(funciones.find(f => f.nombre === 'handle_new_user'))));

// ---------- el import_token nunca puede leer ni escribir el blob ----------
// Es la garantía central del aislamiento entre hogares. Las funciones que se autentican con
// el import_token son las llamables SIN sesión (el Apps Script y el Worker las usan así), y
// su credencial es un uuid que vive en un script de Google y en un secret de Cloudflare. Esas
// escriben transacciones y leen suscripciones push, pero ninguna debe tocar app_state: si
// mañana alguien mete un `select ... from app_state` en una de ellas, un token filtrado pasa
// de "puede escribir transacciones falsas" a "puede leer, o pisar, toda la plata del hogar".
// Se las reconoce por el parámetro p_token, que es lo que las hace llamables sin sesión.
const conToken = funciones.filter(f => f.esDefiner && /\bp_token\b/.test(cuerpoDe(f)));
check('(control) se encontraron las funciones que se autentican con import_token', conToken.length >= 5,
  { encontradas: conToken.map(f => f.nombre + ' (' + f.archivo + ')') });
conToken.forEach(f => {
  check('la función con token ' + f.nombre + ' no menciona app_state (' + f.archivo + ')',
    !/\bapp_state\b/.test(cuerpoDe(f)));
});

// Y al revés: toda función security definer que SÍ escriba app_state tiene que verificar la
// membresía contra auth.uid(), nunca confiar solo en el id que le pasaron. restaurar_snapshot
// recibe un id de snapshot; sin este chequeo, ese id suelto alcanzaría para pisar el blob de
// un hogar ajeno. Quedan fuera las de trigger: no reciben parámetros de nadie.
funciones.filter(f => f.esDefiner && !f.devuelveTrigger && /\bapp_state\b/.test(cuerpoDe(f))).forEach(f => {
  const cuerpo = cuerpoDe(f);
  check('la función ' + f.nombre + ' verifica la membresía antes de tocar app_state (' + f.archivo + ')',
    /is_household_member\s*\(/.test(cuerpo) && /auth\.uid\(\)/.test(cuerpo));
});

// ---------- quien rote el import_token no puede recibir el hogar por parámetro ----------
// El import_token es la credencial con la que se escribe en un hogar sin sesión, y
// fix_grupos_columnas_protegidas.sql le quitó a `authenticated` el permiso de escribir esa
// columna, así que el ÚNICO camino para cambiarla es una función security definer. Si esa
// función aceptara un p_household_id, cualquiera con una sesión válida podría rotarle el token
// a un hogar ajeno y dejarle la importación muerta. El hogar tiene que salir de auth.uid()
// adentro de la función, y entonces el ataque no se puede ni expresar.
const escribenToken = funciones.filter(f => f.esDefiner && /update\s+households\s+set[\s\S]*import_token/i.test(cuerpoDe(f)));
check('(control) se encontró la función que rota el import_token', escribenToken.length >= 1,
  { encontradas: escribenToken.map(f => f.nombre) });
escribenToken.forEach(f => {
  const cuerpo = cuerpoDe(f);
  const firma = cuerpo.slice(0, cuerpo.indexOf(')') + 1);
  check('la función ' + f.nombre + ' saca el hogar de auth.uid(), no de un parámetro (' + f.archivo + ')',
    /user_id = auth\.uid\(\)/.test(cuerpo) && !/p_household_id/.test(firma), firma);
  check('la función ' + f.nombre + ' rechaza la llamada sin sesión (' + f.archivo + ')',
    /if\s+auth\.uid\(\)\s+is\s+null\s+then/i.test(cuerpo));
});

// ---------- RLS prendida en toda tabla creada ----------
const tablas = [...new Set([...CORPUS.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)].map(m => m[1]))].sort();
check('(control) se encontraron las tablas del esquema', tablas.length >= 12, { tablas });
tablas.forEach(t => {
  const re = new RegExp('alter\\s+table\\s+' + t + '\\s+enable\\s+row\\s+level\\s+security', 'i');
  check('la tabla ' + t + ' tiene RLS habilitada', re.test(CORPUS));
});

// ---------- ninguna tabla accesible sin sesión ----------
// `grant ... on <tabla> to anon` no debe existir: antes del login la app solo habla con /auth,
// nunca con /rest. Las funciones sí pueden estar abiertas a anon (van con import_token), así
// que se excluyen las líneas de `grant execute on function`.
const grantsTabla = CORPUS.split('\n')
  .filter(l => /^\s*grant\b/i.test(l) && !/on\s+function/i.test(l) && !/^\s*--/.test(l))
  .filter(l => /\banon\b/.test(l));
check('ningún grant del esquema le da acceso a una TABLA al rol anon', grantsTabla.length === 0, { grantsTabla });
check('push_subscriptions le revoca a anon los privilegios que tenía de más',
  /revoke\s+all\s+on\s+table\s+push_subscriptions\s+from\s+anon/i.test(CORPUS));

// ---------- unirse_a_grupo rechaza la llamada sin sesión ----------
// Defensa en profundidad del bug del `on conflict` con user_id null.
const defsUnirse = [...CORPUS.matchAll(/create\s+or\s+replace\s+function\s+unirse_a_grupo\s*\([\s\S]*?\n\$\$;/gi)].map(m => m[0]);
check('(control) se encontró al menos una definición de unirse_a_grupo', defsUnirse.length > 0);
defsUnirse.forEach((def, i) => {
  check('la definición ' + (i + 1) + ' de unirse_a_grupo rechaza auth.uid() null',
    /if\s+auth\.uid\(\)\s+is\s+null\s+then/i.test(def));
});

finish();
