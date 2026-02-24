import { useEffect, useMemo, useState } from 'react';
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

const DELETED_MESSAGE_MARKER = '__LUNARIS_DELETED__';
const LEGACY_DELETED_MESSAGE_TEXT = 'Mensaje eliminado';

export function useChat(currentUser: User | null, selectedConversationId?: number | null) {
    const queryClient = useQueryClient();
    const currentUserId = currentUser?.id || '';
    const [deletedConversationIds, setDeletedConversationIds] = useState<number[]>([]);
    const [hiddenConversationIds, setHiddenConversationIds] = useState<number[]>([]);
    const [deletedConversationSignatures, setDeletedConversationSignatures] = useState<string[]>([]);
    const [hiddenConversationSignatures, setHiddenConversationSignatures] = useState<string[]>([]);
    const [deletedMessageIdsGlobal, setDeletedMessageIdsGlobal] = useState<number[]>([]);
    const localHiddenIdsKey = `chat_hidden_conversations_local_v1:${currentUserId || 'anon'}`;
    const localDeletedIdsKey = 'chat_deleted_conversations_local_v1';
    const localHiddenSigsKey = `chat_hidden_conversation_signatures_local_v1:${currentUserId || 'anon'}`;
    const localDeletedSigsKey = 'chat_deleted_conversation_signatures_local_v1';

    useEffect(() => {
        if (!currentUserId) return;
        try {
            const localHiddenIds = JSON.parse(window.localStorage.getItem(localHiddenIdsKey) || '[]');
            const localDeletedIds = JSON.parse(window.localStorage.getItem(localDeletedIdsKey) || '[]');
            const localHiddenSigs = JSON.parse(window.localStorage.getItem(localHiddenSigsKey) || '[]');
            const localDeletedSigs = JSON.parse(window.localStorage.getItem(localDeletedSigsKey) || '[]');
            const localDeletedMsgIds = JSON.parse(window.localStorage.getItem(`chat_deleted_messages_local_v1:${currentUserId}`) || '[]');
            if (Array.isArray(localHiddenIds) && localHiddenIds.length > 0) {
                setHiddenConversationIds(Array.from(new Set(localHiddenIds.map((v: any) => Number(v)).filter(Number.isFinite))));
            }
            if (Array.isArray(localDeletedIds) && localDeletedIds.length > 0) {
                setDeletedConversationIds(Array.from(new Set(localDeletedIds.map((v: any) => Number(v)).filter(Number.isFinite))));
            }
            if (Array.isArray(localHiddenSigs) && localHiddenSigs.length > 0) {
                setHiddenConversationSignatures(Array.from(new Set(localHiddenSigs.map((v: any) => String(v || '').trim()).filter(Boolean))));
            }
            if (Array.isArray(localDeletedSigs) && localDeletedSigs.length > 0) {
                setDeletedConversationSignatures(Array.from(new Set(localDeletedSigs.map((v: any) => String(v || '').trim()).filter(Boolean))));
            }
            if (Array.isArray(localDeletedMsgIds) && localDeletedMsgIds.length > 0) {
                setDeletedMessageIdsGlobal(Array.from(new Set(localDeletedMsgIds.map((v: any) => Number(v)).filter(Number.isFinite))));
            }
        } catch {
            // noop
        }
    }, [currentUserId]);

    useEffect(() => {
        if (!currentUserId) return;
        try {
            window.localStorage.setItem(localHiddenIdsKey, JSON.stringify(hiddenConversationIds || []));
            window.localStorage.setItem(localDeletedIdsKey, JSON.stringify(deletedConversationIds || []));
            window.localStorage.setItem(localHiddenSigsKey, JSON.stringify(hiddenConversationSignatures || []));
            window.localStorage.setItem(localDeletedSigsKey, JSON.stringify(deletedConversationSignatures || []));
            window.localStorage.setItem(`chat_deleted_messages_local_v1:${currentUserId}`, JSON.stringify(deletedMessageIdsGlobal || []));
        } catch {
            // noop
        }
    }, [
        currentUserId,
        hiddenConversationIds,
        deletedConversationIds,
        hiddenConversationSignatures,
        deletedConversationSignatures,
        deletedMessageIdsGlobal,
    ]);

    const addHiddenConversationId = (conversationId: number) =>
        setHiddenConversationIds((prev) => (prev.includes(conversationId) ? prev : [...prev, conversationId]));
    const addDeletedConversationId = (conversationId: number) =>
        setDeletedConversationIds((prev) => (prev.includes(conversationId) ? prev : [...prev, conversationId]));
    const addHiddenConversationSignature = (signature: string) =>
        setHiddenConversationSignatures((prev) => (prev.includes(signature) ? prev : [...prev, signature]));
    const addDeletedConversationSignature = (signature: string) =>
        setDeletedConversationSignatures((prev) => (prev.includes(signature) ? prev : [...prev, signature]));
    const addDeletedMessageIdGlobal = (messageId: number) =>
        setDeletedMessageIdsGlobal((prev) => (prev.includes(messageId) ? prev : [...prev, messageId]));
    const hiddenSet = new Set(hiddenConversationIds.map((id) => Number(id)));
    const deletedSet = new Set(deletedConversationIds.map((id) => Number(id)));
    const hiddenSignatureSet = new Set(hiddenConversationSignatures);
    const deletedSignatureSet = new Set(deletedConversationSignatures);
    const deletedMessageSet = new Set((deletedMessageIdsGlobal || []).map((id) => Number(id)));
    const filterSignature = useMemo(
        () =>
            `${hiddenConversationIds.join(',')}|${deletedConversationIds.join(',')}|${hiddenConversationSignatures.join(',')}|${deletedConversationSignatures.join(',')}`,
        [hiddenConversationIds, deletedConversationIds, hiddenConversationSignatures, deletedConversationSignatures],
    );

    const conversationsKey = ['chat-conversations', currentUser?.id, filterSignature] as const;
    const messagesKey = ['chat-messages', selectedConversationId, (deletedMessageIdsGlobal || []).join(',')] as const;

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

            const signatureOf = (conversation: { kind: 'direct' | 'group'; title: string | null; participants?: string[] }) => {
                const participantsSig = [...(conversation.participants || [])].sort().join('|');
                const titleSig = (conversation.title || '').trim().toLowerCase();
                return conversation.kind === 'direct' ? `direct:${participantsSig}` : `group:${titleSig}:${participantsSig}`;
            };

            const visibleConversations = baseConversations.filter((c) => {
                const sig = signatureOf({ ...c, participants: participantsByConversation.get(c.id) || [] });
                return (
                    !hiddenSet.has(Number(c.id)) &&
                    !deletedSet.has(Number(c.id)) &&
                    !hiddenSignatureSet.has(sig) &&
                    !deletedSignatureSet.has(sig)
                );
            });

            const normalized = visibleConversations
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

            // Deduplica chats con misma firma (directo por par, grupo por título + participantes).
            const seenSignature = new Set<string>();
            const deduped: ChatConversation[] = [];
            for (const conversation of normalized) {
                const participantsSig = [...(conversation.participants || [])].sort().join('|');
                const titleSig = (conversation.title || '').trim().toLowerCase();
                const signature =
                    conversation.kind === 'direct'
                        ? `direct:${participantsSig}`
                        : `group:${titleSig}:${participantsSig}`;
                if (seenSignature.has(signature)) continue;
                seenSignature.add(signature);
                deduped.push(conversation);
            }

            return deduped;
        },
        enabled: !!currentUser,
    });

    const { data: messages = [], isLoading: loadingMessages, error: messagesError } = useQuery<ChatMessageItem[]>({
        queryKey: messagesKey,
        queryFn: async () => {
            if (!currentUser || !selectedConversationId) return [];
            if (hiddenSet.has(Number(selectedConversationId)) || deletedSet.has(Number(selectedConversationId))) return [];

            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, conversation_id, sender_id, message, attachments, mentions, reply_to, linked_task_id, linked_meeting_id, created_at')
                .eq('conversation_id', selectedConversationId)
                .order('created_at', { ascending: true })
                .limit(300);

            if (error) throw error;
            return (data || []).map((row: any) => {
                const isDeleted = deletedMessageSet.has(Number(row.id));
                return {
                    id: row.id,
                    conversation_id: row.conversation_id,
                    sender_id: row.sender_id,
                    message: isDeleted ? DELETED_MESSAGE_MARKER : row.message,
                    attachments: isDeleted ? [] : (row.attachments || []),
                    mentions: isDeleted ? [] : (row.mentions || []),
                    reply_to: isDeleted ? null : (row.reply_to || null),
                    linked_task_id: isDeleted ? null : (row.linked_task_id || null),
                    linked_meeting_id: isDeleted ? null : (row.linked_meeting_id || null),
                    created_at: row.created_at,
                };
            });
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
    }, [currentUser, queryClient, selectedConversationId, conversationsKey]);

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
            const normalizedTitle = (title || '').trim();
            if (!normalizedTitle) throw new Error('El título del chat es obligatorio.');

            const uniqueMembers = Array.from(new Set([currentUser.id, ...participantIds]));
            if (uniqueMembers.length < 2) throw new Error('Selecciona al menos una persona para crear el chat.');

            const { data: conversation, error: conversationError } = await supabase
                .from('chat_conversations')
                .insert({
                    kind,
                    title: normalizedTitle,
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
        mutationFn: async ({
            conversationId,
            deleteForAll,
            signature,
        }: {
            conversationId: number;
            deleteForAll: boolean;
            signature?: string;
        }) => {
            if (!currentUser) throw new Error('No user logged in');
            let targetIds: number[] = [conversationId];

            if (signature) {
                const { data: membershipRows, error: membershipError } = await supabase
                    .from('chat_participants')
                    .select('conversation_id, conversation:chat_conversations(id, kind, title)')
                    .eq('user_id', currentUser.id);

                if (!membershipError && membershipRows && membershipRows.length > 0) {
                    const membershipIds = Array.from(
                        new Set(
                            membershipRows
                                .map((row: any) => Number(row.conversation_id))
                                .filter(Number.isFinite),
                        ),
                    );

                    if (membershipIds.length > 0) {
                        const { data: participantsRows } = await supabase
                            .from('chat_participants')
                            .select('conversation_id, user_id')
                            .in('conversation_id', membershipIds);

                        const participantsByConversation = new Map<number, string[]>();
                        (participantsRows || []).forEach((row: any) => {
                            const convId = Number(row.conversation_id);
                            const list = participantsByConversation.get(convId) || [];
                            list.push(String(row.user_id));
                            participantsByConversation.set(convId, list);
                        });

                        const signatureOf = (conversation: {
                            kind: 'direct' | 'group';
                            title: string | null;
                            participants?: string[];
                        }) => {
                            const participantsSig = [...(conversation.participants || [])].sort().join('|');
                            const titleSig = (conversation.title || '').trim().toLowerCase();
                            return conversation.kind === 'direct'
                                ? `direct:${participantsSig}`
                                : `group:${titleSig}:${participantsSig}`;
                        };

                        const matchingIds = (membershipRows || [])
                            .filter((row: any) => {
                                const conv = row.conversation;
                                if (!conv) return false;
                                return signatureOf({
                                    kind: conv.kind,
                                    title: conv.title,
                                    participants: participantsByConversation.get(Number(conv.id)) || [],
                                }) === signature;
                            })
                            .map((row: any) => Number(row.conversation_id))
                            .filter(Number.isFinite);

                        if (matchingIds.length > 0) {
                            targetIds = Array.from(new Set(matchingIds));
                        }
                    }
                }
            }

            if (deleteForAll) {
                for (const targetId of targetIds) {
                    const deleteQuery = supabase
                        .from('chat_conversations')
                        .delete()
                        .eq('id', targetId);
                    const { data, error } = await (
                        currentUser?.isAdmin
                            ? deleteQuery.select('id')
                            : deleteQuery.eq('created_by', currentUser.id).select('id')
                    );

                    if (error) {
                        // Fallback: mantenemos borrado global lógico aunque RLS no permita hard-delete físico.
                        addDeletedConversationId(targetId);
                        continue;
                    }
                    if (!data || data.length === 0) {
                        if (!currentUser?.isAdmin) {
                            throw new Error('Solo quien creó el chat puede eliminarlo para todo el equipo.');
                        }
                        addDeletedConversationId(targetId);
                        continue;
                    }
                    addDeletedConversationId(targetId);
                }
                if (signature) addDeletedConversationSignature(signature);
                return { conversationId, deleteForAll };
            }

            targetIds.forEach((targetId) => addHiddenConversationId(targetId));
            if (signature) addHiddenConversationSignature(signature);
            const { data, error } = await supabase
                .from('chat_participants')
                .delete()
                .in('conversation_id', targetIds)
                .eq('user_id', currentUser.id)
                .select('user_id');

            if (error) {
                // Fallback local por usuario: aunque falle RLS, se mantiene oculto para no reaparecer.
                return { conversationId, deleteForAll };
            }
            if (!data || data.length === 0) return { conversationId, deleteForAll };
            return { conversationId, deleteForAll };
        },
        onMutate: async ({ conversationId }) => {
            await queryClient.cancelQueries({ queryKey: conversationsKey });
            const previous = queryClient.getQueryData<ChatConversation[]>(conversationsKey) || [];
            queryClient.setQueryData<ChatConversation[]>(
                conversationsKey,
                previous.filter((conversation) => conversation.id !== conversationId),
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(conversationsKey, context.previous);
            }
        },
        onSuccess: ({ conversationId, deleteForAll }) => {
            queryClient.invalidateQueries({ queryKey: ['chat-conversations', currentUser?.id] });
            queryClient.removeQueries({ queryKey: ['chat-messages', conversationId] });
            emitSuccessFeedback(deleteForAll ? 'Chat eliminado para todo el equipo.' : 'Chat eliminado de tu lista.');
        },
    });

    const deleteMessageMutation = useMutation({
        mutationFn: async ({ messageId, conversationId }: { messageId: number; conversationId: number }) => {
            if (!currentUser) throw new Error('No user logged in');

            const { data: target, error: targetError } = await supabase
                .from('chat_messages')
                .select('id, sender_id')
                .eq('id', messageId)
                .eq('conversation_id', conversationId)
                .single();

            if (targetError) throw targetError;
            if (!target) throw new Error('Mensaje no encontrado.');

            const canDelete = target.sender_id === currentUser.id;
            if (!canDelete) {
                throw new Error('Solo puedes eliminar tus propios mensajes.');
            }

            const { error: updateError } = await supabase
                .from('chat_messages')
                .update({
                    message: DELETED_MESSAGE_MARKER,
                    attachments: [],
                    mentions: [],
                    reply_to: null,
                    linked_task_id: null,
                    linked_meeting_id: null,
                })
                .eq('id', messageId)
                .eq('conversation_id', conversationId);

            if (updateError) {
                addDeletedMessageIdGlobal(messageId);
                return { messageId, conversationId };
            }

            addDeletedMessageIdGlobal(messageId);
            return { messageId, conversationId };
        },
        onSuccess: ({ conversationId }) => {
            queryClient.invalidateQueries({ queryKey: conversationsKey });
            queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] });
            emitSuccessFeedback('Mensaje eliminado.');
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
        deletingMessage: deleteMessageMutation.isPending,
        deleteMessage: deleteMessageMutation.mutateAsync,
        deletedMessageMarker: DELETED_MESSAGE_MARKER,
        deletedMessageLegacyText: LEGACY_DELETED_MESSAGE_TEXT,
    };
}
