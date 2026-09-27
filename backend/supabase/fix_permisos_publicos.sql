-- Pitucas sin lucas — cierra el acceso de `anon` (sin sesión) a funciones y tablas
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
--
-- QUÉ TOCA ESTE ARCHIVO: permisos (grant/revoke) y el cuerpo de UNA función
-- (unirse_a_grupo). No crea, borra ni modifica NINGÚN dato y ninguna política de RLS.
-- Es seguro correrlo las veces que quieras, y es reversible (bloque al final).
--
-- ============================ EL PROBLEMA ============================
--
-- PostgreSQL otorga EXECUTE sobre toda función nueva al rol especial PUBLIC, que incluye
-- a `anon` -- el rol con el que responde la API REST cuando NO hay sesión, usando la
-- anon key que está a la vista en el cliente. Los `grant execute ... to authenticated`
-- del esquema AGREGAN un permiso que ya estaba; nunca revocan PUBLIC. Comprobado en la
-- base real: el ACL de estas funciones es `=X/postgres | postgres=X/postgres |
-- authenticated=X/postgres`, y esa primera entrada sin rol a la izquierda del `=` ES
-- PUBLIC. Llamar roster_de_grupo sin ninguna sesión devuelve su error de negocio
-- ("código de invitación inválido"), no un 42501 de permisos -- prueba de que entra.
--
-- Las funciones son SECURITY DEFINER, así que corren como su dueño y RLS no las frena.
-- Con solo un invite code (un uuid) y SIN CUENTA hoy se puede:
--
--   · roster_de_grupo(code)        -> leer los nombres de todos los participantes del grupo.
--   · unirse_a_grupo(code, nombre) -> insertar filas en grupo_participantes de un grupo
--     ajeno, ILIMITADAS. El `on conflict (grupo_id, user_id) do nothing` que debería
--     frenar el duplicado no sirve acá: sin sesión auth.uid() es null, y en un índice
--     unique los NULL cuentan como distintos entre sí, así que el conflicto nunca se
--     dispara y cada llamada agrega un participante nuevo "sin reclamar".
--
-- reclamar_participante también entra, pero sin sesión es inofensiva: termina haciendo
-- `set user_id = null where user_id is null`, un no-op. Se cierra igual, por consistencia.
--
-- Aparte, y por otra vía: la tabla push_subscriptions tiene otorgados a `anon` los SIETE
-- privilegios (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE). Ningún
-- archivo SQL de este repo se los da -- salieron de afuera, casi seguro de haber creado la
-- tabla desde el editor de tablas del dashboard, que otorga todo a anon y authenticated por
-- defecto. Hoy no filtra nada porque RLS está prendida y sus políticas piden
-- is_household_member() (falso sin sesión), pero deja dos cosas feas:
--   · TRUNCATE NO pasa por RLS. RLS filtra SELECT/INSERT/UPDATE/DELETE y nada más. Un
--     TRUNCATE con el rol anon borraría las suscripciones push de TODOS los hogares.
--     Hoy no es alcanzable porque PostgREST no expone TRUNCATE, pero el permiso no debería
--     estar: es una sola capa (que PostgREST no lo exponga) separando "no pasa nada" de
--     "se borra la tabla entera".
--   · Es la única tabla del proyecto en ese estado, así que es una anomalía silenciosa.
--
-- Lo que SÍ está bien y este archivo NO toca, para que quede escrito:
--   · El aislamiento del blob. app_state solo se lee/escribe con is_household_member(), no
--     tiene policy ni grant de DELETE, y ninguna función SECURITY DEFINER la menciona --
--     el import_token no puede leer el blob, solo escribir transacciones.
--   · RLS está prendida en las 12 tablas (verificado con pg_tables.rowsecurity).
--   · fix_grupos_columnas_protegidas.sql está aplicado (verificado: exactamente las 13
--     columnas esperadas siguen escribibles, y ni creado_por ni invite_code ni user_id ni
--     registrado_por ni import_token están entre ellas).

-- ---------- 1. funciones que exigen sesión ----------
-- Las tres del flujo de grupos. Quien se une a un grupo necesita una cuenta: su identidad
-- ES auth.uid(), así que sin sesión la llamada no tiene ningún sentido legítimo.
revoke execute on function roster_de_grupo(uuid) from public;
revoke execute on function unirse_a_grupo(uuid, text) from public;
revoke execute on function reclamar_participante(uuid, uuid) from public;
grant  execute on function roster_de_grupo(uuid) to authenticated;
grant  execute on function unirse_a_grupo(uuid, text) to authenticated;
grant  execute on function reclamar_participante(uuid, uuid) to authenticated;

-- ---------- 2. funciones que SÍ deben seguir abiertas sin sesión ----------
-- El Apps Script (corre en la cuenta de Google de cada persona) y el Cloudflare Worker las
-- llaman sin sesión de Supabase: su única credencial es el import_token del hogar, que cada
-- función verifica adentro. Se les revoca PUBLIC y se les otorga `anon` de forma EXPLÍCITA:
-- el permiso queda declarado en el ACL en vez de heredado de un default de PostgreSQL, así
-- que la próxima vez que alguien lea estos permisos ve una decisión, no un accidente.
revoke execute on function importar_transaccion(uuid, uuid, text, text, date, text, text, numeric, text, text, jsonb) from public;
revoke execute on function importar_cartola(uuid, uuid, text, text, text, text) from public;
revoke execute on function obtener_suscripciones_push(uuid, uuid) from public;
revoke execute on function eliminar_suscripcion_push(uuid, uuid, text) from public;
revoke execute on function verificar_household(uuid, uuid) from public;
grant  execute on function importar_transaccion(uuid, uuid, text, text, date, text, text, numeric, text, text, jsonb) to anon, authenticated;
grant  execute on function importar_cartola(uuid, uuid, text, text, text, text) to anon, authenticated;
grant  execute on function obtener_suscripciones_push(uuid, uuid) to anon, authenticated;
grant  execute on function eliminar_suscripcion_push(uuid, uuid, text) to anon, authenticated;
grant  execute on function verificar_household(uuid, uuid) to anon, authenticated;

-- ---------- 3. las que se dejan como están, a propósito ----------
-- is_household_member(uuid) / is_grupo_member(uuid): PUBLIC puede ejecutarlas, y así se
-- quedan. Las evalúan las políticas de RLS con los permisos de quien consulta, así que
-- revocarlas rompería TODAS las políticas de un saque. Sin sesión son inofensivas: ambas
-- comparan contra auth.uid(), que es null, así que devuelven false siempre -- no son ni
-- siquiera un oráculo (no distinguen "no existe" de "no soy miembro").
--
-- handle_new_user() / handle_new_grupo() / rls_auto_enable(): también abiertas a PUBLIC,
-- y tampoco son un problema: PostgreSQL se niega a ejecutar una función que devuelve
-- `trigger` o `event_trigger` si no la dispara un trigger de verdad ("trigger functions can
-- only be called as triggers"), así que no hay forma de invocarlas desde la API.

-- ---------- 4. push_subscriptions: sacarle a anon los 7 privilegios ----------
-- Ninguna tabla de este proyecto necesita ser accesible sin sesión: antes de entrar, la app
-- solo habla con /auth, no con /rest. Después de entrar, el rol es `authenticated`.
revoke all on table push_subscriptions from anon;

-- ---------- 5. unirse_a_grupo: que no acepte una sesión ausente ----------
-- Defensa en profundidad para el punto 1: aunque ya no la pueda llamar `anon`, el bug del
-- `on conflict` con user_id null sigue latente (cualquier camino futuro que la llame sin
-- sesión volvería a insertar filas ilimitadas). Se corta en la raíz, rechazando explícitamente
-- la llamada sin sesión en vez de confiar en que el unique la atrape -- porque no la atrapa.
-- El resto del cuerpo queda idéntico a schema_gastos_compartidos.sql.
create or replace function unirse_a_grupo(p_invite_code uuid, p_nombre text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_grupo_id uuid;
begin
  if auth.uid() is null then
    raise exception 'hay que tener la sesión abierta para unirse a un grupo';
  end if;
  select id into v_grupo_id from grupos where invite_code = p_invite_code;
  if v_grupo_id is null then
    raise exception 'código de invitación inválido';
  end if;
  insert into grupo_participantes (grupo_id, user_id, nombre, color)
  values (v_grupo_id, auth.uid(), p_nombre, 'mint')
  on conflict (grupo_id, user_id) do nothing;
  return v_grupo_id;
end;
$$;
revoke execute on function unirse_a_grupo(uuid, text) from public;
grant  execute on function unirse_a_grupo(uuid, text) to authenticated;

-- ============================ VERIFICACIÓN ============================
-- (A) Ninguna de estas 3 debe tener una entrada que empiece con `=X/` (esa es PUBLIC).
--     Las 5 del import/push SÍ deben mostrar `anon=X/postgres`, y ninguna `=X/`.
select p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as firma,
       array_to_string(p.proacl, '  |  ') as permisos,
       (array_to_string(p.proacl, ' ') like '%=X/%' and array_to_string(p.proacl, ' ') not like '%s=X/%') as publico_todavia
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('roster_de_grupo','unirse_a_grupo','reclamar_participante',
                    'importar_transaccion','importar_cartola','obtener_suscripciones_push',
                    'eliminar_suscripcion_push','verificar_household')
order by p.proname;

-- (B) No debe devolver NINGUNA fila: es "¿qué tabla sigue accesible sin sesión?".
--     Si aparece alguna que no sea push_subscriptions, avísame antes de revocarla a ciegas:
--     hay que confirmar primero que la app no la lea antes del login.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
order by table_name, privilege_type;

-- ============================ CÓMO DESHACERLO ============================
-- Si algo se rompiera, esto devuelve los permisos a como estaban:
--
--   grant execute on function roster_de_grupo(uuid) to public;
--   grant execute on function unirse_a_grupo(uuid, text) to public;
--   grant execute on function reclamar_participante(uuid, uuid) to public;
--   grant all on table push_subscriptions to anon;
--
-- (el cuerpo de unirse_a_grupo se restaura pegando el original de
--  schema_gastos_compartidos.sql, líneas 101-116)
