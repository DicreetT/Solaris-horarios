import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarEvent } from '../types';
import { useSharedJsonState } from './useSharedJsonState';

const SHARED_CALENDAR_EVENTS_KEY = 'calendar_events_shared_v1';
const LEGACY_LOCAL_CALENDAR_EVENTS_KEY = 'calendar_events_fallback_v1';

const toMillis = (value?: string | null) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const nextEventId = (events: CalendarEvent[]) => {
    const maxId = events.reduce((max, ev) => {
        const id = Number(ev.id);
        return Number.isFinite(id) ? Math.max(max, id) : max;
    }, 0);
    return maxId + 1;
};

export function useCalendarEvents() {
    const queryClient = useQueryClient();
    const [sharedEvents, setSharedEvents, isLoading] = useSharedJsonState<CalendarEvent[]>(
        SHARED_CALENDAR_EVENTS_KEY,
        [],
        { initializeIfMissing: true },
    );

    const calendarEvents = useMemo(
        () => [...(sharedEvents || [])].sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at)),
        [sharedEvents],
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(LEGACY_LOCAL_CALENDAR_EVENTS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed) || parsed.length === 0) return;
            const cleaned = parsed
                .filter((ev: any) => ev && ev.date_key && ev.title)
                .map((ev: any, idx: number) => ({
                    id: Number.isFinite(Number(ev.id)) ? Number(ev.id) : idx + 1,
                    created_at: ev.created_at || new Date().toISOString(),
                    date_key: String(ev.date_key),
                    title: String(ev.title),
                    created_by: ev.created_by ? String(ev.created_by) : '',
                })) as CalendarEvent[];
            if (cleaned.length === 0) return;

            const existing = Array.isArray(sharedEvents) ? sharedEvents : [];
            const signatures = new Set(existing.map((ev) => `${ev.date_key}::${ev.title}::${ev.created_by || ''}`));
            const missingLegacy = cleaned.filter((ev) => !signatures.has(`${ev.date_key}::${ev.title}::${ev.created_by || ''}`));
            if (missingLegacy.length === 0) return;

            setSharedEvents((prev) => {
                const base = Array.isArray(prev) ? prev : [];
                const nextIdStart = base.reduce((max, ev) => {
                    const id = Number(ev.id);
                    return Number.isFinite(id) ? Math.max(max, id) : max;
                }, 0) + 1;
                const normalizedMissing = missingLegacy.map((ev, idx) => ({
                    ...ev,
                    id: nextIdStart + idx,
                }));
                return [...base, ...normalizedMissing];
            });
        } catch {
            // noop
        }
    }, [sharedEvents, setSharedEvents]);

    const createEvent = async (event: Omit<CalendarEvent, 'id' | 'created_at'>) => {
        let createdEvent: CalendarEvent | null = null;
        setSharedEvents((prev) => {
            const base = Array.isArray(prev) ? prev : [];
            createdEvent = {
                ...event,
                id: nextEventId(base),
                created_at: new Date().toISOString(),
            };
            return [...base, createdEvent as CalendarEvent];
        });
        queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
        return createdEvent as CalendarEvent;
    };

    const deleteEvent = async (id: number) => {
        setSharedEvents((prev) => (Array.isArray(prev) ? prev.filter((row) => Number(row.id) !== Number(id)) : []));
        queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
    };

    return {
        calendarEvents,
        isLoading,
        createEvent,
        deleteEvent,
    };
}
