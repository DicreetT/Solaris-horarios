import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { CalendarEvent } from '../types';

const LOCAL_CALENDAR_EVENTS_KEY = 'calendar_events_fallback_v1';
const SHARED_CALENDAR_EVENTS_KEY = 'calendar_events_shared_v1';

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

    const readSharedEvents = async (): Promise<CalendarEvent[]> => {
        const { data } = await supabase
            .from('shared_json_state')
            .select('payload')
            .eq('key', SHARED_CALENDAR_EVENTS_KEY)
            .maybeSingle();
        return Array.isArray(data?.payload) ? (data?.payload as CalendarEvent[]) : [];
    };

    const writeSharedEvents = async (events: CalendarEvent[]) => {
        await supabase
            .from('shared_json_state')
            .upsert(
                {
                    key: SHARED_CALENDAR_EVENTS_KEY,
                    payload: events,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'key' },
            );
    };

    const { data: calendarEvents = [], isLoading } = useQuery({
        queryKey: ['calendarEvents'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('calendar_events')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                const shared = await readSharedEvents();
                if (shared.length > 0) return shared;
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
                const sharedRows = await readSharedEvents();
                const baseRows = sharedRows.length > 0 ? sharedRows : readLocalEvents();
                const fallbackEvent: CalendarEvent = {
                    id: Date.now(),
                    created_at: new Date().toISOString(),
                    ...event,
                };
                const nextRows = [fallbackEvent, ...baseRows];
                writeLocalEvents(nextRows);
                await writeSharedEvents(nextRows);
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
                const sharedRows = await readSharedEvents();
                const baseRows = sharedRows.length > 0 ? sharedRows : readLocalEvents();
                const nextRows = baseRows.filter((row) => row.id !== id);
                writeLocalEvents(nextRows);
                await writeSharedEvents(nextRows);
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
