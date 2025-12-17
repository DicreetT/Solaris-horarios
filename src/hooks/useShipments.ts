import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ShipmentFolder, ShipmentClient, User, Attachment } from '../types';

export function useShipments(currentUser: User | null) {
    const queryClient = useQueryClient();

    // 1. Fetch Folders (with nested Clients)
    const { data: shipmentFolders = [], isLoading, error } = useQuery({
        queryKey: ['shipmentFolders'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('shipment_folders')
                .select(`
                    *,
                    clients:shipment_clients(*)
                `)
                .order('date_key', { ascending: false });

            if (error) throw error;
            return data as ShipmentFolder[];
        },
        enabled: !!currentUser,
    });

    // 2. Create Folder
    const createFolderMutation = useMutation({
        mutationFn: async (dateKey: string) => {
            if (!currentUser) throw new Error("No user");

            // Check if exists first to avoid constraint error if double clicked?
            // Actually relying on uniqueness constraint is better, but let's be safe UI wise.

            const { data, error } = await supabase
                .from('shipment_folders')
                .insert({
                    date_key: dateKey,
                    created_by: currentUser.id
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') { // Unique violation
                    // Fetch existing if needed, or just let it fail/ignore
                    throw new Error("La carpeta para este día ya existe.");
                }
                throw error;
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shipmentFolders'] });
        },
    });

    // 3. Create Client
    const createClientMutation = useMutation({
        mutationFn: async ({ folderId, clientName }: { folderId: number, clientName: string }) => {
            if (!currentUser) throw new Error("No user");

            const { data, error } = await supabase
                .from('shipment_clients')
                .insert({
                    folder_id: folderId,
                    client_name: clientName,
                    created_by: currentUser.id,
                    invoices: [],
                    labels: []
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shipmentFolders'] });
        },
    });

    // 4. Update Client (Rename or Files)
    const updateClientMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: number, updates: Partial<ShipmentClient> }) => {
            const { data, error } = await supabase
                .from('shipment_clients')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shipmentFolders'] });
        },
    });

    // 5. Delete Client (Optional but good to have)
    const deleteClientMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase
                .from('shipment_clients')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shipmentFolders'] });
        },
    });

    return {
        shipmentFolders,
        isLoading,
        error,
        createFolder: createFolderMutation.mutateAsync,
        createClient: createClientMutation.mutateAsync,
        updateClient: updateClientMutation.mutateAsync,
        deleteClient: deleteClientMutation.mutateAsync,
    };
}
