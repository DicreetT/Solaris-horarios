import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useFolderUpdates(currentUser) {
    const queryClient = useQueryClient();

    const { data: folderUpdates = {}, isLoading, error } = useQuery({
        queryKey: ['folderUpdates'],
        queryFn: async () => {
            if (!currentUser) return {};
            const { data, error } = await supabase
                .from('folder_updates')
                .select('*');

            if (error) throw error;

            const map = {};
            data.forEach((row) => {
                map[row.folder_id] = {
                    author: row.author,
                    at: row.at,
                };
            });
            return map;
        },
        enabled: !!currentUser,
    });

    const markFolderUpdatedMutation = useMutation({
        mutationFn: async (folderId) => {
            const hasUpdate = !!folderUpdates[folderId];

            if (hasUpdate) {
                const { error } = await supabase
                    .from('folder_updates')
                    .delete()
                    .eq('folder_id', folderId);

                if (error) throw error;
            } else {
                const now = new Date().toISOString();
                const { error } = await supabase
                    .from('folder_updates')
                    .insert({
                        folder_id: folderId,
                        author: currentUser?.name || 'Thalia',
                        at: now,
                    });

                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['folderUpdates']);
        },
    });

    return {
        folderUpdates,
        isLoading,
        error,
        markFolderUpdated: markFolderUpdatedMutation.mutateAsync,
    };
}
