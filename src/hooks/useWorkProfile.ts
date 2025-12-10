import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface UserProfile {
    user_id: string;
    monthly_hours: number;
    vacation_days_total: number;
    created_at?: string;
}

export function useWorkProfile() {
    const queryClient = useQueryClient();

    // Fetch all user profiles
    const { data: userProfiles = [], isLoading, error } = useQuery<UserProfile[]>({
        queryKey: ['userProfiles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*');

            if (error) throw error;
            return data;
        },
    });

    // Update specific profile
    const updateProfileMutation = useMutation({
        mutationFn: async ({ userId, updates }: { userId: string; updates: Partial<UserProfile> }) => {
            const { data, error } = await supabase
                .from('user_profiles')
                .update(updates)
                .eq('user_id', userId)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['userProfiles'] });
        },
    });

    // Initial Seed / Create if missing (handled via upsert in migration, but good to have)
    const upsertProfileMutation = useMutation({
        mutationFn: async (profile: UserProfile) => {
            const { data, error } = await supabase
                .from('user_profiles')
                .upsert(profile)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['userProfiles'] });
        },
    });

    return {
        userProfiles,
        isLoading,
        error,
        updateProfile: updateProfileMutation.mutateAsync,
        upsertProfile: upsertProfileMutation.mutateAsync
    };
}
