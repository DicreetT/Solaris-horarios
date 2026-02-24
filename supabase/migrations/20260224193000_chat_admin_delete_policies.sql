-- Chat delete policies: creator can delete globally, admin can delete globally as well.
-- This avoids "chat reappears" scenarios when admin cleanup depends on fallback-only logic.

alter table if exists public.chat_conversations enable row level security;
alter table if exists public.chat_participants enable row level security;

do $$
begin
  if to_regclass('public.users') is not null then
    execute 'drop policy if exists "chat_conversations_delete_creator_or_admin" on public.chat_conversations';
    execute 'create policy "chat_conversations_delete_creator_or_admin"
      on public.chat_conversations
      for delete
      to authenticated
      using (
        created_by = auth.uid()
        or exists (
          select 1 from public.users u
          where u.id = auth.uid()
            and coalesce(u.is_admin, false) = true
        )
      )';

    execute 'drop policy if exists "chat_participants_delete_self_creator_or_admin" on public.chat_participants';
    execute 'create policy "chat_participants_delete_self_creator_or_admin"
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
        or exists (
          select 1 from public.users u
          where u.id = auth.uid()
            and coalesce(u.is_admin, false) = true
        )
      )';
  else
    execute 'drop policy if exists "chat_conversations_delete_creator_or_admin" on public.chat_conversations';
    execute 'create policy "chat_conversations_delete_creator_or_admin"
      on public.chat_conversations
      for delete
      to authenticated
      using (created_by = auth.uid())';

    execute 'drop policy if exists "chat_participants_delete_self_creator_or_admin" on public.chat_participants';
    execute 'create policy "chat_participants_delete_self_creator_or_admin"
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
      )';
  end if;
end $$;

drop policy if exists "chat_conversations_delete_creator" on public.chat_conversations;
drop policy if exists "chat_participants_delete_self_or_creator" on public.chat_participants;
