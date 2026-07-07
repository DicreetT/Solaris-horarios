export const INVENTORY_MONTHLY_CLOSURES_KEY = 'inventory_monthly_closures_v1';

export type InventoryMonthlyCloseScope = 'canet' | 'huarte';

export type InventoryMonthlyCloseRow = {
  producto: string;
  lote: string;
  bodega: string;
  stock: number;
};

export type InventoryMonthlyCloseSnapshot = {
  id: string;
  schemaVersion?: 2;
  frozen?: true;
  scope: InventoryMonthlyCloseScope;
  monthKey: string;
  monthLabel: string;
  closedAt: string;
  closedBy: string;
  rows: InventoryMonthlyCloseRow[];
  rowCount?: number;
  snapshotHash?: string;
  createdFrom?: 'manual_monthly_close';
  totalStock: number;
  productCount: number;
  lotCount: number;
  warehouseCount: number;
  deletedAt?: string;
  deletedBy?: string;
};

const clean = (value: unknown) => (value == null ? '' : String(value).trim());
const normalizeStock = (value: unknown) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(6)) : 0);

const normalizeRows = (rows: InventoryMonthlyCloseRow[] | null | undefined) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      producto: clean(row.producto),
      lote: clean(row.lote),
      bodega: clean(row.bodega),
      stock: normalizeStock(row.stock),
    }))
    .filter((row) => row.producto && row.lote && row.bodega)
    .sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote) || a.bodega.localeCompare(b.bodega));

const rowsSignature = (rows: InventoryMonthlyCloseRow[]) =>
  normalizeRows(rows)
    .map((row) => `${row.producto}|${row.lote}|${row.bodega}|${row.stock.toFixed(6)}`)
    .join('\n');

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const getInventoryMonthlyCloseSnapshotHash = (rows: InventoryMonthlyCloseRow[] | null | undefined) =>
  hashText(rowsSignature(rows || []));

export const getPreviousMonthKey = (monthKey: string) => {
  const [year, month] = clean(monthKey).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return '';
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export function buildInventoryMonthlyCloseSnapshot(input: {
  scope: InventoryMonthlyCloseScope;
  monthKey: string;
  monthLabel: string;
  closedBy: string;
  rows: InventoryMonthlyCloseRow[];
}): InventoryMonthlyCloseSnapshot {
  const rows = normalizeRows(input.rows);

  return {
    id: `${input.scope}:${input.monthKey}`,
    schemaVersion: 2,
    frozen: true,
    scope: input.scope,
    monthKey: input.monthKey,
    monthLabel: input.monthLabel,
    closedAt: new Date().toISOString(),
    closedBy: clean(input.closedBy) || 'Usuario',
    rows,
    rowCount: rows.length,
    snapshotHash: getInventoryMonthlyCloseSnapshotHash(rows),
    createdFrom: 'manual_monthly_close',
    totalStock: rows.reduce((acc, row) => acc + row.stock, 0),
    productCount: new Set(rows.map((row) => row.producto)).size,
    lotCount: new Set(rows.map((row) => `${row.producto}|${row.lote}`)).size,
    warehouseCount: new Set(rows.map((row) => row.bodega)).size,
  };
}

export function upsertInventoryMonthlyCloseSnapshot(
  snapshots: InventoryMonthlyCloseSnapshot[] | null | undefined,
  snapshot: InventoryMonthlyCloseSnapshot,
) {
  return [
    snapshot,
    ...(Array.isArray(snapshots) ? snapshots : []).filter((item) => clean(item.id) !== snapshot.id),
  ].sort((a, b) => clean(b.monthKey).localeCompare(clean(a.monthKey)) || clean(a.scope).localeCompare(clean(b.scope)));
}

export function mergeInventoryMonthlyCloseSnapshots(
  remote: InventoryMonthlyCloseSnapshot[] | null | undefined,
  local: InventoryMonthlyCloseSnapshot[] | null | undefined,
) {
  const byId = new Map<string, InventoryMonthlyCloseSnapshot>();

  for (const snapshot of Array.isArray(remote) ? remote : []) {
    const id = clean(snapshot.id);
    if (!id) continue;
    byId.set(id, snapshot);
  }

  for (const snapshot of Array.isArray(local) ? local : []) {
    const id = clean(snapshot.id);
    if (!id) continue;
    byId.set(id, snapshot);
  }

  return Array.from(byId.values()).sort(
    (a, b) => clean(b.monthKey).localeCompare(clean(a.monthKey)) || clean(a.scope).localeCompare(clean(b.scope)),
  );
}

export function getInventoryMonthlyCloseSnapshot(
  snapshots: InventoryMonthlyCloseSnapshot[] | null | undefined,
  scope: InventoryMonthlyCloseScope,
  monthKey: string,
) {
  return (Array.isArray(snapshots) ? snapshots : []).find(
    (snapshot) => !snapshot.deletedAt && snapshot.scope === scope && clean(snapshot.monthKey) === clean(monthKey),
  );
}

export const monthlyCloseRowsForExport = (snapshot: InventoryMonthlyCloseSnapshot) =>
  snapshot.rows.map((row) => [row.producto, row.lote, row.bodega, row.stock] as Array<string | number>);

export function getInventoryMonthlyCloseDrift(
  snapshot: InventoryMonthlyCloseSnapshot | null | undefined,
  currentRows: InventoryMonthlyCloseRow[] | null | undefined,
) {
  if (!snapshot) return null;
  const frozenRows = normalizeRows(snapshot.rows);
  const recalculatedRows = normalizeRows(currentRows);
  const savedHash = snapshot.snapshotHash || getInventoryMonthlyCloseSnapshotHash(frozenRows);
  const currentHash = getInventoryMonthlyCloseSnapshotHash(recalculatedRows);
  const savedTotal = frozenRows.reduce((acc, row) => acc + row.stock, 0);
  const currentTotal = recalculatedRows.reduce((acc, row) => acc + row.stock, 0);
  const stockDelta = Number((currentTotal - savedTotal).toFixed(6));
  const rowDelta = recalculatedRows.length - frozenRows.length;

  return {
    changed: savedHash !== currentHash,
    savedHash,
    currentHash,
    savedTotal,
    currentTotal,
    stockDelta,
    rowDelta,
  };
}
