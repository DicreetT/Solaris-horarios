import { useMemo } from 'react';
import type { User } from '../types';
import { useSharedJsonState } from './useSharedJsonState';

export const SALES_LEARNING_KEY = 'sales_learning_workspace_v1';

export type FormationRecord = {
  id: string;
  name: string;
  objective: string;
  purpose: string;
  duration?: string;
  teacher?: string;
  audienceSize?: string;
  tools?: string;
  resources: string;
  ideas: string;
  structure: string;
  status: 'draft' | 'active' | 'paused' | 'closed';
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type StudentSupportRecord = {
  id: string;
  formationId?: string;
  student: string;
  query: string;
  type: 'access' | 'content' | 'functionality' | 'other';
  status: 'pending' | 'resolved';
  tags: string[];
  notes: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type CommercialNeedRecord = {
  id: string;
  detected: string;
  context: string;
  product: string;
  frequency: string;
  tags: string[];
  solution: string;
  status: 'need' | 'opportunity' | 'project_proposed' | 'resolved' | 'archived';
  linkedProjectId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type FaqRecord = {
  id: string;
  group: 'formations' | 'products';
  formationId?: string;
  product?: string;
  question: string;
  answer: string;
  tags: string[];
  status: 'new' | 'reviewed' | 'published';
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesLearningState = {
  formations: FormationRecord[];
  support: StudentSupportRecord[];
  needs: CommercialNeedRecord[];
  faqs: FaqRecord[];
};

const EMPTY_STATE: SalesLearningState = {
  formations: [],
  support: [],
  needs: [],
  faqs: [],
};

function uniqueId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTags(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.map((tag) => tag.trim()).filter(Boolean);
  return `${value || ''}`.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function timestampMs(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function mergeRecordsById<T extends { id: string; updatedAt?: string; createdAt?: string }>(remote: unknown, local: unknown): T[] {
  const remoteList = Array.isArray(remote) ? remote as T[] : [];
  const localList = Array.isArray(local) ? local as T[] : [];
  const byId = new Map<string, T>();

  [...remoteList, ...localList].forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id) return;
    const previous = byId.get(id);
    const itemTime = timestampMs(item.updatedAt || item.createdAt);
    const previousTime = timestampMs(previous?.updatedAt || previous?.createdAt);
    byId.set(id, !previous || itemTime >= previousTime ? { ...previous, ...item } : { ...item, ...previous });
  });

  return Array.from(byId.values()).sort((a, b) => (
    timestampMs(b.updatedAt || b.createdAt) - timestampMs(a.updatedAt || a.createdAt)
  ));
}

function mergeSalesLearningState(remote: unknown, local: unknown): SalesLearningState {
  const remoteState = remote && typeof remote === 'object' ? remote as Partial<SalesLearningState> : {};
  const localState = local && typeof local === 'object' ? local as Partial<SalesLearningState> : {};
  return {
    formations: mergeRecordsById<FormationRecord>(remoteState.formations, localState.formations),
    support: mergeRecordsById<StudentSupportRecord>(remoteState.support, localState.support),
    needs: mergeRecordsById<CommercialNeedRecord>(remoteState.needs, localState.needs),
    faqs: mergeRecordsById<FaqRecord>(remoteState.faqs, localState.faqs),
  };
}

export function useSalesLearning(currentUser?: User | null) {
  const [state, setState, isLoading] = useSharedJsonState<SalesLearningState>(
    SALES_LEARNING_KEY,
    EMPTY_STATE,
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      mergeStrategy: mergeSalesLearningState,
      isUsefulPayload: (payload) => !!payload && typeof payload === 'object',
    },
  );

  const safeState = useMemo<SalesLearningState>(() => ({
    formations: Array.isArray(state?.formations) ? state.formations : [],
    support: Array.isArray(state?.support) ? state.support : [],
    needs: Array.isArray(state?.needs) ? state.needs : [],
    faqs: Array.isArray(state?.faqs) ? state.faqs : [],
  }), [state]);

  const createFormation = (draft: Omit<FormationRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    const now = new Date().toISOString();
    const formation: FormationRecord = {
      ...draft,
      id: uniqueId('formation'),
      createdBy: currentUser?.id,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...(prev || EMPTY_STATE), formations: [formation, ...((prev || EMPTY_STATE).formations || [])] }));
    return formation;
  };

  const createSupport = (draft: Omit<StudentSupportRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    const now = new Date().toISOString();
    const support: StudentSupportRecord = {
      ...draft,
      tags: normalizeTags(draft.tags),
      id: uniqueId('support'),
      createdBy: currentUser?.id,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...(prev || EMPTY_STATE), support: [support, ...((prev || EMPTY_STATE).support || [])] }));
    return support;
  };

  const updateSupportStatus = (id: string, status: StudentSupportRecord['status']) => {
    setState((prev) => ({
      ...(prev || EMPTY_STATE),
      support: ((prev || EMPTY_STATE).support || []).map((item) => (
        item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
      )),
    }));
  };

  const updateFormationStatus = (id: string, status: FormationRecord['status']) => {
    setState((prev) => ({
      ...(prev || EMPTY_STATE),
      formations: ((prev || EMPTY_STATE).formations || []).map((item) => (
        item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
      )),
    }));
  };

  const createNeed = (draft: Omit<CommercialNeedRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    const now = new Date().toISOString();
    const need: CommercialNeedRecord = {
      ...draft,
      tags: normalizeTags(draft.tags),
      id: uniqueId('need'),
      createdBy: currentUser?.id,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...(prev || EMPTY_STATE), needs: [need, ...((prev || EMPTY_STATE).needs || [])] }));
    return need;
  };

  const updateNeed = (id: string, patch: Partial<CommercialNeedRecord>) => {
    setState((prev) => ({
      ...(prev || EMPTY_STATE),
      needs: ((prev || EMPTY_STATE).needs || []).map((item) => (
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
      )),
    }));
  };

  const createFaq = (draft: Omit<FaqRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    const now = new Date().toISOString();
    const faq: FaqRecord = {
      ...draft,
      tags: normalizeTags(draft.tags),
      id: uniqueId('faq'),
      createdBy: currentUser?.id,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...(prev || EMPTY_STATE), faqs: [faq, ...((prev || EMPTY_STATE).faqs || [])] }));
    return faq;
  };

  const updateFaqStatus = (id: string, status: FaqRecord['status']) => {
    setState((prev) => ({
      ...(prev || EMPTY_STATE),
      faqs: ((prev || EMPTY_STATE).faqs || []).map((item) => (
        item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item
      )),
    }));
  };

  return {
    ...safeState,
    isLoading,
    activeFormations: safeState.formations.filter((formation) => formation.status === 'active'),
    pendingSupport: safeState.support.filter((item) => item.status === 'pending'),
    createFormation,
    updateFormationStatus,
    createSupport,
    updateSupportStatus,
    createNeed,
    updateNeed,
    createFaq,
    updateFaqStatus,
  };
}
