import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, Absence } from '../types';

export function useAbsences(currentUser: User | null) {
    const queryClient = useQueryClient();

    const { data: absenceRequests = [], isLoading, error } = useQuery({
        queryKey: ['absences', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            let query = supabase
                .from('absence_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (!currentUser.isAdmin) {
                query = query.eq('created_by', currentUser.id);
            }

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map((row: any) => ({
                id: row.id,
                created_by: row.created_by,
                created_at: row.created_at,
                date_key: row.date_key,
                reason: row.reason,
                status: row.status,
                type: row.type || 'absence', // Default to absence if null (though DB default is absence)
                response_message: row.response_message || '',
                attachments: row.attachments || [],
            }));
        },
        enabled: !!currentUser,
    });

    const createAbsenceMutation = useMutation({
        mutationFn: async ({ reason, date_key, type, attachments }: { reason: string; date_key: string; type: 'absence' | 'vacation', attachments?: any[] }) => {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('absence_requests')
                .insert({
                    created_by: currentUser.id,
                    created_at: now,
                    date_key: date_key,
                    reason,
                    type,
                    status: 'pending',
                    attachments: attachments || []
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['absences'] });
        },
    });

    const updateAbsenceStatusMutation = useMutation<void, Error, { id: number; status: string; response_message: string }>({
        mutationFn: async (payload) => {
            const { error } = await supabase
                .from('absence_requests')
                .update({ status: payload.status, response_message: payload.response_message })
                .eq('id', payload.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['absences'] });
        },
    });

    const deleteAbsenceMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase
                .from('absence_requests')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['absences'] });
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
