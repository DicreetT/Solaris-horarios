-- Shared JSON state for synchronized client-side modules (inventory, dashboards, etc.)

create table if not exists public.shared_json_state (
  key text primary key,
  payload jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create or replace function public.set_shared_json_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shared_json_state_updated_at on public.shared_json_state;
create trigger trg_shared_json_state_updated_at
before update on public.shared_json_state
for each row execute function public.set_shared_json_state_updated_at();

alter table public.shared_json_state enable row level security;

drop policy if exists "shared_json_state_read_authenticated" on public.shared_json_state;
create policy "shared_json_state_read_authenticated"
on public.shared_json_state
for select
to authenticated
using (true);

drop policy if exists "shared_json_state_insert_authenticated" on public.shared_json_state;
create policy "shared_json_state_insert_authenticated"
on public.shared_json_state
for insert
to authenticated
with check (true);

drop policy if exists "shared_json_state_update_authenticated" on public.shared_json_state;
create policy "shared_json_state_update_authenticated"
on public.shared_json_state
for update
to authenticated
using (true)
with check (true);
