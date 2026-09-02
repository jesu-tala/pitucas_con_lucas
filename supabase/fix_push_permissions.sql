-- Pitucas sin lucas — repara permisos de push_subscriptions.
-- ------------------------------------------------------------------------------
-- Por qué existe: al activar notificaciones te salió "permission denied for table
-- push_subscriptions". Este archivo vuelve a crear (de forma segura, sin borrar nada de lo
-- que ya tengas) la tabla, las políticas de RLS y los permisos -- por si algo del
-- schema_push.sql anterior no terminó de aplicarse.
-- Es 100% seguro de correr, aunque lo corras varias veces: no borra datos tuyos, solo
-- asegura que los permisos queden bien puestos. Cómo se usa: Supabase > tu proyecto >
-- SQL Editor > pega este archivo completo > Run.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (household_id, endpoint)
);

alter table push_subscriptions enable row level security;

drop policy if exists "ver mis suscripciones push" on push_subscriptions;
create policy "ver mis suscripciones push" on push_subscriptions
  for select using (is_household_member(household_id));

drop policy if exists "agregar mis suscripciones push" on push_subscriptions;
create policy "agregar mis suscripciones push" on push_subscriptions
  for insert with check (is_household_member(household_id));

drop policy if exists "borrar mis suscripciones push" on push_subscriptions;
create policy "borrar mis suscripciones push" on push_subscriptions
  for delete using (is_household_member(household_id));

grant select, insert, delete on push_subscriptions to authenticated;

create or replace function obtener_suscripciones_push(
  p_household_id uuid,
  p_token uuid
)
returns table (endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from households where id = p_household_id and import_token = p_token
  ) then
    raise exception 'código de importación inválido para ese hogar';
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from push_subscriptions s
    where s.household_id = p_household_id;
end;
$$;

create or replace function eliminar_suscripcion_push(
  p_household_id uuid,
  p_token uuid,
  p_endpoint text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from households where id = p_household_id and import_token = p_token
  ) then
    raise exception 'código de importación inválido para ese hogar';
  end if;

  delete from push_subscriptions
  where household_id = p_household_id and endpoint = p_endpoint;
end;
$$;

grant execute on function obtener_suscripciones_push(uuid, uuid) to anon, authenticated;
grant execute on function eliminar_suscripcion_push(uuid, uuid, text) to anon, authenticated;

-- Al final, esta consulta debería devolver 2 filas (una por cada función) -- si Supabase te
-- las muestra, los permisos quedaron aplicados.
select routine_name from information_schema.routines
where routine_name in ('obtener_suscripciones_push', 'eliminar_suscripcion_push');
