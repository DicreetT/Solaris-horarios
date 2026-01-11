-- ########################################################
-- #  SOLUCIÓN NUCLEAR: LIMPIEZA TOTAL Y RE-CONFIGURACIÓN  #
-- ########################################################

-- 1. ELIMINAR TODO LO ANTERIOR (Sin errores)
DO $$
DECLARE
    trig_name RECORD;
BEGIN
    -- Borra CUALQUIER trigger que exista en la tabla todos
    FOR trig_name IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'todos') LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || trig_name.trigger_name || ' ON public.todos;';
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.notify_push_on_todo_change();

-- 2. CREAR LA FUNCIÓN CORREGIDA (Usa jsonb_array_elements_text)
CREATE OR REPLACE FUNCTION public.notify_push_on_todo_change()
RETURNS TRIGGER AS $$
DECLARE
  assigned_user_id_text TEXT;
  assigned_user_id UUID;
BEGIN
  -- Solo para inserciones
  IF (TG_OP = 'INSERT') AND NEW.assigned_to IS NOT NULL THEN
    FOR assigned_user_id_text IN 
      SELECT value FROM jsonb_array_elements_text(NEW.assigned_to) AS value
    LOOP
      BEGIN
        assigned_user_id := assigned_user_id_text::UUID;
        
        IF (assigned_user_id != NEW.created_by) THEN
          PERFORM net.http_post(
            url := 'https://pdtqiznizxatnyqomshb.supabase.co/functions/v1/send-push',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || 'TU_ANON_KEY_O_SERVICE_ROLE'
            ),
            body := jsonb_build_object(
              'user_id', assigned_user_id,
              'title', 'Nueva tarea asignada',
              'message', 'Se te ha asignado una nueva tarea: ' || NEW.title,
              'url', '/tasks'
            )
          );
        END IF;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Error notificando a usuario %: %', assigned_user_id_text, SQLERRM;
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. CREAR EL TRIGGER LIMPIO
CREATE TRIGGER on_todo_created
  AFTER INSERT ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_todo_change();

-- 4. VERIFICACIÓN: Este comando debería devolver 1 fila
SELECT count(*) FROM information_schema.triggers WHERE trigger_name = 'on_todo_created' AND event_object_table = 'todos';
