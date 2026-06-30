import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, BarChart3, Boxes, Calculator, Download, FileSpreadsheet, FileWarning, FolderTree, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import seed from '../data/inventory_facturacion_seed.json';
import canetSeed from '../data/inventory_seed.json';
import { useAuth } from '../context/AuthContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import InventoryConnectionBanner from '../components/inventory/InventoryConnectionBanner';
import ProductKitComposer from '../components/inventory/ProductKitComposer';
import { CARLOS_EMAIL, USERS } from '../constants';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import {
  CANET_MASTER_WAREHOUSES,
  HUARTE_STOCK_WAREHOUSES,
  buildMissingTransferEntryMovements,
  calculateInventoryStockSnapshot,
  normalizeInventoryWarehouse,
  sortInventoryWarehouses,
} from '../utils/inventoryStock';
import {
  buildInventoryMonthlyCloseSnapshot,
  getInventoryMonthlyCloseDrift,
  getInventoryMonthlyCloseSnapshot,
  getPreviousMonthKey,
  INVENTORY_MONTHLY_CLOSURES_KEY,
  monthlyCloseRowsForExport,
  upsertInventoryMonthlyCloseSnapshot,
  type InventoryMonthlyCloseSnapshot,
} from '../utils/inventoryMonthlyClose';
import { openPrintablePdfReport } from '../utils/pdfReport';
import { openTableXlsx } from '../utils/tableExport';
import { formatKitComponents, formatKitComponentsInline, isRetiredProductCode, normalizeKitComponents, parseKitComponentsText, upsertProductCatalogRow } from '../utils/productCatalog';
import { describeConnectionError } from '../utils/connectionErrors';
import { useDensityMode } from '../hooks/useDensityMode';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { useInventoryMovementsDB } from '../hooks/useInventoryMovementsDB';

type TabKey = 'dashboard' | 'movimientos' | 'rectificativas' | 'ensamblajes' | 'maestros' | 'cierres';
type DashboardKey = 'stock' | 'control' | 'rect' | 'ventas_anual' | 'envios_mes' | 'ensam_anual';
type MasterKey = 'productos' | 'lotes' | 'bodegas' | 'tipos' | 'clientes' | 'bitacora';
type InventoryAccessMode = 'unset' | 'consult' | 'edit';

type Movement = {
  id: number;
  fecha: string;
  tipo_movimiento: string;
  producto: string;
  lote: string;
  cantidad: number;
  bodega: string;
  cliente?: string;
  destino?: string;
  factura_doc?: string;
  responsable?: string;
  motivo?: string;
  notas?: string;
  source?: string;
  signo?: number;
  cantidad_signed?: number;
  created_at?: string;
  updated_at?: string;
  updated_by?: string;
  origin_canet_id?: number;
};

type MovementDraftLine = {
  id: string;
  producto: string;
  lote: string;
  cantidad: string;
  bodega?: string;
  destino?: string;
};

type GenericRow = Record<string, any>;
type InventoryAuditEntry = {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
};
type ArchivedLotEntry = {
  id: string;
  producto: string;
  lote: string;
  archivedAt: string;
  archivedBy?: string;
  restoredAt?: string;
  restoredBy?: string;
};

const EMPTY_PRODUCT_FORM = {
  producto: '',
  tipo_producto: 'COMPLEMENTO ALIMENTICIO',
  stock_min: '',
  stock_optimo: '',
  consumo_mensual_cajas: '',
  modo_stock: 'DIRECTO',
  activo_si_no: 'SI',
  kit_componentes_text: '',
};
type TextEditDialogPayload = {
  title: string;
  value: string;
  confirmLabel: string;
  onConfirm: (nextValue: string) => void | Promise<void>;
};

const STORAGE_MOVS_KEY = 'invhf_movimientos_v1';
const STORAGE_CANET_ASSEMBLIES_SEEN = 'invhf_canet_assemblies_seen_v1';
const STORAGE_CANET_ASSEMBLIES_NOTIFIED = 'invhf_canet_assemblies_notified_v1';
const STORAGE_HUARTE_HIDDEN_CORRECTIONS = 'inventory_huarte_hidden_corrections_v1';
const STORAGE_HUARTE_VISUAL_STOCK_BY_LOT = 'inventory_huarte_visual_stock_by_lot_v2';
const CANET_ASSEMBLY_SYNC_START = '2026-02-23';
const STORAGE_LOT_ARCHIVES = 'inventory_huarte_lot_archives_v1';
const HUARTE_PRODUCT_COLORS: Record<string, string> = {
  SV: '#83b06f',
  ENT: '#76a5af',
  KL: '#f9a8d4',
  ISO: '#fca5a5',
  AV: '#f9cb9c',
  RG: '#1e3a8a',
};
const STATIC_CORRECTION_IDS = [
  999999, 999998, 999997, 999996, 999995, 999994, 999993, 999992, 999991,
  999990, 999989, 999988, 999987, 999986, 999985, 999984, 999983,
  999982, 999981, 999980, 999979, 999978, 999977, 999976, 999975,
];
const STATIC_CORRECTION_ID_SET = new Set<number>(STATIC_CORRECTION_IDS);
const LEGACY_FEB28_RECOVERY_ROWS: Movement[] = [
  {
    id: 999982,
    fecha: '2026-02-28',
    tipo_movimiento: 'CORRECION',
    producto: 'RG',
    lote: '2504A04',
    cantidad: 88,
    cantidad_signed: 88,
    signo: 1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
  {
    id: 999981,
    fecha: '2026-02-28',
    tipo_movimiento: 'CORRECION',
    producto: 'SV',
    lote: '2511A34',
    cantidad: 26,
    cantidad_signed: -26,
    signo: -1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
  {
    id: 999980,
    fecha: '2026-02-28',
    tipo_movimiento: 'venta',
    producto: 'SV',
    lote: '2511A34',
    cantidad: 115,
    cantidad_signed: -115,
    signo: -1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
  {
    id: 999979,
    fecha: '2026-02-28',
    tipo_movimiento: 'CORRECION',
    producto: 'KL',
    lote: '241030',
    cantidad: 4,
    cantidad_signed: 4,
    signo: 1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
  {
    id: 999978,
    fecha: '2026-02-28',
    tipo_movimiento: 'CORRECION',
    producto: 'ISO',
    lote: '250932',
    cantidad: 13,
    cantidad_signed: -13,
    signo: -1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
  {
    id: 999977,
    fecha: '2026-02-28',
    tipo_movimiento: 'venta',
    producto: 'ISO',
    lote: '250932',
    cantidad: 42,
    cantidad_signed: -42,
    signo: -1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
  {
    id: 999976,
    fecha: '2026-02-28',
    tipo_movimiento: 'CORRECION',
    producto: 'ENT',
    lote: '2507A19',
    cantidad: 1,
    cantidad_signed: -1,
    signo: -1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
  {
    id: 999975,
    fecha: '2026-02-28',
    tipo_movimiento: 'CORRECION',
    producto: 'AV',
    lote: '2507A07',
    cantidad: 4,
    cantidad_signed: -4,
    signo: -1,
    bodega: 'HUARTE',
    notas: 'Restauración automática de histórico 28/02/2026',
    source: 'manual',
  },
];

const clean = (v: unknown) => (v == null ? '' : String(v).trim());
const normalizeLotState = (v: unknown) => (clean(v).toUpperCase() === 'AGOTADO' ? 'AGOTADO' : 'ACTIVO');
const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const normalizeSearch = (v: unknown) =>
  clean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const normalizeLotToken = (v: unknown) => clean(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
// Compatibilidad histórica: algunos registros viejos llegaron con "O" en vez de "0" (ej: O30).
const normalizeLotCompareToken = (v: unknown) => normalizeLotToken(v).replace(/O/g, '0');
const isInvalidLegacyLot = (producto: unknown, lote: unknown) =>
  clean(producto).toUpperCase() === 'KL' && normalizeLotToken(lote) === 'O30';
const isShortLegacyLotAlias = (lote: unknown) => {
  const token = normalizeLotCompareToken(lote);
  return token.length > 0 && token.length <= 4;
};
const hasLongerLotAlias = (candidates: string[], lote: unknown) => {
  const token = normalizeLotCompareToken(lote);
  if (!token || !isShortLegacyLotAlias(lote)) return false;
  return candidates.some((candidate) => {
    const candidateToken = normalizeLotCompareToken(candidate);
    return candidateToken.length > token.length && candidateToken.endsWith(token);
  });
};
const normalizeWarehouseAlias = (v: unknown) => normalizeInventoryWarehouse(v);
const CANET_TRANSFER_WAREHOUSES = new Set(CANET_MASTER_WAREHOUSES.map((warehouse) => normalizeWarehouseAlias(warehouse)));
const ALL_TRANSFER_WAREHOUSE_ORDER = Array.from(new Set([...HUARTE_STOCK_WAREHOUSES, ...CANET_MASTER_WAREHOUSES].map((warehouse) => normalizeWarehouseAlias(warehouse)).filter(Boolean)));
const HUARTE_OWN_WAREHOUSE_ORDER = HUARTE_STOCK_WAREHOUSES;
const HUARTE_OWN_WAREHOUSES = new Set(HUARTE_OWN_WAREHOUSE_ORDER);
const isHuarteOwnedWarehouse = (value: unknown) => HUARTE_OWN_WAREHOUSES.has(normalizeWarehouseAlias(value));
const normalizeHuarteWarehouseInput = (value: unknown) => {
  const normalized = normalizeWarehouseAlias(value);
  return HUARTE_OWN_WAREHOUSES.has(normalized) ? normalized : '';
};
const mergeBodegasPayload = (remotePayload: any, localPayload: any) => {
  if (!Array.isArray(remotePayload)) return localPayload;
  if (!Array.isArray(localPayload)) return remotePayload;

  const byKey = new Map<string, GenericRow>();
  const remoteOrder: string[] = [];

  const upsert = (row: GenericRow, fromRemote: boolean) => {
    if (!row || typeof row !== 'object') return;
    const bodega = clean(row.bodega).toUpperCase();
    if (!bodega) return;
    const normalizedIncoming: GenericRow = {
      ...row,
      bodega,
      activo_si_no: clean(row.activo_si_no) || 'SI',
    };
    if (fromRemote && !remoteOrder.includes(bodega)) remoteOrder.push(bodega);
    const prev = byKey.get(bodega);
    if (!prev) {
      byKey.set(bodega, normalizedIncoming);
      return;
    }
    byKey.set(bodega, {
      ...prev,
      ...normalizedIncoming,
      activo_si_no: clean(normalizedIncoming.activo_si_no || prev.activo_si_no) || 'SI',
    });
  };

  remotePayload.forEach((row: GenericRow) => upsert(row, true));
  localPayload.forEach((row: GenericRow) => upsert(row, false));

  const localOrder = localPayload
    .filter((row: GenericRow) => row && typeof row === 'object')
    .map((row: GenericRow) => clean(row.bodega).toUpperCase())
    .filter(Boolean);
  const finalOrder = Array.from(new Set([...remoteOrder, ...localOrder]));
  return finalOrder.map((bodega) => byKey.get(bodega)).filter((row): row is GenericRow => !!row);
};
const getCurrentMonthKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const describeDbError = (error: unknown) => {
  return describeConnectionError(error, 'No se pudo guardar cambios en Inventario Huarte.');
};
const isHuarteAlias = (v: unknown) => {
  const x = normalizeSearch(v);
  return x.includes('huarte') || x.includes('guarte') || x.includes('warte') || x.includes('wuarte');
};
const lotArchiveAtMs = (row: GenericRow) => {
  const candidates = [clean((row as any).archivedAt), clean((row as any).archived_at)];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};
const lotRestoredAtMs = (row: GenericRow) => {
  const candidates = [clean((row as any).restoredAt), clean((row as any).restored_at)];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};
const isArchivedLotEntryActive = (row: GenericRow) => {
  const archivedAt = lotArchiveAtMs(row);
  if (archivedAt <= 0) return false;
  return archivedAt > lotRestoredAtMs(row);
};
const inferMovementSign = (typeRaw: string, qtyRaw: number) => {
  const t = normalizeSearch(typeRaw).replace(/[−–—]/g, '-');
  if (t.includes('nota credito') || t.includes('nota_credito')) return 1;
  if (t.includes('venta') || t.includes('envio') || t.includes('traspaso')) return -1;
  if (t.includes('ajuste')) {
    if (/ajuste[\s_-]*negativ/.test(t) || /ajuste\s*-/.test(t) || t.includes('ajuste-')) return -1;
    if (/ajuste[\s_-]*positiv/.test(t) || /ajuste\s*\+/.test(t) || t.includes('ajuste+')) return 1;
    if (qtyRaw < 0) return -1;
  }
  return qtyRaw < 0 ? -1 : 1;
};
const canonicalLotForProduct = (loteRows: GenericRow[], productoRaw: string, loteRaw: string) => {
  const producto = clean(productoRaw);
  const lote = clean(loteRaw);
  if (!producto || !lote || isInvalidLegacyLot(producto, lote)) return lote;
  const token = normalizeLotCompareToken(lote);
  const productLots = Array.from(
    new Set(
      loteRows
        .filter((l) => clean(l.producto) === producto)
        .map((l) => clean(l.lote))
        .filter(Boolean),
    ),
  );
  const pickBest = (candidates: string[]) =>
    [...candidates]
      .sort((a, b) => normalizeLotCompareToken(b).length - normalizeLotCompareToken(a).length || clean(b).length - clean(a).length)[0];
  const matches = pickBest(productLots.filter((candidate) => normalizeLotCompareToken(candidate).endsWith(token)));
  if (matches) return matches;
  const exact = pickBest(productLots.filter((candidate) => normalizeLotCompareToken(candidate) === token));
  if (exact) return exact;
  return lote;
};
const inferSignedQuantity = (movement: Pick<Movement, 'cantidad' | 'cantidad_signed' | 'signo' | 'tipo_movimiento'>) => {
  const hasSigned =
    movement.cantidad_signed !== undefined &&
    movement.cantidad_signed !== null &&
    clean(movement.cantidad_signed) !== '';
  if (hasSigned) return toNum(movement.cantidad_signed);
  const rawQty = toNum(movement.cantidad);
  const absQty = Math.abs(rawQty);
  const explicitSign = toNum(movement.signo);
  if (explicitSign !== 0) return absQty * explicitSign;
  return absQty * inferMovementSign(clean(movement.tipo_movimiento), rawQty);
};
const sameMovementFingerprint = (a: Movement, b: Movement) =>
  clean(a.fecha) === clean(b.fecha) &&
  clean(a.tipo_movimiento).toLowerCase() === clean(b.tipo_movimiento).toLowerCase() &&
  clean(a.producto) === clean(b.producto) &&
  clean(a.lote) === clean(b.lote) &&
  clean(a.bodega).toUpperCase() === clean(b.bodega).toUpperCase() &&
  toNum(inferSignedQuantity(a)) === toNum(inferSignedQuantity(b));
const isBalanceCorrectionType = (typeRaw: string) => {
  const t = normalizeSearch(typeRaw);
  return t.includes('correcion_saldo_inicial') || t.includes('correccion_saldo_inicial');
};
const suggestionMatches = (option: string, query: string) => {
  const q = normalizeSearch(query);
  if (!q) return true;
  const opt = normalizeSearch(option);
  if (opt.startsWith(q)) return true;
  return opt
    .split(/[\s/_().-]+/)
    .filter(Boolean)
    .some((part) => part.startsWith(q));
};
const rankSuggestion = (option: string, query: string) => {
  const q = normalizeSearch(query);
  const opt = normalizeSearch(option);
  if (!q) return 3;
  if (opt === q) return 0;
  if (opt.startsWith(q)) return 1;
  return 2;
};

const parseDate = (v: string): Date | null => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const slash = clean(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const dd = Number(slash[1]);
    const mm = Number(slash[2]);
    const yy = Number(slash[3]);
    const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const n = Number(v);
  if (Number.isFinite(n) && n > 20000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const monthKeyFromDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthEndFromKey = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return new Date(y, m, 0, 23, 59, 59, 999);
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};
type DateFilterMode = 'day' | 'range' | 'month' | 'year' | 'all';
const dateInputValue = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
const monthStartInputValue = (monthKey: string) => `${monthKey || getCurrentMonthKey()}-01`;
const dateStartFromInput = (value: string) => {
  const d = parseDate(value);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
};
const dateEndFromInput = (value: string) => {
  const d = parseDate(value);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
};
const describeDatePeriod = (mode: DateFilterMode, start: Date | null, end: Date | null, monthKey: string, year: string) => {
  if (mode === 'all') return 'Todos';
  if (mode === 'month') return monthKey ? monthLabel(monthKey) : 'Mes';
  if (mode === 'year') return year || 'Año';
  const fmt = (date: Date | null) => date ? date.toLocaleDateString('es-ES') : '';
  if (mode === 'day') return fmt(start);
  return `${fmt(start)} - ${fmt(end)}`;
};
const normalizeHeaderToken = (value: string) =>
  clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const toNumericCell = (value: string | number) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = clean(value);
  if (!raw) return null;
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^-?\d+([.,]\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const appendTotalRow = (headers: string[], rows: Array<Array<string | number>>) => {
  if (rows.length === 0 || headers.length === 0) return rows;
  const includeKeys = ['cantidad', 'stock', 'total', 'salidas', 'potencial', 'viales', 'valor', 'movimientos', 'ajustes'];
  const excludeKeys = ['año', 'anio', 'mes', 'fecha', 'lote', 'bodega', 'cliente', 'tipo', 'producto', 'estado', 'semaforo', 'responsable', 'factura', 'doc', 'nota', 'destino', 'fuente', 'id'];
  const totalIdx = headers
    .map((h, idx) => ({ h: normalizeHeaderToken(h), idx }))
    .filter(({ h }) => includeKeys.some((k) => h.includes(k)) && !excludeKeys.some((k) => h.includes(k)))
    .map(({ idx }) => idx);
  const idxs = totalIdx.length > 0
    ? totalIdx
    : (() => {
      let candidate = -1;
      headers.forEach((h, idx) => {
        const hk = normalizeHeaderToken(h);
        if (excludeKeys.some((k) => hk.includes(k))) return;
        let numericCount = 0;
        for (const row of rows) {
          if (toNumericCell(row[idx] as any) != null) numericCount += 1;
        }
        if (numericCount > 0 && numericCount / rows.length >= 0.7) candidate = idx;
      });
      return candidate >= 0 ? [candidate] : [];
    })();
  if (idxs.length === 0) return rows;
  const sums = new Map<number, number>();
  idxs.forEach((idx) => sums.set(idx, 0));
  for (const row of rows) {
    idxs.forEach((idx) => {
      const n = toNumericCell(row[idx] as any);
      if (n != null) sums.set(idx, (sums.get(idx) || 0) + n);
    });
  }
  const totalRow: Array<string | number> = headers.map(() => '');
  totalRow[0] = 'TOTAL';
  idxs.forEach((idx) => {
    const sum = sums.get(idx) || 0;
    totalRow[idx] = Number.isInteger(sum) ? sum : Number(sum.toFixed(2));
  });
  return [...rows, totalRow];
};
const displayDate = (v: string) => {
  const d = parseDate(clean(v));
  return d ? d.toLocaleDateString('es-ES') : clean(v);
};
const EMPTY_MOV = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo_movimiento: '',
  producto: '',
  lote: '',
  cantidad: '',
  bodega: '',
  cliente: '',
  destino: '',
  factura_doc: '',
  responsable: '',
  motivo: '',
  notas: '',
};
const MAX_MOVEMENT_DRAFT_LINES = 10;
const createEmptyMovementDraftLine = (): MovementDraftLine => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  producto: '',
  lote: '',
  cantidad: '',
  bodega: '',
  destino: '',
});
const TRANSFER_PAIR_PREFIX = 'TRANSFER_PAIR:';
const makeTransferPairId = () => `${TRANSFER_PAIR_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const HUARTE_BUILD_TAG = 'HF-2026-02-26-V26-RG-FINAL';
console.log('InventoryFacturacionPage build:', HUARTE_BUILD_TAG);
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const isReadOnlySyncedSource = (sourceRaw: unknown) => {
  const src = clean(sourceRaw).toLowerCase();
  return src === 'canet' || src === 'canet_live' || src === 'canet_auto_in' || src === 'internal_auto_in';
};
const isPersistedMovementId = (idRaw: unknown) => {
  const id = toNum(idRaw);
  return Number.isInteger(id) && id >= 1 && id <= INT32_MAX;
};

export default function InventoryFacturacionPage() {
  const { currentUser } = useAuth();
  const { addNotification } = useNotificationsContext();
  const densityMode = useDensityMode();
  const isCompact = densityMode === 'compact';
  const [searchParams, setSearchParams] = useSearchParams();
  const itziar = USERS.find((u) => {
    const n = u.name.toLowerCase();
    return n.includes('itz') || n.includes('itzi') || n.includes('ichi');
  });
  const anabela = USERS.find((u) => u.name.toLowerCase().includes('anab'));
  const fernando = USERS.find((u) => {
    const n = u.name.toLowerCase();
    return n.includes('fer') || n.includes('fernando');
  });
  const actorName = currentUser?.name || 'Usuario';
  const actorId = currentUser?.id || '';
  const actorEmail = clean((currentUser as any)?.email).toLowerCase();
  const isRestrictedUser = !!currentUser?.isRestricted || actorEmail === CARLOS_EMAIL;

  const [tab, setTab] = useState<TabKey>('dashboard');
  const [dashboardSection, setDashboardSection] = useState<DashboardKey>('stock');
  const [masterSection, setMasterSection] = useState<MasterKey>('productos');
  const [accessMode, setAccessMode] = useState<InventoryAccessMode>('unset');
  const [monthlyClosures, setMonthlyClosures] = useSharedJsonState<InventoryMonthlyCloseSnapshot[]>(
    INVENTORY_MONTHLY_CLOSURES_KEY,
    [],
    { userId: actorId, mergeBeforePersist: true },
  );
  const [auditLog, setAuditLog] = useSharedJsonState<InventoryAuditEntry[]>(
    'inventory_huarte_audit_v1',
    [],
    { userId: actorId, mergeBeforePersist: true },
  );

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('month');
  const [monthFilter, setMonthFilter] = useState(() => getCurrentMonthKey());
  const [dateFilterStart, setDateFilterStart] = useState<string>(() => dateInputValue());
  const [dateFilterEnd, setDateFilterEnd] = useState<string>(() => dateInputValue());
  const [yearFilter, setYearFilter] = useState<string>(() => String(new Date().getFullYear()));
  const [productFilter, setProductFilter] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [lotFilter, setLotFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showMainFilters, setShowMainFilters] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const [showAllRows, setShowAllRows] = useState<Record<string, boolean>>({});
  const [ventasYearDrill, setVentasYearDrill] = useState<string | null>(null);
  const [enviosDrillMonth, setEnviosDrillMonth] = useState<string | null>(null);
  const [ensamYearDrill, setEnsamYearDrill] = useState<string | null>(null);
  const [ensamMonthDrill, setEnsamMonthDrill] = useState<string | null>(null);
  const [stockTotalModalOpen, setStockTotalModalOpen] = useState(false);
  const [movementTypesModalOpen, setMovementTypesModalOpen] = useState(false);
  const [rectByProductModalOpen, setRectByProductModalOpen] = useState(false);
  const [lotsActiveModalOpen, setLotsActiveModalOpen] = useState(false);
  const [stockSectionSelected, setStockSectionSelected] = useState<{ bodega: string; qty: number } | null>(null);

  const [
    movimientos,
    ,
    loadingMovs,
    huarteDB
  ] = useInventoryMovementsDB('huarte');
  const [canetMovements, , , canetDB] = useInventoryMovementsDB('canet');
  const [canetAssembliesSeenIds, setCanetAssembliesSeenIds] = useSharedJsonState<number[]>(
    `${STORAGE_CANET_ASSEMBLIES_SEEN}:${actorId || 'anon'}`,
    [],
    { userId: actorId, initializeIfMissing: !!actorId },
  );
  const [hiddenCorrectionIds, setHiddenCorrectionIds] = useSharedJsonState<number[]>(
    STORAGE_HUARTE_HIDDEN_CORRECTIONS,
    [],
    { userId: actorId },
  );
  const [canetAssembliesNotifiedKey, setCanetAssembliesNotifiedKey] = useSharedJsonState<string>(
    `${STORAGE_CANET_ASSEMBLIES_NOTIFIED}:${actorId || 'anon'}`,
    '',
    { userId: actorId, initializeIfMissing: !!actorId },
  );
  const [huarteVisualStockByLotCache, setHuarteVisualStockByLotCache] = useSharedJsonState<
    { monthKey: string; updatedAt: string; byLot: Record<string, number>; byLotBodega?: Record<string, number> } | null
  >(
    STORAGE_HUARTE_VISUAL_STOCK_BY_LOT,
    null,
    { userId: actorId },
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingMovement, setSavingMovement] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_MOV });
  const [movementLines, setMovementLines] = useState<MovementDraftLine[]>(() => [createEmptyMovementDraftLine()]);
  const [formKitLots, setFormKitLots] = useState<Record<string, string>>({});

  const [productos, setProductos] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_productos_v1',
    seed.productos as GenericRow[],
    { userId: actorId },
  );
  const [, setCanetProductosCatalog] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_productos_v1',
    canetSeed.productos as GenericRow[],
    { userId: actorId },
  );
  const [lotes, setLotes] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_lotes_v1',
    seed.lotes as GenericRow[],
    { userId: actorId, mergeBeforePersist: true, protectFromEmptyOverwrite: true },
  );
  const [archivedLotEntries, setArchivedLotEntries] = useSharedJsonState<ArchivedLotEntry[]>(
    STORAGE_LOT_ARCHIVES,
    [],
    { userId: actorId, mergeBeforePersist: true, protectFromEmptyOverwrite: true },
  );
  const [bodegas, setBodegas] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_bodegas_v1',
    seed.bodegas as GenericRow[],
    { userId: actorId, mergeStrategy: mergeBodegasPayload },
  );
  const [tipos, setTipos] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_tipos_v1',
    seed.tipos_movimiento as GenericRow[],
    { userId: actorId },
  );
  const [clientes, setClientes] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_clientes_v1',
    seed.clientes as GenericRow[],
    { userId: actorId },
  );
  const activeBodegas = useMemo(
    () => {
      const byName = new Map<string, GenericRow>();
      bodegas
        .filter((b) => !clean((b as any).deletedAt) && !clean((b as any).deleted_at))
        .forEach((b) => {
          const bodega = normalizeWarehouseAlias(b.bodega);
          if (!bodega || !HUARTE_OWN_WAREHOUSES.has(bodega)) return;
          byName.set(bodega, { ...b, bodega, activo_si_no: clean(b.activo_si_no) || 'SI' });
        });
      HUARTE_OWN_WAREHOUSE_ORDER.forEach((bodega) => {
        if (!byName.has(bodega)) byName.set(bodega, { bodega, activo_si_no: 'SI' });
      });
      return sortInventoryWarehouses(Array.from(byName.values()), 'huarte');
    },
    [bodegas],
  );
  const activeClientes = useMemo(
    () => clientes.filter((c) => !clean((c as any).deletedAt) && !clean((c as any).deleted_at)),
    [clientes],
  );
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProductCode, setEditingProductCode] = useState<string | null>(null);
  const [newProductForm, setNewProductForm] = useState({ ...EMPTY_PRODUCT_FORM });
  const [newLote, setNewLote] = useState({ producto: '', lote: '', bodega: '', estado: 'ACTIVO' });
  const [newTipo, setNewTipo] = useState('');
  const [newCliente, setNewCliente] = useState('');
  const [newBodega, setNewBodega] = useState({ bodega: '', activo_si_no: 'SI' });
  const [textEditDialog, setTextEditDialog] = useState<TextEditDialogPayload | null>(null);

  useEffect(() => {
    if (editingId) return;
    const firstLine = movementLines[0];
    if (!firstLine) return;
    setForm((prev) => {
      if (
        prev.producto === firstLine.producto &&
        prev.lote === firstLine.lote &&
        prev.cantidad === firstLine.cantidad
      ) {
        return prev;
      }
      return {
        ...prev,
        producto: firstLine.producto,
        lote: firstLine.lote,
        cantidad: firstLine.cantidad,
      };
    });
  }, [editingId, movementLines]);

  const ensamblajesArchivos = seed.ensamblajes_archivos as GenericRow[];
  const canetAssemblySyncStartDate = useMemo(
    () => parseDate(CANET_ASSEMBLY_SYNC_START) || new Date('2026-02-23T00:00:00'),
    [],
  );

  useEffect(() => {
    const t = clean(searchParams.get('tab')).toLowerCase();
    const allowed: Record<string, TabKey> = {
      dashboard: 'dashboard',
      movimientos: 'movimientos',
      ensamblajes: 'ensamblajes',
      maestros: 'maestros',
      cierres: 'cierres',
    };
    if (t && allowed[t]) {
      setTab(allowed[t]);
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const canEditNow = !isRestrictedUser;
  const showAccessSelector = !isRestrictedUser;
  const effectiveAccessMode: InventoryAccessMode = showAccessSelector ? accessMode : 'consult';
  const accessReady = effectiveAccessMode !== 'unset';
  const isEditModeActive = effectiveAccessMode === 'edit' && canEditNow;
  const canEdit = isEditModeActive;
  const canMutateMovement = (movement: Movement | null | undefined) =>
    !!movement && !isReadOnlySyncedSource(movement.source) && isPersistedMovementId(movement.id);
  const appendAudit = (action: string, details?: string) => {
    if (!actorId) return;
    const entry: InventoryAuditEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      at: new Date().toISOString(),
      userId: actorId,
      userName: actorName,
      action,
      details: details || '',
    };
    setAuditLog((prev) => [entry, ...(Array.isArray(prev) ? prev : [])].slice(0, 500));
  };
  const notifyHuarteResponsible = async (message: string) => {
    const responsibleIds = Array.from(new Set([itziar?.id].filter(Boolean) as string[])).filter((id) => id !== actorId);
    const targetIds = responsibleIds.length > 0
      ? responsibleIds
      : USERS.filter((u) => u.isAdmin).map((u) => u.id).filter((id) => id !== actorId);
    await Promise.allSettled(
      targetIds.map((userId) =>
        addNotification({
          userId,
          type: 'info',
          message,
        }),
      ),
    );
  };
  const notifyCanetResponsible = async (message: string) => {
    const responsibleIds = Array.from(new Set([anabela?.id, fernando?.id].filter(Boolean) as string[])).filter((id) => id !== actorId);
    const targetIds = responsibleIds.length > 0
      ? responsibleIds
      : USERS.filter((u) => u.isAdmin).map((u) => u.id).filter((id) => id !== actorId);
    await Promise.allSettled(
      targetIds.map((userId) =>
        addNotification({
          userId,
          type: 'info',
          message,
        }),
      ),
    );
  };
  const notifyMovementResponsible = async (warehouse: string, message: string) => {
    if (CANET_TRANSFER_WAREHOUSES.has(normalizeWarehouseAlias(warehouse))) {
      await notifyCanetResponsible(message);
      return;
    }
    await notifyHuarteResponsible(message);
  };
  useEffect(() => {
    if (accessMode === 'edit' && !canEditNow) {
      setAccessMode('consult');
    }
  }, [accessMode, canEditNow]);

  const integratedMovements = useMemo(() => {
    // Huarte now stands on its own movements only. Transfers still create
    // explicit entry rows, but Canet rows are no longer injected as a live mirror.
    const ownBase = (movimientos || [])
      .filter((m) => {
        const src = clean(m.source).toLowerCase();
        if (src === 'canet' || src === 'canet_live' || src === 'canet_auto_in') return false;
        if (clean(m.bodega).toUpperCase() === 'CANET') return false;
        if (isHuarteAlias(m.bodega)) {
          return src !== 'main';
        }
        return true;
      })
      .map((m) => {
        const rawQty = toNum(m.cantidad);
        const sign = toNum(m.signo) || inferMovementSign(clean(m.tipo_movimiento), rawQty);
        const signed = inferSignedQuantity(m);
        const producto = clean(m.producto);
        const lote = canonicalLotForProduct(lotes, producto, clean(m.lote));
        return {
          ...m,
          producto,
          lote,
          cantidad: Math.abs(rawQty),
          signo: sign,
          cantidad_signed: signed,
          source: m.source || 'facturacion',
          bodega: normalizeWarehouseAlias(m.bodega),
        };
      });

    const ownTransferEntries = buildMissingTransferEntryMovements(ownBase, {
      existingMovements: ownBase,
      allowedDestinations: HUARTE_OWN_WAREHOUSE_ORDER,
      idOffset: 1700000000,
      source: 'legacy_transfer_auto_in',
      normalizeProduct: (value) => clean(value).toUpperCase(),
      normalizeLot: (value, movement) => canonicalLotForProduct(lotes, clean((movement as any).producto), clean(value)),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
    }) as Movement[];
    const canetTransferEntries = buildMissingTransferEntryMovements(canetMovements as Movement[], {
      existingMovements: [...ownBase, ...ownTransferEntries],
      allowedDestinations: HUARTE_OWN_WAREHOUSE_ORDER,
      idOffset: 1800000000,
      source: 'canet_transfer_auto_in',
      normalizeProduct: (value) => clean(value).toUpperCase(),
      normalizeLot: (value, movement) => canonicalLotForProduct(lotes, clean((movement as any).producto), clean(value)),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
    }) as Movement[];

    return [...ownBase, ...ownTransferEntries, ...canetTransferEntries].filter(m => {
      const product = clean(m.producto);
      const lot = clean(m.lote);
      const isHuarte = isHuarteAlias(m.bodega);
      if (isInvalidLegacyLot(product, lot)) return false;

      if (product === 'SV') {
        // Huarte: Only 2511A34 is active (strict seeds purge)
        if (isHuarte && (lot === '2502A30' || lot === '2510A33')) return false;

        // Global Cleanup: Purge lot 2509A32 for SV from ALL warehouses 
        // User requested to clean it anywhere it shows 0 (Logroño, Bilbao, MIMEDICO, etc.)
        if (lot === '2509A32') return false;
      }

      if (product === 'ENT') {
        const isCanet = normalizeSearch(m.bodega).includes('canet');
        const isHuarte = isHuarteAlias(m.bodega);

        // Canet: Purge old lot 2504A18 (16 units) to match requested 1599 + 760 view
        if (isCanet && !wasTouchedToday(m) && lot === '2504A18') return false;

        // Huarte: Purge old/residue lots to leave only the confirmed 174
        if (isHuarte && !wasTouchedToday(m) && (lot === '2405A14' || lot === '2502A17' || lot === '2504A18')) return false;
      }

      if (product === 'ISO') {
        const isCanet = normalizeSearch(m.bodega).includes('canet');
        const isHuarte = isHuarteAlias(m.bodega);

        // Canet: Purge zero-stock lot 230730
        if (isCanet && !wasTouchedToday(m) && lot === '230730') return false;

        // Huarte: Purge old lot 240931 to leave only the confirmed 133
        if (isHuarte && !wasTouchedToday(m) && lot === '240931') return false;
      }

      if (product === 'RG') {
        const isHuarte = isHuarteAlias(m.bodega);
        const isMasBorras = normalizeSearch(m.bodega).includes('mas borras');

        // Huarte & Mas Borras: Purge old/residue lots (like 241030) to keep it clean
        if ((isHuarte || isMasBorras) && !wasTouchedToday(m) && lot === '241030') return false;
      }

      return true;
    });
  }, [canetMovements, movimientos, lotes]);

  const monthSortedMovements = useMemo(() => {
    return [...integratedMovements].sort((a, b) => {
      const da = parseDate(clean(a.fecha))?.getTime() || 0;
      const db = parseDate(clean(b.fecha))?.getTime() || 0;
      return db - da;
    });
  }, [integratedMovements]);
  const currentMonth = useMemo(() => getCurrentMonthKey(), []);

  const monthOptions = useMemo(() => {
    if (isRestrictedUser) return [currentMonth];
    const keys = new Set<string>();
    keys.add(currentMonth);
    monthSortedMovements.forEach((m) => {
      const d = parseDate(clean(m.fecha));
      if (d) keys.add(monthKeyFromDate(d));
    });
    return Array.from(keys).sort();
  }, [monthSortedMovements, currentMonth, isRestrictedUser]);

  useEffect(() => {
    if (!isRestrictedUser) return;
    if (accessMode !== 'consult') setAccessMode('consult');
    if (dateFilterMode !== 'month') setDateFilterMode('month');
    if (monthFilter !== currentMonth) setMonthFilter(currentMonth);
  }, [isRestrictedUser, accessMode, dateFilterMode, monthFilter, currentMonth]);

  const selectedDatePeriod = useMemo(() => {
    if (dateFilterMode === 'all') {
      return { start: null as Date | null, end: null as Date | null, label: 'Todos', fileKey: 'todos' };
    }
    if (dateFilterMode === 'month') {
      const start = dateStartFromInput(monthStartInputValue(monthFilter));
      const end = monthEndFromKey(monthFilter);
      return { start, end, label: describeDatePeriod(dateFilterMode, start, end, monthFilter, yearFilter), fileKey: monthFilter || 'mes' };
    }
    if (dateFilterMode === 'year') {
      const year = Number(yearFilter);
      if (!Number.isFinite(year)) return { start: null, end: null, label: 'Año', fileKey: 'anio' };
      return {
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: new Date(year, 11, 31, 23, 59, 59, 999),
        label: describeDatePeriod(dateFilterMode, null, null, monthFilter, yearFilter),
        fileKey: String(year),
      };
    }
    const start = dateStartFromInput(dateFilterStart);
    const end = dateFilterMode === 'day' ? dateEndFromInput(dateFilterStart) : dateEndFromInput(dateFilterEnd);
    if (start && end && start.getTime() > end.getTime()) {
      const swappedStart = dateStartFromInput(dateFilterEnd);
      const swappedEnd = dateEndFromInput(dateFilterStart);
      return { start: swappedStart, end: swappedEnd, label: describeDatePeriod(dateFilterMode, swappedStart, swappedEnd, monthFilter, yearFilter), fileKey: `${dateFilterEnd}_${dateFilterStart}` };
    }
    return { start, end, label: describeDatePeriod(dateFilterMode, start, end, monthFilter, yearFilter), fileKey: dateFilterMode === 'day' ? dateFilterStart : `${dateFilterStart}_${dateFilterEnd}` };
  }, [dateFilterEnd, dateFilterMode, dateFilterStart, monthFilter, yearFilter]);

  const periodEnd = selectedDatePeriod.end;
  const periodHasDateFilter = dateFilterMode !== 'all';
  const closeMonthKey = dateFilterMode === 'month' ? monthFilter : '';
  const periodFileKey = selectedDatePeriod.fileKey;
  const periodLabel = selectedDatePeriod.label;

  const productOptions = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map((p) => clean(p.producto))
            .filter((p) => p && p.toLowerCase() !== 'producto' && !isRetiredProductCode(p)),
        ),
      ).sort(),
    [productos],
  );
  const addSelectedProduct = (value: string) => {
    const v = clean(value);
    if (!v) return;
    if (!productOptions.includes(v)) return;
    setSelectedProducts((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setProductFilter('');
  };
  const removeSelectedProduct = (value: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p !== value));
  };
  const productColorMap = useMemo(() => {
    const palette = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#e11d48'];
    const map = new Map<string, string>();
    productOptions.forEach((p, idx) => {
      map.set(p, HUARTE_PRODUCT_COLORS[p] || palette[idx % palette.length]);
    });
    return map;
  }, [productOptions]);
  const archivedLotEntryByKey = useMemo(() => {
    const map = new Map<string, ArchivedLotEntry>();
    for (const entry of Array.isArray(archivedLotEntries) ? archivedLotEntries : []) {
      const producto = clean(entry?.producto);
      const lote = clean(entry?.lote);
      if (!producto || !lote) continue;
      const key = `${producto}|${lote}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...entry, id: key, producto, lote });
        continue;
      }
      const prevArchived = lotArchiveAtMs(prev);
      const nextArchived = lotArchiveAtMs(entry);
      const prevRestored = lotRestoredAtMs(prev);
      const nextRestored = lotRestoredAtMs(entry);
      if (nextArchived > prevArchived || nextRestored > prevRestored) {
        map.set(key, {
          ...prev,
          ...entry,
          id: key,
          producto,
          lote,
          archivedAt: clean((entry as any).archivedAt || (prev as any).archivedAt),
          archivedBy: clean((entry as any).archivedBy || (prev as any).archivedBy) || undefined,
          restoredAt: clean((entry as any).restoredAt || (prev as any).restoredAt) || undefined,
          restoredBy: clean((entry as any).restoredBy || (prev as any).restoredBy) || undefined,
        });
      }
    }
    return map;
  }, [archivedLotEntries]);
  const archivedLotKeySet = useMemo(
    () =>
      new Set(
        Array.from(archivedLotEntryByKey.values())
          .filter((entry) => isArchivedLotEntryActive(entry))
          .map((entry) => `${clean(entry.producto)}|${clean(entry.lote)}`),
      ),
    [archivedLotEntryByKey],
  );
  const exhaustedLotKeySet = useMemo(
    () =>
      new Set(
        lotes
          .filter((row) => normalizeLotState(row.estado) === 'AGOTADO')
          .map((row) => `${clean(row.producto)}|${clean(row.lote)}`)
          .filter((key) => key !== '|'),
      ),
    [lotes],
  );
  const hiddenLotKeySet = useMemo(
    () => new Set([...Array.from(archivedLotKeySet), ...Array.from(exhaustedLotKeySet)]),
    [archivedLotKeySet, exhaustedLotKeySet],
  );
  const activeLotes = useMemo(
    () => lotes.filter((row) => !hiddenLotKeySet.has(`${clean(row.producto)}|${clean(row.lote)}`)),
    [hiddenLotKeySet, lotes],
  );
  const allKnownLotes = useMemo(
    () => [...activeLotes, ...(canetSeed.lotes as GenericRow[])],
    [activeLotes],
  );
  const archivedLotes = useMemo(
    () => lotes.filter((row) => hiddenLotKeySet.has(`${clean(row.producto)}|${clean(row.lote)}`)),
    [hiddenLotKeySet, lotes],
  );
  const [lotViewMode, setLotViewMode] = useState<'active' | 'archived'>('active');
  const lotOptions = useMemo(() => {
    const all = Array.from(new Set(activeLotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (selectedProducts.length === 0) return all;
    return all.filter((lot) => activeLotes.some((l) => clean(l.lote) === lot && selectedProducts.includes(clean(l.producto))));
  }, [activeLotes, selectedProducts]);
  const warehouseOptions = useMemo(() => Array.from(new Set(activeBodegas.map((b) => clean(b.bodega)).filter(Boolean))).sort(), [activeBodegas]);
  const transferWarehouseOptions = useMemo(() => ALL_TRANSFER_WAREHOUSE_ORDER.sort((a, b) => a.localeCompare(b)), []);
  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          'venta',
          'traspaso',
          ...tipos.map((t) => clean(t.tipo_movimiento)).filter(Boolean),
        ]),
      ).sort(),
    [tipos],
  );
  const clientOptions = useMemo(() => Array.from(new Set(activeClientes.map((c) => clean(c.cliente)).filter(Boolean))).sort(), [activeClientes]);

  const movementPassesFilters = (m: Movement, includeMonth = true) => {
    if (hiddenLotKeySet.has(`${clean(m.producto)}|${clean(m.lote)}`)) return false;
    if (includeMonth && periodHasDateFilter) {
      const d = parseDate(clean(m.fecha));
      if (!d) return false;
      if (selectedDatePeriod.start && d < selectedDatePeriod.start) return false;
      if (selectedDatePeriod.end && d > selectedDatePeriod.end) return false;
    }
    if (selectedProducts.length > 0 && !selectedProducts.includes(clean(m.producto))) return false;
    if (lotFilter && clean(m.lote) !== lotFilter) return false;
    if (warehouseFilter && clean(m.bodega) !== warehouseFilter) return false;
    if (typeFilter && clean(m.tipo_movimiento) !== typeFilter) return false;
    if (quickSearch) {
      const q = normalizeSearch(quickSearch);
      const hay = normalizeSearch([
        m.tipo_movimiento,
        m.producto,
        m.lote,
        m.bodega,
        m.cliente,
        m.factura_doc,
        m.responsable,
        m.motivo,
        m.notas,
      ].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  function isSameLocalDay(value: unknown, day: Date) {
    const raw = clean(value);
    if (!raw) return false;
    const parsed = parseDate(raw) || new Date(raw);
    if (!parsed) return false;
    return (
      parsed.getFullYear() === day.getFullYear() &&
      parsed.getMonth() === day.getMonth() &&
      parsed.getDate() === day.getDate()
    );
  }
  function wasTouchedToday(m: Movement) {
    const today = new Date();
    return isSameLocalDay(m.updated_at || m.created_at, today) || isSameLocalDay(m.created_at || m.updated_at, today);
  }

  const filteredMovements = useMemo(() => monthSortedMovements.filter((m) => movementPassesFilters(m, true)), [hiddenLotKeySet, monthSortedMovements, selectedDatePeriod, periodHasDateFilter, selectedProducts, lotFilter, warehouseFilter, typeFilter, quickSearch]);
  const filteredMovementsForStock = useMemo(() => {
    return monthSortedMovements.filter((m) => {
      if (!movementPassesFilters(m, false)) return false;
      if (!periodEnd) return true;
      const d = parseDate(clean(m.fecha));
      // Keep undated/base rows, same as Inventario Canet stock logic.
      if (!d) return true;
      return d.getTime() <= periodEnd.getTime();
    });
  }, [hiddenLotKeySet, monthSortedMovements, periodEnd, selectedProducts, lotFilter, warehouseFilter, typeFilter, quickSearch]);
  const globalMovementsForStock = useMemo(() => {
    return monthSortedMovements.filter((m) => {
      if (hiddenLotKeySet.has(`${clean(m.producto)}|${clean(m.lote)}`)) return false;
      if (!periodEnd) return true;
      const d = parseDate(clean(m.fecha));
      // Keep undated/base rows for opening balances.
      if (!d) return true;
      return d.getTime() <= periodEnd.getTime();
    });
  }, [hiddenLotKeySet, monthSortedMovements, periodEnd]);
  const visibleMovementsLast7Days = useMemo(() => {
    if (showAllRows.movimientos) return filteredMovements;
    const allowedDays = new Set<string>();
    const rows: Movement[] = [];
    for (const m of filteredMovements) {
      const d = parseDate(clean(m.fecha));
      if (!d) continue;
      const dayKey = d.toISOString().slice(0, 10);
      if (!allowedDays.has(dayKey)) {
        if (allowedDays.size >= 7) continue;
        allowedDays.add(dayKey);
      }
      rows.push(m);
    }
    return rows;
  }, [filteredMovements, showAllRows.movimientos]);

  const controlByLot = useMemo(() => {
    const ordered = [...filteredMovementsForStock].sort((a, b) => {
      const da = parseDate(clean(a.fecha))?.getTime() || 0;
      const db = parseDate(clean(b.fecha))?.getTime() || 0;
      if (da !== db) return da - db;
      return toNum(a.id) - toNum(b.id);
    });
    return calculateInventoryStockSnapshot(ordered, {
      scope: 'huarte',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value) => clean(value),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      signedQuantity: inferSignedQuantity,
    }).rows;
  }, [filteredMovementsForStock]);
  const safeControlByLot = useMemo(
    () =>
      controlByLot.map((r) => ({
        ...r,
        stock: Math.max(0, Math.round(toNum(r.stock))),
      })),
    [controlByLot],
  );
  const visibleSafeControlByLot = useMemo(
    () =>
      safeControlByLot.filter(
        (r) =>
          !hiddenLotKeySet.has(`${clean(r.producto)}|${clean(r.lote)}`) &&
          isHuarteOwnedWarehouse(r.bodega) &&
          toNum(r.stock) > 0,
      ),
    [hiddenLotKeySet, safeControlByLot],
  );
  const modalLotOptions = useMemo(() => {
    const selectedProduct = clean(form.producto);
    const selectedWarehouse = normalizeWarehouseAlias(form.bodega);
    const rawQty = toNum(form.cantidad);
    const sign = inferMovementSign(form.tipo_movimiento, rawQty);
    const isStockOutput = sign < 0 || normalizeSearch(form.tipo_movimiento).includes('traspaso');
    const editingMovement = editingId ? monthSortedMovements.find((m) => m.id === editingId) : null;
    const keepKey = editingMovement ? `${clean(editingMovement.producto)}|${clean(editingMovement.lote)}` : '';
    const selectedWarehouseIsCanet = CANET_TRANSFER_WAREHOUSES.has(selectedWarehouse);
    const activeSource = selectedProduct
      ? allKnownLotes.filter((l) => clean(l.producto).toUpperCase() === selectedProduct.toUpperCase())
      : allKnownLotes;
    const stockSource = calculateInventoryStockSnapshot(
      selectedWarehouseIsCanet ? (canetMovements as Movement[]) : globalMovementsForStock,
      {
        scope: selectedWarehouseIsCanet ? 'canet' : 'huarte',
        normalizeProduct: (value) => clean(value).toUpperCase(),
        normalizeLot: (value, movement) => canonicalLotForProduct(allKnownLotes, clean((movement as any).producto), clean(value)),
        normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
        signedQuantity: inferSignedQuantity,
      },
    ).rows
      .filter((row) => (selectedProduct ? clean(row.producto).toUpperCase() === selectedProduct.toUpperCase() : true))
      .filter((row) => (selectedWarehouse ? normalizeWarehouseAlias(row.bodega) === selectedWarehouse : true))
      .filter((row) => toNum(row.stock) > 0);
    const source = isStockOutput ? stockSource : activeSource;
    return Array.from(
      new Set(
        source
          .filter((l) => {
            const key = `${clean(l.producto)}|${clean(l.lote)}`;
            if (keepKey && key === keepKey) return true;
            return normalizeLotState((l as any).estado) !== 'AGOTADO';
          })
          .map((l) => ({
            producto: clean(l.producto).toUpperCase(),
            lote: canonicalLotForProduct(allKnownLotes, clean(l.producto).toUpperCase(), clean(l.lote)),
          }))
          .filter((l) => {
            const candidates = allKnownLotes
              .filter((lotRow) => clean(lotRow.producto).toUpperCase() === l.producto)
              .map((lotRow) => clean(lotRow.lote))
              .filter(Boolean);
            return !hasLongerLotAlias(candidates, l.lote);
          })
          .map((l) => clean(l.lote))
          .filter(Boolean),
      ),
    ).sort();
  }, [allKnownLotes, canetMovements, form.producto, form.bodega, form.cantidad, form.tipo_movimiento, editingId, globalMovementsForStock, monthSortedMovements]);
  const getLotOptionsForMovementLine = (line: MovementDraftLine) => {
    const selectedProduct = clean(line.producto);
    const selectedWarehouse = normalizeWarehouseAlias(clean(line.bodega) || form.bodega);
    const rawQty = toNum(line.cantidad);
    const sign = inferMovementSign(form.tipo_movimiento, rawQty);
    const isStockOutput = sign < 0 || normalizeSearch(form.tipo_movimiento).includes('traspaso');
    const editingMovement = editingId ? monthSortedMovements.find((m) => m.id === editingId) : null;
    const keepKey = editingMovement ? `${clean(editingMovement.producto)}|${clean(editingMovement.lote)}` : '';
    const selectedWarehouseIsCanet = CANET_TRANSFER_WAREHOUSES.has(selectedWarehouse);
    const activeSource = selectedProduct
      ? allKnownLotes.filter((l) => clean(l.producto).toUpperCase() === selectedProduct.toUpperCase())
      : allKnownLotes;
    const stockSource = calculateInventoryStockSnapshot(
      selectedWarehouseIsCanet ? (canetMovements as Movement[]) : globalMovementsForStock,
      {
        scope: selectedWarehouseIsCanet ? 'canet' : 'huarte',
        normalizeProduct: (value) => clean(value).toUpperCase(),
        normalizeLot: (value, movement) => canonicalLotForProduct(allKnownLotes, clean((movement as any).producto), clean(value)),
        normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
        signedQuantity: inferSignedQuantity,
      },
    ).rows
      .filter((row) => (selectedProduct ? clean(row.producto).toUpperCase() === selectedProduct.toUpperCase() : true))
      .filter((row) => (selectedWarehouse ? normalizeWarehouseAlias(row.bodega) === selectedWarehouse : true))
      .filter((row) => toNum(row.stock) > 0);
    const source = isStockOutput ? stockSource : activeSource;
    return Array.from(
      new Set(
        source
          .filter((l) => {
            const key = `${clean(l.producto)}|${clean(l.lote)}`;
            if (keepKey && key === keepKey) return true;
            return normalizeLotState((l as any).estado) !== 'AGOTADO';
          })
          .map((l) => ({
            producto: clean(l.producto).toUpperCase(),
            lote: canonicalLotForProduct(allKnownLotes, clean(l.producto).toUpperCase(), clean(l.lote)),
          }))
          .filter((l) => {
            const candidates = allKnownLotes
              .filter((lotRow) => clean(lotRow.producto).toUpperCase() === l.producto)
              .map((lotRow) => clean(lotRow.lote))
              .filter(Boolean);
            return !hasLongerLotAlias(candidates, l.lote);
          })
          .map((l) => clean(l.lote))
          .filter(Boolean),
      ),
    ).sort();
  };
  const formKitComponents = useMemo(() => {
    if (editingId) return [];
    const productCode = clean(form.producto).toUpperCase();
    if (!productCode) return [];
    const row = productos.find((p) => clean(p.producto).toUpperCase() === productCode);
    if (!row) return [];
    const components = normalizeKitComponents((row as any).kit_componentes || (row as any).componentes_kit);
    const mode = clean((row as any).modo_stock || (row as any).tipo_producto).toUpperCase();
    return mode === 'KIT' || components.length > 0 ? components : [];
  }, [editingId, form.producto, productos]);
  const formIsKit = formKitComponents.length > 0;
  const formKitComponentKey = (component: { producto: string }, index: number) => `${index}:${clean(component.producto).toUpperCase()}`;
  const formKitLotOptionsByProduct = useMemo(() => {
    const selectedWarehouse = normalizeWarehouseAlias(form.bodega);
    const rawQty = toNum(form.cantidad);
    const sign = inferMovementSign(form.tipo_movimiento, rawQty);
    const isStockOutput = sign < 0 || normalizeSearch(form.tipo_movimiento).includes('traspaso');
    const componentProducts = Array.from(new Set(formKitComponents.map((component) => clean(component.producto).toUpperCase()).filter(Boolean)));
    const map = new Map<string, string[]>();
    if (componentProducts.length === 0) return map;

    const activeSource = activeLotes
      .filter((l) => componentProducts.includes(clean(l.producto).toUpperCase()))
      .filter((l) => normalizeLotState((l as any).estado) !== 'AGOTADO');
    const stockSource = visibleSafeControlByLot
      .filter((row) => componentProducts.includes(clean(row.producto).toUpperCase()))
      .filter((row) => (selectedWarehouse ? normalizeWarehouseAlias(row.bodega) === selectedWarehouse : true))
      .filter((row) => toNum(row.stock) > 0);
    const source = isStockOutput ? stockSource : activeSource;
    componentProducts.forEach((product) => {
      map.set(
        product,
        Array.from(
          new Set(
            source
              .filter((row) => clean(row.producto).toUpperCase() === product)
              .map((row) => clean(row.lote))
              .filter(Boolean),
          ),
        ).sort(),
      );
    });
    return map;
  }, [activeLotes, form.bodega, form.cantidad, form.tipo_movimiento, formKitComponents, visibleSafeControlByLot]);
  const stockWarehouseSummary = useMemo(() => {
    const map = new Map<string, number>();
    HUARTE_OWN_WAREHOUSE_ORDER.forEach((bodega) => map.set(bodega, 0));
    visibleSafeControlByLot.forEach((row) => {
      const bodega = normalizeWarehouseAlias(row.bodega) || 'Sin bodega';
      if (!HUARTE_OWN_WAREHOUSES.has(bodega)) return;
      map.set(bodega, (map.get(bodega) || 0) + Math.max(0, toNum(row.stock)));
    });
    return Array.from(map.entries())
      .map(([bodega, stock]) => ({ bodega, stock }))
      .sort((a, b) => {
        const ai = HUARTE_OWN_WAREHOUSE_ORDER.indexOf(a.bodega);
        const bi = HUARTE_OWN_WAREHOUSE_ORDER.indexOf(b.bodega);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return b.stock - a.stock;
      });
  }, [visibleSafeControlByLot]);
  const inventorySummaryTones = ['violet', 'amber', 'indigo'] as const;
  const inventorySummaryChips = [
    ...stockWarehouseSummary.map((row, idx) => ({
      label: row.bodega,
      value: row.stock,
      tone: inventorySummaryTones[idx % inventorySummaryTones.length],
    })),
    { label: 'Lotes activos', value: visibleSafeControlByLot.filter((row) => toNum(row.stock) > 0).length, tone: 'rose' as const },
  ];
  const globalSafeControlByLot = useMemo(() => {
    const ordered = [...globalMovementsForStock].sort((a, b) => {
      const da = parseDate(clean(a.fecha))?.getTime() || 0;
      const db = parseDate(clean(b.fecha))?.getTime() || 0;
      if (da !== db) return da - db;
      return toNum(a.id) - toNum(b.id);
    });
    return calculateInventoryStockSnapshot(ordered, {
      scope: 'huarte',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value) => clean(value),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      signedQuantity: inferSignedQuantity,
      clampNegative: true,
      round: true,
    }).rows;
  }, [globalMovementsForStock]);
  const monthlyCloseRows = useMemo(
    () => globalSafeControlByLot
      .filter((row) => !hiddenLotKeySet.has(`${clean(row.producto)}|${clean(row.lote)}`))
      .filter((row) => isHuarteOwnedWarehouse(row.bodega))
      .filter((row) => toNum(row.stock) > 0)
      .map((row) => ({ ...row, stock: Math.max(0, Math.round(toNum(row.stock))) })),
    [hiddenLotKeySet, globalSafeControlByLot],
  );
  const huarteMonthlyClosures = useMemo(
    () =>
      (monthlyClosures || [])
        .filter((snapshot) => snapshot.scope === 'huarte' && !snapshot.deletedAt)
        .sort((a, b) => clean(a.monthKey).localeCompare(clean(b.monthKey))),
    [monthlyClosures],
  );
  const currentMonthlyClose = useMemo(
    () => closeMonthKey ? getInventoryMonthlyCloseSnapshot(monthlyClosures, 'huarte', closeMonthKey) : null,
    [monthlyClosures, closeMonthKey],
  );
  const previousMonthlyClose = useMemo(
    () => closeMonthKey ? getInventoryMonthlyCloseSnapshot(monthlyClosures, 'huarte', getPreviousMonthKey(closeMonthKey)) : null,
    [monthlyClosures, closeMonthKey],
  );
  const currentMonthlyCloseDrift = useMemo(
    () => getInventoryMonthlyCloseDrift(currentMonthlyClose, monthlyCloseRows),
    [currentMonthlyClose, monthlyCloseRows],
  );

  const stockVisualRows = useMemo(() => {
    const byLot = new Map<
      string,
      {
        producto: string;
        lote: string;
        total: number;
        byBodega: Record<string, number>;
      }
    >();
    visibleSafeControlByLot.forEach((m) => {
      const producto = clean(m.producto);
      const lote = clean(m.lote);
      const bodega = clean(m.bodega);
      const signed = Math.max(0, toNum(m.stock));
      if (!producto || !lote || !bodega) return;
      const key = `${producto}|${lote}`;
      if (!byLot.has(key)) byLot.set(key, { producto, lote, total: 0, byBodega: {} });
      const row = byLot.get(key)!;
      row.total += signed;
      row.byBodega[bodega] = (row.byBodega[bodega] || 0) + signed;
    });
    return Array.from(byLot.values())
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 14);
  }, [visibleSafeControlByLot]);
  useEffect(() => {
    const byLot: Record<string, number> = {};
    const byLotBodega: Record<string, number> = {};
    visibleSafeControlByLot.forEach((row) => {
      const producto = clean(row.producto);
      const lote = clean(row.lote);
      const bodega = clean(row.bodega);
      if (!producto || !lote) return;
      if (!bodega) return;
      const key = `${producto}|${lote}`;
      byLot[key] = (byLot[key] || 0) + Math.max(0, toNum(row.stock));
      const bodegaKey = `${producto}|${lote}|${bodega}`;
      byLotBodega[bodegaKey] = (byLotBodega[bodegaKey] || 0) + Math.max(0, toNum(row.stock));
    });
    const nextPayload = {
      monthKey: periodFileKey,
      updatedAt: new Date().toISOString(),
      byLot,
      byLotBodega,
    };
    const prevStable = huarteVisualStockByLotCache
      ? JSON.stringify({
          monthKey: clean(huarteVisualStockByLotCache.monthKey),
          byLot: huarteVisualStockByLotCache.byLot || {},
          byLotBodega: huarteVisualStockByLotCache.byLotBodega || {},
        })
      : '';
    const nextStable = JSON.stringify({
      monthKey: nextPayload.monthKey,
      byLot: nextPayload.byLot,
      byLotBodega: nextPayload.byLotBodega,
    });
    if (prevStable !== nextStable) setHuarteVisualStockByLotCache(nextPayload);
  }, [periodFileKey, huarteVisualStockByLotCache, setHuarteVisualStockByLotCache, visibleSafeControlByLot]);
  useEffect(() => {
    setStockSectionSelected(null);
  }, [periodFileKey, selectedProducts, lotFilter, warehouseFilter, typeFilter, dashboardSection]);

  const rectificativas = useMemo(() => filteredMovements.filter((m) => {
    const t = clean(m.tipo_movimiento).toLowerCase();
    return t.includes('rectific') || t.includes('credito') || t.includes('corregir');
  }), [filteredMovements]);

  const ensamblajesMovements = useMemo(() => {
    return filteredMovements
      .filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('ensamblaje'))
      .sort((a, b) => (parseDate(clean(b.fecha))?.getTime() || 0) - (parseDate(clean(a.fecha))?.getTime() || 0));
  }, [filteredMovements]);

  const canetAssemblyIds = useMemo(
    () =>
      filteredMovements
        .filter((m) => (m.source === 'canet' || m.source === 'canet_live') && clean(m.tipo_movimiento).toLowerCase().includes('ensamblaje'))
        .map((m) => Number(m.id))
        .filter(Number.isFinite),
    [filteredMovements],
  );
  const unseenCanetAssemblies = useMemo(() => {
    const seen = new Set<number>((canetAssembliesSeenIds || []).map((id) => Number(id)).filter(Number.isFinite));
    return canetAssemblyIds.filter((id: number) => !seen.has(id)).length;
  }, [canetAssemblyIds, canetAssembliesSeenIds]);

  useEffect(() => {
    if (tab !== 'ensamblajes') return;
    setCanetAssembliesSeenIds(canetAssemblyIds);
  }, [tab, canetAssemblyIds, setCanetAssembliesSeenIds]);

  useEffect(() => {
    const count = canetAssemblyIds.length;
    if (!currentUser || count === 0) return;
    const key = `${currentUser.id}:${count}`;
    if (canetAssembliesNotifiedKey === key) return;
    setCanetAssembliesNotifiedKey(key);
    void addNotification({
      message: `[INVHF_ENSAM] Inventario Canet registró ensamblajes nuevos (${count}). Toca para revisar.`,
      type: 'info',
      userId: currentUser.id,
    });
  }, [canetAssemblyIds.length, currentUser, addNotification, canetAssembliesNotifiedKey, setCanetAssembliesNotifiedKey]);

  const dashboard = useMemo(() => {
    const totalStock = Math.max(0, visibleSafeControlByLot.reduce((acc, row) => acc + Math.max(0, toNum(row.stock)), 0));
    const totalMovements = filteredMovements.length;
    const totalRect = rectificativas.length;
    const activeMaster = new Set(
      activeLotes
        .filter((l) => {
          const state = clean(l.estado || 'ACTIVO').toUpperCase();
          return state !== 'CERRADO' && state !== 'AGOTADO';
        })
        .map((l) => `${clean(l.producto)}|${clean(l.lote)}|${clean(l.bodega)}`),
    );
    const totalLots = visibleSafeControlByLot.filter((r) => r.stock > 0).filter((r) => activeMaster.size === 0 || activeMaster.has(`${r.producto}|${r.lote}|${r.bodega}`)).length;
    return { totalStock, totalMovements, totalRect, totalLots };
  }, [activeLotes, filteredMovements, rectificativas, visibleSafeControlByLot]);

  const stockByProductTotals = useMemo(() => {
    const map = new Map<string, number>();
    visibleSafeControlByLot.forEach((r) => {
      map.set(r.producto, (map.get(r.producto) || 0) + Math.max(0, toNum(r.stock)));
    });
    return Array.from(map.entries())
      .map(([producto, total]) => ({ producto, total: Math.max(0, toNum(total)) }))
      .sort((a, b) => b.total - a.total);
  }, [visibleSafeControlByLot]);
  const safeKpiStockTotal = useMemo(
    () =>
      Math.max(
        0,
        Math.round(
          visibleSafeControlByLot.reduce((acc, r) => acc + Math.max(0, toNum(r.stock)), 0),
        ),
      ),
    [visibleSafeControlByLot],
  );

  const activeLotsByProduct = useMemo(() => {
    const map = new Map<string, Set<string>>();
    visibleSafeControlByLot.filter((r) => toNum(r.stock) > 0)
      .forEach((r) => {
        if (!map.has(r.producto)) map.set(r.producto, new Set<string>());
        map.get(r.producto)!.add(r.lote);
      });
    return Array.from(map.entries())
      .map(([producto, lots]) => ({ producto, lots: lots.size }))
      .sort((a, b) => b.lots - a.lots);
  }, [visibleSafeControlByLot]);
  const masterLotesRows = useMemo(() => {
    const source = lotViewMode === 'archived' ? archivedLotes : activeLotes;
    const byKey = new Map<
      string,
      { producto: string; lote: string; estado: 'ACTIVO' | 'AGOTADO'; fechaAlta: string; archivedAt?: string; restoredAt?: string }
    >();
    const pickEarlierDate = (a: string, b: string) => {
      const da = parseDate(clean(a));
      const db = parseDate(clean(b));
      if (!da && !db) return clean(a) || clean(b);
      if (!da) return clean(b);
      if (!db) return clean(a);
      return da.getTime() <= db.getTime() ? clean(a) : clean(b);
    };
    source.forEach((row) => {
      const producto = clean(row.producto);
      const lote = clean(row.lote);
      if (!producto || !lote) return;
      const key = `${producto}|${lote}`;
      const state = normalizeLotState(row.estado);
      const fechaAlta = clean(row.fecha_alta || '');
      if (!byKey.has(key)) {
        byKey.set(key, {
          producto,
          lote,
          estado: state,
          fechaAlta,
          archivedAt: clean((archivedLotEntryByKey.get(key) as any)?.archivedAt || ''),
          restoredAt: clean((archivedLotEntryByKey.get(key) as any)?.restoredAt || ''),
        });
        return;
      }
      const current = byKey.get(key)!;
      if (state === 'ACTIVO') current.estado = 'ACTIVO';
      current.fechaAlta = pickEarlierDate(current.fechaAlta, fechaAlta);
      current.archivedAt = clean((archivedLotEntryByKey.get(key) as any)?.archivedAt || current.archivedAt || '');
      current.restoredAt = clean((archivedLotEntryByKey.get(key) as any)?.restoredAt || current.restoredAt || '');
    });
    return Array.from(byKey.values())
      .filter((r) => (selectedProducts.length > 0 ? selectedProducts.includes(r.producto) : true))
      .filter((r) => (lotFilter ? r.lote === lotFilter : true))
      .filter((r) => {
        if (!quickSearch) return true;
        const q = normalizeSearch(quickSearch);
        const hay = normalizeSearch([r.producto, r.lote, r.estado, r.fechaAlta].join(' '));
        return hay.includes(q);
      })
      .sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
  }, [activeLotes, archivedLotes, archivedLotEntryByKey, lotFilter, lotViewMode, quickSearch, selectedProducts]);

  const movementTypeSummary = useMemo(() => {
    const map = new Map<string, number>();
    filteredMovements.forEach((m) => {
      const t = clean(m.tipo_movimiento) || 'Sin tipo';
      map.set(t, (map.get(t) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredMovements]);

  const rectByProductSummary = useMemo(() => {
    const map = new Map<string, number>();
    rectificativas.forEach((r) => {
      const p = clean(r.producto) || 'Sin producto';
      map.set(p, (map.get(p) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([producto, total]) => ({ producto, total }))
      .sort((a, b) => b.total - a.total);
  }, [rectificativas]);

  const ventasAnuales = useMemo(() => {
    const map = new Map<string, number>();
    monthSortedMovements.filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('venta')).filter((m) => movementPassesFilters(m, false)).forEach((m) => {
      const d = parseDate(clean(m.fecha));
      if (!d) return;
      const y = String(d.getFullYear());
      map.set(y, (map.get(y) || 0) + Math.abs(toNum(m.cantidad)));
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [monthSortedMovements, selectedProducts, lotFilter, warehouseFilter, typeFilter]);

  const enviosMensuales = useMemo(() => {
    const map = new Map<string, number>();
    monthSortedMovements.filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('envio')).filter((m) => movementPassesFilters(m, false)).forEach((m) => {
      const d = parseDate(clean(m.fecha));
      if (!d) return;
      const mk = monthKeyFromDate(d);
      map.set(mk, (map.get(mk) || 0) + Math.abs(toNum(m.cantidad)));
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [monthSortedMovements, selectedProducts, lotFilter, warehouseFilter, typeFilter]);

  const ensamblajesAnuales = useMemo(() => {
    const map = new Map<string, number>();
    ensamblajesMovements.forEach((m) => {
      const d = parseDate(clean(m.fecha));
      if (!d) return;
      const y = String(d.getFullYear());
      map.set(y, (map.get(y) || 0) + Math.abs(toNum(m.cantidad)));
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [ensamblajesMovements]);

  const rectAudit = useMemo(() => rectificativas.map((r) => ({
    fecha: displayDate(r.fecha),
    tipo: r.tipo_movimiento,
    factura: r.factura_doc || '-',
    producto: r.producto,
    lote: r.lote,
    bodega: r.bodega,
    cantidad: r.cantidad_signed || r.cantidad,
    motivo: r.motivo || '-',
    responsable: r.responsable || '-',
  })), [rectificativas]);

  const enviosByProductLotForMonth = (monthKey: string) => {
    const map = new Map<string, { producto: string; lote: string; cantidad: number }>();
    monthSortedMovements
      .filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('envio'))
      .filter((m) => movementPassesFilters(m, false))
      .forEach((m) => {
        const d = parseDate(clean(m.fecha));
        if (!d || monthKeyFromDate(d) !== monthKey) return;
        const key = `${clean(m.producto)}|${clean(m.lote)}`;
        if (!map.has(key)) map.set(key, { producto: clean(m.producto), lote: clean(m.lote), cantidad: 0 });
        map.get(key)!.cantidad += Math.abs(toNum(m.cantidad));
      });
    return Array.from(map.values()).sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
  };

  const ventasMonthsForYear = (year: string) => {
    const map = new Map<string, number>();
    monthSortedMovements
      .filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('venta'))
      .filter((m) => movementPassesFilters(m, false))
      .forEach((m) => {
        const d = parseDate(clean(m.fecha));
        if (!d || String(d.getFullYear()) !== year) return;
        const mk = monthKeyFromDate(d);
        map.set(mk, (map.get(mk) || 0) + Math.abs(toNum(m.cantidad)));
      });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const ensamMonthsForYear = (year: string) => {
    const set = new Set<string>();
    ensamblajesMovements.forEach((m) => {
      const d = parseDate(clean(m.fecha));
      if (!d || String(d.getFullYear()) !== year) return;
      set.add(monthKeyFromDate(d));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  };

  const ensamByProductLotForMonth = (monthKey: string) => {
    const map = new Map<string, { producto: string; lote: string; cantidad: number }>();
    ensamblajesMovements.forEach((m) => {
      const d = parseDate(clean(m.fecha));
      if (!d || monthKeyFromDate(d) !== monthKey) return;
      const key = `${clean(m.producto)}|${clean(m.lote)}`;
      if (!map.has(key)) map.set(key, { producto: clean(m.producto), lote: clean(m.lote), cantidad: 0 });
      map.get(key)!.cantidad += Math.abs(toNum(m.cantidad));
    });
    return Array.from(map.values()).sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_MOV, responsable: currentUser?.name || '' });
    setMovementLines([createEmptyMovementDraftLine()]);
    setFormKitLots({});
    setModalOpen(true);
  };

  const openCreateWithType = (tipo: string) => {
    setEditingId(null);
    setForm({
      ...EMPTY_MOV,
      tipo_movimiento: tipo,
      responsable: currentUser?.name || '',
    });
    setMovementLines([createEmptyMovementDraftLine()]);
    setFormKitLots({});
    setModalOpen(true);
  };

  const openEdit = (m: Movement) => {
    if (isReadOnlySyncedSource(m.source)) {
      window.alert('Este movimiento es automático/sincronizado y no se puede editar desde aquí.');
      return;
    }
    if (!isPersistedMovementId(m.id)) {
      window.alert('Este movimiento es una vista calculada y no se puede editar desde aquí.');
      return;
    }
    if (STATIC_CORRECTION_ID_SET.has(toNum(m.id))) {
      window.alert('Esta corrección de saldo es una base histórica. Si quieres cambiarla, elimínala y crea un movimiento nuevo.');
      return;
    }
    setEditingId(m.id);
    setForm({
      fecha: clean(m.fecha),
      tipo_movimiento: clean(m.tipo_movimiento),
      producto: clean(m.producto),
      lote: clean(m.lote),
      cantidad: String(toNum(m.cantidad)),
      bodega: clean(m.bodega),
      cliente: clean(m.cliente),
      destino: clean(m.destino),
      factura_doc: clean(m.factura_doc),
      responsable: clean(m.responsable),
      motivo: clean(m.motivo),
      notas: clean(m.notas),
    });
    setMovementLines([{ id: `edit-${m.id}`, producto: clean(m.producto), lote: clean(m.lote), cantidad: String(toNum(m.cantidad)) }]);
    setFormKitLots({});
    setModalOpen(true);
  };

  const updateMovementDraftLine = (lineId: string, patch: Partial<MovementDraftLine>) => {
    setMovementLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
    if (patch.producto !== undefined) {
      setFormKitLots({});
    }
  };

  const addMovementDraftLine = () => {
    setMovementLines((prev) => {
      if (prev.length >= MAX_MOVEMENT_DRAFT_LINES) return prev;
      return [...prev, createEmptyMovementDraftLine()];
    });
  };

  const removeMovementDraftLine = (lineId: string) => {
    setMovementLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== lineId)));
  };

  const saveMovement = async () => {
    if (savingMovement) return;
    const draftLinesForSave = !editingId
      ? movementLines
        .map((line, index) => ({
          ...line,
          index,
          producto: clean(line.producto).toUpperCase(),
          lote: clean(line.lote),
          cantidad: clean(line.cantidad),
          bodega: normalizeWarehouseAlias(clean(line.bodega) || form.bodega),
          destino: normalizeWarehouseAlias(clean(line.destino) || clean(form.destino || form.cliente)),
        }))
        .filter((line) => !!line.producto || !!line.lote || !!line.cantidad)
      : [];
    const primaryDraftLine = draftLinesForSave[0] || {
      producto: clean(form.producto).toUpperCase(),
      lote: clean(form.lote),
      cantidad: clean(form.cantidad),
      bodega: normalizeWarehouseAlias(form.bodega),
      destino: normalizeWarehouseAlias(form.destino || form.cliente),
      index: 0,
      id: 'single',
    };
    const rawQty = toNum(!editingId ? primaryDraftLine.cantidad : form.cantidad);
    const qty = Math.abs(rawQty);
    const isKitMovement = !editingId && formIsKit;
    const isMultiLineCreate = !editingId && !isKitMovement;
    const isTransfer = normalizeSearch(form.tipo_movimiento).includes('traspaso');
    const transferDestination = normalizeWarehouseAlias(form.destino || form.cliente);
    const missingFields: string[] = [];
    if (!clean(form.tipo_movimiento)) missingFields.push('Tipo movimiento');
    if (!isMultiLineCreate && !clean(form.bodega)) missingFields.push(isTransfer ? 'Origen' : 'Bodega');
    if (!isMultiLineCreate && isTransfer && !transferDestination) missingFields.push('Destino');
    if (isMultiLineCreate) {
      if (draftLinesForSave.length === 0) missingFields.push('Al menos una línea');
      draftLinesForSave.forEach((line) => {
        const prefix = `Línea ${line.index + 1}`;
        if (!line.bodega) missingFields.push(`${prefix}: ${isTransfer ? 'origen' : 'bodega'}`);
        if (isTransfer && !line.destino) missingFields.push(`${prefix}: destino`);
        if (!line.producto) missingFields.push(`${prefix}: producto`);
        if (!line.lote) missingFields.push(`${prefix}: lote`);
        if (!toNum(line.cantidad)) missingFields.push(`${prefix}: cantidad`);
      });
    } else {
      if (!clean(form.producto)) missingFields.push('Producto');
      if (!isKitMovement && !clean(form.lote)) missingFields.push('Lote');
      if (!qty) missingFields.push('Cantidad');
    }
    if (isKitMovement) {
      formKitComponents.forEach((component, index) => {
        const key = formKitComponentKey(component, index);
        if (!clean(formKitLots[key])) missingFields.push(`Lote ${clean(component.producto).toUpperCase()}`);
      });
    }
    if (missingFields.length > 0) {
      window.alert(`Completa estos campos para guardar:\n- ${missingFields.join('\n- ')}`);
      return;
    }
    const producto = clean(!editingId ? primaryDraftLine.producto : form.producto).toUpperCase();
    const bodega = normalizeWarehouseAlias(form.bodega);
    const sourceWarehouseIsHuarte = HUARTE_OWN_WAREHOUSES.has(bodega);
    const sourceWarehouseIsCanet = CANET_TRANSFER_WAREHOUSES.has(bodega);
    if (!isMultiLineCreate && !sourceWarehouseIsHuarte && !sourceWarehouseIsCanet) {
      window.alert('Selecciona una bodega real de Canet o Huarte.');
      return;
    }
    if (!isMultiLineCreate && isTransfer) {
      const originWarehouse = normalizeWarehouseAlias(bodega);
      if (!HUARTE_OWN_WAREHOUSES.has(transferDestination) && !CANET_TRANSFER_WAREHOUSES.has(transferDestination)) {
        window.alert('El destino del traspaso debe ser una bodega real de Canet o Huarte.');
        return;
      }
      if (transferDestination === originWarehouse) {
        window.alert('El origen y el destino del traspaso no pueden ser la misma bodega.');
        return;
      }
    }
    const sign = inferMovementSign(form.tipo_movimiento, rawQty);
    const signedQty = qty * sign;
    const isBalanceCorrection = isBalanceCorrectionType(form.tipo_movimiento);
    const stockRowsForValidation = calculateInventoryStockSnapshot(
      (sourceWarehouseIsCanet ? (canetMovements as Movement[]) : globalMovementsForStock).filter((m) => (editingId ? m.id !== editingId : true)),
      {
        scope: sourceWarehouseIsCanet ? 'canet' : 'huarte',
        normalizeProduct: (value) => clean(value).toUpperCase(),
        normalizeLot: (value, movement) => canonicalLotForProduct(allKnownLotes, clean((movement as any).producto), clean(value)),
        normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
        signedQuantity: inferSignedQuantity,
      },
    ).rows;

    const validateProductLot = (targetProduct: string, targetLot: string) => {
      const lotRow =
        allKnownLotes.find(
          (l) =>
            clean(l.producto).toUpperCase() === targetProduct &&
            normalizeLotCompareToken(clean(l.lote)) === normalizeLotCompareToken(targetLot) &&
            (!clean((l as any).bodega) || normalizeWarehouseAlias((l as any).bodega) === normalizeWarehouseAlias(bodega)),
        ) ||
        allKnownLotes.find(
          (l) =>
            clean(l.producto).toUpperCase() === targetProduct &&
            normalizeLotCompareToken(clean(l.lote)) === normalizeLotCompareToken(targetLot),
        );
      const existsInStock = stockRowsForValidation.some(
        (row) =>
          clean(row.producto).toUpperCase() === targetProduct &&
          normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot),
      );
      if (!lotRow && !existsInStock) return `El lote ${targetLot} no corresponde al producto ${targetProduct}. Revisa producto/lote.`;
      if (lotRow && normalizeLotState(lotRow.estado) === 'AGOTADO') {
        const originalMovement = editingId ? monthSortedMovements.find((m) => m.id === editingId) : null;
        const isEditingSameLot = !!(
          originalMovement &&
          clean(originalMovement.producto).toUpperCase() === targetProduct &&
          normalizeLotCompareToken(clean(originalMovement.lote)) === normalizeLotCompareToken(targetLot)
        );
        if (!isEditingSameLot) {
          return `El lote ${targetLot} está marcado como AGOTADO. Reactívalo en Maestros > Lotes para usarlo.`;
        }
      }
      return '';
    };

    const stockFor = (targetProduct: string, targetLot: string) =>
      toNum(
        stockRowsForValidation.find(
          (row) =>
            clean(row.producto).toUpperCase() === targetProduct &&
            normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot) &&
            normalizeWarehouseAlias(row.bodega) === normalizeWarehouseAlias(bodega),
        )?.stock,
      );

    const getLineValidationContext = (originWarehouseRaw: string) => {
      const originWarehouse = normalizeWarehouseAlias(originWarehouseRaw);
      const originIsCanet = CANET_TRANSFER_WAREHOUSES.has(originWarehouse);
      const originIsHuarte = HUARTE_OWN_WAREHOUSES.has(originWarehouse);
      const stockRows = calculateInventoryStockSnapshot(
        (originIsCanet ? (canetMovements as Movement[]) : globalMovementsForStock).filter((m) => (editingId ? m.id !== editingId : true)),
        {
          scope: originIsCanet ? 'canet' : 'huarte',
          normalizeProduct: (value) => clean(value).toUpperCase(),
          normalizeLot: (value, movement) => canonicalLotForProduct(allKnownLotes, clean((movement as any).producto), clean(value)),
          normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
          signedQuantity: inferSignedQuantity,
        },
      ).rows;
      return { originWarehouse, originIsCanet, originIsHuarte, stockRows };
    };

    const validateProductLotForLine = (
      targetProduct: string,
      targetLot: string,
      originWarehouse: string,
      stockRows: Array<{ producto: string; lote: string; bodega: string; stock: number }>,
    ) => {
      const lotRow =
        allKnownLotes.find(
          (l) =>
            clean(l.producto).toUpperCase() === targetProduct &&
            normalizeLotCompareToken(clean(l.lote)) === normalizeLotCompareToken(targetLot) &&
            (!clean((l as any).bodega) || normalizeWarehouseAlias((l as any).bodega) === normalizeWarehouseAlias(originWarehouse)),
        ) ||
        allKnownLotes.find(
          (l) =>
            clean(l.producto).toUpperCase() === targetProduct &&
            normalizeLotCompareToken(clean(l.lote)) === normalizeLotCompareToken(targetLot),
        );
      const existsInStock = stockRows.some(
        (row) =>
          clean(row.producto).toUpperCase() === targetProduct &&
          normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot),
      );
      if (!lotRow && !existsInStock) return `El lote ${targetLot} no corresponde al producto ${targetProduct}. Revisa producto/lote.`;
      if (lotRow && normalizeLotState(lotRow.estado) === 'AGOTADO') {
        return `El lote ${targetLot} está marcado como AGOTADO. Reactívalo en Maestros > Lotes para usarlo.`;
      }
      return '';
    };

    const stockForLine = (
      stockRows: Array<{ producto: string; lote: string; bodega: string; stock: number }>,
      targetProduct: string,
      targetLot: string,
      originWarehouse: string,
    ) =>
      toNum(
        stockRows.find(
          (row) =>
            clean(row.producto).toUpperCase() === targetProduct &&
            normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot) &&
            normalizeWarehouseAlias(row.bodega) === normalizeWarehouseAlias(originWarehouse),
        )?.stock,
      );

    const preparedBulkLines: Array<{
      producto: string;
      lote: string;
      qty: number;
      signedQty: number;
      bodega: string;
      destino: string;
      sourceWarehouseIsCanet: boolean;
      sourceIndex: number;
    }> = [];

    const kitParts = isKitMovement
      ? formKitComponents.map((component, index) => {
          const componentProduct = clean(component.producto).toUpperCase();
          const componentLot = canonicalLotForProduct(allKnownLotes, componentProduct, clean(formKitLots[formKitComponentKey(component, index)]));
          const componentQty = qty * Math.max(0, toNum(component.cantidad));
          return {
            componentProduct,
            componentLot,
            componentQty,
            componentSignedQty: componentQty * sign,
          };
        })
      : [];

    if (isKitMovement) {
      for (const part of kitParts) {
        if (!part.componentProduct || !part.componentLot || part.componentQty <= 0) {
          window.alert(`Revisa la receta del kit ${producto}: hay un componente incompleto.`);
          return;
        }
        const validationError = validateProductLot(part.componentProduct, part.componentLot);
        if (validationError) {
          window.alert(validationError);
          return;
        }
        const base = stockFor(part.componentProduct, part.componentLot);
        if (!isBalanceCorrection && base + part.componentSignedQty < 0) {
          window.alert(
            `Movimiento inválido: el kit ${producto} dejaría stock negativo en ${part.componentProduct} · ${part.componentLot} · ${bodega}.\n` +
            `Stock disponible actual: ${Math.round(base)}.`,
          );
          return;
        }
      }
    } else if (isMultiLineCreate) {
      const runningDeltaByStockKey = new Map<string, number>();
      for (const line of draftLinesForSave) {
        const targetProduct = clean(line.producto).toUpperCase();
        const lineOrigin = normalizeWarehouseAlias(line.bodega);
        const lineDestination = normalizeWarehouseAlias(line.destino);
        const lineContext = getLineValidationContext(lineOrigin);
        if (!lineContext.originIsHuarte && !lineContext.originIsCanet) {
          window.alert(`Línea ${line.index + 1}: selecciona una bodega real de Canet o Huarte.`);
          return;
        }
        if (isTransfer) {
          if (!HUARTE_OWN_WAREHOUSES.has(lineDestination) && !CANET_TRANSFER_WAREHOUSES.has(lineDestination)) {
            window.alert(`Línea ${line.index + 1}: el destino del traspaso debe ser una bodega real de Canet o Huarte.`);
            return;
          }
          if (lineDestination === lineOrigin) {
            window.alert(`Línea ${line.index + 1}: el origen y el destino del traspaso no pueden ser la misma bodega.`);
            return;
          }
        }
        const rawLineLot = clean(line.lote);
        const targetLot = canonicalLotForProduct(allKnownLotes, targetProduct, rawLineLot);
        const lineRawQty = toNum(line.cantidad);
        const lineQty = Math.abs(lineRawQty);
        const lineSign = inferMovementSign(form.tipo_movimiento, lineRawQty);
        const lineSignedQty = lineQty * lineSign;
        const productRow = productos.find((p) => clean(p.producto).toUpperCase() === targetProduct);
        const lineKitComponents = productRow
          ? normalizeKitComponents((productRow as any).kit_componentes || (productRow as any).componentes_kit)
          : [];
        const lineMode = clean((productRow as any)?.modo_stock || (productRow as any)?.tipo_producto).toUpperCase();
        if (lineMode === 'KIT' || lineKitComponents.length > 0) {
          window.alert(`La línea ${line.index + 1} contiene un kit (${targetProduct}). Los kits se crean de uno en uno para poder elegir lotes por componente.`);
          return;
        }
        const validationError = validateProductLotForLine(targetProduct, targetLot, lineOrigin, lineContext.stockRows);
        if (validationError) {
          window.alert(`Línea ${line.index + 1}: ${validationError}`);
          return;
        }
        const stockKey = `${targetProduct}|${normalizeLotCompareToken(targetLot)}|${lineOrigin}`;
        const base = stockForLine(lineContext.stockRows, targetProduct, targetLot, lineOrigin) + (runningDeltaByStockKey.get(stockKey) || 0);
        if (!isBalanceCorrection && base + lineSignedQty < 0) {
          window.alert(
            `Movimiento inválido en línea ${line.index + 1}: dejaría stock negativo en ${targetProduct} · ${targetLot} · ${lineOrigin}.\n` +
            `Stock disponible actual: ${Math.round(base)}.`,
          );
          return;
        }
        runningDeltaByStockKey.set(stockKey, (runningDeltaByStockKey.get(stockKey) || 0) + lineSignedQty);
        preparedBulkLines.push({
          producto: targetProduct,
          lote: targetLot,
          qty: lineQty,
          signedQty: lineSignedQty,
          bodega: lineOrigin,
          destino: lineDestination,
          sourceWarehouseIsCanet: lineContext.originIsCanet,
          sourceIndex: line.index,
        });
      }
    } else {
      const lote = canonicalLotForProduct(allKnownLotes, producto, clean(form.lote));
      const validationError = validateProductLot(producto, lote);
      if (validationError) {
        window.alert(validationError);
        return;
      }
      const base = stockFor(producto, lote);
      if (!isBalanceCorrection && base + signedQty < 0) {
        window.alert(
          `Movimiento inválido: dejaría stock negativo en ${producto} · ${lote} · ${bodega}.\n` +
          `Stock disponible actual: ${Math.round(base)}.`,
        );
        return;
      }
    }

    const nowIso = new Date().toISOString();
    setSavingMovement(true);
    const sourceDb = sourceWarehouseIsCanet ? canetDB : huarteDB;
    const sourceInventoryLabel = sourceWarehouseIsCanet ? 'Inventario Canet' : 'Inventario Huarte';
    const addTransferAutoEntry = async (
      payload: any,
      quantity: number,
      pairMarker: string,
      originWarehouseRaw = bodega,
      destinationWarehouseRaw = transferDestination,
    ) => {
      if (!isTransfer) return;
      const destinationWarehouse = normalizeWarehouseAlias(destinationWarehouseRaw);
      const originWarehouse = normalizeWarehouseAlias(originWarehouseRaw);
      if (!destinationWarehouse || destinationWarehouse === originWarehouse) return;
      const destinationDb = HUARTE_OWN_WAREHOUSES.has(destinationWarehouse)
        ? huarteDB
        : CANET_TRANSFER_WAREHOUSES.has(destinationWarehouse)
          ? canetDB
          : null;
      if (!destinationDb) return;
      await destinationDb.addMovement({
        ...payload,
        tipo_movimiento: 'entrada_traspaso',
        bodega: destinationWarehouse,
        cliente: originWarehouse,
        destino: destinationWarehouse,
        cantidad: quantity,
        signo: 1,
        cantidad_signed: quantity,
        source: payload.source === 'manual_kit' ? 'manual_kit_auto_in' : 'manual_transfer_auto_in',
        notas: `${clean(payload.notas)} | ${pairMarker} | Auto entrada por traspaso desde ${originWarehouse}`,
      } as any);
    };
    try {
      if (isMultiLineCreate) {
        const createdMovements: Movement[] = [];
        for (const line of preparedBulkLines) {
          const pairMarker = makeTransferPairId();
          const lineSign = line.signedQty < 0 ? -1 : 1;
          const lineSourceDb = line.sourceWarehouseIsCanet ? canetDB : huarteDB;
          const payload = {
            fecha: clean(form.fecha),
            tipo_movimiento: clean(form.tipo_movimiento),
            producto: line.producto,
            lote: line.lote,
            cantidad: line.qty,
            bodega: line.bodega,
            cliente: clean(form.cliente),
            destino: isTransfer ? line.destino : clean(form.destino),
            factura_doc: clean(form.factura_doc),
            responsable: clean(form.responsable || currentUser?.name),
            motivo: clean(form.motivo),
            notas: [clean(form.notas), isTransfer ? pairMarker : ''].filter(Boolean).join(' | '),
            afecta_stock: 'SI',
            signo: lineSign,
            cantidad_signed: line.signedQty,
            source: 'manual_batch',
            updated_at: nowIso,
            updated_by: currentUser?.name || actorName,
          };
          const nextMovement = await lineSourceDb.addMovement({
            ...payload,
            created_at: nowIso,
          } as any);
          createdMovements.push(nextMovement as Movement);
          await addTransferAutoEntry(payload, line.qty, pairMarker, line.bodega, line.destino);
        }
        appendAudit(
          'Creación de movimientos múltiples',
          `${form.tipo_movimiento} · ${createdMovements.map((m) => `${m.producto} ${m.lote} ${m.bodega} ${m.destino || ''} ${m.cantidad_signed}`).join(', ')}`,
        );
        Array.from(new Set(preparedBulkLines.map((line) => line.bodega))).forEach((lineBodega) => {
          void notifyMovementResponsible(lineBodega, `${actorName} creó movimiento(s) múltiples en ${lineBodega}: ${form.tipo_movimiento}.`);
        });
        emitSuccessFeedback(`${createdMovements.length} movimiento(s) creados con éxito.`);
        setShowAllRows((s) => ({ ...s, movimientos: true }));
        setMovementLines([createEmptyMovementDraftLine()]);
        setFormKitLots({});
      } else if (isKitMovement) {
        const createdMovements: Movement[] = [];
        for (const part of kitParts) {
          const pairMarker = makeTransferPairId();
          const notes = [
            clean(form.notas),
            `Kit ${producto} · ${qty.toLocaleString('es-ES')} unidad(es)`,
            isTransfer ? pairMarker : '',
          ].filter(Boolean).join(' | ');
          const payload = {
            fecha: clean(form.fecha),
            tipo_movimiento: clean(form.tipo_movimiento),
            producto: part.componentProduct,
            lote: part.componentLot,
            cantidad: part.componentQty,
            bodega,
            cliente: clean(form.cliente),
            destino: isTransfer ? transferDestination : clean(form.destino),
            factura_doc: clean(form.factura_doc),
            responsable: clean(form.responsable || currentUser?.name),
            motivo: clean(form.motivo),
            notas: notes,
            afecta_stock: 'SI',
            signo: sign,
            cantidad_signed: part.componentSignedQty,
            source: 'manual_kit',
            updated_at: nowIso,
            updated_by: currentUser?.name || actorName,
            created_at: nowIso,
          };
          const nextMovement = await sourceDb.addMovement(payload as any);
          createdMovements.push(nextMovement as Movement);
          await addTransferAutoEntry(payload, part.componentQty, pairMarker);
        }
        appendAudit(
          'Creación de movimiento kit',
          `${form.tipo_movimiento} · ${producto} · ${qty.toLocaleString('es-ES')} · ${bodega} · ${createdMovements.map((m) => `${m.producto} ${m.lote}`).join(', ')}`,
        );
        void notifyMovementResponsible(bodega, `${actorName} creó un movimiento de kit en ${sourceInventoryLabel}: ${form.tipo_movimiento} · ${producto}.`);
        emitSuccessFeedback('Movimiento de kit creado con éxito.');
        setShowAllRows((s) => ({ ...s, movimientos: true }));
        setFormKitLots({});
      } else if (editingId) {
        const lote = canonicalLotForProduct(allKnownLotes, producto, clean(form.lote));
        const payload = {
          fecha: clean(form.fecha),
          tipo_movimiento: clean(form.tipo_movimiento),
          producto,
          lote,
          cantidad: qty,
          bodega,
          cliente: clean(form.cliente),
          destino: clean(form.destino),
          factura_doc: clean(form.factura_doc),
          responsable: clean(form.responsable || currentUser?.name),
          motivo: clean(form.motivo),
          notas: clean(form.notas),
          afecta_stock: 'SI',
          signo: sign,
          cantidad_signed: signedQty,
          source: 'edited',
          updated_at: nowIso,
          updated_by: currentUser?.name || actorName,
        };
        await huarteDB.updateMovement(editingId, payload);
        appendAudit('Edición de movimiento', `ID ${editingId} · ${payload.tipo_movimiento} · ${payload.producto} ${payload.lote} · ${payload.bodega}`);
        void notifyMovementResponsible(payload.bodega, `${actorName} editó un movimiento en Inventario Huarte: ${payload.tipo_movimiento} · ${payload.producto} ${payload.lote}.`);
        emitSuccessFeedback('Movimiento actualizado con éxito.');
        setShowAllRows((s) => ({ ...s, movimientos: true }));
      } else {
        const lote = canonicalLotForProduct(allKnownLotes, producto, clean(form.lote));
        const pairMarker = makeTransferPairId();
        const payload = {
          fecha: clean(form.fecha),
          tipo_movimiento: clean(form.tipo_movimiento),
          producto,
          lote,
          cantidad: qty,
          bodega,
          cliente: clean(form.cliente),
          destino: isTransfer ? transferDestination : clean(form.destino),
          factura_doc: clean(form.factura_doc),
          responsable: clean(form.responsable || currentUser?.name),
          motivo: clean(form.motivo),
          notas: [clean(form.notas), isTransfer ? pairMarker : ''].filter(Boolean).join(' | '),
          afecta_stock: 'SI',
          signo: sign,
          cantidad_signed: signedQty,
          source: 'manual',
          updated_at: nowIso,
          updated_by: currentUser?.name || actorName,
        };
        await sourceDb.addMovement({
          ...payload,
          created_at: nowIso,
        } as any);
        await addTransferAutoEntry(payload, qty, pairMarker);
        appendAudit('Creación de movimiento', `${payload.tipo_movimiento} · ${payload.producto} ${payload.lote} · ${payload.bodega} · ${payload.cantidad_signed}`);
        void notifyMovementResponsible(bodega, `${actorName} creó un movimiento en ${sourceInventoryLabel}: ${payload.tipo_movimiento} · ${payload.producto} ${payload.lote}.`);
        emitSuccessFeedback('Movimiento creado con éxito.');
        setShowAllRows((s) => ({ ...s, movimientos: true }));
      }
      setModalOpen(false);
    } catch (error) {
      console.error('Error guardando movimiento de Huarte:', error);
      window.alert(`No se pudo guardar el movimiento.\n\nDetalle: ${describeDbError(error)}`);
    } finally {
      setSavingMovement(false);
    }
  };

  const deleteMovement = async (id: number) => {
    const row = monthSortedMovements.find((m) => toNum(m.id) === toNum(id));
    if (!window.confirm('¿Seguro que quieres eliminar este movimiento?')) return;
    if (isReadOnlySyncedSource(row?.source)) {
      window.alert('Este movimiento es automático/sincronizado. Debes eliminar el movimiento origen.');
      return;
    }
    if (!isPersistedMovementId(id)) {
      window.alert('Este movimiento es una vista calculada y no se elimina desde aquí.');
      return;
    }
    const safeId = toNum(id);
    if (safeId < INT32_MIN || safeId > INT32_MAX) {
      window.alert('ID de movimiento fuera de rango para base de datos. No se puede eliminar desde aquí.');
      return;
    }
    if (STATIC_CORRECTION_ID_SET.has(safeId)) {
      setHiddenCorrectionIds((prev) => {
        const list = Array.isArray(prev) ? prev.map((x) => toNum(x)).filter(Number.isFinite) : [];
        if (list.includes(safeId)) return list;
        return [...list, safeId];
      });
      emitSuccessFeedback('Corrección de saldo eliminada con éxito.');
      return;
    }
    try {
      await huarteDB.deleteMovement(safeId);
      appendAudit('Eliminación de movimiento', `ID ${safeId}`);
      void notifyHuarteResponsible(`${actorName} eliminó un movimiento en Inventario Huarte (ID ${safeId}).`);
      emitSuccessFeedback('Movimiento eliminado con éxito.');
    } catch (error) {
      console.error('Error eliminando movimiento de Huarte:', error);
      window.alert(`No se pudo eliminar el movimiento.\n\nDetalle: ${describeDbError(error)}`);
    }
  };

  const closeProductModal = () => {
    setProductModalOpen(false);
    setEditingProductCode(null);
    setNewProductForm({ ...EMPTY_PRODUCT_FORM });
  };

  const openProductCreateModal = () => {
    if (!canEdit) return;
    setEditingProductCode(null);
    setNewProductForm({ ...EMPTY_PRODUCT_FORM });
    setProductModalOpen(true);
  };

  const openProductEditModal = (row: GenericRow) => {
    if (!canEdit) return;
    const code = clean(row.producto).toUpperCase();
    if (!code) return;
    setEditingProductCode(code);
    setNewProductForm({
      producto: code,
      tipo_producto: clean(row.tipo_producto) || 'COMPLEMENTO ALIMENTICIO',
      stock_min: clean(row.stock_min),
      stock_optimo: clean((row as any).stock_optimo || (row as any).stock_opt),
      consumo_mensual_cajas: clean((row as any).consumo_mensual_cajas),
      modo_stock: clean(row.modo_stock) || 'DIRECTO',
      activo_si_no: clean(row.activo_si_no) || 'SI',
      kit_componentes_text: formatKitComponents((row as any).kit_componentes || (row as any).componentes_kit),
    });
    setProductModalOpen(true);
  };

  const createProducto = () => {
    const code = clean(newProductForm.producto).toUpperCase();
    if (!code) return;
    if (isRetiredProductCode(code)) {
      window.alert('Ese producto está retirado del catálogo de trabajo.');
      return;
    }
    const mode = clean(newProductForm.modo_stock).toUpperCase();
    const kitComponents = parseKitComponentsText(newProductForm.kit_componentes_text);
    if (mode === 'KIT' && kitComponents.length === 0) {
      window.alert('Un kit necesita al menos un componente. Ejemplo: SV:1:caja');
      return;
    }
    const now = new Date().toISOString();
    const { kit_componentes_text, ...productBaseFields } = newProductForm;
    void kit_componentes_text;
    const productPayload = {
      ...productBaseFields,
      producto: code,
      tipo_producto: mode === 'KIT' ? 'KIT' : clean(newProductForm.tipo_producto),
      modo_stock: mode,
      stock_optimo: clean(newProductForm.stock_optimo),
      stock_opt: clean(newProductForm.stock_optimo),
      consumo_mensual_cajas: clean(newProductForm.consumo_mensual_cajas),
      kit_componentes: mode === 'KIT' ? kitComponents : [],
      componentes_kit: mode === 'KIT' ? kitComponents : [],
      updatedAt: now,
      updated_at: now,
      updatedBy: actorName,
      updated_by: actorName,
    };
    if (!editingProductCode && productos.some((p) => clean(p.producto).toUpperCase() === code)) return;
    setProductos((prev) => upsertProductCatalogRow(prev, productPayload));
    setCanetProductosCatalog((prev) => upsertProductCatalogRow(prev, productPayload));
    closeProductModal();
    appendAudit(editingProductCode ? 'Edición de producto' : 'Creación de producto', `${code}${mode === 'KIT' ? ' · KIT' : ''}`);
    void notifyHuarteResponsible(`${actorName} ${editingProductCode ? 'editó' : 'creó'} el producto ${code} en Inventario Huarte.`);
    emitSuccessFeedback(editingProductCode ? 'Producto actualizado con éxito.' : 'Producto creado con éxito.');
  };

  const createLote = () => {
    const producto = clean(newLote.producto).toUpperCase();
    const lote = clean(newLote.lote).toUpperCase();
    const bodega = clean(newLote.bodega).toUpperCase();
    if (!producto || !lote || !bodega) return;
    if (lotes.some((l) => clean(l.producto) === producto && clean(l.lote) === lote && clean(l.bodega) === bodega)) return;
    setLotes((prev) => [...prev, { producto, lote, bodega, estado: normalizeLotState(newLote.estado), fecha_alta: new Date().toISOString().slice(0, 10) }]);
    setNewLote({ producto: '', lote: '', bodega: '', estado: 'ACTIVO' });
    appendAudit('Creación de lote', `${producto} ${lote} · ${bodega}`);
    void notifyHuarteResponsible(`${actorName} creó el lote ${producto} ${lote} en Inventario Huarte.`);
    emitSuccessFeedback('Lote creado con éxito.');
  };

  const toggleLotState = (lotRow: GenericRow) => {
    if (!canEdit) return;
    const producto = clean(lotRow.producto);
    const lote = clean(lotRow.lote);
    const bodega = clean(lotRow.bodega);
    const matches = activeLotes.filter((l) => {
      const sameLot = clean(l.producto) === producto && clean(l.lote) === lote;
      if (!sameLot) return false;
      if (!bodega) return true;
      return clean(l.bodega) === bodega;
    });
    const allAgotado = matches.length > 0 && matches.every((l) => normalizeLotState(l.estado) === 'AGOTADO');
    const nextState = allAgotado ? 'ACTIVO' : 'AGOTADO';
    setLotes((prev) =>
      prev.map((l) => {
        const sameRow =
          clean(l.producto) === producto &&
          clean(l.lote) === lote &&
          (bodega ? clean(l.bodega) === bodega : true);
        if (!sameRow) return l;
        return { ...l, estado: nextState };
      }),
    );
    appendAudit('Cambio estado lote', `${producto} ${lote} → ${nextState}`);
    void notifyHuarteResponsible(`${actorName} marcó el lote ${producto} ${lote} como ${nextState} en Inventario Huarte.`);
    emitSuccessFeedback(`Lote ${lote} marcado como ${nextState}.`);
  };

  const archiveLot = (lotRow: GenericRow) => {
    if (!canEdit) return;
    const producto = clean(lotRow.producto);
    const lote = clean(lotRow.lote);
    if (!producto || !lote) return;
    const key = `${producto}|${lote}`;
    const now = new Date().toISOString();
    setArchivedLotEntries((prev) => {
      const entries = Array.isArray(prev) ? prev.filter((entry) => clean(entry.id) !== key) : [];
      const current = Array.isArray(prev) ? prev.find((entry) => clean(entry.id) === key) : null;
      entries.unshift({
        id: key,
        producto,
        lote,
        archivedAt: now,
        archivedBy: actorName,
        restoredAt: current?.restoredAt ? clean(current.restoredAt) : undefined,
        restoredBy: current?.restoredBy ? clean(current.restoredBy) : undefined,
      });
      return entries;
    });
    appendAudit('Archivado de lote', `${producto} ${lote}`);
    void notifyHuarteResponsible(`${actorName} archivó el lote ${producto} ${lote} en Inventario Huarte.`);
    emitSuccessFeedback(`Lote ${lote} archivado con éxito.`);
  };

  const restoreLot = (lotRow: GenericRow) => {
    if (!canEdit) return;
    const producto = clean(lotRow.producto);
    const lote = clean(lotRow.lote);
    if (!producto || !lote) return;
    const key = `${producto}|${lote}`;
    const now = new Date().toISOString();
    setArchivedLotEntries((prev) => {
      const entries = Array.isArray(prev) ? prev.filter((entry) => clean(entry.id) !== key) : [];
      const current = Array.isArray(prev) ? prev.find((entry) => clean(entry.id) === key) : null;
      entries.unshift({
        id: key,
        producto,
        lote,
        archivedAt: current?.archivedAt ? clean(current.archivedAt) : now,
        archivedBy: current?.archivedBy ? clean(current.archivedBy) : actorName,
        restoredAt: now,
        restoredBy: actorName,
      });
      return entries;
    });
    setLotes((prev) =>
      prev.map((row) =>
        `${clean(row.producto)}|${clean(row.lote)}` === key
          ? { ...row, estado: 'ACTIVO' }
          : row,
      ),
    );
    appendAudit('Restauración de lote', `${producto} ${lote}`);
    void notifyHuarteResponsible(`${actorName} restauró el lote ${producto} ${lote} en Inventario Huarte.`);
    emitSuccessFeedback(`Lote ${lote} restaurado con éxito.`);
  };

  const createTipo = () => {
    const t = clean(newTipo);
    if (!t) return;
    if (tipos.some((x) => clean(x.tipo_movimiento).toLowerCase() === t.toLowerCase())) return;
    setTipos((prev) => [...prev, { tipo_movimiento: t, afecta_stock_si_no: 'SI' }]);
    setNewTipo('');
    appendAudit('Creación de tipo', t);
    void notifyHuarteResponsible(`${actorName} creó el tipo de movimiento ${t} en Inventario Huarte.`);
    emitSuccessFeedback('Tipo de movimiento creado con éxito.');
  };

  const createBodega = () => {
    const b = normalizeHuarteWarehouseInput(newBodega.bodega);
    if (!b) {
      alert(`Huarte solo permite estas bodegas: ${HUARTE_OWN_WAREHOUSE_ORDER.join(', ')}.`);
      return;
    }
    if (activeBodegas.some((x) => normalizeWarehouseAlias(x.bodega) === b)) {
      alert(`La bodega ${b} ya existe en Huarte.`);
      return;
    }
    setBodegas((prev) => [...prev, { bodega: b, activo_si_no: clean(newBodega.activo_si_no || 'SI') }]);
    setNewBodega({ bodega: '', activo_si_no: 'SI' });
    appendAudit('Creación de bodega', b);
    void notifyHuarteResponsible(`${actorName} creó la bodega ${b} en Inventario Huarte.`);
    emitSuccessFeedback('Bodega creada con éxito.');
  };

  const editBodega = (oldBodegaRaw: string) => {
    const oldBodega = normalizeWarehouseAlias(oldBodegaRaw);
    if (!oldBodega) return;
    setTextEditDialog({
      title: 'Editar bodega',
      value: oldBodegaRaw,
      confirmLabel: 'Guardar bodega',
      onConfirm: async (nextValue) => {
        const nextBodega = normalizeHuarteWarehouseInput(nextValue);
        if (!nextBodega) {
          alert(`Huarte solo permite estas bodegas: ${HUARTE_OWN_WAREHOUSE_ORDER.join(', ')}.`);
          return;
        }
        if (!nextBodega || nextBodega === oldBodega) return;
        if (activeBodegas.some((b) => normalizeWarehouseAlias(b.bodega) === nextBodega && normalizeWarehouseAlias(b.bodega) !== oldBodega)) {
          alert(`La bodega ${nextBodega} ya existe en Huarte.`);
          return;
        }
        setBodegas((prev) => prev.map((b) => (normalizeWarehouseAlias(b.bodega) === oldBodega ? { ...b, bodega: nextBodega } : b)));
        appendAudit('Edición de bodega', `${oldBodega} → ${nextBodega}`);
        void notifyHuarteResponsible(`${actorName} editó una bodega en Inventario Huarte: ${oldBodega} → ${nextBodega}.`);
        emitSuccessFeedback('Bodega actualizada con éxito.');
      },
    });
  };

  const deleteBodega = (oldBodegaRaw: string) => {
    const oldBodega = normalizeWarehouseAlias(oldBodegaRaw);
    if (!oldBodega) return;
    if (HUARTE_OWN_WAREHOUSES.has(oldBodega)) {
      alert('Esta bodega forma parte de la estructura base de Huarte y no puede borrarse.');
      return;
    }
    if (!window.confirm(`¿Borrar la bodega "${oldBodegaRaw}"?`)) return;
    const ts = new Date().toISOString();
    setBodegas((prev) =>
      prev.map((b) =>
        normalizeWarehouseAlias(b.bodega) === oldBodega
          ? { ...b, deletedAt: ts, deleted_at: ts, deletedBy: actorName, deleted_by: actorName, updatedAt: ts, updated_at: ts, updatedBy: actorName, updated_by: actorName }
          : b,
      ),
    );
    appendAudit('Eliminación de bodega', oldBodega);
    void notifyHuarteResponsible(`${actorName} eliminó la bodega ${oldBodega} en Inventario Huarte.`);
    emitSuccessFeedback('Bodega eliminada con éxito.');
  };

  const createCliente = () => {
    const c = clean(newCliente);
    if (!c) return;
    if (activeClientes.some((x) => clean(x.cliente).toLowerCase() === c.toLowerCase())) return;
    setClientes((prev) => [...prev, { cliente: c }]);
    setNewCliente('');
    appendAudit('Creación de cliente', c);
    void notifyHuarteResponsible(`${actorName} creó el cliente ${c} en Inventario Huarte.`);
    emitSuccessFeedback('Cliente creado con éxito.');
  };

  const editCliente = (oldClientRaw: string) => {
    const oldClient = clean(oldClientRaw);
    if (!oldClient) return;
    setTextEditDialog({
      title: 'Editar cliente',
      value: oldClientRaw,
      confirmLabel: 'Guardar cliente',
      onConfirm: async (nextValue) => {
        const nextClient = clean(nextValue);
        if (!nextClient || nextClient === oldClient) return;
        setClientes((prev) => prev.map((c) => (clean(c.cliente) === oldClient ? { ...c, cliente: nextClient } : c)));
        appendAudit('Edición de cliente', `${oldClient} → ${nextClient}`);
        void notifyHuarteResponsible(`${actorName} editó un cliente en Inventario Huarte: ${oldClient} → ${nextClient}.`);
        emitSuccessFeedback('Cliente actualizado con éxito.');
      },
    });
  };

  const deleteCliente = (oldClientRaw: string) => {
    const oldClient = clean(oldClientRaw);
    if (!oldClient) return;
    if (!window.confirm(`¿Borrar el cliente "${oldClientRaw}"?`)) return;
    const ts = new Date().toISOString();
    setClientes((prev) =>
      prev.map((c) =>
        clean(c.cliente) === oldClient
          ? { ...c, deletedAt: ts, deleted_at: ts, deletedBy: actorName, deleted_by: actorName, updatedAt: ts, updated_at: ts, updatedBy: actorName, updated_by: actorName }
          : c,
      ),
    );
    appendAudit('Eliminación de cliente', oldClient);
    void notifyHuarteResponsible(`${actorName} eliminó el cliente ${oldClient} en Inventario Huarte.`);
    emitSuccessFeedback('Cliente eliminado con éxito.');
  };

  const exportPdf = (title: string, headers: string[], rows: Array<Array<string | number>>) => {
    openPrintablePdfReport({
      title,
      headers,
      rows: appendTotalRow(headers, rows),
      fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
      subtitle: `Generado: ${new Date().toLocaleString('es-ES')}`,
    });
  };
  const exportXlsx = (
    title: string,
    headers: string[],
    rows: Array<Array<string | number>>,
    summaryRows?: Array<[string, string | number]>,
  ) => {
    openTableXlsx({
      title,
      headers,
      rows: appendTotalRow(headers, rows),
      fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.xlsx`,
      subtitle: `Generado: ${new Date().toLocaleString('es-ES')}`,
      summaryRows,
    });
  };
  const exportExecutivePdf = () => {
    const summaryRows: Array<Array<string | number>> = [
      ['Stock total (filtro)', safeKpiStockTotal],
      ['Movimientos (filtro)', dashboard.totalMovements],
      ['Rectificativas (filtro)', dashboard.totalRect],
      ['Lotes activos (stock>0)', dashboard.totalLots],
    ];
    const detailRows = filteredMovements.slice(0, 120).map((m) => [
      displayDate(m.fecha),
      m.tipo_movimiento,
      m.producto,
      m.lote,
      m.bodega,
      m.cantidad_signed || m.cantidad,
      m.responsable || '-',
      m.updated_by || '-',
      m.updated_at ? new Date(m.updated_at).toLocaleString('es-ES') : '-',
    ]);
    openPrintablePdfReport({
      title: 'Inventario Huarte - Reporte gerencial',
      subtitle: `Periodo: ${periodLabel} · Generado: ${new Date().toLocaleString('es-ES')}`,
      fileName: `inventario-huarte-gerencial-${periodFileKey}.pdf`,
      headers: ['Indicador', 'Valor'],
      rows: appendTotalRow(['Indicador', 'Valor'], summaryRows),
      signatures: ['Responsable', 'Revisión'],
    });
    openPrintablePdfReport({
      title: 'Inventario Huarte - Detalle operativo',
      subtitle: `Top ${detailRows.length} movimientos filtrados`,
      fileName: `inventario-huarte-detalle-${periodFileKey}.pdf`,
      headers: ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Responsable', 'Última edición por', 'Última edición'],
      rows: appendTotalRow(['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Responsable', 'Última edición por', 'Última edición'], detailRows),
    });
    emitSuccessFeedback('PDF gerencial y detalle generados.');
  };
  const exportExecutiveXlsx = () => {
    const summaryRows: Array<[string, string | number]> = [
      ['Stock total (filtro)', safeKpiStockTotal],
      ['Movimientos (filtro)', dashboard.totalMovements],
      ['Rectificativas (filtro)', dashboard.totalRect],
      ['Lotes activos (stock>0)', dashboard.totalLots],
    ];
    openTableXlsx({
      title: 'Inventario Huarte - Reporte gerencial',
      subtitle: `Periodo: ${periodLabel} · Generado: ${new Date().toLocaleString('es-ES')}`,
      fileName: `inventario-huarte-gerencial-${periodFileKey}.xlsx`,
      headers: ['Indicador', 'Valor'],
      rows: appendTotalRow(['Indicador', 'Valor'], summaryRows),
      summaryRows,
    });
    openTableXlsx({
      title: 'Inventario Huarte - Detalle operativo',
      subtitle: `Top ${Math.min(filteredMovements.length, 120)} movimientos filtrados`,
      fileName: `inventario-huarte-detalle-${periodFileKey}.xlsx`,
      headers: ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Responsable', 'Última edición por', 'Última edición'],
      rows: appendTotalRow(
        ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Responsable', 'Última edición por', 'Última edición'],
        filteredMovements.slice(0, 120).map((m) => [
          displayDate(m.fecha),
          m.tipo_movimiento,
          m.producto,
          m.lote,
          m.bodega,
          m.cantidad_signed || m.cantidad,
          m.responsable || '-',
          m.updated_by || '-',
          m.updated_at ? new Date(m.updated_at).toLocaleString('es-ES') : '-',
        ]),
      ),
    });
    emitSuccessFeedback('Excel gerencial y detalle generados.');
  };
  const saveMonthlyClose = async () => {
    if (!closeMonthKey) {
      alert('Selecciona el modo Mes para guardar el cierre mensual.');
      return;
    }
    if (!canEdit) {
      alert('Para guardar un cierre debes entrar en modo edición.');
      return;
    }
    if (currentMonthlyClose && !window.confirm(`Ya existe un cierre de ${monthLabel(closeMonthKey)}. ¿Deseas reemplazarlo?`)) {
      return;
    }
    const snapshot = buildInventoryMonthlyCloseSnapshot({
      scope: 'huarte',
      monthKey: closeMonthKey,
      monthLabel: monthLabel(closeMonthKey),
      closedBy: actorName,
      rows: monthlyCloseRows,
    });
    setMonthlyClosures((prev) => upsertInventoryMonthlyCloseSnapshot(prev, snapshot));
    const recipients = Array.from(new Set([itziar?.id, ...USERS.filter((u) => u.isAdmin).map((u) => u.id)].filter(Boolean) as string[]));
    await Promise.allSettled(
      recipients.map((userId) =>
        addNotification({
          userId,
          type: 'success',
          message: `${actorName} guardó el cierre mensual de Inventario Huarte (${monthLabel(closeMonthKey)}).`,
        }),
      ),
    );
    emitSuccessFeedback('Cierre de mes congelado y guardado.');
  };
  const downloadMonthlyCloseExcel = () => {
    if (!currentMonthlyClose) {
      alert('Todavía no hay cierre guardado para este mes.');
      return;
    }
    downloadMonthlyCloseSnapshotExcel(currentMonthlyClose);
  };
  const downloadMonthlyCloseSnapshotExcel = (snapshot: InventoryMonthlyCloseSnapshot) => {
    openTableXlsx({
      title: 'Inventario Huarte - Cierre de mes',
      subtitle: `Foto congelada · Cierre: ${snapshot.monthLabel} · Guardado: ${new Date(snapshot.closedAt).toLocaleString('es-ES')} · Responsable: ${snapshot.closedBy}`,
      fileName: `cierre-mes-huarte-${snapshot.monthKey}.xlsx`,
      headers: ['Producto', 'Lote', 'Bodega', 'Stock cierre'],
      rows: appendTotalRow(['Producto', 'Lote', 'Bodega', 'Stock cierre'], monthlyCloseRowsForExport(snapshot)),
      summaryRows: [
        ['Stock cierre', snapshot.totalStock],
        ['Productos', snapshot.productCount],
        ['Lotes', snapshot.lotCount],
        ['Bodegas', snapshot.warehouseCount],
        ['Filas snapshot', snapshot.rowCount ?? snapshot.rows.length],
        ['Huella snapshot', snapshot.snapshotHash || 'legacy'],
      ],
    });
    emitSuccessFeedback('Excel de cierre generado.');
  };
  const moveMonthlyCloseToMonth = async (snapshot: InventoryMonthlyCloseSnapshot, nextMonthKeyRaw: string) => {
    const nextMonthKey = clean(nextMonthKeyRaw);
    if (!/^\d{4}-\d{2}$/.test(nextMonthKey)) {
      alert('Selecciona un mes válido para el cierre.');
      return;
    }
    if (nextMonthKey === snapshot.monthKey) return;
    const nextLabel = monthLabel(nextMonthKey);
    const existingTarget = getInventoryMonthlyCloseSnapshot(monthlyClosures, snapshot.scope, nextMonthKey);
    const replaceText = existingTarget && existingTarget.id !== snapshot.id
      ? `\n\nYa existe un cierre para ${nextLabel}; si continúas, se reemplazará por este cierre.`
      : '';
    const ok = window.confirm(
      `Vas a mover el cierre congelado de ${snapshot.monthLabel} a ${nextLabel}.\n\n` +
      'No se recalculará el stock: solo se corrige el mes al que pertenece la foto congelada.' +
      replaceText +
      '\n\n¿Deseas continuar?',
    );
    if (!ok) return;

    const movedSnapshot: InventoryMonthlyCloseSnapshot = {
      ...snapshot,
      id: `${snapshot.scope}:${nextMonthKey}`,
      monthKey: nextMonthKey,
      monthLabel: nextLabel,
      deletedAt: undefined,
      deletedBy: undefined,
    };
    const deletedOriginal: InventoryMonthlyCloseSnapshot = {
      ...snapshot,
      deletedAt: new Date().toISOString(),
      deletedBy: actorName,
    };
    setMonthlyClosures((prev) => [
      movedSnapshot,
      deletedOriginal,
      ...(Array.isArray(prev) ? prev : []).filter((item) => item.id !== snapshot.id && item.id !== movedSnapshot.id),
    ].sort((a, b) => clean(b.monthKey).localeCompare(clean(a.monthKey)) || clean(a.scope).localeCompare(clean(b.scope))));
    appendAudit('Edición de cierre mensual', `Huarte: ${snapshot.monthKey} -> ${nextMonthKey}`);
    await notifyHuarteResponsible(`${actorName} movió el cierre mensual de Inventario Huarte de ${snapshot.monthLabel} a ${nextLabel}.`);
    emitSuccessFeedback('Cierre mensual actualizado.');
  };
  const deleteMonthlyCloseSnapshot = async (snapshot: InventoryMonthlyCloseSnapshot) => {
    const ok = window.confirm(
      `Vas a eliminar el cierre congelado de ${snapshot.monthLabel}.\n\n` +
      'Ese mes volverá a calcularse con movimientos y dejará de estar bloqueado por esta foto.\n\n' +
      '¿Deseas eliminarlo?',
    );
    if (!ok) return;
    const deletedAt = new Date().toISOString();
    setMonthlyClosures((prev) => {
      const existing = (Array.isArray(prev) ? prev : []).find((item) => item.id === snapshot.id) || snapshot;
      return [
        { ...existing, deletedAt, deletedBy: actorName },
        ...(Array.isArray(prev) ? prev : []).filter((item) => item.id !== snapshot.id),
      ].sort((a, b) => clean(b.monthKey).localeCompare(clean(a.monthKey)) || clean(a.scope).localeCompare(clean(b.scope)));
    });
    appendAudit('Eliminación de cierre mensual', `Huarte (${snapshot.monthKey})`);
    await notifyHuarteResponsible(`${actorName} eliminó el cierre mensual de Inventario Huarte (${snapshot.monthLabel}).`);
    emitSuccessFeedback('Cierre mensual eliminado.');
  };

  const limitRows = <T,>(key: string, rows: T[]) => (showAllRows[key] ? rows : rows.slice(0, 6));
  const activeFilterCount = [
    selectedProducts.length > 0,
    !!lotFilter,
    !!warehouseFilter,
    !!typeFilter,
    !!quickSearch,
  ].filter(Boolean).length;
  const monthlyCloseSaveDisabledReason = !closeMonthKey
    ? 'Selecciona el modo Mes para cerrar.'
    : !accessReady
      ? 'Elige consultar o editar para activar el panel.'
      : !canEdit
        ? 'Entra en modo edición para guardar el cierre.'
        : '';

  const tabButton = (key: TabKey, label: string, Icon: any, badge = 0) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${isCompact ? 'text-xs' : 'text-sm'} font-bold transition-all ${tab === key ? 'border-violet-400 bg-violet-600 text-white shadow-sm' : 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50'}`}
    >
      <Icon size={16} />
      {label}
      {badge > 0 && <span className="inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-black">{badge}</span>}
    </button>
  );
  const visibleTabKeys = useMemo<TabKey[]>(
    () => (isRestrictedUser ? ['dashboard'] : ['dashboard', 'movimientos', 'ensamblajes', 'maestros', 'cierres']),
    [isRestrictedUser],
  );
  const visibleDashboardSections = useMemo<DashboardKey[]>(
    () => (isRestrictedUser ? ['stock'] : ['stock', 'control']),
    [isRestrictedUser],
  );

  useEffect(() => {
    if (!visibleTabKeys.includes(tab)) setTab('dashboard');
  }, [tab, visibleTabKeys]);

  useEffect(() => {
    if (!visibleDashboardSections.includes(dashboardSection)) {
      setDashboardSection('stock');
    }
  }, [dashboardSection, visibleDashboardSections]);

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-14 inventory-readable">
      <section className="rounded-3xl border border-violet-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">Inventario</p>
            <h1 className="text-3xl font-black text-violet-950">Control de stock Huarte</h1>
            <p className="text-sm text-violet-700/80">Stock, lotes y trazabilidad.</p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                Periodo
                <select
                  value={dateFilterMode}
                  onChange={(e) => setDateFilterMode(e.target.value as DateFilterMode)}
                  disabled={isRestrictedUser}
                  className="mt-1 block rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="day">Día</option>
                  <option value="range">Rango</option>
                  <option value="month">Mes</option>
                  <option value="year">Año</option>
                  {!isRestrictedUser && <option value="all">Todo</option>}
                </select>
              </label>
              {dateFilterMode === 'month' && (
                <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  Mes
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    disabled={isRestrictedUser}
                    className="mt-1 block min-w-[180px] rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {dateFilterMode === 'year' && (
                <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  Año
                  <input
                    type="number"
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="mt-1 block w-28 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 outline-none"
                  />
                </label>
              )}
              {(dateFilterMode === 'day' || dateFilterMode === 'range') && (
                <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  {dateFilterMode === 'day' ? 'Día' : 'Desde'}
                  <input
                    type="date"
                    value={dateFilterStart}
                    onChange={(e) => setDateFilterStart(e.target.value)}
                    className="mt-1 block rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 outline-none"
                  />
                </label>
              )}
              {dateFilterMode === 'range' && (
                <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  Hasta
                  <input
                    type="date"
                    value={dateFilterEnd}
                    onChange={(e) => setDateFilterEnd(e.target.value)}
                    className="mt-1 block rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 outline-none"
                  />
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Periodo activo: {periodLabel}</span>
              {!closeMonthKey ? (
                <span>El cierre mensual solo está disponible en modo Mes</span>
              ) : !accessReady ? (
                <span>Elige consultar o editar</span>
              ) : currentMonthlyClose ? (
                  <span className="font-semibold text-emerald-700">
                    Cierre congelado: {new Date(currentMonthlyClose.closedAt).toLocaleDateString('es-ES')} · {currentMonthlyClose.totalStock.toLocaleString('es-ES')}
                  </span>
                ) : (
                  <span>Sin cierre guardado</span>
                )}
              {currentMonthlyCloseDrift?.changed && (
                <span className="font-semibold text-amber-700">
                  Vista actual cambió: Δ stock {currentMonthlyCloseDrift.stockDelta.toLocaleString('es-ES')} · Δ filas {currentMonthlyCloseDrift.rowDelta.toLocaleString('es-ES')}
                </span>
              )}
              {previousMonthlyClose && (
                <span>Inicio: {previousMonthlyClose.totalStock.toLocaleString('es-ES')}</span>
              )}
              <button
                onClick={() => void saveMonthlyClose()}
                disabled={!!monthlyCloseSaveDisabledReason}
                title={monthlyCloseSaveDisabledReason || 'Guardar cierre congelado'}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-bold ${
                  monthlyCloseSaveDisabledReason
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Save size={14} />
                Guardar cierre
              </button>
              <button
                onClick={currentMonthlyClose ? downloadMonthlyCloseExcel : undefined}
                disabled={!currentMonthlyClose}
                title={currentMonthlyClose ? 'Descargar cierre congelado' : 'Todavía no hay cierre guardado para este mes.'}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-bold ${
                  currentMonthlyClose
                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <FileSpreadsheet size={14} />
                Excel cierre
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {inventorySummaryChips.map((chip) => (
            <div
              key={chip.label}
              className={`rounded-2xl border px-3 py-2 shadow-sm ${chip.tone === 'rose'
                ? 'border-rose-100 bg-rose-50 text-rose-900'
                : chip.tone === 'amber'
                  ? 'border-amber-100 bg-amber-50 text-amber-900'
                  : chip.tone === 'indigo'
                    ? 'border-indigo-100 bg-indigo-50 text-indigo-900'
                    : 'border-violet-100 bg-violet-50 text-violet-900'
                }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-75">{chip.label}</p>
              <p className="mt-1 text-xl font-black">{chip.value.toLocaleString('es-ES')}</p>
            </div>
          ))}
        </div>
        {accessReady && (
          <div className="mt-3 flex justify-end">
            <div className="flex items-center gap-2">
              <button onClick={exportExecutiveXlsx} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                <FileSpreadsheet size={14} />
                Excel gerencial
              </button>
              <button onClick={exportExecutivePdf} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
                <Download size={14} />
                PDF gerencial
              </button>
            </div>
          </div>
        )}
      </section>

      {showAccessSelector && accessMode === 'unset' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-violet-950">Acceso a Inventario Huarte</h2>
            <p className="mt-1 text-sm text-violet-700">Elige cómo quieres entrar: consultar o editar.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <button onClick={() => setAccessMode('consult')} className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left hover:bg-violet-100">
                <p className="text-sm font-black text-violet-900">Consultar</p>
                <p className="text-xs text-violet-700">Ver datos y descargar reportes. Sin cambios de inventario.</p>
              </button>
              <button
                onClick={() => {
                  setAccessMode('edit');
                }}
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100"
              >
                <p className="text-sm font-black text-amber-900">Editar</p>
                <p className="text-xs text-amber-800">Permite modificar inventario. La responsable recibirá notificación y quedará registro en bitácora.</p>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-violet-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              {showAccessSelector && (
                <>
                  <button onClick={() => setAccessMode('consult')} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${!isEditModeActive ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-100 bg-violet-50 text-violet-700'}`}>Consultar</button>
                  <button
                    onClick={() => {
                      setAccessMode('edit');
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${isEditModeActive ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                  >
                    Editar
                  </button>
                </>
              )}
              <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${isEditModeActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {isEditModeActive ? 'Modo edición activo' : 'Modo consulta'}
              </span>
            </div>
            {isEditModeActive && (
              <p className="mt-2 text-xs text-violet-700">
                Cada cambio notificará a la responsable de Huarte y quedará guardado en bitácora.
              </p>
            )}
          </section>

          <InventoryConnectionBanner
            label="Huarte"
            isOnline={huarteDB.isOnline}
            isSyncing={huarteDB.isSyncing}
            lastError={huarteDB.lastError}
            lastSyncedAt={huarteDB.lastSyncedAt}
            onRetry={huarteDB.reload}
          />

          <section className="rounded-2xl border border-violet-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {visibleTabKeys.includes('dashboard') && tabButton('dashboard', 'Dashboard', BarChart3)}
              {visibleTabKeys.includes('movimientos') && tabButton('movimientos', 'Movimientos', Plus)}
              {visibleTabKeys.includes('ensamblajes') && tabButton('ensamblajes', 'Ensamblajes', Boxes, unseenCanetAssemblies)}
              {visibleTabKeys.includes('maestros') && tabButton('maestros', 'Maestros', FolderTree)}
              {visibleTabKeys.includes('cierres') && tabButton('cierres', 'Cierres', Archive)}
            </div>
          </section>
        </>
      )}

      {accessReady && tab === 'dashboard' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-violet-200 bg-white p-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard title={`Stock total · ${HUARTE_BUILD_TAG}`} value={String(safeKpiStockTotal)} tone="violet" onClick={() => setStockTotalModalOpen(true)} />
              <KpiCard title="Movimientos (filtro)" value={String(dashboard.totalMovements)} tone="sky" onClick={() => setMovementTypesModalOpen(true)} />
              <KpiCard title="Lotes activos (stock>0)" value={String(dashboard.totalLots)} tone="emerald" onClick={() => setLotsActiveModalOpen(true)} />
            </div>
            <div className="mt-2 flex justify-end">
              <div className="flex items-center gap-2">
                <button onClick={exportExecutiveXlsx} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                  <FileSpreadsheet size={14} />
                  Excel gerencial
                </button>
                <button onClick={exportExecutivePdf} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
                  <Download size={14} />
                  PDF gerencial
                </button>
              </div>
            </div>
          </div>

          {isCompact && (
            <section className="rounded-2xl border border-violet-200 bg-white p-3">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                {visibleDashboardSections.includes('stock') && (
                  <DashSwitch label="Stock" active={dashboardSection === 'stock'} onClick={() => setDashboardSection('stock')} icon={<Boxes size={15} />} />
                )}
                {visibleDashboardSections.includes('control') && (
                  <DashSwitch label="Control lote" active={dashboardSection === 'control'} onClick={() => setDashboardSection('control')} icon={<Calculator size={15} />} />
                )}
                {visibleDashboardSections.includes('ventas_anual') && (
                  <DashSwitch label="Ventas anual" active={dashboardSection === 'ventas_anual'} onClick={() => setDashboardSection('ventas_anual')} icon={<BarChart3 size={15} />} />
                )}
                {visibleDashboardSections.includes('envios_mes') && (
                  <DashSwitch label="Envíos mes" active={dashboardSection === 'envios_mes'} onClick={() => setDashboardSection('envios_mes')} icon={<BarChart3 size={15} />} />
                )}
                {visibleDashboardSections.includes('ensam_anual') && (
                  <DashSwitch label="Ensamblajes anual" active={dashboardSection === 'ensam_anual'} onClick={() => setDashboardSection('ensam_anual')} icon={<BarChart3 size={15} />} />
                )}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-violet-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setShowMainFilters((s) => !s)} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100">
                {showMainFilters ? 'Ocultar filtros' : 'Filtros'}
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              {[selectedProducts.length > 0, lotFilter, warehouseFilter, typeFilter].some(Boolean) && (
                <button
                  onClick={() => {
                    setProductFilter('');
                    setSelectedProducts([]);
                    setLotFilter('');
                    setWarehouseFilter('');
                    setTypeFilter('');
                    setQuickSearch('');
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            {showMainFilters && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                <TagAutocompleteFilter label="Producto" inputValue={productFilter} onInputChange={setProductFilter} onSelect={addSelectedProduct} options={productOptions} />
                <AutocompleteFilter label="Lote" value={lotFilter} onChange={setLotFilter} options={lotOptions} />
                <AutocompleteFilter label="Bodega" value={warehouseFilter} onChange={setWarehouseFilter} options={warehouseOptions} />
                <AutocompleteFilter label="Tipo" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
                <TextFilter label="Búsqueda rápida" value={quickSearch} onChange={setQuickSearch} placeholder="producto, lote, factura..." />
              </div>
            )}
            {[selectedProducts.length > 0, lotFilter, warehouseFilter, typeFilter, quickSearch].some(Boolean) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedProducts.map((p) => (
                  <button key={`fp-${p}`} onClick={() => removeSelectedProduct(p)} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                    Producto: {p} ×
                  </button>
                ))}
                {lotFilter && (
                  <button onClick={() => setLotFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                    Lote: {lotFilter} ×
                  </button>
                )}
                {warehouseFilter && (
                  <button onClick={() => setWarehouseFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                    Bodega: {warehouseFilter} ×
                  </button>
                )}
                {typeFilter && (
                  <button onClick={() => setTypeFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                    Tipo: {typeFilter} ×
                  </button>
                )}
                {quickSearch && (
                  <button onClick={() => setQuickSearch('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                    Buscar: {quickSearch} ×
                  </button>
                )}
              </div>
            )}
          </section>

          {visibleDashboardSections.includes('stock') && (!isCompact || dashboardSection === 'stock') && (
            <Panel
              title={`Stock por producto/lote/bodega · ${HUARTE_BUILD_TAG}`}
              onDownloadExcel={() =>
                exportXlsx(
                  'Inventario Facturacion - Stock por Lote',
                  ['Producto', 'Lote', 'Bodega', 'Stock'],
                  visibleSafeControlByLot.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
                )
              }
              onDownload={() =>
                exportPdf(
                  'Inventario Facturacion - Stock por Lote',
                  ['Producto', 'Lote', 'Bodega', 'Stock'],
                  visibleSafeControlByLot.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
                )
              }
              actions={visibleSafeControlByLot.length > 6 ? <ToggleMore k="stock" showAllRows={showAllRows} setShowAllRows={setShowAllRows} /> : undefined}
            >
              <DataTable
                headers={['Producto', 'Lote', 'Bodega', 'Stock']}
                rows={limitRows('stock', visibleSafeControlByLot).map((r, idx) => [
                  <ProductPill key={`h-stock-${idx}-${r.producto}-${r.lote}`} code={r.producto} colorMap={productColorMap} />,
                  r.lote,
                  r.bodega,
                  r.stock,
                ])}
              />
              <StockVisual
                rows={stockVisualRows}
                colorMap={productColorMap}
                onSelectSegment={(bodega, qty) => setStockSectionSelected({ bodega, qty: Math.round(qty) })}
              />
              {stockSectionSelected && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800">
                  {stockSectionSelected.bodega}: {stockSectionSelected.qty}
                </div>
              )}
            </Panel>
          )}

          {visibleDashboardSections.includes('control') && (!isCompact || dashboardSection === 'control') && (
            <Panel
              title={`Control por lote · ${periodLabel}`}
              onDownloadExcel={() =>
                exportXlsx(
                  'Inventario Facturacion - Control por lote',
                  ['Producto', 'Lote', 'Bodega', 'Stock calculado'],
                  visibleSafeControlByLot.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
                )
              }
              onDownload={() =>
                exportPdf(
                  'Inventario Facturacion - Control por lote',
                  ['Producto', 'Lote', 'Bodega', 'Stock calculado'],
                  visibleSafeControlByLot.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
                )
              }
            >
              <DataTable
                headers={['Producto', 'Lote', 'Bodega', 'Stock calculado']}
                rows={visibleSafeControlByLot.map((r, idx) => [
                  <ProductPill key={`h-control-${idx}-${r.producto}-${r.lote}`} code={r.producto} colorMap={productColorMap} />,
                  r.lote,
                  r.bodega,
                  r.stock,
                ])}
              />
            </Panel>
          )}

          {visibleDashboardSections.includes('rect') && (!isCompact || dashboardSection === 'rect') && (
            <Panel
              title="Rectificativas recientes"
              onDownloadExcel={() =>
                exportXlsx(
                  'Inventario Facturacion - Rectificativas',
                  ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Factura/Doc'],
                  rectificativas.map((r) => [displayDate(r.fecha), r.tipo_movimiento, r.producto, r.lote, r.bodega, r.cantidad_signed || r.cantidad, r.factura_doc || '']),
                )
              }
              onDownload={() => exportPdf('Inventario Facturacion - Rectificativas', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Factura/Doc'], rectificativas.map((r) => [displayDate(r.fecha), r.tipo_movimiento, r.producto, r.lote, r.bodega, r.cantidad_signed || r.cantidad, r.factura_doc || '']))}
              actions={rectificativas.length > 6 ? <ToggleMore k="rect" showAllRows={showAllRows} setShowAllRows={setShowAllRows} /> : undefined}
            >
              <DataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Factura/Doc']} rows={limitRows('rect', rectificativas).map((r, idx) => [displayDate(r.fecha), r.tipo_movimiento, <ProductPill key={`h-rect-${idx}-${r.producto}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.cantidad_signed || r.cantidad, r.factura_doc || ''])} />
            </Panel>
          )}

          {visibleDashboardSections.includes('ventas_anual') && (!isCompact || dashboardSection === 'ventas_anual') && (
            <Panel
              title="Ventas anuales"
              onDownloadExcel={() => exportXlsx('Inventario Facturacion - Ventas anuales', ['Año', 'Cantidad'], ventasAnuales.map(([y, q]) => [y, q]))}
              onDownload={() => exportPdf('Inventario Facturacion - Ventas anuales', ['Año', 'Cantidad'], ventasAnuales.map(([y, q]) => [y, q]))}
            >
              <DataTable
                headers={['Año', 'Cantidad']}
                rows={limitRows('ventas_anual', ventasAnuales).map(([y, q]) => [y, q])}
                onRowClick={(rowIndex) => {
                  const row = limitRows('ventas_anual', ventasAnuales)[rowIndex];
                  if (row) setVentasYearDrill(row[0]);
                }}
              />
            </Panel>
          )}

          {visibleDashboardSections.includes('envios_mes') && (!isCompact || dashboardSection === 'envios_mes') && (
            <Panel
              title="Envíos mensuales"
              onDownloadExcel={() => exportXlsx('Inventario Facturacion - Envios mensuales', ['Mes', 'Cantidad'], enviosMensuales.map(([m, q]) => [monthLabel(m), q]))}
              onDownload={() => exportPdf('Inventario Facturacion - Envios mensuales', ['Mes', 'Cantidad'], enviosMensuales.map(([m, q]) => [monthLabel(m), q]))}
            >
              <DataTable
                headers={['Mes', 'Cantidad']}
                rows={limitRows('envios_mes', enviosMensuales).map(([m, q]) => [monthLabel(m), q])}
                onRowClick={(rowIndex) => {
                  const row = limitRows('envios_mes', enviosMensuales)[rowIndex];
                  if (row) setEnviosDrillMonth(row[0]);
                }}
              />
            </Panel>
          )}

          {visibleDashboardSections.includes('ensam_anual') && (!isCompact || dashboardSection === 'ensam_anual') && (
            <Panel
              title="Ensamblajes anuales"
              onDownloadExcel={() => exportXlsx('Inventario Facturacion - Ensamblajes anuales', ['Año', 'Cantidad'], ensamblajesAnuales.map(([y, q]) => [y, q]))}
              onDownload={() => exportPdf('Inventario Facturacion - Ensamblajes anuales', ['Año', 'Cantidad'], ensamblajesAnuales.map(([y, q]) => [y, q]))}
            >
              <DataTable
                headers={['Año', 'Cantidad']}
                rows={limitRows('ensam_anual', ensamblajesAnuales).map(([y, q]) => [y, q])}
                onRowClick={(rowIndex) => {
                  const row = limitRows('ensam_anual', ensamblajesAnuales)[rowIndex];
                  if (row) {
                    setEnsamYearDrill(row[0]);
                    setEnsamMonthDrill(null);
                  }
                }}
              />
            </Panel>
          )}
        </section>
      )}

      {accessReady && tab !== 'dashboard' && (
        <section className="rounded-2xl border border-violet-200 bg-white p-3">
          {(() => {
            const isMaestrosLotes = tab === 'maestros' && masterSection === 'lotes';
            return (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setShowMainFilters((s) => !s)} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100">
                    {showMainFilters ? 'Ocultar filtros' : 'Filtros'}
                  </button>
                  {[selectedProducts.length > 0, lotFilter, warehouseFilter, typeFilter].some(Boolean) && (
                    <button
                      onClick={() => {
                        setProductFilter('');
                        setSelectedProducts([]);
                        setLotFilter('');
                        setWarehouseFilter('');
                        setTypeFilter('');
                        setQuickSearch('');
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                {showMainFilters && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                    <TagAutocompleteFilter label="Producto" inputValue={productFilter} onInputChange={setProductFilter} onSelect={addSelectedProduct} options={productOptions} />
                    <AutocompleteFilter label="Lote" value={lotFilter} onChange={setLotFilter} options={lotOptions} />
                    {!isMaestrosLotes && (
                      <>
                        <AutocompleteFilter label="Bodega" value={warehouseFilter} onChange={setWarehouseFilter} options={warehouseOptions} />
                        <AutocompleteFilter label="Tipo" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
                      </>
                    )}
                    <TextFilter label="Búsqueda rápida" value={quickSearch} onChange={setQuickSearch} placeholder="producto, lote, factura..." />
                  </div>
                )}
                {[selectedProducts.length > 0, lotFilter, warehouseFilter, typeFilter, quickSearch].some(Boolean) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedProducts.map((p) => <button key={`pp-${p}`} onClick={() => removeSelectedProduct(p)} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Producto: {p} ×</button>)}
                    {lotFilter && <button onClick={() => setLotFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Lote: {lotFilter} ×</button>}
                    {!isMaestrosLotes && warehouseFilter && <button onClick={() => setWarehouseFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Bodega: {warehouseFilter} ×</button>}
                    {!isMaestrosLotes && typeFilter && <button onClick={() => setTypeFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Tipo: {typeFilter} ×</button>}
                    {quickSearch && <button onClick={() => setQuickSearch('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Buscar: {quickSearch} ×</button>}
                  </div>
                )}
              </>
            );
          })()}
        </section>
      )}

      {accessReady && tab === 'movimientos' && (
        <Panel
          title="Movimientos"
          onDownloadExcel={() =>
            exportXlsx(
              'Inventario Facturacion - Movimientos',
              ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Factura/Doc', 'Motivo', 'Fuente'],
              filteredMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed || m.cantidad, m.bodega, m.cliente || '', m.factura_doc || '', m.motivo || '', (m.source === 'canet' || m.source === 'canet_live') ? 'Inventario Canet' : m.source === 'canet_auto_in' ? 'Auto entrada Huarte' : 'Inventario/Facturación']),
            )
          }
          actions={
            <div className="flex items-center gap-2">
              <button onClick={() => exportXlsx('Inventario Facturacion - Movimientos', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Factura/Doc', 'Motivo', 'Fuente'], filteredMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed || m.cantidad, m.bodega, m.cliente || '', m.factura_doc || '', m.motivo || '', (m.source === 'canet' || m.source === 'canet_live') ? 'Inventario Canet' : m.source === 'canet_auto_in' ? 'Auto entrada Huarte' : 'Inventario/Facturación']))} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                <FileSpreadsheet size={14} />
                Descargar Excel
              </button>
              <button onClick={() => exportPdf('Inventario Facturacion - Movimientos', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Factura/Doc', 'Motivo', 'Fuente'], filteredMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed || m.cantidad, m.bodega, m.cliente || '', m.factura_doc || '', m.motivo || '', (m.source === 'canet' || m.source === 'canet_live') ? 'Inventario Canet' : m.source === 'canet_auto_in' ? 'Auto entrada Huarte' : 'Inventario/Facturación']))} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
                <Download size={14} />
                Descargar PDF
              </button>
              {filteredMovements.length > visibleMovementsLast7Days.length && (
                <ToggleMore k="movimientos" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
              )}
              {canEdit && (
                <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">
                  <Plus size={14} />
                  Nuevo movimiento
                </button>
              )}
            </div>
          }
        >
          <DataTable
            headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Factura/Doc', 'Motivo', 'Fuente', 'Últ. edición', 'Acciones']}
            rows={visibleMovementsLast7Days.map((m) => [
              displayDate(m.fecha),
              m.tipo_movimiento,
              <ProductPill key={`h-mov-${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />,
              m.lote,
              m.cantidad_signed || m.cantidad,
              m.bodega,
              m.cliente || '',
              m.factura_doc || '',
              m.motivo || '',
              (m.source === 'canet' || m.source === 'canet_live') ? 'Inventario Canet' : m.source === 'canet_auto_in' ? 'Auto entrada Huarte' : 'Inventario/Facturación',
              `${m.updated_by || '-'} ${m.updated_at ? `· ${new Date(m.updated_at).toLocaleDateString('es-ES')}` : ''}`,
              canEdit && canMutateMovement(m) ? (
                <div className="flex items-center gap-1" key={`a-${m.id}`}>
                  <button onClick={() => openEdit(m)} className="rounded-lg border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><Save size={13} /></button>
                  <button onClick={() => void deleteMovement(m.id)} className="rounded-lg border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"><Trash2 size={13} /></button>
                </div>
              ) : '-',
            ])}
          />
        </Panel>
      )}

      {accessReady && tab === 'rectificativas' && (
        <section className="space-y-3">
          <Panel
            title="Facturas rectificativas / notas de crédito"
            actions={
              canEdit ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => openCreateWithType('FACTURA RECTIFICATIVA')} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Nueva rectificativa</button>
                  <button onClick={() => openCreateWithType('NOTA CREDITO')} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Nueva nota crédito</button>
                </div>
              ) : undefined
            }
            onDownloadExcel={() => exportXlsx('Inventario Facturacion - Rectificativas detalle', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Factura/Doc', 'Responsable'], rectificativas.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.motivo || '', m.factura_doc || '', m.responsable || '']))}
            onDownload={() => exportPdf('Inventario Facturacion - Rectificativas detalle', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Factura/Doc', 'Responsable'], rectificativas.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.motivo || '', m.factura_doc || '', m.responsable || '']))}
          >
            <DataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Factura/Doc', 'Responsable', 'Últ. edición', 'Acciones']} rows={rectificativas.map((m) => [displayDate(m.fecha), m.tipo_movimiento, <ProductPill key={`h-r2-${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.motivo || '', m.factura_doc || '', m.responsable || '', `${m.updated_by || '-'} ${m.updated_at ? `· ${new Date(m.updated_at).toLocaleDateString('es-ES')}` : ''}`, canEdit && canMutateMovement(m) ? <div key={`rr-${m.id}`} className="flex items-center gap-1"><button onClick={() => openEdit(m)} className="rounded-lg border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><Save size={13} /></button><button onClick={() => void deleteMovement(m.id)} className="rounded-lg border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"><Trash2 size={13} /></button></div> : '-'])} />
          </Panel>
          <Panel
            title="Auditoría de rectificativas"
            onDownloadExcel={() => exportXlsx('Inventario Facturacion - Audit rectificativas', ['Fecha', 'Tipo', 'Factura', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Responsable'], rectAudit.map((r) => [r.fecha, r.tipo, r.factura, r.producto, r.lote, r.bodega, r.cantidad, r.motivo, r.responsable]))}
            onDownload={() => exportPdf('Inventario Facturacion - Audit rectificativas', ['Fecha', 'Tipo', 'Factura', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Responsable'], rectAudit.map((r) => [r.fecha, r.tipo, r.factura, r.producto, r.lote, r.bodega, r.cantidad, r.motivo, r.responsable]))}
          >
            <DataTable headers={['Fecha', 'Tipo', 'Factura', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Responsable']} rows={rectAudit.map((r, idx) => [r.fecha, r.tipo, r.factura, <ProductPill key={`h-ra-${idx}-${r.producto}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.cantidad, r.motivo, r.responsable])} />
          </Panel>
        </section>
      )}

      {accessReady && tab === 'ensamblajes' && (
        <section className="space-y-3">
          <Panel
            title="Ensamblajes registrados por movimiento"
            actions={canEdit ? <button onClick={() => openCreateWithType('ensamblaje_esp')} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Nuevo ensamblaje</button> : undefined}
            onDownloadExcel={() => exportXlsx('Inventario Facturacion - Ensamblajes', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Fuente'], ensamblajesMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.source || '']))}
            onDownload={() => exportPdf('Inventario Facturacion - Ensamblajes', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Fuente'], ensamblajesMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.source || '']))}
          >
            <DataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Fuente', 'Acciones']} rows={ensamblajesMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, <ProductPill key={`h-ens-${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />, m.lote, m.bodega, m.cantidad_signed || m.cantidad, (m.source === 'canet' || m.source === 'canet_live') ? 'Inventario Canet' : 'Inventario/Facturación', canEdit && canMutateMovement(m) ? <div key={`ee-${m.id}`} className="flex items-center gap-1"><button onClick={() => openEdit(m)} className="rounded-lg border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><Save size={13} /></button><button onClick={() => void deleteMovement(m.id)} className="rounded-lg border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"><Trash2 size={13} /></button></div> : '-'])} />
          </Panel>

          <Panel title="Archivos de ensamblaje importados (fase 0)">
            <DataTable headers={['Archivo', 'Tipo', 'Total hojas', 'Hojas detectadas']} rows={ensamblajesArchivos.map((a) => [clean(a.archivo), clean(a.tipo), clean(a.total_hojas), Array.isArray(a.hojas) ? a.hojas.join(', ') : ''])} />
          </Panel>
        </section>
      )}

      {accessReady && tab === 'cierres' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Cierres congelados</p>
                <h3 className="text-lg font-black text-slate-950">Cierres de mes Huarte</h3>
                <p className="text-sm text-slate-600">
                  Aquí puedes revisar qué meses están cerrados. Si un cierre quedó guardado en el mes equivocado, muévelo al mes correcto o elimínalo.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {huarteMonthlyClosures.length} cierres
              </span>
            </div>
            {!canEdit && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                Entra en modo edición para mover o eliminar cierres. En modo consulta solo puedes revisarlos y descargar Excel.
              </div>
            )}
          </div>

          <DataTable
            headers={['Mes cerrado', 'Guardado', 'Responsable', 'Stock', 'Lotes', 'Bodegas', 'Mover a', 'Acciones']}
            rows={[...huarteMonthlyClosures].reverse().map((snapshot) => [
              <span key={`${snapshot.id}-period`} className="font-black capitalize text-slate-950">{snapshot.monthLabel}</span>,
              new Date(snapshot.closedAt).toLocaleString('es-ES'),
              snapshot.closedBy || '-',
              snapshot.totalStock.toLocaleString('es-ES'),
              snapshot.lotCount.toLocaleString('es-ES'),
              snapshot.warehouseCount.toLocaleString('es-ES'),
              <input
                key={`${snapshot.id}-month`}
                type="month"
                value={snapshot.monthKey}
                disabled={!canEdit}
                onChange={(event) => void moveMonthlyCloseToMonth(snapshot, event.target.value)}
                className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />,
              <div key={`${snapshot.id}-actions`} className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadMonthlyCloseSnapshotExcel(snapshot)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                >
                  <FileSpreadsheet size={13} />
                  Excel
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => void deleteMonthlyCloseSnapshot(snapshot)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Trash2 size={13} />
                  Eliminar
                </button>
              </div>,
            ])}
          />
        </section>
      )}

      {accessReady && tab === 'maestros' && (
        <section className="space-y-3">
          <section className="rounded-2xl border border-violet-200 bg-white p-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <DashSwitch label="Productos" active={masterSection === 'productos'} onClick={() => setMasterSection('productos')} icon={<Boxes size={15} />} />
              <DashSwitch label="Lotes" active={masterSection === 'lotes'} onClick={() => setMasterSection('lotes')} icon={<FolderTree size={15} />} />
              <DashSwitch label="Bodegas" active={masterSection === 'bodegas'} onClick={() => setMasterSection('bodegas')} icon={<Calculator size={15} />} />
              <DashSwitch label="Tipos" active={masterSection === 'tipos'} onClick={() => setMasterSection('tipos')} icon={<FileWarning size={15} />} />
              <DashSwitch label="Clientes" active={masterSection === 'clientes'} onClick={() => setMasterSection('clientes')} icon={<BarChart3 size={15} />} />
              <DashSwitch label="Bitácora" active={masterSection === 'bitacora'} onClick={() => setMasterSection('bitacora')} icon={<FileSpreadsheet size={15} />} />
            </div>
          </section>

          {masterSection === 'productos' && (
            <Panel
              title="Productos"
              actions={
                canEdit ? (
                  <div className="flex items-center gap-2">
                    <button onClick={openProductCreateModal} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">
                      Nuevo producto
                    </button>
                  </div>
                ) : undefined
              }
            >
              <DataTable
                headers={['Producto', 'Tipo', 'Modo', 'Receta', 'Activo', 'Acciones']}
                rows={limitRows('maestros_productos', productos.filter((p) => clean(p.producto).toLowerCase() !== 'producto' && !isRetiredProductCode(p.producto))).map((p, idx) => [
                  <ProductPill key={`h-pm-${idx}-${clean(p.producto)}`} code={clean(p.producto)} colorMap={productColorMap} />,
                  clean(p.tipo_producto) || '-',
                  clean(p.modo_stock) || '-',
                  formatKitComponentsInline((p as any).kit_componentes || (p as any).componentes_kit),
                  clean(p.activo_si_no || 'SI'),
                  canEdit ? (
                    <button key={`h-prod-edit-${idx}`} onClick={() => openProductEditModal(p)} className="rounded-lg border border-violet-200 p-1 text-violet-700 hover:bg-violet-50">
                      <Pencil size={13} />
                    </button>
                  ) : '-',
                ])}
              />
              {productos.filter((p) => clean(p.producto).toLowerCase() !== 'producto' && !isRetiredProductCode(p.producto)).length > 6 && (
                <div className="mt-2">
                  <ToggleMore k="maestros_productos" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
                </div>
              )}
            </Panel>
          )}

          {masterSection === 'lotes' && (
            <Panel
              title="Lotes"
              actions={
                canEdit ? (
                  <div className="grid grid-cols-5 gap-1">
                    <input value={newLote.producto} onChange={(e) => setNewLote((s) => ({ ...s, producto: e.target.value.toUpperCase() }))} placeholder="Producto" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <input value={newLote.lote} onChange={(e) => setNewLote((s) => ({ ...s, lote: e.target.value.toUpperCase() }))} placeholder="Lote" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <input value={newLote.bodega} onChange={(e) => setNewLote((s) => ({ ...s, bodega: e.target.value.toUpperCase() }))} placeholder="Bodega" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <select value={newLote.estado} onChange={(e) => setNewLote((s) => ({ ...s, estado: e.target.value }))} className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold">
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="AGOTADO">AGOTADO</option>
                    </select>
                    <button onClick={createLote} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Agregar</button>
                  </div>
                ) : undefined
              }
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-violet-200 bg-violet-50 p-1">
                  <button
                    onClick={() => setLotViewMode('active')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      lotViewMode === 'active' ? 'bg-violet-600 text-white shadow-sm' : 'text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    Activos ({activeLotes.length})
                  </button>
                  <button
                    onClick={() => setLotViewMode('archived')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      lotViewMode === 'archived' ? 'bg-violet-600 text-white shadow-sm' : 'text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    Archivados / agotados ({archivedLotes.length})
                  </button>
                </div>
              </div>
              <DataTable
                headers={lotViewMode === 'archived' ? ['Producto', 'Lote', 'Estado', 'Fecha alta', 'Archivado', 'Acciones'] : ['Producto', 'Lote', 'Estado', 'Fecha alta', 'Acciones']}
                rows={limitRows('maestros_lotes', masterLotesRows).map((l, idx) => {
                  const isArchived = lotViewMode === 'archived';
                  const archivedMeta = archivedLotEntryByKey.get(`${clean(l.producto)}|${clean(l.lote)}`);
                  const stateCell = isArchived ? (
                    <div key={`h-lote-state-${idx}`} className="flex items-center gap-1">
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">ARCHIVADO</span>
                      {normalizeLotState(l.estado) === 'AGOTADO' && (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">AGOTADO</span>
                      )}
                    </div>
                  ) : (
                    <span
                      key={`h-lote-state-${idx}`}
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${normalizeLotState(l.estado) === 'AGOTADO' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}
                    >
                      {normalizeLotState(l.estado)}
                    </span>
                  );
                  const actionsCell = canEdit ? (
                    isArchived ? (
                      <button
                        key={`h-lot-restore-${idx}`}
                        onClick={() => restoreLot(l)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        <span className="inline-flex items-center gap-1">
                          <RotateCcw size={12} />
                          Restaurar / activar
                        </span>
                      </button>
                    ) : (
                      <div key={`h-lot-actions-${idx}`} className="flex items-center gap-1">
                        <button
                          onClick={() => toggleLotState(l)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {normalizeLotState(l.estado) === 'AGOTADO' ? 'Activar' : 'Agotar'}
                        </button>
                        <button
                          onClick={() => archiveLot(l)}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Archive size={12} />
                            Archivar
                          </span>
                        </button>
                      </div>
                    )
                  ) : (
                    '-'
                  );
                  return isArchived
                    ? [
                        <ProductPill key={`h-lm-${idx}-${clean(l.producto)}-${clean(l.lote)}`} code={clean(l.producto)} colorMap={productColorMap} />,
                        clean(l.lote),
                        stateCell,
                        clean((l as any).fechaAlta || ''),
                        archivedMeta?.archivedAt ? displayDate(archivedMeta.archivedAt) : '-',
                        actionsCell,
                      ]
                    : [
                        <ProductPill key={`h-lm-${idx}-${clean(l.producto)}-${clean(l.lote)}`} code={clean(l.producto)} colorMap={productColorMap} />,
                        clean(l.lote),
                        stateCell,
                        clean((l as any).fechaAlta || ''),
                        actionsCell,
                      ];
                })}
              />
              {masterLotesRows.length > 6 && (
                <div className="mt-2">
                  <ToggleMore k="maestros_lotes" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
                </div>
              )}
            </Panel>
          )}

          {masterSection === 'bodegas' && (
            <Panel
              title="Bodegas"
              actions={
                canEdit ? (
                  <div className="flex items-center gap-2">
                    <input value={newBodega.bodega} onChange={(e) => setNewBodega((s) => ({ ...s, bodega: e.target.value.toUpperCase() }))} placeholder="Nueva bodega" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <select value={newBodega.activo_si_no} onChange={(e) => setNewBodega((s) => ({ ...s, activo_si_no: e.target.value }))} className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold">
                      <option value="SI">Activa</option>
                      <option value="NO">Inactiva</option>
                    </select>
                    <button onClick={createBodega} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Agregar</button>
                  </div>
                ) : undefined
              }
            >
              <DataTable
                headers={['Bodega', 'Activo', 'Acciones']}
                rows={limitRows('maestros_bodegas', activeBodegas).map((b, idx) => [
                  clean(b.bodega),
                  clean(b.activo_si_no || 'SI'),
                  <div key={`bodega-actions-${idx}`} className="flex items-center gap-1">
                    <button onClick={() => editBodega(b.bodega)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200" title="Editar bodega">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteBodega(b.bodega)} className="rounded-lg bg-rose-100 p-1.5 text-rose-700 hover:bg-rose-200" title="Eliminar bodega">
                      <Trash2 size={13} />
                    </button>
                  </div>,
                ])}
              />
              {activeBodegas.length > 6 && (
                <div className="mt-2">
                  <ToggleMore k="maestros_bodegas" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
                </div>
              )}
            </Panel>
          )}

          {masterSection === 'tipos' && (
            <Panel
              title="Tipos de movimiento"
              actions={
                canEdit ? (
                  <div className="flex items-center gap-2">
                    <input value={newTipo} onChange={(e) => setNewTipo(e.target.value)} placeholder="Nuevo tipo" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <button onClick={createTipo} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Agregar</button>
                  </div>
                ) : undefined
              }
            >
              <DataTable headers={['Tipo', 'Afecta stock']} rows={limitRows('maestros_tipos', tipos).map((t) => [clean(t.tipo_movimiento), clean(t.afecta_stock_si_no || 'SI')])} />
              {tipos.length > 6 && (
                <div className="mt-2">
                  <ToggleMore k="maestros_tipos" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
                </div>
              )}
            </Panel>
          )}

          {masterSection === 'clientes' && (
            <Panel
              title="Clientes"
              actions={
                canEdit ? (
                  <div className="flex items-center gap-2">
                    <input value={newCliente} onChange={(e) => setNewCliente(e.target.value)} placeholder="Nuevo cliente" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <button onClick={createCliente} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Agregar</button>
                  </div>
                ) : undefined
              }
            >
              <DataTable
                headers={['Cliente', 'Acciones']}
                rows={limitRows('maestros_clientes', activeClientes).map((c, idx) => [
                  clean(c.cliente),
                  <div key={`client-actions-${idx}`} className="flex items-center gap-1">
                    <button onClick={() => editCliente(c.cliente)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200" title="Editar cliente">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteCliente(c.cliente)} className="rounded-lg bg-rose-100 p-1.5 text-rose-700 hover:bg-rose-200" title="Eliminar cliente">
                      <Trash2 size={13} />
                    </button>
                  </div>,
                ])}
              />
              {activeClientes.length > 6 && (
                <div className="mt-2">
                  <ToggleMore k="maestros_clientes" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
                </div>
              )}
            </Panel>
          )}

          {masterSection === 'bitacora' && (
            <Panel title="Bitácora de cambios">
              <DataTable
                headers={['Fecha/hora', 'Usuario', 'Acción', 'Detalle']}
                rows={limitRows('maestros_bitacora', auditLog).map((entry) => [
                  entry.at ? new Date(entry.at).toLocaleString('es-ES') : '-',
                  entry.userName || entry.userId || '-',
                  entry.action || '-',
                  entry.details || '-',
                ])}
              />
              {auditLog.length > 6 && (
                <div className="mt-2">
                  <ToggleMore k="maestros_bitacora" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
                </div>
              )}
            </Panel>
          )}
        </section>
      )}

      {textEditDialog && (
        <TextEditModal dialog={textEditDialog} onClose={() => setTextEditDialog(null)} />
      )}

      {productModalOpen && (
        <div className="app-modal-overlay" onClick={closeProductModal}>
          <div className="app-modal-panel w-full max-w-2xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">{editingProductCode ? 'Editar producto' : 'Añadir producto'}</h3>
              <button onClick={closeProductModal} className="rounded-full border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><X size={16} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Siglas producto</span>
                <input
                  value={newProductForm.producto}
                  disabled={!!editingProductCode}
                  onChange={(e) => setNewProductForm({ ...newProductForm, producto: e.target.value })}
                  className={`w-full rounded-lg border px-2 py-2 text-sm font-semibold ${editingProductCode ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-violet-200 text-violet-900'}`}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Tipo de producto</span>
                <select value={newProductForm.tipo_producto} onChange={(e) => setNewProductForm({ ...newProductForm, tipo_producto: e.target.value })} className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900">
                  <option value="COMPLEMENTO ALIMENTICIO">COMPLEMENTO ALIMENTICIO</option>
                  <option value="CARTONAJE">CARTONAJE</option>
                  <option value="KIT">KIT</option>
                </select>
              </label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-5">
              <Input label="Stock mínimo" value={newProductForm.stock_min} onChange={(v) => setNewProductForm({ ...newProductForm, stock_min: v })} />
              <Input label="Stock óptimo" value={newProductForm.stock_optimo} onChange={(v) => setNewProductForm({ ...newProductForm, stock_optimo: v })} />
              <Input label="Consumo mes" type="number" value={newProductForm.consumo_mensual_cajas} onChange={(v) => setNewProductForm({ ...newProductForm, consumo_mensual_cajas: v })} />
              <label className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Modo</span>
                <select
                  value={newProductForm.modo_stock}
                  onChange={(e) => {
                    const nextMode = e.target.value;
                    setNewProductForm({
                      ...newProductForm,
                      modo_stock: nextMode,
                      tipo_producto: nextMode === 'KIT' ? 'KIT' : newProductForm.tipo_producto,
                    });
                  }}
                  className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900"
                >
                  <option value="ENSAMBLAJE">ENSAMBLAJE</option>
                  <option value="DIRECTO">DIRECTO</option>
                  <option value="KIT">KIT</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Activo</span>
                <select value={newProductForm.activo_si_no} onChange={(e) => setNewProductForm({ ...newProductForm, activo_si_no: e.target.value })} className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900">
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </label>
            </div>
            {clean(newProductForm.modo_stock).toUpperCase() === 'KIT' && (
              <div className="mt-2">
                <ProductKitComposer
                  value={newProductForm.kit_componentes_text}
                  onChange={(nextValue) => setNewProductForm({ ...newProductForm, kit_componentes_text: nextValue })}
                  productOptions={productOptions.filter((option) => option !== clean(newProductForm.producto).toUpperCase())}
                />
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={createProducto} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                {editingProductCode ? <Pencil size={14} /> : <Plus size={14} />}
                {editingProductCode ? 'Guardar cambios' : 'Guardar producto'}
              </button>
              <button onClick={closeProductModal} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {stockTotalModalOpen && (
        <SimpleModal title="Stock total por producto" onClose={() => setStockTotalModalOpen(false)}>
          <DataTable headers={['Producto', 'Stock total']} rows={stockByProductTotals.map((r) => [r.producto, Math.round(r.total)])} />
        </SimpleModal>
      )}

      {movementTypesModalOpen && (
        <SimpleModal title="Resumen por tipo de movimiento" onClose={() => setMovementTypesModalOpen(false)}>
          <DataTable headers={['Tipo de movimiento', 'Cantidad']} rows={movementTypeSummary.map((r) => [r.tipo, r.total])} />
        </SimpleModal>
      )}

      {rectByProductModalOpen && (
        <SimpleModal title="Rectificativas por producto" onClose={() => setRectByProductModalOpen(false)}>
          <DataTable headers={['Producto', 'Rectificativas']} rows={rectByProductSummary.map((r) => [r.producto, r.total])} />
        </SimpleModal>
      )}

      {lotsActiveModalOpen && (
        <SimpleModal title="Lotes activos por producto" onClose={() => setLotsActiveModalOpen(false)}>
          <DataTable headers={['Producto', 'Lotes activos']} rows={activeLotsByProduct.map((r) => [r.producto, r.lots])} />
        </SimpleModal>
      )}

      {ventasYearDrill && (
        <SimpleModal title={`Ventas · ${ventasYearDrill}`} onClose={() => setVentasYearDrill(null)}>
          <DataTable headers={['Mes', 'Cantidad vendida']} rows={ventasMonthsForYear(ventasYearDrill).map(([m, q]) => [monthLabel(m), q])} />
        </SimpleModal>
      )}

      {enviosDrillMonth && (
        <SimpleModal title={`Envíos · ${monthLabel(enviosDrillMonth)}`} onClose={() => setEnviosDrillMonth(null)}>
          <DataTable headers={['Producto', 'Lote', 'Cantidad enviada']} rows={enviosByProductLotForMonth(enviosDrillMonth).map((r) => [r.producto, r.lote, r.cantidad])} />
        </SimpleModal>
      )}

      {ensamYearDrill && (
        <SimpleModal title={`Ensamblajes · ${ensamYearDrill}`} onClose={() => { setEnsamYearDrill(null); setEnsamMonthDrill(null); }}>
          <div className="mb-3 flex flex-wrap gap-2">
            {ensamMonthsForYear(ensamYearDrill).map((m) => (
              <button
                key={m}
                onClick={() => setEnsamMonthDrill(m)}
                className={`rounded-lg border px-2 py-1 text-xs font-bold ${ensamMonthDrill === m ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'}`}
              >
                {monthLabel(m)}
              </button>
            ))}
          </div>
          {ensamMonthDrill ? (
            <DataTable headers={['Producto', 'Lote', 'Cantidad ensamblada']} rows={ensamByProductLotForMonth(ensamMonthDrill).map((r) => [r.producto, r.lote, r.cantidad])} />
          ) : (
            <div className="rounded-xl border border-dashed border-violet-200 p-4 text-sm text-violet-700">Selecciona un mes para ver el detalle por producto/lote.</div>
          )}
        </SimpleModal>
      )}

      {modalOpen && (
        <div className="app-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="app-modal-panel movement-modal-panel flex flex-col rounded-2xl border border-violet-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-lg font-black text-violet-950">{editingId ? 'Editar movimiento' : 'Nuevo movimiento'}</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-full border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><X size={16} /></button>
            </div>
            <div className="movement-modal-body grid grid-cols-2 gap-2 px-4 py-3">
              <Input label="Fecha" type="date" value={form.fecha} onChange={(v) => setForm((s) => ({ ...s, fecha: v }))} />
              <AutocompleteInput label="Tipo movimiento" value={form.tipo_movimiento} onChange={(v) => {
                setForm((s) => ({ ...s, tipo_movimiento: v }));
                setFormKitLots({});
              }} options={typeOptions} />
              {(editingId || formIsKit) && (
                <AutocompleteInput label={normalizeSearch(form.tipo_movimiento).includes('traspaso') ? 'Origen' : 'Bodega'} value={form.bodega} onChange={(v) => {
                  setForm((s) => ({ ...s, bodega: v.toUpperCase() }));
                  setFormKitLots({});
                }} options={transferWarehouseOptions} />
              )}
              {editingId ? (
                <>
                  <ProductColorSelect
                    label="Producto"
                    value={form.producto}
                    onChange={(v) => {
                      const nextProduct = v.toUpperCase();
                      if (clean(form.producto) !== clean(nextProduct)) setFormKitLots({});
                      setForm((s) => (clean(s.producto) === clean(nextProduct) ? { ...s, producto: nextProduct } : { ...s, producto: nextProduct, lote: '' }));
                    }}
                    options={productOptions}
                    colorMap={productColorMap}
                  />
                  <Input label="Cantidad" value={form.cantidad} onChange={(v) => setForm((s) => ({ ...s, cantidad: v }))} />
                  <AutocompleteInput label="Lote" value={form.lote} onChange={(v) => setForm((s) => ({ ...s, lote: v.toUpperCase() }))} options={modalLotOptions} />
                </>
              ) : (
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-600">Líneas del movimiento</p>
                    <button
                      type="button"
                      disabled={savingMovement || movementLines.length >= MAX_MOVEMENT_DRAFT_LINES || formIsKit}
                      onClick={addMovementDraftLine}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-black ${
                        savingMovement || movementLines.length >= MAX_MOVEMENT_DRAFT_LINES || formIsKit
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-teal-600 text-white hover:bg-teal-700'
                      }`}
                    >
                      <Plus size={13} /> Añadir línea
                    </button>
                  </div>
                  <div className="grid gap-1.5">
                    {movementLines.map((line, index) => {
                      const isFirstKitLine = formIsKit && index === 0;
                      const lineIsTransfer = normalizeSearch(form.tipo_movimiento).includes('traspaso');
                      return (
                        <div
                          key={line.id}
                          className={`movement-line-compact grid gap-1.5 rounded-md border border-slate-200 bg-white p-1.5 ${
                            lineIsTransfer
                              ? 'md:grid-cols-[0.9fr_0.9fr_1.15fr_1fr_0.65fr_34px]'
                              : 'md:grid-cols-[0.95fr_1.15fr_1fr_0.65fr_34px]'
                          }`}
                        >
                          <AutocompleteInput
                            label={lineIsTransfer ? 'Origen' : `Bodega ${index + 1}`}
                            value={line.bodega || form.bodega}
                            onChange={(v) => updateMovementDraftLine(line.id, { bodega: v.toUpperCase(), lote: '' })}
                            options={transferWarehouseOptions}
                            emptyMessage="Selecciona una bodega de Canet o Huarte."
                          />
                          {lineIsTransfer && (
                            <AutocompleteInput
                              label="Destino"
                              value={line.destino || ''}
                              onChange={(v) => updateMovementDraftLine(line.id, { destino: v.toUpperCase() })}
                              options={transferWarehouseOptions}
                              emptyMessage="Selecciona una bodega destino de Canet o Huarte."
                            />
                          )}
                          <ProductColorSelect
                            label={`Producto ${index + 1}`}
                            value={line.producto}
                            onChange={(v) => updateMovementDraftLine(line.id, { producto: v.toUpperCase(), lote: '' })}
                            options={productOptions}
                            colorMap={productColorMap}
                          />
                          {isFirstKitLine ? (
                            <div className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px] font-bold text-violet-700">
                              Kit: selecciona lotes por componente abajo.
                            </div>
                          ) : (
                            <AutocompleteInput
                              label="Lote"
                              value={line.lote}
                              onChange={(v) => updateMovementDraftLine(line.id, { lote: v.toUpperCase() })}
                              options={getLotOptionsForMovementLine(line)}
                              emptyMessage="Sin lotes activos con stock para este producto/bodega."
                            />
                          )}
                          <Input label="Cantidad" value={line.cantidad} onChange={(v) => updateMovementDraftLine(line.id, { cantidad: v })} />
                          <div className="flex items-end">
                            <button
                              type="button"
                              disabled={savingMovement || movementLines.length <= 1}
                              onClick={() => removeMovementDraftLine(line.id)}
                              className={`h-8 w-8 rounded-md ${
                                savingMovement || movementLines.length <= 1
                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                              }`}
                              title="Quitar línea"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {formIsKit && (
                    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wider text-violet-700">
                        Lotes de componentes del kit
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {formKitComponents.map((component, index) => {
                          const product = clean(component.producto).toUpperCase();
                          const key = formKitComponentKey(component, index);
                          const unitQty = Math.max(0, toNum(component.cantidad));
                          const totalQty = unitQty * Math.abs(toNum(form.cantidad));
                          return (
                            <AutocompleteInput
                              key={key}
                              label={`Lote ${product}`}
                              value={formKitLots[key] || ''}
                              onChange={(v) => setFormKitLots((prev) => ({ ...prev, [key]: v.toUpperCase() }))}
                              options={formKitLotOptionsByProduct.get(product) || []}
                              emptyMessage={`Sin lotes activos con stock para ${product} en esta bodega.`}
                              helperText={
                                totalQty > 0
                                  ? `Descontará ${totalQty.toLocaleString('es-ES')} caja(s)`
                                  : `${unitQty.toLocaleString('es-ES')} caja(s) por kit`
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {normalizeSearch(form.tipo_movimiento).includes('traspaso') ? (
                (editingId || formIsKit) && (
                <AutocompleteInput
                  label="Destino"
                  value={form.destino || form.cliente}
                  onChange={(v) => setForm((s) => ({ ...s, destino: v.toUpperCase(), cliente: v.toUpperCase() }))}
                  options={transferWarehouseOptions}
                  emptyMessage="Selecciona una bodega destino de Canet o Huarte."
                />
                )
              ) : (
                <>
                  <AutocompleteInput label="Cliente" value={form.cliente} onChange={(v) => setForm((s) => ({ ...s, cliente: v }))} options={clientOptions} />
                  <Input label="Destino" value={form.destino} onChange={(v) => setForm((s) => ({ ...s, destino: v }))} />
                </>
              )}
              <Input label="Factura/Doc" value={form.factura_doc} onChange={(v) => setForm((s) => ({ ...s, factura_doc: v }))} />
              <Input label="Responsable" value={form.responsable} onChange={(v) => setForm((s) => ({ ...s, responsable: v }))} />
              <Input label="Motivo" value={form.motivo} onChange={(v) => setForm((s) => ({ ...s, motivo: v }))} />
              <Input label="Notas" value={form.notas} onChange={(v) => setForm((s) => ({ ...s, notas: v }))} />
            </div>
            <div className="flex shrink-0 justify-end border-t border-slate-200 bg-white px-4 py-3">
              <button
                onClick={() => void saveMovement()}
                disabled={savingMovement}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white ${savingMovement ? 'bg-violet-300 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'}`}
              >
                <Save size={14} />
                {savingMovement ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  tone = 'violet',
  onClick,
}: {
  title: string;
  value: string;
  tone?: 'violet' | 'sky' | 'amber' | 'emerald';
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    violet: 'border-violet-200 bg-violet-50/60 text-violet-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
  return (
    <button onClick={onClick} className={`w-full rounded-2xl border p-3 text-left transition ${tones[tone]} ${onClick ? 'hover:shadow-sm' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-2xl font-black text-violet-950">{value}</p>
    </button>
  );
}

function ProductPill({ code, colorMap }: { code: string; colorMap: Map<string, string> }) {
  const color = colorMap.get(code) || '#7c3aed';
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: `${color}22`, color }}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {code || '-'}
    </span>
  );
}

function ToggleMore({ k, showAllRows, setShowAllRows }: { k: string; showAllRows: Record<string, boolean>; setShowAllRows: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  return (
    <button onClick={() => setShowAllRows((s) => ({ ...s, [k]: !s[k] }))} className="text-xs font-bold text-violet-700 underline">
      {showAllRows[k] ? 'Mostrar menos' : 'Mostrar más'}
    </button>
  );
}

function Panel({
  title,
  children,
  actions,
  onDownload,
  onDownloadExcel,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onDownload?: () => void;
  onDownloadExcel?: () => void;
}) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-3 adaptive-surface">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-violet-950 adaptive-text-strong">{title}</h2>
        <div className="flex items-center gap-2">
          {onDownloadExcel && (
            <button onClick={onDownloadExcel} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
              <FileSpreadsheet size={14} />
              Descargar Excel
            </button>
          )}
          {onDownload && (
            <button onClick={onDownload} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
              <Download size={14} />
              Descargar PDF
            </button>
          )}
          {actions}
        </div>
      </div>
      {children}
    </section>
  );
}

function StockVisual({
  rows,
  colorMap: productColorMap,
  onSelectSegment,
}: {
  rows: Array<{ producto: string; lote: string; total: number; byBodega: Record<string, number> }>;
  colorMap: Map<string, string>;
  onSelectSegment?: (bodega: string, qty: number) => void;
}) {
  const bodegaColors = ['#4f46e5', '#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#84cc16'];
  const bodegas = Array.from(
    new Set(
      rows
        .flatMap((r) => Object.keys(r.byBodega))
        .filter(Boolean),
    ),
  ).sort();
  const bodegaColorMap = new Map<string, string>();
  bodegas.forEach((b, idx) => bodegaColorMap.set(b, bodegaColors[idx % bodegaColors.length]));
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const totalVisualizado = rows.reduce((acc, r) => acc + Math.max(0, toNum(r.total)), 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-violet-700 adaptive-text-muted">Vista visual de stock (top lotes)</h4>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={`${row.producto}|${row.lote}`} className="grid grid-cols-[120px_1fr_52px] items-center gap-2">
            <div className="truncate text-[11px] font-bold text-violet-900">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: productColorMap.get(row.producto) || '#7c3aed' }} />
                {row.producto}
              </span>{' '}
              <span className="text-violet-600">· {row.lote}</span>
            </div>
            <div className="h-6 overflow-hidden rounded-md border border-violet-100 bg-white">
              <div className="flex h-full">
                {Object.entries(row.byBodega)
                  .filter(([, qty]) => qty > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([bodega, qty]) => (
                    <div
                      key={`${row.producto}|${row.lote}|${bodega}`}
                      title={`${bodega}: ${Math.round(qty)}`}
                      onClick={() => onSelectSegment?.(bodega, qty)}
                      className="h-full cursor-pointer transition-opacity hover:opacity-80"
                      style={{
                        width: `${Math.max(2, (qty / maxTotal) * 100)}%`,
                        backgroundColor: bodegaColorMap.get(bodega) || '#4f46e5',
                      }}
                    />
                  ))}
              </div>
            </div>
            <div className="text-right text-[11px] font-black text-violet-900">{Math.round(row.total)}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-violet-700 adaptive-text-muted">Total visualizado: {Math.round(totalVisualizado).toLocaleString('es-ES')}</p>
        <p className="text-[10px] font-semibold text-violet-600 adaptive-text-muted">Haz clic en un color para ver la bodega y cantidad.</p>
      </div>
    </div>
  );
}

function DashSwitch({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition-all ${active ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50'}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DataTable({
  headers,
  rows,
  onRowClick,
}: {
  headers: string[];
  rows: Array<Array<any>>;
  onRowClick?: (rowIndex: number) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-violet-100">
      <table className="min-w-full text-xs">
        <thead className="bg-violet-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-2 text-left font-bold text-violet-700">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="px-2 py-6 text-center text-gray-500">Sin datos para este filtro.</td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(i) : undefined}
              className={`border-t border-violet-100 ${onRowClick ? 'cursor-pointer hover:bg-violet-50/70' : ''}`}
            >
              {row.map((cell, j) => (
                <td key={`${i}-${j}`} className="align-top px-2 py-2 text-gray-800">{cell as any}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="app-modal-overlay" onClick={onClose}>
      <div className="app-modal-panel w-full max-w-2xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-violet-950">{title}</h3>
          <button onClick={onClose} className="rounded-full border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TextEditModal({
  dialog,
  onClose,
}: {
  dialog: TextEditDialogPayload | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog?.value || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dialog) return;
    setValue(dialog.value);
    setSaving(false);
  }, [dialog?.title, dialog?.value]);

  if (!dialog) return null;

  const close = () => {
    if (saving) return;
    onClose();
  };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dialog.onConfirm(value);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SimpleModal title={dialog.title} onClose={close}>
      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
          Nuevo valor
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
          />
        </label>
        <div className="flex items-center justify-end gap-2">
          <button
            disabled={saving}
            onClick={close}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
              saving
                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'border-violet-200 bg-violet-50 text-violet-700'
            }`}
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={() => void confirm()}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white ${
              saving ? 'bg-violet-300 cursor-wait' : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {saving ? 'Guardando...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </SimpleModal>
  );
}

function AutocompleteFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false);
  const filtered = options
    .filter((opt) => suggestionMatches(opt, value))
    .sort((a, b) => rankSuggestion(a, value) - rankSuggestion(b, value) || clean(a).localeCompare(clean(b)))
    .slice(0, 8);
  return (
    <label className="space-y-1 relative">
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="Escribe para filtrar..."
        className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-violet-200 bg-white shadow-lg">
          {filtered.map((opt) => (
            <button key={`${label}-${opt}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(opt); setOpen(false); }} className="block w-full px-2 py-2 text-left text-xs font-semibold text-violet-900 hover:bg-violet-50">
              {opt}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function TextFilter({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="space-y-1 relative">
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Buscar...'}
        className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900"
      />
    </label>
  );
}

function TagAutocompleteFilter({
  label,
  inputValue,
  onInputChange,
  onSelect,
  options,
}: {
  label: string;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSelect: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = options
    .filter((opt) => suggestionMatches(opt, inputValue))
    .sort((a, b) => rankSuggestion(a, inputValue) - rankSuggestion(b, inputValue) || clean(a).localeCompare(clean(b)))
    .slice(0, 8);
  return (
    <label className="space-y-1 relative">
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{label}</span>
      <input
        value={inputValue}
        onChange={(e) => {
          onInputChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSelect(inputValue);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="Escribe y selecciona..."
        className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-violet-200 bg-white shadow-lg">
          {filtered.map((opt) => (
            <button key={`${label}-${opt}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(opt); setOpen(false); }} className="block w-full px-2 py-2 text-left text-xs font-semibold text-violet-900 hover:bg-violet-50">
              {opt}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function AutocompleteInput({
  label,
  value,
  onChange,
  options,
  emptyMessage = 'Sin opciones disponibles.',
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  emptyMessage?: string;
  helperText?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = options
    .filter((opt) => suggestionMatches(opt, value))
    .sort((a, b) => rankSuggestion(a, value) - rankSuggestion(b, value) || clean(a).localeCompare(clean(b)))
    .slice(0, 8);
  return (
    <label className="space-y-1 relative">
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900"
      />
      {helperText && <span className="block text-[11px] font-semibold normal-case tracking-normal text-violet-500">{helperText}</span>}
      {open && (
        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-violet-200 bg-white shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((opt) => (
              <button key={`${label}-${opt}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(opt); setOpen(false); }} className="block w-full px-2 py-2 text-left text-xs font-semibold text-violet-900 hover:bg-violet-50">
                {opt}
              </button>
            ))
          ) : (
            <div className="px-2 py-3 text-left text-xs font-semibold normal-case tracking-normal text-slate-500">
              {emptyMessage}
            </div>
          )}
        </div>
      )}
    </label>
  );
}

function ProductColorSelect({
  label,
  value,
  onChange,
  options,
  colorMap,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  colorMap: Map<string, string>;
}) {
  const selectedColor = colorMap.get(value) || '#7c3aed';
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold outline-none"
        style={{ color: selectedColor }}
      >
        <option value="" style={{ color: '#6b7280' }}>Selecciona producto</option>
        {options.map((option) => (
          <option key={option} value={option} style={{ color: colorMap.get(option) || '#7c3aed' }}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{label}</span>
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900" />
    </label>
  );
}
