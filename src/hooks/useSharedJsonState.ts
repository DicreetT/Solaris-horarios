import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Options = {
  userId?: string;
  initializeIfMissing?: boolean;
  pollIntervalMs?: number;
  protectFromEmptyOverwrite?: boolean;
  preferRemoteSnapshot?: boolean;
  mergeBeforePersist?: boolean;
  mergeStrategy?: (remote: any, local: any) => any;
  mergeIncomingWithLocal?: boolean;
};

const pendingSharedJsonWrites = new Set<Promise<unknown>>();
const DEFAULT_SHARED_JSON_POLL_MS = 600000;
const MIN_SHARED_JSON_REFRESH_GAP_MS = 30000;

function trackSharedJsonWrite<T>(promise: Promise<T>): Promise<T> {
  pendingSharedJsonWrites.add(promise);
  void promise.finally(() => {
    pendingSharedJsonWrites.delete(promise);
  });
  return promise;
}

export async function flushSharedJsonStateWrites(timeoutMs = 6000): Promise<void> {
  const pending = Array.from(pendingSharedJsonWrites);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.allSettled(pending).then((): void => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      settled = true;
      reject(new Error(`${label}: timeout`));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isTransientPersistError(error: unknown) {
  const text = String((error as any)?.message ?? error ?? '').toLowerCase();
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('tiempo de espera') ||
    text.includes('failed to fetch') ||
    text.includes('network')
  );
}

function isEffectivelyEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEffectivelyEmpty);
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length === 0 || entries.every(([, entryValue]) => isEffectivelyEmpty(entryValue));
  }
  return false;
}

function safeReadLocal<T>(cacheKey: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function safeWriteLocal<T>(cacheKey: string, value: T) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(value));
  } catch {
    // noop
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entityVersionMs(value: Record<string, any>) {
  const candidates = [
    'lastChangedAt',
    'updatedAt',
    'updated_at',
    'deletedAt',
    'attachedAt',
    'archivedAt',
    'restoredAt',
    'createdAt',
    'created_at',
  ];
  for (const field of candidates) {
    const raw = value[field];
    if (raw == null || raw === '') continue;
    const ts = new Date(String(raw)).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

function parseTimestampMs(raw: unknown) {
  if (raw == null || raw === '') return 0;
  const ts = new Date(String(raw)).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mergeEntitiesByHeuristic(base: Record<string, any>, incoming: Record<string, any>) {
  const baseTs = entityVersionMs(base);
  const incomingTs = entityVersionMs(incoming);
  const preferIncoming = incomingTs >= baseTs;
  const merged = preferIncoming ? { ...base, ...incoming } : { ...incoming, ...base };

  // Preserve/merge nested label arrays (critical for despacho flow).
  if (Array.isArray(base.labels) || Array.isArray(incoming.labels)) {
    const b = Array.isArray(base.labels) ? base.labels : [];
    const i = Array.isArray(incoming.labels) ? incoming.labels : [];
    const byId = new Map<string, any>();
    const upsert = (item: any) => {
      const id = String(item?.id ?? '').trim();
      if (!id) return;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, item);
        return;
      }
      const prevTs = entityVersionMs(prev);
      const nextTs = entityVersionMs(item);
      byId.set(id, nextTs >= prevTs ? { ...prev, ...item } : { ...item, ...prev });
    };
    b.forEach(upsert);
    i.forEach(upsert);
    merged.labels = Array.from(byId.values());
  }

  // Keep detached label tombstones so a stale merge cannot reattach labels
  // that were manually removed from a despacho.
  const baseDetachedLabelIds = Array.isArray(base.detachedLabelIds)
    ? base.detachedLabelIds.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  const incomingDetachedLabelIds = Array.isArray(incoming.detachedLabelIds)
    ? incoming.detachedLabelIds.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  if (baseDetachedLabelIds.length > 0 || incomingDetachedLabelIds.length > 0) {
    merged.detachedLabelIds = Array.from(new Set([...baseDetachedLabelIds, ...incomingDetachedLabelIds]));
  }

  // Preserve requiredPackages by its own field-level timestamp to avoid
  // stale cross-client overwrites (e.g. bultos bouncing back to 0).
  const baseRequiredTs = parseTimestampMs(base.requiredPackagesUpdatedAt);
  const incomingRequiredTs = parseTimestampMs(incoming.requiredPackagesUpdatedAt);
  if (baseRequiredTs > 0 || incomingRequiredTs > 0) {
    const keepIncomingRequired = incomingRequiredTs >= baseRequiredTs;
    if (keepIncomingRequired) {
      if (Object.prototype.hasOwnProperty.call(incoming, 'requiredPackages')) {
        merged.requiredPackages = incoming.requiredPackages;
      }
      if (Object.prototype.hasOwnProperty.call(incoming, 'requiredPackagesUpdatedAt')) {
        merged.requiredPackagesUpdatedAt = incoming.requiredPackagesUpdatedAt;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(base, 'requiredPackages')) {
        merged.requiredPackages = base.requiredPackages;
      }
      if (Object.prototype.hasOwnProperty.call(base, 'requiredPackagesUpdatedAt')) {
        merged.requiredPackagesUpdatedAt = base.requiredPackagesUpdatedAt;
      }
    }
  }

  // Detached labels should stay detached until someone explicitly reattaches
  // them. This prevents a stale sync from resurrecting labels that were
  // manually removed from a despacho and sent back to pending state.
  const baseDetachedTs = parseTimestampMs(base.detachedAt);
  const incomingDetachedTs = parseTimestampMs(incoming.detachedAt);
  if (baseDetachedTs > 0 || incomingDetachedTs > 0) {
    const keepIncomingDetached = incomingDetachedTs >= baseDetachedTs;
    if (keepIncomingDetached) {
      if (Object.prototype.hasOwnProperty.call(incoming, 'detachedAt')) {
        merged.detachedAt = incoming.detachedAt;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(base, 'detachedAt')) {
        merged.detachedAt = base.detachedAt;
      }
    }
  }

  // Archived entries should stay archived until explicitly restored.
  const baseArchivedTs = parseTimestampMs(base.archivedAt);
  const incomingArchivedTs = parseTimestampMs(incoming.archivedAt);
  if (baseArchivedTs > 0 || incomingArchivedTs > 0) {
    const keepIncomingArchived = incomingArchivedTs >= baseArchivedTs;
    if (keepIncomingArchived) {
      if (Object.prototype.hasOwnProperty.call(incoming, 'archivedAt')) {
        merged.archivedAt = incoming.archivedAt;
      }
      if (Object.prototype.hasOwnProperty.call(incoming, 'archivedBy')) {
        merged.archivedBy = incoming.archivedBy;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(base, 'archivedAt')) {
        merged.archivedAt = base.archivedAt;
      }
      if (Object.prototype.hasOwnProperty.call(base, 'archivedBy')) {
        merged.archivedBy = base.archivedBy;
      }
    }
  }

  const baseRestoredTs = parseTimestampMs(base.restoredAt);
  const incomingRestoredTs = parseTimestampMs(incoming.restoredAt);
  if (baseRestoredTs > 0 || incomingRestoredTs > 0) {
    const keepIncomingRestored = incomingRestoredTs >= baseRestoredTs;
    if (keepIncomingRestored) {
      if (Object.prototype.hasOwnProperty.call(incoming, 'restoredAt')) {
        merged.restoredAt = incoming.restoredAt;
      }
      if (Object.prototype.hasOwnProperty.call(incoming, 'restoredBy')) {
        merged.restoredBy = incoming.restoredBy;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(base, 'restoredAt')) {
        merged.restoredAt = base.restoredAt;
      }
      if (Object.prototype.hasOwnProperty.call(base, 'restoredBy')) {
        merged.restoredBy = base.restoredBy;
      }
    }
  }

  // Deleted entities should stay deleted until explicitly restored.
  // This avoids resurrecting rows that another client already removed.
  const baseDeletedTs = parseTimestampMs(base.deletedAt);
  const incomingDeletedTs = parseTimestampMs(incoming.deletedAt);
  if (baseDeletedTs > 0 || incomingDeletedTs > 0) {
    const keepIncomingDeleted = incomingDeletedTs >= baseDeletedTs;
    if (keepIncomingDeleted) {
      if (Object.prototype.hasOwnProperty.call(incoming, 'deletedAt')) {
        merged.deletedAt = incoming.deletedAt;
      }
      if (Object.prototype.hasOwnProperty.call(incoming, 'deletedBy')) {
        merged.deletedBy = incoming.deletedBy;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(base, 'deletedAt')) {
        merged.deletedAt = base.deletedAt;
      }
      if (Object.prototype.hasOwnProperty.call(base, 'deletedBy')) {
        merged.deletedBy = base.deletedBy;
      }
    }
  }

  // Tombstone-like behavior for cancelled entities:
  // once cancelledAt exists on any side, keep it and force CANCELADO status
  // so stale clients cannot resurrect deleted/cancelled records.
  const baseCancelledTs = parseTimestampMs(base.cancelledAt);
  const incomingCancelledTs = parseTimestampMs(incoming.cancelledAt);
  if (baseCancelledTs > 0 || incomingCancelledTs > 0) {
    const keepIncomingCancelled = incomingCancelledTs >= baseCancelledTs;
    if (keepIncomingCancelled) {
      if (Object.prototype.hasOwnProperty.call(incoming, 'cancelledAt')) {
        merged.cancelledAt = incoming.cancelledAt;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(base, 'cancelledAt')) {
        merged.cancelledAt = base.cancelledAt;
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(base, 'status') ||
      Object.prototype.hasOwnProperty.call(incoming, 'status') ||
      Object.prototype.hasOwnProperty.call(merged, 'status')
    ) {
      merged.status = 'CANCELADO';
    }
  }

  return merged;
}

function defaultMergeRemoteLocal(remote: any, local: any) {
  if (Array.isArray(remote) && Array.isArray(local)) {
    const remoteIdObjects = remote.every((item) => isPlainObject(item) && String((item as any).id ?? '').trim().length > 0);
    const localIdObjects = local.every((item) => isPlainObject(item) && String((item as any).id ?? '').trim().length > 0);
    if (remoteIdObjects && localIdObjects) {
      const byId = new Map<string, any>();
      const order: string[] = [];

      for (const item of remote) {
        const id = String((item as any).id).trim();
        if (!id) continue;
        byId.set(id, item);
        order.push(id);
      }
      for (const item of local) {
        const id = String((item as any).id).trim();
        if (!id) continue;
        const prev = byId.get(id);
        if (!prev) {
          byId.set(id, item);
          if (!order.includes(id)) order.push(id);
          continue;
        }
        byId.set(id, mergeEntitiesByHeuristic(prev, item));
      }

      // Keep local-first ordering (what user just edited), then remaining remote.
      const localOrder = local
        .map((item) => String((item as any).id).trim())
        .filter((id) => id.length > 0);
      const finalOrder = Array.from(new Set([...localOrder, ...order]));
      return finalOrder.map((id) => byId.get(id)).filter(Boolean);
    }
  }

  if (isPlainObject(remote) && isPlainObject(local)) {
    return mergeEntitiesByHeuristic(remote, local);
  }

  return local;
}

export function useSharedJsonState<T>(
  key: string,
  fallbackValue: T,
  options: Options = {},
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const {
    userId,
    initializeIfMissing = true,
    pollIntervalMs = DEFAULT_SHARED_JSON_POLL_MS,
    protectFromEmptyOverwrite = false,
    preferRemoteSnapshot = false,
    mergeBeforePersist = false,
    mergeStrategy,
    mergeIncomingWithLocal = true,
  } = options;
  const [value, setValue] = useState<T>(fallbackValue);
  const [loading, setLoading] = useState(true);
  const valueRef = useRef<T>(fallbackValue);
  const fallbackRef = useRef<T>(fallbackValue);
  const keyRef = useRef(key);
  const localCacheKeyRef = useRef(`shared_json_state_cache:${key}`);
  const backupKeyRef = useRef(`shared_json_state_backup_non_empty:${key}`);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const writeVersionRef = useRef(0);
  const lastPersistedVersionRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const retryVersionRef = useRef(0);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    fallbackRef.current = fallbackValue;
  }, [fallbackValue]);

  const persist = useCallback(
    async (next: T): Promise<T> => {
      let payloadToStore = next;
      if (mergeBeforePersist) {
        try {
          const { data, error } = await withTimeout<{ data: any; error: any }>(
            supabase
              .from('shared_json_state')
              .select('payload')
              .eq('key', key)
              .maybeSingle(),
            12000,
            `shared_json_state merge-read ${key}`,
          );
          if (!error && data && Object.prototype.hasOwnProperty.call(data, 'payload')) {
            const remotePayload = data.payload as T;
            payloadToStore = (mergeStrategy
              ? mergeStrategy(remotePayload, next)
              : defaultMergeRemoteLocal(remotePayload, next)) as T;
          }
        } catch {
          // fallback to local payload
          payloadToStore = next;
        }
      }

      const { error } = await withTimeout<{ error: any }>(
        supabase
          .from('shared_json_state')
          .upsert(
            {
              key,
              payload: payloadToStore as any,
              updated_by: userId || null,
            },
            { onConflict: 'key' },
          ),
        15000,
        `shared_json_state upsert ${key}`,
      );
      if (error) {
        console.error(`[shared_json_state] upsert failed for key ${key}:`, error);
        throw error;
      }

      if (protectFromEmptyOverwrite && !preferRemoteSnapshot && !isEffectivelyEmpty(payloadToStore)) {
        const backupKey = backupKeyRef.current;
        const { error: backupError } = await withTimeout<{ error: any }>(
          supabase
            .from('shared_json_state')
            .upsert(
              {
                key: backupKey,
                payload: payloadToStore as any,
                updated_by: userId || null,
              },
              { onConflict: 'key' },
            ),
          15000,
          `shared_json_state backup upsert ${backupKey}`,
        );
        if (backupError) {
          console.error(`[shared_json_state] backup upsert failed for key ${backupKey}:`, backupError);
        } else {
          safeWriteLocal(localCacheKeyRef.current, payloadToStore);
        }
      }
      return payloadToStore;
    },
    [key, mergeBeforePersist, mergeStrategy, preferRemoteSnapshot, protectFromEmptyOverwrite, userId],
  );

  useEffect(() => {
    let active = true;
    let hasWarmCache = false;
    keyRef.current = key;
    localCacheKeyRef.current = `shared_json_state_cache:${key}`;
    backupKeyRef.current = `shared_json_state_backup_non_empty:${key}`;

    if (protectFromEmptyOverwrite && !preferRemoteSnapshot) {
      const cached = safeReadLocal<T>(localCacheKeyRef.current);
      if (cached !== undefined && !isEffectivelyEmpty(cached)) {
        setValue(cached);
        valueRef.current = cached;
        hasWarmCache = true;
        setLoading(false);
      }
    }

    let loadInFlight = false;
    let queuedSilentRefresh = false;

    const runLoad = async (silent = false) => {
      if (!silent && !hasWarmCache) setLoading(true);
      let data: any;
      let error: any;
      try {
        const result = await withTimeout<{ data: any; error: any }>(
          supabase
            .from('shared_json_state')
            .select('payload,updated_by')
            .eq('key', key)
            .maybeSingle(),
          20000,
          `shared_json_state load ${key}`,
        );
        data = result.data;
        error = result.error;
      } catch (err) {
        console.error(`[shared_json_state] load timeout/failure for key ${key}:`, err);
        if (active && !silent) setLoading(false);
        return;
      }

      if (!active) return;

      if (error) {
        console.error(`[shared_json_state] load failed for key ${key}:`, error);
        // Mantener último estado válido para evitar "parpadeos" (vacío -> vuelve),
        // especialmente cuando hay timeouts/transitorios de red.
        setLoading(false);
        return;
      }

      const hasPayload = data && Object.prototype.hasOwnProperty.call(data, 'payload');
      if (hasPayload && data?.payload !== undefined) {
        const incomingRaw = ((data.payload as T) ?? fallbackRef.current);
        if (protectFromEmptyOverwrite && isEffectivelyEmpty(incomingRaw)) {
          // Evitar vaciar estado útil por lecturas inconsistentes/transitorias.
          if (!isEffectivelyEmpty(valueRef.current)) {
            if (active && !silent) setLoading(false);
            return;
          }

          if (!preferRemoteSnapshot) {
            const cached = safeReadLocal<T>(localCacheKeyRef.current);
            if (cached !== undefined && !isEffectivelyEmpty(cached)) {
              setValue(cached);
              valueRef.current = cached;
              if (!silent) await persist(cached);
              if (active && !silent) setLoading(false);
              return;
            }
          }

          // Intento de recuperación multi-dispositivo desde backup no vacío.
          if (!preferRemoteSnapshot) {
            const backupKey = backupKeyRef.current;
            const { data: backupData, error: backupError } = await supabase
              .from('shared_json_state')
              .select('payload')
              .eq('key', backupKey)
              .maybeSingle();
            if (!backupError) {
              const backupPayload = (backupData?.payload as T | undefined);
              if (backupPayload !== undefined && !isEffectivelyEmpty(backupPayload)) {
                setValue(backupPayload);
                valueRef.current = backupPayload;
                safeWriteLocal(localCacheKeyRef.current, backupPayload);
                if (!silent) await persist(backupPayload);
                if (active && !silent) setLoading(false);
                return;
              }
            }
          }
        }
        const hasPendingLocalWrites = writeVersionRef.current > lastPersistedVersionRef.current;
        const shouldMergeIncoming = mergeIncomingWithLocal || hasPendingLocalWrites;
        const incoming = shouldMergeIncoming
          ? ((mergeStrategy
              ? mergeStrategy(incomingRaw, valueRef.current)
              : defaultMergeRemoteLocal(incomingRaw, valueRef.current)) as T)
          : incomingRaw;

        setValue(incoming);
        valueRef.current = incoming;
        if (protectFromEmptyOverwrite && !preferRemoteSnapshot && !isEffectivelyEmpty(incoming)) {
          safeWriteLocal(localCacheKeyRef.current, incoming);
        }
      } else {
        // En refrescos silenciosos, no pisar estado local con fallback para evitar
        // vaciar temporalmente la UI si hay lecturas inconsistentes.
        if (protectFromEmptyOverwrite) {
          if (!isEffectivelyEmpty(valueRef.current)) {
            if (active && !silent) setLoading(false);
            return;
          }
          const cached = safeReadLocal<T>(localCacheKeyRef.current);
          if (cached !== undefined && !isEffectivelyEmpty(cached)) {
            setValue(cached);
            valueRef.current = cached;
            if (!silent) await persist(cached);
            if (active && !silent) setLoading(false);
            return;
          }
        }
        if (!silent) {
          setValue(fallbackRef.current);
          valueRef.current = fallbackRef.current;
        }
        if (initializeIfMissing && !silent && !protectFromEmptyOverwrite) {
          await persist(fallbackRef.current);
        }
      }

      if (active && !silent) setLoading(false);
    };

    const load = async (silent = false) => {
      const now = Date.now();
      if (silent && now - lastRefreshAtRef.current < MIN_SHARED_JSON_REFRESH_GAP_MS) {
        return;
      }
      lastRefreshAtRef.current = now;
      if (loadInFlight) {
        // Evita lecturas concurrentes que acaban pisando estado nuevo con respuesta vieja.
        queuedSilentRefresh = true;
        return;
      }
      loadInFlight = true;
      try {
        await runLoad(silent);
      } finally {
        loadInFlight = false;
        if (!active) return;
        if (queuedSilentRefresh) {
          queuedSilentRefresh = false;
          void load(true);
        }
      }
    };

    void load();

    const refresh = () => {
      void load(true);
    };

    const intervalId = pollIntervalMs > 0
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') refresh();
        }, pollIntervalMs)
      : null;
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);
    const channel = supabase
      .channel(`shared-json:${key}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_json_state',
          filter: `key=eq.${key}`,
        },
        (payload: any) => {
          const nextRaw = payload?.new?.payload;
          if (nextRaw === undefined) return;
          if (protectFromEmptyOverwrite && isEffectivelyEmpty(nextRaw) && !isEffectivelyEmpty(valueRef.current)) {
            return;
          }
          const hasPendingLocalWrites = writeVersionRef.current > lastPersistedVersionRef.current;
          const shouldMergeIncoming = mergeIncomingWithLocal || hasPendingLocalWrites;
          const next = shouldMergeIncoming
            ? ((mergeStrategy
                ? mergeStrategy(nextRaw, valueRef.current)
                : defaultMergeRemoteLocal(nextRaw, valueRef.current)) as T)
            : (nextRaw as T);
          setValue(next as T);
          valueRef.current = next as T;
          if (protectFromEmptyOverwrite && !preferRemoteSnapshot && !isEffectivelyEmpty(next)) {
            safeWriteLocal(localCacheKeyRef.current, next as T);
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      if (intervalId != null) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [key, initializeIfMissing, mergeIncomingWithLocal, mergeStrategy, persist, pollIntervalMs, protectFromEmptyOverwrite]);

  const setSharedValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (updater) => {
      setValue((prev) => {
        const previous = prev;
        const next =
          typeof updater === 'function'
            ? (updater as (prevState: T) => T)(prev)
            : updater;
        valueRef.current = next;
        if (protectFromEmptyOverwrite && !preferRemoteSnapshot && !isEffectivelyEmpty(next)) {
          safeWriteLocal(localCacheKeyRef.current, next);
        }
        const writeVersion = ++writeVersionRef.current;
        retryVersionRef.current = writeVersion;
        retryAttemptRef.current = 0;
        if (retryTimerRef.current != null) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        persistQueueRef.current = trackSharedJsonWrite(
          persistQueueRef.current
            .catch(() => {
              // keep queue alive after prior failures
            })
            .then(async () => {
              const stored = await persist(next);
              retryAttemptRef.current = 0;
              lastPersistedVersionRef.current = Math.max(lastPersistedVersionRef.current, writeVersion);
              if (writeVersionRef.current !== writeVersion) return;
              if (stored === next) return;
              valueRef.current = stored;
              setValue(stored);
              if (protectFromEmptyOverwrite && !preferRemoteSnapshot && !isEffectivelyEmpty(stored)) {
                safeWriteLocal(localCacheKeyRef.current, stored);
              }
            })
            .catch((error) => {
              console.error(`[shared_json_state] persist failed for key ${key}:`, error);
              if (isTransientPersistError(error)) {
                // Keep optimistic state to avoid "bouncing/disappearing" UI during temporary DB/network issues.
                retryVersionRef.current = writeVersionRef.current;
                const runRetry = () => {
                  const retryVersion = retryVersionRef.current;
                  const snapshot = valueRef.current;
                  retryAttemptRef.current += 1;
                  const attempt = retryAttemptRef.current;
                  persistQueueRef.current = trackSharedJsonWrite(
                    persistQueueRef.current
                      .catch(() => {
                        // keep queue alive after prior failures
                      })
                      .then(async () => {
                        if (writeVersionRef.current !== retryVersion) {
                          retryAttemptRef.current = 0;
                          return;
                        }
                        const stored = await persist(snapshot);
                        retryAttemptRef.current = 0;
                        lastPersistedVersionRef.current = Math.max(lastPersistedVersionRef.current, retryVersion);
                        if (writeVersionRef.current !== retryVersion) return;
                        if (stored === snapshot) return;
                        valueRef.current = stored;
                        setValue(stored);
                        if (protectFromEmptyOverwrite && !preferRemoteSnapshot && !isEffectivelyEmpty(stored)) {
                          safeWriteLocal(localCacheKeyRef.current, stored);
                        }
                      })
                      .catch((retryError) => {
                        console.error(`[shared_json_state] retry persist failed for key ${key}:`, retryError);
                        if (writeVersionRef.current !== retryVersion) {
                          retryAttemptRef.current = 0;
                          return;
                        }
                        if (attempt >= 5) {
                          retryAttemptRef.current = 0;
                          return;
                        }
                        const backoffMs = Math.min(9000, 1200 * 2 ** (attempt - 1));
                        retryTimerRef.current = window.setTimeout(() => {
                          retryTimerRef.current = null;
                          runRetry();
                        }, backoffMs);
                      }),
                  );
                };
                if (retryTimerRef.current == null) {
                  retryTimerRef.current = window.setTimeout(() => {
                    retryTimerRef.current = null;
                    runRetry();
                  }, 1200);
                }
                return;
              }
              if (writeVersionRef.current !== writeVersion) return;
              setValue((current) => {
                if (current !== next) return current;
                valueRef.current = previous;
                if (protectFromEmptyOverwrite && !preferRemoteSnapshot && !isEffectivelyEmpty(previous)) {
                  safeWriteLocal(localCacheKeyRef.current, previous);
                }
                return previous;
              });
            }),
        );
        return next;
      });
    },
    [key, persist, protectFromEmptyOverwrite],
  );

  return [value, setSharedValue, loading];
}
