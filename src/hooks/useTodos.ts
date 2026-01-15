import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from './useNotifications';
import { supabase } from '../lib/supabase';
import { User, Todo } from '../types';

const EMPTY_ARRAY: Todo[] = [];

export function useTodos(currentUser: User | null) {
    const queryClient = useQueryClient();
    const { addNotification } = useNotifications(currentUser);

    const { data: todos = EMPTY_ARRAY, isLoading, error } = useQuery({
        queryKey: ['todos', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            const { data, error } = await supabase
                .from('todos')
                .select('*')
                .order('due_date_key', { ascending: true, nullsFirst: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped = (data || []).map((row: any) => ({
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
                shocked_users: row.shocked_users || [],
                created_at: row.created_at,
            }));

            if (currentUser.isAdmin) {
                return mapped;
            }

            return mapped.filter(
                (t) =>
                    t.created_by === currentUser.id ||
                    (t.assigned_to || []).includes(currentUser.id)
            );
        },
        enabled: !!currentUser,
    });

    // Realtime Subscription for Todos
    // This allows the sidebar badge (and task list) to update instantly when a new task is assigned.
    useEffect(() => {
        if (!currentUser) return;

        const channel = supabase
            .channel('todos_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'todos' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['todos'] });
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
        onSuccess: async (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });

            // Notify assigned users
            if (variables.assignedTo && variables.assignedTo.length > 0) {
                for (const userId of variables.assignedTo) {
                    if (userId !== currentUser.id) {
                        await addNotification({
                            message: `Se te ha asignado una nueva tarea: "${variables.title}"`,
                            userId
                        });
                    }
                }
            }
        },
    });

    const toggleTodoMutation = useMutation({
        mutationFn: async (todo: { id: number; completed_by: string[]; shocked_users?: string[] }) => {
            const isDone = todo.completed_by.includes(currentUser.id);
            const nextCompleted = isDone
                ? todo.completed_by.filter((id: string) => id !== currentUser.id)
                : [...todo.completed_by, currentUser.id];

            // If marking as done, also remove from shocked_users
            const nextShocked = !isDone
                ? (todo.shocked_users || []).filter(uid => uid !== currentUser.id)
                : (todo.shocked_users || []);

            const { error } = await supabase
                .from('todos')
                .update({
                    completed_by: nextCompleted,
                    shocked_users: nextShocked
                })
                .eq('id', todo.id);

            if (error) throw error;
            return { nextCompleted, nextShocked };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
        },
    });

    const deleteTodoMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase.from('todos').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
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

            // Notify assigned users (except the commenter)
            const assignedIds: string[] = currentTodo.assigned_to || [];
            for (const userId of assignedIds) {
                if (userId !== currentUser.id) {
                    await addNotification({
                        message: `Nuevo comentario en tarea "${currentTodo.title}": ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
                        userId
                    });
                }
            }

            return nextComments;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
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
            const { error } = await supabase
                .from('todos')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
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
