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
    const cacheKey = `inventory_movements_cache_${inventoryId}_v1`;
    const readCachedMovements = (): InventoryMovementRow[] => {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.localStorage.getItem(cacheKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed as InventoryMovementRow[];
        } catch {
            return [];
        }
    };
    const [movements, setMovements] = useState<InventoryMovementRow[]>(() => readCachedMovements());
    const [isLoading, setIsLoading] = useState(true);
    const movementsRef = useRef<InventoryMovementRow[]>([]);
    const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
    const loadInFlightRef = useRef<Promise<void> | null>(null);
    const lastMutationAtRef = useRef<number>(0);
    const pendingUpsertsRef = useRef<Map<number, { row: InventoryMovementRow; at: number }>>(new Map());
    const pendingDeletesRef = useRef<Map<number, number>>(new Map());
    const consecutiveEmptyReadsRef = useRef<number>(0);
    const READ_TIMEOUT_MS = 12000;
    const WRITE_TIMEOUT_MS = 45000;
    const PENDING_GUARD_WINDOW_MS = 120000;
    const RECOVERY_ATTEMPTS = 4;
    const RECOVERY_WAIT_MS = 900;

    useEffect(() => {
        movementsRef.current = movements;
    }, [movements]);

    const getErrorText = (error: unknown) => {
        const e = error as any;
        return [e?.message, e?.details, e?.hint]
            .map((v) => (v == null ? '' : String(v)))
            .filter(Boolean)
            .join(' | ');
    };

    const getMissingColumn = (error: unknown): string | null => {
        const text = getErrorText(error);
        if (!text) return null;
        const patterns = [
            /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
            /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
            /missing ['"]?([a-zA-Z0-9_]+)['"]? column/i,
        ];
        for (const p of patterns) {
            const m = text.match(p);
            if (m?.[1]) return m[1];
        }
        return null;
    };

    const isTimeoutLikeError = (error: unknown) => {
        const text = getErrorText(error).toLowerCase();
        if (!text) return false;
        return (
            text.includes('tiempo de espera agotado') ||
            text.includes('timeout') ||
            text.includes('timed out') ||
            text.includes('deadline exceeded')
        );
    };

    const wait = (ms: number) =>
        new Promise<void>((resolve) => {
            window.setTimeout(resolve, ms);
        });

    const sweepPendingGuards = useCallback(() => {
        const now = Date.now();
        for (const [id, meta] of pendingUpsertsRef.current.entries()) {
            if (now - meta.at > PENDING_GUARD_WINDOW_MS) {
                pendingUpsertsRef.current.delete(id);
            }
        }
        for (const [id, at] of pendingDeletesRef.current.entries()) {
            if (now - at > PENDING_GUARD_WINDOW_MS) {
                pendingDeletesRef.current.delete(id);
            }
        }
    }, []);

    const mergeServerRowsWithPending = useCallback((rows: InventoryMovementRow[]) => {
        sweepPendingGuards();
        const serverRows = Array.isArray(rows) ? rows : [];
        const serverIdSet = new Set<number>();
        const mergedById = new Map<number, InventoryMovementRow>();

        for (const row of serverRows) {
            const id = Number((row as any)?.id);
            if (!Number.isFinite(id)) continue;
            serverIdSet.add(id);
            if (pendingDeletesRef.current.has(id)) continue;
            mergedById.set(id, row);
        }

        for (const [id, meta] of pendingUpsertsRef.current.entries()) {
            if (!mergedById.has(id)) {
                mergedById.set(id, meta.row);
            }
        }

        for (const id of Array.from(pendingUpsertsRef.current.keys())) {
            if (serverIdSet.has(id)) {
                pendingUpsertsRef.current.delete(id);
            }
        }
        for (const id of Array.from(pendingDeletesRef.current.keys())) {
            if (!serverIdSet.has(id)) {
                pendingDeletesRef.current.delete(id);
            }
        }

        return Array.from(mergedById.values()).sort((a, b) => Number((b as any)?.id || 0) - Number((a as any)?.id || 0));
    }, [sweepPendingGuards]);

    const markPendingUpsert = useCallback((row: InventoryMovementRow) => {
        const id = Number((row as any)?.id);
        if (!Number.isFinite(id)) return;
        pendingUpsertsRef.current.set(id, { row, at: Date.now() });
        pendingDeletesRef.current.delete(id);
    }, []);

    const markPendingDelete = useCallback((idRaw: number) => {
        const id = Number(idRaw);
        if (!Number.isFinite(id)) return;
        pendingDeletesRef.current.set(id, Date.now());
        pendingUpsertsRef.current.delete(id);
    }, []);

    const withTimeout = useCallback(async <T,>(operation: () => unknown, timeoutMs: number, opLabel: string) => {
        let settled = false;
        return await new Promise<T>((resolve, reject) => {
            const timer = window.setTimeout(() => {
                settled = true;
                reject(new Error(`${opLabel}: Tiempo de espera agotado al conectar con base de datos.`));
            }, timeoutMs);

            Promise.resolve(operation() as any)
                .then((value) => {
                    if (settled) return;
                    window.clearTimeout(timer);
                    resolve(value);
                })
                .catch((error) => {
                    if (settled) {
                        console.warn(`${opLabel} finished after timeout:`, error);
                        return;
                    }
                    window.clearTimeout(timer);
                    reject(error);
                });
        });
    }, []);

    const unwrapMaybeData = useCallback(<T,>(result: unknown): T | null => {
        if (result == null) return null;
        if (typeof result === 'object' && result !== null && 'data' in (result as any)) {
            const wrapped = result as { data?: T | null; error?: unknown };
            if (wrapped.error) throw wrapped.error;
            return (wrapped.data ?? null) as T | null;
        }
        return result as T;
    }, []);

    const persistMovementsCache = useCallback((rows: InventoryMovementRow[]) => {
        if (typeof window === 'undefined') return;
        try {
            const safeRows = Array.isArray(rows) ? rows : [];
            // Keep cache bounded to avoid very large localStorage payloads.
            window.localStorage.setItem(cacheKey, JSON.stringify(safeRows.slice(0, 5000)));
        } catch {
            // noop
        }
    }, [cacheKey]);

    const extractStableMarker = useCallback((notesRaw: unknown) => {
        const notes = String(notesRaw ?? '');
        if (!notes) return '';
        const m = notes.match(/DOC:[^|]+(?:\|TYPE:[^|]+)?(?:\|SRC:[^|]+)?(?:\|DST:[^|]+)?(?:\|CUST:[^|]+)?\|LINE:[^|]+(?:\|N:\d+)?(?:\|AUTO_IN)?/i);
        return m?.[0] ? m[0].trim() : '';
    }, []);

    const rowsLikelyEqual = useCallback((row: InventoryMovementRow, payload: Record<string, unknown>) => {
        const keys = Object.keys(payload);
        for (const key of keys) {
            const incoming = (payload as any)[key];
            if (incoming === undefined) continue;
            const current = (row as any)[key];

            if (incoming == null && current == null) continue;
            if (typeof incoming === 'number' || typeof current === 'number') {
                const a = Number(incoming);
                const b = Number(current);
                if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.0001) continue;
            }

            if (String(incoming ?? '') !== String(current ?? '')) return false;
        }
        return true;
    }, []);

    const recoverInsertedAfterTimeout = useCallback(async (payload: Record<string, unknown>) => {
        const stableMarker = extractStableMarker(payload.notas);
        for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt++) {
            try {
                const { data, error } = await withTimeout<{ data: InventoryMovementRow[] | null; error: any }>(
                    () =>
                        supabase
                            .from('inventory_movements')
                            .select('*')
                            .eq('inventory_id', inventoryId)
                            .eq('tipo_movimiento', String(payload.tipo_movimiento ?? ''))
                            .eq('producto', String(payload.producto ?? ''))
                            .eq('lote', String(payload.lote ?? ''))
                            .eq('bodega', String(payload.bodega ?? ''))
                            .order('id', { ascending: false })
                            .limit(40),
                    READ_TIMEOUT_MS,
                    `recoverAddMovement(${inventoryId})`,
                );
                if (error) throw error;
                const rows = (data || []) as InventoryMovementRow[];
                const found = rows.find((row) => {
                    if (stableMarker) {
                        return String((row as any).notas ?? '').includes(stableMarker);
                    }
                    return rowsLikelyEqual(row, payload);
                });
                if (found) return found;
            } catch {
                // keep retrying
            }
            await wait(RECOVERY_WAIT_MS);
        }
        return null;
    }, [extractStableMarker, inventoryId, rowsLikelyEqual, withTimeout]);

    const recoverUpdatedAfterTimeout = useCallback(async (id: number, payload: Record<string, unknown>) => {
        for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt++) {
            try {
                const { data, error } = await withTimeout<{ data: InventoryMovementRow | null; error: any }>(
                    () =>
                        supabase
                            .from('inventory_movements')
                            .select('*')
                            .eq('id', id)
                            .eq('inventory_id', inventoryId)
                            .maybeSingle(),
                    READ_TIMEOUT_MS,
                    `recoverUpdateMovement(${inventoryId})`,
                );
                if (error) throw error;
                if (data && rowsLikelyEqual(data as InventoryMovementRow, payload)) {
                    return data as InventoryMovementRow;
                }
            } catch {
                // keep retrying
            }
            await wait(RECOVERY_WAIT_MS);
        }
        return null;
    }, [inventoryId, rowsLikelyEqual, withTimeout]);

    const recoverDeletedAfterTimeout = useCallback(async (id: number) => {
        for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt++) {
            try {
                const { data, error } = await withTimeout<{ data: { id: number } | null; error: any }>(
                    () =>
                        supabase
                            .from('inventory_movements')
                            .select('id')
                            .eq('id', id)
                            .eq('inventory_id', inventoryId)
                            .maybeSingle(),
                    READ_TIMEOUT_MS,
                    `recoverDeleteMovement(${inventoryId})`,
                );
                if (error) throw error;
                if (!data) return true;
            } catch {
                // keep retrying
            }
            await wait(RECOVERY_WAIT_MS);
        }
        return false;
    }, [inventoryId, withTimeout]);

    const loadMovements = useCallback(async (silent = false) => {
        if (loadInFlightRef.current) {
            return loadInFlightRef.current;
        }
        const run = (async () => {
            const startedAt = Date.now();
            if (!silent) setIsLoading(true);
            const maxRows = 5000;
            try {
                const { data, error } = await withTimeout<{ data: InventoryMovementRow[] | null; error: any }>(
                    () =>
                        supabase
                            .from('inventory_movements')
                            .select('*')
                            .eq('inventory_id', inventoryId)
                            .order('id', { ascending: false })
                            .range(0, maxRows - 1),
                    READ_TIMEOUT_MS,
                    `loadMovements(${inventoryId})`,
                );
                if (error) {
                    console.error(`Error loading inventory movements for ${inventoryId}:`, error);
                } else {
                    // Ignore stale reads that started before a successful local mutation.
                    if (startedAt < lastMutationAtRef.current) return;
                    const rows = ((data || []) as InventoryMovementRow[]);
                    if (rows.length === 0 && movementsRef.current.length > 0) {
                        // Nunca pisar una vista no-vacía con una lectura vacía transitoria.
                        // Esto evita "bailes" de dashboard por rebotes de red/realtime.
                        consecutiveEmptyReadsRef.current += 1;
                        console.warn(
                            `[inventory_movements:${inventoryId}] ignored transient empty read (${consecutiveEmptyReadsRef.current}), keeping ${movementsRef.current.length} rows`,
                        );
                        return;
                    } else {
                        consecutiveEmptyReadsRef.current = 0;
                    }
                    const merged = mergeServerRowsWithPending(rows);
                    setMovements(merged);
                    if (merged.length > 0) persistMovementsCache(merged);
                }
            } catch (error) {
                // Never crash UI on background sync read failures.
                console.error(`Timeout/error loading inventory movements for ${inventoryId}:`, error);
            } finally {
                if (!silent) setIsLoading(false);
            }
        })();
        loadInFlightRef.current = run;
        try {
            await run;
        } finally {
            loadInFlightRef.current = null;
        }
    }, [inventoryId, mergeServerRowsWithPending, persistMovementsCache, withTimeout]);

    useEffect(() => {
        void loadMovements();
        const refresh = () => {
            void loadMovements(true);
        };

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
                    refresh();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    refresh();
                }
            });

        // Fallback sync for clients where realtime can be interrupted (sleep, network, background tabs).
        const intervalId = window.setInterval(refresh, 120000);

        return () => {
            window.clearInterval(intervalId);
            void supabase.removeChannel(channel);
        };
    }, [inventoryId, loadMovements]);

    const addMovement = useCallback(async (movement: Omit<InventoryMovementRow, 'id' | 'inventory_id' | 'created_at' | 'updated_at'>) => {
        const payload: Record<string, unknown> = { ...(movement as any), inventory_id: inventoryId };
        let lastError: unknown = null;

        for (let i = 0; i < 6; i++) {
            try {
                const result = await withTimeout(
                    () =>
                        supabase
                            .from('inventory_movements')
                            .insert(payload)
                            .select()
                            .single()
                            .throwOnError(),
                    WRITE_TIMEOUT_MS,
                    `addMovement(${inventoryId})`,
                );
                const created = unwrapMaybeData<InventoryMovementRow>(result);
                if (!created || !Number.isFinite(Number((created as any).id))) {
                    throw new Error(`addMovement(${inventoryId}): no se recibió la fila insertada.`);
                }
                lastMutationAtRef.current = Date.now();
                markPendingUpsert(created);
                setMovements((prev) => {
                    const next = prev.filter((m) => Number(m.id) !== Number(created.id));
                    const merged = [created, ...next].sort((a, b) => Number((b as any)?.id || 0) - Number((a as any)?.id || 0));
                    persistMovementsCache(merged);
                    return merged;
                });
                void loadMovements(true);
                return created;
            } catch (error) {
                lastError = error;
                if (isTimeoutLikeError(error)) {
                    const recovered = await recoverInsertedAfterTimeout(payload);
                    if (recovered) {
                        lastMutationAtRef.current = Date.now();
                        markPendingUpsert(recovered);
                        setMovements((prev) => {
                            const next = prev.filter((m) => Number(m.id) !== Number(recovered.id));
                            const merged = [recovered, ...next].sort((a, b) => Number((b as any)?.id || 0) - Number((a as any)?.id || 0));
                            persistMovementsCache(merged);
                            return merged;
                        });
                        void loadMovements(true);
                        return recovered;
                    }
                }
                const missingColumn = getMissingColumn(error);
                if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
                    delete (payload as any)[missingColumn];
                    console.warn(`[inventory_movements:${inventoryId}] insert ignored missing column "${missingColumn}"`);
                    continue;
                }
                break;
            }
        }

        console.error('Error adding movement:', lastError);
        throw lastError;
    }, [getMissingColumn, inventoryId, isTimeoutLikeError, loadMovements, markPendingUpsert, persistMovementsCache, recoverInsertedAfterTimeout, unwrapMaybeData, withTimeout]);

    const updateMovement = useCallback(async (id: number, updates: Partial<Omit<InventoryMovementRow, 'id' | 'inventory_id' | 'created_at' | 'updated_at'>>) => {
        const payload: Record<string, unknown> = { ...(updates as any) };
        let lastError: unknown = null;

        for (let i = 0; i < 6; i++) {
            if (Object.keys(payload).length === 0) {
                const cached = movementsRef.current.find((m) => Number(m.id) === Number(id));
                if (cached) return cached;
                break;
            }

            try {
                const result = await withTimeout(
                    () =>
                        supabase
                            .from('inventory_movements')
                            .update(payload)
                            .eq('id', id)
                            .eq('inventory_id', inventoryId)
                            .select()
                            .single()
                            .throwOnError(),
                    WRITE_TIMEOUT_MS,
                    `updateMovement(${inventoryId})`,
                );
                const updated = unwrapMaybeData<InventoryMovementRow>(result);
                if (!updated || !Number.isFinite(Number((updated as any).id))) {
                    throw new Error(`updateMovement(${inventoryId}): no se recibió la fila actualizada.`);
                }
                lastMutationAtRef.current = Date.now();
                markPendingUpsert(updated);
                setMovements((prev) => {
                    const idx = prev.findIndex((m) => Number(m.id) === Number(updated.id));
                    if (idx === -1) {
                        const merged = [updated, ...prev].sort((a, b) => Number((b as any)?.id || 0) - Number((a as any)?.id || 0));
                        persistMovementsCache(merged);
                        return merged;
                    }
                    const next = [...prev];
                    next[idx] = updated;
                    persistMovementsCache(next);
                    return next;
                });
                void loadMovements(true);
                return updated;
            } catch (error) {
                lastError = error;
                if (isTimeoutLikeError(error)) {
                    const recovered = await recoverUpdatedAfterTimeout(id, payload);
                    if (recovered) {
                        lastMutationAtRef.current = Date.now();
                        markPendingUpsert(recovered);
                        setMovements((prev) => {
                            const idx = prev.findIndex((m) => Number(m.id) === Number(recovered.id));
                            if (idx === -1) {
                                const merged = [recovered, ...prev].sort((a, b) => Number((b as any)?.id || 0) - Number((a as any)?.id || 0));
                                persistMovementsCache(merged);
                                return merged;
                            }
                            const next = [...prev];
                            next[idx] = recovered;
                            persistMovementsCache(next);
                            return next;
                        });
                        void loadMovements(true);
                        return recovered;
                    }
                }
                const missingColumn = getMissingColumn(error);
                if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
                    delete (payload as any)[missingColumn];
                    console.warn(`[inventory_movements:${inventoryId}] update ignored missing column "${missingColumn}"`);
                    continue;
                }
                break;
            }
        }

        console.error('Error updating movement:', lastError);
        throw lastError;
    }, [getMissingColumn, inventoryId, isTimeoutLikeError, loadMovements, markPendingUpsert, persistMovementsCache, recoverUpdatedAfterTimeout, unwrapMaybeData, withTimeout]);

    const deleteMovement = useCallback(async (id: number) => {
        const commitLocalDelete = () => {
            lastMutationAtRef.current = Date.now();
            markPendingDelete(id);
            setMovements((prev) => {
                const next = prev.filter((m) => Number(m.id) !== Number(id));
                persistMovementsCache(next);
                return next;
            });
            void loadMovements(true);
        };

        try {
            const result = await withTimeout<{ id: number; inventory_id: 'canet' | 'huarte' } | { data?: { id: number; inventory_id: 'canet' | 'huarte' } | null; error?: unknown } | null>(
                () =>
                    supabase
                        .from('inventory_movements')
                        .delete()
                        .eq('id', id)
                        .select('id, inventory_id')
                        .maybeSingle(),
                WRITE_TIMEOUT_MS,
                `deleteMovement(${inventoryId})`,
            );
            const deleted = unwrapMaybeData<{ id: number; inventory_id: 'canet' | 'huarte' }>(result);
            if (!deleted) {
                // Si la fila ya no existe (doble click, desincronización puntual o eliminación previa),
                // tratarlo como éxito para no bloquear la UI con falsos errores.
                const alreadyDeleted = await recoverDeletedAfterTimeout(id);
                if (!alreadyDeleted) {
                    throw new Error(`No se pudo confirmar la eliminación del movimiento ${id}.`);
                }
                commitLocalDelete();
                return;
            }
            commitLocalDelete();
        } catch (error) {
            if (isTimeoutLikeError(error)) {
                const recoveredDeleted = await recoverDeletedAfterTimeout(id);
                if (recoveredDeleted) {
                    commitLocalDelete();
                    return;
                }
            }
            console.error('Error deleting movement:', error);
            throw error;
        }
    }, [inventoryId, isTimeoutLikeError, loadMovements, markPendingDelete, persistMovementsCache, recoverDeletedAfterTimeout, unwrapMaybeData, withTimeout]);

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
