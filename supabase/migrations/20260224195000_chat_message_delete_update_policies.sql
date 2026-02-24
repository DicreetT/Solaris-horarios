-- Ensure chat message owners can update/delete their own messages.
-- Needed for reliable "delete message" behavior in UI.

alter table if exists public.chat_messages enable row level security;

drop policy if exists "chat_messages_update_sender_participant" on public.chat_messages;
create policy "chat_messages_update_sender_participant"
on public.chat_messages
for update
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.chat_participants p
    where p.conversation_id = chat_messages.conversation_id
      and p.user_id = auth.uid()
  )
)
with check (
  sender_id = auth.uid()
);

drop policy if exists "chat_messages_delete_sender_participant" on public.chat_messages;
create policy "chat_messages_delete_sender_participant"
on public.chat_messages
for delete
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.chat_participants p
    where p.conversation_id = chat_messages.conversation_id
      and p.user_id = auth.uid()
  )
);
