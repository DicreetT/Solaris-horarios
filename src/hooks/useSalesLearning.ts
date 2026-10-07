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

export function useSalesLearning(currentUser?: User | null) {
  const [state, setState, isLoading] = useSharedJsonState<SalesLearningState>(
    SALES_LEARNING_KEY,
    EMPTY_STATE,
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      mergeStrategy: (_remote, next) => ({
        formations: Array.isArray(next?.formations) ? next.formations : [],
        support: Array.isArray(next?.support) ? next.support : [],
        needs: Array.isArray(next?.needs) ? next.needs : [],
        faqs: Array.isArray(next?.faqs) ? next.faqs : [],
      }),
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
