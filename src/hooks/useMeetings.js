import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useMeetings(currentUser) {
    const queryClient = useQueryClient();

    const { data: meetingRequests = [], isLoading, error } = useQuery({
        queryKey: ['meetings', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            let query = supabase
                .from('meeting_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (!currentUser.isAdmin) {
                query = query.or(
                    `created_by.eq.${currentUser.id},participants.cs.{${currentUser.id}}`
                );
            }

            const { data, error } = await query;
            if (error) throw error;

            return data.map((row) => ({
                id: row.id,
                createdBy: row.created_by,
                createdAt: row.created_at,
                title: row.title,
                description: row.description || '',
                preferredDateKey: row.preferred_date_key,
                preferredSlot: row.preferred_slot,
                participants: row.participants || [],
                status: row.status,
                scheduledDateKey: row.scheduled_date_key || null,
                scheduledTime: row.scheduled_time || '',
                responseMessage: row.response_message || '',
            }));
        },
        enabled: !!currentUser,
    });

    const createMeetingMutation = useMutation({
        mutationFn: async (payload) => {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('meeting_requests')
                .insert({
                    created_by: currentUser.id,
                    created_at: now,
                    title: payload.title,
                    description: payload.description,
                    preferred_date_key: payload.preferredDateKey,
                    preferred_slot: payload.preferredSlot,
                    participants: payload.participants,
                    status: 'pending',
                    scheduled_date_key: null,
                    scheduled_time: '',
                    response_message: '',
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['meetings']);
        },
    });

    const updateMeetingStatusMutation = useMutation({
        mutationFn: async ({ id, updates }) => {
            const dbUpdates = {};
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.scheduledDateKey !== undefined)
                dbUpdates.scheduled_date_key = updates.scheduledDateKey;
            if (updates.scheduledTime !== undefined)
                dbUpdates.scheduled_time = updates.scheduledTime;
            if (updates.responseMessage !== undefined)
                dbUpdates.response_message = updates.responseMessage;

            const { error } = await supabase
                .from('meeting_requests')
                .update(dbUpdates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['meetings']);
        },
    });

    const deleteMeetingMutation = useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase
                .from('meeting_requests')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['meetings']);
        },
    });

    return {
        meetingRequests,
        isLoading,
        error,
        createMeeting: createMeetingMutation.mutateAsync,
        updateMeetingStatus: updateMeetingStatusMutation.mutateAsync,
        deleteMeeting: deleteMeetingMutation.mutateAsync,
    };
}
