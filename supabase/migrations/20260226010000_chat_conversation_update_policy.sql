-- Allow participants to update chat titles.
-- Admins can also update any title.

alter table if exists public.chat_conversations enable row level security;

do $$
begin
  if to_regclass('public.users') is not null then
    execute 'drop policy if exists "chat_conversations_update_participant_or_admin" on public.chat_conversations';
    execute 'create policy "chat_conversations_update_participant_or_admin"
      on public.chat_conversations
      for update
      to authenticated
      using (
        exists (
          select 1 from public.chat_participants p
          where p.conversation_id = chat_conversations.id
            and p.user_id = auth.uid()
        )
        or exists (
          select 1 from public.users u
          where u.id = auth.uid()
            and coalesce(u.is_admin, false) = true
        )
      )';
  else
    execute 'drop policy if exists "chat_conversations_update_participant" on public.chat_conversations';
    execute 'create policy "chat_conversations_update_participant"
      on public.chat_conversations
      for update
      to authenticated
      using (
        exists (
          select 1 from public.chat_participants p
          where p.conversation_id = chat_conversations.id
            and p.user_id = auth.uid()
        )
      )';
  end if;
end $$;
