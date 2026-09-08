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
  or exists (
    select 1
    from jsonb_array_elements_text(coalesce(to_jsonb(assigned_to), '[]'::jsonb)) as assigned_user(user_id)
    where assigned_user.user_id = auth.uid()::text
  )
);

create policy "todos_update_member"
on public.todos
for update
to authenticated
using (
  created_by = auth.uid()::text
  or exists (
    select 1
    from jsonb_array_elements_text(coalesce(to_jsonb(assigned_to), '[]'::jsonb)) as assigned_user(user_id)
    where assigned_user.user_id = auth.uid()::text
  )
)
with check (
  created_by = auth.uid()::text
  or exists (
    select 1
    from jsonb_array_elements_text(coalesce(to_jsonb(assigned_to), '[]'::jsonb)) as assigned_user(user_id)
    where assigned_user.user_id = auth.uid()::text
  )
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
