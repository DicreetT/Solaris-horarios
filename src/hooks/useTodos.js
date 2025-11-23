import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const EMPTY_ARRAY = [];

export function useTodos(currentUser) {
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

            const mapped = data.map((row) => ({
                id: row.id,
                title: row.title,
                description: row.description || '',
                createdBy: row.created_by,
                assignedTo: row.assigned_to || [],
                createdAt: row.created_at,
                dueDateKey: row.due_date_key || null,
                completedBy: row.completed_by || [],
            }));

            if (currentUser.isAdmin) {
                return mapped;
            }

            return mapped.filter(
                (t) =>
                    t.createdBy === currentUser.id ||
                    (t.assignedTo || []).includes(currentUser.id)
            );
        },
        enabled: !!currentUser,
    });

    const createTodoMutation = useMutation({
        mutationFn: async ({ title, description, dueDateKey, assignedTo }) => {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('todos')
                .insert({
                    title,
                    description,
                    created_by: currentUser.id,
                    assigned_to: assignedTo,
                    created_at: now,
                    due_date_key: dueDateKey,
                    completed_by: [],
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['todos']);
        },
    });

    const toggleTodoMutation = useMutation({
        mutationFn: async (todo) => {
            const isDone = todo.completedBy.includes(currentUser.id);
            const nextCompleted = isDone
                ? todo.completedBy.filter((id) => id !== currentUser.id)
                : [...todo.completedBy, currentUser.id];

            const { error } = await supabase
                .from('todos')
                .update({ completed_by: nextCompleted })
                .eq('id', todo.id);

            if (error) throw error;
            return nextCompleted;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['todos']);
        },
    });

    const deleteTodoMutation = useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase.from('todos').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['todos']);
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
