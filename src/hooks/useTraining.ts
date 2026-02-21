import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from './useNotifications';
import { supabase } from '../lib/supabase';
import { User, Training, TrainingComment } from '../types';
import { ESTEBAN_ID } from '../constants';
import { emitSuccessFeedback } from '../utils/uiFeedback';

export function useTraining(currentUser: User | null) {
    const queryClient = useQueryClient();
    const { addNotification } = useNotifications(currentUser);

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
                reason: row.reason,
                comments: row.comments || [],
                attachments: row.attachments || [],
                created_at: row.created_at,
            }));
        },
        enabled: !!currentUser,
    });

    const createTrainingMutation = useMutation<Training, Error, { requested_date_key: string; reason: string; comments: string; attachments?: any[]; userId?: string }>({
        mutationFn: async ({ requested_date_key, reason, comments, attachments, userId }: { requested_date_key: string; reason: string; comments: string; attachments?: any[]; userId?: string }) => {
            const now = new Date().toISOString();
            const basePayload: any = {
                user_id: userId || currentUser.id,
                scheduled_date_key: requested_date_key,
                requested_date_key: requested_date_key,
                reason: reason,
                comments: comments ? [{ text: comments, by: currentUser.id, at: now }] : [],
                status: 'pending',
                created_at: now,
            };
            let insertPayload: any = { ...basePayload, attachments: attachments || [] };

            for (let attempt = 0; attempt < 3; attempt++) {
                const { data, error } = await supabase
                    .from('training_requests')
                    .insert(insertPayload)
                    .select('*')
                    .single();

                if (!error) return data;

                const missingColumn = extractMissingColumn(`${error.message || ''}`);
                if (!missingColumn || !(missingColumn in insertPayload)) {
                    throw error;
                }
                const { [missingColumn]: _omit, ...nextPayload } = insertPayload;
                insertPayload = nextPayload;
            }

            throw new Error('No se pudo crear la solicitud de formación.');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
            emitSuccessFeedback('Solicitud de formación creada con éxito.');
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

            // Notify logic
            const isManager = currentUser.id === ESTEBAN_ID || currentUser.isAdmin; // Identify manager/admin roughly

            // If user comments, notify Esteban (Manager)
            if (req.user_id === currentUser.id) {
                if (currentUser.id !== ESTEBAN_ID) {
                    await addNotification({
                        message: `Nuevo comentario en solicitud de formación de ${currentUser.name}: ${text.substring(0, 50)}...`,
                        userId: ESTEBAN_ID // Notify Esteban specifically as Training Manager
                    });
                }
            } else {
                // If it's not the request owner (assumed manager/admin), notify the request owner
                await addNotification({
                    message: `Nuevo mensaje en tu solicitud de formación: ${text.substring(0, 50)}...`,
                    userId: req.user_id
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
            emitSuccessFeedback('Comentario guardado con éxito.');
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
        onSuccess: async (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
            emitSuccessFeedback('Estado de formación actualizado con éxito.');

            // Notify user of status change
            const request = trainingRequests.find(r => r.id === variables.id);
            if (request && request.user_id !== currentUser.id) {
                let message = '';
                if (variables.status === 'accepted') {
                    message = 'Tu solicitud de formación ha sido aceptada.';
                } else if (variables.status === 'rejected') {
                    message = 'Tu solicitud de formación ha sido rechazada.';
                } else if (variables.status === 'rescheduled') {
                    message = 'Tu solicitud de formación ha sido reprogramada.';
                }

                if (message) {
                    await addNotification({ message, userId: request.user_id });
                }
            }
        },
    });

    const updateTrainingRequestMutation = useMutation<void, Error, { id: number; requested_date_key?: string; reason?: string; attachments?: any[] }>({
        mutationFn: async ({ id, requested_date_key, reason, attachments }: { id: number; requested_date_key?: string; reason?: string; attachments?: any[] }) => {
            const updates: any = {};
            if (requested_date_key) {
                updates.requested_date_key = requested_date_key;
                // updating requested date also resets scheduled date usually, but depends on logic. 
                // Ensuring scheduled date matches requested if still pending, or maybe logic decides. 
                // For now, let's update scheduled_date_key as well if it was same as requested.
                updates.scheduled_date_key = requested_date_key;
            }
            if (reason) updates.reason = reason;
            if (attachments) updates.attachments = attachments;

            let updatePayload: any = { ...updates };

            for (let attempt = 0; attempt < 3; attempt++) {
                const { error } = await supabase
                    .from('training_requests')
                    .update(updatePayload)
                    .eq('id', id);

                if (!error) return;

                const missingColumn = extractMissingColumn(`${error.message || ''}`);
                if (!missingColumn || !(missingColumn in updatePayload)) {
                    throw error;
                }
                const { [missingColumn]: _omit, ...nextPayload } = updatePayload;
                updatePayload = nextPayload;
            }

            throw new Error('No se pudo actualizar la solicitud de formación.');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['training'] });
            emitSuccessFeedback('Solicitud de formación actualizada con éxito.');
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
            emitSuccessFeedback('Solicitud de formación eliminada con éxito.');
        },
    });

    return {
        trainingRequests,
        isLoading,
        error,
        createTrainingRequest: createTrainingMutation.mutateAsync,
        updateTrainingRequest: updateTrainingRequestMutation.mutateAsync,
        addTrainingComment: addCommentMutation.mutateAsync,
        updateTrainingStatus: updateStatusMutation.mutateAsync,
        deleteTrainingRequest: deleteTrainingMutation.mutateAsync,
    };
}
    const extractMissingColumn = (message: string) => {
        const lower = message.toLowerCase();
        if (!lower.includes('column')) return null;
        const quoted = message.match(/'([^']+)'/g);
        if (!quoted || quoted.length === 0) return null;
        const first = quoted[0]?.replace(/'/g, '');
        return first || null;
    };
