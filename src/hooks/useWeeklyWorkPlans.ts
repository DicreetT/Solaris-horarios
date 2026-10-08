import { useMemo } from 'react';
import type { User } from '../types';
import { useSharedJsonState } from './useSharedJsonState';
import { toDateKey } from '../utils/dateUtils';

export const WEEKLY_WORK_PLANS_KEY = 'weekly_work_plans_v1';

export type WeeklyWorkBlockKind = 'warehouse' | 'projects' | 'support' | 'admin';

export type WeeklyWorkComment = {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
};

export type WeeklyWorkBlock = {
  id: string;
  userId: string;
  weekStart: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  kind: WeeklyWorkBlockKind;
  title: string;
  projectId?: string;
  requesterId?: string;
  priorityRank?: number;
  notes?: string;
  comments?: WeeklyWorkComment[];
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
};

export type WeeklyWorkPlansState = {
  blocks: WeeklyWorkBlock[];
};

const clean = (value: unknown) => String(value ?? '').trim();

function nowIso() {
  return new Date().toISOString();
}

function uniqueId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getWeekStartKey(date = new Date()) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return toDateKey(next);
}

export function getWeekDateKeys(weekStart: string) {
  const [year, month, day] = weekStart.split('-').map(Number);
  const start = new Date(year, (month || 1) - 1, day || 1);
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toDateKey(date);
  });
}

export function normalizeWeeklyWorkPlansState(value: unknown): WeeklyWorkPlansState {
  const raw = value && typeof value === 'object' ? value as any : {};
  return {
    blocks: (Array.isArray(raw.blocks) ? raw.blocks : [])
      .map((block: any): WeeklyWorkBlock => {
        const now = nowIso();
        const kind = ['warehouse', 'projects', 'support', 'admin'].includes(block?.kind)
          ? block.kind
          : 'projects';
        return {
          id: clean(block?.id) || uniqueId('work_block'),
          userId: clean(block?.userId),
          weekStart: clean(block?.weekStart),
          dateKey: clean(block?.dateKey),
          startTime: clean(block?.startTime) || '08:00',
          endTime: clean(block?.endTime) || '09:00',
          kind,
          title: clean(block?.title) || 'Bloque de trabajo',
          projectId: clean(block?.projectId),
          requesterId: clean(block?.requesterId),
          priorityRank: Number.isFinite(Number(block?.priorityRank)) ? Number(block.priorityRank) : undefined,
          notes: clean(block?.notes),
          comments: (Array.isArray(block?.comments) ? block.comments : [])
            .map((comment: any): WeeklyWorkComment => ({
              id: clean(comment?.id) || uniqueId('work_comment'),
              userId: clean(comment?.userId),
              text: clean(comment?.text),
              createdAt: clean(comment?.createdAt) || now,
            }))
            .filter((comment: WeeklyWorkComment) => comment.userId && comment.text),
          createdAt: clean(block?.createdAt) || now,
          updatedAt: clean(block?.updatedAt) || clean(block?.createdAt) || now,
          updatedBy: clean(block?.updatedBy),
        };
      })
      .filter((block: WeeklyWorkBlock) => block.userId && block.weekStart && block.dateKey)
      .sort((a: WeeklyWorkBlock, b: WeeklyWorkBlock) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime)),
  };
}

export function useWeeklyWorkPlans(currentUser?: User | null) {
  const [state, setState, isLoading] = useSharedJsonState<WeeklyWorkPlansState>(
    WEEKLY_WORK_PLANS_KEY,
    { blocks: [] },
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      isUsefulPayload: (payload) => !!payload && typeof payload === 'object',
    },
  );

  const normalized = useMemo(() => normalizeWeeklyWorkPlansState(state), [state]);

  const addBlock = (draft: Omit<WeeklyWorkBlock, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = nowIso();
    const block: WeeklyWorkBlock = {
      ...draft,
      id: uniqueId('work_block'),
      createdAt: now,
      updatedAt: now,
      updatedBy: currentUser?.id,
      comments: draft.comments || [],
    };
    setState((prev) => {
      const base = normalizeWeeklyWorkPlansState(prev);
      return { blocks: [...base.blocks, block] };
    });
    return block;
  };

  const updateBlock = (blockId: string, patch: Partial<Omit<WeeklyWorkBlock, 'id' | 'createdAt'>>) => {
    const now = nowIso();
    setState((prev) => {
      const base = normalizeWeeklyWorkPlansState(prev);
      return {
        blocks: base.blocks.map((block) => (
          block.id === blockId
            ? { ...block, ...patch, id: block.id, createdAt: block.createdAt, updatedAt: now, updatedBy: currentUser?.id }
            : block
        )),
      };
    });
  };

  const deleteBlock = (blockId: string) => {
    setState((prev) => {
      const base = normalizeWeeklyWorkPlansState(prev);
      return { blocks: base.blocks.filter((block) => block.id !== blockId) };
    });
  };

  return {
    isLoading,
    blocks: normalized.blocks,
    addBlock,
    updateBlock,
    deleteBlock,
  };
}
