-- Make assigned tasks visible/realtime for assignees and avoid fragile text matching.

alter table if exists public.todos enable row level security;

drop policy if exists "todos_select_member" on public.todos;
drop policy if exists "todos_update_member" on public.todos;

create policy "todos_select_member"
on public.todos
for select
to authenticated
using (
  created_by = auth.uid()::text
  or auth.uid()::text = any(coalesce(assigned_to, '{}'::text[]))
);

create policy "todos_update_member"
on public.todos
for update
to authenticated
using (
  created_by = auth.uid()::text
  or auth.uid()::text = any(coalesce(assigned_to, '{}'::text[]))
)
with check (
  created_by = auth.uid()::text
  or auth.uid()::text = any(coalesce(assigned_to, '{}'::text[]))
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todos'
  ) then
    alter publication supabase_realtime add table public.todos;
  end if;
end $$;
