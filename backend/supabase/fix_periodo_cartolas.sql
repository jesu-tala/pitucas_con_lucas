-- Pitucas sin lucas — guardar de qué período es cada cartola
-- ------------------------------------------------------------------------------
-- Cómo se usa: Supabase > tu proyecto > SQL Editor > pega este archivo completo > Run.
-- No borra ni modifica nada: agrega dos columnas que empiezan vacías y se van llenando solas.
--
-- ============================ EL PROBLEMA ============================
--
-- La lista de cartolas mostraba solo cuándo LLEGARON por correo ("Llegó por correo el 4 de
-- septiembre"), que no es lo que uno necesita saber para elegir cuál abrir. Lo que importa es
-- qué período cubre, y eso no es lo mismo: la cartola que llega en septiembre cubre agosto, y
-- si llegan dos el mismo mes (la de la cuenta y la de la tarjeta) la fecha de llegada no las
-- distingue en nada.
--
-- El período está adentro del PDF, y el PDF viene con clave del banco, así que no se puede
-- saber hasta que alguien lo abre con su clave. Por eso estas columnas empiezan en null: no se
-- puede rellenar hacia atrás, y prometer un período que no se conoce sería peor que no
-- mostrarlo. La app las completa la primera vez que se abre cada cartola, en el mismo UPDATE
-- que ya hacía para marcarla como procesada, y mientras tanto muestra una estimación
-- claramente marcada como tal.
alter table cartolas_importadas add column if not exists periodo_desde date;
alter table cartolas_importadas add column if not exists periodo_hasta date;

-- La app escribe estas dos columnas al abrir una cartola, así que `authenticated` necesita
-- permiso sobre ellas. fix_grupos_columnas_protegidas.sql estableció el criterio de otorgar
-- UPDATE por columna en vez de por tabla; acá se sigue el mismo, sumando solo estas dos a las
-- que ya podía escribir.
--
-- Qué NO se otorga, a propósito: `contenido` (el PDF en sí), `household_id` (mover una cartola
-- a otro hogar) y `fuente_msg_id` (la clave que evita duplicados si el script corre dos veces).
revoke update on cartolas_importadas from authenticated;
grant update (procesado, periodo_desde, periodo_hasta) on cartolas_importadas to authenticated;

-- ============================ VERIFICACIÓN ============================
-- (A) Las columnas quedaron puestas.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'cartolas_importadas' and column_name like 'periodo%';

-- (B) Qué columnas puede escribir `authenticated`. Deben ser EXACTAMENTE tres:
--     periodo_desde, periodo_hasta, procesado. Si aparece `contenido`, `household_id` o
--     `fuente_msg_id`, algo no se aplicó.
select column_name
from information_schema.column_privileges
where grantee = 'authenticated' and privilege_type = 'UPDATE'
  and table_name = 'cartolas_importadas'
order by column_name;

-- (C) Tus cartolas y su período (null en las que todavía no has abierto).
select nombre_archivo, tipo, recibido_en::date as llego, periodo_desde, periodo_hasta, procesado
from cartolas_importadas order by recibido_en desc;
