import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTimeDataFromSupabase, saveTimeEntryToSupabase } from '../services/timeService';
import { toDateKey } from '../utils/dateUtils';

export function useTimeData() {
    const queryClient = useQueryClient();

    const { data: timeData = {}, isLoading, error } = useQuery({
        queryKey: ['timeData'],
        queryFn: fetchTimeDataFromSupabase,
    });

    const updateTimeEntryMutation = useMutation({
        mutationFn: async ({ date, userId, updater }) => {
            const key = toDateKey(date);

            // We need the current state to update it
            // In a real app, we might fetch the specific row or rely on optimistic updates
            // Here we'll use the cache or fetch if missing, but for simplicity let's assume cache is populated
            const currentData = queryClient.getQueryData(['timeData']) || {};
            const prevDay = currentData[key] || {};
            const prevRecord = prevDay[userId] || {};
            const nextRecord = updater(prevRecord);

            await saveTimeEntryToSupabase(key, userId, nextRecord);

            return { key, userId, nextRecord };
        },
        onSuccess: ({ key, userId, nextRecord }) => {
            queryClient.setQueryData(['timeData'], (oldData) => {
                const newData = { ...oldData };
                if (!newData[key]) newData[key] = {};
                newData[key] = {
                    ...newData[key],
                    [userId]: nextRecord,
                };
                return newData;
            });
        },
    });

    return {
        timeData,
        isLoading,
        error,
        updateTimeEntry: updateTimeEntryMutation.mutateAsync,
    };
}
