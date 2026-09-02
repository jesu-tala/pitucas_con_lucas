-- Plata Clara — esquema de base de datos para Supabase
-- ------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- Es seguro correrlo una sola vez en un proyecto nuevo y vacío.
--
-- Diseño en una frase: cada usuario pertenece a un "hogar" (household). Hoy cada hogar
-- tiene 1 solo miembro (tú, o cada amigo, cada uno con el suyo) — pero la tabla ya está
-- lista para el día de mañana en que quieras compartir un hogar con tu pareja o tus
-- roomies: agregar a alguien más a tu household_members ya los deja viendo la misma plata,
-- sin tocar el esquema de nuevo.
--
-- Los datos de la app (transacciones, categorías, metas, etc.) se guardan como UN bloque
-- JSON por hogar — el mismo formato que ya usa el botón "Respaldo en JSON" de la app. Es
-- la forma más simple y segura de partir: todo un hogar (hoy: 1 persona) lee y escribe su
-- propio bloque, nadie más puede tocarlo, y no hay que rediseñar cien tablas para arrancar.
-- Si más adelante el uso compartido en tiempo real se vuelve pesado (dos personas editando
-- el mismo minuto), ahí normalizamos a tablas por transacción — pero no hace falta hoy.

create extension if not exists "pgcrypto";

-- ---------- hogares ----------
create table households (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Mi hogar',
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'owner' check (rol in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ¿El usuario que hizo la petición pertenece a este hogar? — la usan las políticas de abajo.
-- security definer: puede leer household_members aunque el propio RLS de esa tabla
-- normalmente se lo impidiera (evita una referencia circular al armar las políticas).
create or replace function is_household_member(hid uuid)
returns boolean
language sql security definer set search_path = public as $$
  select exists(
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- ---------- datos de la app: un bloque JSON por hogar ----------
create table app_state (
  household_id uuid primary key references households(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ---------- seguridad: RLS (nadie ve ni toca datos de un hogar al que no pertenece) ----------
alter table households enable row level security;
alter table household_members enable row level security;
alter table app_state enable row level security;

create policy "ver mi(s) hogar(es)" on households
  for select using (is_household_member(id));
create policy "actualizar mi(s) hogar(es)" on households
  for update using (is_household_member(id));

create policy "ver miembros de mi hogar" on household_members
  for select using (is_household_member(household_id));

create policy "leer los datos de mi hogar" on app_state
  for select using (is_household_member(household_id));
create policy "escribir los datos de mi hogar" on app_state
  for update using (is_household_member(household_id));
create policy "crear los datos de mi hogar" on app_state
  for insert with check (is_household_member(household_id));

-- ---------- al crear una cuenta nueva: se le arma su propio hogar automáticamente ----------
-- (security definer: corre con permisos de administrador porque el usuario recién se está
-- creando y todavía no tiene sesión activa para que el RLS de arriba lo dejara hacerlo solo)
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_household_id uuid;
begin
  insert into households (nombre) values ('Mi hogar') returning id into new_household_id;
  insert into household_members (household_id, user_id, rol) values (new_household_id, new.id, 'owner');
  insert into app_state (household_id, data) values (new_household_id, '{}'::jsonb);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- permisos explícitos (no dependen de "Automatically expose new tables") ----------
-- Si en el proyecto dejaste ese switch APAGADO (recomendado), esto asegura que estas 3
-- tablas igual queden accesibles para la Data API — a propósito, tabla por tabla, no por
-- default. Solo usuarios logueados (rol "authenticated"); nada aquí es visible sin sesión.
grant usage on schema public to authenticated;
grant select, update on households to authenticated;
grant select on household_members to authenticated;
grant select, insert, update on app_state to authenticated;

-- ---------- Fase 2 (a futuro, todavía no la construimos): invitar a alguien a tu hogar ----------
-- Cuando llegue el momento, esto se resuelve con una función que busque al usuario por
-- email y le agregue una fila en household_members al mismo household_id tuyo — ahí
-- Fran/tu pareja/tu roomie empiezan a ver y editar la misma plata que tú, sin migrar nada.
