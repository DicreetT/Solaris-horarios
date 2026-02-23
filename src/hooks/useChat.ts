import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Attachment, User } from '../types';
import { emitSuccessFeedback } from '../utils/uiFeedback';

export interface ChatConversation {
    id: number;
    kind: 'direct' | 'group';
    title: string | null;
    created_by: string;
    created_at: string;
    participants: string[];
    last_message?: {
        id: number;
        message: string;
        sender_id: string;
        created_at: string;
    } | null;
}

export interface ChatMessageItem {
    id: number;
    conversation_id: number;
    sender_id: string;
    message: string;
    attachments: Attachment[];
    mentions: string[];
    reply_to: number | null;
    linked_task_id: number | null;
    linked_meeting_id: number | null;
    created_at: string;
}

interface SendMessageInput {
    conversationId: number;
    message: string;
    attachments?: Attachment[];
    mentions?: string[];
    replyTo?: number | null;
    linkedTaskId?: number | null;
    linkedMeetingId?: number | null;
}

export function useChat(currentUser: User | null, selectedConversationId?: number | null) {
    const queryClient = useQueryClient();

    const conversationsKey = ['chat-conversations', currentUser?.id] as const;
    const messagesKey = ['chat-messages', selectedConversationId] as const;

    const { data: conversations = [], isLoading: loadingConversations, error: conversationsError } = useQuery<ChatConversation[]>({
        queryKey: conversationsKey,
        queryFn: async () => {
            if (!currentUser) return [];

            const { data: membershipRows, error: membershipError } = await supabase
                .from('chat_participants')
                .select('conversation_id, conversation:chat_conversations(*)')
                .eq('user_id', currentUser.id);

            if (membershipError) throw membershipError;

            const baseConversations = (membershipRows || [])
                .map((row: any) => row.conversation)
                .filter(Boolean) as Array<{
                    id: number;
                    kind: 'direct' | 'group';
                    title: string | null;
                    created_by: string;
                    created_at: string;
                }>;

            if (baseConversations.length === 0) return [];
            const conversationIds = baseConversations.map((c) => c.id);

            const [{ data: participantsRows, error: participantsError }, { data: messagesRows, error: messagesError }] = await Promise.all([
                supabase
                    .from('chat_participants')
                    .select('conversation_id, user_id')
                    .in('conversation_id', conversationIds),
                supabase
                    .from('chat_messages')
                    .select('id, conversation_id, message, sender_id, created_at')
                    .in('conversation_id', conversationIds)
                    .order('created_at', { ascending: false }),
            ]);

            if (participantsError) throw participantsError;
            if (messagesError) throw messagesError;

            const participantsByConversation = new Map<number, string[]>();
            (participantsRows || []).forEach((row: any) => {
                const list = participantsByConversation.get(row.conversation_id) || [];
                list.push(row.user_id);
                participantsByConversation.set(row.conversation_id, list);
            });

            const latestByConversation = new Map<number, any>();
            (messagesRows || []).forEach((row: any) => {
                if (!latestByConversation.has(row.conversation_id)) {
                    latestByConversation.set(row.conversation_id, row);
                }
            });

            return baseConversations
                .map((conversation) => ({
                    ...conversation,
                    participants: participantsByConversation.get(conversation.id) || [],
                    last_message: latestByConversation.get(conversation.id) || null,
                }))
                .sort((a, b) => {
                    const aTime = a.last_message?.created_at || a.created_at;
                    const bTime = b.last_message?.created_at || b.created_at;
                    return aTime < bTime ? 1 : -1;
                });
        },
        enabled: !!currentUser,
    });

    const { data: messages = [], isLoading: loadingMessages, error: messagesError } = useQuery<ChatMessageItem[]>({
        queryKey: messagesKey,
        queryFn: async () => {
            if (!currentUser || !selectedConversationId) return [];

            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, conversation_id, sender_id, message, attachments, mentions, reply_to, linked_task_id, linked_meeting_id, created_at')
                .eq('conversation_id', selectedConversationId)
                .order('created_at', { ascending: true })
                .limit(300);

            if (error) throw error;
            return (data || []).map((row: any) => ({
                id: row.id,
                conversation_id: row.conversation_id,
                sender_id: row.sender_id,
                message: row.message,
                attachments: row.attachments || [],
                mentions: row.mentions || [],
                reply_to: row.reply_to || null,
                linked_task_id: row.linked_task_id || null,
                linked_meeting_id: row.linked_meeting_id || null,
                created_at: row.created_at,
            }));
        },
        enabled: !!currentUser && !!selectedConversationId,
    });

    useEffect(() => {
        if (!currentUser) return;

        const channel = supabase
            .channel(`chat-updates-${currentUser.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
                queryClient.invalidateQueries({ queryKey: conversationsKey });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_participants' }, () => {
                queryClient.invalidateQueries({ queryKey: conversationsKey });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload: any) => {
                queryClient.invalidateQueries({ queryKey: conversationsKey });
                const convId = payload.new?.conversation_id || payload.old?.conversation_id;
                if (convId) {
                    queryClient.invalidateQueries({ queryKey: ['chat-messages', convId] });
                } else if (selectedConversationId) {
                    queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedConversationId] });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, queryClient, selectedConversationId]);

    const createConversationMutation = useMutation({
        mutationFn: async ({
            kind,
            title,
            participantIds,
        }: {
            kind: 'direct' | 'group';
            title?: string;
            participantIds: string[];
        }) => {
            if (!currentUser) throw new Error('No user logged in');

            const uniqueMembers = Array.from(new Set([currentUser.id, ...participantIds]));
            if (uniqueMembers.length < 2) throw new Error('Selecciona al menos una persona para crear el chat.');

            const { data: conversation, error: conversationError } = await supabase
                .from('chat_conversations')
                .insert({
                    kind,
                    title: title?.trim() || null,
                    created_by: currentUser.id,
                })
                .select('id')
                .single();

            if (conversationError) throw conversationError;

            const rows = uniqueMembers.map((userId) => ({
                conversation_id: conversation.id,
                user_id: userId,
            }));

            const { error: participantsError } = await supabase.from('chat_participants').insert(rows);
            if (participantsError) throw participantsError;

            return conversation.id as number;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: conversationsKey });
            emitSuccessFeedback('Chat creado con éxito.');
        },
    });

    const sendMessageMutation = useMutation({
        mutationFn: async (input: SendMessageInput) => {
            if (!currentUser) throw new Error('No user logged in');

            const trimmed = (input.message || '').trim();
            const attachments = input.attachments || [];

            if (!trimmed && attachments.length === 0 && !input.linkedTaskId && !input.linkedMeetingId) {
                return;
            }

            const { error } = await supabase.from('chat_messages').insert({
                conversation_id: input.conversationId,
                sender_id: currentUser.id,
                message: trimmed,
                attachments,
                mentions: input.mentions || [],
                reply_to: input.replyTo || null,
                linked_task_id: input.linkedTaskId || null,
                linked_meeting_id: input.linkedMeetingId || null,
            });

            if (error) throw error;

            const { data: participantsRows, error: participantsError } = await supabase
                .from('chat_participants')
                .select('user_id')
                .eq('conversation_id', input.conversationId)
                .neq('user_id', currentUser.id);
            if (participantsError) throw participantsError;

            const recipients = (participantsRows || []).map((row: any) => row.user_id).filter(Boolean);
            if (recipients.length > 0) {
                const preview = (trimmed || '[adjunto]').slice(0, 80);
                const notificationRows = recipients.map((userId: string) => ({
                    user_id: userId,
                    type: 'info',
                    message: `Nuevo mensaje de ${currentUser.name}: ${preview}`,
                    read: false,
                    created_at: new Date().toISOString(),
                }));
                const { error: notificationsError } = await supabase.from('notifications').insert(notificationRows);
                if (notificationsError) throw notificationsError;
            }
        },
        onSuccess: (_, input) => {
            queryClient.invalidateQueries({ queryKey: conversationsKey });
            queryClient.invalidateQueries({ queryKey: ['chat-messages', input.conversationId] });
        },
    });

    const removeConversationMutation = useMutation({
        mutationFn: async (conversationId: number) => {
            if (!currentUser) throw new Error('No user logged in');

            const { data, error } = await supabase
                .from('chat_participants')
                .delete()
                .eq('conversation_id', conversationId)
                .eq('user_id', currentUser.id)
                .select('user_id');

            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error('No se pudo eliminar el chat de tu lista (revisa permisos de RLS en chat_participants).');
            }
            return conversationId;
        },
        onMutate: async (conversationId) => {
            await queryClient.cancelQueries({ queryKey: conversationsKey });
            const previous = queryClient.getQueryData<ChatConversation[]>(conversationsKey) || [];
            queryClient.setQueryData<ChatConversation[]>(
                conversationsKey,
                previous.filter((conversation) => conversation.id !== conversationId),
            );
            return { previous };
        },
        onError: (_error, _conversationId, context) => {
            if (context?.previous) {
                queryClient.setQueryData(conversationsKey, context.previous);
            }
        },
        onSuccess: (conversationId) => {
            queryClient.invalidateQueries({ queryKey: conversationsKey });
            queryClient.removeQueries({ queryKey: ['chat-messages', conversationId] });
            emitSuccessFeedback('Chat eliminado de tu lista.');
        },
    });

    return {
        conversations,
        messages,
        loadingConversations,
        loadingMessages,
        conversationsError,
        messagesError,
        creatingConversation: createConversationMutation.isPending,
        createConversationError: createConversationMutation.error,
        sendingMessage: sendMessageMutation.isPending,
        sendMessageError: sendMessageMutation.error,
        createConversation: createConversationMutation.mutateAsync,
        sendMessage: sendMessageMutation.mutateAsync,
        removingConversation: removeConversationMutation.isPending,
        removeConversation: removeConversationMutation.mutateAsync,
    };
}
