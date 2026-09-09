-- Pitucas sin lucas — agregado: lector de boletas (OCR de la foto de una boleta)
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- Es un AGREGADO al esquema original (schema.sql) que ya corriste — no lo reemplaza,
-- y es seguro correrlo una sola vez sobre el proyecto que ya tienes andando.
--
-- Qué resuelve: el Cloudflare Worker que lee la boleta (cloudflare-worker-ocr/worker.js)
-- recibe la foto directo del celular, sin que la persona haya iniciado sesión ahí (es
-- un Worker, no la app) -- necesita una forma barata de confirmar "esta persona sí
-- pertenece a este hogar" antes de gastar una llamada a Google Document AI. Reutiliza el
-- mismo import_token que ya usan el importador de correo y las notificaciones push (ver
-- schema_importar_correo.sql) en vez de inventar un secreto nuevo.

create or replace function verificar_household(p_household_id uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return exists (
    select 1 from households where id = p_household_id and import_token = p_token
  );
end;
$$;

-- anon: así llega el Worker (sin sesión de usuario, solo con el anon key).
grant execute on function verificar_household(uuid, uuid) to anon, authenticated;
