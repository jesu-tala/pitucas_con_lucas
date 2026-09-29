// Techo al tamaño del blob de cada hogar (ver backend/supabase/fix_limite_tamano_blob.sql).
//
// app_state.data no tenía ningún límite. Con la app abierta al público, cualquiera que se
// registre puede escribir ahí por la API REST --sin pasar por la interfaz-- y llenar la base
// sin tope. Y ahora pesa más que antes: el historial guarda hasta 60 versiones por hogar, así
// que cada byte del blob se multiplica por esas copias.
//
// El límite REAL lo aplica un trigger en la base; el cliente tiene su propia copia del número
// solo para avisar antes de mandar 2 MB por la red. Este archivo vigila las dos cosas que se
// pueden romper en silencio: que los dos números dejen de coincidir, y que la medición sea en
// unidades distintas a cada lado (bytes contra caracteres), que daría un techo real distinto
// del anunciado según cuántas tildes tengan los nombres de los comercios.
const fs = require('fs');
const path = require('path');
const { check, finish } = require('./lib/test_kit');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'backend', 'supabase', 'fix_limite_tamano_blob.sql'), 'utf-8');
const SUPA_TS = fs.readFileSync(path.join(__dirname, '..', 'src', 'supabase.ts'), 'utf-8');

// ---------- el número dice lo mismo en los dos lados ----------
const mSql = SQL.match(/v_techo\s+integer\s*:=\s*(\d+)/);
const mTs = SUPA_TS.match(/export const MAX_BYTES_BLOB\s*=\s*(\d+)/);
check('(control) el SQL define el techo', !!mSql, mSql && mSql[1]);
check('(control) el cliente define el techo', !!mTs, mTs && mTs[1]);
check('el techo del cliente coincide con el de la base',
  !!mSql && !!mTs && Number(mSql[1]) === Number(mTs[1]),
  { sql: mSql && Number(mSql[1]), cliente: mTs && Number(mTs[1]) });

// ---------- las dos mediciones son en BYTES ----------
// length() en Postgres cuenta caracteres y .length en JavaScript cuenta unidades UTF-16.
// Cualquiera de los dos mediría de menos un blob con acentos, dejando pasar más de lo anunciado.
check('la base mide en bytes (octet_length), no en caracteres',
  /v_peso\s*:=\s*octet_length\(/.test(SQL) && !/v_peso\s*:=\s*length\(/.test(SQL));
check('el cliente mide en bytes (TextEncoder), no en unidades UTF-16',
  /new TextEncoder\(\)\.encode\(texto\)\.length/.test(SUPA_TS));

// ---------- el trigger corta ANTES de escribir ----------
// BEFORE y no AFTER: tiene que rechazar la escritura, no avisar después de guardarla. Y antes
// que el trigger del historial (que es AFTER), para no archivar una versión que se rechazó.
check('el trigger de tamaño corre BEFORE insert or update',
  /create trigger on_app_state_tamano\s+before insert or update on app_state/i.test(SQL));
check('el trigger cubre tanto insert como update', /before insert or update/i.test(SQL));

// ---------- el mensaje sirve para algo ----------
// "violates check constraint" no le dice nada a nadie. El mensaje tiene que decir cuánto pesa
// y cuánto se permite, que es lo que la app muestra.
check('el error dice cuánto pesa y cuánto se permite',
  /raise exception 'El archivo de tus datos pesa % MB y el máximo es % MB\.'/.test(SQL));
check('el error viaja con errcode check_violation, para poder reconocerlo',
  /using errcode = 'check_violation'/.test(SQL));
check('el cliente reconoce ese rechazo y lo distingue de un fallo de red',
  /function esErrorDeTamano/.test(SUPA_TS) && /error\.code === '23514'/.test(SUPA_TS));

// ---------- el aviso en pantalla no miente ----------
// Decir "sin conexión" cuando el problema es el tamaño manda a revisar el wifi por algo que
// esperar no arregla.
check('hay un estado propio del indicador para "no cabe"',
  /status==='demasiado-grande'/.test(SUPA_TS));
check('ese estado muestra un texto distinto al de sin conexión',
  /Tus datos no caben/.test(SUPA_TS) && /Sin conexión — no se guardó/.test(SUPA_TS));
// Si el guardado se rechaza, writeStateToSupabase tiene que devolver false: absorbImportedRows
// marca correos como procesados solo si el guardado se confirmó, y un true acá perdería
// transacciones importadas en silencio.
const fn = SUPA_TS.slice(SUPA_TS.indexOf('export async function writeStateToSupabase'));
const cuerpo = fn.slice(0, fn.indexOf('\n}'));
check('(control) se encontró el cuerpo de writeStateToSupabase', cuerpo.length > 200);
check('un blob que no cabe hace que el guardado devuelva false',
  /updateSyncIndicator\('demasiado-grande'\);\s*\n\s*return false;/.test(cuerpo), cuerpo.slice(0, 700));

finish();
