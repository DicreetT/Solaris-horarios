import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
do $$
begin
  -- absence_requests
  execute 'drop policy if exists "absence_requests_update_admin" on public.absence_requests';
  execute 'create policy "absence_requests_update_admin"
    on public.absence_requests
    for update
    to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and coalesce(u.is_admin, false) = true
      )
    )';

  execute 'drop policy if exists "absence_requests_delete_admin" on public.absence_requests';
  execute 'create policy "absence_requests_delete_admin"
    on public.absence_requests
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and coalesce(u.is_admin, false) = true
      )
    )';

  -- meeting_requests
  execute 'drop policy if exists "meeting_requests_update_admin" on public.meeting_requests';
  execute 'create policy "meeting_requests_update_admin"
    on public.meeting_requests
    for update
    to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and coalesce(u.is_admin, false) = true
      )
    )';

  execute 'drop policy if exists "meeting_requests_delete_admin" on public.meeting_requests';
  execute 'create policy "meeting_requests_delete_admin"
    on public.meeting_requests
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and coalesce(u.is_admin, false) = true
      )
    )';

  -- training_requests (admins and training managers)
  execute 'drop policy if exists "training_requests_update_admin_or_manager" on public.training_requests';
  execute 'create policy "training_requests_update_admin_or_manager"
    on public.training_requests
    for update
    to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and (coalesce(u.is_admin, false) = true or coalesce(u.is_training_manager, false) = true)
      )
    )';

  execute 'drop policy if exists "training_requests_delete_admin_or_manager" on public.training_requests';
  execute 'create policy "training_requests_delete_admin_or_manager"
    on public.training_requests
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and (coalesce(u.is_admin, false) = true or coalesce(u.is_training_manager, false) = true)
      )
    )';

end $$;
    `
    })
    if (error) {
        console.error('Error:', error)
    } else {
        console.log('Success:', data)
    }
}

run()
