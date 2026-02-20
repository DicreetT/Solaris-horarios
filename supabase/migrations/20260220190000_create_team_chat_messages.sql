create table if not exists public.team_chat_messages (
    id bigserial primary key,
    channel text not null default 'general',
    sender_id uuid not null references auth.users(id) on delete cascade,
    message text not null check (char_length(trim(message)) > 0),
    created_at timestamptz not null default now()
);

create index if not exists idx_team_chat_messages_channel_created_at
    on public.team_chat_messages(channel, created_at desc);

alter table public.team_chat_messages enable row level security;

create policy "team_chat_read_authenticated"
on public.team_chat_messages
for select
to authenticated
using (true);

create policy "team_chat_insert_own_user"
on public.team_chat_messages
for insert
to authenticated
with check (auth.uid() = sender_id);
