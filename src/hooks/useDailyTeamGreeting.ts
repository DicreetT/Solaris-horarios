import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { USERS } from '../constants';

const SPAIN_TIMEZONE = 'Europe/Madrid';
const DAILY_GREETING_MESSAGE = 'Buenos días, equipo ☀️ · 09:00 (España)';
const CHECK_INTERVAL_MS = 60 * 1000;

const getSpainDayKey = (date = new Date()) =>
    date.toLocaleDateString('en-CA', { timeZone: SPAIN_TIMEZONE }); // YYYY-MM-DD

const getSpainWeekday = (date = new Date()) =>
    new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: SPAIN_TIMEZONE }).format(date);

const getSpainTime = (date = new Date()) =>
    new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: SPAIN_TIMEZONE,
    }).format(date);

const isPreferredGroupTitle = (title?: string | null) => {
    const value = `${title || ''}`.toLowerCase();
    return value.includes('equipo') || value.includes('solaris') || value.includes('general');
};

const isWeekendInSpain = (date = new Date()) => {
    const weekday = getSpainWeekday(date).toLowerCase();
    return weekday === 'sat' || weekday === 'sun';
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

            const conversationIds = Array.from(
                new Set((memberships || []).map((row: any) => Number(row.conversation_id)).filter(Boolean)),
            );
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

            const teamUsers = USERS.filter((user) => !user.isRestricted);
            const allTeamUserIds = new Set(teamUsers.map((user) => user.id));
            const participantsByConversation = new Map<number, Set<string>>();
            (participantRows || []).forEach((row: any) => {
                const set = participantsByConversation.get(row.conversation_id) || new Set<string>();
                set.add(row.user_id);
                participantsByConversation.set(row.conversation_id, set);
            });

            const scored = conversations.map((conversation: any) => {
                const members = participantsByConversation.get(conversation.id) || new Set<string>();
                const includesWholeTeam = teamUsers.every((user) => members.has(user.id));
                const titlePreferred = isPreferredGroupTitle(conversation.title);
                const participantCount = members.size;

                const score = (includesWholeTeam ? 1000 : 0) + (titlePreferred ? 150 : 0) + participantCount;
                return {
                    id: conversation.id as number,
                    score,
                };
            });

            scored.sort((a, b) => b.score - a.score);
            return scored[0]?.id || null;
        };

        const isWorkingDay = async (dayKey: string, date = new Date()) => {
            const weekend = isWeekendInSpain(date);
            const { data: override, error } = await supabase
                .from('calendar_overrides')
                .select('is_non_working')
                .eq('date_key', dayKey)
                .maybeSingle();

            if (error) {
                // fallback conservative: weekend no laborable, resto laborable
                return !weekend;
            }

            if (!override) return !weekend;
            return !override.is_non_working;
        };

        const run = async () => {
            if (cancelled) return;
            const now = new Date();
            const spainDayKey = getSpainDayKey(now);
            const spainTime = getSpainTime(now);

            // Solo a las 09:00 en punto, hora España.
            if (spainTime !== '09:00') return;

            try {
                const laborable = await isWorkingDay(spainDayKey, now);
                if (!laborable) {
                    return;
                }

                const conversationId = await findTeamConversationId();
                if (!conversationId) return;

                const { data: existingMessage, error: existingError } = await supabase
                    .from('chat_messages')
                    .select('id')
                    .eq('conversation_id', conversationId)
                    .eq('message', DAILY_GREETING_MESSAGE)
                    .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
                    .limit(1);
                if (existingError) throw existingError;

                if (existingMessage && existingMessage.length > 0) {
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
                    const duplicateThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
                    const { data: existingNotifications } = await supabase
                        .from('notifications')
                        .select('user_id')
                        .in('user_id', recipients)
                        .eq('message', DAILY_GREETING_MESSAGE)
                        .gte('created_at', duplicateThreshold);
                    const alreadyNotified = new Set((existingNotifications || []).map((row: any) => row.user_id));
                    const missingRecipients = recipients.filter((id) => !alreadyNotified.has(id));
                    if (missingRecipients.length === 0) return;

                    const nowIso = new Date().toISOString();
                    const notifications = missingRecipients.map((userId: string) => ({
                        user_id: userId,
                        type: 'reminder',
                        message: DAILY_GREETING_MESSAGE,
                        read: false,
                        created_at: nowIso,
                    }));
                    const { error: notificationsError } = await supabase.from('notifications').insert(notifications);
                    if (notificationsError) throw notificationsError;
                }
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
