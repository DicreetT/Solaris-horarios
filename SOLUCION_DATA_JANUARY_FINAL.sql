-- 1. Updates Weekly Hours in user_profiles to match Presence Hours
-- Esteban (8h/day = 40h)
INSERT INTO public.user_profiles (user_id, weekly_hours, vacation_days_total)
VALUES ('07d58adc-8c82-458d-ba48-f733ec706c7c', 40, 22)
ON CONFLICT (user_id) DO UPDATE SET weekly_hours = 40;

-- Itzi (8h/day = 40h)
INSERT INTO public.user_profiles (user_id, weekly_hours, vacation_days_total)
VALUES ('cb5d2e6e-9046-4b22-b509-469076999d78', 40, 22)
ON CONFLICT (user_id) DO UPDATE SET weekly_hours = 40;

-- Fer (4h/day = 20h)
INSERT INTO public.user_profiles (user_id, weekly_hours, vacation_days_total)
VALUES ('4ca49a9d-7ee5-4b54-8e93-bc4833de549a', 20, 22)
ON CONFLICT (user_id) DO UPDATE SET weekly_hours = 20;

-- Heidy (4h/day = 20h)
INSERT INTO public.user_profiles (user_id, weekly_hours, vacation_days_total)
VALUES ('b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6', 20, 22)
ON CONFLICT (user_id) DO UPDATE SET weekly_hours = 20;

-- Anabella (5h/day = 25h)
INSERT INTO public.user_profiles (user_id, weekly_hours, vacation_days_total)
VALUES ('6bafcb97-6a1b-4224-adbb-1340b86ffeb9', 25, 22)
ON CONFLICT (user_id) DO UPDATE SET weekly_hours = 25;


-- 2. CLEAN UP: Delete logs > Jan 11 (Future)
DELETE FROM public.time_entries 
WHERE date_key > '2026-01-11';

-- 3. CLEAN UP: Delete logs on Holidays (Jan 1, Jan 6) and Weekends
-- Holidays
DELETE FROM public.time_entries 
WHERE date_key IN ('2026-01-01', '2026-01-06');

-- Weekends (Jan 3, 4, 10, 11)
DELETE FROM public.time_entries 
WHERE date_key IN ('2026-01-03', '2026-01-04', '2026-01-10', '2026-01-11');


-- 4. INSERT Logs for Working Days (Jan 2, 5, 7, 8, 9)

DO $$
DECLARE
    -- IDs
    esteban_id text := '07d58adc-8c82-458d-ba48-f733ec706c7c';
    itzi_id text := 'cb5d2e6e-9046-4b22-b509-469076999d78';
    fer_id text := '4ca49a9d-7ee5-4b54-8e93-bc4833de549a';
    heidy_id text := 'b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6';
    anabella_id text := '6bafcb97-6a1b-4224-adbb-1340b86ffeb9';
    
    -- Date Loop
    target_date date;
    date_str text;
    dates text[] := ARRAY['2026-01-02', '2026-01-05', '2026-01-07', '2026-01-08', '2026-01-09'];
BEGIN
    FOREACH date_str IN ARRAY dates
    LOOP
        -- Esteban (09:00 - 17:00)
        INSERT INTO public.time_entries (date_key, user_id, entry, exit, status)
        VALUES (date_str, esteban_id, '09:00', '17:00', 'present')
        ON CONFLICT (id) DO NOTHING; -- Assuming PK is ID, but duplicate entries are allowed typically. We should check if entry exists.
        -- Actually, preventing duplicates:
        IF NOT EXISTS (SELECT 1 FROM public.time_entries WHERE date_key = date_str AND user_id = esteban_id) THEN
            INSERT INTO public.time_entries (date_key, user_id, entry, exit, status)
            VALUES (date_str, esteban_id, '09:00', '17:00', 'present');
        END IF;

        -- Itzi (09:00 - 17:00)
        IF NOT EXISTS (SELECT 1 FROM public.time_entries WHERE date_key = date_str AND user_id = itzi_id) THEN
            INSERT INTO public.time_entries (date_key, user_id, entry, exit, status)
            VALUES (date_str, itzi_id, '09:00', '17:00', 'present');
        END IF;

        -- Fer (09:00 - 13:00)
        IF NOT EXISTS (SELECT 1 FROM public.time_entries WHERE date_key = date_str AND user_id = fer_id) THEN
            INSERT INTO public.time_entries (date_key, user_id, entry, exit, status)
            VALUES (date_str, fer_id, '09:00', '13:00', 'present');
        END IF;

        -- Heidy (09:00 - 13:00)
        IF NOT EXISTS (SELECT 1 FROM public.time_entries WHERE date_key = date_str AND user_id = heidy_id) THEN
            INSERT INTO public.time_entries (date_key, user_id, entry, exit, status)
            VALUES (date_str, heidy_id, '09:00', '13:00', 'present');
        END IF;

        -- Anabella (09:00 - 14:00)
        IF NOT EXISTS (SELECT 1 FROM public.time_entries WHERE date_key = date_str AND user_id = anabella_id) THEN
            INSERT INTO public.time_entries (date_key, user_id, entry, exit, status)
            VALUES (date_str, anabella_id, '09:00', '14:00', 'present');
        END IF;
    END LOOP;
END $$;
