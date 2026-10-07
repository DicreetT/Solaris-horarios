import { useMemo } from 'react';
import type { Attachment, User } from '../types';
import { useSharedJsonState } from './useSharedJsonState';

export const FINANCE_OPERATIONS_KEY = 'finance_operations_v1';

export type PromotionOperationalStatus = 'in_review' | 'scheduled' | 'active' | 'finished';

export type PromotionMeta = {
  projectId: string;
  status: PromotionOperationalStatus;
  startDate?: string;
  endDate?: string;
  couponCode?: string;
  audience?: string;
  maxPeople?: string;
  products?: string;
  howItWorks?: string;
  economicNote?: string;
  updatedAt: string;
  updatedBy?: string;
};

export type PromotionRecord = {
  id: string;
  kind: 'coupon' | 'promotion';
  name: string;
  reason?: string;
  audience?: string;
  maxPeople?: string;
  products?: string;
  couponCode?: string;
  discount?: string;
  startDate?: string;
  endDate?: string;
  howItWorks?: string;
  status: PromotionOperationalStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};

export type MonthlyFinanceReport = {
  id: string;
  monthKey: string;
  title: string;
  reportType: 'socios' | 'perdidas_ganancias' | 'gastos_proveedores' | 'inventario' | 'proyectos' | 'ventas' | 'sistemas_analytics' | 'otros';
  notes?: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};

export type FinanceOperationsState = {
  promotionMetaByProjectId: Record<string, PromotionMeta>;
  promotions: PromotionRecord[];
  monthlyReports: MonthlyFinanceReport[];
};

const EMPTY_STATE: FinanceOperationsState = {
  promotionMetaByProjectId: {},
  promotions: [],
  monthlyReports: [],
};

const clean = (value: unknown) => String(value ?? '').trim();

function nowIso() {
  return new Date().toISOString();
}

function uniqueId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeReport(raw: any): MonthlyFinanceReport {
  const now = nowIso();
  const type = ['socios', 'perdidas_ganancias', 'gastos_proveedores', 'inventario', 'proyectos', 'ventas', 'sistemas_analytics', 'otros'].includes(raw?.reportType)
    ? raw.reportType
    : 'otros';
  return {
    id: clean(raw?.id) || uniqueId('finance_report'),
    monthKey: clean(raw?.monthKey),
    title: clean(raw?.title) || 'Informe mensual',
    reportType: type,
    notes: clean(raw?.notes),
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
    createdAt: clean(raw?.createdAt) || now,
    updatedAt: clean(raw?.updatedAt) || clean(raw?.createdAt) || now,
    updatedBy: clean(raw?.updatedBy),
    deletedAt: clean(raw?.deletedAt),
    deletedBy: clean(raw?.deletedBy),
  };
}

function normalizePromotion(raw: any): PromotionRecord {
  const now = nowIso();
  const status = ['in_review', 'scheduled', 'active', 'finished'].includes(raw?.status)
    ? raw.status
    : 'in_review';
  return {
    id: clean(raw?.id) || uniqueId('promotion'),
    kind: raw?.kind === 'promotion' ? 'promotion' : 'coupon',
    name: clean(raw?.name) || 'Cupón / promoción',
    reason: clean(raw?.reason),
    audience: clean(raw?.audience),
    maxPeople: clean(raw?.maxPeople),
    products: clean(raw?.products),
    couponCode: clean(raw?.couponCode),
    discount: clean(raw?.discount),
    startDate: clean(raw?.startDate),
    endDate: clean(raw?.endDate),
    howItWorks: clean(raw?.howItWorks),
    status,
    createdBy: clean(raw?.createdBy),
    createdAt: clean(raw?.createdAt) || now,
    updatedAt: clean(raw?.updatedAt) || clean(raw?.createdAt) || now,
    updatedBy: clean(raw?.updatedBy),
    deletedAt: clean(raw?.deletedAt),
    deletedBy: clean(raw?.deletedBy),
  };
}

export function normalizeFinanceOperationsState(value: unknown): FinanceOperationsState {
  const raw = value && typeof value === 'object' ? value as any : {};
  const metaRaw = raw.promotionMetaByProjectId && typeof raw.promotionMetaByProjectId === 'object'
    ? raw.promotionMetaByProjectId
    : {};
  const promotionMetaByProjectId = Object.fromEntries(
    Object.entries(metaRaw).map(([projectId, meta]: [string, any]) => [
      projectId,
      {
        projectId,
        status: ['in_review', 'scheduled', 'active', 'finished'].includes(meta?.status) ? meta.status : 'in_review',
        startDate: clean(meta?.startDate),
        endDate: clean(meta?.endDate),
        couponCode: clean(meta?.couponCode),
        audience: clean(meta?.audience),
        maxPeople: clean(meta?.maxPeople),
        products: clean(meta?.products),
        howItWorks: clean(meta?.howItWorks),
        economicNote: clean(meta?.economicNote),
        updatedAt: clean(meta?.updatedAt) || nowIso(),
        updatedBy: clean(meta?.updatedBy),
      } satisfies PromotionMeta,
    ]),
  );

  return {
    promotionMetaByProjectId,
    promotions: (Array.isArray(raw.promotions) ? raw.promotions : [])
      .map(normalizePromotion)
      .sort((a: PromotionRecord, b: PromotionRecord) => b.updatedAt.localeCompare(a.updatedAt)),
    monthlyReports: (Array.isArray(raw.monthlyReports) ? raw.monthlyReports : [])
      .map(normalizeReport)
      .filter((report: MonthlyFinanceReport) => report.monthKey)
      .sort((a: MonthlyFinanceReport, b: MonthlyFinanceReport) => b.monthKey.localeCompare(a.monthKey) || b.updatedAt.localeCompare(a.updatedAt)),
  };
}

function newerTimestamp(a?: string, b?: string) {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  return (Number.isFinite(aTime) ? aTime : 0) >= (Number.isFinite(bTime) ? bTime : 0);
}

function reportVersion(report?: MonthlyFinanceReport) {
  return report?.deletedAt || report?.updatedAt || report?.createdAt;
}

function promotionVersion(promotion?: PromotionRecord) {
  return promotion?.deletedAt || promotion?.updatedAt || promotion?.createdAt;
}

function mergeFinanceOperationsState(remote: unknown, local: unknown): FinanceOperationsState {
  const remoteState = normalizeFinanceOperationsState(remote);
  const localState = normalizeFinanceOperationsState(local);
  const promotionMetaByProjectId = { ...remoteState.promotionMetaByProjectId };

  Object.entries(localState.promotionMetaByProjectId).forEach(([projectId, meta]) => {
    const previous = promotionMetaByProjectId[projectId];
    promotionMetaByProjectId[projectId] = !previous || newerTimestamp(meta.updatedAt, previous.updatedAt)
      ? { ...previous, ...meta }
      : { ...meta, ...previous };
  });

  const promotionsById = new Map<string, PromotionRecord>();
  [...remoteState.promotions, ...localState.promotions].forEach((promotion) => {
    const previous = promotionsById.get(promotion.id);
    promotionsById.set(promotion.id, !previous || newerTimestamp(promotionVersion(promotion), promotionVersion(previous)) ? promotion : previous);
  });

  const reportsById = new Map<string, MonthlyFinanceReport>();
  [...remoteState.monthlyReports, ...localState.monthlyReports].forEach((report) => {
    const previous = reportsById.get(report.id);
    reportsById.set(report.id, !previous || newerTimestamp(reportVersion(report), reportVersion(previous)) ? report : previous);
  });

  return normalizeFinanceOperationsState({
    promotionMetaByProjectId,
    promotions: Array.from(promotionsById.values()),
    monthlyReports: Array.from(reportsById.values()),
  });
}

export function useFinanceOperations(currentUser?: User | null) {
  const [state, setState, isLoading] = useSharedJsonState<FinanceOperationsState>(
    FINANCE_OPERATIONS_KEY,
    EMPTY_STATE,
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      mergeStrategy: mergeFinanceOperationsState,
      isUsefulPayload: (payload) => !!payload && typeof payload === 'object',
    },
  );

  const normalized = useMemo(() => normalizeFinanceOperationsState(state), [state]);

  const createPromotion = (draft: Omit<PromotionRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    const now = nowIso();
    const promotion: PromotionRecord = {
      ...draft,
      id: uniqueId('promotion'),
      createdBy: currentUser?.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: currentUser?.id,
    };
    setState((prev) => {
      const base = normalizeFinanceOperationsState(prev);
      return {
        ...base,
        promotions: [promotion, ...base.promotions],
      };
    });
    return promotion;
  };

  const updatePromotion = (promotionId: string, patch: Partial<Omit<PromotionRecord, 'id' | 'createdAt'>>) => {
    const now = nowIso();
    setState((prev) => {
      const base = normalizeFinanceOperationsState(prev);
      return {
        ...base,
        promotions: base.promotions.map((promotion) => (
          promotion.id === promotionId
            ? { ...promotion, ...patch, updatedAt: now, updatedBy: currentUser?.id }
            : promotion
        )),
      };
    });
  };

  const deletePromotion = (promotionId: string) => {
    const now = nowIso();
    setState((prev) => {
      const base = normalizeFinanceOperationsState(prev);
      return {
        ...base,
        promotions: base.promotions.map((promotion) => (
          promotion.id === promotionId
            ? { ...promotion, deletedAt: now, deletedBy: currentUser?.id, updatedAt: now, updatedBy: currentUser?.id }
            : promotion
        )),
      };
    });
  };

  const updatePromotionMeta = (projectId: string, patch: Partial<Omit<PromotionMeta, 'projectId' | 'updatedAt'>>) => {
    const now = nowIso();
    setState((prev) => {
      const base = normalizeFinanceOperationsState(prev);
      const existing = base.promotionMetaByProjectId[projectId] || {
        projectId,
        status: 'in_review',
        updatedAt: now,
      };
      return {
        ...base,
        promotionMetaByProjectId: {
          ...base.promotionMetaByProjectId,
          [projectId]: {
            ...existing,
            ...patch,
            projectId,
            updatedAt: now,
            updatedBy: currentUser?.id,
          },
        },
      };
    });
  };

  const upsertMonthlyReport = (report: Omit<MonthlyFinanceReport, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const now = nowIso();
    setState((prev) => {
      const base = normalizeFinanceOperationsState(prev);
      const existing = report.id ? base.monthlyReports.find((item) => item.id === report.id) : null;
      const nextReport: MonthlyFinanceReport = {
        id: report.id || uniqueId('finance_report'),
        monthKey: report.monthKey,
        title: report.title,
        reportType: report.reportType,
        notes: report.notes,
        attachments: report.attachments || [],
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        updatedBy: currentUser?.id,
      };
      return {
        ...base,
        monthlyReports: [
          nextReport,
          ...base.monthlyReports.filter((item) => item.id !== nextReport.id),
        ],
      };
    });
  };

  const deleteMonthlyReport = (reportId: string) => {
    const now = nowIso();
    setState((prev) => {
      const base = normalizeFinanceOperationsState(prev);
      return {
        ...base,
        monthlyReports: base.monthlyReports.map((item) => (
          item.id === reportId
            ? { ...item, deletedAt: now, deletedBy: currentUser?.id, updatedAt: now, updatedBy: currentUser?.id }
            : item
        )),
      };
    });
  };

  return {
    isLoading,
    promotionMetaByProjectId: normalized.promotionMetaByProjectId,
    promotions: normalized.promotions.filter((promotion) => !promotion.deletedAt),
    monthlyReports: normalized.monthlyReports.filter((report) => !report.deletedAt),
    createPromotion,
    updatePromotion,
    deletePromotion,
    updatePromotionMeta,
    upsertMonthlyReport,
    deleteMonthlyReport,
  };
}
