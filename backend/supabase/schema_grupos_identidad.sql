-- Pitucas sin lucas — agregado: identidad de participante al unirse a un grupo
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- Es un AGREGADO a schema_gastos_compartidos.sql (que ya tienes que haber corrido antes) —
-- no reemplaza ni recrea ninguna tabla, seguro correrlo una sola vez sobre el proyecto que
-- ya tienes andando.
--
-- Bug que arregla: unirse_a_grupo() (schema_gastos_compartidos.sql) siempre crea un
-- participante NUEVO con el nombre que se escriba, sin mostrar antes quiénes ya están en el
-- grupo -- si Fran ya había agregado a "Pancho" como participante sin cuenta y el Pancho real
-- se une más tarde con el código, termina como un "Pancho" duplicado en vez de quedar
-- vinculado al que ya existía (y a su historial de gastos ya repartidos con él).
--
-- Agrega dos funciones RPC (mismo patrón security definer que unirse_a_grupo: quien llama
-- todavía no es miembro del grupo, así que no puede pasar por las políticas normales de
-- select/update de grupo_participantes):
--   · roster_de_grupo(invite_code) — lista los participantes del grupo (nombre + si ya está
--     reclamado por alguien), para elegir "cuál eres tú" antes de unirte.
--   · reclamar_participante(participante_id, invite_code) — vincula tu cuenta a un
--     participante YA EXISTENTE sin cuenta (en vez de crear uno nuevo). Rechaza reclamar uno
--     ya reclamado, o si ya eres parte del grupo con otro participante.
-- unirse_a_grupo() (sin tocar) sigue siendo el camino para "no estoy en la lista, agrégame".

create or replace function roster_de_grupo(p_invite_code uuid)
returns table(
  grupo_id uuid, grupo_nombre text, grupo_icono text,
  participante_id uuid, participante_nombre text, reclamado boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_grupo_id uuid;
begin
  select id into v_grupo_id from grupos where invite_code = p_invite_code;
  if v_grupo_id is null then
    raise exception 'código de invitación inválido';
  end if;
  return query
    select g.id, g.nombre, g.icono, gp.id, gp.nombre, (gp.user_id is not null)
    from grupos g
    join grupo_participantes gp on gp.grupo_id = g.id
    where g.id = v_grupo_id
    order by gp.created_at;
end;
$$;

grant execute on function roster_de_grupo(uuid) to authenticated;

create or replace function reclamar_participante(p_participante_id uuid, p_invite_code uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_grupo_id uuid;
  v_user_id uuid;
begin
  select id into v_grupo_id from grupos where invite_code = p_invite_code;
  if v_grupo_id is null then
    raise exception 'código de invitación inválido';
  end if;

  select user_id into v_user_id from grupo_participantes
    where id = p_participante_id and grupo_id = v_grupo_id;
  if not found then
    raise exception 'ese participante no pertenece a este grupo';
  end if;
  if v_user_id is not null then
    raise exception 'ese participante ya fue reclamado por otra persona';
  end if;
  if exists(select 1 from grupo_participantes where grupo_id = v_grupo_id and user_id = auth.uid()) then
    raise exception 'ya eres parte de este grupo con otro participante';
  end if;

  update grupo_participantes set user_id = auth.uid() where id = p_participante_id;
  return v_grupo_id;
end;
$$;

grant execute on function reclamar_participante(uuid, uuid) to authenticated;
