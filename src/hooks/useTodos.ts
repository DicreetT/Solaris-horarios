import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, Todo } from '../types';

const EMPTY_ARRAY: Todo[] = [];

export function useTodos(currentUser: User | null) {
    const queryClient = useQueryClient();

    const { data: todos = EMPTY_ARRAY, isLoading, error } = useQuery({
        queryKey: ['todos', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            const { data, error } = await supabase
                .from('todos')
                .select('*')
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

    const createTodoMutation = useMutation({
        mutationFn: async ({ title, description, assignedTo, dueDateKey, attachments }: {
            title: string;
            description: string;
            assignedTo: string[];
            dueDateKey: string | null;
            attachments?: any[];
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
                    created_at: now,
                    completed_by: [],
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
        },
    });

    const toggleTodoMutation = useMutation({
        mutationFn: async (todo: { id: number; completed_by: string[] }) => {
            const isDone = todo.completed_by.includes(currentUser.id);
            const nextCompleted = isDone
                ? todo.completed_by.filter((id: string) => id !== currentUser.id)
                : [...todo.completed_by, currentUser.id];

            const { error } = await supabase
                .from('todos')
                .update({ completed_by: nextCompleted })
                .eq('id', todo.id);

            if (error) throw error;
            return nextCompleted;
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

    return {
        todos,
        isLoading,
        error,
        createTodo: createTodoMutation.mutateAsync,
        toggleTodo: toggleTodoMutation.mutateAsync,
        deleteTodo: deleteTodoMutation.mutateAsync,
    };
}
