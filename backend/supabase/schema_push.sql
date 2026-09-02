-- Pitucas sin lucas — agregado: notificaciones push reales (nueva transacción importada,
-- alerta de presupuesto al 80/90/100%).
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- Es un AGREGADO a schema.sql + schema_importar_correo.sql (que ya corriste) — no los
-- reemplaza, y es seguro correrlo una sola vez sobre el proyecto que ya tienes andando.
--
-- Qué resuelve: guarda a qué "suscripciones push" (un dato que el navegador genera cuando
-- activas notificaciones en la app, distinto por cada celular/computador donde la instales)
-- hay que mandarle avisos cuando pasa algo. El envío en sí NO ocurre acá — lo hace el
-- Cloudflare Worker (cloudflare-worker/worker.js), que llama a las dos funciones de abajo
-- para saber a quién avisar. Este archivo es el que le da esos datos.
--
-- Quién puede escribir/leer qué:
--  - Guardar o borrar TU PROPIA suscripción (cuando activas/desactivas notificaciones en la
--    app): lo hace la app mientras tienes sesión iniciada, protegido por RLS normal, igual
--    que el resto de tus datos.
--  - Leer TODAS las suscripciones de un hogar para mandar el push, y borrar una que el
--    navegador ya dio de baja: eso lo hace el Worker, que NUNCA tiene tu sesión — se valida
--    con el mismo "código de importación" (import_token) que ya usa el import por correo.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,           -- para poder mostrarte algo como "Chrome en Android" en la lista de dispositivos
  created_at timestamptz not null default now(),
  unique (household_id, endpoint)
);

alter table push_subscriptions enable row level security;

-- La propia app, con tu sesión, puede ver/agregar/borrar las suscripciones de tu hogar.
create policy "ver mis suscripciones push" on push_subscriptions
  for select using (is_household_member(household_id));
create policy "agregar mis suscripciones push" on push_subscriptions
  for insert with check (is_household_member(household_id));
create policy "borrar mis suscripciones push" on push_subscriptions
  for delete using (is_household_member(household_id));

grant select, insert, delete on push_subscriptions to authenticated;

-- ---------- las 2 puertas de entrada para el Worker (sin sesión, solo con import_token) ----------
-- security definer + verificación manual del token: mismo patrón que importar_transaccion()
-- en schema_importar_correo.sql. El Worker llama estas 2 funciones vía POST a
-- /rest/v1/rpc/<nombre> usando solo el anon key — la única verificación de "tienes permiso"
-- es que el import_token calce con el del hogar.

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

-- anon: así llega el Worker (sin sesión de usuario, solo con el anon key).
grant execute on function obtener_suscripciones_push(uuid, uuid) to anon, authenticated;
grant execute on function eliminar_suscripcion_push(uuid, uuid, text) to anon, authenticated;
