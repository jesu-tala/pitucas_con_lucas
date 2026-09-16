-- Pitucas sin lucas — hace atómico el "reclamar un participante" al unirse a un grupo
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
--
-- QUÉ TOCA ESTE ARCHIVO: reemplaza el cuerpo de UNA función (reclamar_participante). No crea,
-- borra ni modifica ningún dato, ninguna tabla, ninguna política ni ningún permiso. Es seguro
-- correrlo las veces que quieras.
--
-- ============================ EL PROBLEMA ============================
--
-- La versión de schema_grupos_identidad.sql comprueba y después actúa, en dos pasos separados:
--
--     select user_id into v_user_id from grupo_participantes where id = ... ;
--     if v_user_id is not null then raise exception 'ya fue reclamado'; end if;
--     ...
--     update grupo_participantes set user_id = auth.uid() where id = p_participante_id;
--
-- Entre el `select` y el `update` hay una ventana: si dos personas reclaman el MISMO participante
-- sin cuenta casi al mismo tiempo, las dos pueden ver `user_id` en null y las dos pasar el
-- chequeo. La segunda termina pisando a la primera en silencio, sin error -- el que "gana" es
-- simplemente quien commitea último.
--
-- Es poco probable (hace falta coincidencia de segundos) y no da acceso a datos ajenos: quien
-- reclama tiene el código de invitación igual. Pero deja a alguien adentro del grupo creyendo que
-- es un participante que en realidad quedó tomado por otra persona, con el historial de gastos de
-- esa otra persona asociado -- justo lo que la función existe para evitar.
--
-- ============================ EL ARREGLO ============================
--
-- Se reclama con un solo UPDATE condicional (`... and user_id is null`), que es atómico: la base
-- resuelve quién gana. Si no afectó ninguna fila, recién ahí se averigua POR QUÉ, para poder dar
-- el mismo mensaje claro de antes. Diagnosticar después no tiene carrera: a esa altura ya no se
-- va a escribir nada.
--
-- El chequeo de "ya eres parte de este grupo con otro participante" se mantiene antes, solo para
-- dar un mensaje entendible -- la garantía de verdad la da el índice unique (grupo_id, user_id)
-- que la tabla ya tiene, que es el que no se puede burlar por una carrera.

create or replace function reclamar_participante(p_participante_id uuid, p_invite_code uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_grupo_id uuid;
  v_existe boolean;
  v_user_id uuid;
begin
  select id into v_grupo_id from grupos where invite_code = p_invite_code;
  if v_grupo_id is null then
    raise exception 'código de invitación inválido';
  end if;

  -- Mensaje amable para el caso más común; la garantía real es el unique (grupo_id, user_id).
  if exists(select 1 from grupo_participantes where grupo_id = v_grupo_id and user_id = auth.uid()) then
    raise exception 'ya eres parte de este grupo con otro participante';
  end if;

  -- El reclamo en sí: un único UPDATE condicional. Dos personas reclamando a la vez ya no pueden
  -- pasar las dos -- la que llega segunda no afecta ninguna fila.
  update grupo_participantes
     set user_id = auth.uid()
   where id = p_participante_id
     and grupo_id = v_grupo_id
     and user_id is null;

  if not found then
    -- No se reclamó nada: recién acá se averigua el motivo, solo para el mensaje.
    select (gp.id is not null), gp.user_id into v_existe, v_user_id
      from grupo_participantes gp
     where gp.id = p_participante_id and gp.grupo_id = v_grupo_id;

    if v_existe is null or v_existe = false then
      raise exception 'ese participante no pertenece a este grupo';
    elsif v_user_id is not null then
      raise exception 'ese participante ya fue reclamado por otra persona';
    else
      raise exception 'no se pudo reclamar ese participante';
    end if;
  end if;

  return v_grupo_id;
end;
$$;

grant execute on function reclamar_participante(uuid, uuid) to authenticated;

-- ============================ VERIFICACIÓN ============================
-- Debería devolver 1 fila, y su definición contener "user_id is null" (la condición atómica).
select routine_name,
       position('user_id is null' in routine_definition) > 0 as quedo_atomica
from information_schema.routines
where routine_name = 'reclamar_participante';
