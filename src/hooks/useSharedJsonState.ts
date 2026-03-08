import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Options = {
  userId?: string;
  initializeIfMissing?: boolean;
  pollIntervalMs?: number;
};

export function useSharedJsonState<T>(
  key: string,
  fallbackValue: T,
  options: Options = {},
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const { userId, initializeIfMissing = true, pollIntervalMs = 120000 } = options;
  const [value, setValue] = useState<T>(fallbackValue);
  const [loading, setLoading] = useState(true);
  const valueRef = useRef<T>(fallbackValue);
  const fallbackRef = useRef<T>(fallbackValue);
  const keyRef = useRef(key);

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
    },
    [key, userId],
  );

  useEffect(() => {
    let active = true;
    keyRef.current = key;

    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('shared_json_state')
        .select('payload')
        .eq('key', key)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error(`[shared_json_state] load failed for key ${key}:`, error);
        setValue(fallbackRef.current);
        valueRef.current = fallbackRef.current;
        setLoading(false);
        return;
      }

      const hasPayload = data && Object.prototype.hasOwnProperty.call(data, 'payload');
      if (hasPayload && data?.payload !== undefined) {
        setValue((data.payload as T) ?? fallbackRef.current);
        valueRef.current = ((data.payload as T) ?? fallbackRef.current);
      } else {
        setValue(fallbackRef.current);
        valueRef.current = fallbackRef.current;
        if (initializeIfMissing) {
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
          setValue(next as T);
          valueRef.current = next as T;
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
      void supabase.removeChannel(channel);
    };
  }, [key, initializeIfMissing, persist, pollIntervalMs]);

  const setSharedValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (updater) => {
      setValue((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prevState: T) => T)(prev)
            : updater;
        valueRef.current = next;
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  return [value, setSharedValue, loading];
}
