import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Options = {
  userId?: string;
  initializeIfMissing?: boolean;
  pollIntervalMs?: number;
  protectFromEmptyOverwrite?: boolean;
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
    async (next: T) => {
      const { error } = await supabase
        .from('shared_json_state')
        .upsert(
          {
            key,
            payload: next as any,
            updated_by: userId || null,
          },
          { onConflict: 'key' },
        );
      if (error) {
        console.error(`[shared_json_state] upsert failed for key ${key}:`, error);
      }

      if (protectFromEmptyOverwrite && !isEffectivelyEmpty(next)) {
        const backupKey = backupKeyRef.current;
        const { error: backupError } = await supabase
          .from('shared_json_state')
          .upsert(
            {
              key: backupKey,
              payload: next as any,
              updated_by: userId || null,
            },
            { onConflict: 'key' },
          );
        if (backupError) {
          console.error(`[shared_json_state] backup upsert failed for key ${backupKey}:`, backupError);
        } else {
          safeWriteLocal(localCacheKeyRef.current, next);
        }
      }
    },
    [key, userId, protectFromEmptyOverwrite],
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
        const next =
          typeof updater === 'function'
            ? (updater as (prevState: T) => T)(prev)
            : updater;
        valueRef.current = next;
        if (protectFromEmptyOverwrite && !isEffectivelyEmpty(next)) {
          safeWriteLocal(localCacheKeyRef.current, next);
        }
        void persist(next);
        return next;
      });
    },
    [persist, protectFromEmptyOverwrite],
  );

  return [value, setSharedValue, loading];
}
