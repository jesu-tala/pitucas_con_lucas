-- Pitucas sin lucas — agregado: gastos compartidos (estilo Tricount)
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- Es un AGREGADO a schema.sql (y a los demás schema_*.sql) que ya corriste — no reemplaza
-- nada, y es seguro correrlo una sola vez sobre el proyecto que ya tienes andando.
--
-- Diseño en una frase: un grupo (pareja, familia, roomies, un viaje) junta participantes
-- que pueden ser de CUALQUIER cuenta/hogar de la app, o incluso gente sin cuenta (solo
-- nombre, administrada por otro miembro) — por eso esto vive en tablas propias, fuera del
-- blob app_state (que es privado por hogar y no tiene forma de cruzar hogares distintos).
--
-- "Mi parte" de un gasto que registró otra persona nunca se guarda en tu app_state: la app
-- la recalcula en el momento desde estas tablas (ver sincronizarGastosCompartidos() en
-- app.ts) y la agrega a tu TX en memoria marcada compartidoAjeno:true — así nunca puede
-- quedar desincronizada ni duplicada si el otro edita o borra el gasto original.

-- ============ Grupos y participantes ============

create table grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  icono text not null default '👥',
  creado_por uuid not null references auth.users(id),
  invite_code uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table grupo_participantes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- null = sin cuenta, lo administra otro miembro
  nombre text not null,
  color text not null default 'lavender',
  created_at timestamptz not null default now(),
  unique (grupo_id, user_id)
);

-- ¿el usuario de la sesión es participante (con cuenta) de este grupo? — mismo patrón que
-- is_household_member() en schema.sql: security definer para evitar la referencia circular
-- que se daría si las políticas de grupo_participantes intentaran leerse a sí mismas.
create or replace function is_grupo_member(gid uuid)
returns boolean
language sql security definer set search_path = public as $$
  select exists(
    select 1 from grupo_participantes
    where grupo_id = gid and user_id = auth.uid()
  );
$$;

-- Al crear un grupo, quien lo crea queda adentro automático — mismo problema de "huevo y
-- gallina" que household_members / handle_new_user() en schema.sql: sin esto, la política
-- de insert de grupo_participantes de más abajo no dejaría crear la primera fila de un
-- grupo nuevo (todavía nadie es miembro).
create or replace function handle_new_grupo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into grupo_participantes (grupo_id, user_id, nombre) values (new.id, new.creado_por, 'Yo');
  return new;
end;
$$;

create trigger on_grupo_created
  after insert on grupos
  for each row execute function handle_new_grupo();

alter table grupos enable row level security;
alter table grupo_participantes enable row level security;

create policy "ver mis grupos" on grupos
  for select using (is_grupo_member(id));
create policy "crear grupo" on grupos
  for insert with check (creado_por = auth.uid());
create policy "editar mi grupo" on grupos
  for update using (is_grupo_member(id));
-- Solo quien creó el grupo puede eliminarlo (no cualquier miembro): borrarlo se lleva en
-- cascada todos sus gastos/saldos/participantes para todo el mundo, así que se restringe más
-- que "editar", que sí permite a cualquier miembro.
create policy "eliminar mi grupo" on grupos
  for delete using (creado_por = auth.uid());

create policy "ver participantes de mis grupos" on grupo_participantes
  for select using (is_grupo_member(grupo_id));
create policy "agregar participante a mi grupo" on grupo_participantes
  for insert with check (is_grupo_member(grupo_id));
create policy "editar participante de mi grupo" on grupo_participantes
  for update using (is_grupo_member(grupo_id));

-- Unirse a un grupo con el código de invitación — mismo patrón que importar_transaccion()
-- en schema_importar_correo.sql: security definer + verificación manual del código, porque
-- quien llama todavía no es miembro (no puede pasar por la política normal de insert). Solo
-- pide el código (no el id del grupo por separado): invite_code ya es un uuid al azar, así que
-- alcanza por sí solo para identificar el grupo -- un campo menos que pegar en el formulario.
create or replace function unirse_a_grupo(p_invite_code uuid, p_nombre text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_grupo_id uuid;
begin
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

grant execute on function unirse_a_grupo(uuid, text) to authenticated;

-- ============ Los gastos compartidos en sí ============

create table gastos_compartidos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  descripcion text not null,
  categoria_origen text,             -- nombre+emoji de la categoría de quien registra (texto libre,
                                      -- no un id: las categorías son de la taxonomía de cada usuaria)
  monto numeric not null check (monto > 0),
  fecha date not null,
  pagado_por uuid not null references grupo_participantes(id),
  registrado_por uuid not null references auth.users(id),
  division_tipo text not null default 'iguales' check (division_tipo in ('iguales','montos','pct')),
  tx_origen_id text,                 -- id local (string) de la transacción de quien registró
  created_at timestamptz not null default now()
);

create table gasto_reparto (
  id uuid primary key default gen_random_uuid(),
  gasto_compartido_id uuid not null references gastos_compartidos(id) on delete cascade,
  participante_id uuid not null references grupo_participantes(id) on delete cascade,
  monto numeric not null check (monto >= 0),
  unique (gasto_compartido_id, participante_id)
);

-- Solo un registro contable de "ya nos pusimos al día" — a propósito NO crea ninguna
-- transacción real: la plata que de verdad se transfiere debería llegar sola a la cartola/
-- correo del banco y subirse por los flujos normales de importación de la app (así se pidió
-- explícitamente: nada de transacciones forzadas acá).
create table saldos_pagados (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  de_participante uuid not null references grupo_participantes(id),
  a_participante uuid not null references grupo_participantes(id),
  monto numeric not null check (monto > 0),
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

-- Mapeo aprendido "categoría de esa persona -> mi categoría", escopado por participante
-- (de_participante) y no solo por nombre de categoría: así "Otros" de tu pareja y "Otros"
-- de tu roomie pueden mapear cada uno a una categoría tuya distinta.
create table mapeo_categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  de_participante uuid not null references grupo_participantes(id),
  categoria_ajena text not null,
  categoria_propia text not null,
  created_at timestamptz not null default now(),
  unique (user_id, de_participante, categoria_ajena)
);

alter table gastos_compartidos enable row level security;
alter table gasto_reparto enable row level security;
alter table saldos_pagados enable row level security;
alter table mapeo_categorias enable row level security;

create policy "ver gastos de mis grupos" on gastos_compartidos
  for select using (is_grupo_member(grupo_id));
create policy "crear gasto en mi grupo" on gastos_compartidos
  for insert with check (is_grupo_member(grupo_id) and registrado_por = auth.uid());
create policy "editar gasto de mi grupo" on gastos_compartidos
  for update using (is_grupo_member(grupo_id));
create policy "borrar gasto de mi grupo" on gastos_compartidos
  for delete using (is_grupo_member(grupo_id));

create policy "ver repartos de mis grupos" on gasto_reparto
  for select using (exists(
    select 1 from gastos_compartidos g where g.id = gasto_compartido_id and is_grupo_member(g.grupo_id)
  ));
create policy "crear repartos de mi grupo" on gasto_reparto
  for insert with check (exists(
    select 1 from gastos_compartidos g where g.id = gasto_compartido_id and is_grupo_member(g.grupo_id)
  ));
create policy "editar repartos de mi grupo" on gasto_reparto
  for update using (exists(
    select 1 from gastos_compartidos g where g.id = gasto_compartido_id and is_grupo_member(g.grupo_id)
  ));
create policy "borrar repartos de mi grupo" on gasto_reparto
  for delete using (exists(
    select 1 from gastos_compartidos g where g.id = gasto_compartido_id and is_grupo_member(g.grupo_id)
  ));

create policy "ver saldos de mis grupos" on saldos_pagados
  for select using (is_grupo_member(grupo_id));
create policy "crear saldo en mi grupo" on saldos_pagados
  for insert with check (is_grupo_member(grupo_id));

create policy "ver mi propio mapeo" on mapeo_categorias
  for select using (user_id = auth.uid());
create policy "crear mi propio mapeo" on mapeo_categorias
  for insert with check (user_id = auth.uid());
create policy "actualizar mi propio mapeo" on mapeo_categorias
  for update using (user_id = auth.uid());

grant select, insert, update, delete on grupos to authenticated;
grant select, insert, update on grupo_participantes to authenticated;
grant select, insert, update, delete on gastos_compartidos to authenticated;
grant select, insert, update, delete on gasto_reparto to authenticated;
grant select, insert on saldos_pagados to authenticated;
grant select, insert, update on mapeo_categorias to authenticated;

-- ---------- sincronización en vivo entre miembros del grupo ----------
-- Si tu proyecto ya tiene la publicación "supabase_realtime" (la trae por defecto todo
-- proyecto Supabase), esto agrega estas tablas para que los cambios de un miembro le
-- lleguen a los demás sin que tengan que recargar la app.
alter publication supabase_realtime add table grupos, grupo_participantes, gastos_compartidos, gasto_reparto, saldos_pagados;
