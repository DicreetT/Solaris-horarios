-- Enable RLS on all tables
-- (We will do this after creating them)

-- 1. time_entries
CREATE TABLE IF NOT EXISTS public.time_entries (
    date_key text NOT NULL,
    user_id text NOT NULL,
    entry text,
    exit text,
    status text,
    note text,
    inserted_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT time_entries_pkey PRIMARY KEY (date_key, user_id)
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- 2. training_requests
CREATE TABLE IF NOT EXISTS public.training_requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id text NOT NULL,
    requested_date_key text NOT NULL,
    scheduled_date_key text NOT NULL,
    status text DEFAULT 'pending'::text,
    comments jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.training_requests ENABLE ROW LEVEL SECURITY;

-- 3. todos
CREATE TABLE IF NOT EXISTS public.todos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    description text,
    created_by text NOT NULL,
    assigned_to text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    due_date_key text,
    completed_by text[] DEFAULT '{}'::text[]
);
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- 4. meeting_requests
CREATE TABLE IF NOT EXISTS public.meeting_requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    title text NOT NULL,
    description text,
    preferred_date_key text,
    preferred_slot text,
    participants text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text,
    scheduled_date_key text,
    scheduled_time text,
    response_message text
);
ALTER TABLE public.meeting_requests ENABLE ROW LEVEL SECURITY;

-- 5. absence_requests
CREATE TABLE IF NOT EXISTS public.absence_requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    date_key text NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text,
    response_message text
);
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;

-- 6. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    read boolean DEFAULT false
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 7. folder_updates
CREATE TABLE IF NOT EXISTS public.folder_updates (
    folder_id text PRIMARY KEY,
    author text,
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.folder_updates ENABLE ROW LEVEL SECURITY;


-- POLICIES

-- time_entries
DROP POLICY IF EXISTS "Time entries insert for anon" ON public.time_entries;
CREATE POLICY "Time entries insert for anon" ON public.time_entries FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Time entries select for anon" ON public.time_entries;
CREATE POLICY "Time entries select for anon" ON public.time_entries FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Time entries update for anon" ON public.time_entries;
CREATE POLICY "Time entries update for anon" ON public.time_entries FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "time_entries full access for authenticated" ON public.time_entries;
CREATE POLICY "time_entries full access for authenticated" ON public.time_entries FOR ALL TO authenticated USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);

-- training_requests
DROP POLICY IF EXISTS "training_requests_all" ON public.training_requests;
CREATE POLICY "training_requests_all" ON public.training_requests FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "training_requests full access for authenticated" ON public.training_requests;
CREATE POLICY "training_requests full access for authenticated" ON public.training_requests FOR ALL TO authenticated USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);

-- todos
DROP POLICY IF EXISTS "todos_all" ON public.todos;
CREATE POLICY "todos_all" ON public.todos FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "todos full access for authenticated" ON public.todos;
CREATE POLICY "todos full access for authenticated" ON public.todos FOR ALL TO authenticated USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);

-- meeting_requests
DROP POLICY IF EXISTS "meeting_requests_all" ON public.meeting_requests;
CREATE POLICY "meeting_requests_all" ON public.meeting_requests FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "meetings full access for authenticated" ON public.meeting_requests;
CREATE POLICY "meetings full access for authenticated" ON public.meeting_requests FOR ALL TO authenticated USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);

-- absence_requests
DROP POLICY IF EXISTS "absence_requests_all" ON public.absence_requests;
CREATE POLICY "absence_requests_all" ON public.absence_requests FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "absences full access for authenticated" ON public.absence_requests;
CREATE POLICY "absences full access for authenticated" ON public.absence_requests FOR ALL TO authenticated USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);

-- notifications
DROP POLICY IF EXISTS "notifications full access for authenticated" ON public.notifications;
CREATE POLICY "notifications full access for authenticated" ON public.notifications FOR ALL TO authenticated USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);

-- folder_updates
DROP POLICY IF EXISTS "folder_updates full access for authenticated" ON public.folder_updates;
CREATE POLICY "folder_updates full access for authenticated" ON public.folder_updates FOR ALL TO authenticated USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);
