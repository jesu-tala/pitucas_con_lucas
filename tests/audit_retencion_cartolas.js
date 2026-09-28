// Las cartolas del banco se borran solas a los 2 meses; las transacciones que salieron de
// ellas se quedan (ver backend/supabase/fix_retencion_cartolas.sql).
//
// Lo que vigila este archivo es lo que la suite no puede ejercitar: el borrado lo hace la base
// de datos, y los tests corren sin conexión. Dos cosas importan de verdad acá.
//
// La primera es que el plazo del TEXTO y el plazo REAL no se separen. El texto que ve la
// persona sale de una constante en TypeScript; el borrado lo aplica un `interval` en SQL. Si
// alguien cambia uno y no el otro, la app promete un plazo que no se cumple -- y eso es peor
// que no decir nada, porque la persona decide si guardar el PDF aparte confiando en ese número.
//
// La segunda es que el borrado no toque nunca las transacciones.
const fs = require('fs');
const path = require('path');
const { check, finish } = require('./lib/test_kit');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'backend', 'supabase', 'fix_retencion_cartolas.sql'), 'utf-8');
const MENU_TS = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'menu.ts'), 'utf-8');

// ---------- el plazo dice lo mismo en los dos lados ----------
const intervalos = [...SQL.matchAll(/interval\s+'(\d+)\s+months?'/gi)].map(m => Number(m[1]));
check('(control) el SQL define el plazo con un interval', intervalos.length >= 2, { intervalos });
check('todos los intervals del SQL dicen el mismo plazo',
  intervalos.length > 0 && intervalos.every(n => n === intervalos[0]), { intervalos });

const mConst = MENU_TS.match(/export const MESES_RETENCION_CARTOLAS\s*=\s*(\d+)/);
check('(control) existe la constante MESES_RETENCION_CARTOLAS en el cliente', !!mConst);
check('el plazo del cliente coincide con el de la base',
  !!mConst && intervalos.length > 0 && Number(mConst[1]) === intervalos[0],
  { cliente: mConst && Number(mConst[1]), sql: intervalos[0] });

// El texto tiene que salir de la constante, no ser un número escrito a mano que quede viejo.
check('el texto que se le muestra a la persona sale de la constante, no de un número suelto',
  /MESES_RETENCION_CARTOLAS\+'\s*meses/.test(MENU_TS) || /\+MESES_RETENCION_CARTOLAS\+/.test(MENU_TS),
  MENU_TS.slice(MENU_TS.indexOf('se borran solas') - 120, MENU_TS.indexOf('se borran solas') + 200));
check('el texto aclara que las transacciones NO se borran',
  /transacciones que hayas creado[\s\S]{0,60}se quedan/.test(MENU_TS));

// ---------- el borrado toca SOLO las cartolas ----------
const borrados = [...SQL.matchAll(/delete\s+from\s+([a-z_][a-z0-9_]*)/gi)].map(m => m[1]);
check('(control) el SQL tiene sentencias de borrado', borrados.length >= 2, { borrados });
check('lo único que se borra es cartolas_importadas',
  borrados.every(t => t === 'cartolas_importadas'), { borrados });
// Las transacciones viven en el blob de app_state, en otra tabla y sin ninguna clave que las
// una a la cartola de la que salieron. Que este archivo ni mencione app_state es la forma
// estructural de garantizar que el borrado no puede alcanzarlas.
// Se mira solo el CÓDIGO: los comentarios del archivo sí nombran app_state, justamente para
// explicar por qué las transacciones quedan fuera de alcance.
const SQL_CODIGO = SQL.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
check('(control) quitar los comentarios deja código de verdad', /delete\s+from/i.test(SQL_CODIGO));
check('ninguna sentencia del archivo toca app_state', !/\bapp_state\b/.test(SQL_CODIGO));

// ---------- cada borrado está acotado a UN hogar ----------
// Sin el filtro por hogar, la llegada de una cartola de una persona borraría las cartolas
// vencidas de todos los demás hogares.
const bloques = SQL.split(/delete\s+from\s+cartolas_importadas/i).slice(1);
check('(control) se encontraron los dos borrados', bloques.length === 2, { encontrados: bloques.length });
bloques.forEach((b, i) => {
  const alcance = b.slice(0, 200);
  check('el borrado ' + (i + 1) + ' está acotado a un solo hogar', /household_id\s*=\s*(NEW\.household_id|v_hogar)/.test(alcance), alcance.slice(0, 160));
  check('el borrado ' + (i + 1) + ' está acotado por fecha', /recibido_en\s*<\s*now\(\)\s*-\s*interval/.test(alcance), alcance.slice(0, 160));
});

// ---------- los dos mecanismos existen ----------
// Uno solo deja un hueco: el trigger no se dispara si dejan de llegar cartolas nuevas, y la
// función del cliente no corre si nadie abre esa pantalla.
check('hay un trigger que limpia al llegar una cartola nueva',
  /create trigger on_cartola_importada\s+after insert on cartolas_importadas/i.test(SQL));
check('hay una función que la app puede llamar para limpiar',
  /create or replace function limpiar_cartolas_vencidas\(\)/i.test(SQL));
check('la app llama a esa función al listar las cartolas',
  /rpc\('limpiar_cartolas_vencidas'\)/.test(MENU_TS));
// Mismo patrón que rotar_import_token: si recibiera el hogar por parámetro, cualquiera con una
// sesión válida podría gatillar la limpieza de un hogar ajeno.
check('la función de limpieza saca el hogar de auth.uid(), no de un parámetro',
  /function limpiar_cartolas_vencidas\(\)/.test(SQL) && /user_id = auth\.uid\(\)/.test(SQL));
check('la función de limpieza rechaza la llamada sin sesión',
  /if auth\.uid\(\) is null then/.test(SQL));

finish();
