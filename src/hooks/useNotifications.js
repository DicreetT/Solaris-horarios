import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useNotifications(currentUser) {
    const queryClient = useQueryClient();

    const { data: notifications = [], isLoading, error } = useQuery({
        queryKey: ['notifications', currentUser?.id],
        queryFn: async () => {
            if (!currentUser) return [];
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return data.map((row) => ({
                id: row.id,
                message: row.message,
                createdAt: row.created_at,
                read: row.read,
            }));
        },
        enabled: !!currentUser,
    });

    // Realtime subscription
    React.useEffect(() => {
        if (!currentUser) return;

        const channel = supabase
            .channel('notifications-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${currentUser.id}`,
                },
                (payload) => {
                    // Invalidate query to refetch notifications
                    queryClient.invalidateQueries(['notifications', currentUser.id]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, queryClient]);

    const addNotificationMutation = useMutation({
        mutationFn: async ({ message, userId }) => {
            const targetUserId = userId || currentUser?.id;
            if (!targetUserId) return;

            const now = new Date().toISOString();
            const { error } = await supabase.from('notifications').insert({
                user_id: targetUserId,
                message,
                created_at: now,
                read: false,
            });

            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries(['notifications', variables.userId || currentUser?.id]);
        },
    });

    const markAllReadMutation = useMutation({
        mutationFn: async () => {
            if (!currentUser) return;
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('user_id', currentUser.id)
                .eq('read', false);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notifications', currentUser?.id]);
        },
    });

    const markAsReadMutation = useMutation({
        mutationFn: async (notificationId) => {
            if (!currentUser || !notificationId) return;
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', notificationId)
                .eq('user_id', currentUser.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notifications', currentUser?.id]);
        },
    });

    return {
        notifications,
        isLoading,
        error,
        addNotification: addNotificationMutation.mutateAsync,
        markAllAsRead: markAllReadMutation.mutateAsync,
        markAsRead: markAsReadMutation.mutateAsync,
    };
}
