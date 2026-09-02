-- Pitucas sin lucas — agregado: capturar automáticamente el correo de tu cartola/estado de
-- cuenta, para no tener que subirlo a mano cada mes en "Reconciliar con la cartola".
-- ---------------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run. Es
-- un AGREGADO a lo que ya corriste (schema.sql y schema_importar_correo.sql) — no los
-- reemplaza, y es seguro correrlo una sola vez sobre el proyecto que ya tienes andando.
--
-- Qué resuelve: el mismo Google Apps Script que ya lee tus correos bancarios va a buscar,
-- además, el correo mensual de "Cartola Cuenta Corriente" y "Estado de Cuenta Tarjeta de
-- Crédito", sacarle el PDF adjunto (que sigue viniendo con la clave puesta por el banco —
-- acá NUNCA se desencripta, ni se guarda esa clave en ninguna parte) y guardarlo acá. Tú lo
-- ves y lo usas desde Menú > "Reconciliar con la cartola" en la app: ahí se te ofrece
-- directo (sin tener que ir a buscar el correo tú misma), y recién ahí, en tu navegador, se
-- te pide la clave para abrirlo — la misma clave nunca pasa por nuestros servidores.
--
-- Por qué un PDF cifrado en una columna de la base y no un "archivo" en Supabase Storage:
-- porque así se reutiliza EXACTAMENTE el mismo mecanismo de seguridad que ya usas para
-- importar transacciones (import_token del hogar, verificado adentro de una función que
-- corre con permisos propios) en vez de tener que armar y probar un set de políticas
-- distinto para Storage. Son archivos chicos (cientos de KB) y de uno al mes por
-- cuenta/tarjeta, así que no hay problema de tamaño.

create table if not exists cartolas_importadas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  tipo text not null check (tipo in ('cuenta_corriente','tarjeta_nacional')),
  fuente_msg_id text not null,     -- id del correo de origen — evita duplicados si el script corre dos veces
  nombre_archivo text,
  contenido bytea not null,        -- el PDF tal cual llegó del banco — SIGUE cifrado con la clave del banco
  recibido_en timestamptz not null default now(),
  procesado boolean not null default false,
  unique (household_id, fuente_msg_id)
);

alter table cartolas_importadas enable row level security;

create policy "ver mis cartolas importadas" on cartolas_importadas
  for select using (is_household_member(household_id));
create policy "marcar como procesada una cartola mía" on cartolas_importadas
  for update using (is_household_member(household_id));
create policy "borrar una cartola mía ya procesada" on cartolas_importadas
  for delete using (is_household_member(household_id));

grant select, update, delete on cartolas_importadas to authenticated;

-- ---------- la única puerta de entrada para el script de Google ----------
-- Mismo patrón que importar_transaccion en schema_importar_correo.sql: security definer,
-- así puede insertar aunque quien llama no tenga sesión — la única verificación de "tienes
-- permiso" es que el import_token calce con el del hogar.
create or replace function importar_cartola(
  p_household_id uuid,
  p_token uuid,
  p_tipo text,
  p_fuente_msg_id text,
  p_nombre_archivo text,
  p_contenido_base64 text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from households where id = p_household_id and import_token = p_token
  ) then
    raise exception 'código de importación inválido para ese hogar';
  end if;

  insert into cartolas_importadas
    (household_id, tipo, fuente_msg_id, nombre_archivo, contenido)
  values
    (p_household_id, p_tipo, p_fuente_msg_id, p_nombre_archivo, decode(p_contenido_base64, 'base64'))
  on conflict (household_id, fuente_msg_id) do nothing;
end;
$$;

grant execute on function importar_cartola(uuid, uuid, text, text, text, text) to anon, authenticated;
