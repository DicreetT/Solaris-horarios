import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
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
    const syncQueueRef = useRef<Promise<void>>(Promise.resolve());

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

    const toUpdatePayload = (row: Partial<InventoryMovementRow>) => {
        const { id, inventory_id, created_at, ...rest } = row as any;
        return rest;
    };

    const toInsertPayload = (row: Partial<InventoryMovementRow>) => {
        const { id, inventory_id, ...rest } = row as any;
        return rest;
    };

    const payloadSignature = (row: Partial<InventoryMovementRow>) => {
        const payload = toUpdatePayload(row);
        const ordered = Object.keys(payload)
            .sort()
            .reduce((acc, key) => {
                (acc as any)[key] = (payload as any)[key];
                return acc;
            }, {} as Record<string, unknown>);
        return JSON.stringify(ordered);
    };

    // Compat setter used by legacy screens that still do full-array replacements.
    const setSharedValueCompat = useCallback<Dispatch<SetStateAction<InventoryMovementRow[]>>>((action) => {
        syncQueueRef.current = syncQueueRef.current.then(async () => {
            const prev = movementsRef.current;
            const next = typeof action === 'function'
                ? (action as (prevState: InventoryMovementRow[]) => InventoryMovementRow[])(prev)
                : action;

            if (!Array.isArray(next)) {
                console.warn('setSharedValueCompat ignored non-array value.');
                return;
            }

            const prevById = new Map<number, InventoryMovementRow>();
            for (const row of prev) {
                const id = Number((row as any).id);
                if (Number.isFinite(id)) prevById.set(id, row);
            }

            const nextById = new Map<number, InventoryMovementRow>();
            for (const row of next) {
                const id = Number((row as any).id);
                if (Number.isFinite(id)) nextById.set(id, row as InventoryMovementRow);
            }

            for (const [id] of prevById) {
                if (!nextById.has(id)) {
                    await deleteMovement(id);
                }
            }

            for (const row of next) {
                const id = Number((row as any).id);
                const prevRow = Number.isFinite(id) ? prevById.get(id) : undefined;
                if (prevRow) {
                    if (payloadSignature(prevRow) !== payloadSignature(row)) {
                        await updateMovement(id, toUpdatePayload(row) as any);
                    }
                } else {
                    await addMovement(toInsertPayload(row) as any);
                }
            }

            await loadMovements(true);
        }).catch((error) => {
            console.error(`setSharedValueCompat failed for ${inventoryId}:`, error);
        });
    }, [addMovement, deleteMovement, inventoryId, loadMovements, updateMovement]);

    return [movements, setSharedValueCompat, isLoading, { addMovement, updateMovement, deleteMovement }] as const;
}
