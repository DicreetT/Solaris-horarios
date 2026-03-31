import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Options = {
  userId?: string;
  initializeIfMissing?: boolean;
  pollIntervalMs?: number;
  protectFromEmptyOverwrite?: boolean;
  mergeBeforePersist?: boolean;
  mergeStrategy?: (remote: any, local: any) => any;
};

function isEffectivelyEmpty(value: unknown) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
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
  const candidates = ['lastChangedAt', 'updatedAt', 'updated_at', 'attachedAt', 'archivedAt', 'createdAt', 'created_at'];
  for (const field of candidates) {
    const raw = value[field];
    if (raw == null || raw === '') continue;
    const ts = new Date(String(raw)).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
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
    pollIntervalMs = 120000,
    protectFromEmptyOverwrite = false,
    mergeBeforePersist = false,
    mergeStrategy,
  } = options;
  const [value, setValue] = useState<T>(fallbackValue);
  const [loading, setLoading] = useState(true);
  const valueRef = useRef<T>(fallbackValue);
  const fallbackRef = useRef<T>(fallbackValue);
  const keyRef = useRef(key);
  const localCacheKeyRef = useRef(`shared_json_state_cache:${key}`);
  const backupKeyRef = useRef(`shared_json_state_backup_non_empty:${key}`);

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
          const { data, error } = await supabase
            .from('shared_json_state')
            .select('payload')
            .eq('key', key)
            .maybeSingle();
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

      const { error } = await supabase
        .from('shared_json_state')
        .upsert(
          {
            key,
            payload: payloadToStore as any,
            updated_by: userId || null,
          },
          { onConflict: 'key' },
        );
      if (error) {
        console.error(`[shared_json_state] upsert failed for key ${key}:`, error);
        throw error;
      }

      if (protectFromEmptyOverwrite && !isEffectivelyEmpty(payloadToStore)) {
        const backupKey = backupKeyRef.current;
        const { error: backupError } = await supabase
          .from('shared_json_state')
          .upsert(
            {
              key: backupKey,
              payload: payloadToStore as any,
              updated_by: userId || null,
            },
            { onConflict: 'key' },
          );
        if (backupError) {
          console.error(`[shared_json_state] backup upsert failed for key ${backupKey}:`, backupError);
        } else {
          safeWriteLocal(localCacheKeyRef.current, payloadToStore);
        }
      }
      return payloadToStore;
    },
    [key, mergeBeforePersist, mergeStrategy, protectFromEmptyOverwrite, userId],
  );

  useEffect(() => {
    let active = true;
    keyRef.current = key;
    localCacheKeyRef.current = `shared_json_state_cache:${key}`;
    backupKeyRef.current = `shared_json_state_backup_non_empty:${key}`;

    if (protectFromEmptyOverwrite) {
      const cached = safeReadLocal<T>(localCacheKeyRef.current);
      if (cached !== undefined && !isEffectivelyEmpty(cached)) {
        setValue(cached);
        valueRef.current = cached;
      }
    }

    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('shared_json_state')
        .select('payload,updated_by')
        .eq('key', key)
        .maybeSingle();

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
        const incoming = ((data.payload as T) ?? fallbackRef.current);
        if (protectFromEmptyOverwrite && isEffectivelyEmpty(incoming)) {
          // Evitar vaciar estado útil por lecturas inconsistentes/transitorias.
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

          // Intento de recuperación multi-dispositivo desde backup no vacío.
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

        setValue(incoming);
        valueRef.current = incoming;
        if (protectFromEmptyOverwrite && !isEffectivelyEmpty(incoming)) {
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

    void load();

    const refresh = () => {
      void load(true);
    };

    const intervalId = window.setInterval(refresh, pollIntervalMs);
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
          const next = payload?.new?.payload;
          if (next === undefined) return;
          if (protectFromEmptyOverwrite && isEffectivelyEmpty(next) && !isEffectivelyEmpty(valueRef.current)) {
            return;
          }
          setValue(next as T);
          valueRef.current = next as T;
          if (protectFromEmptyOverwrite && !isEffectivelyEmpty(next)) {
            safeWriteLocal(localCacheKeyRef.current, next as T);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          refresh();
        }
      });

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
      void supabase.removeChannel(channel);
    };
  }, [key, initializeIfMissing, persist, pollIntervalMs, protectFromEmptyOverwrite]);

  const setSharedValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (updater) => {
      setValue((prev) => {
        const previous = prev;
        const next =
          typeof updater === 'function'
            ? (updater as (prevState: T) => T)(prev)
            : updater;
        valueRef.current = next;
        if (protectFromEmptyOverwrite && !isEffectivelyEmpty(next)) {
          safeWriteLocal(localCacheKeyRef.current, next);
        }
        void persist(next)
          .then((stored) => {
            if (stored === next) return;
            valueRef.current = stored;
            setValue(stored);
            if (protectFromEmptyOverwrite && !isEffectivelyEmpty(stored)) {
              safeWriteLocal(localCacheKeyRef.current, stored);
            }
          })
          .catch((error) => {
            console.error(`[shared_json_state] persist failed for key ${key}:`, error);
            setValue((current) => {
              if (current !== next) return current;
              valueRef.current = previous;
              if (protectFromEmptyOverwrite && !isEffectivelyEmpty(previous)) {
                safeWriteLocal(localCacheKeyRef.current, previous);
              }
              return previous;
            });
          });
        return next;
      });
    },
    [key, persist, protectFromEmptyOverwrite],
  );

  return [value, setSharedValue, loading];
}
