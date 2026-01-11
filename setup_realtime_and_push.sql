-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 2. Habilitar Realtime para las tablas principales
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  DO $$
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.todos;
  EXCEPTION WHEN others THEN NULL; END $$;

  DO $$
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN others THEN NULL; END $$;

  DO $$
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
  EXCEPTION WHEN others THEN NULL; END $$;
COMMIT;

-- 3. Función para enviar notificaciones push a través de Edge Functions
CREATE OR REPLACE FUNCTION public.notify_push_on_todo_change()
RETURNS TRIGGER AS $$
DECLARE
  assigned_user_id_text TEXT;
  assigned_user_id UUID;
BEGIN
  -- Si es una nueva tarea, notificar a los asignados
  IF (TG_OP = 'INSERT') THEN
    FOR assigned_user_id_text IN 
      SELECT value FROM jsonb_array_elements_text(NEW.assigned_to) AS value
    LOOP
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
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger para tareas
DROP TRIGGER IF EXISTS on_todo_created ON public.todos;
CREATE TRIGGER on_todo_created
  AFTER INSERT ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_todo_change();