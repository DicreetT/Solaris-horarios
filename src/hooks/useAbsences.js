import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useAbsences(currentUser) {
    const queryClient = useQueryClient();

    const { data: absenceRequests = [], isLoading, error } = useQuery({
        queryKey: ['absences', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            let query = supabase
                .from('absence_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (currentUser.id !== 'thalia') {
                query = query.eq('created_by', currentUser.id);
            }

            const { data, error } = await query;
            if (error) throw error;

            return data.map((row) => ({
                id: row.id,
                createdBy: row.created_by,
                createdAt: row.created_at,
                dateKey: row.date_key,
                reason: row.reason,
                status: row.status,
                responseMessage: row.response_message || '',
            }));
        },
        enabled: !!currentUser,
    });

    const createAbsenceMutation = useMutation({
        mutationFn: async ({ reason, dateKey }) => {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('absence_requests')
                .insert({
                    created_by: currentUser.id,
                    created_at: now,
                    date_key: dateKey,
                    reason,
                    status: 'pending',
                    response_message: '',
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['absences']);
        },
    });

    const updateAbsenceStatusMutation = useMutation({
        mutationFn: async ({ id, updates }) => {
            const { error } = await supabase
                .from('absence_requests')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['absences']);
        },
    });

    const deleteAbsenceMutation = useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase
                .from('absence_requests')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['absences']);
        },
    });

    return {
        absenceRequests,
        isLoading,
        error,
        createAbsence: createAbsenceMutation.mutateAsync,
        updateAbsenceStatus: updateAbsenceStatusMutation.mutateAsync,
        deleteAbsence: deleteAbsenceMutation.mutateAsync,
    };
}
