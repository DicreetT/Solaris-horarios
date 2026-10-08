import { useMemo } from 'react';
import { USERS } from '../constants';
import { useSharedJsonState } from './useSharedJsonState';
import { InventoryMovementRow, useInventoryMovementsDB } from './useInventoryMovementsDB';
import { toDateKey } from '../utils/dateUtils';

export const DAILY_INVENTORY_CONTROL_KEY = 'daily_inventory_control_events_v1';
export const INVENTORY_STOCK_CONTROL_SNAPSHOT_KEY = 'inventory_stock_control_snapshot_v1';
const FACTURACION_ARCHIVE_KEY = 'facturacion_archive_v1';

export type InventoryDailyReviewStatus = 'pending' | 'conforme' | 'waiting' | 'issue';
export type InventoryDailyReviewerKey = 'anabella' | 'itzi' | 'heidy';

export type InventoryDailyReview = {
  reviewerKey: InventoryDailyReviewerKey;
  reviewerId: string;
  label: string;
  responsibility: string;
  status: InventoryDailyReviewStatus;
  comment?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

export type InventoryDailyManualStockRow = {
  id: string;
  producto?: string;
  lote?: string;
  bodega?: string;
  lunaris?: string;
  physical?: string;
  physicalOk?: boolean;
  zoho?: string;
  zohoOk?: boolean;
  observation?: string;
};

export type InventoryDailySimpleRow = {
  id: string;
  producto?: string;
  lote?: string;
  cantidad?: string;
  cliente?: string;
  origen?: string;
  destino?: string;
  observation?: string;
};

export type InventoryDailyClientRow = {
  id: string;
  cliente?: string;
  pedidos?: string;
  productos?: string;
  observation?: string;
};

export type InventoryDailySnapshotStockRow = {
  key: string;
  producto: string;
  lote: string;
  bodega: string;
  lunaris: number;
  physical: string;
  physicalOk: boolean;
  zoho: string;
  zohoOk: boolean;
  difference: number | null;
  observation: string;
};

export type InventoryDailyReport = {
  id: string;
  dateKey: string;
  eventId?: number;
  manualMode?: boolean;
  checks: {
    shipments: boolean;
    assemblies: boolean;
    stock: boolean;
  };
  rows: Record<string, unknown>;
  attachments: unknown[];
  notes: string;
  manualSections?: {
    shipments?: string;
    clients?: string;
    transfers?: string;
    assemblies?: string;
    stock?: string;
  };
  manualTables?: {
    shipments?: InventoryDailySimpleRow[];
    clients?: InventoryDailyClientRow[];
    transfers?: InventoryDailySimpleRow[];
    assemblies?: InventoryDailySimpleRow[];
    support?: InventoryDailySimpleRow[];
    stock?: InventoryDailyManualStockRow[];
  };
  snapshot?: {
    shipments?: unknown[];
    transfers?: unknown[];
    assemblies?: unknown[];
    stock?: InventoryDailySnapshotStockRow[];
  };
  reviews?: Record<InventoryDailyReviewerKey, InventoryDailyReview>;
  savedAt?: string;
  savedBy?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
};

type InventoryDailyState = {
  reports: InventoryDailyReport[];
  deletedReportIds?: string[];
  deletedEventIds?: number[];
};

export type InventoryStockControlSnapshot = {
  updatedAt?: string;
  canetVisibleStockRows?: Array<{
    producto?: string;
    lote?: string;
    bodega?: string;
    stock?: number;
    stockTotal?: number;
  }>;
  canetRows?: Array<{
    producto?: string;
    lote?: string;
    stockCanet?: number;
  }>;
};

type BillingArchiveEntry = {
  dateKey?: string;
  orders?: Array<{
    id?: string;
    status?: string;
    movementType?: string;
    customerName?: string;
    invoiceNumber?: string;
    sourceWarehouse?: string;
    transferOrigin?: string;
    transferDestination?: string;
    lines?: Array<{
      productCode?: string;
      productRaw?: string;
      lote?: string;
      quantity?: number | string;
    }>;
  }>;
};

const REVIEWER_CONFIG: Array<{
  key: InventoryDailyReviewerKey;
  nameNeedle: string;
  label: string;
  responsibility: string;
}> = [
  { key: 'anabella', nameNeedle: 'anab', label: 'Anabela', responsibility: 'Físico' },
  { key: 'itzi', nameNeedle: 'itzi', label: 'Itzi', responsibility: 'Movimientos / Zoho' },
  { key: 'heidy', nameNeedle: 'heid', label: 'Heidy', responsibility: 'Conciliación' },
];

const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const toNum = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeSearch = (value: unknown) => clean(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');
const normalizeStockKeyPart = (value: unknown) => normalizeSearch(value).toUpperCase();
const isCanetWarehouse = (value: unknown) => normalizeStockKeyPart(value) === 'CANET';

const findUserId = (needle: string) => (
  USERS.find((user) => user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle))?.id || ''
);

const createDefaultReviews = (): Record<InventoryDailyReviewerKey, InventoryDailyReview> => (
  REVIEWER_CONFIG.reduce((acc, item) => {
    acc[item.key] = {
      reviewerKey: item.key,
      reviewerId: findUserId(item.nameNeedle),
      label: item.label,
      responsibility: item.responsibility,
      status: 'pending',
    };
    return acc;
  }, {} as Record<InventoryDailyReviewerKey, InventoryDailyReview>)
);

const normalizeReviews = (value: unknown): Record<InventoryDailyReviewerKey, InventoryDailyReview> => {
  const defaults = createDefaultReviews();
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {};
  REVIEWER_CONFIG.forEach((item) => {
    const current = raw[item.key] || {};
    const status = ['pending', 'conforme', 'waiting', 'issue'].includes(current.status)
      ? current.status as InventoryDailyReviewStatus
      : defaults[item.key].status;
    defaults[item.key] = {
      ...defaults[item.key],
      ...current,
      reviewerKey: item.key,
      label: item.label,
      responsibility: item.responsibility,
      reviewerId: clean(current.reviewerId) || defaults[item.key].reviewerId,
      status,
      comment: clean(current.comment),
      reviewedAt: clean(current.reviewedAt),
      reviewedBy: clean(current.reviewedBy),
    };
  });
  return defaults;
};

const normalizeSimpleRows = (rows: unknown): InventoryDailySimpleRow[] => (
  (Array.isArray(rows) ? rows : []).map((row: any, index) => ({
    id: clean(row?.id) || uid(`row_${index}`),
    producto: clean(row?.producto),
    lote: clean(row?.lote),
    cantidad: clean(row?.cantidad),
    cliente: clean(row?.cliente),
    origen: clean(row?.origen),
    destino: clean(row?.destino),
    observation: clean(row?.observation),
  }))
);

const normalizeClientRows = (rows: unknown): InventoryDailyClientRow[] => (
  (Array.isArray(rows) ? rows : []).map((row: any, index) => ({
    id: clean(row?.id) || uid(`client_${index}`),
    cliente: clean(row?.cliente),
    pedidos: clean(row?.pedidos),
    productos: clean(row?.productos),
    observation: clean(row?.observation),
  }))
);

const normalizeStockRows = (rows: unknown): InventoryDailyManualStockRow[] => (
  (Array.isArray(rows) ? rows : []).map((row: any, index) => ({
    id: clean(row?.id) || uid(`stock_${index}`),
    producto: clean(row?.producto),
    lote: clean(row?.lote),
    bodega: clean(row?.bodega),
    lunaris: clean(row?.lunaris),
    physical: clean(row?.physical),
    physicalOk: !!row?.physicalOk,
    zoho: clean(row?.zoho),
    zohoOk: !!row?.zohoOk,
    observation: clean(row?.observation),
  }))
);

export const normalizeInventoryDailyState = (value: unknown): InventoryDailyState => {
  const raw = value && typeof value === 'object' ? value as any : {};
  const deletedReportIds: string[] = Array.isArray(raw.deletedReportIds)
    ? Array.from(new Set(raw.deletedReportIds.map(clean).filter(Boolean)))
    : [];
  const deletedEventIds: number[] = Array.isArray(raw.deletedEventIds)
    ? Array.from(new Set(raw.deletedEventIds.map((id: unknown) => Number(id)).filter(Number.isFinite)))
    : [];
  const reports: InventoryDailyReport[] = (Array.isArray(raw.reports) ? raw.reports : [])
    .map((report: any): InventoryDailyReport => {
      const createdAt = clean(report?.createdAt) || nowIso();
      const manualTables = report?.manualTables && typeof report.manualTables === 'object'
        ? report.manualTables
        : {};
      return {
        id: clean(report?.id) || uid('ctrl'),
        dateKey: clean(report?.dateKey),
        eventId: Number.isFinite(Number(report?.eventId)) ? Number(report.eventId) : undefined,
        manualMode: report?.manualMode !== false,
        checks: {
          shipments: !!report?.checks?.shipments,
          assemblies: !!report?.checks?.assemblies,
          stock: !!report?.checks?.stock,
        },
        rows: report?.rows && typeof report.rows === 'object' ? report.rows : {},
        attachments: Array.isArray(report?.attachments) ? report.attachments : [],
        notes: clean(report?.notes),
        manualSections: report?.manualSections && typeof report.manualSections === 'object' ? report.manualSections : {},
        manualTables: {
          shipments: normalizeSimpleRows(manualTables.shipments),
          clients: normalizeClientRows(manualTables.clients),
          transfers: normalizeSimpleRows(manualTables.transfers),
          assemblies: normalizeSimpleRows(manualTables.assemblies),
          support: normalizeSimpleRows(manualTables.support),
          stock: normalizeStockRows(manualTables.stock),
        },
        snapshot: report?.snapshot && typeof report.snapshot === 'object'
          ? {
            shipments: Array.isArray(report.snapshot.shipments) ? report.snapshot.shipments : [],
            transfers: Array.isArray(report.snapshot.transfers) ? report.snapshot.transfers : [],
            assemblies: Array.isArray(report.snapshot.assemblies) ? report.snapshot.assemblies : [],
            stock: Array.isArray(report.snapshot.stock) ? report.snapshot.stock : [],
          }
          : undefined,
        reviews: normalizeReviews(report?.reviews),
        savedAt: clean(report?.savedAt),
        savedBy: clean(report?.savedBy),
        createdAt,
        updatedAt: clean(report?.updatedAt) || createdAt,
        updatedBy: clean(report?.updatedBy),
      };
    })
    .filter((report: InventoryDailyReport) => report.dateKey && !deletedReportIds.includes(report.id) && !(report.eventId && deletedEventIds.includes(report.eventId)))
    .sort((a: InventoryDailyReport, b: InventoryDailyReport) => b.dateKey.localeCompare(a.dateKey));

  return { reports, deletedReportIds, deletedEventIds };
};

const buildStockRowsFromSnapshot = (snapshot: InventoryStockControlSnapshot | null | undefined): InventoryDailyManualStockRow[] => {
  const visibleRows = Array.isArray(snapshot?.canetVisibleStockRows) ? snapshot.canetVisibleStockRows : [];
  return visibleRows
    .filter((row) => clean(row.producto) && clean(row.lote))
    .filter((row) => isCanetWarehouse(clean(row.bodega) || 'CANET'))
    .slice(0, 1200)
    .map((row, index) => ({
      id: `stock_${index}_${clean(row.producto)}_${clean(row.lote)}_${clean(row.bodega)}`,
      producto: clean(row.producto),
      lote: clean(row.lote),
      bodega: 'CANET',
      lunaris: String(Number(row.stock ?? row.stockTotal ?? 0)),
      physical: '',
      physicalOk: false,
      zoho: '',
      zohoOk: false,
      observation: '',
    }));
};

const stockRowKey = (row: Partial<InventoryDailyManualStockRow>) => [
  normalizeStockKeyPart(row.producto),
  normalizeStockKeyPart(row.lote),
  normalizeStockKeyPart(row.bodega || 'CANET'),
].join('|');

const mergeStockRowsFromSnapshot = (
  snapshot: InventoryStockControlSnapshot | null | undefined,
  currentRows: InventoryDailyManualStockRow[] | undefined,
): InventoryDailyManualStockRow[] => {
  const currentByKey = new Map<string, InventoryDailyManualStockRow>();
  normalizeStockRows(currentRows).forEach((row) => {
    const key = stockRowKey(row);
    if (key !== '||') currentByKey.set(key, row);
  });

  const snapshotRows: InventoryDailyManualStockRow[] = buildStockRowsFromSnapshot(snapshot);
  const mergedKeys = new Set<string>();
  const merged: InventoryDailyManualStockRow[] = snapshotRows.map((row) => {
    const key = stockRowKey(row);
    const previous = currentByKey.get(key);
    mergedKeys.add(key);
    return {
      ...row,
      id: previous?.id || row.id,
      physical: previous?.physical || '',
      physicalOk: !!previous?.physicalOk,
      zoho: previous?.zoho || '',
      zohoOk: !!previous?.zohoOk,
      observation: previous?.observation || '',
    };
  });

  normalizeStockRows(currentRows).forEach((row) => {
    const key = stockRowKey(row);
    if (!mergedKeys.has(key) && key !== '||') merged.push(row);
  });

  return merged;
};

const buildSnapshotStockRows = (rows: InventoryDailyManualStockRow[]): InventoryDailySnapshotStockRow[] => (
  rows.map((row) => {
    const physical = clean(row.physical);
    const lunaris = Number(row.lunaris || 0);
    return {
      key: clean(row.id) || `${row.producto}|${row.lote}|${row.bodega}`,
      producto: clean(row.producto),
      lote: clean(row.lote),
      bodega: clean(row.bodega),
      lunaris,
      physical,
      physicalOk: physical !== '' && Math.abs(toNum(physical) - lunaris) < 0.000001,
      zoho: clean(row.zoho),
      zohoOk: clean(row.zoho) !== '' && Math.abs(toNum(row.zoho) - lunaris) < 0.000001,
      difference: physical === '' ? null : Number(physical) - lunaris,
      observation: clean(row.observation),
    };
  })
);

const buildTablesFromArchive = (dateKey: string, archives: BillingArchiveEntry[] | null | undefined) => {
  const day = (Array.isArray(archives) ? archives : []).find((entry) => clean(entry.dateKey) === dateKey);
  const orders = Array.isArray(day?.orders) ? day.orders : [];
  const dispatched = orders.filter((order) => clean(order.status).toUpperCase() === 'DESPACHADO');
  const shipments: InventoryDailySimpleRow[] = [];
  const transfers: InventoryDailySimpleRow[] = [];
  const clientsByName = new Map<string, InventoryDailyClientRow>();

  dispatched.forEach((order, orderIndex) => {
    const customer = clean(order.customerName) || 'Cliente sin nombre';
    const products: string[] = [];
    (Array.isArray(order.lines) ? order.lines : []).forEach((line, lineIndex) => {
      const row: InventoryDailySimpleRow = {
        id: `${clean(order.id) || orderIndex}_${lineIndex}_${clean(line.productCode)}`,
        producto: clean(line.productCode) || clean(line.productRaw),
        lote: clean(line.lote),
        cantidad: clean(line.quantity),
        cliente: customer,
        origen: clean(order.sourceWarehouse || order.transferOrigin),
        destino: clean(order.transferDestination),
        observation: clean(order.invoiceNumber),
      };
      products.push([row.producto, row.lote].filter(Boolean).join(' · '));
      if (clean(order.movementType).toLowerCase() === 'traspaso') transfers.push(row);
      else shipments.push(row);
    });
    const prev = clientsByName.get(customer);
    clientsByName.set(customer, {
      id: prev?.id || `client_${orderIndex}_${customer}`,
      cliente: customer,
      pedidos: String((Number(prev?.pedidos) || 0) + 1),
      productos: [...(prev?.productos ? prev.productos.split(', ') : []), ...products].filter(Boolean).slice(0, 12).join(', '),
      observation: clean(order.invoiceNumber),
    });
  });

  return {
    shipments,
    transfers,
    clients: Array.from(clientsByName.values()),
  };
};

const buildAssembliesFromMovements = (
  dateKey: string,
  movements: InventoryMovementRow[] | null | undefined,
): InventoryDailySimpleRow[] => (
  (Array.isArray(movements) ? movements : [])
    .filter((movement) => clean(movement.fecha) === dateKey)
    .filter((movement) => normalizeSearch(movement.tipo_movimiento).includes('ensambl'))
    .map((movement, index) => ({
      id: `assembly_${clean(movement.inventory_id)}_${clean(movement.id) || index}`,
      producto: clean(movement.producto),
      lote: clean(movement.lote),
      cantidad: clean(movement.cantidad_signed) || clean(movement.cantidad),
      cliente: '',
      origen: clean(movement.bodega),
      destino: clean(movement.destino),
      observation: [clean(movement.tipo_movimiento), clean(movement.notas)].filter(Boolean).join(' · '),
    }))
);

const mergeSimpleRows = <T extends { id: string }>(freshRows: T[], currentRows: T[] | undefined): T[] => {
  const currentById = new Map<string, T>();
  (Array.isArray(currentRows) ? currentRows : []).forEach((row) => {
    const id = clean(row.id);
    if (id) currentById.set(id, row);
  });
  const used = new Set<string>();
  const merged = freshRows.map((row) => {
    const id = clean(row.id);
    used.add(id);
    return currentById.get(id) || row;
  });
  currentById.forEach((row, id) => {
    if (!used.has(id)) merged.push(row);
  });
  return merged;
};

const buildReport = (
  dateKey: string,
  snapshot: InventoryStockControlSnapshot | null | undefined,
  archives?: BillingArchiveEntry[] | null,
  movements?: InventoryMovementRow[] | null,
  userId?: string,
): InventoryDailyReport => {
  const stockRows = buildStockRowsFromSnapshot(snapshot);
  const archiveTables = buildTablesFromArchive(dateKey, archives);
  const assemblies = buildAssembliesFromMovements(dateKey, movements);
  const now = nowIso();
  return {
    id: uid('ctrl'),
    dateKey,
    manualMode: true,
    checks: { shipments: false, assemblies: false, stock: false },
    rows: {},
    attachments: [],
    notes: '',
    manualSections: { shipments: '', clients: '', transfers: '', assemblies: '', stock: '' },
    manualTables: {
      shipments: archiveTables.shipments,
      clients: archiveTables.clients,
      transfers: archiveTables.transfers,
      assemblies,
      support: [],
      stock: stockRows,
    },
    snapshot: { shipments: archiveTables.shipments, transfers: archiveTables.transfers, assemblies, stock: buildSnapshotStockRows(stockRows) },
    reviews: createDefaultReviews(),
    createdAt: now,
    updatedAt: now,
    updatedBy: userId || '',
  };
};

export const getInventoryDailyStatus = (report?: InventoryDailyReport | null) => {
  if (!report) return { label: 'Sin evento', tone: 'slate', complete: false };
  const reviews = Object.values(report.reviews || normalizeReviews(undefined));
  const reviewsByKey = normalizeReviews(report.reviews);
  const stockRows = normalizeStockRows(report.manualTables?.stock);
  const missingPhysical = stockRows.filter((row) => clean(row.physical) === '').length;
  const missingZoho = stockRows.filter((row) => clean(row.zoho) === '').length;
  const differences = stockRows.filter((row) => {
    const lunaris = toNum(row.lunaris);
    const physical = clean(row.physical);
    const zoho = clean(row.zoho);
    const physicalDiff = physical === '' ? 0 : toNum(physical) - lunaris;
    const zohoDiff = zoho === '' ? 0 : toNum(zoho) - lunaris;
    const physicalZohoDiff = physical === '' || zoho === '' ? 0 : toNum(physical) - toNum(zoho);
    return Math.abs(physicalDiff) > 0.000001 || Math.abs(zohoDiff) > 0.000001 || Math.abs(physicalZohoDiff) > 0.000001;
  }).length;

  if (stockRows.length === 0) return { label: 'Control creado sin stock', tone: 'sky', complete: false };
  if (reviews.some((review) => review.status === 'issue')) {
    return { label: 'Con incidencia', tone: 'rose', complete: false };
  }
  if (reviews.some((review) => review.status === 'waiting')) {
    return { label: 'En espera', tone: 'amber', complete: false };
  }
  if (reviewsByKey.anabella.status !== 'conforme' || missingPhysical > 0) {
    return { label: 'Pendiente físico', tone: 'sky', complete: false };
  }
  if (reviewsByKey.itzi.status !== 'conforme' || missingZoho > 0) {
    return { label: 'Pendiente Zoho', tone: 'sky', complete: false };
  }
  if (reviewsByKey.heidy.status !== 'conforme') {
    return { label: 'Pendiente conciliación', tone: 'amber', complete: false };
  }
  if (differences > 0) {
    return { label: 'Conciliado con diferencias', tone: 'amber', complete: true };
  }
  return { label: 'Sin diferencias', tone: 'emerald', complete: true };
};

export function useInventoryDailyEvents(currentUserId?: string) {
  const [state, setState, loading] = useSharedJsonState<InventoryDailyState>(
    DAILY_INVENTORY_CONTROL_KEY,
    { reports: [] },
    {
      userId: currentUserId,
      initializeIfMissing: false,
      pollIntervalMs: 3000,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      mergeIncomingWithLocal: true,
    },
  );
  const [inventorySnapshot] = useSharedJsonState<InventoryStockControlSnapshot | null>(
    INVENTORY_STOCK_CONTROL_SNAPSHOT_KEY,
    null,
    { userId: currentUserId, initializeIfMissing: false, pollIntervalMs: 5000 },
  );
  const [dispatchArchive] = useSharedJsonState<BillingArchiveEntry[]>(
    FACTURACION_ARCHIVE_KEY,
    [],
    { userId: currentUserId, initializeIfMissing: false, pollIntervalMs: 8000, protectFromEmptyOverwrite: true },
  );
  const [canetMovements] = useInventoryMovementsDB('canet');
  const [huarteMovements] = useInventoryMovementsDB('huarte');
  const inventoryMovements = useMemo(
    () => [...(canetMovements || []), ...(huarteMovements || [])],
    [canetMovements, huarteMovements],
  );

  const normalized = useMemo(() => normalizeInventoryDailyState(state), [state]);

  const upsertReport = (dateKey: string, updater: (current: InventoryDailyReport | null) => InventoryDailyReport) => {
    setState((prev) => {
      const base = normalizeInventoryDailyState(prev);
      const current = base.reports.find((report) => report.dateKey === dateKey) || null;
      const next = updater(current);
      return {
        deletedReportIds: base.deletedReportIds || [],
        deletedEventIds: base.deletedEventIds || [],
        reports: [next, ...base.reports.filter((report) => report.dateKey !== dateKey)],
      };
    });
  };

  const createEventForDate = (dateKey = toDateKey(new Date())) => {
    upsertReport(dateKey, (current) => {
      const base = current || buildReport(dateKey, inventorySnapshot, dispatchArchive, inventoryMovements, currentUserId);
      const archiveTables = buildTablesFromArchive(dateKey, dispatchArchive);
      const assemblies = buildAssembliesFromMovements(dateKey, inventoryMovements);
      const stock = mergeStockRowsFromSnapshot(inventorySnapshot, base.manualTables?.stock);
      return {
        ...base,
        manualTables: {
          ...(base.manualTables || {}),
          shipments: mergeSimpleRows(archiveTables.shipments, base.manualTables?.shipments),
          clients: mergeSimpleRows(archiveTables.clients, base.manualTables?.clients),
          transfers: mergeSimpleRows(archiveTables.transfers, base.manualTables?.transfers),
          assemblies: mergeSimpleRows(assemblies, base.manualTables?.assemblies),
          stock,
        },
        snapshot: {
          ...(base.snapshot || {}),
          shipments: archiveTables.shipments,
          clients: archiveTables.clients,
          transfers: archiveTables.transfers,
          assemblies,
          stock: buildSnapshotStockRows(stock),
        },
        reviews: normalizeReviews(current?.reviews),
        updatedAt: nowIso(),
        updatedBy: currentUserId || '',
      };
    });
  };

  const updateReview = (
    dateKey: string,
    reviewerKey: InventoryDailyReviewerKey,
    status: InventoryDailyReviewStatus,
    comment: string,
  ) => {
    upsertReport(dateKey, (current) => {
      const base = current || buildReport(dateKey, inventorySnapshot, dispatchArchive, inventoryMovements, currentUserId);
      const reviews = normalizeReviews(base.reviews);
      return {
        ...base,
        reviews: {
          ...reviews,
          [reviewerKey]: {
            ...reviews[reviewerKey],
            status,
            comment,
            reviewedAt: nowIso(),
            reviewedBy: currentUserId || '',
          },
        },
        updatedAt: nowIso(),
        updatedBy: currentUserId || '',
      };
    });
  };

  const updateNotes = (dateKey: string, notes: string) => {
    upsertReport(dateKey, (current) => ({
      ...(current || buildReport(dateKey, inventorySnapshot, dispatchArchive, inventoryMovements, currentUserId)),
      notes,
      updatedAt: nowIso(),
      updatedBy: currentUserId || '',
    }));
  };

  const updateManualTable = (
    dateKey: string,
    table: keyof NonNullable<InventoryDailyReport['manualTables']>,
    rows: Array<InventoryDailySimpleRow | InventoryDailyClientRow | InventoryDailyManualStockRow>,
  ) => {
    upsertReport(dateKey, (current) => {
      const base = current || buildReport(dateKey, inventorySnapshot, dispatchArchive, inventoryMovements, currentUserId);
      const manualTables = base.manualTables || {};
      const nextStock = table === 'stock' ? normalizeStockRows(rows) : normalizeStockRows(manualTables.stock);
      return {
        ...base,
        manualTables: {
          ...manualTables,
          [table]: rows,
          stock: table === 'stock' ? nextStock : normalizeStockRows(manualTables.stock),
        },
        snapshot: {
          ...(base.snapshot || {}),
          stock: buildSnapshotStockRows(nextStock),
        },
        updatedAt: nowIso(),
        updatedBy: currentUserId || '',
      };
    });
  };

  return {
    loading,
    reports: normalized.reports,
    inventorySnapshot,
    createEventForDate,
    updateReview,
    updateNotes,
    updateManualTable,
  };
}
