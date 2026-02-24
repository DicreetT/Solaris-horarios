import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { emitSuccessFeedback } from '../utils/uiFeedback';

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
            if (!currentUser) throw new Error('No hay usuario autenticado.');
            const now = new Date().toISOString();
            const targetUser = userId || currentUser.id;

            const defaultReason = status === 'approved' ? 'Registrado por Admin' : '';
            const { data: authData } = await supabase.auth.getUser();
            const authUserId = authData.user?.id || currentUser.id;
            const isCrossUserInsert = targetUser !== authUserId;

            // First attempt: explicit created_by (for admin cross-user workflows where policy allows it)
            const primaryInsert = await supabase
                .from('absence_requests')
                .insert({
                    created_by: targetUser,
                    created_at: now,
                    date_key,
                    end_date: end_date || null,
                    reason: reason || defaultReason,
                    type,
                    status: status || 'pending', // Allow override
                    attachments: attachments || [],
                    makeup_preference: makeUpHours || false,
                    resolution_type: resolution_type || null
                })
                .select()
                .single();

            if (!primaryInsert.error) return primaryInsert.data;

            // If admin is creating for another user and policy rejects it,
            // do not silently create it for the admin account.
            if (isCrossUserInsert) {
                throw new Error('No tienes permisos para crear ausencias en nombre de otra persona con la política actual de seguridad.');
            }

            // RLS fallback: minimal insert relying on auth.uid()/DB defaults
            const fallbackInsert = await supabase
                .from('absence_requests')
                .insert({
                    created_by: authUserId,
                    date_key,
                    end_date: end_date || null,
                    reason: reason || defaultReason,
                    type,
                    status: 'pending',
                    attachments: attachments || [],
                    makeup_preference: makeUpHours || false,
                })
                .select()
                .single();

            if (fallbackInsert.error) {
                if (isCrossUserInsert) {
                    throw new Error('No tienes permisos para crear ausencias en nombre de otra persona con la política actual de seguridad.');
                }
                throw fallbackInsert.error;
            }

            return fallbackInsert.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['absences'] });
            queryClient.invalidateQueries({ queryKey: ['absences', currentUser?.id] });
            queryClient.refetchQueries({ queryKey: ['absences', currentUser?.id] });
            emitSuccessFeedback('Solicitud creada con éxito.');
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
            queryClient.invalidateQueries({ queryKey: ['absences', currentUser?.id] });
            queryClient.refetchQueries({ queryKey: ['absences', currentUser?.id] });
            emitSuccessFeedback('Solicitud actualizada con éxito.');
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
            queryClient.invalidateQueries({ queryKey: ['absences', currentUser?.id] });
            queryClient.refetchQueries({ queryKey: ['absences', currentUser?.id] });
            emitSuccessFeedback('Estado actualizado con éxito.');
        },
    });

    const deleteAbsenceMutation = useMutation({
        mutationFn: async (id: number) => {
            const { data, error } = await supabase
                .from('absence_requests')
                .delete()
                .eq('id', id)
                .select('id');
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error('No se pudo eliminar la solicitud (sin permisos o ya no existe).');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['absences'] });
            queryClient.invalidateQueries({ queryKey: ['absences', currentUser?.id] });
            queryClient.refetchQueries({ queryKey: ['absences', currentUser?.id] });
            emitSuccessFeedback('Solicitud eliminada con éxito.');
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
            queryClient.invalidateQueries({ queryKey: ['absences', currentUser?.id] });
            queryClient.refetchQueries({ queryKey: ['absences', currentUser?.id] });
            emitSuccessFeedback('Ausencia eliminada con éxito.');
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
