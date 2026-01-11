-- PHASE 5: STORM MODE (Playful Maleficence ⛈️⚡)
-- Run this in your Supabase SQL Editor

-- 1. Add shocked_users to todos table
ALTER TABLE todos 
ADD COLUMN IF NOT EXISTS shocked_users UUID[] DEFAULT '{}';

-- 2. Update existing todos to have an empty array if null
UPDATE todos SET shocked_users = '{}' WHERE shocked_users IS NULL;
