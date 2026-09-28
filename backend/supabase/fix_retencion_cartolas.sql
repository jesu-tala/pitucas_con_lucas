-- Pitucas sin lucas — las cartolas del banco se borran solas a los 2 meses
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
--
-- OJO, este archivo SÍ borra datos, a diferencia de los otros fixes: al correrlo, la primera
-- limpieza se lleva las cartolas que ya tengan más de 2 meses. Lo que borra son los PDF
-- guardados, nunca transacciones (ver abajo por qué eso es imposible acá). Si quieres ver
-- primero qué se iría sin borrar nada, corre solo esto:
--
--   select id, nombre_archivo, recibido_en, procesado,
--          pg_size_pretty(length(contenido)::bigint) as peso
--   from cartolas_importadas
--   where recibido_en < now() - interval '2 months'
--   order by recibido_en;
--
-- ============================ EL PROBLEMA ============================
--
-- cartolas_importadas guarda el PDF del banco tal cual llegó, en la columna `contenido`. Son
-- cientos de KB cada uno y entran solos por correo, uno al mes por cuenta y por tarjeta.
--
-- Nunca se borraba ninguno. Peor: la app los deja de MOSTRAR apenas se usan
-- (loadAvailableStatements filtra por `procesado = false`, src/views/menu.ts), así que una
-- cartola usada desaparece de la vista pero el archivo sigue ahí, invisible, para siempre.
-- Es el peor de los dos mundos: sigue ocupando espacio y sigue siendo un dato sensible
-- guardado, pero ya nadie se acuerda de que existe.
--
-- Una cartola vieja no sirve para nada: lo que se saca de ella --las transacciones-- ya se
-- extrajo, y reconciliar un mes de hace medio año no es algo que se haga.
--
-- ============================ QUÉ NO BORRA ============================
--
-- Las transacciones NO se tocan, y no es una promesa sino una imposibilidad estructural: las
-- transacciones viven dentro del blob JSON de app_state, en otra tabla, y no hay ninguna clave
-- que las relacione con la cartola de la que salieron. Borrar una fila de cartolas_importadas
-- no puede afectarlas ni por cascada ni por error. Lo único que se pierde es el PDF original:
-- si algún día hace falta de nuevo, se baja otra vez del banco.
--
-- ============================ EL DISEÑO ============================
--
-- Dos mecanismos, porque uno solo deja un hueco:
--
-- 1. Un trigger al insertar. Cada cartola nueva limpia las vencidas del mismo hogar. Cubre el
--    caso normal (llegan todos los meses) sin depender de que nadie abra la app.
-- 2. Una función que la app llama al abrir la pantalla de reconciliar. Cubre el caso que el
--    trigger no puede: si dejan de llegar cartolas nuevas, sin esto la última tanda se
--    quedaría guardada indefinidamente porque no habría ningún insert que dispare la limpieza.
--
-- El plazo son 2 meses, escrito en los dos lugares. Hay un test (audit_retencion_cartolas.js)
-- que falla si los dos dejan de decir lo mismo, o si el plazo del cliente se desincroniza.

-- ---------- 1. el trigger: cada cartola nueva limpia las vencidas ----------
create or replace function limpiar_cartolas_al_insertar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Solo del hogar que acaba de recibir una cartola. Sin este filtro, la llegada de una
  -- cartola de una persona dispararía la limpieza de todos los demás hogares.
  delete from cartolas_importadas
   where household_id = NEW.household_id
     and recibido_en < now() - interval '2 months';
  return NEW;
end;
$$;

drop trigger if exists on_cartola_importada on cartolas_importadas;
create trigger on_cartola_importada
  after insert on cartolas_importadas
  for each row execute function limpiar_cartolas_al_insertar();

-- ---------- 2. la función que llama la app ----------
-- Mismo patrón que rotar_import_token(): NO recibe el hogar por parámetro, lo saca de
-- auth.uid() adentro. Si lo recibiera, cualquiera con una sesión válida podría gatillar la
-- limpieza de un hogar ajeno.
--
-- Devuelve cuántas borró, para que la app pueda decirlo si algún día conviene mostrarlo.
create or replace function limpiar_cartolas_vencidas()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_hogar uuid;
  v_borradas integer;
begin
  if auth.uid() is null then
    raise exception 'hay que tener la sesión abierta';
  end if;

  select household_id into v_hogar
    from household_members where user_id = auth.uid() limit 1;
  if v_hogar is null then
    return 0;
  end if;

  delete from cartolas_importadas
   where household_id = v_hogar
     and recibido_en < now() - interval '2 months';
  get diagnostics v_borradas = row_count;
  return coalesce(v_borradas, 0);
end;
$$;

-- revoke ... from public primero: PostgreSQL otorga EXECUTE sobre toda función nueva al rol
-- especial PUBLIC (que incluye a `anon`, el rol SIN sesión), así que el grant a
-- `authenticated` por sí solo NO cierra nada. Ver fix_permisos_publicos.sql.
revoke execute on function limpiar_cartolas_vencidas() from public;
grant  execute on function limpiar_cartolas_vencidas() to authenticated;

-- ============================ VERIFICACIÓN ============================
-- (A) El trigger quedó puesto: 1 fila, on_cartola_importada.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'cartolas_importadas'::regclass and not tgisinternal;

-- (B) Qué queda guardado y cuánto pesa. Nada debería tener más de 2 meses.
select id, nombre_archivo, recibido_en, procesado,
       pg_size_pretty(length(contenido)::bigint) as peso
from cartolas_importadas order by recibido_en desc;

-- (C) `limpiar_cartolas_vencidas` no debe tener una entrada `=X/` (esa es PUBLIC).
select p.proname, array_to_string(p.proacl, '  |  ') as permisos
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('limpiar_cartolas_vencidas','limpiar_cartolas_al_insertar');
