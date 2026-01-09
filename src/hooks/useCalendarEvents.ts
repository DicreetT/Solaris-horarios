import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { CalendarEvent } from '../types';

export function useCalendarEvents() {
    const queryClient = useQueryClient();

    const { data: calendarEvents = [], isLoading } = useQuery({
        queryKey: ['calendarEvents'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('calendar_events')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data as CalendarEvent[];
        },
    });

    const createEventMutation = useMutation({
        mutationFn: async (event: Omit<CalendarEvent, 'id' | 'created_at'>) => {
            const { data, error } = await supabase
                .from('calendar_events')
                .insert([event])
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
        },
    });

    const deleteEventMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase
                .from('calendar_events')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
        },
    });

    return {
        calendarEvents,
        isLoading,
        createEvent: createEventMutation.mutateAsync,
        deleteEvent: deleteEventMutation.mutateAsync,
    };
}
