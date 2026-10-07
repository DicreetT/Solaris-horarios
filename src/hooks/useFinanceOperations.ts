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
  monthlyReports: MonthlyFinanceReport[];
};

const EMPTY_STATE: FinanceOperationsState = {
  promotionMetaByProjectId: {},
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

  const reportsById = new Map<string, MonthlyFinanceReport>();
  [...remoteState.monthlyReports, ...localState.monthlyReports].forEach((report) => {
    const previous = reportsById.get(report.id);
    reportsById.set(report.id, !previous || newerTimestamp(reportVersion(report), reportVersion(previous)) ? report : previous);
  });

  return normalizeFinanceOperationsState({
    promotionMetaByProjectId,
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
    monthlyReports: normalized.monthlyReports.filter((report) => !report.deletedAt),
    updatePromotionMeta,
    upsertMonthlyReport,
    deleteMonthlyReport,
  };
}
