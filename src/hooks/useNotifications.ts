import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, Notification } from '../types';

type NotificationType = NonNullable<Notification['type']>;

const normalizeType = (type?: string): NotificationType => {
    const supported: NotificationType[] = ['info', 'success', 'error', 'action_required', 'reminder', 'recognition', 'shock'];
    if (type && supported.includes(type as NotificationType)) {
        return type as NotificationType;
    }
    return 'info';
};

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
                type: normalizeType(row.type),
                read: row.read,
                created_at: row.created_at,
            }));
        },
        enabled: !!currentUser,
    });

    const addNotificationMutation = useMutation({
        mutationFn: async ({ message, userId, type }: { message: string; userId?: string; type?: string }) => {
            const targetUserId = userId || currentUser?.id;
            if (!targetUserId) return;
            const normalizedType = normalizeType(type);

            // De-duplicate recent equal notifications to reduce spam.
            const duplicateThreshold = new Date(Date.now() - 90 * 1000).toISOString();
            const { data: existing } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', targetUserId)
                .eq('message', message)
                .eq('type', normalizedType)
                .gte('created_at', duplicateThreshold)
                .limit(1);
            if (existing && existing.length > 0) return;

            const now = new Date().toISOString();
            const { error } = await supabase.from('notifications').insert({
                user_id: targetUserId,
                message,
                type: normalizedType,
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
        sendNudge: async (todoTitle: string, userIds: string[]) => {
            if (!currentUser) return;
            const message = `Accion requerida: tarea pendiente "${todoTitle}".`;

            // Send to each user who hasn't finished
            const promises = userIds.map(uid =>
                addNotificationMutation.mutateAsync({
                    message,
                    userId: uid,
                    type: 'action_required'
                })
            );
            await Promise.all(promises);
        },
        sendCaffeineBoost: async (userName: string, userIds: string[]) => {
            if (!currentUser) return;
            const message = `${userName} reconoce tu esfuerzo en esta tarea.`;

            const promises = userIds.map(uid =>
                addNotificationMutation.mutateAsync({
                    message,
                    userId: uid,
                    type: 'recognition'
                })
            );
            await Promise.all(promises);
        },
        markAllAsRead: markAllReadMutation.mutateAsync,
        markAsRead: markAsReadMutation.mutateAsync,
    };
}
