import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, Meeting } from '../types';

export function useMeetings(currentUser: User | null) {
    const queryClient = useQueryClient();

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
                created_at: row.created_at,
            });

            if (currentUser.isAdmin) {
                const { data, error } = await supabase
                    .from('meeting_requests')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return (data || []).map(mapRow);
            }

            // For non-admins, fetch both created by user AND where user is participant
            // This avoids issues with complex OR filters on array columns
            const [createdRes, participantRes] = await Promise.all([
                supabase
                    .from('meeting_requests')
                    .select('*')
                    .eq('created_by', currentUser.id),
                supabase
                    .from('meeting_requests')
                    .select('*')
                    .contains('participants', [currentUser.id])
            ]);

            if (createdRes.error) throw createdRes.error;
            if (participantRes.error) throw participantRes.error;

            // Merge and deduplicate by ID
            const allRaw = [...(createdRes.data || []), ...(participantRes.data || [])];
            const uniqueMap = new Map();
            allRaw.forEach(item => uniqueMap.set(item.id, item));

            const uniqueSorted = Array.from(uniqueMap.values())
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            return uniqueSorted.map(mapRow);
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
                    status: 'pending',
                    created_at: now,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['meetings'] });
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

    return {
        meetingRequests,
        isLoading,
        error,
        createMeeting: createMeetingMutation.mutateAsync,
        updateMeetingStatus: updateMeetingStatusMutation.mutateAsync,
        deleteMeeting: deleteMeetingMutation.mutateAsync,
    };
}
