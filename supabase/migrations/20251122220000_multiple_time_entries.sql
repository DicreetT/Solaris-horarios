-- Migration: Enable multiple time entries per day
-- Add auto-incrementing ID as primary key and allow multiple entries per user per day

-- Step 1: Add id column
ALTER TABLE public.time_entries 
ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY;

-- Step 2: Drop the old primary key constraint
ALTER TABLE public.time_entries 
DROP CONSTRAINT time_entries_pkey;

-- Step 3: Set the new primary key on id
ALTER TABLE public.time_entries 
ADD PRIMARY KEY (id);

-- Step 4: Create index on (date_key, user_id) for efficient queries
CREATE INDEX idx_time_entries_date_user ON public.time_entries(date_key, user_id);

-- Step 5: Create index on (user_id, date_key) for user-specific queries
CREATE INDEX idx_time_entries_user_date ON public.time_entries(user_id, date_key);
