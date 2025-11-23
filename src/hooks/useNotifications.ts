import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, Notification } from '../types';

export function useNotifications(currentUser: User | null) {
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

            return (data || []).map((row: any) => ({
                id: row.id,
                user_id: row.user_id,
                message: row.message,
                read: row.read,
                created_at: row.created_at,
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
                (payload: any) => {
                    // Invalidate query to refetch notifications
                    queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, queryClient]);

    const addNotificationMutation = useMutation({
        mutationFn: async ({ message, userId, type }: { message: string; userId?: string; type?: string }) => {
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
            queryClient.invalidateQueries({ queryKey: ['notifications', variables.userId || currentUser?.id] });
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
            queryClient.invalidateQueries({ queryKey: ['notifications', currentUser?.id] });
        },
    });

    const markAsReadMutation = useMutation({
        mutationFn: async (notificationId: number) => {
            if (!currentUser || !notificationId) return;
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', notificationId)
                .eq('user_id', currentUser.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', currentUser?.id] });
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
