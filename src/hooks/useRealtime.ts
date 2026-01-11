import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User } from '../types';

/**
 * Hook to enable real-time updates across the application.
 * It listens to changes in relevant tables and invalidates React Query caches.
 */
export function useRealtime(currentUser: User | null) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!currentUser) return;

        // Channel for all relevant updates
        const channel = supabase
            .channel('app-realtime-updates')
            // Listen to all changes in specific tables
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'todos' },
                () => {
                    console.log('Realtime update: todos');
                    queryClient.invalidateQueries({ queryKey: ['todos'] });
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
                () => {
                    console.log('Realtime update: notifications');
                    queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] });
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'shopping_items' },
                () => {
                    console.log('Realtime update: shopping_items');
                    queryClient.invalidateQueries({ queryKey: ['shopping-items'] });
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'absences' },
                () => {
                    console.log('Realtime update: absences');
                    queryClient.invalidateQueries({ queryKey: ['absences'] });
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'time_entries', filter: `user_id=eq.${currentUser.id}` },
                () => {
                    console.log('Realtime update: time_entries');
                    queryClient.invalidateQueries({ queryKey: ['time_entries'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, queryClient]);
}
