-- FIX FOR STORM MODE: Change column type to TEXT[]
-- Run this in your Supabase SQL Editor

-- 1. Drop the old column (since it was wrong type and likely empty or failed)
ALTER TABLE todos DROP COLUMN IF EXISTS shocked_users;

-- 2. Create it again as TEXT[] to support current IDs (like "thalia")
ALTER TABLE todos ADD COLUMN shocked_users TEXT[] DEFAULT '{}';

-- 3. Just in case, ensure it's initialized
UPDATE todos SET shocked_users = '{}' WHERE shocked_users IS NULL;
