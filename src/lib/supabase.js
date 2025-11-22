import { createClient } from '@supabase/supabase-js';

// 🔐 Config Supabase
const SUPABASE_URL = "https://geaspnqzexuoaarycrsi.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlYXNwbnF6ZXh1b2FhcnljcnNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0NDUyNjksImV4cCI6MjA3OTAyMTI2OX0.ZMvJHVnvzv6B25hiurLL5x2vGb831rI0Qo881ovxkv4";

// Cliente Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
