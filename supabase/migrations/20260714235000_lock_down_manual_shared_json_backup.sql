-- Lock down the manual backup table flagged by Supabase Security Advisor.
--
-- The app reads/writes public.shared_json_state. This manual backup table is
-- not used directly by the frontend, so enabling RLS without browser policies
-- keeps it available to database owners/service-role tooling while blocking
-- anon/authenticated API access.

do $$
declare
  existing_policy record;
begin
  if to_regclass('public.shared_json_state_manual_backup') is not null then
    alter table public.shared_json_state_manual_backup enable row level security;

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'shared_json_state_manual_backup'
    loop
      execute format(
        'drop policy if exists %I on public.shared_json_state_manual_backup',
        existing_policy.policyname
      );
    end loop;
  end if;
end $$;
