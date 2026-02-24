import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageCircle, Mic, Plus, Reply, Send, Square, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../hooks/useChat';
import { USERS } from '../constants';
import { FileUploader, Attachment } from '../components/FileUploader';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useAbsences } from '../hooks/useAbsences';
import { formatDateTimePretty } from '../utils/dateUtils';
import TaskDetailModal from '../components/TaskDetailModal';
import { Todo } from '../types';
import { supabase } from '../lib/supabase';
import { linkifyTextNodes } from '../components/LinkifiedText';

const userNameById = (id: string) => USERS.find((u) => u.id === id)?.name || `Usuario ${id.slice(0, 6)}`;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type LunarisAttachType = 'task' | 'meeting_suggestion' | 'absence' | 'vacation';

function ChatPage() {
    const { currentUser } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const [messageDraft, setMessageDraft] = useState('');
    const [messageAttachments, setMessageAttachments] = useState<Attachment[]>([]);
    const [replyToId, setReplyToId] = useState<number | null>(null);
    const [mentionedIds, setMentionedIds] = useState<string[]>([]);

    const [linkedTaskId, setLinkedTaskId] = useState<number | null>(null);
    const [linkedMeetingId, setLinkedMeetingId] = useState<number | null>(null);
    const [linkedAbsenceId, setLinkedAbsenceId] = useState<number | null>(null);
    const [linkedAbsenceKind, setLinkedAbsenceKind] = useState<'absence' | 'vacation' | null>(null);

    const [attachMode, setAttachMode] = useState<'none' | 'device' | 'lunaris'>('none');
    const [lunarisAttachType, setLunarisAttachType] = useState<LunarisAttachType>('task');

    const [chatTitle, setChatTitle] = useState('');
    const [chatMembers, setChatMembers] = useState<string[]>([]);
    const [chatActionError, setChatActionError] = useState<string | null>(null);
    const [selectedTask, setSelectedTask] = useState<Todo | null>(null);

    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);
    const [transcribingAudioAttachments, setTranscribingAudioAttachments] = useState(false);
    const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const recognitionRef = useRef<any>(null);
    const openingDirectRef = useRef<string | null>(null);

    const { todos } = useTodos(currentUser);
    const { meetingRequests } = useMeetings(currentUser);
    const { absenceRequests } = useAbsences(currentUser);

    const {
        conversations,
        messages,
        loadingConversations,
        loadingMessages,
        conversationsError,
        messagesError,
        creatingConversation,
        createConversation,
        sendMessage,
        removeConversation,
        removingConversation,
    } = useChat(currentUser, selectedConversationId);

    const selectedConversation = conversations.find((c) => c.id === selectedConversationId) || null;

    const conversationName = (conversation: any) => {
        if (conversation.kind === 'group') {
            return conversation.title || `Grupo (${conversation.participants.length})`;
        }
        const otherUser = conversation.participants.find((id: string) => id !== currentUser?.id);
        return otherUser ? userNameById(otherUser) : 'Chat directo';
    };

    const messageById = useMemo(() => {
        const map = new Map<number, any>();
        messages.forEach((m) => map.set(m.id, m));
        return map;
    }, [messages]);

    const canCreateGroup = chatMembers.length >= 2;

    useEffect(() => {
        if (!selectedConversationId && conversations.length > 0) {
            setSelectedConversationId(conversations[0].id);
        }
    }, [conversations, selectedConversationId]);

    useEffect(() => {
        const directUserId = searchParams.get('user');
        if (!currentUser || !directUserId || directUserId === currentUser.id) return;

        const clearUserParam = () => {
            const params = new URLSearchParams(searchParams);
            params.delete('user');
            setSearchParams(params, { replace: true });
        };

        const existingDirect = conversations.find((conversation) => {
            if (conversation.kind !== 'direct') return false;
            const others = conversation.participants.filter((id) => id !== currentUser.id);
            return others.length === 1 && others[0] === directUserId;
        });

        if (existingDirect) {
            setSelectedConversationId(existingDirect.id);
            clearUserParam();
            return;
        }

        if (openingDirectRef.current === directUserId || creatingConversation) return;

        openingDirectRef.current = directUserId;
        createConversation({
            kind: 'direct',
            participantIds: [directUserId],
        })
            .then((conversationId) => {
                setSelectedConversationId(conversationId);
            })
            .catch((error: any) => {
                setChatActionError(error?.message || 'No se pudo abrir el chat directo.');
            })
            .finally(() => {
                openingDirectRef.current = null;
                clearUserParam();
            });
    }, [searchParams, setSearchParams, currentUser, conversations, createConversation, creatingConversation]);

    const createNewChat = async () => {
        if (!currentUser) return;
        if (chatMembers.length === 0) {
            setChatActionError('Selecciona al menos una persona para crear el chat.');
            return;
        }

        setChatActionError(null);

        const membersSorted = [...chatMembers].sort();
        if (membersSorted.length === 1) {
            const already = conversations.find((conversation) => {
                if (conversation.kind !== 'direct') return false;
                const others = conversation.participants.filter((id) => id !== currentUser.id).sort();
                return others.length === 1 && others[0] === membersSorted[0];
            });
            if (already) {
                setSelectedConversationId(already.id);
                setShowCreateModal(false);
                return;
            }
        }

        try {
            const id = await createConversation({
                kind: chatMembers.length > 1 ? 'group' : 'direct',
                title: chatMembers.length > 1 ? chatTitle.trim() : undefined,
                participantIds: chatMembers,
            });
            setSelectedConversationId(id);
            setChatTitle('');
            setChatMembers([]);
            setShowCreateModal(false);
        } catch (error: any) {
            const message = `${error?.message || ''}`;
            if (message.toLowerCase().includes('row-level security') || message.toLowerCase().includes('policy')) {
                setChatActionError('Permisos de chat incompletos en Supabase (RLS). Te paso el SQL de corrección.');
                return;
            }
            if (message.includes('relation') || message.includes('does not exist')) {
                setChatActionError('El chat no está configurado en la base de datos. Falta aplicar la migración nueva de chat.');
                return;
            }
            setChatActionError(message || 'No se pudo crear el chat.');
        }
    };

    const handleRemoveConversation = async (conversation: any) => {
        const isOwner = conversation?.created_by === currentUser?.id;
        const ok = window.confirm(
            isOwner
                ? '¿Eliminar este chat para todo el equipo? Esta acción no se puede deshacer.'
                : '¿Seguro que quieres eliminar este chat de tu lista?',
        );
        if (!ok) return;
        setChatActionError(null);
        try {
            await removeConversation({
                conversationId: conversation.id,
                deleteForAll: isOwner,
            });
            if (selectedConversationId === conversation.id) {
                setSelectedConversationId(null);
            }
        } catch (error: any) {
            const message = `${error?.message || ''}`.toLowerCase();
            if (message.includes('row-level security') || message.includes('policy')) {
                setChatActionError('No se pudo eliminar por permisos de chat (RLS). Hay que aplicar la migración nueva de chat.');
                return;
            }
            setChatActionError(error?.message || 'No se pudo eliminar el chat.');
        }
    };

    const selectedTasks = todos
        .filter((todo) => todo.assigned_to.includes(currentUser?.id || '') && !todo.completed_by.includes(currentUser?.id || ''))
        .slice(0, 30);

    const selectedMeetings = meetingRequests
        .filter((meeting) => meeting.created_by === currentUser?.id || (meeting.participants || []).includes(currentUser?.id || ''))
        .slice(0, 30);

    const selectedAbsences = absenceRequests
        .filter((absence: any) => absence.type !== 'vacation')
        .filter((absence: any) => absence.created_by === currentUser?.id || currentUser?.isAdmin)
        .slice(0, 30);

    const selectedVacations = absenceRequests
        .filter((absence: any) => absence.type === 'vacation')
        .filter((absence: any) => absence.created_by === currentUser?.id || currentUser?.isAdmin)
        .slice(0, 30);

    const selectedConversationParticipants = selectedConversation?.participants || [];

    useEffect(() => {
        const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!Ctor) {
            setSpeechSupported(false);
            return;
        }
        setSpeechSupported(true);
        const recognition = new Ctor();
        recognition.lang = 'es-ES';
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onresult = (event: any) => {
            const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
            if (!transcript) return;
            setMessageDraft((prev) => `${prev}${prev ? ' ' : ''}${transcript}`);
        };
        recognition.onend = () => setIsTranscribing(false);
        recognition.onerror = () => setIsTranscribing(false);
        recognitionRef.current = recognition;

        return () => {
            try {
                recognition.stop();
            } catch {
                // noop
            }
        };
    }, []);

    useEffect(() => {
        if (!messagesContainerRef.current) return;
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }, [selectedConversationId, messages.length]);

    const mentionCandidates = useMemo(() => {
        const pool = selectedConversationParticipants.length > 0
            ? selectedConversationParticipants
                .filter((id) => id !== currentUser?.id)
                .map((id) => ({ id, name: userNameById(id) }))
            : USERS.filter((user) => user.id !== currentUser?.id);

        return pool
            .filter((user) => user.name.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 8);
    }, [currentUser, mentionQuery, selectedConversationParticipants]);

    const sendCurrentMessage = async () => {
        if (!selectedConversationId) return;

        let messageWithAbsence = linkedAbsenceId
            ? `${messageDraft}${messageDraft ? '\n' : ''}Solicitud vinculada #${linkedAbsenceId} (${linkedAbsenceKind === 'vacation' ? 'vacaciones' : 'ausencia'})`
            : messageDraft;

        const audioAttachments = messageAttachments.filter((file) => file.type?.startsWith('audio/'));
        if (audioAttachments.length > 0) {
            setTranscribingAudioAttachments(true);
            try {
                const results = await Promise.all(
                    audioAttachments.map(async (file) => {
                        const { data, error } = await supabase.functions.invoke('transcribe-audio', {
                            body: {
                                audioUrl: file.url,
                                fileName: file.name,
                                language: 'es',
                            },
                        });

                        if (error) return null;
                        const text = `${data?.text || ''}`.trim();
                        if (!text) return null;
                        return `- ${file.name}: ${text}`;
                    }),
                );

                const transcripts = results.filter(Boolean) as string[];
                if (transcripts.length > 0) {
                    messageWithAbsence = `${messageWithAbsence}${messageWithAbsence ? '\n\n' : ''}Transcripción automática:\n${transcripts.join('\n')}`;
                }
            } finally {
                setTranscribingAudioAttachments(false);
            }
        }

        await sendMessage({
            conversationId: selectedConversationId,
            message: messageWithAbsence,
            attachments: messageAttachments,
            mentions: mentionedIds,
            replyTo: replyToId,
            linkedTaskId,
            linkedMeetingId,
        });

        setMessageDraft('');
        setMessageAttachments([]);
        setMentionedIds([]);
        setReplyToId(null);
        setLinkedTaskId(null);
        setLinkedMeetingId(null);
        setLinkedAbsenceId(null);
        setLinkedAbsenceKind(null);
        setAttachMode('none');
        setLunarisAttachType('task');
        setMentionOpen(false);
        setMentionQuery('');
        setMentionStartIndex(null);
    };

    const handleMessageInput = (value: string, cursorPos: number) => {
        setMessageDraft(value);

        const beforeCursor = value.slice(0, cursorPos);
        const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/);
        if (!match) {
            setMentionOpen(false);
            setMentionQuery('');
            setMentionStartIndex(null);
            return;
        }

        const query = match[2] || '';
        const start = cursorPos - query.length - 1;
        setMentionQuery(query);
        setMentionStartIndex(start);
        setMentionOpen(true);
    };

    const pickMention = (userId: string) => {
        if (mentionStartIndex === null) return;
        const input = messageInputRef.current;
        if (!input) return;

        const name = userNameById(userId);
        const cursorPos = input.selectionStart ?? messageDraft.length;
        const before = messageDraft.slice(0, mentionStartIndex);
        const after = messageDraft.slice(cursorPos);
        const nextValue = `${before}@${name} ${after}`;

        setMessageDraft(nextValue);
        setMentionedIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
        setMentionOpen(false);
        setMentionQuery('');
        setMentionStartIndex(null);

        requestAnimationFrame(() => {
            const pos = `${before}@${name} `.length;
            input.focus();
            input.setSelectionRange(pos, pos);
        });
    };

    const renderMessageWithMentions = (text: string, mentionIds: string[]) => {
        const names = mentionIds.map((id) => userNameById(id)).filter(Boolean);
        if (names.length === 0) {
            return (
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                    {linkifyTextNodes(text, 'underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800')}
                </p>
            );
        }

        const pattern = names.map((name) => `@${escapeRegex(name)}`).join('|');
        if (!pattern) {
            return (
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                    {linkifyTextNodes(text, 'underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800')}
                </p>
            );
        }
        const regex = new RegExp(`(${pattern})`, 'g');
        const parts = text.split(regex);

        return (
            <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {parts.map((part, idx) => {
                    const isMention = names.some((name) => part === `@${name}`);
                    if (!isMention) {
                        return (
                            <React.Fragment key={idx}>
                                {linkifyTextNodes(part, 'underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800')}
                            </React.Fragment>
                        );
                    }
                    return (
                        <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 font-bold">
                            {part}
                        </span>
                    );
                })}
            </p>
        );
    };

    const toggleTranscription = () => {
        if (!speechSupported || !recognitionRef.current) return;
        if (isTranscribing) {
            recognitionRef.current.stop();
            setIsTranscribing(false);
            return;
        }
        try {
            setIsTranscribing(true);
            recognitionRef.current.start();
        } catch {
            setIsTranscribing(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto h-[calc(100dvh-8rem)] overflow-hidden">
            <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 h-full min-h-0">
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-xl font-black text-gray-900">Chat interno</h1>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="p-2 rounded-xl bg-violet-700 text-white"
                            title="Nuevo chat"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                        {chatActionError && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                                {chatActionError}
                            </p>
                        )}
                        {conversationsError && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                                Error cargando chats: {(conversationsError as any)?.message || 'Revisa la configuración del chat.'}
                            </p>
                        )}
                        {loadingConversations && <p className="text-sm text-gray-500">Cargando chats...</p>}
                        {!loadingConversations && conversations.length === 0 && (
                            <p className="text-sm text-gray-500 italic">No tienes chats todavía. Crea uno nuevo.</p>
                        )}

                        {conversations.map((conversation) => (
                            <div
                                key={conversation.id}
                                className={`w-full p-2 rounded-2xl border transition ${
                                    selectedConversationId === conversation.id
                                        ? 'bg-violet-50 border-violet-200'
                                        : 'bg-white border-gray-200 hover:border-violet-200'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setSelectedConversationId(conversation.id)}
                                        className="flex-1 text-left p-1"
                                    >
                                        <p className="text-sm font-bold text-gray-900 truncate">{conversationName(conversation)}</p>
                                        <p className="text-xs text-gray-500 truncate mt-1">
                                            {conversation.last_message?.message || 'Sin mensajes aún'}
                                        </p>
                                    </button>
                                    <button
                                        onClick={() => void handleRemoveConversation(conversation)}
                                        disabled={removingConversation}
                                        className="p-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60"
                                        title="Eliminar chat"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
                    {!selectedConversation ? (
                        <div className="flex-1 flex items-center justify-center p-8 text-center">
                            <div>
                                <MessageCircle className="mx-auto text-gray-300 mb-2" size={36} />
                                <p className="text-gray-500">Selecciona un chat o crea uno nuevo.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="p-4 border-b border-gray-100">
                                <h2 className="text-lg font-black text-gray-900">{conversationName(selectedConversation)}</h2>
                                <p className="text-xs text-gray-500">
                                    {selectedConversationParticipants.map((id) => userNameById(id)).join(', ')}
                                </p>
                            </div>

                            <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
                                {messagesError && (
                                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                                        Error cargando mensajes: {(messagesError as any)?.message || 'Intenta de nuevo.'}
                                    </p>
                                )}
                                {loadingMessages && <p className="text-sm text-gray-500">Cargando mensajes...</p>}
                                {!loadingMessages && messages.length === 0 && (
                                    <p className="text-sm text-gray-500 italic">Aún no hay mensajes en este chat.</p>
                                )}

                                {messages.map((msg) => {
                                    const mine = msg.sender_id === currentUser?.id;
                                    const replyMessage = msg.reply_to ? messageById.get(msg.reply_to) : null;

                                    return (
                                        <div key={msg.id} className={`max-w-[80%] ${mine ? 'ml-auto' : 'mr-auto'}`}>
                                            <div className={`rounded-2xl p-3 border ${mine ? 'bg-violet-50 border-violet-200' : 'bg-gray-50 border-gray-200'}`}>
                                                <p className="text-xs font-bold text-gray-500 mb-1">{userNameById(msg.sender_id)}</p>

                                                {replyMessage && (
                                                    <div className="mb-2 text-xs p-2 rounded-lg bg-white border border-gray-200 text-gray-600">
                                                        Respondiendo a: {(replyMessage.message || '[adjunto]').slice(0, 80)}
                                                    </div>
                                                )}

                                                {msg.message && renderMessageWithMentions(msg.message, msg.mentions || [])}

                                                {msg.linked_task_id && (
                                                    <div className="mt-2 text-xs">
                                                        <button
                                                            onClick={() => {
                                                                const task = todos.find((t) => t.id === msg.linked_task_id);
                                                                if (task) {
                                                                    setSelectedTask(task);
                                                                }
                                                            }}
                                                            className="text-violet-700 font-bold hover:underline"
                                                        >
                                                            Tarea vinculada #{msg.linked_task_id}
                                                        </button>
                                                    </div>
                                                )}
                                                {msg.linked_meeting_id && (
                                                    <div className="mt-1 text-xs">
                                                        <Link to="/meetings" className="text-violet-700 font-bold">Reunión vinculada #{msg.linked_meeting_id}</Link>
                                                    </div>
                                                )}
                                                {msg.message.includes('Solicitud vinculada #') && (
                                                    <div className="mt-1 text-xs">
                                                        <Link to="/absences" className="text-violet-700 font-bold">Ver solicitud vinculada</Link>
                                                    </div>
                                                )}

                                                {msg.attachments?.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {msg.attachments.map((file, idx) => (
                                                            <div key={`${msg.id}-${idx}`} className="space-y-1">
                                                                {file.type?.startsWith('audio/') && (
                                                                    <audio controls src={file.url} className="w-full max-w-xs" preload="metadata" />
                                                                )}
                                                                {file.type?.startsWith('video/') && (
                                                                    <video controls src={file.url} className="w-full max-w-sm rounded-lg border border-gray-200" preload="metadata" />
                                                                )}
                                                                <a
                                                                    href={file.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="block text-xs text-violet-700 font-semibold hover:underline"
                                                                >
                                                                    {file.name}
                                                                </a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                                                    <span>{formatDateTimePretty(new Date(msg.created_at))}</span>
                                                    <button
                                                        onClick={() => setReplyToId(msg.id)}
                                                        className="inline-flex items-center gap-1 text-violet-700 font-bold"
                                                    >
                                                        <Reply size={12} /> Responder
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="p-4 border-t border-gray-100 space-y-3 bg-white">
                                {replyToId && (
                                    <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2 flex items-center justify-between">
                                        <span>Respondiendo a: {(messageById.get(replyToId)?.message || '[adjunto]').slice(0, 80)}</span>
                                        <button onClick={() => setReplyToId(null)} className="font-bold text-violet-700">Quitar</button>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-gray-600">Adjuntar</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setAttachMode((prev) => (prev === 'device' ? 'none' : 'device'))}
                                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${attachMode === 'device' ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-gray-200 text-gray-700'}`}
                                        >
                                            Desde tu dispositivo
                                        </button>
                                        <button
                                            onClick={() => setAttachMode((prev) => (prev === 'lunaris' ? 'none' : 'lunaris'))}
                                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${attachMode === 'lunaris' ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-gray-200 text-gray-700'}`}
                                        >
                                            Desde Lunaris
                                        </button>
                                    </div>

                                    {attachMode === 'device' && (
                                        <FileUploader
                                            onUploadComplete={setMessageAttachments}
                                            existingFiles={messageAttachments}
                                            folderPath="chat"
                                            acceptedTypes="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                                            compact
                                        />
                                    )}

                                    {attachMode === 'lunaris' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <select
                                                value={lunarisAttachType}
                                                onChange={(e) => {
                                                    const t = e.target.value as LunarisAttachType;
                                                    setLunarisAttachType(t);
                                                    setLinkedTaskId(null);
                                                    setLinkedMeetingId(null);
                                                    setLinkedAbsenceId(null);
                                                    setLinkedAbsenceKind(null);
                                                }}
                                                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                            >
                                                <option value="task">Adjuntar tarea</option>
                                                <option value="meeting_suggestion">Adjuntar reunión/sugerencia</option>
                                                <option value="absence">Adjuntar ausencia</option>
                                                <option value="vacation">Adjuntar vacaciones</option>
                                            </select>

                                            {lunarisAttachType === 'task' && (
                                                <select
                                                    value={linkedTaskId || ''}
                                                    onChange={(e) => setLinkedTaskId(e.target.value ? Number(e.target.value) : null)}
                                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                                >
                                                    <option value="">Selecciona tarea pendiente</option>
                                                    {selectedTasks.map((todo) => (
                                                        <option key={todo.id} value={todo.id}>
                                                            {(USERS.find((u) => u.id === todo.created_by)?.name || 'Sin nombre')} · {todo.title}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}

                                            {lunarisAttachType === 'meeting_suggestion' && (
                                                <select
                                                    value={linkedMeetingId || ''}
                                                    onChange={(e) => setLinkedMeetingId(e.target.value ? Number(e.target.value) : null)}
                                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                                >
                                                    <option value="">Selecciona reunión/sugerencia</option>
                                                    {selectedMeetings.map((meeting) => (
                                                        <option key={meeting.id} value={meeting.id}>
                                                            {(USERS.find((u) => u.id === meeting.created_by)?.name || 'Sin nombre')} · {meeting.title}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}

                                            {lunarisAttachType === 'absence' && (
                                                <select
                                                    value={linkedAbsenceId || ''}
                                                    onChange={(e) => {
                                                        setLinkedAbsenceId(e.target.value ? Number(e.target.value) : null);
                                                        setLinkedAbsenceKind(e.target.value ? 'absence' : null);
                                                    }}
                                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                                >
                                                    <option value="">Selecciona ausencia</option>
                                                    {selectedAbsences.map((absence: any) => (
                                                        <option key={absence.id} value={absence.id}>
                                                            {(USERS.find((u) => u.id === absence.created_by)?.name || 'Sin nombre')} · {absence.date_key} · {absence.type}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}

                                            {lunarisAttachType === 'vacation' && (
                                                <select
                                                    value={linkedAbsenceId || ''}
                                                    onChange={(e) => {
                                                        setLinkedAbsenceId(e.target.value ? Number(e.target.value) : null);
                                                        setLinkedAbsenceKind(e.target.value ? 'vacation' : null);
                                                    }}
                                                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                                >
                                                    <option value="">Selecciona vacaciones</option>
                                                    {selectedVacations.map((absence: any) => (
                                                        <option key={absence.id} value={absence.id}>
                                                            {(USERS.find((u) => u.id === absence.created_by)?.name || 'Sin nombre')} · {absence.date_key}{absence.end_date ? ` a ${absence.end_date}` : ''} · vacaciones
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <div className="flex gap-2">
                                        <textarea
                                            ref={messageInputRef}
                                            value={messageDraft}
                                            onChange={(e) => handleMessageInput(e.target.value, e.target.selectionStart || 0)}
                                            onKeyUp={(e) => handleMessageInput(e.currentTarget.value, e.currentTarget.selectionStart || 0)}
                                            rows={2}
                                            placeholder="Escribe un mensaje..."
                                            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        />
                                        <button
                                            onClick={toggleTranscription}
                                            disabled={!speechSupported}
                                            className={`px-3 py-2 rounded-xl border ${
                                                isTranscribing
                                                    ? 'bg-red-50 border-red-300 text-red-700'
                                                    : speechSupported
                                                        ? 'bg-white border-gray-200 text-gray-700 hover:border-violet-300'
                                                        : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                            }`}
                                            title={speechSupported ? (isTranscribing ? 'Detener transcripción' : 'Transcribir voz a texto') : 'No compatible en este navegador'}
                                        >
                                            {isTranscribing ? <Square size={16} /> : <Mic size={16} />}
                                        </button>
                                        <button
                                            onClick={sendCurrentMessage}
                                            disabled={transcribingAudioAttachments}
                                            className={`px-3 py-2 rounded-xl text-white ${transcribingAudioAttachments ? 'bg-violet-400 cursor-not-allowed' : 'bg-violet-700'}`}
                                            title="Enviar"
                                        >
                                            {transcribingAudioAttachments ? <Square size={16} /> : <Send size={16} />}
                                        </button>
                                    </div>
                                    {transcribingAudioAttachments && (
                                        <p className="mt-1 text-[11px] text-violet-600 font-semibold">
                                            Transcribiendo audio adjunto...
                                        </p>
                                    )}

                                    {mentionOpen && mentionCandidates.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full max-w-sm border border-gray-200 rounded-xl bg-white shadow-sm max-h-36 overflow-y-auto">
                                            {mentionCandidates.map((user) => (
                                                <button
                                                    key={user.id}
                                                    onClick={() => pickMention(user.id)}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                                >
                                                    @{user.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showCreateModal && (
                <div className="app-modal-overlay">
                    <div className="app-modal-panel w-full max-w-lg bg-white rounded-3xl border border-gray-200 shadow-2xl p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-black text-gray-900">Nuevo chat</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-sm font-bold text-violet-700">Cerrar</button>
                        </div>

                        <div className="space-y-3">
                            {chatActionError && (
                                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                                    {chatActionError}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">Título del grupo (opcional)</label>
                                <input
                                    value={chatTitle}
                                    onChange={(e) => setChatTitle(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    placeholder={canCreateGroup ? 'Ej: Ventas · Semana 9' : 'Solo para chats grupales'}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">Personas</label>
                                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border border-gray-200 rounded-xl p-2">
                                    {USERS.filter((user) => user.id !== currentUser?.id).map((user) => (
                                        <label key={user.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={chatMembers.includes(user.id)}
                                                onChange={() => {
                                                    setChatMembers((prev) =>
                                                        prev.includes(user.id)
                                                            ? prev.filter((id) => id !== user.id)
                                                            : [...prev, user.id],
                                                    );
                                                }}
                                            />
                                            <span className="text-sm text-gray-700">{user.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-bold"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={createNewChat}
                                disabled={chatMembers.length === 0 || creatingConversation}
                                className={`px-3 py-2 rounded-xl text-white text-sm font-bold ${chatMembers.length === 0 || creatingConversation ? 'bg-violet-300 cursor-not-allowed' : 'bg-violet-700'}`}
                            >
                                {creatingConversation ? 'Creando...' : 'Crear chat'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {selectedTask && (
                <TaskDetailModal
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                />
            )}
        </div>
    );
}

export default ChatPage;
