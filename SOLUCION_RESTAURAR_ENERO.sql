-- RESTORE JANUARY 2026 TIME ENTRIES
-- Standard Schedules:
-- Esteban, Itzi: 09:00 - 17:00
-- Fer, Heidy: 09:00 - 13:00
-- Anabella: 09:00 - 14:00

DO $$
DECLARE
    -- User IDs
    uid_esteban UUID := '07d58adc-8c82-458d-ba48-f733ec706c7c';
    uid_itzi UUID := 'cb5d2e6e-9046-4b22-b509-469076999d78';
    uid_fer UUID := '4ca49a9d-7ee5-4b54-8e93-bc4833de549a';
    uid_anabella UUID := '6bafcb97-6a1b-4224-adbb-1340b86ffeb9';
    uid_heidy UUID := 'b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6';
    
    current_day DATE;
BEGIN
    -- 1. Clean existing entries for these users in Jan 2026 to avoid overlaps/duplicates
    DELETE FROM time_entries 
    WHERE date_key BETWEEN '2026-01-01' AND '2026-01-31'
    AND user_id IN (uid_esteban, uid_itzi, uid_fer, uid_anabella, uid_heidy);

    -- 2. Loop through Jan 2026
    FOR current_day IN SELECT generate_series('2026-01-01'::date, '2026-01-31'::date, '1 day'::interval) LOOP
        -- Skip Weekends (Saturday=6, Sunday=7)
        IF EXTRACT(ISODOW FROM current_day) < 6 THEN
            
            -- Insert Esteban (09:00 - 17:00)
            INSERT INTO time_entries (user_id, date_key, entry, exit, status, inserted_at, updated_at)
            VALUES (uid_esteban, current_day::text, '09:00', '17:00', 'present', now(), now());

            -- Insert Itzi (09:00 - 17:00)
            INSERT INTO time_entries (user_id, date_key, entry, exit, status, inserted_at, updated_at)
            VALUES (uid_itzi, current_day::text, '09:00', '17:00', 'present', now(), now());

            -- Insert Fer (09:00 - 13:00)
            INSERT INTO time_entries (user_id, date_key, entry, exit, status, inserted_at, updated_at)
            VALUES (uid_fer, current_day::text, '09:00', '13:00', 'present', now(), now());
            
            -- Insert Heidy (09:00 - 13:00)
            INSERT INTO time_entries (user_id, date_key, entry, exit, status, inserted_at, updated_at)
            VALUES (uid_heidy, current_day::text, '09:00', '13:00', 'present', now(), now());

            -- Insert Anabella (09:00 - 14:00)
            INSERT INTO time_entries (user_id, date_key, entry, exit, status, inserted_at, updated_at)
            VALUES (uid_anabella, current_day::text, '09:00', '14:00', 'present', now(), now());

        END IF;
    END LOOP;
END $$;
