import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { CalendarEvent } from '../types';

const LOCAL_CALENDAR_EVENTS_KEY = 'calendar_events_fallback_v1';

const readLocalEvents = (): CalendarEvent[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(LOCAL_CALENDAR_EVENTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
    } catch {
        return [];
    }
};

const writeLocalEvents = (events: CalendarEvent[]) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(LOCAL_CALENDAR_EVENTS_KEY, JSON.stringify(events));
    } catch {
        // noop
    }
};

export function useCalendarEvents() {
    const queryClient = useQueryClient();

    const { data: calendarEvents = [], isLoading } = useQuery({
        queryKey: ['calendarEvents'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('calendar_events')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                return readLocalEvents();
            }
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

            if (error) {
                const fallbackRows = readLocalEvents();
                const fallbackEvent: CalendarEvent = {
                    id: Date.now(),
                    created_at: new Date().toISOString(),
                    ...event,
                };
                writeLocalEvents([fallbackEvent, ...fallbackRows]);
                return fallbackEvent;
            }
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

            if (error) {
                const fallbackRows = readLocalEvents();
                writeLocalEvents(fallbackRows.filter((row) => row.id !== id));
                return;
            }
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
