-- Ensure realtime events are emitted for shared_json_state (used by Despachos queue sync).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shared_json_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_json_state;
  END IF;
END $$;

