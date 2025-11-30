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

    const setStatusMutation = useMutation({
        mutationFn: async ({ dateKey, status }: { dateKey: string; status: 'in_person' | 'remote' }) => {
            if (!currentUser) throw new Error('No user logged in');

            // Upsert logic
            const { data, error } = await supabase
                .from('daily_status')
                .upsert({
                    user_id: currentUser.id,
                    date_key: dateKey,
                    status: status
                }, { onConflict: 'user_id, date_key' })
                .select()
                .single();

            if (error) throw error;
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
