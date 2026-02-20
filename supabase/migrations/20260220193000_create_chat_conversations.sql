create table if not exists public.chat_conversations (
    id bigserial primary key,
    kind text not null check (kind in ('direct', 'group')),
    title text,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
    conversation_id bigint not null references public.chat_conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (conversation_id, user_id)
);

create table if not exists public.chat_messages (
    id bigserial primary key,
    conversation_id bigint not null references public.chat_conversations(id) on delete cascade,
    sender_id uuid not null references auth.users(id) on delete cascade,
    message text not null default '',
    attachments jsonb not null default '[]'::jsonb,
    mentions uuid[] not null default '{}',
    reply_to bigint references public.chat_messages(id) on delete set null,
    linked_task_id bigint references public.todos(id) on delete set null,
    linked_meeting_id bigint references public.meeting_requests(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint chat_message_has_content check (
        char_length(trim(message)) > 0
        or jsonb_array_length(attachments) > 0
        or linked_task_id is not null
        or linked_meeting_id is not null
    )
);

create index if not exists idx_chat_participants_user on public.chat_participants(user_id);
create index if not exists idx_chat_messages_conversation_created on public.chat_messages(conversation_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_conversations_select_participant"
on public.chat_conversations
for select
to authenticated
using (
    exists (
        select 1
        from public.chat_participants p
        where p.conversation_id = chat_conversations.id
          and p.user_id = auth.uid()
    )
);

create policy "chat_conversations_insert_own"
on public.chat_conversations
for insert
to authenticated
with check (created_by = auth.uid());

create policy "chat_participants_select_participant"
on public.chat_participants
for select
to authenticated
using (
    exists (
        select 1
        from public.chat_participants p
        where p.conversation_id = chat_participants.conversation_id
          and p.user_id = auth.uid()
    )
);

create policy "chat_participants_insert_creator_or_self"
on public.chat_participants
for insert
to authenticated
with check (
    user_id = auth.uid()
    or exists (
        select 1
        from public.chat_conversations c
        where c.id = conversation_id
          and c.created_by = auth.uid()
    )
);

create policy "chat_messages_select_participant"
on public.chat_messages
for select
to authenticated
using (
    exists (
        select 1
        from public.chat_participants p
        where p.conversation_id = chat_messages.conversation_id
          and p.user_id = auth.uid()
    )
);

create policy "chat_messages_insert_sender_participant"
on public.chat_messages
for insert
to authenticated
with check (
    sender_id = auth.uid()
    and exists (
        select 1
        from public.chat_participants p
        where p.conversation_id = chat_messages.conversation_id
          and p.user_id = auth.uid()
    )
);
