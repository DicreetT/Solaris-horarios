import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useTraining(currentUser) {
    const queryClient = useQueryClient();

    const { data: trainingRequests = [], isLoading, error } = useQuery({
        queryKey: ['training', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            const { data, error } = await supabase.from('training_requests').select('*');

            if (error) throw error;

            return data.map((row) => ({
                id: row.id,
                userId: row.user_id,
                requestedDateKey: row.requested_date_key,
                scheduledDateKey: row.scheduled_date_key,
                status: row.status,
                comments: row.comments || [],
            }));
        },
        enabled: !!currentUser,
    });

    const createTrainingMutation = useMutation({
        mutationFn: async ({ dateKey }) => {
            const record = {
                user_id: currentUser.id,
                requested_date_key: dateKey,
                scheduled_date_key: dateKey,
                status: 'pending',
                comments: [],
            };

            const { data, error } = await supabase
                .from('training_requests')
                .insert(record)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['training']);
        },
    });

    const addCommentMutation = useMutation({
        mutationFn: async ({ requestId, text }) => {
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
            queryClient.invalidateQueries(['training']);
        },
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, scheduledDateKey }) => {
            const updates = { status };
            if (scheduledDateKey) updates.scheduled_date_key = scheduledDateKey;

            const { error } = await supabase
                .from('training_requests')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['training']);
        },
    });

    const deleteTrainingMutation = useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase
                .from('training_requests')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['training']);
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
