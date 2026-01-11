import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface UserProfile {
    user_id: string;
    weekly_hours: number;
    vacation_days_total: number;
    hours_adjustment: number;
    vacation_adjustment: number;
}

export function useWorkProfile() {
    const queryClient = useQueryClient();

    const { data: userProfiles = [], isLoading, error } = useQuery({
        queryKey: ['user_profiles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*');

            if (error) throw error;
            return data as UserProfile[];
        },
    });

    // Realtime Subscription
    useEffect(() => {
        const channel = supabase
            .channel('user_profiles_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'user_profiles' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['user_profiles'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const updateProfileMutation = useMutation({
        mutationFn: async ({ userId, updates }: { userId: string; updates: Partial<UserProfile> }) => {
            // Upsert: Try to update, if not found (rows=0), insert. 
            // Actually 'upsert' method is cleaner.
            const { error } = await supabase
                .from('user_profiles')
                .upsert({ user_id: userId, ...updates })
                .select();

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user_profiles'] });
        },
    });

    return {
        userProfiles,
        isLoading,
        error,
        updateProfile: updateProfileMutation.mutateAsync,
    };
}
