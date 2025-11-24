import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, Training, TrainingComment } from '../types';

export function useTraining(currentUser: User | null) {
    const queryClient = useQueryClient();

    const { data: trainingRequests = [], isLoading, error } = useQuery<Training[]>({
        queryKey: ['training', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            const { data, error } = await supabase.from('training_requests').select('*');

            if (error) throw error;

            return (data || []).map((row: any) => ({
                id: row.id,
                user_id: row.user_id,
                requested_date_key: row.requested_date_key,
                scheduled_date_key: row.scheduled_date_key,
                status: row.status,
                comments: row.comments || [],
                attachments: row.attachments || [],
                created_at: row.created_at,
            }));
        },
        enabled: !!currentUser,
    });

    const createTrainingMutation = useMutation<Training, Error, { requested_date_key: string; comments: string; attachments?: any[] }>({
        mutationFn: async ({ requested_date_key, comments, attachments }: { requested_date_key: string; comments: string; attachments?: any[] }) => {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('training_requests')
                .insert({
                    user_id: currentUser.id,
                    scheduled_date_key: requested_date_key,
                    requested_date_key: requested_date_key,
                    comments: comments ? [{ text: comments, by: currentUser.id, at: now }] : [],
                    status: 'pending',
                    attachments: attachments || [],
                    created_at: now,
                });

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
        },
    });

    const addCommentMutation = useMutation<void, Error, { requestId: number; text: string }>({
        mutationFn: async ({ requestId, text }: { requestId: number; text: string }) => {
            const now = new Date();
            const stamp = now.toLocaleString('es-ES', {
                dateStyle: 'short',
                timeStyle: 'short',
            });

            const req = trainingRequests.find((r) => r.id === requestId);
            if (!req) throw new Error('Request not found');

            const nextComments = [
                ...(req.comments || []),
                { by: currentUser.id, text, at: stamp },
            ];

            const { error } = await supabase
                .from('training_requests')
                .update({ comments: nextComments })
                .eq('id', requestId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
        },
    });

    const updateStatusMutation = useMutation<void, Error, { id: number; status: 'rescheduled' | 'accepted' | 'pending' | 'rejected'; scheduled_date_key?: string }>({
        mutationFn: async ({ id, status, scheduled_date_key }: { id: number; status: 'rescheduled' | 'accepted' | 'pending' | 'rejected'; scheduled_date_key?: string }) => {
            const updates: Partial<Training> = { status };
            if (scheduled_date_key) updates.scheduled_date_key = scheduled_date_key;

            const { error } = await supabase
                .from('training_requests')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
        },
    });

    const deleteTrainingMutation = useMutation<void, Error, number>({
        mutationFn: async (id: number) => {
            const { error } = await supabase
                .from('training_requests')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
        },
    });

    return {
        trainingRequests,
        isLoading,
        error,
        createTrainingRequest: createTrainingMutation.mutateAsync,
        addTrainingComment: addCommentMutation.mutateAsync,
        updateTrainingStatus: updateStatusMutation.mutateAsync,
        deleteTrainingRequest: deleteTrainingMutation.mutateAsync,
    };
}
