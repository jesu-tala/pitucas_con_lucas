// Vigila las garantías del historial del blob que la suite NO puede ejercitar corriendo:
// la mitad vive en la base de datos (backend/supabase/schema_historial_blob.sql) y la otra
// mitad es una cuestión de ORDEN dentro de restaurarSnapshot() que solo se rompe contra una
// conexión real. Los tests de navegador corren con sb en null, así que ninguna de las dos
// llegaría a fallar ahí -- fallarían en producción, sobre los datos de alguien.
//
// No necesita navegador: lee src/supabase.ts y el SQL.
const fs = require('fs');
const path = require('path');
const { check, finish } = require('./lib/test_kit');

const SUPA_TS = fs.readFileSync(path.join(__dirname, '..', 'src', 'supabase.ts'), 'utf-8');
const SQL = fs.readFileSync(path.join(__dirname, '..', 'backend', 'supabase', 'schema_historial_blob.sql'), 'utf-8');

// ---------- el orden dentro de restaurarSnapshot() ----------
// Al restaurar, en memoria todavía está el estado VIEJO y el autoSaveObserver tiene un guardado
// agendado. Si ese guardado corre después de que el servidor ya restauró, escribe el estado
// viejo encima -- la restauración se deshace sola y la usuaria ve que "no pasó nada", o peor,
// que pasó y se revirtió. Por eso el freno del guardado automático tiene que ir ANTES de la
// llamada, no después.
const fnIni = SUPA_TS.indexOf('export async function restaurarSnapshot');
check('(control) restaurarSnapshot existe en src/supabase.ts', fnIni !== -1);
const cuerpo = SUPA_TS.slice(fnIni, SUPA_TS.indexOf('\n}', fnIni));

const posSuppress = cuerpo.indexOf('suppressAutoSave = true');
const posClear = cuerpo.indexOf('clearTimeout(saveTimer)');
const posRpc = cuerpo.indexOf("rpc('restaurar_snapshot'");
const posApply = cuerpo.indexOf('applyStateBlob(');
const posLast = cuerpo.indexOf('lastSavedBlobJSON =');

check('(control) se encontraron los 5 pasos de restaurarSnapshot',
  [posSuppress, posClear, posRpc, posApply, posLast].every(p => p !== -1),
  { posSuppress, posClear, posRpc, posApply, posLast });
check('frena el guardado automático ANTES de llamar al servidor', posSuppress !== -1 && posRpc !== -1 && posSuppress < posRpc);
check('cancela el guardado ya agendado ANTES de llamar al servidor', posClear !== -1 && posRpc !== -1 && posClear < posRpc);
check('aplica el blob restaurado DESPUÉS de que el servidor confirmó', posApply !== -1 && posRpc !== -1 && posRpc < posApply);
// Sin esto, el primer repintado después de restaurar ve un blob distinto al último guardado,
// escribe uno idéntico al que ya está, y ese UPDATE dispara el trigger: un snapshot de más,
// duplicado, en el primer lugar de la lista.
check('marca el blob restaurado como ya guardado, para no reescribirlo', posApply !== -1 && posLast !== -1 && posApply < posLast);
check('vuelve a soltar el guardado automático al terminar', /finally\s*\{[\s\S]*suppressAutoSave = false/.test(cuerpo));

// La lista NO debe traerse la columna `data`: son 30 blobs completos descargados para dibujar
// una lista que solo muestra fecha, conteo y peso.
const posLoad = SUPA_TS.indexOf('export async function loadHistorialSnapshots');
const cuerpoLoad = SUPA_TS.slice(posLoad, SUPA_TS.indexOf('\n}', posLoad));
check('(control) loadHistorialSnapshots existe', posLoad !== -1);
check('listar el historial no descarga el blob de cada versión',
  /\.select\('id, snapshot_at, n_transacciones, peso_bytes'\)/.test(cuerpoLoad), cuerpoLoad.slice(0, 400));
check('el historial se pide del más nuevo al más viejo',
  /order\('snapshot_at',\s*\{\s*ascending:\s*false/.test(cuerpoLoad));

// ---------- el lado de la base de datos ----------
check('el trigger se dispara después de cada UPDATE de app_state',
  /create trigger on_app_state_actualizado\s+after update on app_state/i.test(SQL));
// Guardar OLD y no NEW es lo que hace que esto sea un historial y no una copia del presente.
check('el snapshot guarda la versión ANTERIOR (OLD), no la nueva',
  /insert into app_state_historial \(household_id, data, reemplazada_por, n_transacciones, peso_bytes\)\s*\n\s*values \(OLD\.household_id, OLD\.data/.test(SQL));
check('no archiva cuando el blob no cambió ni cuando está vacío',
  /OLD\.data = '\{\}'::jsonb or OLD\.data = NEW\.data/.test(SQL));
check('el freno de 10 minutos existe', /interval '10 minutes'/.test(SQL));

// La poda de dos niveles es lo que evita que un día de uso intenso se lleve el historial de la
// semana anterior -- que es justo el que se necesita cuando alguien nota el problema tarde.
check('la poda conserva los 30 más recientes', /order by snapshot_at desc limit 30/i.test(SQL));
check('la poda conserva además uno por día de los últimos 30 días',
  /distinct on \(date_trunc\('day', snapshot_at\)\)/i.test(SQL) && /interval '30 days'/.test(SQL));
// Sin el filtro por hogar, la poda de una usuaria borraría el historial de todas las demás.
check('la poda solo toca el historial del hogar que se está guardando',
  /delete from app_state_historial h\s*\n\s*where h\.household_id = OLD\.household_id/.test(SQL));

// ---------- seguridad del historial ----------
check('el historial tiene RLS habilitada', /alter table app_state_historial enable row level security/i.test(SQL));
check('solo se puede leer el historial del propio hogar',
  /create policy "ver el historial de mi hogar" on app_state_historial\s*\n\s*for select using \(is_household_member\(household_id\)\)/.test(SQL));
// Un historial que la propia usuaria puede vaciar no protege de un borrado en masa: quien
// borre los datos borraría también la forma de recuperarlos. Lo escribe el trigger, lo borra
// la poda, y nadie más.
check('authenticated solo recibe SELECT sobre el historial',
  /grant select on app_state_historial to authenticated;/.test(SQL) &&
  !/grant[^;]*\b(insert|update|delete)\b[^;]*on app_state_historial/i.test(SQL));
check('no hay política de insert/update/delete sobre el historial',
  !/create policy[^;]*on app_state_historial\s*\n?\s*for (insert|update|delete)/i.test(SQL));
// restaurar_snapshot recibe un id de snapshot; sin el chequeo de membresía ese id suelto
// alcanzaría para pisar el blob de un hogar ajeno.
check('restaurar_snapshot verifica la membresía contra auth.uid()',
  /if not is_household_member\(v_hogar\) then/.test(SQL) && /if auth\.uid\(\) is null then/.test(SQL));

finish();
