-- Pitucas sin lucas — poder cambiar el código de importación cuando se quiera
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- No borra ni modifica ningún dato: solo agrega una función. Es seguro correrlo varias veces.
--
-- ============================ EL PROBLEMA ============================
--
-- El import_token es la credencial con la que el Apps Script y el Cloudflare Worker escriben
-- en un hogar sin tener sesión de nadie. Vive en dos lugares fuera de la app (un script en
-- script.google.com y los parámetros de una llamada al Worker), así que se filtra más fácil
-- de lo que parece: una captura de pantalla compartida, un teléfono prestado, un log.
--
-- Y hasta ahora era ETERNO. No había forma de cambiarlo desde la app, porque
-- fix_grupos_columnas_protegidas.sql --con razón-- le quitó al rol `authenticated` el permiso
-- de escribir esa columna: sin eso, cualquier miembro de un hogar podía reescribir el token de
-- los demás. El resultado es que la columna quedó bien protegida y a la vez imposible de
-- rotar, ni siquiera por su dueña.
--
-- QUÉ ALCANZA UN TOKEN FILTRADO, para dimensionar (diagnosticado función por función):
--   · importar_transaccion / importar_cartola -> ESCRIBIR transacciones y cartolas.
--   · obtener_suscripciones_push / eliminar_suscripcion_push -> los endpoints push del hogar.
--   · verificar_household -> un booleano.
-- NINGUNA lee app_state, así que un token filtrado permite meter transacciones falsas, no
-- leer la plata del hogar (y hay un test, audit_permisos_publicos.js, que bloquea que esa
-- garantía se pierda en el futuro).
--
-- ============================ EL DISEÑO ============================
--
-- Una función security definer, que es el único camino posible: corre como su dueño, así que
-- puede escribir una columna que el rol `authenticated` no puede tocar directamente.
--
-- La decisión que importa: NO recibe ningún parámetro. El hogar sale de auth.uid() adentro de
-- la función, no de algo que le pase quien llama. Si recibiera un p_household_id, ese
-- parámetro sería exactamente la superficie de ataque que se quiere evitar -- alguien con
-- cualquier sesión válida podría rotarle el token a un hogar ajeno y dejarle la importación
-- muerta sin que la dueña entienda por qué. Sin parámetro, eso no se puede ni expresar.
create or replace function rotar_import_token()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_hogar uuid;
  v_nuevo uuid;
begin
  if auth.uid() is null then
    raise exception 'hay que tener la sesión abierta para cambiar el código';
  end if;

  -- El hogar de QUIEN LLAMA, sacado de su sesión. Es la línea que hace que esta función no se
  -- pueda apuntar a un hogar ajeno.
  select household_id into v_hogar
    from household_members where user_id = auth.uid() limit 1;
  if v_hogar is null then
    raise exception 'tu cuenta todavía no tiene un hogar asociado';
  end if;

  v_nuevo := gen_random_uuid();
  update households set import_token = v_nuevo where id = v_hogar;
  return v_nuevo;
end;
$$;

-- revoke ... from public primero: PostgreSQL otorga EXECUTE sobre toda función nueva al rol
-- especial PUBLIC (que incluye a `anon`, el rol SIN sesión), así que el grant a
-- `authenticated` por sí solo NO cierra nada. Ver fix_permisos_publicos.sql.
revoke execute on function rotar_import_token() from public;
grant  execute on function rotar_import_token() to authenticated;

-- ============================ VERIFICACIÓN ============================
-- (A) 1 fila, y `permisos` NO debe tener una entrada que empiece con `=X/` (esa es PUBLIC).
select p.proname, pg_get_function_identity_arguments(p.oid) as firma,
       array_to_string(p.proacl, '  |  ') as permisos
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rotar_import_token';

-- (B) `authenticated` sigue SIN poder escribir import_token a mano (debe devolver solo
--     `nombre` para households). Rotar pasa a ser el único camino, y pasa por la función.
select table_name, column_name
from information_schema.column_privileges
where grantee = 'authenticated' and privilege_type = 'UPDATE' and table_name = 'households';
