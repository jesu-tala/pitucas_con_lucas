-- Pitucas sin lucas — techo al tamaño del blob de cada hogar
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- No borra ni modifica ningún dato: solo agrega un trigger que revisa las escrituras
-- FUTURAS. Un blob que hoy ya estuviera por encima del techo no se toca ni se rechaza
-- retroactivamente; simplemente no va a poder crecer más.
--
-- ============================ EL PROBLEMA ============================
--
-- app_state.data no tenía ningún límite. Con la app abierta al público, cualquiera que se
-- registre puede escribir ahí lo que quiera vía la API REST --no está obligado a usar la
-- interfaz-- y llenar la base sin tope. No hace falta mala fe: basta un bug en un import que
-- se repita en un loop.
--
-- Y ahora pesa más que antes, porque schema_historial_blob.sql guarda hasta 60 versiones
-- anteriores por hogar. Cada byte del blob se multiplica por esas copias, así que el techo
-- no protege solo la fila viva: protege el historial entero.
--
-- ============================ EL NÚMERO ============================
--
-- 2 MB reales (bytes UTF-8). Una transacción pesa del orden de 300 bytes en JSON, así que son varios miles de
-- transacciones -- años de uso normal, sin acercarse. Se eligió un techo que nadie legítimo
-- va a tocar en vez de uno ajustado, justamente para que si alguna vez se alcanza sea una
-- señal real de que algo anda mal y no una molestia.
--
-- ============================ EL MENSAJE ============================
--
-- Un trigger y no un `check` constraint, por dos razones. Un check valida las filas que YA
-- existen al crearse, así que si algún blob estuviera por encima el ALTER TABLE fallaría y
-- dejaría el arreglo sin aplicar. Y el error de un check es ilegible para quien lo recibe
-- ("violates check constraint app_state_tamano"); un trigger puede decir qué pasó, cuánto
-- pesa y cuánto se permite, que es lo que la app muestra en pantalla.
create or replace function revisar_tamano_app_state()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_peso integer;
  v_techo integer := 2097152;  -- 2 MB. Tiene que decir lo mismo que MAX_BYTES_BLOB en src/supabase.ts.
begin
  -- octet_length y no length: length() cuenta CARACTERES, y el blob está lleno de acentos y
  -- eñes que ocupan dos bytes en UTF-8. Con length() el techo real sería mayor que el
  -- anunciado, y distinto según cuántas tildes tengan los nombres de los comercios.
  v_peso := octet_length(NEW.data::text);
  if v_peso > v_techo then
    raise exception 'El archivo de tus datos pesa % MB y el máximo es % MB.',
      round(v_peso / 1048576.0, 2), round(v_techo / 1048576.0, 2)
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_app_state_tamano on app_state;
create trigger on_app_state_tamano
  before insert or update on app_state
  for each row execute function revisar_tamano_app_state();

-- ============================ VERIFICACIÓN ============================
-- (A) El trigger quedó puesto. Deben aparecer DOS: on_app_state_tamano (este, BEFORE) y
--     on_app_state_actualizado (el del historial, AFTER). No se pisan: el de tamaño corre
--     primero y corta la escritura antes de que el otro archive nada.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'app_state'::regclass and not tgisinternal
 order by tgname;

-- (B) Cuánto pesa hoy tu blob, y cuánto pesa su historial. Si el historial creciera
--     demasiado, lo que se ajusta es la poda en schema_historial_blob.sql, no este techo.
select pg_size_pretty(octet_length(data::text)::bigint) as blob_actual from app_state;
select count(*) as versiones, pg_size_pretty(sum(peso_bytes)::bigint) as historial_total
  from app_state_historial;
