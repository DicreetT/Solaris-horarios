import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from './useNotifications';
import { supabase } from '../lib/supabase';
import { User, Meeting, Comment, Attachment } from '../types';

export function useMeetings(currentUser: User | null) {
    const queryClient = useQueryClient();
    const { addNotification } = useNotifications(currentUser);

    const { data: meetingRequests = [], isLoading, error } = useQuery<Meeting[]>({
        queryKey: ['meetings', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];

            // Helper to map DB row to Meeting type
            const mapRow = (row: any) => ({
                id: row.id,
                created_by: row.created_by,
                title: row.title,
                description: row.description,
                preferred_date_key: row.preferred_date_key,
                preferred_slot: row.preferred_slot,
                participants: row.participants || [],
                status: row.status,
                scheduled_date_key: row.scheduled_date_key,
                scheduled_time: row.scheduled_time,
                response_message: row.response_message,
                attachments: row.attachments || [],
                comments: row.comments || [],
                created_at: row.created_at,
            });

            // Fetch ALL meetings and filter client-side to avoid DB filter issues
            const { data, error } = await supabase
                .from('meeting_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []).map(mapRow);
        },
        enabled: !!currentUser,
    });

    const createMeetingMutation = useMutation<void, Error, Omit<Meeting, 'id' | 'created_by' | 'status' | 'scheduled_date_key' | 'scheduled_time' | 'response_message' | 'created_at'>>({
        mutationFn: async (payload) => {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('meeting_requests')
                .insert({
                    created_by: currentUser.id,
                    title: payload.title,
                    description: payload.description,
                    preferred_date_key: payload.preferred_date_key,
                    preferred_slot: payload.preferred_slot,
                    participants: payload.participants,
                    attachments: payload.attachments,
                    status: 'pending',
                    created_at: now,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: async (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['meetings'] });

            // Notify participants
            if (variables.participants && variables.participants.length > 0) {
                for (const userId of variables.participants) {
                    if (userId !== currentUser.id) {
                        await addNotification({
                            message: `Se te ha invitado a una nueva reunión: "${variables.title}"`,
                            userId
                        });
                    }
                }
            }
        },
    });

    const updateMeetingStatusMutation = useMutation<void, Error, { id: number; status: Meeting['status']; scheduled_date_key?: string; response_message?: string }>({
        mutationFn: async ({ id, status, scheduled_date_key, response_message }) => {
            const { error } = await supabase
                .from('meeting_requests')
                .update({ status, scheduled_date_key, response_message })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['meetings'] });
        },
    });

    const deleteMeetingMutation = useMutation<void, Error, number>({
        mutationFn: async (id: number) => {
            const { error } = await supabase
                .from('meeting_requests')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['meetings'] });
        },
    });

    const addCommentMutation = useMutation<void, Error, { meetingId: number; text: string; attachments: Attachment[] }>({
        mutationFn: async ({ meetingId, text, attachments }) => {
            if (!currentUser) throw new Error('User not authenticated');

            // 1. Get current comments
            const { data: meeting, error: fetchError } = await supabase
                .from('meeting_requests')
                .select('comments')
                .eq('id', meetingId)
                .single();

            if (fetchError) throw fetchError;

            const currentComments: Comment[] = meeting.comments || [];

            // 2. Create new comment
            const newComment: Comment = {
                id: crypto.randomUUID(),
                user_id: currentUser.id,
                text,
                attachments,
                created_at: new Date().toISOString(),
            };

            // 3. Update database
            const { error: updateError } = await supabase
                .from('meeting_requests')
                .update({
                    comments: [...currentComments, newComment]
                })
                .eq('id', meetingId);

            if (updateError) throw updateError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['meetings'] });
        },
    });

    return {
        meetingRequests,
        isLoading,
        error,
        createMeeting: createMeetingMutation.mutateAsync,
        updateMeetingStatus: updateMeetingStatusMutation.mutateAsync,
        deleteMeeting: deleteMeetingMutation.mutateAsync,
        addComment: addCommentMutation.mutateAsync,
    };
}
