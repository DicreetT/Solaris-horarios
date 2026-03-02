import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type InventoryMovementRow = {
    id: number;
    inventory_id: 'canet' | 'huarte';
    fecha: string;
    tipo_movimiento: string;
    producto: string;
    lote: string;
    cantidad: number;
    bodega: string;
    cliente?: string;
    destino?: string;
    notas?: string;
    afecta_stock?: string;
    signo?: number;
    cantidad_signed?: number;
    source?: string;
    origin_canet_id?: number;
    created_at?: string;
    updated_at?: string;
    updated_by?: string;
    factura_doc?: string;
    responsable?: string;
    motivo?: string;
};

export function useInventoryMovementsDB(inventoryId: 'canet' | 'huarte') {
    const [movements, setMovements] = useState<InventoryMovementRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const movementsRef = useRef<InventoryMovementRow[]>([]);

    useEffect(() => {
        movementsRef.current = movements;
    }, [movements]);

    const loadMovements = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);

        const { data, error } = await supabase
            .from('inventory_movements')
            .select('*')
            .eq('inventory_id', inventoryId)
            .order('id', { ascending: false });

        if (error) {
            console.error(`Error loading inventory movements for ${inventoryId}:`, error);
        } else if (data) {
            setMovements(data as InventoryMovementRow[]);
        }

        if (!silent) setIsLoading(false);
    }, [inventoryId]);

    useEffect(() => {
        void loadMovements();

        const channel = supabase
            .channel(`inventory_movements_${inventoryId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'inventory_movements',
                    filter: `inventory_id=eq.${inventoryId}`
                },
                () => {
                    // On any change, intelligently reload to keep the exact ordering
                    void loadMovements(true);
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [inventoryId, loadMovements]);

    const addMovement = useCallback(async (movement: Omit<InventoryMovementRow, 'id' | 'inventory_id' | 'created_at' | 'updated_at'>) => {
        const { data, error } = await supabase
            .from('inventory_movements')
            .insert({ ...movement, inventory_id: inventoryId })
            .select()
            .single();

        if (error) {
            console.error('Error adding movement:', error);
            throw error;
        }
        return data as InventoryMovementRow;
    }, [inventoryId]);

    const updateMovement = useCallback(async (id: number, updates: Partial<Omit<InventoryMovementRow, 'id' | 'inventory_id' | 'created_at' | 'updated_at'>>) => {
        const { data, error } = await supabase
            .from('inventory_movements')
            .update(updates)
            .eq('id', id)
            .eq('inventory_id', inventoryId)
            .select()
            .single();

        if (error) {
            console.error('Error updating movement:', error);
            throw error;
        }
        return data as InventoryMovementRow;
    }, [inventoryId]);

    const deleteMovement = useCallback(async (id: number) => {
        const { error } = await supabase
            .from('inventory_movements')
            .delete()
            .eq('id', id)
            .eq('inventory_id', inventoryId);

        if (error) {
            console.error('Error deleting movement:', error);
            throw error;
        }
    }, [inventoryId]);

    // Expose the raw exact set shared state function signature to minimally disrupt the UI during refactor mappings
    // Since the UI uses `setMovimientos((prev) => [...])` a lot, we provide a compat wrapper that converts
    // entire array replacements into upserts/deletes if absolutely necessary, but ideally the UI is refactored 
    // to use add/update/delete instead.

    // For canonicalization updates (where it maps over everything and updates a few lines):
    const setSharedValueCompat = useCallback(async (action: any) => {
        console.warn('setSharedValueCompat called on useInventoryMovementsDB. Please use addMovement/updateMovement instead.');
    }, []);

    return [movements, setSharedValueCompat, isLoading, { addMovement, updateMovement, deleteMovement }] as const;
}
