import { useMemo } from 'react';
import { User } from '../types';
import { useSharedJsonState } from './useSharedJsonState';

type SeenMap = Record<string, string>;

export function useTaskCommentSeen(currentUser: User | null) {
    const key = useMemo(
        () => (currentUser?.id ? `task_comments_seen_v1:${currentUser.id}` : 'task_comments_seen_v1:anon'),
        [currentUser?.id],
    );

    const [seenMap, setSeenMap] = useSharedJsonState<SeenMap>(key, {}, {
        userId: currentUser?.id,
        initializeIfMissing: !!currentUser?.id,
    });

    const getSeenAt = (taskId: number) => seenMap[String(taskId)] || '';

    const markSeenAt = (taskId: number, timestamp: string) => {
        if (!timestamp) return;
        setSeenMap((prev) => {
            const current = prev[String(taskId)] || '';
            if (current === timestamp) return prev;
            return { ...prev, [String(taskId)]: timestamp };
        });
    };

    const markManySeenAt = (updates: SeenMap) => {
        const keys = Object.keys(updates || {});
        if (keys.length === 0) return;
        setSeenMap((prev) => {
            let changed = false;
            const next: SeenMap = { ...prev };
            keys.forEach((taskId) => {
                const value = updates[taskId];
                if (!value) return;
                if (next[taskId] !== value) {
                    next[taskId] = value;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    };

    return {
        seenMap,
        getSeenAt,
        markSeenAt,
        markManySeenAt,
    };
}

