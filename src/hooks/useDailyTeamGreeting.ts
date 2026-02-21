import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { USERS } from '../constants';

const DAILY_GREETING_MESSAGE = 'Buenos días, equipo ☀️';
const CHECK_INTERVAL_MS = 60 * 1000;

const dayKey = (date = new Date()) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const greetingSentStorageKey = (userId: string, key: string) => `daily-team-greeting:${userId}:${key}`;

const isPreferredGroupTitle = (title?: string | null) => {
    const value = `${title || ''}`.toLowerCase();
    return value.includes('equipo') || value.includes('solaris') || value.includes('general');
};

export function useDailyTeamGreeting(currentUser: User | null) {
    useEffect(() => {
        if (!currentUser) return;

        let cancelled = false;

        const findTeamConversationId = async () => {
            const { data: memberships, error: membershipError } = await supabase
                .from('chat_participants')
                .select('conversation_id')
                .eq('user_id', currentUser.id);
            if (membershipError) throw membershipError;

            const conversationIds = Array.from(new Set((memberships || []).map((row: any) => Number(row.conversation_id)).filter(Boolean)));
            if (conversationIds.length === 0) return null;

            const { data: conversations, error: conversationsError } = await supabase
                .from('chat_conversations')
                .select('id, title, kind')
                .in('id', conversationIds)
                .eq('kind', 'group');
            if (conversationsError) throw conversationsError;

            if (!conversations || conversations.length === 0) return null;

            const groupIds = conversations.map((conversation: any) => conversation.id);
            const { data: participantRows, error: participantsError } = await supabase
                .from('chat_participants')
                .select('conversation_id, user_id')
                .in('conversation_id', groupIds);
            if (participantsError) throw participantsError;

            const allTeamUserIds = new Set(USERS.map((user) => user.id));
            const participantsByConversation = new Map<number, Set<string>>();
            (participantRows || []).forEach((row: any) => {
                const set = participantsByConversation.get(row.conversation_id) || new Set<string>();
                set.add(row.user_id);
                participantsByConversation.set(row.conversation_id, set);
            });

            const scored = conversations.map((conversation: any) => {
                const members = participantsByConversation.get(conversation.id) || new Set<string>();
                const includesWholeTeam = USERS.every((user) => members.has(user.id));
                const titlePreferred = isPreferredGroupTitle(conversation.title);
                const participantCount = members.size;

                const score = (includesWholeTeam ? 1000 : 0) + (titlePreferred ? 150 : 0) + participantCount;
                return {
                    id: conversation.id as number,
                    score,
                    includesWholeTeam,
                    titlePreferred,
                    participantCount,
                };
            });

            scored.sort((a, b) => b.score - a.score);
            const best = scored[0];
            if (!best) return null;

            const bestMembers = participantsByConversation.get(best.id) || new Set<string>();
            const hasAtLeastTeamCore = Array.from(allTeamUserIds).some((id) => bestMembers.has(id));
            if (!hasAtLeastTeamCore) return null;

            return best.id;
        };

        const run = async () => {
            if (cancelled) return;
            const now = new Date();
            if (now.getHours() < 9) return;

            const today = dayKey(now);
            const sentKey = greetingSentStorageKey(currentUser.id, today);
            if (localStorage.getItem(sentKey) === '1') return;

            try {
                const conversationId = await findTeamConversationId();
                if (!conversationId) return;

                const dayStart = new Date();
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date();
                dayEnd.setHours(23, 59, 59, 999);

                const { data: existingMessage, error: existingError } = await supabase
                    .from('chat_messages')
                    .select('id')
                    .eq('conversation_id', conversationId)
                    .eq('message', DAILY_GREETING_MESSAGE)
                    .gte('created_at', dayStart.toISOString())
                    .lte('created_at', dayEnd.toISOString())
                    .limit(1);
                if (existingError) throw existingError;

                if (existingMessage && existingMessage.length > 0) {
                    localStorage.setItem(sentKey, '1');
                    return;
                }

                const { error: messageError } = await supabase.from('chat_messages').insert({
                    conversation_id: conversationId,
                    sender_id: currentUser.id,
                    message: DAILY_GREETING_MESSAGE,
                    attachments: [],
                    mentions: [],
                    reply_to: null,
                    linked_task_id: null,
                    linked_meeting_id: null,
                });
                if (messageError) throw messageError;

                const { data: participantsRows, error: participantsError } = await supabase
                    .from('chat_participants')
                    .select('user_id')
                    .eq('conversation_id', conversationId)
                    .neq('user_id', currentUser.id);
                if (participantsError) throw participantsError;

                const recipients = (participantsRows || []).map((row: any) => row.user_id).filter(Boolean);
                if (recipients.length > 0) {
                    const nowIso = new Date().toISOString();
                    const notifications = recipients.map((userId: string) => ({
                        user_id: userId,
                        type: 'reminder',
                        message: DAILY_GREETING_MESSAGE,
                        read: false,
                        created_at: nowIso,
                    }));
                    const { error: notificationsError } = await supabase.from('notifications').insert(notifications);
                    if (notificationsError) throw notificationsError;
                }

                localStorage.setItem(sentKey, '1');
            } catch (error) {
                console.error('Daily team greeting error:', error);
            }
        };

        void run();
        const interval = window.setInterval(() => {
            void run();
        }, CHECK_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [currentUser]);
}

