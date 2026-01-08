DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'training_requests'
        AND column_name = 'reason'
    ) THEN
        ALTER TABLE training_requests ADD COLUMN reason text;
    END IF;
END $$;
