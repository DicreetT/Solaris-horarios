-- 1. Ver todos los triggers en la tabla 'todos'
-- Esto nos dirá si todavía hay un trigger "fantasma"
SELECT 
    trigger_name, 
    event_manipulation, 
    action_statement, 
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'todos';

-- 2. Ver la definición de la función actual
-- Busca 'unnest' en la salida para confirmar que es la versión antigua
SELECT 
    routine_name, 
    routine_definition
FROM information_schema.routines
WHERE routine_name = 'notify_push_on_todo_change'
AND routine_schema = 'public';
