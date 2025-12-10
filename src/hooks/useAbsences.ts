import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User } from '../types';

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
                // Users see their own requests OR any approved request
                query = query.or(`created_by.eq.${currentUser.id},status.eq.approved`);
            }

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map((row: any) => ({
                id: row.id,
                created_by: row.created_by,
                created_at: row.created_at,
                date_key: row.date_key,
                end_date: row.end_date,
                reason: row.reason,
                status: row.status,
                type: row.type || 'absence',
                response_message: row.response_message || '',
                attachments: row.attachments || [],
                makeup_preference: row.makeup_preference || false,
                resolution_type: row.resolution_type || null
            }));
        },
        enabled: !!currentUser,
    });

    const createAbsenceMutation = useMutation({
        mutationFn: async ({ reason, date_key, end_date, type, attachments, makeUpHours, status, resolution_type, userId }: { reason?: string; date_key: string; end_date?: string; type: 'absence' | 'vacation' | 'special_permit', attachments?: any[], makeUpHours?: boolean, status?: string, resolution_type?: string, userId?: string }) => {
            const now = new Date().toISOString();
            const targetUser = userId || currentUser.id; // Allow admin to create for others if userId passed

            // Check if exists to update or insert? 
            // Better to upsert if we want to overwrite, but ID is needed. 
            // For now, let's just insert. Uniqueness is rarely enforced but should be.
            // Let's assume the UI handles preventing dupes or we just add a new one.

            const defaultReason = status === 'approved' ? 'Registrado por Admin' : '';

            const { data, error } = await supabase
                .from('absence_requests')
                .insert({
                    created_by: targetUser,
                    created_at: now,
                    date_key: date_key,
                    end_date: end_date,
                    reason: reason || defaultReason,
                    type,
                    status: status || 'pending', // Allow override
                    attachments: attachments || [],
                    makeup_preference: makeUpHours || false,
                    resolution_type: resolution_type || null
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

    const updateAbsenceMutation = useMutation({
        mutationFn: async ({ id, ...updates }: { id: number;[key: string]: any }) => {
            const { error } = await supabase
                .from('absence_requests')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['absences'] });
        },
    });

    const updateAbsenceStatusMutation = useMutation<void, Error, { id: number; status: string; response_message: string; resolution_type?: string }>({
        mutationFn: async (payload) => {
            const updatePayload: any = { status: payload.status, response_message: payload.response_message };
            if (payload.resolution_type) {
                updatePayload.resolution_type = payload.resolution_type;
            }

            const { error } = await supabase
                .from('absence_requests')
                .update(updatePayload)
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

    // Helper to delete by date/user (useful for Admin switching back to Work)
    const deleteAbsenceByDateMutation = useMutation({
        mutationFn: async ({ date_key, user_id }: { date_key: string, user_id: string }) => {
            // Find request for this date/user
            const { error } = await supabase
                .from('absence_requests')
                .delete()
                .eq('date_key', date_key)
                .eq('created_by', user_id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['absences'] });
        }
    })

    return {
        absenceRequests,
        isLoading,
        error,
        createAbsence: createAbsenceMutation.mutateAsync,
        updateAbsence: updateAbsenceMutation.mutateAsync,
        updateAbsenceStatus: updateAbsenceStatusMutation.mutateAsync,
        deleteAbsence: deleteAbsenceMutation.mutateAsync,
        deleteAbsenceByDate: deleteAbsenceByDateMutation.mutateAsync // Export this
    };
}
