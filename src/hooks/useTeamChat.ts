import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ChatMessage, User } from '../types';

export function useTeamChat(currentUser: User | null, channel = 'general') {
    const queryClient = useQueryClient();
    const queryKey = ['team-chat', channel];

    const { data: messages = [], isLoading, error } = useQuery({
        queryKey,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('team_chat_messages')
                .select('*')
                .eq('channel', channel)
                .order('created_at', { ascending: true })
                .limit(100);

            if (error) throw error;
            return (data || []) as ChatMessage[];
        },
        enabled: !!currentUser,
    });

    useEffect(() => {
        if (!currentUser) return;

        const realtimeChannel = supabase
            .channel(`team-chat-${channel}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'team_chat_messages', filter: `channel=eq.${channel}` },
                () => {
                    queryClient.invalidateQueries({ queryKey });
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(realtimeChannel);
        };
    }, [channel, currentUser, queryClient]);

    const sendMessageMutation = useMutation({
        mutationFn: async (message: string) => {
            if (!currentUser) throw new Error('No user logged in');
            const trimmed = message.trim();
            if (!trimmed) return;

            const { error } = await supabase.from('team_chat_messages').insert({
                channel,
                sender_id: currentUser.id,
                message: trimmed,
            });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    return {
        messages,
        isLoading,
        error,
        sendMessage: sendMessageMutation.mutateAsync,
    };
}
