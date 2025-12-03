import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { User, ShoppingItem, Attachment } from '../types';

const EMPTY_ARRAY: ShoppingItem[] = [];

import { ESTEBAN_ID } from '../constants';

export function useShoppingList(currentUser: User | null) {
    const queryClient = useQueryClient();

    const { data: shoppingItems = EMPTY_ARRAY, isLoading, error } = useQuery({
        queryKey: ['shopping_items'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('shopping_items')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as ShoppingItem[];
        },
        enabled: !!currentUser,
    });

    const createItemMutation = useMutation({
        mutationFn: async (newItem: Omit<ShoppingItem, 'id' | 'created_at' | 'is_purchased' | 'purchased_by'>) => {
            if (!currentUser) throw new Error('No user logged in');

            const { data, error } = await supabase
                .from('shopping_items')
                .insert({
                    ...newItem,
                    created_by: currentUser.id,
                    is_purchased: false,
                    attachments: newItem.attachments || []
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shopping_items'] });
        },
    });

    const updateItemMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: number; updates: Partial<ShoppingItem> }) => {
            const { data, error } = await supabase
                .from('shopping_items')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shopping_items'] });
        },
    });

    const deleteItemMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase
                .from('shopping_items')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shopping_items'] });
        },
    });

    const togglePurchasedMutation = useMutation({
        mutationFn: async ({ id, isPurchased }: { id: number; isPurchased: boolean }) => {
            if (!currentUser) throw new Error('No user logged in');

            // Only Esteban can mark as purchased
            if (currentUser.id !== ESTEBAN_ID) {
                throw new Error('Solo Esteban puede marcar ítems como comprados');
            }

            const { data, error } = await supabase
                .from('shopping_items')
                .update({
                    is_purchased: isPurchased,
                    purchased_by: isPurchased ? currentUser.id : null
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shopping_items'] });
        },
    });

    return {
        shoppingItems,
        isLoading,
        error,
        createItem: createItemMutation.mutateAsync,
        updateItem: updateItemMutation.mutateAsync,
        deleteItem: deleteItemMutation.mutateAsync,
        togglePurchased: togglePurchasedMutation.mutateAsync,
    };
}
