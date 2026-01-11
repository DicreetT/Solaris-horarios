import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toDateKey } from '../utils/dateUtils';

export interface CalendarOverride {
    date_key: string;
    is_non_working: boolean;
    note?: string;
}

export function useCalendarOverrides() {
    const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOverrides();

        const channel = supabase
            .channel('calendar_overrides_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'calendar_overrides' },
                () => {
                    fetchOverrides();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function fetchOverrides() {
        setLoading(true);
        const { data, error } = await supabase
            .from('calendar_overrides')
            .select('*');

        if (error) {
            console.error('Error fetching calendar overrides:', error);
        } else {
            setOverrides(data || []);
        }
        setLoading(false);
    }

    async function toggleDayStatus(date: Date, isNonWorking: boolean, note?: string) {
        const dateKey = toDateKey(date);
        const { error } = await supabase
            .from('calendar_overrides')
            .upsert({
                date_key: dateKey,
                is_non_working: isNonWorking,
                note: note,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error('Error updating day status:', error);
            throw error;
        }

        await fetchOverrides();
    }

    return {
        overrides,
        loading,
        toggleDayStatus,
        fetchOverrides
    };
}
