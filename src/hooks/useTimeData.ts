import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { toDateKey } from '../utils/dateUtils';
import type { TimeDataByDate, TimeEntry } from '../types';

export function useTimeData() {
    const queryClient = useQueryClient();

    const { data: timeData = {}, isLoading, error } = useQuery<TimeDataByDate>({
        queryKey: ['timeData'],
        queryFn: async (): Promise<TimeDataByDate> => {
            const { data, error } = await supabase
                .from('time_entries')
                .select('*')
                .order('inserted_at', { ascending: true });

            if (error) throw error;

            // Organize entries by date_key and user_id
            const organized: TimeDataByDate = {};
            (data || []).forEach((entry: TimeEntry) => {
                if (!organized[entry.date_key]) {
                    organized[entry.date_key] = {};
                }
                if (!organized[entry.date_key][entry.user_id]) {
                    organized[entry.date_key][entry.user_id] = [];
                }
                organized[entry.date_key][entry.user_id].push(entry);
            });

            return organized;
        },
    });

    // Create new time entry
    const createTimeEntryMutation = useMutation({
        mutationFn: async ({ date, userId, entry, exit, status, note }: {
            date: Date;
            userId: string;
            entry: string | null;
            exit: string | null;
            status: string | null;
            note: string | null;
        }) => {
            const dateKey = toDateKey(date);
            const { data, error } = await supabase
                .from('time_entries')
                .insert({
                    date_key: dateKey,
                    user_id: userId,
                    entry,
                    exit,
                    status,
                    note,
                })
                .select()
                .single();

            if (error) throw error;
            return { dateKey, userId, newEntry: data };
        },
        onSuccess: ({ dateKey, userId, newEntry }) => {
            queryClient.setQueryData(['timeData'], (oldData: TimeDataByDate) => {
                const newData = { ...oldData };
                if (!newData[dateKey]) newData[dateKey] = {};
                if (!newData[dateKey][userId]) newData[dateKey][userId] = [];
                newData[dateKey][userId] = [...newData[dateKey][userId], newEntry];
                return newData;
            });
        },
    });

    // Update existing time entry by ID
    const updateTimeEntryMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: number; updates: Partial<{ entry: string; exit: string; status: string; note: string }> }) => {
            const { data, error } = await supabase
                .from('time_entries')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (updatedEntry: TimeEntry) => {
            queryClient.setQueryData(['timeData'], (oldData: TimeDataByDate) => {
                const newData = { ...oldData };
                const dateKey = updatedEntry.date_key;
                const userId = updatedEntry.user_id;

                if (newData[dateKey] && newData[dateKey][userId]) {
                    newData[dateKey][userId] = newData[dateKey][userId].map((entry: TimeEntry) =>
                        entry.id === updatedEntry.id ? updatedEntry : entry
                    );
                }
                return newData;
            });
        },
    });

    // Delete time entry by ID
    const deleteTimeEntryMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase
                .from('time_entries')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return id;
        },
        onSuccess: (id: number) => {
            queryClient.setQueryData(['timeData'], (oldData: TimeDataByDate) => {
                const newData = { ...oldData };
                // Find and remove the entry
                Object.keys(newData).forEach(dateKey => {
                    Object.keys(newData[dateKey]).forEach(userId => {
                        newData[dateKey][userId] = newData[dateKey][userId].filter(
                            (entry: TimeEntry) => entry.id !== id
                        );
                        // Clean up empty arrays
                        if (newData[dateKey][userId].length === 0) {
                            delete newData[dateKey][userId];
                        }
                    });
                    // Clean up empty dates
                    if (Object.keys(newData[dateKey]).length === 0) {
                        delete newData[dateKey];
                    }
                });
                return newData;
            });
        },
    });

    return {
        timeData,
        isLoading,
        error,
        createTimeEntry: createTimeEntryMutation.mutateAsync,
        updateTimeEntry: updateTimeEntryMutation.mutateAsync,
        deleteTimeEntry: deleteTimeEntryMutation.mutateAsync,
    };
}
