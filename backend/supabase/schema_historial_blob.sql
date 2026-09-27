-- Pitucas sin lucas — historial del blob: poder volver atrás si los datos se corrompen
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- Es seguro correrlo las veces que quieras: no borra ni modifica ningún dato existente.
--
-- ============================ EL PROBLEMA ============================
--
-- app_state es UNA fila por hogar y se sobrescribe entera en cada guardado
-- (src/supabase.ts, writeStateToSupabase: `.update({data: ...})`). No hay historial de
-- ninguna clase. Si los datos se corrompen -- un borrado en masa sin querer, una
-- importación que pisa lo que no debía, un bug -- lo único que salva a la usuaria es haber
-- bajado el JSON a mano, y ese respaldo es manual, avisa recién a los 7 días, y la propia
-- pantalla dice que no se puede volver a importar. O sea: hoy no hay vuelta atrás.
--
-- ============================ EL DISEÑO ============================
--
-- Un snapshot es la versión ANTERIOR del blob, guardada por un trigger justo antes de que
-- la nueva la pise. Que lo haga un trigger y no el cliente es a propósito: así queda
-- cubierta toda escritura, venga de la app, de una pestaña vieja o de un curl a mano, y el
-- cliente no tiene que mandar el blob dos veces ni acordarse de nada.
--
-- Dos decisiones que valen la pena explicar:
--
-- 1. Freno de 10 minutos. El guardado de la app es automático y muy seguido (se dispara con
--    cada repintado que cambió datos de verdad), así que sin freno una tarde de uso normal
--    generaría cientos de snapshots casi idénticos y taparía los que importan. Si el
--    snapshot más nuevo del hogar tiene menos de 10 minutos, este guardado no crea otro.
--    Lo que se pierde es granularidad de minutos; lo que se protege es "volver a como
--    estaba antes de que metiera la pata", que se mide en horas o días.
--
-- 2. Poda en dos niveles: los 30 más nuevos, MÁS el más nuevo de cada uno de los últimos
--    30 días. Con solo "los 30 más nuevos", un día de uso intenso (30 snapshots en 5 horas)
--    borraría todo el historial de la semana anterior, que es justo el que se necesita
--    cuando alguien nota el problema tarde. Con los dos niveles hay detalle fino en lo
--    reciente y cobertura larga hacia atrás, con un techo acotado de filas.

create table if not exists app_state_historial (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  data jsonb not null,
  -- Cuándo se tomó el snapshot, es decir cuándo esa versión DEJÓ de ser la vigente.
  snapshot_at timestamptz not null default now(),
  -- Quién hizo la escritura que la reemplazó (puede ser null: el import por correo y la
  -- cartola escriben sin sesión, solo con el import_token).
  reemplazada_por uuid references auth.users(id),
  -- Resumen calculado al guardar. Existe para que la app pueda listar el historial sin
  -- bajarse cada blob completo (30 snapshots de 300 KB serían 9 MB para dibujar una lista),
  -- y porque es justo el dato que permite elegir bien: si hoy tienes 12 transacciones y el
  -- snapshot de anteayer tenía 412, ese número es el que te dice cuál restaurar.
  n_transacciones integer not null default 0,
  peso_bytes integer not null default 0
);

-- El historial siempre se consulta "los del hogar, del más nuevo al más viejo", y la poda
-- hace exactamente la misma pregunta -- sin este índice las dos hacen scan completo.
create index if not exists app_state_historial_hogar_fecha
  on app_state_historial (household_id, snapshot_at desc);

-- ---------- el trigger que llena el historial ----------
create or replace function guardar_snapshot_app_state()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ultimo timestamptz;
begin
  -- Nada que archivar: es el primer guardado de una cuenta nueva (handle_new_user la crea
  -- con '{}') o la escritura no cambió el blob.
  if OLD.data is null or OLD.data = '{}'::jsonb or OLD.data = NEW.data then
    return NEW;
  end if;

  select max(snapshot_at) into v_ultimo
    from app_state_historial where household_id = OLD.household_id;

  -- El freno de 10 minutos descrito arriba.
  if v_ultimo is not null and v_ultimo > now() - interval '10 minutes' then
    return NEW;
  end if;

  insert into app_state_historial (household_id, data, reemplazada_por, n_transacciones, peso_bytes)
  values (OLD.household_id, OLD.data, NEW.updated_by,
          -- jsonb_array_length revienta si el valor no es un array, y un blob viejo o a medio
          -- migrar puede no tener la clave: se comprueba el tipo antes en vez de confiar.
          case when jsonb_typeof(OLD.data->'transacciones') = 'array'
               then jsonb_array_length(OLD.data->'transacciones') else 0 end,
          length(OLD.data::text));

  -- Poda en dos niveles. `keep` junta los dos conjuntos que se conservan; todo lo demás de
  -- ESTE hogar se borra (nunca se toca el historial de otro).
  with recientes as (
    select id from app_state_historial
     where household_id = OLD.household_id
     order by snapshot_at desc limit 30
  ),
  por_dia as (
    select distinct on (date_trunc('day', snapshot_at)) id
      from app_state_historial
     where household_id = OLD.household_id
       and snapshot_at > now() - interval '30 days'
     order by date_trunc('day', snapshot_at) desc, snapshot_at desc
  )
  delete from app_state_historial h
   where h.household_id = OLD.household_id
     and h.id not in (select id from recientes union select id from por_dia);

  return NEW;
end;
$$;

drop trigger if exists on_app_state_actualizado on app_state;
create trigger on_app_state_actualizado
  after update on app_state
  for each row execute function guardar_snapshot_app_state();

-- ---------- restaurar ----------
-- security definer porque tiene que escribir app_state sin depender de los permisos de
-- columna del rol authenticated, pero la membresía se verifica adentro, contra auth.uid():
-- el id del snapshot por sí solo NO alcanza para restaurar nada de un hogar ajeno.
--
-- Restaurar es en sí mismo un UPDATE de app_state, así que el trigger de arriba archiva
-- automáticamente el estado que había ANTES de restaurar -- deshacer una restauración
-- equivocada es simplemente restaurar el snapshot que quedó recién guardado.
create or replace function restaurar_snapshot(p_snapshot_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_hogar uuid;
  v_data jsonb;
  v_fecha timestamptz;
begin
  if auth.uid() is null then
    raise exception 'hay que tener la sesión abierta para restaurar';
  end if;

  select household_id, data, snapshot_at into v_hogar, v_data, v_fecha
    from app_state_historial where id = p_snapshot_id;
  if v_hogar is null then
    raise exception 'ese respaldo no existe';
  end if;
  -- El mismo chequeo que usan las políticas de RLS. Sin esto, cualquiera con una sesión
  -- válida podría restaurar el snapshot de otro hogar sobre el suyo, o peor, al revés.
  if not is_household_member(v_hogar) then
    raise exception 'ese respaldo no es de tu hogar';
  end if;

  update app_state
     set data = v_data,
         updated_at = now(),
         updated_by = auth.uid()
   where household_id = v_hogar;

  return v_fecha;
end;
$$;

-- ---------- seguridad ----------
alter table app_state_historial enable row level security;

-- Solo lectura, y solo del propio hogar. No hay política de insert/update/delete a
-- propósito: al historial lo escribe el trigger (security definer, corre como su dueño) y
-- lo borra la poda. Que la usuaria no pueda borrar sus propios snapshots es parte del
-- punto: un historial que se puede vaciar no protege de un borrado en masa.
drop policy if exists "ver el historial de mi hogar" on app_state_historial;
create policy "ver el historial de mi hogar" on app_state_historial
  for select using (is_household_member(household_id));

grant select on app_state_historial to authenticated;

-- revoke ... from public primero: PostgreSQL otorga EXECUTE sobre toda función nueva al rol
-- especial PUBLIC (que incluye a `anon`, el rol SIN sesión), así que el grant a
-- `authenticated` por sí solo NO cierra nada. Ver fix_permisos_publicos.sql.
revoke execute on function restaurar_snapshot(uuid) from public;
grant  execute on function restaurar_snapshot(uuid) to authenticated;

-- ============================ VERIFICACIÓN ============================
-- (A) El trigger quedó puesto: 1 fila, on_app_state_actualizado.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'app_state'::regclass and not tgisinternal;

-- (B) `anon` no debe aparecer, y `restaurar_snapshot` no debe tener una entrada `=X/`.
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'app_state_historial' order by grantee, privilege_type;

-- (C) Tus snapshots (al principio vacío; aparece uno recién al segundo guardado).
--     `pg_size_pretty` para ver cuánto pesa el historial de verdad, no en teoría.
select snapshot_at, n_transacciones, pg_size_pretty(peso_bytes::bigint) as peso
  from app_state_historial order by snapshot_at desc;
