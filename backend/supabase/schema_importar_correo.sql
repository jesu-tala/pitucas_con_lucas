-- Plata Clara — agregado: importar transacciones automáticamente desde tu correo
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- Es un AGREGADO al esquema original (schema.sql) que ya corriste — no lo reemplaza,
-- y es seguro correrlo una sola vez sobre el proyecto que ya tienes andando.
--
-- Qué resuelve: un Google Apps Script (vive en tu cuenta de Google, no en Supabase)
-- va a leer los correos de notificación de tu banco / Racional / etc., y por cada
-- transacción que encuentre, la manda para acá — pero NO directo a tus datos reales
-- (app_state), sino a una bandeja aparte de "importadas, pendientes de revisar". Así,
-- aunque tengas la app abierta en el celular justo en ese momento, nunca hay dos
-- procesos escribiendo el mismo bloque de datos a la vez (que sí sería un problema:
-- el que guarda último pisaría al otro). Tú revisas esa bandeja desde Menú y decides
-- cuáles agregar de verdad — recién ahí pasan a ser una transacción normal tuya.
--
-- Seguridad: el script de Google nunca inicia sesión como tú (no tiene tu contraseña).
-- En vez de eso, cada hogar tiene un "código de importación" propio (import_token) que
-- solo sirve para UNA cosa muy acotada: escribir en tu bandeja de importadas. No sirve
-- para leer ni cambiar nada más de tu cuenta, ni la de nadie más.

alter table households add column if not exists import_token uuid not null default gen_random_uuid();

create table if not exists transacciones_importadas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  fuente text not null,           -- de dónde salió, ej. 'gmail:banco_edwards_compra', 'gmail:racional'
  fuente_msg_id text,             -- id del correo de origen — evita duplicados si el script corre dos veces
  fecha date not null,
  hora text,
  comercio text not null,
  monto numeric not null,
  tipo text not null default 'gasto' check (tipo in ('gasto','ingreso','inversion')),
  medio_sugerido text,
  raw jsonb,                      -- el texto del correo original, por si algún día hay que revisar qué pasó
  procesado boolean not null default false,
  creado_en timestamptz not null default now(),
  unique (household_id, fuente, fuente_msg_id)
);

alter table transacciones_importadas enable row level security;

create policy "ver mis transacciones importadas" on transacciones_importadas
  for select using (is_household_member(household_id));
create policy "marcar como revisadas mis transacciones importadas" on transacciones_importadas
  for update using (is_household_member(household_id));

grant select, update on transacciones_importadas to authenticated;

-- ---------- la única puerta de entrada para el script de Google ----------
-- security definer: corre con permisos propios (como el trigger de más arriba), así que
-- puede insertar en transacciones_importadas aunque quien llama no tenga sesión — la única
-- verificación de "tienes permiso" es que el import_token calce con el del hogar. Se llama
-- desde Apps Script vía POST a /rest/v1/rpc/importar_transaccion usando solo el anon key.
create or replace function importar_transaccion(
  p_household_id uuid,
  p_token uuid,
  p_fuente text,
  p_fuente_msg_id text,
  p_fecha date,
  p_hora text,
  p_comercio text,
  p_monto numeric,
  p_tipo text,
  p_medio_sugerido text default null,
  p_raw jsonb default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from households where id = p_household_id and import_token = p_token
  ) then
    raise exception 'código de importación inválido para ese hogar';
  end if;

  insert into transacciones_importadas
    (household_id, fuente, fuente_msg_id, fecha, hora, comercio, monto, tipo, medio_sugerido, raw)
  values
    (p_household_id, p_fuente, p_fuente_msg_id, p_fecha, p_hora, p_comercio, p_monto, p_tipo, p_medio_sugerido, p_raw)
  on conflict (household_id, fuente, fuente_msg_id) do nothing;
end;
$$;

-- anon: así llega el script de Google (sin sesión de usuario, solo con el anon key).
-- authenticated: por si algún día la propia app quisiera llamarla directo (no lo hace hoy).
grant execute on function importar_transaccion(
  uuid, uuid, text, text, date, text, text, numeric, text, text, jsonb
) to anon, authenticated;

-- ---------- para encontrar tu household_id + import_token desde la propia app ----------
-- (no hace falta nada nuevo acá: la política "ver mi(s) hogar(es)" de schema.sql ya te deja
-- leer tu propia fila de households, columna import_token incluida — Menú > "Importar desde
-- tu correo" en la app se lo trae solo.)
