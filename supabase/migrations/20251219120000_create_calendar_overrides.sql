
create table if not exists public.calendar_overrides (
  date_key text primary key,
  is_non_working boolean default true,
  note text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_by uuid references auth.users(id)
);

alter table public.calendar_overrides enable row level security;

create policy "Admins can do everything on calendar_overrides"
  on public.calendar_overrides
  for all
  using (
    auth.uid() in (select id from users where is_admin = true)
  );

create policy "Everyone can view calendar_overrides"
  on public.calendar_overrides
  for select
  using (true);
