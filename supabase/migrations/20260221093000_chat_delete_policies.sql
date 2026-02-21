-- Allow users to remove chats from their own list and creators to delete full conversations.

alter table if exists public.chat_conversations enable row level security;
alter table if exists public.chat_participants enable row level security;

drop policy if exists "chat_conversations_delete_creator" on public.chat_conversations;
create policy "chat_conversations_delete_creator"
on public.chat_conversations
for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists "chat_participants_delete_self_or_creator" on public.chat_participants;
create policy "chat_participants_delete_self_or_creator"
on public.chat_participants
for delete
to authenticated
using (
    user_id = auth.uid()
    or exists (
        select 1
        from public.chat_conversations c
        where c.id = chat_participants.conversation_id
          and c.created_by = auth.uid()
    )
);
