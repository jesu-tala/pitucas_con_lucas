-- Pitucas sin lucas — cierra una escalada de privilegios en los grupos compartidos
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
--
-- QUÉ TOCA ESTE ARCHIVO: solo PERMISOS (grant/revoke de columnas). No crea, borra ni
-- modifica NINGÚN dato, ninguna tabla y ninguna política. Es seguro correrlo las veces que
-- quieras, y es reversible (al final del archivo está el bloque para deshacerlo).
--
-- ============================ EL PROBLEMA ============================
--
-- schema_gastos_compartidos.sql dice, textualmente, que borrar un grupo se restringe más que
-- editarlo, porque borrarlo se lleva en cascada los gastos/saldos/participantes de TODOS:
--
--     create policy "editar mi grupo" on grupos
--       for update using (is_grupo_member(id));          <- cualquier miembro
--     create policy "eliminar mi grupo" on grupos
--       for delete using (creado_por = auth.uid());      <- solo quien lo creó
--
-- Pero ninguna política de UPDATE del esquema tiene cláusula WITH CHECK (verificado: los 10
-- `with check` que existen son todos de INSERT), y tampoco hay triggers BEFORE UPDATE. Cuando
-- falta WITH CHECK, Postgres reusa la expresión de USING para validar la fila nueva -- y esa
-- expresión solo mira QUÉ FILA se toca, nunca QUÉ COLUMNAS cambian. Resultado: cualquier
-- miembro del grupo puede reescribir `creado_por` y quedar como dueño:
--
--     update grupos set creado_por = auth.uid() where id = '<grupo>';  -- pasa: soy miembro
--     delete from grupos where id = '<grupo>';                          -- pasa: ahora soy "creador"
--
-- ...y la cascada borra gastos_compartidos, gasto_reparto, saldos_pagados y
-- grupo_participantes para todo el mundo, sin vuelta atrás. La restricción que el comentario
-- del esquema describe queda anulada por la política de dos líneas más arriba.
--
-- Por el mismo motivo (columnas sin proteger en UPDATE), hoy también se puede:
--   · `update grupo_participantes set user_id = null` -> expulsa en silencio a otro miembro:
--     deja de cumplir is_grupo_member() y pierde el acceso al grupo y a su historial.
--   · `update grupo_participantes set user_id = auth.uid()` -> se apropia de un participante
--     ya existente saltándose TODAS las validaciones de reclamar_participante()
--     (schema_grupos_identidad.sql), que justamente existe para controlar eso.
--   · `update gastos_compartidos set registrado_por = <otro>` -> reescribe la autoría, que la
--     política de INSERT sí exige (`registrado_por = auth.uid()`) pero la de UPDATE no revisa.
--
-- Nada de esto lo hace la app: es todo alcanzable llamando la API REST de Supabase directo con
-- la sesión propia. La interfaz no es una barrera de seguridad; RLS y los permisos sí.
--
-- ============================ EL ARREGLO ============================
--
-- Permisos por columna. Postgres permite otorgar UPDATE sobre columnas puntuales, así que en
-- vez de "puedes actualizar esta fila" (que es lo único que sabe decir una política de RLS)
-- queda "puedes actualizar EXACTAMENTE estas columnas de esta fila". Las políticas de RLS no
-- se tocan: siguen decidiendo QUÉ FILAS, y esto decide QUÉ COLUMNAS.
--
-- Se eligieron las columnas a partir de lo que la app de verdad escribe hoy (revisado una por
-- una en src/views/menu.ts), más las que el esquema deja implícito que un miembro debería
-- poder editar. Ninguna función SECURITY DEFINER se ve afectada: corren con los permisos de su
-- dueño, no con los del rol `authenticated` -- así que unirse_a_grupo(), reclamar_participante()
-- y el trigger handle_new_grupo() siguen funcionando igual, y pasan a ser el ÚNICO camino para
-- escribir grupo_participantes.user_id, que es exactamente lo que se busca.

-- ---------- grupos ----------
-- La app nunca actualiza esta tabla (solo insert/select/delete), pero el esquema sí contempla
-- que un miembro pueda "editar" el grupo -- así que se conserva esa intención para nombre e
-- icono, y se cierran las dos columnas peligrosas:
--   · creado_por  -> es la llave de la política de DELETE (la escalada de arriba).
--   · invite_code -> quien lo reescriba invalida el código que ya repartiste, o se fabrica uno
--                    nuevo a voluntad.
revoke update on grupos from authenticated;
grant update (nombre, icono) on grupos to authenticated;

-- ---------- grupo_participantes ----------
-- La app solo actualiza `nombre` (editGroupParticipant, menu.ts:1548). Se suma `color` porque
-- es del mismo tipo de dato cosmético y el esquema lo trata igual. `user_id` queda cerrado: es
-- la identidad, y su único camino legítimo es reclamar_participante() / unirse_a_grupo(), que
-- validan que el participante no esté ya reclamado y que no seas ya parte del grupo.
revoke update on grupo_participantes from authenticated;
grant update (nombre, color) on grupo_participantes to authenticated;

-- ---------- gastos_compartidos ----------
-- La app actualiza grupo_id/pagado_por/division_tipo (updateSharedTransaction, menu.ts:1692).
-- Se suman las columnas de contenido del gasto, que un miembro razonablemente edita. Queda
-- fuera `registrado_por`: la política de INSERT ya exige que seas tú, y no tiene sentido que
-- después se pueda reescribir a otra persona.
-- (Mover un gasto de grupo_id sigue estando acotado por RLS: la política exige ser miembro
-- tanto del grupo actual como del nuevo.)
revoke update on gastos_compartidos from authenticated;
grant update (grupo_id, descripcion, categoria_origen, monto, fecha, pagado_por, division_tipo, tx_origen_id)
  on gastos_compartidos to authenticated;

-- ---------- households (mismo problema, fuera del alcance de los grupos) ----------
-- No es parte de la escalada de arriba y la app tampoco actualiza esta tabla, pero la política
-- "actualizar mi(s) hogar(es)" tiene exactamente la misma forma, y hoy deja reescribir
-- `import_token` -- el secreto con el que el Apps Script y el Worker escriben en tu cuenta.
-- Hoy cada hogar tiene una sola persona, así que el daño sería a uno mismo; el día que un hogar
-- se comparta (está contemplado en schema.sql) dejaría de serlo. Si prefieres dejar esto para
-- otro momento, borra estas dos líneas: el resto del archivo funciona igual.
revoke update on households from authenticated;
grant update (nombre) on households to authenticated;

-- ============================ VERIFICACIÓN ============================
-- Debería devolver EXACTAMENTE estas filas (una por columna que quedó escribible):
--   gastos_compartidos  -> categoria_origen, descripcion, division_tipo, fecha, grupo_id,
--                          monto, pagado_por, tx_origen_id
--   grupo_participantes -> color, nombre
--   grupos              -> icono, nombre
--   households          -> nombre
-- Si ves `creado_por`, `invite_code`, `user_id`, `registrado_por` o `import_token` en esta
-- lista, algo no se aplicó.
select table_name, column_name
from information_schema.column_privileges
where grantee = 'authenticated'
  and privilege_type = 'UPDATE'
  and table_name in ('grupos','grupo_participantes','gastos_compartidos','households')
order by table_name, column_name;

-- ============================ CÓMO DESHACERLO ============================
-- Si algo se rompiera, esto devuelve todo exactamente a como estaba antes:
--
--   grant update on grupos to authenticated;
--   grant update on grupo_participantes to authenticated;
--   grant update on gastos_compartidos to authenticated;
--   grant update on households to authenticated;
