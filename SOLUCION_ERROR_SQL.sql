-- 1. LIMPIEZA: Eliminar trigger y función antiguos para asegurar una actualización limpia
DROP TRIGGER IF EXISTS on_todo_created ON public.todos;
DROP FUNCTION IF EXISTS public.notify_push_on_todo_change();

-- 2. FUNCIÓN CORREGIDA: Usa jsonb_array_elements_text para evitar el error de 'unnest'
CREATE OR REPLACE FUNCTION public.notify_push_on_todo_change()
RETURNS TRIGGER AS $$
DECLARE
  assigned_user_id_text TEXT;
  assigned_user_id UUID;
BEGIN
  -- Solo actuar en inserciones (nuevas tareas)
  IF (TG_OP = 'INSERT') AND NEW.assigned_to IS NOT NULL THEN
    FOR assigned_user_id_text IN 
      SELECT value FROM jsonb_array_elements_text(NEW.assigned_to) AS value
    LOOP
      BEGIN
        assigned_user_id := assigned_user_id_text::UUID;
        
        -- No notificar al creador de la tarea
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
        -- Ignorar errores individuales para que no bloqueen la creación de la tarea
        RAISE NOTICE 'Error notificando a usuario %: %', assigned_user_id_text, SQLERRM;
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RE-CREAR TRIGGER: Aplicar la función a la tabla todos
CREATE TRIGGER on_todo_created
  AFTER INSERT ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_todo_change();

-- 4. ASEGURAR REALTIME (Opcional si ya está activo)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.todos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
-- Ignorar errores si las tablas ya están en la publicación
