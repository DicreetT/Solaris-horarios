-- Admin bypass policies for request management
-- Admins need to be able to UPDATE and DELETE requests created by others
-- to approve, reject, or reprogram them.
-- 1c42e44a-7e58-4c86-94ca-404061f8863d = Thalia (Admin)
-- 07d58adc-8c82-458d-ba48-f733ec706c7c = Esteban (Training Manager)

do $$
begin
  -- absence_requests
  execute 'drop policy if exists "absence_requests_update_admin" on public.absence_requests';
  execute 'create policy "absence_requests_update_admin"
    on public.absence_requests
    for update
    to authenticated
    using (
      auth.uid()::text = ''1c42e44a-7e58-4c86-94ca-404061f8863d''
    )';

  execute 'drop policy if exists "absence_requests_delete_admin" on public.absence_requests';
  execute 'create policy "absence_requests_delete_admin"
    on public.absence_requests
    for delete
    to authenticated
    using (
      auth.uid()::text = ''1c42e44a-7e58-4c86-94ca-404061f8863d''
    )';

  -- meeting_requests
  execute 'drop policy if exists "meeting_requests_update_admin" on public.meeting_requests';
  execute 'create policy "meeting_requests_update_admin"
    on public.meeting_requests
    for update
    to authenticated
    using (
      auth.uid()::text = ''1c42e44a-7e58-4c86-94ca-404061f8863d''
    )';

  execute 'drop policy if exists "meeting_requests_delete_admin" on public.meeting_requests';
  execute 'create policy "meeting_requests_delete_admin"
    on public.meeting_requests
    for delete
    to authenticated
    using (
      auth.uid()::text = ''1c42e44a-7e58-4c86-94ca-404061f8863d''
    )';

  -- training_requests (admins and training managers)
  execute 'drop policy if exists "training_requests_update_admin_or_manager" on public.training_requests';
  execute 'create policy "training_requests_update_admin_or_manager"
    on public.training_requests
    for update
    to authenticated
    using (
      auth.uid()::text in (''1c42e44a-7e58-4c86-94ca-404061f8863d'', ''07d58adc-8c82-458d-ba48-f733ec706c7c'')
    )';

  execute 'drop policy if exists "training_requests_delete_admin_or_manager" on public.training_requests';
  execute 'create policy "training_requests_delete_admin_or_manager"
    on public.training_requests
    for delete
    to authenticated
    using (
      auth.uid()::text in (''1c42e44a-7e58-4c86-94ca-404061f8863d'', ''07d58adc-8c82-458d-ba48-f733ec706c7c'')
    )';

end $$;

