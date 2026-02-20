-- Security hardening: tighten broad/legacy policies while keeping app behavior.

-- Ensure RLS is enabled on core tables.
alter table if exists public.time_entries enable row level security;
alter table if exists public.training_requests enable row level security;
alter table if exists public.todos enable row level security;
alter table if exists public.meeting_requests enable row level security;
alter table if exists public.absence_requests enable row level security;
alter table if exists public.notifications enable row level security;
alter table if exists public.folder_updates enable row level security;
alter table if exists public.calendar_events enable row level security;
alter table if exists public.calendar_overrides enable row level security;

-- Remove overly permissive legacy policies (anon full access / global authenticated full access).
drop policy if exists "Time entries insert for anon" on public.time_entries;
drop policy if exists "Time entries select for anon" on public.time_entries;
drop policy if exists "Time entries update for anon" on public.time_entries;
drop policy if exists "time_entries full access for authenticated" on public.time_entries;

drop policy if exists "training_requests_all" on public.training_requests;
drop policy if exists "training_requests full access for authenticated" on public.training_requests;

drop policy if exists "todos_all" on public.todos;
drop policy if exists "todos full access for authenticated" on public.todos;

drop policy if exists "meeting_requests_all" on public.meeting_requests;
drop policy if exists "meetings full access for authenticated" on public.meeting_requests;

drop policy if exists "absence_requests_all" on public.absence_requests;
drop policy if exists "absences full access for authenticated" on public.absence_requests;

drop policy if exists "notifications full access for authenticated" on public.notifications;
do $$
begin
  if to_regclass('public.folder_updates') is not null then
    execute 'drop policy if exists "folder_updates full access for authenticated" on public.folder_updates';
  end if;
end $$;

do $$
begin
  if to_regclass('public.calendar_events') is not null then
    execute 'drop policy if exists "Everyone can read calendar events" on public.calendar_events';
    execute 'drop policy if exists "Users can create calendar events" on public.calendar_events';
    execute 'drop policy if exists "Users can delete their own events" on public.calendar_events';
  end if;
end $$;

do $$
begin
  if to_regclass('public.calendar_overrides') is not null then
    execute 'drop policy if exists "Everyone can view calendar_overrides" on public.calendar_overrides';
  end if;
end $$;

-- time_entries:
-- - any authenticated user can read for dashboards/coordination
-- - only the owner can insert/update/delete their own entries
create policy "time_entries_read_authenticated"
on public.time_entries
for select
to authenticated
using (true);

create policy "time_entries_insert_own"
on public.time_entries
for insert
to authenticated
with check (user_id = auth.uid()::text);

create policy "time_entries_update_own"
on public.time_entries
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

create policy "time_entries_delete_own"
on public.time_entries
for delete
to authenticated
using (user_id = auth.uid()::text);

-- training_requests:
-- - reads are authenticated only
-- - user can create/update/delete own requests
create policy "training_requests_read_authenticated"
on public.training_requests
for select
to authenticated
using (true);

create policy "training_requests_insert_own"
on public.training_requests
for insert
to authenticated
with check (user_id = auth.uid()::text);

create policy "training_requests_update_own"
on public.training_requests
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

create policy "training_requests_delete_own"
on public.training_requests
for delete
to authenticated
using (user_id = auth.uid()::text);

-- todos:
-- - visible if created by me or assigned to me
-- - insert must be created by me
-- - update/delete allowed to creator or assignee (needed for comments/completion flow)
create policy "todos_select_member"
on public.todos
for select
to authenticated
using (
  created_by = auth.uid()::text
  or position(auth.uid()::text in coalesce(assigned_to::text, '')) > 0
);

create policy "todos_insert_creator"
on public.todos
for insert
to authenticated
with check (created_by = auth.uid()::text);

create policy "todos_update_member"
on public.todos
for update
to authenticated
using (
  created_by = auth.uid()::text
  or position(auth.uid()::text in coalesce(assigned_to::text, '')) > 0
)
with check (
  created_by = auth.uid()::text
  or position(auth.uid()::text in coalesce(assigned_to::text, '')) > 0
);

create policy "todos_delete_creator"
on public.todos
for delete
to authenticated
using (created_by = auth.uid()::text);

-- meeting_requests:
-- - read only if I created it or I participate
-- - write only by creator
create policy "meeting_requests_select_member"
on public.meeting_requests
for select
to authenticated
using (
  created_by = auth.uid()::text
  or position(auth.uid()::text in coalesce(participants::text, '')) > 0
);

create policy "meeting_requests_insert_creator"
on public.meeting_requests
for insert
to authenticated
with check (created_by = auth.uid()::text);

create policy "meeting_requests_update_creator"
on public.meeting_requests
for update
to authenticated
using (created_by = auth.uid()::text)
with check (created_by = auth.uid()::text);

create policy "meeting_requests_delete_creator"
on public.meeting_requests
for delete
to authenticated
using (created_by = auth.uid()::text);

-- absence_requests:
-- - read for authenticated users
-- - write only own rows
create policy "absence_requests_read_authenticated"
on public.absence_requests
for select
to authenticated
using (true);

create policy "absence_requests_insert_own"
on public.absence_requests
for insert
to authenticated
with check (created_by = auth.uid()::text);

create policy "absence_requests_update_own"
on public.absence_requests
for update
to authenticated
using (created_by = auth.uid()::text)
with check (created_by = auth.uid()::text);

create policy "absence_requests_delete_own"
on public.absence_requests
for delete
to authenticated
using (created_by = auth.uid()::text);

-- notifications:
-- - only the recipient can read/update/delete
-- - inserts are allowed for authenticated (to support app-generated peer notifications)
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (user_id = auth.uid()::text);

create policy "notifications_insert_authenticated"
on public.notifications
for insert
to authenticated
with check (true);

create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using (user_id = auth.uid()::text);

-- folder_updates:
-- - authenticated read
-- - only author can mutate own updates
do $$
begin
  if to_regclass('public.folder_updates') is not null then
    execute 'create policy "folder_updates_read_authenticated" on public.folder_updates for select to authenticated using (true)';
    execute 'create policy "folder_updates_insert_own" on public.folder_updates for insert to authenticated with check (author = auth.uid()::text)';
    execute 'create policy "folder_updates_update_own" on public.folder_updates for update to authenticated using (author = auth.uid()::text) with check (author = auth.uid()::text)';
    execute 'create policy "folder_updates_delete_own" on public.folder_updates for delete to authenticated using (author = auth.uid()::text)';
  end if;
end $$;

-- calendar_events:
-- - authenticated read
-- - only creator can write/delete own entries
do $$
begin
  if to_regclass('public.calendar_events') is not null then
    execute 'create policy "calendar_events_read_authenticated" on public.calendar_events for select to authenticated using (true)';
    execute 'create policy "calendar_events_insert_own" on public.calendar_events for insert to authenticated with check (auth.uid() = created_by)';
    execute 'create policy "calendar_events_delete_own" on public.calendar_events for delete to authenticated using (auth.uid() = created_by)';
  end if;
end $$;

-- calendar_overrides:
-- - authenticated read only (non-working days should not be public to anon)
do $$
begin
  if to_regclass('public.calendar_overrides') is not null then
    execute 'create policy "calendar_overrides_read_authenticated" on public.calendar_overrides for select to authenticated using (true)';
  end if;
end $$;
