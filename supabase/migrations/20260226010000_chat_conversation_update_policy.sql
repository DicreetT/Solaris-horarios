-- Add update policy for chat_conversations
-- Allows any participant of the conversation to update the conversation details (e.g. title)

drop policy if exists "chat_conversations_update_participant" on public.chat_conversations;

create policy "chat_conversations_update_participant"
on public.chat_conversations
for update
using (
    exists (
        select 1
        from public.chat_participants p
        where p.conversation_id = chat_conversations.id
          and p.user_id = (select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)
    )
);
