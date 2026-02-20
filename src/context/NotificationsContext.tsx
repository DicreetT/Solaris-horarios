import React, { createContext, useContext, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, Notification as NotificationType } from '../types';
import { useNotifications as useNotificationsQuery } from '../hooks/useNotifications';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface NotificationsContextType {
    notifications: NotificationType[];
    isLoading: boolean;
    error: any;
    addNotification: (params: { message: string; userId?: string; type?: string }) => Promise<void>;
    sendNudge: (todoTitle: string, userIds: string[]) => Promise<void>;
    sendCaffeineBoost: (userName: string, userIds: string[]) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    markAsRead: (notificationId: number) => Promise<void>;
    // Push notifications
    isPushSubscribed: boolean;
    subscribeToPush: () => Promise<void>;
    unsubscribeFromPush: () => Promise<void>;
    pushError: string | null;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

export function NotificationsProvider({ children, currentUser }: { children: React.ReactNode; currentUser: User | null }) {
    const queryClient = useQueryClient();
    const notificationsQuery = useNotificationsQuery(currentUser);
    const pushNotifications = usePushNotifications(currentUser);

    // Single realtime subscription at the root level
    useEffect(() => {
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

                    // Show system notification via Service Worker if available (PWA style)
                    if (Notification.permission === 'granted') {
                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.ready.then(registration => {
                                registration.showNotification('Nueva notificación', {
                                    body: payload.new.message,
                                    icon: '/logo.png', // Ensure this matches your PWA icon path
                                    badge: '/logo.png',
                                    data: { url: '/dashboard' }, // Action when clicked
                                });
                            });
                        } else {
                            // Fallback for non-SW environments
                            new Notification('Nueva notificación', {
                                body: payload.new.message,
                                icon: '/logo.png'
                            });
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, queryClient]);

    const value = {
        ...notificationsQuery,
        isPushSubscribed: pushNotifications.isSubscribed,
        subscribeToPush: pushNotifications.subscribeToPush,
        unsubscribeFromPush: pushNotifications.unsubscribeFromPush,
        pushError: pushNotifications.error,
    };

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotificationsContext() {
    const context = useContext(NotificationsContext);
    if (!context) {
        throw new Error('useNotificationsContext must be used within NotificationsProvider');
    }
    return context;
}
