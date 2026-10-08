import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useNotifications } from './useNotifications';
import { supabase } from '../lib/supabase';
import { User, Todo } from '../types';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { USERS } from '../constants';

const EMPTY_ARRAY: Todo[] = [];
const EMPTY_GRACE_MS = 120000;

function normalizeTodo(row: any): Todo {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        created_by: row.created_by,
        assigned_to: row.assigned_to || [],
        due_date_key: row.due_date_key,
        completed_by: row.completed_by || [],
        attachments: row.attachments || [],
        comments: row.comments || [],
        tags: row.tags || [],
        created_at: row.created_at,
    };
}

function readTodosCache(userId?: string) {
    if (!userId || typeof window === 'undefined') return EMPTY_ARRAY;
    try {
        const raw = window.localStorage.getItem(`todos_cache_${userId}`);
        if (!raw) return EMPTY_ARRAY;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Todo[]) : EMPTY_ARRAY;
    } catch {
        return EMPTY_ARRAY;
    }
}

function writeTodosCache(userId: string, todos: Todo[]) {
    if (!userId || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(`todos_cache_${userId}`, JSON.stringify(todos));
    } catch {
        // noop
    }
}

function userCanSeeTodo(userId: string | undefined, todo: Todo) {
    if (!userId) return false;
    const user = USERS.find((item) => item.id === userId);
    if (user?.isAdmin) return true;
    return todo.created_by === userId || (todo.assigned_to || []).includes(userId);
}

function replaceOrInsertTodo(list: Todo[], todo: Todo, userId?: string) {
    const nextWithoutTodo = list.filter((item) => item.id !== todo.id);
    if (!userCanSeeTodo(userId, todo)) return nextWithoutTodo;
    return [todo, ...nextWithoutTodo].sort((a, b) => {
        if (a.due_date_key && b.due_date_key && a.due_date_key !== b.due_date_key) {
            return a.due_date_key.localeCompare(b.due_date_key);
        }
        if (a.due_date_key && !b.due_date_key) return -1;
        if (!a.due_date_key && b.due_date_key) return 1;
        return Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
    });
}

function updateTodoCaches(
    queryClient: QueryClient,
    updater: (todos: Todo[], userId?: string) => Todo[],
) {
    queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] }).forEach(([queryKey, current]) => {
        if (!Array.isArray(current)) return;
        const userId = Array.isArray(queryKey) ? String(queryKey[1] || '') : '';
        const next = updater(current, userId);
        queryClient.setQueryData(queryKey as QueryKey, next);
        if (userId) writeTodosCache(userId, next);
    });
}

const MANUAL_MENTION_ALIASES: Record<string, string[]> = {
    '6bafcb97-6a1b-4224-adbb-1340b86ffeb9': ['anabela', 'anabella'],
};

function normalizeMentionText(value: unknown) {
    return `${value || ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function findMentionedUserIds(...values: unknown[]) {
    const text = ` ${normalizeMentionText(values.join(' '))} `;
    return USERS.filter((user) => {
        const name = normalizeMentionText(user.name);
        const firstName = name.split(/\s+/)[0];
        const aliases = Array.from(new Set([
            name,
            firstName,
            normalizeMentionText(user.email.split('@')[0]),
            ...(MANUAL_MENTION_ALIASES[user.id] || []),
        ].filter((alias) => alias.length >= 3)));

        return aliases.some((alias) => text.includes(`@${alias}`));
    }).map((user) => user.id);
}

export function useTodos(currentUser: User | null) {
    const queryClient = useQueryClient();
    const { addNotification } = useNotifications(currentUser);
    const lastNonEmptyTodosRef = useRef<Todo[]>([]);
    const lastNonEmptyAtRef = useRef(0);

    useEffect(() => {
        if (!currentUser?.id) {
            lastNonEmptyTodosRef.current = EMPTY_ARRAY;
            lastNonEmptyAtRef.current = 0;
            return;
        }
        const cached = readTodosCache(currentUser.id);
        if (cached.length > 0) {
            lastNonEmptyTodosRef.current = cached;
            lastNonEmptyAtRef.current = Date.now();
            queryClient.setQueryData(['todos', currentUser.id], cached);
        }
    }, [currentUser?.id, queryClient]);

    const { data: todos = EMPTY_ARRAY, isLoading, error } = useQuery({
        queryKey: ['todos', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            const { data, error } = await supabase
                .from('todos')
                .select('id, title, description, created_by, assigned_to, due_date_key, completed_by, attachments, comments, tags, created_at')
                .order('due_date_key', { ascending: true, nullsFirst: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped = (data || []).map(normalizeTodo);

            const visible = currentUser.isAdmin
                ? mapped
                : mapped.filter(
                (t) =>
                    t.created_by === currentUser.id ||
                    (t.assigned_to || []).includes(currentUser.id)
            );

            if (visible.length > 0) {
                lastNonEmptyTodosRef.current = visible;
                lastNonEmptyAtRef.current = Date.now();
                writeTodosCache(currentUser.id, visible);
                return visible;
            }

            const hasRecentNonEmpty =
                lastNonEmptyTodosRef.current.length > 0 &&
                Date.now() - lastNonEmptyAtRef.current < EMPTY_GRACE_MS;
            if (hasRecentNonEmpty) {
                window.setTimeout(() => {
                    queryClient.invalidateQueries({ queryKey: ['todos', currentUser.id] });
                }, 1200);
                return lastNonEmptyTodosRef.current;
            }

            return visible;
        },
        enabled: !!currentUser,
    });

    // Realtime Subscription for Todos
    // This allows the sidebar badge (and task list) to update instantly when a new task is assigned.
    useEffect(() => {
        if (!currentUser) return;

        const channel = supabase
            .channel(`todos_realtime_${currentUser.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'todos' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['todos', currentUser.id] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, queryClient]);

    const createTodoMutation = useMutation({
        mutationFn: async ({ title, description, assignedTo, dueDateKey, attachments, tags }: {
            title: string;
            description: string;
            assignedTo: string[];
            dueDateKey: string | null;
            attachments?: any[];
            tags?: string[];
        }) => {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('todos')
                .insert({
                    title,
                    description,
                    created_by: currentUser.id,
                    assigned_to: assignedTo,
                    due_date_key: dueDateKey,
                    attachments,
                    tags: tags || [],
                    created_at: now,
                    completed_by: [],
                    comments: []
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: async (createdTodo, variables) => {
            const normalized = normalizeTodo(createdTodo);
            updateTodoCaches(queryClient, (current, userId) => replaceOrInsertTodo(current, normalized, userId));
            queryClient.invalidateQueries({ queryKey: ['todos'] });
            emitSuccessFeedback('Tarea creada con éxito.');

            // Notify assigned users
            if (variables.assignedTo && variables.assignedTo.length > 0) {
                const recipients = Array.from(new Set(variables.assignedTo)).filter((userId) => userId && userId !== currentUser.id);
                const results = await Promise.allSettled(
                    recipients.map((userId) =>
                        addNotification({
                            message: `Se te ha asignado una nueva tarea [#${createdTodo.id}]: "${variables.title}"`,
                            type: 'action_required',
                            userId
                        }),
                    ),
                );
                const failed = results.filter((result) => result.status === 'rejected');
                if (failed.length > 0) {
                    console.warn(`No se pudieron crear ${failed.length} notificaciones de tarea.`, failed);
                }
            }

            const mentionedRecipients = findMentionedUserIds(variables.title, variables.description)
                .filter((userId) => userId && userId !== currentUser.id && !(variables.assignedTo || []).includes(userId));
            if (mentionedRecipients.length > 0) {
                await Promise.allSettled(
                    mentionedRecipients.map((userId) =>
                        addNotification({
                            message: `Te han mencionado en la tarea [#${createdTodo.id}]: "${variables.title}"`,
                            type: 'action_required',
                            userId,
                        }),
                    ),
                );
            }
        },
    });

    const toggleTodoMutation = useMutation({
        mutationFn: async (todo: { id: number; completed_by: string[] }) => {
            const isDone = todo.completed_by.includes(currentUser.id);
            const nextCompleted = isDone
                ? todo.completed_by.filter((id: string) => id !== currentUser.id)
                : [...todo.completed_by, currentUser.id];

            const { data, error } = await supabase
                .from('todos')
                .update({
                    completed_by: nextCompleted,
                })
                .eq('id', todo.id)
                .select('id, title, description, created_by, assigned_to, due_date_key, completed_by, attachments, comments, tags, created_at')
                .single();

            if (error) throw error;
            return { todo: normalizeTodo(data), isNowCompleted: !isDone };
        },
        onMutate: async (todo) => {
            await queryClient.cancelQueries({ queryKey: ['todos'] });
            const snapshots = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] });
            const isDone = todo.completed_by.includes(currentUser.id);
            const nextCompleted = isDone
                ? todo.completed_by.filter((id: string) => id !== currentUser.id)
                : Array.from(new Set([...todo.completed_by, currentUser.id]));

            updateTodoCaches(queryClient, (current, userId) => current.map((item) => (
                item.id === todo.id
                    ? { ...item, completed_by: nextCompleted }
                    : item
            )).filter((item) => userCanSeeTodo(userId, item)));

            return { snapshots };
        },
        onError: (_error, _variables, context) => {
            context?.snapshots?.forEach(([queryKey, data]) => {
                queryClient.setQueryData(queryKey, data);
                const userId = Array.isArray(queryKey) ? String(queryKey[1] || '') : '';
                if (userId && Array.isArray(data)) writeTodosCache(userId, data);
            });
        },
        onSuccess: (result) => {
            updateTodoCaches(queryClient, (current, userId) => replaceOrInsertTodo(current, result.todo, userId));
            queryClient.invalidateQueries({ queryKey: ['todos'] });
            emitSuccessFeedback(result?.isNowCompleted ? 'Tarea finalizada con éxito.' : 'Tarea reabierta con éxito.');
        },
    });

    const deleteTodoMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase.from('todos').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
            emitSuccessFeedback('Tarea eliminada con éxito.');
        },
    });

    const addCommentMutation = useMutation({
        mutationFn: async ({ todoId, text, attachments }: { todoId: number; text: string; attachments: any[] }) => {
            // 1. Get current comments and assigned users
            const { data: currentTodo, error: fetchError } = await supabase
                .from('todos')
                .select('comments, title, assigned_to')
                .eq('id', todoId)
                .single();

            if (fetchError) throw fetchError;

            const newComment = {
                id: crypto.randomUUID(),
                user_id: currentUser.id,
                text,
                attachments,
                created_at: new Date().toISOString(),
            };

            const nextComments = [...(currentTodo.comments || []), newComment];

            const { error: updateError } = await supabase
                .from('todos')
                .update({ comments: nextComments })
                .eq('id', todoId);

            if (updateError) throw updateError;

            // Notify assigned users and mentioned users (except the commenter)
            const assignedIds: string[] = currentTodo.assigned_to || [];
            const mentionedIds = findMentionedUserIds(text);
            const recipients = Array.from(new Set([...assignedIds, ...mentionedIds])).filter((userId) => userId && userId !== currentUser.id);
            const results = await Promise.allSettled(
                recipients.map((userId) =>
                    addNotification({
                        message: `Nuevo comentario en tarea [#${todoId}] "${currentTodo.title}": ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
                        type: 'action_required',
                        userId
                    }),
                ),
            );
            const failed = results.filter((result) => result.status === 'rejected');
            if (failed.length > 0) {
                console.warn(`No se pudieron crear ${failed.length} notificaciones de comentario.`, failed);
            }

            return { todoId, nextComments };
        },
        onSuccess: (result) => {
            updateTodoCaches(queryClient, (current) => current.map((todo) => (
                todo.id === result.todoId ? { ...todo, comments: result.nextComments } : todo
            )));
            queryClient.invalidateQueries({ queryKey: ['todos'] });
            emitSuccessFeedback('Comentario guardado con éxito.');
        },
    });

    const updateTodoMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: number; updates: Partial<Todo> }) => {
            // Sanitize updates to match DB columns if needed, but TypeScript Partial<Todo> is good.
            // We need to verify mapped names match DB columns.
            // DB: title, description, tags, assigned_to
            // Todo interface matches these keys except case?
            // DB is snake_case. Interface is snake_case for these properties except mapped ones in useQuery?
            // Wait, useQuery maps `due_date_key` (snake) to `due_date_key`.
            // `assigned_to` to `assigned_to`.
            // `created_by` to `created_by`.
            // So keys match.

            // Only issue: `assignedTo` vs `assigned_to` in Create logic.
            // The updates object passed here should use interface keys (which are snake_case).
            const { data, error } = await supabase
                .from('todos')
                .update(updates)
                .eq('id', id)
                .select('id, title, description, created_by, assigned_to, due_date_key, completed_by, attachments, comments, tags, created_at')
                .single();

            if (error) throw error;
            return normalizeTodo(data);
        },
        onMutate: async ({ id, updates }) => {
            await queryClient.cancelQueries({ queryKey: ['todos'] });
            const snapshots = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] });

            updateTodoCaches(queryClient, (current, userId) => current
                .map((todo) => (todo.id === id ? { ...todo, ...updates } as Todo : todo))
                .filter((todo) => userCanSeeTodo(userId, todo)));

            return { snapshots };
        },
        onError: (_error, _variables, context) => {
            context?.snapshots?.forEach(([queryKey, data]) => {
                queryClient.setQueryData(queryKey, data);
                const userId = Array.isArray(queryKey) ? String(queryKey[1] || '') : '';
                if (userId && Array.isArray(data)) writeTodosCache(userId, data);
            });
        },
        onSuccess: (updatedTodo) => {
            updateTodoCaches(queryClient, (current, userId) => replaceOrInsertTodo(current, updatedTodo, userId));
            queryClient.invalidateQueries({ queryKey: ['todos'] });
            emitSuccessFeedback('Tarea actualizada con éxito.');
        },
    });

    return {
        todos,
        isLoading,
        error,
        createTodo: createTodoMutation.mutateAsync,
        toggleTodo: toggleTodoMutation.mutateAsync,
        deleteTodo: deleteTodoMutation.mutateAsync,
        addComment: addCommentMutation.mutateAsync,
        updateTodo: updateTodoMutation.mutateAsync,
    };
}
