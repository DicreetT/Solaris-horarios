import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, DailyStatus } from '../types';

const EMPTY_ARRAY: DailyStatus[] = [];

export function useDailyStatus(currentUser: User | null) {
    const queryClient = useQueryClient();

    const { data: dailyStatuses = EMPTY_ARRAY, isLoading, error } = useQuery({
        queryKey: ['daily_status'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('daily_status')
                .select('*');

            if (error) throw error;
            return data as DailyStatus[];
        },
        // Fetch for everyone so we can show it on the calendar
        enabled: !!currentUser,
    });

    // Real-time subscription for daily status changes
    React.useEffect(() => {
        if (!currentUser) return;

        console.log('🔄 Setting up realtime for daily_status...');
        const channel = supabase
            .channel('daily-status-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'daily_status' },
                (payload) => {
                    console.log('🔄 Realtime daily_status change:', payload);
                    queryClient.invalidateQueries({ queryKey: ['daily_status'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, queryClient]);

    const setStatusMutation = useMutation({
        mutationFn: async ({ dateKey, status, customStatus, customEmoji }: {
            dateKey: string;
            status: 'in_person' | 'remote';
            customStatus?: string;
            customEmoji?: string;
        }) => {
            if (!currentUser) throw new Error('No user logged in');

            console.log('🔄 Upserting daily status:', { dateKey, status, customStatus, customEmoji });

            // Upsert logic
            const { data, error } = await supabase
                .from('daily_status')
                .upsert({
                    user_id: currentUser.id,
                    date_key: dateKey,
                    status: status,
                    custom_status: customStatus,
                    custom_emoji: customEmoji
                }, { onConflict: 'user_id,date_key' })
                .select()
                .single();

            if (error) {
                console.error('❌ Upsert error:', error);
                throw error;
            }
            console.log('✅ Upsert success, data:', data);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['daily_status'] });
        },
    });

    return {
        dailyStatuses,
        isLoading,
        error,
        setDailyStatus: setStatusMutation.mutateAsync,
    };
}
