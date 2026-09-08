-- Allow Heidy to manage vacation balances without making her a global admin.
-- 1c42e44a-7e58-4c86-94ca-404061f8863d = Thalia (Admin)
-- b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6 = Heidy (vacation manager)

do $$
begin
  if to_regclass('public.user_profiles') is not null then
    alter table public.user_profiles enable row level security;

    execute 'drop policy if exists "user_profiles_read_authenticated" on public.user_profiles';
    execute 'drop policy if exists "user_profiles_insert_admin_or_vacation_manager" on public.user_profiles';
    execute 'drop policy if exists "user_profiles_update_admin_or_vacation_manager" on public.user_profiles';

    execute 'create policy "user_profiles_read_authenticated"
      on public.user_profiles
      for select
      to authenticated
      using (true)';

    execute 'create policy "user_profiles_insert_admin_or_vacation_manager"
      on public.user_profiles
      for insert
      to authenticated
      with check (
        auth.uid()::text in (''1c42e44a-7e58-4c86-94ca-404061f8863d'', ''b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6'')
      )';

    execute 'create policy "user_profiles_update_admin_or_vacation_manager"
      on public.user_profiles
      for update
      to authenticated
      using (
        auth.uid()::text in (''1c42e44a-7e58-4c86-94ca-404061f8863d'', ''b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6'')
      )
      with check (
        auth.uid()::text in (''1c42e44a-7e58-4c86-94ca-404061f8863d'', ''b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6'')
      )';
  end if;
end $$;
