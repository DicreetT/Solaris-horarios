import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import seed from '../data/inventory_seed.json';
import { AlertTriangle, Archive, ArrowDownCircle, BarChart3, Building2, ClipboardList, Download, Layers3, Package, Pencil, Plus, RotateCcw, Save, Tags, Trash2, Users, Wrench, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import InventoryConnectionBanner from '../components/inventory/InventoryConnectionBanner';
import ProductKitComposer from '../components/inventory/ProductKitComposer';
import { CARLOS_EMAIL, USERS } from '../constants';
import { openPrintablePdfReport } from '../utils/pdfReport';
import {
  CANET_MASTER_WAREHOUSES,
  CANET_STOCK_WAREHOUSES,
  HUARTE_STOCK_WAREHOUSES,
  buildMissingTransferEntryMovements,
  calculateInventoryStockSnapshot,
  isInventoryTransferInType,
  isInventoryTransferOutType,
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
import { formatKitComponents, formatKitComponentsInline, isRetiredProductCode, normalizeKitComponents, parseKitComponentsText, upsertProductCatalogRow } from '../utils/productCatalog';
import { openTableXlsx } from '../utils/tableExport';
import { describeConnectionError } from '../utils/connectionErrors';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { useDensityMode } from '../hooks/useDensityMode';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { useInventoryMovementsDB } from '../hooks/useInventoryMovementsDB';
import huarteSeed from '../data/inventory_facturacion_seed.json';

type InventoryTab = 'dashboard' | 'control_stock' | 'movimientos' | 'ensamblajes' | 'maestros' | 'cierres' | 'auditoria';
type CanetMasterKey = 'cartonaje' | 'productos' | 'lotes' | 'bodegas' | 'clientes' | 'tipos' | 'bitacora';
type InventoryAccessMode = 'unset' | 'consult' | 'edit';
type HypotheticalScope = 'potential' | 'canet_huarte' | 'canet';

type InventoryAuditEntry = {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
};

type InventoryAuditFinding = {
  severity: 'crítico' | 'revisar' | 'info';
  category: string;
  period: string;
  product: string;
  lot: string;
  warehouse: string;
  detail: string;
};

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
  notas?: string;
  afecta_stock?: string;
  signo?: number;
  cantidad_signed?: number;
  created_at?: string;
  updated_at?: string;
  updated_by?: string;
  source?: string;
  origin_canet_id?: number;
  origin_huarte_id?: number;
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
type LotAssemblyFinalizationEntry = {
  id: string;
  producto: string;
  lote: string;
  ensamblaje_finalizado: 'SI' | 'NO';
  updatedAt: string;
  updatedBy?: string;
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
type TextEditDialogPayload = {
  title: string;
  value: string;
  confirmLabel: string;
  onConfirm: (nextValue: string) => void | Promise<void>;
};

const CANET_LOT_REFERENCE_ROWS: GenericRow[] = [
  ...((((huarteSeed as any) || {}).lotes || []) as GenericRow[]),
  ...((((huarteSeed as any) || {}).movimientos || []) as GenericRow[]),
  ...((((seed as any) || {}).lotes || []) as GenericRow[]),
];

const clean = (v: any) => (v == null ? '' : String(v).trim());
const rowTimestampMs = (row: GenericRow) => {
  const candidates = [
    clean((row as any).updatedAt),
    clean((row as any).updated_at),
    clean((row as any).lastChangedAt),
    clean((row as any).createdAt),
    clean((row as any).created_at),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};
const normalizeLotState = (v: any) => (clean(v).toUpperCase() === 'AGOTADO' ? 'AGOTADO' : 'ACTIVO');
const normalizeSearch = (v: any) =>
  clean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const normalizeLotToken = (v: any) => clean(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
// Compatibilidad histórica: algunos registros viejos llegaron con "O" en vez de "0" (ej: O30).
const normalizeLotCompareToken = (v: any) => normalizeLotToken(v).replace(/O/g, '0');
const isInvalidLegacyLot = (producto: any, lote: any) =>
  clean(producto).toUpperCase() === 'KL' && normalizeLotToken(lote) === 'O30';
const isShortLegacyLotAlias = (lote: any) => {
  const token = normalizeLotCompareToken(lote);
  return token.length > 0 && token.length <= 4;
};
const hasLongerLotAlias = (candidates: string[], lote: any) => {
  const token = normalizeLotCompareToken(lote);
  if (!token || !isShortLegacyLotAlias(lote)) return false;
  return candidates.some((candidate) => {
    const candidateToken = normalizeLotCompareToken(candidate);
    return candidateToken.length > token.length && candidateToken.endsWith(token);
  });
};
const FORCED_AGOTADO_LOTS = new Set<string>();
// Correcciones puntuales validadas con inventario real para evitar que una caché vieja
// siga mostrando cantidades desactualizadas en el potencial.
const LOT_VIALES_CORRECTIONS = new Map<string, number>([
  ['ENT|2507A19', 95075],
  ['ENT|2511A20', 100730],
]);
const INVENTORY_CANET_LOT_FINALIZATIONS_KEY = 'inventory_canet_lot_finalizations_v1';
const INVENTORY_LOT_ARCHIVES_KEY = 'inventory_canet_lot_archives_v1';
const lotKeyOf = (producto: any, lote: any) =>
  `${clean(producto).toUpperCase()}|${normalizeLotCompareToken(lote)}`;
const isForcedAgotadoLot = (producto: any, lote: any) => FORCED_AGOTADO_LOTS.has(lotKeyOf(producto, lote));
const effectiveLotState = (producto: any, lote: any, estadoRaw: any) =>
  isForcedAgotadoLot(producto, lote) ? 'AGOTADO' : normalizeLotState(estadoRaw);
const normalizeEnsamblajeFinalizado = (v: any) => {
  const token = clean(v).toUpperCase();
  return token === 'SI' || token === 'TRUE' || token === '1' || token === 'FINALIZADO' ? 'SI' : 'NO';
};
const lotAssemblyFinalizedAtMs = (row: GenericRow) => {
  const candidates = [
    clean((row as any).ensamblaje_finalizado_at),
    clean((row as any).ensamblajeFinalizadoAt),
    clean((row as any).assemblyFinalizedAt),
    clean((row as any).lastChangedAt),
    clean((row as any).updated_at),
    clean((row as any).updatedAt),
    clean((row as any).created_at),
    clean((row as any).createdAt),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};
const mergeLotState = (current: 'ACTIVO' | 'AGOTADO' | undefined, incoming: 'ACTIVO' | 'AGOTADO') => {
  // Si hay registros duplicados del mismo lote, prevalece ACTIVO para no bloquear stock/potencial por un duplicado AGOTADO.
  if (current === 'ACTIVO' || incoming === 'ACTIVO') return 'ACTIVO';
  return 'AGOTADO';
};
const mergeLotAssemblyFinalized = (current: 'SI' | 'NO' | undefined, incoming: 'SI' | 'NO') => {
  if (current === 'SI' || incoming === 'SI') return 'SI';
  return 'NO';
};
const buildLotStateMap = (rows: GenericRow[]) => {
  const map = new Map<string, 'ACTIVO' | 'AGOTADO'>();
  const canonicalRows = dedupeCanonicalCanetLots(rows);
  for (const row of canonicalRows) {
    const producto = clean(row.producto);
    const lote = clean(row.lote);
    if (!producto || !lote) continue;
    const key = lotKeyOf(producto, lote);
    const incoming = effectiveLotState(producto, lote, row.estado);
    map.set(key, mergeLotState(map.get(key), incoming));
  }
  return map;
};
const buildLotAssemblyFinalizedMap = (rows: GenericRow[]) => {
  const map = new Map<string, 'SI' | 'NO'>();
  // Usar lotes canónicos deduplicados evita arrastrar "SI" stale de aliases viejos
  // (ej: A35 vs 2601A35) que terminaban forzando potencial=0 sin corresponder.
  const canonicalRows = dedupeCanonicalCanetLots(rows);
  for (const row of canonicalRows) {
    const producto = clean(row.producto);
    const lote = clean(row.lote);
    if (!producto || !lote) continue;
    const key = lotKeyOf(producto, lote);
    const incoming = normalizeEnsamblajeFinalizado((row as any).ensamblaje_finalizado);
    map.set(key, incoming);
  }
  return map;
};
const buildLotAssemblyFinalizedMapFromEntries = (
  rows: GenericRow[],
  entries: LotAssemblyFinalizationEntry[] = [],
) => {
  const map = buildLotAssemblyFinalizedMap(rows);
  const latestByKey = new Map<string, LotAssemblyFinalizationEntry>();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const producto = clean(entry?.producto);
    const lote = clean(entry?.lote);
    if (!producto || !lote) continue;
    const key = lotKeyOf(producto, lote);
    const prev = latestByKey.get(key);
    if (!prev) {
      latestByKey.set(key, entry);
      continue;
    }
    const prevTs = new Date(String(prev.updatedAt || '')).getTime();
    const nextTs = new Date(String(entry.updatedAt || '')).getTime();
    if (!Number.isFinite(prevTs) || nextTs >= prevTs) {
      latestByKey.set(key, entry);
    }
  }
  for (const [key, entry] of latestByKey.entries()) {
    map.set(key, normalizeEnsamblajeFinalizado(entry.ensamblaje_finalizado));
  }
  return map;
};
const mergeProductRows = (base: GenericRow, incoming: GenericRow) => {
  const baseTs = rowTimestampMs(base);
  const incomingTs = rowTimestampMs(incoming);
  const preferIncoming = incomingTs > baseTs;
  const merged = preferIncoming ? { ...base, ...incoming } : { ...incoming, ...base };
  if (clean((incoming as any)?.producto) || clean((base as any)?.producto)) {
    (merged as any).producto = clean((incoming as any)?.producto || (base as any)?.producto).toUpperCase();
  }
  return merged;
};
const mergeProductsPayload = (remotePayload: any, localPayload: any) => {
  if (!Array.isArray(remotePayload)) return localPayload;
  if (!Array.isArray(localPayload)) return remotePayload;

  const byKey = new Map<string, GenericRow>();
  const remoteOrder: string[] = [];
  const upsert = (row: GenericRow, fromRemote: boolean) => {
    if (!row || typeof row !== 'object') return;
    const producto = clean(row.producto).toUpperCase();
    if (!producto) return;
    const normalizedIncoming: GenericRow = { ...row, producto };
    if (fromRemote && !remoteOrder.includes(producto)) remoteOrder.push(producto);
    const prev = byKey.get(producto);
    if (!prev) {
      byKey.set(producto, normalizedIncoming);
      return;
    }
    byKey.set(producto, mergeProductRows(prev, normalizedIncoming));
  };

  remotePayload.forEach((row: GenericRow) => upsert(row, true));
  localPayload.forEach((row: GenericRow) => upsert(row, false));

  const localOrder = localPayload
    .filter((row: GenericRow) => row && typeof row === 'object')
    .map((row: GenericRow) => clean(row.producto).toUpperCase())
    .filter(Boolean);
  const finalOrder = Array.from(new Set([...remoteOrder, ...localOrder]));

  return finalOrder
    .map((key) => byKey.get(key))
    .filter((row): row is GenericRow => !!row);
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

  return finalOrder
    .map((key) => byKey.get(key))
    .filter((row): row is GenericRow => !!row);
};
const canonicalLotForProduct = (loteRows: GenericRow[], productoRaw: string, loteRaw: string) => {
  const producto = clean(productoRaw);
  const lote = clean(loteRaw);
  if (!producto || !lote) return lote;
  const token = normalizeLotCompareToken(lote);
  if (!token) return lote;
  const productLots = Array.from(
    new Set(
      [...loteRows, ...CANET_LOT_REFERENCE_ROWS]
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
  const inverseMatches = pickBest(productLots.filter((candidate) => token.endsWith(normalizeLotCompareToken(candidate))));
  if (inverseMatches) return inverseMatches;
  return lote;
};
const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const normalizeVialesDigits = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';

  if (/^\d+$/.test(raw)) {
    return raw.replace(/^0+(?=\d)/, '');
  }

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    return raw
      .split(',')[0]
      .replace(/\./g, '')
      .replace(/[^\d]/g, '')
      .replace(/^0+(?=\d)/, '');
  }

  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
    return raw
      .split('.')[0]
      .replace(/,/g, '')
      .replace(/[^\d]/g, '')
      .replace(/^0+(?=\d)/, '');
  }

  if (/^-?\d+[.,]\d+$/.test(raw)) {
    const numeric = Number(raw.replace(',', '.'));
    if (Number.isFinite(numeric) && numeric >= 0) {
      return String(Math.round(numeric));
    }
  }

  const onlyDigits = raw.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  return onlyDigits;
};
const formatVialesForInput = (value: unknown) => {
  const digits = normalizeVialesDigits(value);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
const toVialesNum = (value: unknown) => {
  const digits = normalizeVialesDigits(value);
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
};
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const TRANSFER_NODE_OPTIONS = Array.from(new Set([...CANET_STOCK_WAREHOUSES, ...HUARTE_STOCK_WAREHOUSES]));
const NON_TRANSFER_WAREHOUSE_OPTIONS = new Set(['ENSAMBLAJE ESPAÑA', 'MI MEDICO']);
const TRANSFER_PAIR_PREFIX = 'TRANSFER_PAIR:';
const SELLABLE_STOCK_WAREHOUSES = ['CANET', 'HUARTE', 'MAS BORRAS'];
const SELLABLE_STOCK_WAREHOUSE_SET = new Set(SELLABLE_STOCK_WAREHOUSES);
const CANET_OWN_WAREHOUSE_ORDER = CANET_STOCK_WAREHOUSES;
const CANET_MASTER_WAREHOUSE_ORDER = CANET_MASTER_WAREHOUSES;
const CANET_OWN_WAREHOUSES = new Set(CANET_OWN_WAREHOUSE_ORDER);
const CANET_MASTER_WAREHOUSE_SET = new Set(CANET_MASTER_WAREHOUSE_ORDER);
const HUARTE_OWN_WAREHOUSES = new Set(HUARTE_STOCK_WAREHOUSES);
const normalizeWarehouseAlias = (v: any) => normalizeInventoryWarehouse(v);
const isSelectableTransferWarehouse = (value: unknown) => {
  const warehouse = normalizeWarehouseAlias(value);
  return !!warehouse && !NON_TRANSFER_WAREHOUSE_OPTIONS.has(warehouse);
};
const makeTransferPairId = () => `${TRANSFER_PAIR_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const normalizeCanetMasterWarehouseInput = (value: unknown) => {
  const normalized = normalizeWarehouseAlias(value);
  return CANET_MASTER_WAREHOUSE_SET.has(normalized) ? normalized : '';
};
const describeDbError = (error: unknown) => {
  return describeConnectionError(error, 'No se pudo guardar cambios en base de datos.');
};
const getCurrentMonthKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const isValidHexColor = (v: string) => /^#([0-9a-fA-F]{6})$/.test(v);
const contains = (a: string, b: string) => clean(a).toLowerCase().includes(clean(b).toLowerCase());

const dateFromAny = (v: string | number): Date | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const dd = Number(slash[1]);
    const mm = Number(slash[2]);
    const yy = Number(slash[3]);
    const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Support numeric Excel serial dates
  if (/^[0-9.]+$/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n) && n > 40000) { // Safety check for plausible dates
      const d = new Date((n - 25569) * 86400 * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
};
const formatDateForDisplay = (v: string | number) => {
  const d = dateFromAny(v);
  if (!d) return clean(v) || '-';
  return d.toLocaleDateString('es-ES');
};
const normalizeDateForInput = (v: string | number) => {
  const d = dateFromAny(v);
  if (!d) return clean(v);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const recordTimestampMs = (row: GenericRow) => {
  const candidates = [
    clean((row as any).updated_at),
    clean((row as any).updatedAt),
    clean((row as any).lastChangedAt),
    clean((row as any).created_at),
    clean((row as any).createdAt),
    clean((row as any).fecha_alta),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};

const lotDeletedAtMs = (row: GenericRow) => {
  const candidates = [
    clean((row as any).deletedAt),
    clean((row as any).deleted_at),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};

const isLotDeleted = (row: GenericRow) => lotDeletedAtMs(row) > 0;
const lotArchivedAtMs = (row: GenericRow) => {
  const candidates = [
    clean((row as any).archivedAt),
    clean((row as any).archived_at),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};
const lotRestoredAtMs = (row: GenericRow) => {
  const candidates = [
    clean((row as any).restoredAt),
    clean((row as any).restored_at),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};
const isArchivedLotEntryActive = (row: GenericRow) => {
  const archivedAt = lotArchivedAtMs(row);
  if (archivedAt <= 0) return false;
  return archivedAt > lotRestoredAtMs(row);
};

const lotMergeKey = (row: GenericRow) => lotKeyOf(clean(row.producto), clean(row.lote));

const hasMeaningfulValue = (value: unknown) => {
  if (value == null) return false;
  if (typeof value === 'string') return clean(value).length > 0;
  return true;
};

const lotSpecificityScore = (loteRaw: string) => {
  const lote = clean(loteRaw);
  const token = normalizeLotCompareToken(lote);
  if (!token) return -1;
  let score = token.length * 10;
  if (/^\d+[A-Z]/.test(token)) score += 1000;
  if (/^\d{6,}$/.test(token)) score += 900;
  if (/[A-Z]/.test(token)) score += 100;
  if (/^\d{1,4}$/.test(token)) score -= 200;
  if (/^[A-Z]/.test(token)) score -= 200;
  if (/^[.\-]/.test(lote)) score -= 300;
  return score;
};

const mergeLotRows = (prev: GenericRow, normalizedIncoming: GenericRow) => {
  const producto = clean(normalizedIncoming.producto || prev.producto);
  const lote = clean(normalizedIncoming.lote || prev.lote);
  const prevTs = recordTimestampMs(prev);
  const nextTs = recordTimestampMs(normalizedIncoming);
  const preferIncoming = nextTs > prevTs;
  const merged = preferIncoming
    ? { ...prev, ...normalizedIncoming }
    : { ...normalizedIncoming, ...prev };
  const prevLotLabel = clean((prev as any).lote);
  const incomingLotLabel = clean((normalizedIncoming as any).lote);
  const prevSpecificity = lotSpecificityScore(prevLotLabel);
  const incomingSpecificity = lotSpecificityScore(incomingLotLabel);
  const incomingMoreSpecific = incomingSpecificity > prevSpecificity;
  const incomingNotLessSpecific = incomingSpecificity >= prevSpecificity;
  merged.lote = incomingMoreSpecific ? incomingLotLabel : prevLotLabel || incomingLotLabel;

  // Nunca degradar viales por una variante corta/ruidosa: conserva el mayor valor disponible.
  const prevViales = toVialesNum((prev as any).viales_recibidos);
  const incomingViales = toVialesNum((normalizedIncoming as any).viales_recibidos);
  if (incomingViales > prevViales) {
    merged.viales_recibidos = (normalizedIncoming as any).viales_recibidos;
  } else if (prevViales > incomingViales) {
    merged.viales_recibidos = (prev as any).viales_recibidos;
  }

  // Conserva campos no vacíos para evitar "resets" por payloads incompletos.
  const keepRichField = (field: string) => {
    if (!hasMeaningfulValue((merged as any)[field]) && hasMeaningfulValue((prev as any)[field])) {
      (merged as any)[field] = (prev as any)[field];
    }
  };
  keepRichField('viales_recibidos');
  keepRichField('fecha_caducidad');
  keepRichField('semaforo_caducidad');
  keepRichField('fecha_alta');
  keepRichField('bodega');

  // Estado de lote: si el cambio viene más nuevo y explícito, respétalo; si no, conserva previo.
  const prevState = effectiveLotState(producto, lote, prev.estado);
  const incomingHasState = clean((normalizedIncoming as any).estado).length > 0;
  const incomingState = effectiveLotState(producto, lote, (normalizedIncoming as any).estado);
  if (((nextTs > prevTs && incomingNotLessSpecific) || incomingMoreSpecific) && incomingHasState) {
    merged.estado = incomingState;
  } else if (!clean((prev as any).estado) && incomingHasState) {
    merged.estado = incomingState;
  } else {
    merged.estado = prevState;
  }

  // Ensamblaje finalizado: mismo criterio (no revertir por escrituras viejas/incompletas).
  const prevAsm = normalizeEnsamblajeFinalizado((prev as any).ensamblaje_finalizado);
  const incomingAsmRaw = clean((normalizedIncoming as any).ensamblaje_finalizado);
  const incomingAsm = normalizeEnsamblajeFinalizado((normalizedIncoming as any).ensamblaje_finalizado);
  const prevAsmAt = lotAssemblyFinalizedAtMs(prev);
  const incomingAsmAt = lotAssemblyFinalizedAtMs(normalizedIncoming);
  if (incomingAsmRaw) {
    const keepIncomingAsm = incomingAsmAt > 0 && incomingAsmAt >= prevAsmAt;
    if (keepIncomingAsm) {
      merged.ensamblaje_finalizado = incomingAsm;
      const incomingAsmStamp =
        clean((normalizedIncoming as any).ensamblaje_finalizado_at) ||
        clean((normalizedIncoming as any).ensamblajeFinalizadoAt) ||
        clean((normalizedIncoming as any).assemblyFinalizedAt) ||
        clean((normalizedIncoming as any).lastChangedAt) ||
        clean((normalizedIncoming as any).updated_at) ||
        clean((normalizedIncoming as any).created_at);
      if (incomingAsmStamp) {
        (merged as any).ensamblaje_finalizado_at = incomingAsmStamp;
      }
    } else if (!clean((prev as any).ensamblaje_finalizado) && incomingAsmRaw) {
      merged.ensamblaje_finalizado = incomingAsm;
    } else {
      merged.ensamblaje_finalizado = prevAsm;
    }
  } else {
    merged.ensamblaje_finalizado = prevAsm;
  }
  const prevAsmStamp = clean((prev as any).ensamblaje_finalizado_at || (prev as any).ensamblajeFinalizadoAt || (prev as any).assemblyFinalizedAt);
  const incomingAsmStamp = clean((normalizedIncoming as any).ensamblaje_finalizado_at || (normalizedIncoming as any).ensamblajeFinalizadoAt || (normalizedIncoming as any).assemblyFinalizedAt);
  if (incomingAsmStamp && (!prevAsmStamp || incomingAsmAt >= prevAsmAt)) {
    (merged as any).ensamblaje_finalizado_at = incomingAsmStamp;
  } else if (prevAsmStamp) {
    (merged as any).ensamblaje_finalizado_at = prevAsmStamp;
  } else if (merged.ensamblaje_finalizado === 'SI') {
    (merged as any).ensamblaje_finalizado_at = clean(
      (normalizedIncoming as any).lastChangedAt ||
      (normalizedIncoming as any).updated_at ||
      (normalizedIncoming as any).created_at ||
      (prev as any).lastChangedAt ||
      (prev as any).updated_at ||
      (prev as any).created_at,
    );
  } else {
    delete (merged as any).ensamblaje_finalizado_at;
    delete (merged as any).ensamblajeFinalizadoAt;
    delete (merged as any).assemblyFinalizedAt;
  }

  // Borrado persistente ("tombstone"): evita que clientes stale resuciten lotes eliminados.
  const prevDeletedTs = lotDeletedAtMs(prev);
  const incomingDeletedTs = lotDeletedAtMs(normalizedIncoming);
  const latestDeletionTs = Math.max(prevDeletedTs, incomingDeletedTs);
  const latestLiveTs = Math.max(prevDeletedTs > 0 ? 0 : prevTs, incomingDeletedTs > 0 ? 0 : nextTs);
  if (latestDeletionTs > 0 && latestDeletionTs >= latestLiveTs) {
    const keepIncomingDeletion = incomingDeletedTs >= prevDeletedTs;
    const deletedAt = keepIncomingDeletion
      ? clean((normalizedIncoming as any).deletedAt || (normalizedIncoming as any).deleted_at)
      : clean((prev as any).deletedAt || (prev as any).deleted_at);
    if (deletedAt) {
      (merged as any).deletedAt = deletedAt;
      (merged as any).deleted_at = deletedAt;
    }
    const deletedBy = keepIncomingDeletion
      ? clean((normalizedIncoming as any).deletedBy || (normalizedIncoming as any).deleted_by)
      : clean((prev as any).deletedBy || (prev as any).deleted_by);
    if (deletedBy) {
      (merged as any).deletedBy = deletedBy;
      (merged as any).deleted_by = deletedBy;
    }
  } else {
    delete (merged as any).deletedAt;
    delete (merged as any).deleted_at;
    delete (merged as any).deletedBy;
    delete (merged as any).deleted_by;
  }

  return merged;
};

const dedupeCanonicalCanetLots = (rows: GenericRow[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  type LotEntry = { row: GenericRow; producto: string; lote: string; token: string };
  const entriesByProduct = new Map<string, LotEntry[]>();
  const referenceRows = [...rows, ...CANET_LOT_REFERENCE_ROWS];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const producto = clean(row.producto);
    const lote = canonicalLotForProduct(referenceRows, producto, clean(row.lote));
    if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
    const token = normalizeLotCompareToken(lote);
    if (!token) continue;
    const list = entriesByProduct.get(producto) || [];
    list.push({ row: { ...row, producto, lote }, producto, lote, token });
    entriesByProduct.set(producto, list);
  }

  const byCanonicalKey = new Map<string, GenericRow>();
  const orderedKeys: string[] = [];

  for (const [producto, pool] of entriesByProduct.entries()) {
    for (const entry of pool) {
      const canonicalKey = `${producto}|${entry.token}`;
      const normalizedIncoming: GenericRow = {
        ...entry.row,
        producto,
        lote: entry.lote,
      };

      if (!orderedKeys.includes(canonicalKey)) orderedKeys.push(canonicalKey);

      const prev = byCanonicalKey.get(canonicalKey);
      if (!prev) {
        byCanonicalKey.set(canonicalKey, normalizedIncoming);
        continue;
      }

      const preferredLabel =
        lotSpecificityScore(clean((prev as any).lote)) >= lotSpecificityScore(entry.lote)
          ? clean((prev as any).lote)
          : entry.lote;
      const merged = mergeLotRows(prev, normalizedIncoming);
      merged.lote = preferredLabel || entry.lote;
      byCanonicalKey.set(canonicalKey, merged);
    }
  }

  return orderedKeys
    .map((key) => byCanonicalKey.get(key))
    .filter((row): row is GenericRow => !!row);
};

const mergeCanetLotesPayload = (remotePayload: any, localPayload: any) => {
  if (!Array.isArray(localPayload)) return localPayload;
  if (!Array.isArray(remotePayload)) return localPayload;

  const byKey = new Map<string, GenericRow>();
  const remoteOrder: string[] = [];

  const upsert = (row: GenericRow, fromRemote: boolean) => {
    if (!row || typeof row !== 'object') return;
    const producto = clean(row.producto);
    const lote = clean(row.lote);
    if (!producto || !lote) return;
    if (isInvalidLegacyLot(producto, lote)) return;

    const key = lotMergeKey(row);
    const normalizedIncoming: GenericRow = {
      ...row,
      producto,
      lote,
    };

    if (fromRemote && !remoteOrder.includes(key)) remoteOrder.push(key);

    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, normalizedIncoming);
      return;
    }
    byKey.set(key, mergeLotRows(prev, normalizedIncoming));
  };

  remotePayload.forEach((row: GenericRow) => upsert(row, true));
  localPayload.forEach((row: GenericRow) => upsert(row, false));

  const localOrder = localPayload
    .filter((row: GenericRow) => row && typeof row === 'object')
    .map((row: GenericRow) => lotMergeKey(row));
  const finalOrder = Array.from(new Set([...localOrder, ...remoteOrder]));

  const mergedRows = finalOrder
    .map((key) => byKey.get(key))
    .filter((row): row is GenericRow => !!row);

  return dedupeCanonicalCanetLots(mergedRows);
};

const nowIso = () => new Date().toISOString();

const stampLotRow = (row: GenericRow) => ({ ...row, lastChangedAt: nowIso() });
const stampDeletedLotRow = (row: GenericRow, actorName?: string) => {
  const ts = nowIso();
  return {
    ...row,
    deletedAt: ts,
    deleted_at: ts,
    deletedBy: actorName || clean((row as any).deletedBy),
    deleted_by: actorName || clean((row as any).deleted_by),
    lastChangedAt: ts,
  };
};
const clearDeletedLotFields = (row: GenericRow): GenericRow => {
  const next = { ...row };
  delete (next as any).deletedAt;
  delete (next as any).deleted_at;
  delete (next as any).deletedBy;
  delete (next as any).deleted_by;
  return next;
};

const monthKeyFromDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};
type DateFilterMode = 'day' | 'range' | 'month' | 'year' | 'all';
const dateInputValue = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
const monthStartInputValue = (monthKey: string) => `${monthKey || getCurrentMonthKey()}-01`;
const monthEndDateFromKey = (key: string) => {
  if (!key) return null;
  const [yy, mm] = key.split('-').map(Number);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return new Date(yy, mm, 0, 23, 59, 59, 999);
};
const monthEndInputValue = (key: string) => {
  const end = monthEndDateFromKey(key);
  return end ? dateInputValue(end) : monthStartInputValue(key);
};
const dateStartFromInput = (value: string) => {
  const d = dateFromAny(value);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
};
const dateEndFromInput = (value: string) => {
  const d = dateFromAny(value);
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
const movementDateMs = (fecha: string) => {
  const d = dateFromAny(clean(fecha));
  return d ? d.getTime() : 0;
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
  // ES format: 1.234,56
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  // EN format: 1,234.56
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Plain decimal
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

const openTablePdf = (title: string, fileName: string, headers: string[], rows: Array<Array<string | number>>) => {
  openPrintablePdfReport({
    title,
    fileName,
    headers,
    rows: appendTotalRow(headers, rows),
    subtitle: `Generado: ${new Date().toLocaleString('es-ES')}`,
  });
};

const openTableExcel = (title: string, fileName: string, headers: string[], rows: Array<Array<string | number>>, subtitle?: string, summaryRows?: Array<[string, string | number]>) => {
  openTableXlsx({
    title,
    fileName,
    headers,
    rows,
    subtitle: subtitle || `Generado: ${new Date().toLocaleString('es-ES')}`,
    sheetName: title,
    summaryRows,
  });
};

const takeRows = <T,>(rows: T[], showAll: boolean) => (showAll ? rows : rows.slice(0, 5));

const MONTH_DAYS = 30;
const INVENTORY_AUDIT_KEY = 'inventory_audit_v1';
const INVENTORY_ALERTS_KEY = 'inventory_alerts_summary_v1';
const INVENTORY_STOCK_CONTROL_SNAPSHOT_KEY = 'inventory_stock_control_snapshot_v1';
const INVENTORY_CANET_MOVS_KEY = 'inventory_canet_movimientos_v1';
const INVENTORY_HUARTE_MOVS_KEY = 'invhf_movimientos_v1';
const STORAGE_HUARTE_VISUAL_STOCK_BY_LOT = 'inventory_huarte_visual_stock_by_lot_v2';
const CANET_MOVEMENT_SYNC_START = '2026-02-23';
const INVENTORY_PRODUCT_COLORS: Record<string, string> = {
  SV: '#83b06f',
  ENT: '#76a5af',
  KL: '#f9a8d4',
  ISO: '#fca5a5',
  AV: '#f9cb9c',
  RG: '#1e3a8a',
};

const MIN_STOCK_CANET_HUARTE: Record<string, number> = {
  SV: 7500,
  ENT: 3000,
  AV: 450,
  KL: 500,
  RG: 600,
  ISO: 1800,
};
const formatCoverage = (months: number) => {
  if (!Number.isFinite(months) || months <= 0) return '0 días';
  const totalDays = Math.round(months * MONTH_DAYS);
  if (totalDays < MONTH_DAYS) return `${totalDays} días`;
  const wholeMonths = Math.floor(totalDays / MONTH_DAYS);
  const restDays = totalDays % MONTH_DAYS;
  if (wholeMonths < 12) {
    if (restDays === 0) return `${wholeMonths} ${wholeMonths === 1 ? 'mes' : 'meses'}`;
    return `${wholeMonths} ${wholeMonths === 1 ? 'mes' : 'meses'} y ${restDays} días`;
  }
  const years = Math.floor(wholeMonths / 12);
  const monthsLeft = wholeMonths % 12;
  const yearsText = `${years} ${years === 1 ? 'año' : 'años'}`;
  if (monthsLeft === 0 && restDays === 0) return yearsText;
  if (restDays === 0) return `${yearsText} y ${monthsLeft} ${monthsLeft === 1 ? 'mes' : 'meses'}`;
  if (monthsLeft === 0) return `${yearsText} y ${restDays} días`;
  return `${yearsText}, ${monthsLeft} ${monthsLeft === 1 ? 'mes' : 'meses'} y ${restDays} días`;
};
const getCoverageSemaforo = (coverageMonths: number, stock: number) => {
  if (stock <= 0 || coverageMonths <= 0 || !Number.isFinite(coverageMonths)) return 'AGOTADO';
  if (coverageMonths < 3) return 'CRITICO';
  if (coverageMonths < 4) return 'ATENCION';
  return 'OPTIMO';
};
const getCoverageSemaforoClass = (value: string) => {
  if (value === 'AGOTADO') return 'bg-slate-100 text-slate-600';
  if (value === 'CRITICO') return 'bg-rose-100 text-rose-700';
  if (value === 'ATENCION') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
};
const getPotentialStatusClass = (value: string) => {
  if (value === 'AGOTADO') return 'bg-slate-100 text-slate-600';
  if (value === 'CRITICO') return 'bg-rose-100 text-rose-700';
  if (value === 'ATENCION') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
};
const getPotentialSemaforo = (potencial: number, stockOptimo: number) => {
  if (!Number.isFinite(potencial) || potencial <= 0) return 'AGOTADO';
  if (stockOptimo > 0) {
    if (potencial < stockOptimo * 0.5) return 'CRITICO';
    if (potencial < stockOptimo) return 'ATENCION';
  }
  return 'OPTIMO';
};
const inferMovementSignByType = (typeRaw: string, qtyRaw: number) => {
  const t = normalizeSearch(typeRaw);
  if (t.includes('nota credito') || t.includes('nota_credito')) return 1;
  if (t.includes('venta') || t.includes('envio') || t.includes('traspaso')) return -1;
  if (/ajuste[\s_-]*negativ/.test(t) || /ajuste\s*-/.test(t) || t.includes('ajuste-')) return -1;
  if (/ajuste[\s_-]*positiv/.test(t) || t.includes('ajuste+')) return 1;
  return qtyRaw < 0 ? -1 : 1;
};
const inferSignedQuantityLoose = (movement: Pick<Movement, 'cantidad' | 'cantidad_signed' | 'signo' | 'tipo_movimiento'>) => {
  const hasSigned =
    movement.cantidad_signed !== undefined &&
    movement.cantidad_signed !== null &&
    clean(movement.cantidad_signed) !== '';
  if (hasSigned) return toNum(movement.cantidad_signed);
  const rawQty = toNum(movement.cantidad);
  const absQty = Math.abs(rawQty);
  const explicitSign = toNum(movement.signo);
  if (explicitSign !== 0) return absQty * explicitSign;
  return absQty * inferMovementSignByType(clean(movement.tipo_movimiento), rawQty);
};

const EMPTY_FORM = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo_movimiento: '',
  producto: '',
  lote: '',
  cantidad: '',
  bodega: '',
  cliente: '',
  destino: '',
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
const EMPTY_PRODUCT_FORM = {
  producto: '',
  tipo_producto: 'COMPLEMENTO ALIMENTICIO',
  stock_min: '',
  stock_optimo: '',
  consumo_mensual_cajas: '',
  modo_stock: 'ENSAMBLAJE',
  activo_si_no: 'SI',
  kit_componentes_text: '',
};

function InventoryPage() {
  const { currentUser } = useAuth();
  const { addNotification } = useNotificationsContext();
  const anabela = USERS.find((u) => u.name.toLowerCase().includes('anab'));
  const fernando = USERS.find((u) => {
    const n = u.name.toLowerCase();
    return n.includes('fer') || n.includes('fernando');
  });
  const admins = USERS.filter((u) => !!u.isAdmin);
  const actorName = currentUser?.name || 'Usuario';
  const actorId = currentUser?.id || '';
  const actorEmail = clean(currentUser?.email).toLowerCase();
  const isRestrictedUser = !!currentUser?.isRestricted || actorEmail === CARLOS_EMAIL;
  const actorIsAdmin = !!currentUser?.isAdmin;
  const [searchParams, setSearchParams] = useSearchParams();

  const initialRequestedTab = clean(searchParams.get('tab')).toLowerCase();
  const [tab, setTab] = useState<InventoryTab>(
    initialRequestedTab === 'control_stock' ? 'control_stock' : 'dashboard',
  );
  const [masterSection, setMasterSection] = useState<CanetMasterKey>('productos');
  const [accessMode, setAccessMode] = useState<InventoryAccessMode>('unset');
  const [auditLog, setAuditLog] = useSharedJsonState<InventoryAuditEntry[]>(
    INVENTORY_AUDIT_KEY,
    [],
    { userId: actorId },
  );
  const [monthlyClosures, setMonthlyClosures] = useSharedJsonState<InventoryMonthlyCloseSnapshot[]>(
    INVENTORY_MONTHLY_CLOSURES_KEY,
    [],
    { userId: actorId, mergeBeforePersist: true },
  );

  const [
    movimientos,
    ,
    movimientosLoading,
    canetDB,
  ] = useInventoryMovementsDB('canet');
  const [productos, setProductos] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_productos_v1',
    seed.productos as GenericRow[],
    { userId: actorId, mergeStrategy: mergeProductsPayload },
  );
  const [, setHuarteProductosCatalog] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_productos_v1',
    huarteSeed.productos as GenericRow[],
    { userId: actorId },
  );
  const [lotes, setLotes] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_lotes_v1',
    seed.lotes as GenericRow[],
    {
      userId: actorId,
      mergeBeforePersist: true,
      protectFromEmptyOverwrite: true,
      mergeStrategy: mergeCanetLotesPayload,
    },
  );
  const [lotAssemblyFinalizations, setLotAssemblyFinalizations] = useSharedJsonState<LotAssemblyFinalizationEntry[]>(
    INVENTORY_CANET_LOT_FINALIZATIONS_KEY,
    [],
    {
      userId: actorId,
      mergeBeforePersist: true,
      protectFromEmptyOverwrite: true,
    },
  );
  const upsertLotAssemblyFinalization = useCallback((producto: string, lote: string, nextState: 'SI' | 'NO') => {
    const key = lotKeyOf(producto, lote);
    const now = nowIso();
    setLotAssemblyFinalizations((prev) => {
      const next: LotAssemblyFinalizationEntry[] = (Array.isArray(prev) ? prev : []).filter((entry) => clean(entry.id) !== key);
      next.unshift({
        id: key,
        producto: clean(producto),
        lote: clean(lote),
        ensamblaje_finalizado: nextState,
        updatedAt: now,
        updatedBy: actorName,
      });
      return next;
    });
  }, [actorName, setLotAssemblyFinalizations]);
  const [deletedLotKeys, setDeletedLotKeys] = useSharedJsonState<string[]>(
    'inventory_canet_deleted_lot_keys_v1',
    [],
    { userId: actorId, mergeBeforePersist: true, protectFromEmptyOverwrite: true },
  );
  const [archivedLotEntries, setArchivedLotEntries] = useSharedJsonState<ArchivedLotEntry[]>(
    INVENTORY_LOT_ARCHIVES_KEY,
    [],
    { userId: actorId, mergeBeforePersist: true, protectFromEmptyOverwrite: true },
  );
  const [bodegas, setBodegas] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_bodegas_v1',
    seed.bodegas as GenericRow[],
    { userId: actorId, mergeStrategy: mergeBodegasPayload },
  );
  const [clientes, setClientes] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_clientes_v1',
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
          if (!bodega || !CANET_MASTER_WAREHOUSE_SET.has(bodega)) return;
          byName.set(bodega, { ...b, bodega, activo_si_no: clean(b.activo_si_no) || 'SI' });
        });
      CANET_MASTER_WAREHOUSE_ORDER.forEach((bodega) => {
        if (!byName.has(bodega)) byName.set(bodega, { bodega, activo_si_no: 'SI' });
      });
      return sortInventoryWarehouses(Array.from(byName.values()), 'canet', 'master');
    },
    [bodegas],
  );
  const activeClientes = useMemo(
    () => clientes.filter((c) => !clean((c as any).deletedAt) && !clean((c as any).deleted_at)),
    [clientes],
  );
  const [tipos, setTipos] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_tipos_v1',
    seed.tipos_movimiento as GenericRow[],
    { userId: actorId },
  );
  const [, setInventoryAlertsShared] = useSharedJsonState<any | null>(
    INVENTORY_ALERTS_KEY,
    null,
    { userId: actorId },
  );

  useEffect(() => {
    const requestedTab = clean(searchParams.get('tab')).toLowerCase() as InventoryTab;
    if (!requestedTab) return;
    if (requestedTab === 'dashboard' || requestedTab === 'control_stock' || requestedTab === 'movimientos' || requestedTab === 'ensamblajes' || requestedTab === 'maestros') {
      setTab(requestedTab);
    }
  }, [searchParams]);

  const [, setInventoryStockControlSnapshotShared] = useSharedJsonState<any | null>(
    INVENTORY_STOCK_CONTROL_SNAPSHOT_KEY,
    null,
    { userId: actorId },
  );
  const [huarteVisualStockByLotCache] = useSharedJsonState<
    { monthKey: string; updatedAt: string; byLot: Record<string, number>; byLotBodega?: Record<string, number> } | null
  >(
    STORAGE_HUARTE_VISUAL_STOCK_BY_LOT,
    null,
    { userId: actorId },
  );
  const inventoryAlertsFingerprintRef = useRef<string>('');
  const [
    huarteMovimientosShared,
    ,
    huarteMovimientosLoading,
    huarteDB,
  ] = useInventoryMovementsDB('huarte');

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('month');
  const [monthFilter, setMonthFilter] = useState<string>(() => getCurrentMonthKey());
  const [dateFilterStart, setDateFilterStart] = useState<string>(() => dateInputValue());
  const [dateFilterEnd, setDateFilterEnd] = useState<string>(() => dateInputValue());
  const [yearFilter, setYearFilter] = useState<string>(() => String(new Date().getFullYear()));
  const [productFilterInput, setProductFilterInput] = useState<string>('');
  const [productFilters, setProductFilters] = useState<string[]>([]);
  const [lotFilter, setLotFilter] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [quickSearch, setQuickSearch] = useState<string>('');
  const [controlSemaforoFilter, setControlSemaforoFilter] = useState<string>('');
  const [showMainFilters, setShowMainFilters] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProductCode, setEditingProductCode] = useState<string | null>(null);
  const [newProductForm, setNewProductForm] = useState({ ...EMPTY_PRODUCT_FORM });

  const [cartonajeModalOpen, setCartonajeModalOpen] = useState(false);
  const [cartonajeForm, setCartonajeForm] = useState({ tipo_movimiento: 'ENTRADA de cartonaje', producto: '', lote: '', cantidad: '' });

  const cartonajeProducts = useMemo(() => productos.filter(p => p.tipo_producto === 'CARTONAJE').map(p => clean(p.producto)), [productos]);

  const [dashMoveProduct, setDashMoveProduct] = useState('');
  const [dashMoveLot, setDashMoveLot] = useState('');
  const [dashMoveBodega, setDashMoveBodega] = useState('');
  const [dashClientTarget, setDashClientTarget] = useState('');
  const [dashOutProduct, setDashOutProduct] = useState('');
  const [dashOutLot, setDashOutLot] = useState('');

  const [showMovesAll, setShowMovesAll] = useState(false);
  const [showClientsAll, setShowClientsAll] = useState(false);
  const [showAdjustAll, setShowAdjustAll] = useState(false);
  const [showOutputAll, setShowOutputAll] = useState(false);
  const [showMovementsAll, setShowMovementsAll] = useState(false);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [potentialDetailProduct, setPotentialDetailProduct] = useState<string | null>(null);
  const [hypotheticalScope, setHypotheticalScope] = useState<HypotheticalScope | null>(null);
  const [hypotheticalForm, setHypotheticalForm] = useState({ producto: '', lote: '', cantidad: '' });
  const [hypotheticalResult, setHypotheticalResult] = useState<{
    scope: HypotheticalScope;
    producto: string;
    lote: string;
    venta: number;
    stockInicial: number;
    stockFinal: number;
    consumoMes: number;
    coberturaMeses: number;
    semaforo: string;
  } | null>(null);
  const [canetHuarteDetailRow, setCanetHuarteDetailRow] = useState<{
    producto: string;
    lote: string;
    stockCanetHuarte: number;
    stockCanet: number;
    stockHuarte: number;
    stockMinCH: number;
    consumoMes: number;
    coberturaMeses: number;
    semaforo: string;
  } | null>(null);
  const [stockLotSelected, setStockLotSelected] = useState<{ producto: string; lote: string; cantidad: number } | null>(null);
  const densityMode = useDensityMode();
  const isCompact = densityMode === 'compact';
  const [compactInventoryPanel, setCompactInventoryPanel] = useState<'stock' | 'moves' | 'clients' | 'adjust' | 'outputs'>('stock');

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [movementForm, setMovementForm] = useState({ ...EMPTY_FORM });
  const [movementLines, setMovementLines] = useState<MovementDraftLine[]>(() => [createEmptyMovementDraftLine()]);
  const [movementKitLots, setMovementKitLots] = useState<Record<string, string>>({});
  const [savingMovement, setSavingMovement] = useState(false);
  const [deletingMovementId, setDeletingMovementId] = useState<number | null>(null);

  const canetMovementSyncStartDate = useMemo(
    () => dateFromAny(CANET_MOVEMENT_SYNC_START) || new Date('2026-02-23T00:00:00'),
    [],
  );
  const [lotModalOpen, setLotModalOpen] = useState(false);
  const [editingLotKey, setEditingLotKey] = useState<string | null>(null);
  const [deletingLotKey, setDeletingLotKey] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState({
    producto: '',
    lote: '',
    viales_recibidos: '',
    fecha_caducidad: '',
    estado: 'ACTIVO',
    ensamblaje_finalizado: 'NO',
  });
  const [bodegaModalOpen, setBodegaModalOpen] = useState(false);
  const [bodegaForm, setBodegaForm] = useState({ bodega: '', activo_si_no: 'SI' });
  const [tipoModalOpen, setTipoModalOpen] = useState(false);
  const [tipoForm, setTipoForm] = useState({ tipo_movimiento: '', signo_1_1: '-1', afecta_stock_si_no: 'SI' });
  const [newClient, setNewClient] = useState('');
  const [textEditDialog, setTextEditDialog] = useState<TextEditDialogPayload | null>(null);
  const mimedicoClientMigrationDoneRef = useRef(false);
  const mimedicoClientMigrationRunningRef = useRef(false);
  const canWriteHuarteMirrorFromCanet = false;
  useEffect(() => {
    if (editingId) return;
    const firstLine = movementLines[0];
    if (!firstLine) return;
    setMovementForm((prev) => {
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
  const deletedLotKeySet = useMemo(
    () => new Set((deletedLotKeys || []).map((key) => clean(key)).filter(Boolean)),
    [deletedLotKeys],
  );
  const archivedLotEntryByKey = useMemo(() => {
    const map = new Map<string, ArchivedLotEntry>();
    for (const entry of Array.isArray(archivedLotEntries) ? archivedLotEntries : []) {
      const producto = clean(entry?.producto);
      const lote = clean(entry?.lote);
      if (!producto || !lote) continue;
      const key = lotKeyOf(producto, lote);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...entry, id: key, producto, lote });
        continue;
      }
      const prevArchived = lotArchivedAtMs(prev);
      const nextArchived = lotArchivedAtMs(entry);
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
          .map((entry) => lotKeyOf(entry.producto, entry.lote)),
      ),
    [archivedLotEntryByKey],
  );
  const exhaustedLotKeySet = useMemo(
    () =>
      new Set(
        dedupeCanonicalCanetLots(lotes)
          .filter((row) => !isLotDeleted(row) && effectiveLotState(row.producto, row.lote, row.estado) === 'AGOTADO')
          .map((row) => lotKeyOf(row.producto, row.lote)),
      ),
    [lotes],
  );
  const hiddenLotKeySet = useMemo(
    () => new Set([...Array.from(archivedLotKeySet), ...Array.from(exhaustedLotKeySet)]),
    [archivedLotKeySet, exhaustedLotKeySet],
  );
  const visibleLotes = useMemo(
    () =>
      dedupeCanonicalCanetLots(lotes).filter(
        (row) =>
          !isLotDeleted(row) &&
          !deletedLotKeySet.has(lotKeyOf(row.producto, row.lote)) &&
          !hiddenLotKeySet.has(lotKeyOf(row.producto, row.lote)),
      ),
    [deletedLotKeySet, hiddenLotKeySet, lotes],
  );
  const canetKnownActiveLotRows = useMemo(
    () =>
      dedupeCanonicalCanetLots([...visibleLotes, ...CANET_LOT_REFERENCE_ROWS]).filter((row) => {
        const producto = clean(row.producto);
        const lote = clean(row.lote);
        if (!producto || !lote) return false;
        const key = lotKeyOf(producto, lote);
        return !deletedLotKeySet.has(key) && !hiddenLotKeySet.has(key);
      }),
    [deletedLotKeySet, hiddenLotKeySet, visibleLotes],
  );
  const archivedLotes = useMemo(
    () =>
      dedupeCanonicalCanetLots(lotes).filter(
        (row) =>
          !isLotDeleted(row) &&
          !deletedLotKeySet.has(lotKeyOf(row.producto, row.lote)) &&
          hiddenLotKeySet.has(lotKeyOf(row.producto, row.lote)),
      ),
    [deletedLotKeySet, hiddenLotKeySet, lotes],
  );
  const [lotViewMode, setLotViewMode] = useState<'active' | 'archived'>('active');

  const isCanetMirroredMovement = (m: Movement) => clean((m as any).source).toLowerCase() === 'canet';
  const isMasBorrasWarehouse = (v: string) => normalizeWarehouseAlias(v).toUpperCase() === 'MAS BORRAS';
  const isHuarteMirrorWarehouse = (v: string) => {
    const value = normalizeWarehouseAlias(v).toUpperCase();
    return HUARTE_OWN_WAREHOUSES.has(value);
  };
  const isCanetSharedWarehouse = (v: string) => {
    const value = normalizeWarehouseAlias(v).toUpperCase();
    return CANET_OWN_WAREHOUSES.has(value);
  };
  const isCanetMirrorSource = (src: unknown) => {
    const value = clean(src).toLowerCase();
    return value === 'canet' || value === 'canet_auto_in' || value === 'canet_live';
  };
  const isHuarteMasBorrasMirrorMovement = (m: Movement) =>
    isHuarteMirrorWarehouse(clean(m.bodega)) && clean((m as any).source).toLowerCase() === 'huarte_mirror';
  const isHuarteInternalDestination = (v: string) => {
    const x = normalizeSearch(v);
    return (
      x.includes('huarte') ||
      x.includes('guarte') ||
      x.includes('warte') ||
      x.includes('wuarte') ||
      x.includes('bilbao') ||
      x.includes('pamplona') ||
      x.includes('logrono') ||
      x.includes('barcelona')
    );
  };
  const isHuarteAlias = (v: string) => {
    return isHuarteInternalDestination(v);
  };
  const toHuarteMirrorMovement = (m: Movement): Movement => ({
    ...m,
    id: 900000000 + toNum(m.id),
    bodega: normalizeWarehouseAlias(m.bodega),
    source: 'canet',
    origin_canet_id: toNum(m.id),
  });
  const isCanetTransferToHuarte = (m: Movement, destination: string) => {
    const tipo = normalizeSearch(m.tipo_movimiento);
    const bodega = clean(m.bodega).toUpperCase();
    const d = dateFromAny(clean(m.fecha));
    return (
      !!d &&
      d >= canetMovementSyncStartDate &&
      tipo.includes('traspaso') &&
      bodega === 'CANET' &&
      isHuarteInternalDestination(destination)
    );
  };
  const toHuarteAutoInMovement = (m: Movement, destination: string): Movement => ({
    ...m,
    id: 1900000000 + toNum(m.id),
    source: 'canet_auto_in',
    origin_canet_id: toNum(m.id),
    tipo_movimiento: 'entrada_traspaso',
    bodega: destination,
    cliente: normalizeWarehouseAlias(clean(m.bodega) || 'CANET'),
    destino: destination,
    cantidad: Math.abs(toNum(m.cantidad_signed || m.cantidad)),
    cantidad_signed: Math.abs(toNum(m.cantidad_signed || m.cantidad)),
    signo: 1,
    notas: clean(m.notas)
      ? `${clean(m.notas)} · Auto entrada por traspaso Canet→${destination}`
      : `Auto entrada por traspaso Canet→${destination}`,
  });
  const huarteMirrorMovements = useMemo(() => [] as Movement[], []);
  const syncMirrorUpsert = async (m: Movement) => {
    void m;
    if (!canWriteHuarteMirrorFromCanet) return;
    const tipo = normalizeSearch(clean(m.tipo_movimiento));
    if (tipo.includes('traspaso')) return;
    const mirror = toHuarteMirrorMovement(m);
    const destination = clean(m.destino) || clean(m.cliente);
    const shouldAutoIn = isCanetTransferToHuarte(m, destination);
    const autoIn = shouldAutoIn ? toHuarteAutoInMovement(m, destination) : null;

    const mirrorIdx = huarteMovimientosShared.findIndex(
      (row: any) => clean(row.source).toLowerCase() === 'canet' && toNum(row.origin_canet_id) === toNum(m.id),
    );
    if (mirrorIdx >= 0) {
      await huarteDB.updateMovement(huarteMovimientosShared[mirrorIdx].id, mirror);
    } else {
      await huarteDB.addMovement(mirror);
    }

    const autoIdx = huarteMovimientosShared.findIndex(
      (row: any) => clean(row.source).toLowerCase() === 'canet_auto_in' && toNum(row.origin_canet_id) === toNum(m.id),
    );
    if (autoIn) {
      if (autoIdx >= 0) {
        await huarteDB.updateMovement(huarteMovimientosShared[autoIdx].id, autoIn);
      } else {
        await huarteDB.addMovement(autoIn);
      }
    } else if (autoIdx >= 0) {
      await huarteDB.deleteMovement(huarteMovimientosShared[autoIdx].id);
    }
  };
  const syncMirrorUpsertStrict = async (m: Movement) => {
    if (!canWriteHuarteMirrorFromCanet) return;
    let lastError: unknown = null;
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await syncMirrorUpsert(m);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 450 * attempt));
        }
      }
    }
    throw lastError || new Error('No se pudo sincronizar el espejo de Huarte.');
  };

  useEffect(() => {
    if (movimientosLoading) return;
    if (mimedicoClientMigrationDoneRef.current) return;
    if (mimedicoClientMigrationRunningRef.current) return;

    const pending = movimientos.filter((m) => {
      const notes = clean(m.notas).toUpperCase();
      const client = clean(m.cliente).toUpperCase();
      return (
        notes.includes('MIMEDICO') &&
        client !== 'MIMEDICO'
      );
    });

    if (pending.length === 0) {
      mimedicoClientMigrationDoneRef.current = true;
      return;
    }

    mimedicoClientMigrationRunningRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        for (const m of pending) {
          if (cancelled) return;
          const nextMovement = await canetDB.updateMovement(m.id, {
            cliente: 'MIMEDICO',
            updated_by: actorName,
          });
          await syncMirrorUpsert(nextMovement);
        }
        if (!cancelled) {
          mimedicoClientMigrationDoneRef.current = true;
        }
      } finally {
        mimedicoClientMigrationRunningRef.current = false;
      }
    })().catch((err) => {
      console.warn('No se pudo normalizar cliente MIMEDICO en inventario Canet:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [actorName, canetDB, movimientos, movimientosLoading, syncMirrorUpsert]);

  const syncMirrorDelete = async (canetId: number) => {
    void canetId;
    if (!canWriteHuarteMirrorFromCanet) return;
    const toDelete = huarteMovimientosShared.filter((row: any) => {
      const src = clean(row.source).toLowerCase();
      if (toNum(row.origin_canet_id) !== toNum(canetId)) return false;
      return src === 'canet' || src === 'canet_auto_in';
    });
    for (const row of toDelete) {
      await huarteDB.deleteMovement(row.id);
    }
  };
  const syncMirrorDeleteStrict = async (canetId: number) => {
    if (!canWriteHuarteMirrorFromCanet) return;
    let lastError: unknown = null;
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await syncMirrorDelete(canetId);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 450 * attempt));
        }
      }
    }
    throw lastError || new Error('No se pudo sincronizar el borrado en Huarte.');
  };

  const addProductFilter = (value: string) => {
    const v = clean(value).toUpperCase();
    if (!v) return;
    if (!productOptions.includes(v)) return;
    setProductFilters((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setProductFilterInput('');
  };
  const removeProductFilter = (value: string) => {
    setProductFilters((prev) => prev.filter((p) => p !== value));
  };

  const canEditNow = !isRestrictedUser;

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
    setAuditLog((prev) => {
      const next = [entry, ...prev].slice(0, 500);
      return next;
    });
  };

  const signByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tipos) map.set(clean(t.tipo_movimiento), toNum(t.signo_1_1));
    return map;
  }, [tipos]);

  const productColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of productos) {
      const code = clean(p.producto);
      if (!code) continue;
      if (INVENTORY_PRODUCT_COLORS[code]) {
        map.set(code, INVENTORY_PRODUCT_COLORS[code]);
        continue;
      }
      const color = clean(p.color_hex_opcional);
      map.set(code, isValidHexColor(color) ? color : '#7c3aed');
    }
    return map;
  }, [productos]);

  const normalizedMovements = useMemo(() => {
    const canonicalLot = (productoRaw: string, loteRaw: string) => {
      const producto = clean(productoRaw);
      const lote = clean(loteRaw);
      if (!producto || !lote) return lote;
      const lotToken = normalizeLotCompareToken(lote);
      const allLots = canetKnownActiveLotRows
        .filter((l) => clean(l.producto) === producto)
        .map((l) => clean(l.lote))
        .filter(Boolean);
      const suffixMatches = allLots.filter((candidate) => {
        const cand = normalizeLotCompareToken(candidate);
        return cand.endsWith(lotToken);
      });
      if (suffixMatches.length > 0) {
        const preferred = [...suffixMatches].sort((a, b) => clean(b).length - clean(a).length)[0];
        if (preferred) return preferred;
      }
      const globalLots = canetKnownActiveLotRows.map((l) => clean(l.lote)).filter(Boolean);
      const globalSuffix = globalLots.filter((candidate) => normalizeLotCompareToken(candidate).endsWith(lotToken));
      if (globalSuffix.length === 1) return globalSuffix[0];
      return lote;
    };
    const canetBaseMovements = movimientos
      .map((m) => {
        const tipo = clean(m.tipo_movimiento);
        const qty = Math.abs(toNum(m.cantidad));
        const rowSign = toNum(m.signo);
        const hasSigned = m.cantidad_signed !== undefined && m.cantidad_signed !== null && clean(m.cantidad_signed) !== '';
        const signedFromRow = toNum(m.cantidad_signed);
        const configuredSign = toNum(signByType.get(tipo));
        const sign =
          rowSign !== 0
            ? rowSign
            : configuredSign !== 0
              ? configuredSign
              : hasSigned && signedFromRow !== 0
                ? signedFromRow < 0 ? -1 : 1
                : inferMovementSignByType(tipo, qty);
        const producto = clean(m.producto);
        const lote = canonicalLot(producto, clean(m.lote));
        return {
          ...m,
          producto,
          lote,
          bodega: normalizeWarehouseAlias(m.bodega),
          cantidad: qty,
          signo: sign,
          cantidad_signed: hasSigned ? signedFromRow : qty * sign,
          afecta_stock: clean(m.afecta_stock) || 'SI',
        };
      })
      .filter((m) => !isInvalidLegacyLot(m.producto, m.lote));
    const legacyTransferEntries = buildMissingTransferEntryMovements(canetBaseMovements, {
      existingMovements: canetBaseMovements,
      allowedDestinations: CANET_MASTER_WAREHOUSE_ORDER,
      idOffset: 1700000000,
      source: 'legacy_transfer_auto_in',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value, movement) => canonicalLot(clean((movement as any).producto), clean(value)),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
    }) as Movement[];
    const huarteTransferEntries = buildMissingTransferEntryMovements(huarteMovimientosShared as Movement[], {
      existingMovements: [...canetBaseMovements, ...legacyTransferEntries],
      allowedDestinations: CANET_MASTER_WAREHOUSE_ORDER,
      idOffset: 1800000000,
      source: 'huarte_transfer_auto_in',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value, movement) => canonicalLot(clean((movement as any).producto), clean(value)),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
    }) as Movement[];
    return [...canetBaseMovements, ...legacyTransferEntries, ...huarteTransferEntries];
  }, [canetKnownActiveLotRows, huarteMovimientosShared, movimientos, signByType]);

  // Canet and Huarte are independent inventories. Transfers are represented
  // by explicit paired movements, not by live mirrored rows.

  const validDates = useMemo(() => normalizedMovements.map((m) => dateFromAny(clean(m.fecha))).filter(Boolean) as Date[], [normalizedMovements]);
  const currentMonth = useMemo(() => getCurrentMonthKey(), []);

  const monthOptions = useMemo(() => {
    if (isRestrictedUser) return [currentMonth];
    const set = new Set<string>();
    set.add(currentMonth);
    for (const d of validDates) {
      const mk = monthKeyFromDate(d);
      if (mk <= currentMonth && d.getFullYear() >= 2024) set.add(mk);
    }
    return Array.from(set).sort();
  }, [validDates, currentMonth, isRestrictedUser]);

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
      const end = monthEndDateFromKey(monthFilter);
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
      return { start: dateStartFromInput(dateFilterEnd), end: dateEndFromInput(dateFilterStart), label: describeDatePeriod(dateFilterMode, dateStartFromInput(dateFilterEnd), dateEndFromInput(dateFilterStart), monthFilter, yearFilter), fileKey: `${dateFilterEnd}_${dateFilterStart}` };
    }
    return { start, end, label: describeDatePeriod(dateFilterMode, start, end, monthFilter, yearFilter), fileKey: dateFilterMode === 'day' ? dateFilterStart : `${dateFilterStart}_${dateFilterEnd}` };
  }, [dateFilterEnd, dateFilterMode, dateFilterStart, monthFilter, yearFilter]);

  const periodEnd = selectedDatePeriod.end;
  const periodHasDateFilter = dateFilterMode !== 'all';
  const closeMonthKey = dateFilterMode === 'month' ? monthFilter : '';
  const periodFileKey = selectedDatePeriod.fileKey;
  const periodLabel = selectedDatePeriod.label;

  const canetMonthlyClosures = useMemo(
    () =>
      (monthlyClosures || [])
        .filter((snapshot) => snapshot.scope === 'canet' && !snapshot.deletedAt)
        .sort((a, b) => clean(a.monthKey).localeCompare(clean(b.monthKey))),
    [monthlyClosures],
  );
  const currentMonthlyClose = useMemo(
    () => closeMonthKey ? getInventoryMonthlyCloseSnapshot(monthlyClosures, 'canet', closeMonthKey) : null,
    [monthlyClosures, closeMonthKey],
  );
  const previousMonthlyClose = useMemo(
    () => closeMonthKey ? getInventoryMonthlyCloseSnapshot(monthlyClosures, 'canet', getPreviousMonthKey(closeMonthKey)) : null,
    [monthlyClosures, closeMonthKey],
  );
  const getLatestCanetCloseAtOrBefore = useCallback((end: Date | null | undefined) => {
    if (!end) return null;
    let latest: InventoryMonthlyCloseSnapshot | null = null;
    for (const snapshot of canetMonthlyClosures) {
      const closeEnd = monthEndDateFromKey(snapshot.monthKey);
      if (!closeEnd || closeEnd.getTime() > end.getTime()) continue;
      latest = snapshot;
    }
    return latest;
  }, [canetMonthlyClosures]);
  const getLatestCanetCloseBeforeMonth = useCallback((monthKey: string) => {
    let latest: InventoryMonthlyCloseSnapshot | null = null;
    for (const snapshot of canetMonthlyClosures) {
      if (clean(snapshot.monthKey) >= clean(monthKey)) continue;
      latest = snapshot;
    }
    return latest;
  }, [canetMonthlyClosures]);
  const monthlyCloseRowsAsBaseMovements = useCallback((snapshot: InventoryMonthlyCloseSnapshot | null | undefined) => {
    if (!snapshot) return [] as Movement[];
    return snapshot.rows.map((row, index) => ({
      id: `monthly-close-${snapshot.id}-${index}` as any,
      fecha: monthEndInputValue(snapshot.monthKey),
      tipo_movimiento: 'cierre_base',
      producto: clean(row.producto),
      lote: clean(row.lote),
      cantidad: Math.max(0, toNum(row.stock)),
      bodega: normalizeWarehouseAlias(row.bodega),
      cliente: '',
      destino: '',
      notas: `Base congelada ${snapshot.monthLabel}`,
      afecta_stock: 'SI',
      signo: 1,
      cantidad_signed: Math.max(0, toNum(row.stock)),
      created_at: snapshot.closedAt,
      updated_at: snapshot.closedAt,
      updated_by: snapshot.closedBy,
      source: 'monthly_close_base',
    })) as Movement[];
  }, []);
  const buildStockBaseFromSnapshot = useCallback((snapshot: InventoryMonthlyCloseSnapshot | null | undefined, end: Date | null | undefined) => {
    if (!end) return null;
    if (!snapshot) return null;
    const baselineEnd = monthEndDateFromKey(snapshot.monthKey);
    if (!baselineEnd) return null;
    const movementsAfterBaseline = normalizedMovements.filter((movement) => {
      if (clean(movement.afecta_stock).toUpperCase() !== 'SI') return false;
      const movementDate = dateFromAny(clean(movement.fecha));
      if (!movementDate) return false;
      return movementDate.getTime() > baselineEnd.getTime() && movementDate.getTime() <= end.getTime();
    });
    return [...monthlyCloseRowsAsBaseMovements(snapshot), ...movementsAfterBaseline];
  }, [monthlyCloseRowsAsBaseMovements, normalizedMovements]);
  const buildStockBaseFromMonthlyClose = useCallback((end: Date | null | undefined, options: { forceFrozenMonth?: boolean } = {}) => {
    if (!end) return null;
    const selectedClosedMonth = options.forceFrozenMonth && closeMonthKey
      ? getInventoryMonthlyCloseSnapshot(monthlyClosures, 'canet', closeMonthKey)
      : null;
    if (selectedClosedMonth) return monthlyCloseRowsAsBaseMovements(selectedClosedMonth);
    return buildStockBaseFromSnapshot(getLatestCanetCloseAtOrBefore(end), end);
  }, [buildStockBaseFromSnapshot, closeMonthKey, getLatestCanetCloseAtOrBefore, monthlyCloseRowsAsBaseMovements, monthlyClosures]);

  const movementMatchesFilters = (m: Movement, monthExact: boolean) => {
    if (hiddenLotKeySet.has(lotKeyOf(m.producto, m.lote))) return false;
    const d = dateFromAny(clean(m.fecha));
    if (monthExact && periodHasDateFilter) {
      if (!d) return false;
      if (selectedDatePeriod.start && d < selectedDatePeriod.start) return false;
      if (selectedDatePeriod.end && d > selectedDatePeriod.end) return false;
    }
    if (productFilters.length > 0 && !productFilters.includes(clean(m.producto).toUpperCase())) return false;
    if (lotFilter && normalizeLotCompareToken(clean(m.lote)) !== normalizeLotCompareToken(lotFilter)) return false;
    if (warehouseFilter && normalizeWarehouseAlias(clean(m.bodega)) !== normalizeWarehouseAlias(warehouseFilter)) return false;
    if (typeFilter && clean(m.tipo_movimiento).toLowerCase() !== clean(typeFilter).toLowerCase()) return false;
    if (clientFilter && clean(m.cliente).toLowerCase() !== clean(clientFilter).toLowerCase()) return false;
    if (quickSearch) {
      const haystack = clean([
        m.fecha,
        m.tipo_movimiento,
        m.producto,
        m.lote,
        m.bodega,
        m.cliente,
        m.destino,
        m.notas,
        m.updated_by,
      ].join(' ')).toLowerCase();
      if (!haystack.includes(clean(quickSearch).toLowerCase())) return false;
    }
    return true;
  };

  const stockBase = useMemo(() => {
    const closedBase = buildStockBaseFromMonthlyClose(periodEnd, {
      forceFrozenMonth: dateFilterMode === 'month' && !!currentMonthlyClose,
    });
    const source = closedBase || normalizedMovements;
    return source.filter((m) => {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') return false;
      if (!movementMatchesFilters(m, false)) return false;
      if (!periodEnd) return true;
      const d = dateFromAny(clean(m.fecha));
      // Rows without ISO date act as opening/base balances and should be included in stock.
      if (!d) return true;
      return d <= periodEnd;
    });
  }, [buildStockBaseFromMonthlyClose, currentMonthlyClose, dateFilterMode, hiddenLotKeySet, normalizedMovements, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter, periodEnd, quickSearch]);

  const stockBaseVisible = useMemo(
    () =>
      stockBase.filter((m) => {
        const key = lotKeyOf(m.producto, m.lote);
        return !hiddenLotKeySet.has(key);
      }),
    [hiddenLotKeySet, stockBase],
  );

  const monthMovements = useMemo(() => normalizedMovements.filter((m) => movementMatchesFilters(m, true)), [hiddenLotKeySet, normalizedMovements, selectedDatePeriod, periodHasDateFilter, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter, quickSearch]);

  const stockByPLB = useMemo(() => {
    const selectedWarehouse = warehouseFilter ? normalizeWarehouseAlias(warehouseFilter).toUpperCase() : '';
    return calculateInventoryStockSnapshot(stockBaseVisible, {
      scope: 'canet',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value) => clean(value),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      includeMovement: (movement) => {
        const bodega = normalizeWarehouseAlias(clean(movement.bodega));
        if (selectedWarehouse && bodega.toUpperCase() !== selectedWarehouse) return false;
        return !isHuarteMirrorWarehouse(bodega);
      },
      rowTransform: (row) => {
        const safeStock = Math.max(0, toNum(row.stock));
        if (isForcedAgotadoLot(row.producto, row.lote)) {
          return { ...row, stock: 0 };
        }
        return { ...row, stock: safeStock };
      },
      rowFilter: (row) => !hiddenLotKeySet.has(lotKeyOf(row.producto, row.lote)) && toNum(row.stock) > 0,
    }).rows
      .filter((row) => toNum(row.stock) > 0)
      .sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote) || a.bodega.localeCompare(b.bodega));
  }, [hiddenLotKeySet, stockBaseVisible, warehouseFilter]);

  const monthlyCloseRows = useMemo(() => {
    if (!closeMonthKey) return [];
    const closeEnd = monthEndDateFromKey(closeMonthKey);
    if (!closeEnd) return [];
    const previousCloseBase = buildStockBaseFromSnapshot(getLatestCanetCloseBeforeMonth(closeMonthKey), closeEnd);
    const baseRows = previousCloseBase || null;
    const source = baseRows || normalizedMovements;
    const rows = source.filter((movement) => {
      if (clean(movement.afecta_stock).toUpperCase() !== 'SI') return false;
      const movementDate = dateFromAny(clean(movement.fecha));
      if (movementDate && movementDate > closeEnd) return false;
      const lotKey = lotKeyOf(movement.producto, movement.lote);
      return !hiddenLotKeySet.has(lotKey);
    });
    return calculateInventoryStockSnapshot(rows, {
      scope: 'canet',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value) => clean(value),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      includeMovement: (movement) => !isHuarteMirrorWarehouse(normalizeWarehouseAlias(movement.bodega)),
      rowTransform: (row) => {
      const safeStock = Math.max(0, toNum(row.stock));
      if (isForcedAgotadoLot(row.producto, row.lote)) return { ...row, stock: 0 };
      return { ...row, stock: safeStock };
      },
      rowFilter: (row) => toNum(row.stock) > 0,
    }).rows;
  }, [buildStockBaseFromSnapshot, closeMonthKey, getLatestCanetCloseBeforeMonth, hiddenLotKeySet, normalizedMovements]);
  const currentMonthlyCloseDrift = useMemo(
    () => getInventoryMonthlyCloseDrift(currentMonthlyClose, monthlyCloseRows),
    [currentMonthlyClose, monthlyCloseRows],
  );

  const stockTotalCanet = useMemo(
    () =>
      stockByPLB.reduce(
        (acc, row) => acc + (isCanetSharedWarehouse(row.bodega) ? Math.max(0, toNum(row.stock)) : 0),
        0,
      ),
    [stockByPLB],
  );

  const stockCartonaje = useMemo(() => {
    const map = new Map<string, { producto: string; lote: string; stock: number }>();
    for (const row of stockByPLB) {
      if (!cartonajeProducts.includes(row.producto)) continue;
      const key = `${row.producto}|${row.lote}`;
      if (!map.has(key)) map.set(key, { ...row, stock: 0 });
      map.get(key)!.stock += row.stock;
    }
    return Array.from(map.values())
      .filter(r => r.stock !== 0)
      .sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
  }, [stockByPLB, cartonajeProducts]);



  const stockVisualByProduct = useMemo(() => {
    const map = new Map<string, { producto: string; total: number; byLote: Record<string, number> }>();
    for (const row of stockByPLB) {
      const producto = clean(row.producto);
      const lote = clean(row.lote);
      const qty = toNum(row.stock);
      if (!producto || !lote || qty <= 0) continue;
      if (!map.has(producto)) {
        map.set(producto, { producto, total: 0, byLote: {} });
      }
      const item = map.get(producto)!;
      item.total += qty;
      item.byLote[lote] = (item.byLote[lote] || 0) + qty;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [stockByPLB]);

  const movementByLotDetail = useMemo(() => {
    const selectedWarehouse = normalizeWarehouseAlias(dashMoveBodega);
    return monthMovements
      .filter((m) => (dashMoveProduct ? clean(m.producto).toUpperCase() === clean(dashMoveProduct).toUpperCase() : true))
      .filter((m) => (dashMoveLot ? normalizeLotCompareToken(clean(m.lote)) === normalizeLotCompareToken(dashMoveLot) : true))
      .filter((m) => (selectedWarehouse ? normalizeWarehouseAlias(clean(m.bodega)) === selectedWarehouse : true))
      .sort((a, b) => movementDateMs(clean(b.fecha)) - movementDateMs(clean(a.fecha)));
  }, [monthMovements, dashMoveProduct, dashMoveLot, dashMoveBodega]);

  const stockByClient = useMemo(() => {
    const map = new Map<string, { destino_cliente: string; producto: string; lote: string; cantidad: number }>();
    for (const m of monthMovements) {
      if (!contains(m.tipo_movimiento, 'venta')) continue;
      const target = clean(m.cliente) || (clean(m.bodega) !== 'CANET' ? clean(m.bodega) : '');
      if (!target) continue;
      const key = `${target}|${clean(m.producto)}|${clean(m.lote)}`;
      if (!map.has(key)) map.set(key, { destino_cliente: target, producto: clean(m.producto), lote: clean(m.lote), cantidad: 0 });
      map.get(key)!.cantidad += Math.abs(toNum(m.cantidad_signed));
    }
    return Array.from(map.values()).filter((r) => (dashClientTarget ? r.destino_cliente === dashClientTarget : true));
  }, [monthMovements, dashClientTarget]);

  const clientTargetOptions = useMemo(() => {
    const fromSheet = clientes.map((c) => clean(c.cliente)).filter(Boolean);
    const fromMoves = monthMovements
      .map((m) => clean(m.cliente) || (clean(m.bodega) !== 'CANET' ? clean(m.bodega) : ''))
      .filter(Boolean);
    return Array.from(new Set([...fromSheet, ...fromMoves])).sort();
  }, [clientes, monthMovements]);

  const adjustmentControl = useMemo(() => monthMovements.filter((m) => contains(m.tipo_movimiento, 'ajuste')).map((m) => ({ producto: clean(m.producto), lote: clean(m.lote), bodega: clean(m.bodega), tipo: clean(m.tipo_movimiento), cantidad: toNum(m.cantidad_signed) })), [monthMovements]);

  const outputControl = useMemo(() => {
    return monthMovements
      .filter((m) => ['traspaso', 'venta', 'envio'].some((t) => contains(m.tipo_movimiento, t)))
      .filter((m) => (dashOutProduct ? clean(m.producto).toUpperCase() === clean(dashOutProduct).toUpperCase() : true))
      .filter((m) => (dashOutLot ? normalizeLotCompareToken(clean(m.lote)) === normalizeLotCompareToken(dashOutLot) : true))
      .map((m) => ({ producto: clean(m.producto), lote: clean(m.lote), bodega: clean(m.bodega), tipo: clean(m.tipo_movimiento), cantidad: toNum(m.cantidad_signed) }));
  }, [monthMovements, dashOutProduct, dashOutLot]);

  const productStockMinMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productos) {
      const code = clean(p.producto);
      if (!code) continue;
      map.set(code, toNum(p.stock_min));
    }
    return map;
  }, [productos]);

  const productConsumoMesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productos) {
      const code = clean(p.producto);
      if (!code) continue;
      map.set(code, Math.max(0, toNum(p.consumo_mensual_cajas)));
    }
    return map;
  }, [productos]);

  const productStockOptimoMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productos) {
      const code = clean(p.producto);
      if (!code) continue;
      map.set(code, Math.max(0, toNum(p.stock_opt || p.stock_optimo)));
    }
    return map;
  }, [productos]);

  const productStockTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stockByPLB) {
      map.set(row.producto, (map.get(row.producto) || 0) + toNum(row.stock));
    }
    return map;
  }, [stockByPLB]);

  const criticalProducts = useMemo(() => {
    const list: string[] = [];
    for (const [product, total] of productStockTotals.entries()) {
      const min = productStockMinMap.get(product) || 0;
      if (min > 0 && total <= min) list.push(product);
    }
    return list.sort();
  }, [productStockTotals, productStockMinMap]);

  const monthOutputTotal = useMemo(() => {
    return outputControl.reduce((acc, row) => acc + Math.abs(toNum(row.cantidad)), 0);
  }, [outputControl]);

  const monthAdjustmentsTotal = useMemo(() => {
    return adjustmentControl.reduce((acc, row) => acc + Math.abs(toNum(row.cantidad)), 0);
  }, [adjustmentControl]);

  const productOptions = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map((p) => clean(p.producto))
            .filter((code) => code && !isRetiredProductCode(code)),
        ),
      ).sort(),
    [productos],
  );
  const movementKitComponents = useMemo(() => {
    if (editingId) return [];
    const productCode = clean(movementForm.producto).toUpperCase();
    if (!productCode) return [];
    const row = productos.find((p) => clean(p.producto).toUpperCase() === productCode);
    if (!row) return [];
    const components = normalizeKitComponents((row as any).kit_componentes || (row as any).componentes_kit);
    const mode = clean((row as any).modo_stock || (row as any).tipo_producto).toUpperCase();
    return mode === 'KIT' || components.length > 0 ? components : [];
  }, [editingId, movementForm.producto, productos]);
  const movementIsKit = movementKitComponents.length > 0;
  const movementKitComponentKey = (component: { producto: string }, index: number) => `${index}:${clean(component.producto).toUpperCase()}`;

  const movementKitLotOptionsByProduct = useMemo(() => {
    const selectedWarehouse = normalizeWarehouseAlias(movementForm.bodega);
    const rawQty = toNum(movementForm.cantidad);
    const configuredSign = toNum(signByType.get(movementForm.tipo_movimiento));
    const sign = configuredSign !== 0 ? configuredSign : inferMovementSignByType(movementForm.tipo_movimiento, rawQty);
    const isStockOutput = sign < 0 || normalizeSearch(movementForm.tipo_movimiento).includes('traspaso');
    const sourceIsHuarte = HUARTE_OWN_WAREHOUSES.has(selectedWarehouse);
    const componentProducts = Array.from(new Set(movementKitComponents.map((component) => clean(component.producto)).filter(Boolean)));
    const map = new Map<string, string[]>();
    if (componentProducts.length === 0) return map;
    const localLotStateByProductLot = buildLotStateMap(visibleLotes);

    const activeMasterRows = canetKnownActiveLotRows
      .map((l) => ({ producto: clean(l.producto), lote: clean(l.lote), bodega: normalizeWarehouseAlias((l as any).bodega) }))
      .filter((l) => !!l.producto && !!l.lote)
      .filter((l) => componentProducts.includes(l.producto))
      .filter((l) => {
        const key = lotKeyOf(l.producto, l.lote);
        return (localLotStateByProductLot.get(key) || 'ACTIVO') !== 'AGOTADO';
      });

    const stockRows = calculateInventoryStockSnapshot(sourceIsHuarte ? (huarteMovimientosShared as Movement[]) : stockBaseVisible, {
      scope: sourceIsHuarte ? 'huarte' : 'canet',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value) => clean(value),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      includeMovement: sourceIsHuarte
        ? undefined
        : (movement) => !isHuarteMirrorWarehouse(normalizeWarehouseAlias((movement as any).bodega)),
      rowTransform: (row) => {
        const safeStock = Math.max(0, toNum(row.stock));
        if (!sourceIsHuarte && isForcedAgotadoLot(row.producto, row.lote)) return { ...row, stock: 0 };
        return { ...row, stock: safeStock };
      },
      rowFilter: (row) => (sourceIsHuarte || !hiddenLotKeySet.has(lotKeyOf(row.producto, row.lote))) && toNum(row.stock) > 0,
    }).rows
      .filter((row) => componentProducts.includes(clean(row.producto)))
      .filter((row) => (selectedWarehouse ? normalizeWarehouseAlias(row.bodega) === selectedWarehouse : true))
      .filter((row) => {
        const key = lotKeyOf(row.producto, row.lote);
        return (localLotStateByProductLot.get(key) || 'ACTIVO') !== 'AGOTADO' && toNum(row.stock) > 0;
      })
      .map((row) => ({ producto: clean(row.producto), lote: clean(row.lote), bodega: normalizeWarehouseAlias(row.bodega) }));

    const rows = isStockOutput ? stockRows : activeMasterRows;
    componentProducts.forEach((product) => {
      map.set(product, Array.from(new Set(rows.filter((row) => row.producto === product).map((row) => row.lote))).sort());
    });
    return map;
  }, [
    movementForm.bodega,
    movementForm.cantidad,
    movementForm.tipo_movimiento,
    movementKitComponents,
    canetKnownActiveLotRows,
    visibleLotes,
    signByType,
    stockBaseVisible,
    huarteMovimientosShared,
    hiddenLotKeySet,
  ]);
  const productByLotMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of visibleLotes) {
      const producto = clean(l.producto);
      const lote = clean(l.lote);
      if (!producto || !lote) continue;
      const set = map.get(lote) || new Set<string>();
      set.add(producto);
      map.set(lote, set);
    }
    for (const m of normalizedMovements) {
      const producto = clean(m.producto);
      const lote = clean(m.lote);
      if (!producto || !lote) continue;
      const set = map.get(lote) || new Set<string>();
      set.add(producto);
      map.set(lote, set);
    }
    return map;
  }, [visibleLotes, normalizedMovements]);

  const lotOptions = useMemo(() => {
    const all = Array.from(new Set(visibleLotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (productFilters.length === 0) return all;
    return all.filter((lot) => {
      const set = productByLotMap.get(lot) || new Set<string>();
      return productFilters.some((p) => set.has(p));
    });
  }, [visibleLotes, productFilters, productByLotMap]);

  const dashMoveLotOptions = useMemo(() => {
    const all = Array.from(new Set(visibleLotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (!dashMoveProduct) return all;
    return all.filter((lot) => (productByLotMap.get(lot) || new Set<string>()).has(dashMoveProduct));
  }, [visibleLotes, dashMoveProduct, productByLotMap]);

  const dashOutLotOptions = useMemo(() => {
    const all = Array.from(new Set(visibleLotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (!dashOutProduct) return all;
    return all.filter((lot) => (productByLotMap.get(lot) || new Set<string>()).has(dashOutProduct));
  }, [visibleLotes, dashOutProduct, productByLotMap]);

  const warehouseOptions = useMemo(() => Array.from(new Set(activeBodegas.map((b) => clean(b.bodega)).filter(Boolean))).sort(), [activeBodegas]);
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
  const transferNodeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...TRANSFER_NODE_OPTIONS,
          ...warehouseOptions.map((v) => normalizeWarehouseAlias(v)),
        ]),
      )
        .filter(Boolean)
        .filter(isSelectableTransferWarehouse)
        .sort(),
    [warehouseOptions],
  );

  useEffect(() => {
    if (!lotFilter) return;
    const products = Array.from(productByLotMap.get(lotFilter) || []);
    if (products.length === 0) return;
    if (productFilters.length === 0) {
      if (products.length === 1) setProductFilters([products[0]]);
      return;
    }
    if (!productFilters.every((p) => products.includes(p))) {
      setProductFilters((prev) => prev.filter((p) => products.includes(p)));
    }
  }, [lotFilter, productFilters, productByLotMap]);

  useEffect(() => {
    if (!lotFilter) return;
    if (lotOptions.includes(lotFilter)) return;
    setLotFilter('');
  }, [productFilters, lotFilter, lotOptions]);

  useEffect(() => {
    if (!dashMoveLot) return;
    const products = Array.from(productByLotMap.get(dashMoveLot) || []);
    if (products.length === 0) return;
    if (!dashMoveProduct && products.length === 1) {
      setDashMoveProduct(products[0]);
      return;
    }
    if (dashMoveProduct && !products.includes(dashMoveProduct)) {
      setDashMoveProduct(products[0]);
    }
  }, [dashMoveLot, dashMoveProduct, productByLotMap]);

  useEffect(() => {
    if (!dashMoveLot) return;
    if (dashMoveLotOptions.includes(dashMoveLot)) return;
    setDashMoveLot('');
  }, [dashMoveProduct, dashMoveLot, dashMoveLotOptions]);

  useEffect(() => {
    if (!dashOutLot) return;
    const products = Array.from(productByLotMap.get(dashOutLot) || []);
    if (products.length === 0) return;
    if (!dashOutProduct && products.length === 1) {
      setDashOutProduct(products[0]);
      return;
    }
    if (dashOutProduct && !products.includes(dashOutProduct)) {
      setDashOutProduct(products[0]);
    }
  }, [dashOutLot, dashOutProduct, productByLotMap]);

  useEffect(() => {
    if (!dashOutLot) return;
    if (dashOutLotOptions.includes(dashOutLot)) return;
    setDashOutLot('');
  }, [dashOutProduct, dashOutLot, dashOutLotOptions]);

  const canonicalKnownCanetLotRows = useMemo(
    () => [...canetKnownActiveLotRows, ...CANET_LOT_REFERENCE_ROWS],
    [canetKnownActiveLotRows],
  );

  const inventoryAuditFindings = useMemo<InventoryAuditFinding[]>(() => {
    const findings: InventoryAuditFinding[] = [];
    const addFinding = (finding: InventoryAuditFinding) => findings.push(finding);
    const closedByMonth = new Map(
      (monthlyClosures || [])
        .filter((snapshot) => snapshot.scope === 'canet')
        .map((snapshot) => [snapshot.monthKey, snapshot]),
    );
    const actualMovements = [...movimientos, ...(huarteMovimientosShared as Movement[])];

    for (const snapshot of closedByMonth.values()) {
      const closeEnd = monthEndDateFromKey(snapshot.monthKey);
      if (!closeEnd) continue;
      const recalculationBase = buildStockBaseFromSnapshot(getLatestCanetCloseBeforeMonth(snapshot.monthKey), closeEnd);
      const source = recalculationBase || normalizedMovements;
      const rows = source.filter((movement) => {
        if (clean(movement.afecta_stock).toUpperCase() !== 'SI') return false;
        const movementDate = dateFromAny(clean(movement.fecha));
        if (movementDate && movementDate > closeEnd) return false;
        return !hiddenLotKeySet.has(lotKeyOf(movement.producto, movement.lote));
      });
      const currentRows = calculateInventoryStockSnapshot(rows, {
        scope: 'canet',
        normalizeProduct: (value) => clean(value),
        normalizeLot: (value) => clean(value),
        normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
        includeMovement: (movement) => !isHuarteMirrorWarehouse(normalizeWarehouseAlias(movement.bodega)),
        rowTransform: (row) => {
          const safeStock = Math.max(0, toNum(row.stock));
          if (isForcedAgotadoLot(row.producto, row.lote)) return { ...row, stock: 0 };
          return { ...row, stock: safeStock };
        },
        rowFilter: (row) => toNum(row.stock) > 0,
      }).rows;
      const drift = getInventoryMonthlyCloseDrift(snapshot, currentRows);
      if (drift.changed) {
        addFinding({
          severity: 'crítico',
          category: 'Cierre cambió',
          period: snapshot.monthLabel || monthLabel(snapshot.monthKey),
          product: '-',
          lot: '-',
          warehouse: '-',
          detail: `La vista recalculada ya no coincide con el cierre congelado: Δ stock ${drift.stockDelta.toLocaleString('es-ES')} · Δ filas ${drift.rowDelta.toLocaleString('es-ES')}.`,
        });
      }
    }

    for (const movement of normalizedMovements) {
      const movementDate = dateFromAny(clean(movement.fecha));
      if (!movementDate) continue;
      const movementMonth = monthKeyFromDate(movementDate);
      const touchedDate = dateFromAny(clean(movement.updated_at || movement.created_at));
      if (!touchedDate) continue;
      const closed = closedByMonth.get(movementMonth);
      if (closed && touchedDate.getTime() > new Date(closed.closedAt).getTime()) {
        addFinding({
          severity: 'revisar',
          category: 'Movimiento posterior al cierre',
          period: monthLabel(movementMonth),
          product: clean(movement.producto) || '-',
          lot: clean(movement.lote) || '-',
          warehouse: normalizeWarehouseAlias(movement.bodega) || '-',
          detail: `Movimiento ${movement.id} fechado el ${clean(movement.fecha)} fue creado/editado el ${touchedDate.toLocaleString('es-ES')} después del cierre.`,
        });
      } else if (touchedDate.getFullYear() > movementDate.getFullYear() || touchedDate.getMonth() > movementDate.getMonth()) {
        addFinding({
          severity: 'info',
          category: 'Movimiento antiguo tocado después',
          period: monthLabel(movementMonth),
          product: clean(movement.producto) || '-',
          lot: clean(movement.lote) || '-',
          warehouse: normalizeWarehouseAlias(movement.bodega) || '-',
          detail: `Movimiento ${movement.id} fechado el ${clean(movement.fecha)} fue creado/editado el ${touchedDate.toLocaleString('es-ES')}.`,
        });
      }
    }

    for (const movement of movimientos) {
      const product = clean(movement.producto);
      const lot = clean(movement.lote);
      if (!product || !lot || !isShortLegacyLotAlias(lot)) continue;
      const canonical = canonicalLotForProduct(canonicalKnownCanetLotRows, product, lot);
      addFinding({
        severity: canonical !== lot ? 'revisar' : 'crítico',
        category: 'Lote corto',
        period: clean(movement.fecha) || '-',
        product,
        lot,
        warehouse: normalizeWarehouseAlias(movement.bodega) || '-',
        detail: canonical !== lot
          ? `Movimiento ${movement.id} usa lote corto; candidato normalizado: ${canonical}.`
          : `Movimiento ${movement.id} usa lote corto y no se encontró un lote largo inequívoco.`,
      });
    }

    const allStockRows = calculateInventoryStockSnapshot(normalizedMovements.filter((movement) => clean(movement.afecta_stock).toUpperCase() === 'SI'), {
      scope: 'canet',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value) => clean(value),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      includeMovement: (movement) => !isHuarteMirrorWarehouse(normalizeWarehouseAlias(movement.bodega)),
      rowTransform: (row) => ({ ...row, stock: Math.max(0, toNum(row.stock)) }),
      rowFilter: (row) => toNum(row.stock) > 0,
    }).rows;
    for (const row of allStockRows) {
      if (!hiddenLotKeySet.has(lotKeyOf(row.producto, row.lote))) continue;
      addFinding({
        severity: 'crítico',
        category: 'Lote oculto con stock',
        period: 'Actual',
        product: row.producto,
        lot: row.lote,
        warehouse: row.bodega,
        detail: `El lote está agotado/archivado pero el cálculo encuentra ${toNum(row.stock).toLocaleString('es-ES')} uds. Puede impedir seleccionar el lote o esconder stock real.`,
      });
    }

    const actualTransferEntries = actualMovements.filter((movement) => isInventoryTransferInType(clean(movement.tipo_movimiento)));
    for (const movement of actualMovements) {
      if (!isInventoryTransferOutType(clean(movement.tipo_movimiento))) continue;
      const origin = normalizeWarehouseAlias(movement.bodega);
      const destination = normalizeWarehouseAlias(clean(movement.destino || movement.cliente));
      const product = clean(movement.producto);
      const lot = canonicalLotForProduct(canonicalKnownCanetLotRows, product, clean(movement.lote));
      const qty = Math.abs(toNum((movement as any).cantidad_signed || movement.cantidad));
      if (!origin || !destination || origin === destination || !product || !lot || qty <= 0) continue;
      const hasEntry = actualTransferEntries.some((candidate) => {
        const candidateQty = Math.abs(toNum((candidate as any).cantidad_signed || candidate.cantidad));
        return (
          normalizeWarehouseAlias(candidate.bodega) === destination &&
          clean(candidate.producto) === product &&
          normalizeLotCompareToken(candidate.lote) === normalizeLotCompareToken(lot) &&
          Math.abs(candidateQty - qty) < 0.000001
        );
      });
      if (!hasEntry) {
        addFinding({
          severity: 'revisar',
          category: 'Traspaso sin entrada real',
          period: clean(movement.fecha) || '-',
          product,
          lot,
          warehouse: `${origin} -> ${destination}`,
          detail: `Movimiento ${movement.id} descuenta ${qty.toLocaleString('es-ES')} uds, pero no se encontró entrada real equivalente. Puede existir entrada calculada en pantalla, no guardada en base.`,
        });
      }
    }

    const severityRank = { crítico: 0, revisar: 1, info: 2 } as const;
    return findings
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.category.localeCompare(b.category))
      .slice(0, 250);
  }, [
    buildStockBaseFromSnapshot,
    canonicalKnownCanetLotRows,
    getLatestCanetCloseBeforeMonth,
    hiddenLotKeySet,
    huarteMovimientosShared,
    monthlyClosures,
    movimientos,
    normalizedMovements,
  ]);

  const inventoryAuditSummary = useMemo(() => ({
    critical: inventoryAuditFindings.filter((item) => item.severity === 'crítico').length,
    review: inventoryAuditFindings.filter((item) => item.severity === 'revisar').length,
    info: inventoryAuditFindings.filter((item) => item.severity === 'info').length,
  }), [inventoryAuditFindings]);

  const inventoryProductMetaByCode = useMemo(() => {
    const map = new Map<string, { modo: string; vialesPorCaja: number }>();
    for (const row of productos) {
      const producto = clean(row.producto);
      if (!producto) continue;
      map.set(producto, {
        modo: clean(row.modo_stock).toUpperCase(),
        vialesPorCaja: Math.max(0, toNum(row.viales_por_caja)),
      });
    }
    return map;
  }, [productos]);

  const stockByProductLotToken = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of normalizedMovements) {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') continue;
      const producto = clean(m.producto);
      const lote = canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(m.lote));
      if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
      const key = lotKeyOf(producto, lote);
      map.set(key, (map.get(key) || 0) + toNum(m.cantidad_signed));
    }
    return map;
  }, [canonicalKnownCanetLotRows, normalizedMovements]);

  const assemblyBoxesByProductLotToken = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of normalizedMovements) {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') continue;
      const tipo = normalizeSearch(clean(m.tipo_movimiento));
      if (!tipo.includes('ensambl')) continue;
      const qty = Math.max(0, toNum(m.cantidad_signed));
      if (qty <= 0) continue;
      const producto = clean(m.producto);
      const lote = canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(m.lote));
      if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
      const key = lotKeyOf(producto, lote);
      map.set(key, (map.get(key) || 0) + qty);
    }
    return map;
  }, [canonicalKnownCanetLotRows, normalizedMovements]);

  const assemblyBoxesSpainByProductLotToken = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of normalizedMovements) {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') continue;
      const tipo = normalizeSearch(clean(m.tipo_movimiento));
      if (!tipo.includes('ensamblaje_esp')) continue;
      const qty = Math.max(0, toNum(m.cantidad_signed));
      if (qty <= 0) continue;
      const producto = clean(m.producto);
      const lote = canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(m.lote));
      if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
      const key = lotKeyOf(producto, lote);
      map.set(key, (map.get(key) || 0) + qty);
    }
    return map;
  }, [canonicalKnownCanetLotRows, normalizedMovements]);

  const assemblyBoxesColombiaByProductLotToken = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of normalizedMovements) {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') continue;
      const tipo = normalizeSearch(clean(m.tipo_movimiento));
      if (!tipo.includes('ensamblaje_col')) continue;
      const qty = Math.max(0, toNum(m.cantidad_signed));
      if (qty <= 0) continue;
      const producto = clean(m.producto);
      const lote = canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(m.lote));
      if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
      const key = lotKeyOf(producto, lote);
      map.set(key, (map.get(key) || 0) + qty);
    }
    return map;
  }, [canonicalKnownCanetLotRows, normalizedMovements]);

  const inferredLotVialesByKey = useMemo(() => {
    const inboundBoxes = new Map<string, number>();
    for (const m of normalizedMovements) {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') continue;
      const bodega = normalizeWarehouseAlias(clean(m.bodega)).toUpperCase();
      if (bodega !== 'CANET') continue;
      const producto = clean(m.producto);
      const meta = inventoryProductMetaByCode.get(producto);
      if (!meta || meta.modo !== 'ENSAMBLAJE' || meta.vialesPorCaja <= 0) continue;
      const lote = canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(m.lote));
      if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
      const key = lotKeyOf(producto, lote);
      const tipo = normalizeSearch(clean(m.tipo_movimiento));
      const qty = Math.max(0, toNum(m.cantidad_signed));
      if (qty <= 0) continue;
      if (tipo.includes('entrada') || tipo.includes('devol')) {
        inboundBoxes.set(key, (inboundBoxes.get(key) || 0) + qty);
      }
    }

    const map = new Map<string, number>();
    for (const lotKey of new Set<string>([
      ...Array.from(inboundBoxes.keys()),
    ])) {
      const [producto] = lotKey.split('|');
      const meta = inventoryProductMetaByCode.get(producto);
      if (!meta || meta.vialesPorCaja <= 0) continue;
      const boxes = inboundBoxes.get(lotKey) || 0;
      if (boxes <= 0) continue;
      map.set(lotKey, Math.round(boxes * meta.vialesPorCaja));
    }
    return map;
  }, [canonicalKnownCanetLotRows, inventoryProductMetaByCode, normalizedMovements]);

  const seedLotByKey = useMemo(() => {
    const map = new Map<string, GenericRow>();
    for (const row of (seed.lotes as GenericRow[])) {
      const producto = clean(row.producto);
      const lote = canonicalLotForProduct(seed.lotes as GenericRow[], producto, clean(row.lote));
      if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
      map.set(lotKeyOf(producto, lote), { ...row, lote });
    }
    return map;
  }, []);

  const effectiveLotVialesByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of visibleLotes) {
      const producto = clean(row.producto);
      const lote = clean(row.lote);
      if (!producto || !lote) continue;
      const key = lotKeyOf(producto, lote);
      const currentViales = toVialesNum((row as any).viales_recibidos);
      const seedViales = toVialesNum((seedLotByKey.get(key) as any)?.viales_recibidos);
      const inferredViales = inferredLotVialesByKey.get(key) || 0;
      const correctedViales = LOT_VIALES_CORRECTIONS.get(key) || 0;
      map.set(key, Math.max(currentViales, seedViales, inferredViales, correctedViales));
    }
    return map;
  }, [inferredLotVialesByKey, seedLotByKey, visibleLotes]);

  const effectiveLotCaducityByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of visibleLotes) {
      const producto = clean(row.producto);
      const lote = clean(row.lote);
      if (!producto || !lote) continue;
      const key = lotKeyOf(producto, lote);
      const currentCaducity = clean((row as any).fecha_caducidad);
      const seedCaducity = clean((seedLotByKey.get(key) as any)?.fecha_caducidad);
      map.set(key, currentCaducity || seedCaducity || '');
    }
    return map;
  }, [seedLotByKey, visibleLotes]);

  const controlStockRows = useMemo(() => {
    const productMeta = new Map<string, { vialesPorCaja: number; consumoMensual: number; modo: string }>();
    for (const p of productos) {
      const code = clean(p.producto);
      if (!code) continue;
      productMeta.set(code, {
        vialesPorCaja: toNum(p.viales_por_caja),
        consumoMensual: toNum(p.consumo_mensual_cajas),
        modo: clean(p.modo_stock).toUpperCase(),
      });
    }

    const stockByProductLot = new Map<string, number>();
    for (const row of stockByPLB) {
      const bodega = clean(row.bodega).toUpperCase();
      if (bodega === 'CANET' || bodega === 'HUARTE') {
        const key = `${row.producto}|${row.lote}`;
        stockByProductLot.set(key, (stockByProductLot.get(key) || 0) + toNum(row.stock));
      }
    }

    const lotAssemblyFinalizedByKey = buildLotAssemblyFinalizedMapFromEntries(visibleLotes, lotAssemblyFinalizations);

    return visibleLotes
      .map((l) => {
        const producto = clean(l.producto);
        const lote = clean(l.lote);
        if (!producto || !lote) return null;

        const meta = productMeta.get(producto) || { vialesPorCaja: 0, consumoMensual: 0, modo: 'DIRECTO' };
        const vialesRecibidos = effectiveLotVialesByKey.get(lotKeyOf(producto, lote)) || 0;
        const stockActualCajas = toNum(stockByProductLot.get(`${producto}|${lote}`) || 0);
        const cajasPotencialesRaw =
          meta.modo === 'ENSAMBLAJE' && meta.vialesPorCaja > 0
            ? vialesRecibidos / meta.vialesPorCaja
            : 0;
        const lotFinalizado = lotAssemblyFinalizedByKey.get(lotKeyOf(producto, lote)) === 'SI';
        const estadoLote = normalizeLotState(l.estado);
        const cajasEnsambladas = Math.min(
          Math.max(0, cajasPotencialesRaw),
          Math.max(0, toNum(assemblyBoxesByProductLotToken.get(lotKeyOf(producto, lote)) || 0)),
        );
        const cajasPotenciales = estadoLote === 'AGOTADO' || lotFinalizado ? 0 : Math.max(0, cajasPotencialesRaw - cajasEnsambladas);
        const coberturaMeses =
          meta.consumoMensual > 0
            ? (stockActualCajas + cajasPotenciales) / meta.consumoMensual
            : 0;

        let semaforo: 'AGOTADO' | 'ROJO' | 'AMARILLO' | 'VERDE' = 'VERDE';
        if (estadoLote === 'AGOTADO' || coberturaMeses <= 0) semaforo = 'AGOTADO';
        else if (coberturaMeses < 3) semaforo = 'ROJO';
        else if (coberturaMeses < 4) semaforo = 'AMARILLO';

        const minStock = MIN_STOCK_CANET_HUARTE[producto] || 0;
        const isBelowMin = minStock > 0 && stockActualCajas < minStock;

        return {
          producto,
          lote,
          modo: meta.modo || 'DIRECTO',
          vialesRecibidos,
          vialesPorCaja: meta.vialesPorCaja,
          estadoLote,
          ensamblajeFinalizado: lotFinalizado,
          stockActualCajas,
          cajasPotenciales,
          consumoMensual: meta.consumoMensual,
          coberturaMeses,
          semaforo,
          minStock,
          isBelowMin,
        };
      })
      .filter(Boolean)
      .filter((r: any) => (productFilters.length > 0 ? productFilters.includes(r.producto) : true))
      .filter((r: any) => (controlSemaforoFilter ? r.semaforo === controlSemaforoFilter : true))
      .sort((a: any, b: any) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
  }, [effectiveLotVialesByKey, visibleLotes, productos, stockByPLB, productFilters, controlSemaforoFilter]);

  const stockControlTables = useMemo(() => {
    const matchesScope = (producto: string, lote: string) => {
      if (productFilters.length > 0 && !productFilters.includes(producto)) return false;
      if (lotFilter && lotFilter !== lote) return false;
      if (quickSearch) {
        const q = normalizeSearch(quickSearch);
        const hay = normalizeSearch(`${producto} ${lote}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const canetLotsByProduct = new Map<string, string[]>();
    const allCanetLots: string[] = [];
    for (const l of visibleLotes) {
      const producto = clean(l.producto);
      const lote = clean(l.lote);
      if (!producto || !lote) continue;
      allCanetLots.push(lote);
      if (!canetLotsByProduct.has(producto)) canetLotsByProduct.set(producto, []);
      const list = canetLotsByProduct.get(producto)!;
      if (!list.includes(lote)) list.push(lote);
    }
    const canonicalCanetLot = (productoRaw: string, loteRaw: string) => {
      const producto = clean(productoRaw);
      const lote = clean(loteRaw);
      if (isInvalidLegacyLot(producto, lote)) return lote;
      if (!producto || !lote) return lote;
      const token = normalizeLotCompareToken(lote);
      const productLots = canetLotsByProduct.get(producto) || [];
      const productMatches = productLots.filter((candidate) => normalizeLotCompareToken(candidate).endsWith(token));
      if (productMatches.length > 0) {
        const preferred = [...productMatches].sort((a, b) => clean(b).length - clean(a).length)[0];
        if (preferred) return preferred;
      }
      const globalMatches = allCanetLots.filter((candidate) => normalizeLotCompareToken(candidate).endsWith(token));
      if (globalMatches.length === 1) return globalMatches[0];
      return lote;
    };
    const canetStockByLot = new Map<string, number>();
    const sellableStockByLot = new Map<string, number>();
    const sellableStockBreakdownByLot = new Map<string, Map<string, number>>();
    const addSellableStock = (producto: string, lote: string, bodega: string, stock: number) => {
      const safeStock = Math.max(0, toNum(stock));
      if (safeStock <= 0) return;
      if (!SELLABLE_STOCK_WAREHOUSE_SET.has(bodega)) return;
      const key = `${producto}|${lote}`;
      sellableStockByLot.set(key, (sellableStockByLot.get(key) || 0) + safeStock);
      if (!sellableStockBreakdownByLot.has(key)) sellableStockBreakdownByLot.set(key, new Map<string, number>());
      const byWarehouse = sellableStockBreakdownByLot.get(key)!;
      byWarehouse.set(bodega, (byWarehouse.get(bodega) || 0) + safeStock);
    };
    for (const row of stockByPLB) {
      const producto = clean(row.producto);
      if (isInvalidLegacyLot(producto, clean(row.lote))) continue;
      const lote = canonicalCanetLot(producto, clean(row.lote));
      if (!producto || !lote || !matchesScope(producto, lote)) continue;
      const bodega = normalizeWarehouseAlias(clean(row.bodega)).toUpperCase();
      const stock = Math.max(0, toNum(row.stock));
      if (bodega === 'CANET') {
        const key = `${producto}|${lote}`;
        canetStockByLot.set(key, (canetStockByLot.get(key) || 0) + stock);
      }
      addSellableStock(producto, lote, bodega, stock);
    }

    const huarteRawStockByPLB = new Map<string, number>();
    for (const m of huarteMovimientosShared) {
      if (clean(m?.afecta_stock || 'SI').toUpperCase() !== 'SI') continue;
      const d = dateFromAny(clean(m?.fecha));
      if (periodEnd && d && d > periodEnd) continue;
      const producto = clean(m?.producto);
      if (isInvalidLegacyLot(producto, clean(m?.lote))) continue;
      const lote = canonicalCanetLot(producto, clean(m?.lote));
      if (!producto || !lote || !matchesScope(producto, lote)) continue;
      const bodega = normalizeWarehouseAlias(clean(m?.bodega)).toUpperCase();
      // Keep this aligned with Inventario Huarte visual stock sign inference.
      const signed = inferSignedQuantityLoose({
        cantidad: toNum(m?.cantidad),
        cantidad_signed: m?.cantidad_signed,
        signo: toNum(m?.signo),
        tipo_movimiento: clean(m?.tipo_movimiento),
      });
      const key = `${producto}|${lote}|${bodega}`;
      huarteRawStockByPLB.set(key, (huarteRawStockByPLB.get(key) || 0) + signed);
    }

    // Reproduce "visual stock" behavior: stock is shown by bodega and clipped to non-negative.
    const huarteVisualTotalByLot = new Map<string, number>();
    const huarteVisualCanetByLot = new Map<string, number>();
    const huarteVisualHuarteOnlyByLot = new Map<string, number>();
    const huarteVisualSellableByLot = new Map<string, number>();
    for (const [key, raw] of huarteRawStockByPLB.entries()) {
      const [producto, lote, bodega] = key.split('|');
      const safeStock = Math.max(0, Math.round(toNum(raw)));
      if (safeStock <= 0) continue;
      const lotKey = `${producto}|${lote}`;
      huarteVisualTotalByLot.set(lotKey, (huarteVisualTotalByLot.get(lotKey) || 0) + safeStock);
      if (bodega === 'CANET') {
        huarteVisualCanetByLot.set(lotKey, (huarteVisualCanetByLot.get(lotKey) || 0) + safeStock);
      }
      if (isHuarteAlias(bodega)) {
        huarteVisualHuarteOnlyByLot.set(lotKey, (huarteVisualHuarteOnlyByLot.get(lotKey) || 0) + safeStock);
      }
      if (bodega === 'HUARTE') {
        huarteVisualSellableByLot.set(lotKey, (huarteVisualSellableByLot.get(lotKey) || 0) + safeStock);
      }
    }
    const huarteVisualCacheByLot = new Map<string, number>();
    const huarteVisualCacheCanetByLot = new Map<string, number>();
    const huarteVisualCacheHuarteByLot = new Map<string, number>();
    const huarteVisualCacheSellableByLot = new Map<string, number>();
    const hasCacheBreakdown = !!(
      huarteVisualStockByLotCache &&
      clean(huarteVisualStockByLotCache.monthKey) === clean(periodFileKey) &&
      huarteVisualStockByLotCache.byLotBodega &&
      Object.keys(huarteVisualStockByLotCache.byLotBodega).length > 0
    );
    if (huarteVisualStockByLotCache && clean(huarteVisualStockByLotCache.monthKey) === clean(periodFileKey)) {
      Object.entries(huarteVisualStockByLotCache.byLot || {}).forEach(([key, value]) => {
        const [producto, lote] = key.split('|');
        if (!producto || !lote || !matchesScope(producto, lote)) return;
        huarteVisualCacheByLot.set(`${producto}|${lote}`, Math.max(0, toNum(value)));
      });
      Object.entries(huarteVisualStockByLotCache.byLotBodega || {}).forEach(([key, value]) => {
        const [producto, lote, bodegaRaw] = key.split('|');
        if (!producto || !lote || !bodegaRaw || !matchesScope(producto, lote)) return;
        const bodega = normalizeWarehouseAlias(bodegaRaw).toUpperCase();
        const lotKey = `${producto}|${lote}`;
        const safe = Math.max(0, toNum(value));
        if (bodega === 'CANET') {
          huarteVisualCacheCanetByLot.set(lotKey, (huarteVisualCacheCanetByLot.get(lotKey) || 0) + safe);
        }
        if (isHuarteAlias(bodega)) {
          huarteVisualCacheHuarteByLot.set(lotKey, (huarteVisualCacheHuarteByLot.get(lotKey) || 0) + safe);
        }
        if (bodega === 'HUARTE') {
          huarteVisualCacheSellableByLot.set(lotKey, (huarteVisualCacheSellableByLot.get(lotKey) || 0) + safe);
        }
      });
    }
    const huarteSellableSource = hasCacheBreakdown ? huarteVisualCacheSellableByLot : huarteVisualSellableByLot;
    for (const [key, stock] of huarteSellableSource.entries()) {
      const [producto, lote] = key.split('|');
      if (!producto || !lote || !matchesScope(producto, lote)) continue;
      addSellableStock(producto, lote, 'HUARTE', stock);
    }

    const productMeta = new Map<
      string,
      {
        stockMin: number;
        stockOptimo: number;
        consumoMensual: number;
        modo: string;
        vialesPorCaja: number;
      }
    >();
    for (const p of productos) {
      const producto = clean(p.producto);
      if (!producto || producto.toUpperCase() === 'PRODUCTO') continue;
      productMeta.set(producto, {
        stockMin: toNum(p.stock_min),
        stockOptimo: toNum(p.stock_opt || p.stock_optimo),
        consumoMensual: toNum(p.consumo_mensual_cajas),
        modo: clean(p.modo_stock).toUpperCase(),
        vialesPorCaja: toNum(p.viales_por_caja),
      });
    }

    const lotStateByKey = buildLotStateMap(visibleLotes);
    const lotAssemblyFinalizedByKey = buildLotAssemblyFinalizedMapFromEntries(visibleLotes, lotAssemblyFinalizations);
    const lotBase = new Map<string, { producto: string; lote: string; viales: number }>();
    for (const l of visibleLotes) {
      const producto = clean(l.producto);
      const lote = clean(l.lote);
      if (producto.toUpperCase() === 'PRODUCTO') continue;
      if (!producto || !lote || !matchesScope(producto, lote)) continue;
      const key = `${producto}|${lote}`;
      const viales = effectiveLotVialesByKey.get(lotKeyOf(producto, lote)) || 0;
      if (!lotBase.has(key)) {
        lotBase.set(key, { producto, lote, viales });
      } else {
        lotBase.get(key)!.viales = Math.max(lotBase.get(key)!.viales, viales);
      }
    }
    for (const key of new Set<string>([
      ...Array.from(canetStockByLot.keys()),
      ...Array.from(sellableStockByLot.keys()),
      ...Array.from(huarteVisualTotalByLot.keys()),
      ...Array.from(huarteVisualCacheByLot.keys()),
    ])) {
      if (lotBase.has(key)) continue;
      const [producto, lote] = key.split('|');
      if (clean(producto).toUpperCase() === 'PRODUCTO') continue;
      if (!producto || !lote || !matchesScope(producto, lote)) continue;
      lotBase.set(key, { producto, lote, viales: 0 });
    }

    const potentialRows: Array<{
      producto: string;
      lotes: number;
      viales: number;
      salidas: number;
      potencialCajas: number;
      stockVendible: number;
      stockCHP: number;
      stockOptimo: number;
      consumoMes: number;
      coberturaMeses: number;
      estadoStock: 'AGOTADO' | 'OPTIMO' | 'ATENCION' | 'CRITICO';
    }> = [];
    const potentialLotRows: Array<{
      producto: string;
      lote: string;
      viales: number;
      ensambladasEsp: number;
      ensambladasCol: number;
      salidas: number;
      potencialCajas: number;
      stockVendible: number;
      stockCanet: number;
      stockHuarte: number;
      stockMasBorras: number;
      stockCHP: number;
      stockOptimo: number;
      consumoMes: number;
      coberturaMeses: number;
      estadoStock: 'AGOTADO' | 'OPTIMO' | 'ATENCION' | 'CRITICO';
    }> = [];
    const canetHuarteRows: Array<{
      producto: string;
      lote: string;
      stockCanetHuarte: number;
      stockCanet: number;
      stockHuarte: number;
      stockMinCH: number;
      consumoMes: number;
      coberturaMeses: number;
      semaforo: string;
    }> = [];
    const canetRowsBase: Array<{
      producto: string;
      lote: string;
      stockCanet: number;
      stockMin: number;
      consumoMes: number;
      coberturaMeses: number;
      semaforo: string;
    }> = [];

    const potentialByProduct = new Map<
      string,
      {
        producto: string;
        lotesSet: Set<string>;
        viales: number;
        salidas: number;
        potencialCajas: number;
        stockVendible: number;
        stockOptimo: number;
        consumoMes: number;
        activeLotes: number;
      }
    >();

    for (const [key, base] of lotBase.entries()) {
      const meta = productMeta.get(base.producto) || {
        stockMin: 0,
        stockOptimo: 0,
        consumoMensual: 0,
        modo: 'DIRECTO',
        vialesPorCaja: 0,
      };
      const stockCanet = Math.max(0, toNum(canetStockByLot.get(key) || 0));
      const lotState = lotStateByKey.get(lotKeyOf(base.producto, base.lote)) || 'ACTIVO';
      const lotAssemblyFinalized = lotAssemblyFinalizedByKey.get(lotKeyOf(base.producto, base.lote)) === 'SI';
      const stockCanetFromHuarte = hasCacheBreakdown
        ? Math.max(0, toNum(huarteVisualCacheCanetByLot.get(key) || 0))
        : Math.max(0, toNum(huarteVisualCanetByLot.get(key) || 0));
      const stockHuarteOnly = hasCacheBreakdown
        ? Math.max(0, toNum(huarteVisualCacheHuarteByLot.get(key) || 0))
        : Math.max(0, toNum(huarteVisualHuarteOnlyByLot.get(key) || 0));
      const stockCanetHuarte = stockCanetFromHuarte + stockHuarteOnly;
      const stockVendible = Math.max(0, toNum(sellableStockByLot.get(key) || 0));
      const sellableBreakdown = sellableStockBreakdownByLot.get(key) || new Map<string, number>();
      const stockCanetVendible = Math.max(0, toNum(sellableBreakdown.get('CANET') || 0));
      const stockHuarteVendible = Math.max(0, toNum(sellableBreakdown.get('HUARTE') || 0));
      const stockMasBorrasVendible = Math.max(0, toNum(sellableBreakdown.get('MAS BORRAS') || 0));
      // 1) Convertir ingreso a cajas (compuestos) o mantener directo.
      const ingresoEnCajas =
        meta.modo === 'ENSAMBLAJE' && meta.vialesPorCaja > 0
          ? base.viales / meta.vialesPorCaja
          : base.viales;
      const ensambladasEsp = Math.max(0, toNum(assemblyBoxesSpainByProductLotToken.get(key) || 0));
      const ensambladasCol = Math.max(0, toNum(assemblyBoxesColombiaByProductLotToken.get(key) || 0));
      const cajasEnsambladasMovidas = Math.min(
        Math.max(0, ingresoEnCajas),
        Math.max(0, ensambladasEsp + ensambladasCol),
      );
      // Regla principal:
      // - si el lote está finalizado o agotado, la marca del lote manda y el potencial queda en 0
      // - si sigue abierto, el potencial se calcula con lo ya ensamblado en movimientos
      const salidas =
        lotState === 'AGOTADO' || lotAssemblyFinalized
          ? ingresoEnCajas
          : cajasEnsambladasMovidas;
      const potencialCajas =
        lotState === 'AGOTADO' || lotAssemblyFinalized
          ? 0
          : Math.max(0, ingresoEnCajas - cajasEnsambladasMovidas);
      const stockOptimo = Math.max(0, meta.stockOptimo);
      const consumoMes = Math.max(0, meta.consumoMensual);
      const stockDisponibleTotalLot = Math.max(0, stockVendible + potencialCajas);
      const coberturaMesesLot = consumoMes > 0 ? stockDisponibleTotalLot / consumoMes : 0;
      let lotEstadoStock: 'AGOTADO' | 'OPTIMO' | 'ATENCION' | 'CRITICO' = 'OPTIMO';
      if (lotState === 'AGOTADO') {
        lotEstadoStock = 'AGOTADO';
      } else if (consumoMes > 0) {
        lotEstadoStock = getCoverageSemaforo(coberturaMesesLot, stockDisponibleTotalLot);
      } else if (stockOptimo > 0) {
        if (stockDisponibleTotalLot < stockOptimo * 0.5) lotEstadoStock = 'CRITICO';
        else if (stockDisponibleTotalLot < stockOptimo) lotEstadoStock = 'ATENCION';
      } else if (stockDisponibleTotalLot <= 0) {
        lotEstadoStock = 'CRITICO';
      }
      potentialLotRows.push({
        producto: base.producto,
        lote: base.lote,
        viales: base.viales,
        ensambladasEsp,
        ensambladasCol,
        salidas,
        potencialCajas,
        stockVendible,
        stockCanet: stockCanetVendible,
        stockHuarte: stockHuarteVendible,
        stockMasBorras: stockMasBorrasVendible,
        stockCHP: stockDisponibleTotalLot,
        stockOptimo,
        consumoMes,
        coberturaMeses: coberturaMesesLot,
        estadoStock: lotEstadoStock,
      });
      if (!potentialByProduct.has(base.producto)) {
        potentialByProduct.set(base.producto, {
          producto: base.producto,
          lotesSet: new Set<string>(),
          viales: 0,
          salidas: 0,
          potencialCajas: 0,
          stockVendible: 0,
          stockOptimo,
          consumoMes,
          activeLotes: 0,
        });
      }
      const productAgg = potentialByProduct.get(base.producto)!;
      if (lotState !== 'AGOTADO') {
        productAgg.viales += base.viales;
        productAgg.salidas += salidas;
        productAgg.potencialCajas += potencialCajas;
        productAgg.stockVendible += stockVendible;
        productAgg.activeLotes += 1;
        if (stockDisponibleTotalLot > 0) productAgg.lotesSet.add(base.lote);
      }
      productAgg.stockOptimo = Math.max(productAgg.stockOptimo, stockOptimo);
      productAgg.consumoMes = Math.max(productAgg.consumoMes, consumoMes);

      // Table 2 must read both sides directly from Inventario Huarte visual stock.
      const stockMinCH = Math.max(0, toNum(MIN_STOCK_CANET_HUARTE[base.producto] || 0));
      const coberturaCH = consumoMes > 0 ? stockCanetHuarte / consumoMes : 0;
      const semaforoCH = getCoverageSemaforo(coberturaCH, stockCanetHuarte);
      if (lotState !== 'AGOTADO' && semaforoCH !== 'AGOTADO' && (!controlSemaforoFilter || controlSemaforoFilter === semaforoCH)) {
        canetHuarteRows.push({
          producto: base.producto,
          lote: base.lote,
          stockCanetHuarte,
          stockCanet: stockCanetFromHuarte,
          stockHuarte: stockHuarteOnly,
          stockMinCH,
          consumoMes,
          coberturaMeses: coberturaCH,
          semaforo: semaforoCH,
        });
      }

      const stockMin = Math.max(0, meta.stockMin);
      const coberturaCanet = consumoMes > 0 ? stockCanet / consumoMes : 0;
      const semaforoCanet = getCoverageSemaforo(coberturaCanet, stockCanet);
      if (lotState !== 'AGOTADO' && semaforoCanet !== 'AGOTADO' && (!controlSemaforoFilter || controlSemaforoFilter === semaforoCanet)) {
        canetRowsBase.push({
          producto: base.producto,
          lote: base.lote,
          stockCanet,
          stockMin,
          consumoMes,
          coberturaMeses: coberturaCanet,
          semaforo: semaforoCanet,
        });
      }
    }
    for (const row of potentialByProduct.values()) {
      const stockOptimo = Math.max(0, row.stockOptimo);
      const potencial = Math.max(0, row.potencialCajas);
      const stockVendible = Math.max(0, row.stockVendible);
      const stockDisponibleTotal = Math.max(0, stockVendible + potencial);
      const consumoMes = Math.max(0, row.consumoMes);
      const coberturaMeses = consumoMes > 0 ? stockDisponibleTotal / consumoMes : 0;
      let estadoStock: 'AGOTADO' | 'OPTIMO' | 'ATENCION' | 'CRITICO' = 'OPTIMO';
      if (row.activeLotes === 0) {
        estadoStock = 'AGOTADO';
      } else if (consumoMes > 0) {
        estadoStock = getCoverageSemaforo(coberturaMeses, stockDisponibleTotal);
      } else if (stockOptimo > 0) {
        if (stockDisponibleTotal < stockOptimo * 0.5) estadoStock = 'CRITICO';
        else if (stockDisponibleTotal < stockOptimo) estadoStock = 'ATENCION';
      } else if (stockDisponibleTotal <= 0) {
        estadoStock = 'CRITICO';
      }
      potentialRows.push({
        producto: row.producto,
        lotes: row.lotesSet.size,
        viales: row.viales,
        salidas: row.salidas,
        potencialCajas: potencial,
        stockVendible,
        stockCHP: stockDisponibleTotal,
        stockOptimo: stockOptimo,
        consumoMes,
        coberturaMeses,
        estadoStock,
      });
    }

    const canetRows = canetRowsBase.map((row) => {
      const potencialProducto = Math.max(0, toNum(potentialByProduct.get(row.producto)?.potencialCajas || 0));
      return {
        ...row,
        potencialesMasC: Math.max(0, row.stockCanet + potencialProducto),
      };
    });

    const sortByProductLot = <T extends { producto: string; lote: string }>(rows: T[]) =>
      rows.sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
    const sortByProduct = <T extends { producto: string }>(rows: T[]) =>
      rows.sort((a, b) => a.producto.localeCompare(b.producto));
    return {
      potentialRows: sortByProduct(potentialRows.filter((row) => row.estadoStock !== 'AGOTADO')),
      potentialLotRows: sortByProductLot(potentialLotRows.filter((row) => row.estadoStock !== 'AGOTADO' && toNum(row.stockCHP) > 0)),
      canetHuarteRows: sortByProductLot(canetHuarteRows),
      canetRows: sortByProductLot(canetRows),
    };
  }, [
    huarteMovimientosShared,
    huarteVisualStockByLotCache,
    periodFileKey,
    periodEnd,
    effectiveLotVialesByKey,
    lotAssemblyFinalizations,
    visibleLotes,
    stockByPLB,
    productos,
    productFilters,
    lotFilter,
    quickSearch,
    controlSemaforoFilter,
    isHuarteAlias,
    assemblyBoxesSpainByProductLotToken,
    assemblyBoxesColombiaByProductLotToken,
  ]);

  const stockControlDecisionRows = useMemo(() => {
    const rowsByProduct = new Map<
      string,
      {
        producto: string;
        lotes: Set<string>;
        lotesCount: number;
        stockVendible: number;
        potencialCajas: number;
        stockDisponible: number;
        stockMin: number;
        stockOptimo: number;
        consumoMes: number;
        coberturaMeses: number;
        estado: string;
        accion: string;
      }
    >();

    const ensureRow = (producto: string) => {
      if (!rowsByProduct.has(producto)) {
        rowsByProduct.set(producto, {
          producto,
          lotes: new Set<string>(),
          lotesCount: 0,
          stockVendible: 0,
          potencialCajas: 0,
          stockDisponible: 0,
          stockMin: 0,
          stockOptimo: 0,
          consumoMes: 0,
          coberturaMeses: 0,
          estado: 'AGOTADO',
          accion: 'Sin stock visible. Revisar si falta entrada o ajuste.',
        });
      }
      return rowsByProduct.get(producto)!;
    };

    for (const row of stockControlTables.potentialLotRows) {
      const producto = clean(row.producto);
      if (!producto) continue;
      const current = ensureRow(producto);
      current.lotes.add(clean(row.lote));
      current.stockVendible += Math.max(0, toNum(row.stockVendible));
      current.consumoMes = Math.max(current.consumoMes, toNum(row.consumoMes));
    }

    for (const row of stockControlTables.potentialRows) {
      const producto = clean(row.producto);
      if (!producto) continue;
      const current = ensureRow(producto);
      current.potencialCajas = Math.max(current.potencialCajas, toNum(row.potencialCajas));
      current.stockVendible = Math.max(current.stockVendible, toNum(row.stockVendible));
      current.lotesCount = Math.max(current.lotesCount, toNum(row.lotes));
      current.stockOptimo = Math.max(current.stockOptimo, toNum(row.stockOptimo));
      current.consumoMes = Math.max(current.consumoMes, toNum(row.consumoMes));
    }

    return Array.from(rowsByProduct.values())
      .map((row) => {
        const stockDisponible = Math.max(0, row.stockVendible + row.potencialCajas);
        const coberturaMeses = row.consumoMes > 0 ? stockDisponible / row.consumoMes : 0;
        const estado = getCoverageSemaforo(coberturaMeses, stockDisponible);
        const accion =
          estado === 'AGOTADO'
            ? 'Crear entrada o ajuste si existe stock físico.'
            : estado === 'CRITICO'
              ? 'Reponer o ensamblar de forma urgente.'
              : estado === 'ATENCION'
                ? 'Planificar reposición antes del próximo cierre.'
                : 'Sin acción inmediata.';
        return {
          ...row,
          lotesCount: Math.max(row.lotesCount, Array.from(row.lotes).filter(Boolean).length),
          stockDisponible,
          coberturaMeses,
          estado,
          accion,
        };
      })
      .filter((row) => (controlSemaforoFilter ? row.estado === controlSemaforoFilter : true))
      .sort((a, b) => {
        const rank: Record<string, number> = { AGOTADO: 0, CRITICO: 1, ATENCION: 2, OPTIMO: 3 };
        return (rank[a.estado] ?? 9) - (rank[b.estado] ?? 9) || a.producto.localeCompare(b.producto);
      });
  }, [controlSemaforoFilter, stockControlTables.potentialLotRows, stockControlTables.potentialRows]);

  const stockControlSummary = useMemo(() => {
    const summary = {
      agotado: 0,
      critico: 0,
      atencion: 0,
      optimo: 0,
      potencialTotal: 0,
      stockDisponibleTotal: 0,
    };
    for (const row of stockControlDecisionRows) {
      if (row.estado === 'AGOTADO') summary.agotado += 1;
      else if (row.estado === 'CRITICO') summary.critico += 1;
      else if (row.estado === 'ATENCION') summary.atencion += 1;
      else summary.optimo += 1;
      summary.potencialTotal += Math.max(0, toNum(row.potencialCajas));
      summary.stockDisponibleTotal += Math.max(0, toNum(row.stockDisponible));
    }
    return summary;
  }, [stockControlDecisionRows]);

  const stockControlDetailRows = useMemo(() => {
    if (!potentialDetailProduct) return [];
    const byLot = new Map<
      string,
      {
        producto: string;
        lote: string;
        stockVendible: number;
        stockCanet: number;
        stockHuarte: number;
        stockMasBorras: number;
        potencialCajas: number;
        disponible: number;
        consumoMes: number;
        coberturaMeses: number;
        estado: string;
      }
    >();
    const ensureLot = (producto: string, lote: string) => {
      const key = lotKeyOf(producto, lote);
      if (!byLot.has(key)) {
        byLot.set(key, {
          producto,
          lote,
          stockVendible: 0,
          stockCanet: 0,
          stockHuarte: 0,
          stockMasBorras: 0,
          potencialCajas: 0,
          disponible: 0,
          consumoMes: 0,
          coberturaMeses: 0,
          estado: 'AGOTADO',
        });
      }
      return byLot.get(key)!;
    };
    for (const row of stockControlTables.potentialLotRows) {
      if (row.producto !== potentialDetailProduct) continue;
      const current = ensureLot(row.producto, row.lote);
      current.stockVendible = Math.max(0, toNum(row.stockVendible));
      current.stockCanet = Math.max(0, toNum(row.stockCanet));
      current.stockHuarte = Math.max(0, toNum(row.stockHuarte));
      current.stockMasBorras = Math.max(0, toNum(row.stockMasBorras));
      current.potencialCajas = Math.max(0, toNum(row.potencialCajas));
      current.consumoMes = Math.max(current.consumoMes, toNum(row.consumoMes));
    }
    return Array.from(byLot.values())
      .map((row) => {
        const disponible = Math.max(0, row.stockVendible + row.potencialCajas);
        const coberturaMeses = row.consumoMes > 0 ? disponible / row.consumoMes : 0;
        return {
          ...row,
          disponible,
          coberturaMeses,
          estado: getCoverageSemaforo(coberturaMeses, disponible),
        };
      })
      .filter((row) => row.disponible > 0)
      .sort((a, b) => a.lote.localeCompare(b.lote));
  }, [potentialDetailProduct, stockControlTables.potentialLotRows]);

  const riskyProductsSummary = useMemo(() => {
    const acc = new Map<string, { producto: string; stockTotal: number; coberturaMeses: number }>();
    for (const row of controlStockRows as any[]) {
      const producto = clean(row.producto);
      if (!producto) continue;
      if (!acc.has(producto)) {
        acc.set(producto, { producto, stockTotal: 0, coberturaMeses: 0 });
      }
      const current = acc.get(producto)!;
      current.stockTotal += toNum(row.stockActualCajas);
      current.coberturaMeses = Math.min(
        current.coberturaMeses === 0 ? Number.MAX_SAFE_INTEGER : current.coberturaMeses,
        toNum(row.coberturaMeses),
      );
    }

    return Array.from(acc.values())
      .filter((r) => criticalProducts.includes(r.producto))
      .map((r) => ({
        ...r,
        coberturaMeses: r.coberturaMeses === Number.MAX_SAFE_INTEGER ? 0 : r.coberturaMeses,
      }))
      .sort((a, b) => a.coberturaMeses - b.coberturaMeses);
  }, [controlStockRows, criticalProducts]);
  const potentialDetailRows = useMemo(
    () =>
      potentialDetailProduct
        ? stockControlTables.potentialLotRows.filter(
            (r) =>
              r.producto === potentialDetailProduct &&
              !hiddenLotKeySet.has(lotKeyOf(r.producto, r.lote)),
          )
        : [],
    [hiddenLotKeySet, potentialDetailProduct, stockControlTables.potentialLotRows],
  );
  const hypotheticalRows = useMemo(() => {
    if (!hypotheticalScope) return [] as Array<{
      producto: string;
      lote: string;
      stockBase: number;
      consumoMes: number;
      stockOptimo: number;
    }>;
    if (hypotheticalScope === 'potential') {
      return stockControlTables.potentialLotRows
        .filter((r) => !hiddenLotKeySet.has(lotKeyOf(r.producto, r.lote)))
        .map((r) => ({
        producto: r.producto,
        lote: r.lote,
        stockBase: Math.max(0, toNum(r.stockCHP)),
        consumoMes: Math.max(0, toNum(r.consumoMes)),
        stockOptimo: Math.max(0, toNum(r.stockOptimo)),
      }));
    }
    if (hypotheticalScope === 'canet_huarte') {
      return stockControlTables.canetHuarteRows.map((r) => ({
        producto: r.producto,
        lote: r.lote,
        stockBase: Math.max(0, toNum(r.stockCanetHuarte)),
        consumoMes: Math.max(0, toNum(r.consumoMes)),
        stockOptimo: Math.max(0, toNum(r.stockMinCH)),
      }));
    }
    return stockControlTables.canetRows.map((r) => ({
      producto: r.producto,
      lote: r.lote,
      stockBase: Math.max(0, toNum(r.stockCanet)),
      consumoMes: Math.max(0, toNum(r.consumoMes)),
      stockOptimo: Math.max(0, toNum(r.stockMin)),
    }));
  }, [hypotheticalScope, stockControlTables.potentialLotRows, stockControlTables.canetHuarteRows, stockControlTables.canetRows]);
  const hypotheticalProducts = useMemo(
    () => Array.from(new Set(hypotheticalRows.map((r) => r.producto))).sort(),
    [hypotheticalRows],
  );
  const hypotheticalLots = useMemo(
    () =>
      Array.from(
        new Set(
          hypotheticalRows
            .filter((r) => !hypotheticalForm.producto || r.producto === hypotheticalForm.producto)
            .map((r) => r.lote),
        ),
      ).sort(),
    [hypotheticalRows, hypotheticalForm.producto],
  );
  const openHypotheticalModal = (scope: HypotheticalScope) => {
    const scopeRows =
      scope === 'potential'
        ? stockControlTables.potentialLotRows
        : scope === 'canet_huarte'
          ? stockControlTables.canetHuarteRows
          : stockControlTables.canetRows;
    const first = scopeRows[0];
    setHypotheticalScope(scope);
    setHypotheticalForm({
      producto: first?.producto || '',
      lote: first?.lote || '',
      cantidad: '',
    });
    setHypotheticalResult(null);
  };
  const closeHypotheticalModal = () => {
    setHypotheticalScope(null);
    setHypotheticalResult(null);
    setHypotheticalForm({ producto: '', lote: '', cantidad: '' });
  };
  const runHypotheticalCalc = () => {
    if (!hypotheticalScope) return;
    const producto = clean(hypotheticalForm.producto);
    const lote = clean(hypotheticalForm.lote);
    const venta = Math.max(0, toNum(hypotheticalForm.cantidad));
    if (!producto || !lote || venta <= 0) {
      window.alert('Selecciona producto, lote y una cantidad válida para calcular.');
      return;
    }
    const row = hypotheticalRows.find((r) => r.producto === producto && r.lote === lote);
    if (!row) {
      window.alert('No se encontró ese lote en la tabla seleccionada.');
      return;
    }
    const stockInicial = Math.max(0, row.stockBase);
    const stockFinal = Math.max(0, stockInicial - venta);
    const consumoMes = Math.max(0, row.consumoMes);
    const coberturaMeses = consumoMes > 0 ? stockFinal / consumoMes : 0;
    const semaforo =
      hypotheticalScope === 'potential'
        ? getPotentialSemaforo(stockFinal, row.stockOptimo)
        : getCoverageSemaforo(coberturaMeses, stockFinal);
    setHypotheticalResult({
      scope: hypotheticalScope,
      producto,
      lote,
      venta,
      stockInicial,
      stockFinal,
      consumoMes,
      coberturaMeses,
      semaforo,
    });
  };

  const caducityAlerts = useMemo(() => {
    const list = visibleLotes
      .map((l) => {
        const producto = clean(l.producto);
        const lote = clean(l.lote);
        const fecha = effectiveLotCaducityByKey.get(lotKeyOf(producto, lote)) || '';
        const d = dateFromAny(fecha);
        if (!d) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { producto, lote, fecha, days };
      })
      .filter(Boolean)
      .filter((r: any) => r.days <= 90)
      .sort((a: any, b: any) => a.days - b.days);
    return list as Array<{ producto: string; lote: string; fecha: string; days: number }>;
  }, [effectiveLotCaducityByKey, visibleLotes]);

  const mountedAndPotentialAlerts = useMemo(() => {
    const signedFromMovement = (m: any) => {
      const signed = Number(m?.cantidad_signed);
      if (Number.isFinite(signed)) return signed;
      const qty = toNum(m?.cantidad);
      const sign = toNum(m?.signo) || 1;
      return qty * sign;
    };

    const canetMovs = movimientos;
    const huarteMovs = huarteMovimientosShared;

    // Evita duplicados cuando el mismo movimiento existe en ambos módulos.
    const allMovs: any[] = [];
    const seen = new Set<string>();
    for (const m of [...huarteMovs, ...canetMovs]) {
      const sig = [
        clean(m?.fecha),
        clean(m?.tipo_movimiento),
        clean(m?.producto),
        clean(m?.lote),
        clean(m?.bodega),
        clean(m?.cliente),
        clean(m?.destino),
        clean(m?.factura_doc),
        clean(m?.cantidad),
      ].join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      allMovs.push(m);
    }

    const stockRowsForAlerts = calculateInventoryStockSnapshot(allMovs, {
      scope: 'general',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value) => clean(value),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      signedQuantity: signedFromMovement,
    }).rows;

    const mountedByProduct = new Map<string, number>();
    const mountedByProductCanetHuarte = new Map<string, number>();
    const mountedByProductBodega = new Map<string, Map<string, number>>();
    const mountedByProductLote = new Map<string, Map<string, number>>();
    for (const row of stockRowsForAlerts) {
      const producto = clean(row.producto);
      const lote = clean(row.lote);
      const bodega = normalizeWarehouseAlias(row.bodega);
      const qty = toNum(row.stock);
      const safeQty = Math.max(0, qty);
      mountedByProduct.set(producto, (mountedByProduct.get(producto) || 0) + safeQty);
      if (bodega.toUpperCase() === 'CANET' || bodega.toUpperCase() === 'HUARTE' || isHuarteMirrorWarehouse(bodega)) {
        mountedByProductCanetHuarte.set(producto, (mountedByProductCanetHuarte.get(producto) || 0) + safeQty);
      }
      if (!mountedByProductBodega.has(producto)) mountedByProductBodega.set(producto, new Map<string, number>());
      const perBodega = mountedByProductBodega.get(producto)!;
      perBodega.set(bodega, (perBodega.get(bodega) || 0) + safeQty);
      if (!mountedByProductLote.has(producto)) mountedByProductLote.set(producto, new Map<string, number>());
      const perLote = mountedByProductLote.get(producto)!;
      perLote.set(lote, (perLote.get(lote) || 0) + safeQty);
    }

    const productMeta = new Map<string, { vialesPorCaja: number; consumoMensual: number; modo: string }>();
    for (const p of productos) {
      const code = clean(p.producto);
      if (!code) continue;
      productMeta.set(code, {
        vialesPorCaja: toNum(p.viales_por_caja),
        consumoMensual: toNum(p.consumo_mensual_cajas),
        modo: clean(p.modo_stock).toUpperCase(),
      });
    }

    const lotStateByKey = buildLotStateMap(visibleLotes);
    const lotAssemblyFinalizedByKey = buildLotAssemblyFinalizedMapFromEntries(visibleLotes, lotAssemblyFinalizations);
    const potentialByProduct = new Map<string, number>();
    const potentialByProductLote = new Map<string, Map<string, number>>();
    for (const l of visibleLotes) {
      const producto = clean(l.producto);
      const lote = clean(l.lote);
      if (!producto) continue;
      const meta = productMeta.get(producto);
      if (!meta || meta.modo !== 'ENSAMBLAJE' || meta.vialesPorCaja <= 0) continue;
      const lotKey = lotKeyOf(producto, lote);
      const lotState = lotStateByKey.get(lotKey) || 'ACTIVO';
      const lotAssemblyFinalized = lotAssemblyFinalizedByKey.get(lotKey) === 'SI';
      const potential =
        lotState === 'AGOTADO' || lotAssemblyFinalized
          ? 0
          : (effectiveLotVialesByKey.get(lotKey) || 0) / meta.vialesPorCaja;
      potentialByProduct.set(producto, (potentialByProduct.get(producto) || 0) + Math.max(0, potential));
      if (!potentialByProductLote.has(producto)) potentialByProductLote.set(producto, new Map<string, number>());
      const byLote = potentialByProductLote.get(producto)!;
      byLote.set(lote, (byLote.get(lote) || 0) + Math.max(0, potential));
    }

    const allProducts = new Set<string>([
      ...Array.from(mountedByProduct.keys()),
      ...Array.from(potentialByProduct.keys()),
      ...Array.from(productMeta.keys()),
    ]);

    const mountedCritical = Array.from(allProducts)
      .map((producto) => {
        const minStock = MIN_STOCK_CANET_HUARTE[producto] || 0;
        const stockTotalCanetHuarte = toNum(mountedByProductCanetHuarte.get(producto) || 0);
        const consumo = productMeta.get(producto)?.consumoMensual || 0;
        const stockTotal = toNum(mountedByProduct.get(producto) || 0);
        const coberturaMeses = consumo > 0 ? stockTotal / consumo : 0;
        return { producto, stockTotal, coberturaMeses, minStock, stockTotalCanetHuarte };
      })
      .filter((row) => row.minStock > 0 && row.stockTotalCanetHuarte < row.minStock)
      .sort((a, b) => a.coberturaMeses - b.coberturaMeses);

    const potentialCritical = Array.from(allProducts)
      .map((producto) => {
        const consumo = productMeta.get(producto)?.consumoMensual || 0;
        const cajasPotenciales = toNum(potentialByProduct.get(producto) || 0);
        const coberturaMeses = consumo > 0 ? cajasPotenciales / consumo : 0;
        return { producto, cajasPotenciales, coberturaMeses };
      })
      .filter((row) => row.cajasPotenciales >= 0 && row.coberturaMeses >= 0 && row.coberturaMeses < 3)
      .sort((a, b) => a.coberturaMeses - b.coberturaMeses);

    const mountedVisual = Array.from(allProducts)
      .map((producto) => {
        const stockTotal = toNum(mountedByProduct.get(producto) || 0);
        const byBodegaMap = mountedByProductBodega.get(producto) || new Map<string, number>();
        const byBodega = Array.from(byBodegaMap.entries())
          .map(([bodega, cantidad]) => ({ bodega, cantidad: toNum(cantidad) }))
          .filter((row) => row.cantidad > 0)
          .sort((a, b) => b.cantidad - a.cantidad);
        return { producto, stockTotal, byBodega };
      })
      .filter((row) => row.stockTotal > 0)
      .sort((a, b) => b.stockTotal - a.stockTotal);

    const potentialVisual = Array.from(allProducts)
      .map((producto) => {
        const consumo = productMeta.get(producto)?.consumoMensual || 0;
        const cajasPotenciales = toNum(potentialByProduct.get(producto) || 0);
        const coberturaMeses = consumo > 0 ? cajasPotenciales / consumo : 0;
        return { producto, cajasPotenciales, coberturaMeses };
      })
      .filter((row) => row.cajasPotenciales > 0)
      .sort((a, b) => b.cajasPotenciales - a.cajasPotenciales);

    const mountedCriticalDetails = mountedCritical.map((row) => {
      const byBodegaMap = mountedByProductBodega.get(row.producto) || new Map<string, number>();
      const byLoteMap = mountedByProductLote.get(row.producto) || new Map<string, number>();
      return {
        producto: row.producto,
        byBodega: Array.from(byBodegaMap.entries())
          .map(([bodega, cantidad]) => ({ bodega, cantidad: toNum(cantidad) }))
          .filter((x) => x.cantidad > 0)
          .sort((a, b) => b.cantidad - a.cantidad),
        byLote: Array.from(byLoteMap.entries())
          .map(([lote, cantidad]) => ({ lote, cantidad: toNum(cantidad) }))
          .filter((x) => x.cantidad > 0)
          .sort((a, b) => b.cantidad - a.cantidad),
      };
    });

    const potentialCriticalDetails = potentialCritical.map((row) => {
      const byLoteMap = potentialByProductLote.get(row.producto) || new Map<string, number>();
      return {
        producto: row.producto,
        byLote: Array.from(byLoteMap.entries())
          .map(([lote, cantidad]) => ({ lote, cantidad: toNum(cantidad) }))
          .filter((x) => x.cantidad > 0)
          .sort((a, b) => b.cantidad - a.cantidad),
      };
    });

    const globalStockByProductLot = Array.from(mountedByProductLote.entries())
      .flatMap(([producto, byLote]) =>
        Array.from(byLote.entries()).map(([lote, stockTotal]) => ({
          producto,
          lote,
          stockTotal: toNum(stockTotal),
        })),
      )
      .filter((row) => row.stockTotal > 0)
      .sort((a, b) => b.stockTotal - a.stockTotal);

    const globalStockByProductLotBodega = stockRowsForAlerts
      .map((row) => ({
        producto: row.producto,
        lote: row.lote,
        bodega: row.bodega,
        stockTotal: toNum(Math.max(0, row.stock)),
      }))
      .filter((row) => row.stockTotal > 0)
      .sort((a, b) => b.stockTotal - a.stockTotal);

    return {
      mountedCritical,
      potentialCritical,
      mountedVisual,
      potentialVisual,
      mountedCriticalDetails,
      potentialCriticalDetails,
      globalStockByProductLot,
      globalStockByProductLotBodega,
    };
  }, [effectiveLotVialesByKey, productos, visibleLotes]);

  useEffect(() => {
    // Prevent write saturation: only admins publish shared dashboard snapshots.
    if (!actorIsAdmin) return;
    const payload = {
      criticalProducts: riskyProductsSummary.slice(0, 12).map((r) => ({
        producto: r.producto,
        stockTotal: Number(r.stockTotal.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
      })),
      caducity: caducityAlerts.slice(0, 20),
      mountedCritical: mountedAndPotentialAlerts.mountedCritical.slice(0, 12).map((r) => ({
        producto: r.producto,
        stockTotal: Number(r.stockTotal.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
      })),
      potentialCritical: mountedAndPotentialAlerts.potentialCritical.slice(0, 12).map((r) => ({
        producto: r.producto,
        cajasPotenciales: Number(r.cajasPotenciales.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
      })),
      mountedVisual: mountedAndPotentialAlerts.mountedVisual.slice(0, 24).map((r) => ({
        producto: r.producto,
        stockTotal: Number(r.stockTotal.toFixed(2)),
        byBodega: r.byBodega.map((b) => ({
          bodega: b.bodega,
          cantidad: Number(b.cantidad.toFixed(2)),
        })),
      })),
      potentialVisual: mountedAndPotentialAlerts.potentialVisual.slice(0, 24).map((r) => ({
        producto: r.producto,
        cajasPotenciales: Number(r.cajasPotenciales.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
      })),
      mountedCriticalDetails: mountedAndPotentialAlerts.mountedCriticalDetails.slice(0, 24).map((r) => ({
        producto: r.producto,
        byBodega: r.byBodega.map((b) => ({ bodega: b.bodega, cantidad: Number(b.cantidad.toFixed(2)) })),
        byLote: r.byLote.map((l) => ({ lote: l.lote, cantidad: Number(l.cantidad.toFixed(2)) })),
      })),
      potentialCriticalDetails: mountedAndPotentialAlerts.potentialCriticalDetails.slice(0, 24).map((r) => ({
        producto: r.producto,
        byLote: r.byLote.map((l) => ({ lote: l.lote, cantidad: Number(l.cantidad.toFixed(2)) })),
      })),
      globalStockByProductLot: mountedAndPotentialAlerts.globalStockByProductLot.slice(0, 200).map((r) => ({
        producto: r.producto,
        lote: r.lote,
        stockTotal: Number(r.stockTotal.toFixed(2)),
      })),
      globalStockByProductLotBodega: mountedAndPotentialAlerts.globalStockByProductLotBodega.slice(0, 400).map((r) => ({
        producto: r.producto,
        lote: r.lote,
        bodega: r.bodega,
        stockTotal: Number(r.stockTotal.toFixed(2)),
      })),
      potentialControlRows: stockControlTables.potentialRows.slice(0, 400).map((r) => ({
        producto: r.producto,
        lotes: r.lotes,
        viales: Number(r.viales.toFixed(2)),
        salidas: Number(r.salidas.toFixed(2)),
        potencialCajas: Number(r.potencialCajas.toFixed(2)),
        stockOptimo: Number(r.stockOptimo.toFixed(2)),
        consumoMes: Number(r.consumoMes.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
        estadoStock: r.estadoStock,
      })),
      potentialControlLotRows: stockControlTables.potentialLotRows.slice(0, 800).map((r) => ({
        producto: r.producto,
        lote: r.lote,
        viales: Number(r.viales.toFixed(2)),
        salidas: Number(r.salidas.toFixed(2)),
        potencialCajas: Number(r.potencialCajas.toFixed(2)),
        stockOptimo: Number(r.stockOptimo.toFixed(2)),
        consumoMes: Number(r.consumoMes.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
        estadoStock: r.estadoStock,
      })),
      canetHuarteControlRows: stockControlTables.canetHuarteRows.slice(0, 800).map((r) => ({
        producto: r.producto,
        lote: r.lote,
        stockCanetHuarte: Number(r.stockCanetHuarte.toFixed(2)),
        stockCanet: Number(r.stockCanet.toFixed(2)),
        stockHuarte: Number(r.stockHuarte.toFixed(2)),
        stockMinCH: Number(r.stockMinCH.toFixed(2)),
        consumoMes: Number(r.consumoMes.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
        semaforo: r.semaforo,
      })),
      canetControlRows: stockControlTables.canetRows.slice(0, 800).map((r) => ({
        producto: r.producto,
        lote: r.lote,
        stockCanet: Number(r.stockCanet.toFixed(2)),
        stockMin: Number(r.stockMin.toFixed(2)),
        consumoMes: Number(r.consumoMes.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
        semaforo: r.semaforo,
      })),
    };
    const fingerprint = JSON.stringify(payload);
    if (fingerprint === inventoryAlertsFingerprintRef.current) return;
    inventoryAlertsFingerprintRef.current = fingerprint;
    const payloadWithTimestamp = { ...payload, updatedAt: new Date().toISOString() };
    setInventoryAlertsShared(payloadWithTimestamp);
    setInventoryStockControlSnapshotShared({
      updatedAt: payloadWithTimestamp.updatedAt,
      potentialRows: payload.potentialControlRows || [],
      potentialLotRows: payload.potentialControlLotRows || [],
      canetHuarteRows: payload.canetHuarteControlRows || [],
      canetRows: payload.canetControlRows || [],
    });
  }, [
    riskyProductsSummary,
    caducityAlerts,
    mountedAndPotentialAlerts,
    setInventoryAlertsShared,
    setInventoryStockControlSnapshotShared,
    stockControlTables,
    actorIsAdmin,
  ]);

  const inferredMissingCanetLots = useMemo(() => {
    const knownLotRows = [...canonicalKnownCanetLotRows, ...(seed.lotes as GenericRow[])];
    const existingKeys = new Set<string>();
    for (const row of visibleLotes) {
      const producto = clean(row.producto);
      const lote = canonicalLotForProduct(knownLotRows, producto, clean(row.lote));
      if (!producto || !lote) continue;
      existingKeys.add(lotKeyOf(producto, lote));
    }
    for (const key of hiddenLotKeySet) existingKeys.add(key);
    for (const row of lotes) {
      if (!isLotDeleted(row)) continue;
      const producto = clean(row.producto);
      const lote = canonicalLotForProduct(knownLotRows, producto, clean(row.lote));
      if (!producto || !lote) continue;
      existingKeys.add(lotKeyOf(producto, lote));
    }
    for (const key of deletedLotKeySet) existingKeys.add(key);

    const latestByKey = new Map<string, { producto: string; lote: string; fecha: string }>();
    for (const m of normalizedMovements) {
      const producto = clean(m.producto);
      const loteRaw = clean(m.lote);
      const lote = canonicalLotForProduct(knownLotRows, producto, loteRaw);
      if (!producto || !lote || isInvalidLegacyLot(producto, lote)) continue;
      const key = lotKeyOf(producto, lote);
      if (existingKeys.has(key)) continue;
      const fecha = clean(m.fecha);
      const prev = latestByKey.get(key);
      if (!prev || movementDateMs(fecha) >= movementDateMs(prev.fecha)) {
        latestByKey.set(key, { producto, lote, fecha });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    return Array.from(latestByKey.values()).map((base) => {
      const key = lotKeyOf(base.producto, base.lote);
      const stock = stockByProductLotToken.get(key) || 0;
      const ensamblajes = assemblyBoxesByProductLotToken.get(key) || 0;
      const inferredViales = inferredLotVialesByKey.get(key) || 0;
      const forcedAgotado = isForcedAgotadoLot(base.producto, base.lote);
      return {
        producto: base.producto,
        lote: base.lote,
        bodega: 'CANET',
        estado: forcedAgotado ? 'AGOTADO' : stock > 0 ? 'ACTIVO' : 'AGOTADO',
        ensamblaje_finalizado: ensamblajes > 0 && stock <= 0 ? 'SI' : 'NO',
        viales_recibidos: inferredViales > 0 ? String(inferredViales) : '',
        fecha_alta: base.fecha || today,
      } satisfies GenericRow;
    });
  }, [
    assemblyBoxesByProductLotToken,
    canonicalKnownCanetLotRows,
    deletedLotKeySet,
    hiddenLotKeySet,
    inferredLotVialesByKey,
    lotes,
    lotAssemblyFinalizations,
    visibleLotes,
    normalizedMovements,
    stockByProductLotToken,
  ]);

  useEffect(() => {
    if (!Array.isArray(lotes) || lotes.length === 0) return;
    const cleaned = dedupeCanonicalCanetLots(lotes);
    const fingerprint = (rows: GenericRow[]) =>
      rows
        .map((row) => {
          const producto = clean(row.producto);
          const lote = clean(row.lote);
          return [
            producto,
            normalizeLotCompareToken(lote),
            clean((row as any).estado),
            clean((row as any).ensamblaje_finalizado),
            clean((row as any).viales_recibidos),
            clean((row as any).fecha_caducidad),
            clean((row as any).semaforo_caducidad),
            clean((row as any).deletedAt || (row as any).deleted_at),
          ].join('|');
        })
        .join('||');
    if (fingerprint(cleaned) === fingerprint(lotes)) return;
    setLotes(cleaned);
  }, [lotes, setLotes]);

  useEffect(() => {
    if (inferredMissingCanetLots.length === 0) return;
    setLotes((prev) => {
      const existing = new Set<string>();
      for (const row of prev) {
        const producto = clean(row.producto);
        const lote = clean(row.lote);
        if (!producto || !lote) continue;
        existing.add(lotKeyOf(producto, lote));
      }

      const toAppend = inferredMissingCanetLots.filter((row) => !existing.has(lotKeyOf(row.producto, row.lote)));
      if (toAppend.length === 0) return prev;
      return [...toAppend, ...prev];
    });
  }, [inferredMissingCanetLots, setLotes]);

  useEffect(() => {
    if (!lotes || lotes.length === 0) return;

    let changed = false;
    const repaired = lotes.map((row) => {
      if (isLotDeleted(row)) return row;
      const producto = clean(row.producto);
      const lote = canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(row.lote));
      if (!producto || !lote) return row;

      const key = lotKeyOf(producto, lote);
      const fromSeed = seedLotByKey.get(key);
      const currentViales = toVialesNum((row as any).viales_recibidos);
      const seedViales = toVialesNum((fromSeed as any)?.viales_recibidos);
      const inferredViales = inferredLotVialesByKey.get(key) || 0;
      const correctedViales = LOT_VIALES_CORRECTIONS.get(key) || 0;
      const currentStateRaw = clean((row as any).estado);
      const currentAsmRaw = clean((row as any).ensamblaje_finalizado);
      const stock = stockByProductLotToken.get(key) || 0;
      const inferredAsm = assemblyBoxesByProductLotToken.get(key) || 0;

      let next = lote !== clean(row.lote) ? { ...row, lote } : row;
      let rowChanged = false;

      if (correctedViales > 0 && currentViales !== correctedViales) {
        next = { ...next, viales_recibidos: String(correctedViales) };
        rowChanged = true;
      }
      // Recupera viales/caducidad/semaforo cuando se vaciaron por un payload incompleto.
      if (!rowChanged && (currentViales <= 0 || !clean((row as any).viales_recibidos)) && seedViales > 0) {
        next = { ...next, viales_recibidos: (fromSeed as any).viales_recibidos };
        rowChanged = true;
      } else if (!rowChanged && (currentViales <= 0 || !clean((row as any).viales_recibidos)) && inferredViales > 0) {
        next = { ...next, viales_recibidos: String(inferredViales) };
        rowChanged = true;
      }
      if (fromSeed && !clean((row as any).fecha_caducidad) && clean((fromSeed as any).fecha_caducidad)) {
        next = { ...next, fecha_caducidad: (fromSeed as any).fecha_caducidad };
        rowChanged = true;
      }
      if (fromSeed && !clean((row as any).semaforo_caducidad) && clean((fromSeed as any).semaforo_caducidad)) {
        next = { ...next, semaforo_caducidad: (fromSeed as any).semaforo_caducidad };
        rowChanged = true;
      }

      // Estado/ensamblaje: solo completar si viene vacío; nunca forzar override desde seed.
      if (fromSeed && !currentStateRaw && clean((fromSeed as any).estado)) {
        next = { ...next, estado: effectiveLotState(producto, lote, (fromSeed as any).estado) };
        rowChanged = true;
      }
      if (fromSeed && !currentAsmRaw && normalizeEnsamblajeFinalizado((fromSeed as any).ensamblaje_finalizado) === 'SI') {
        next = { ...next, ensamblaje_finalizado: normalizeEnsamblajeFinalizado((fromSeed as any).ensamblaje_finalizado) };
        const seedAsmAt = clean((fromSeed as any).ensamblaje_finalizado_at || (fromSeed as any).ensamblajeFinalizadoAt || (fromSeed as any).assemblyFinalizedAt);
        if (seedAsmAt) {
          next = { ...next, ensamblaje_finalizado_at: seedAsmAt };
        } else if (normalizeEnsamblajeFinalizado((fromSeed as any).ensamblaje_finalizado) === 'SI') {
          next = { ...next, ensamblaje_finalizado_at: clean((fromSeed as any).lastChangedAt || (fromSeed as any).updated_at || (fromSeed as any).created_at) || nowIso() };
        }
        upsertLotAssemblyFinalization(producto, lote, 'SI');
        rowChanged = true;
      }

      if (lote !== clean(row.lote)) {
        rowChanged = true;
      }

      if (rowChanged) {
        changed = true;
        return stampLotRow(next);
      }
      return row;
    });

    if (changed) {
      setLotes(repaired);
    }
  }, [
    assemblyBoxesByProductLotToken,
    canonicalKnownCanetLotRows,
    inferredLotVialesByKey,
    lotes,
    seedLotByKey,
    setLotes,
    stockByProductLotToken,
    upsertLotAssemblyFinalization,
  ]);

  const lotStateByProductLot = useMemo(() => buildLotStateMap(visibleLotes), [visibleLotes]);
  const lotAssemblyFinalizedByProductLot = useMemo(
    () => buildLotAssemblyFinalizedMapFromEntries(visibleLotes, lotAssemblyFinalizations),
    [lotAssemblyFinalizations, visibleLotes],
  );

  useEffect(() => {
    if (!Array.isArray(lotAssemblyFinalizations) || lotAssemblyFinalizations.length === 0) return;
    const latestByKey = new Map<string, LotAssemblyFinalizationEntry>();
    for (const entry of lotAssemblyFinalizations) {
      const producto = clean(entry?.producto);
      const lote = clean(entry?.lote);
      if (!producto || !lote) continue;
      const key = lotKeyOf(producto, lote);
      const prev = latestByKey.get(key);
      if (!prev) {
        latestByKey.set(key, entry);
        continue;
      }
      const prevTs = lotAssemblyFinalizedAtMs(prev);
      const nextTs = lotAssemblyFinalizedAtMs(entry);
      if (!Number.isFinite(prevTs) || nextTs >= prevTs) {
        latestByKey.set(key, entry);
      }
    }

    let changed = false;
    const repaired = lotes.map((row) => {
      if (isLotDeleted(row)) return row;
      const producto = clean(row.producto);
      const lote = clean(row.lote);
      if (!producto || !lote) return row;
      const entry = latestByKey.get(lotKeyOf(producto, lote));
      if (!entry) return row;
      const nextState = normalizeEnsamblajeFinalizado(entry.ensamblaje_finalizado);
      const currentState = normalizeEnsamblajeFinalizado((row as any).ensamblaje_finalizado);
      const currentAt = lotAssemblyFinalizedAtMs(row);
      const entryAt = lotAssemblyFinalizedAtMs(entry);
      if (currentState === nextState && currentAt >= entryAt) return row;
      changed = true;
      return stampLotRow({
        ...row,
        ensamblaje_finalizado: nextState,
        ensamblaje_finalizado_at: entry.updatedAt || nowIso(),
      });
    });

    if (changed) {
      setLotes(repaired);
    }
  }, [lotAssemblyFinalizations, lotes, setLotes]);

  const lotOptionsForForm = useMemo(() => {
    const editingMovement = editingId ? normalizedMovements.find((m) => m.id === editingId) : null;
    const keepKey = editingMovement ? lotKeyOf(editingMovement.producto, editingMovement.lote) : '';
    const selectedProduct = clean(movementForm.producto);
    const selectedWarehouse = normalizeWarehouseAlias(movementForm.bodega);
    const rawQty = toNum(movementForm.cantidad);
    const configuredSign = toNum(signByType.get(movementForm.tipo_movimiento));
    const sign = configuredSign !== 0 ? configuredSign : inferMovementSignByType(movementForm.tipo_movimiento, rawQty);
    const isStockOutput = sign < 0 || normalizeSearch(movementForm.tipo_movimiento).includes('traspaso');
    const sourceIsHuarte = HUARTE_OWN_WAREHOUSES.has(selectedWarehouse);
    const activeMasterRows = canetKnownActiveLotRows
      .map((l) => ({ producto: clean(l.producto), lote: clean(l.lote), bodega: normalizeWarehouseAlias((l as any).bodega) }))
      .filter((l) => !!l.producto && !!l.lote)
      .filter((l) => (selectedProduct ? l.producto === selectedProduct : true))
      .filter((l) => {
        const key = lotKeyOf(l.producto, l.lote);
        if (keepKey && key === keepKey) return true;
        return (lotStateByProductLot.get(key) || 'ACTIVO') !== 'AGOTADO';
      });
    const stockRows = calculateInventoryStockSnapshot(sourceIsHuarte ? (huarteMovimientosShared as Movement[]) : stockBaseVisible, {
      scope: sourceIsHuarte ? 'huarte' : 'canet',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value, movement) =>
        sourceIsHuarte
          ? clean(value)
          : canonicalLotForProduct(canonicalKnownCanetLotRows, clean((movement as any).producto), clean(value)),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      includeMovement: sourceIsHuarte
        ? undefined
        : (movement) => !isHuarteMirrorWarehouse(normalizeWarehouseAlias((movement as any).bodega)),
      rowTransform: (row) => {
        const safeStock = Math.max(0, toNum(row.stock));
        if (!sourceIsHuarte && isForcedAgotadoLot(row.producto, row.lote)) return { ...row, stock: 0 };
        return { ...row, stock: safeStock };
      },
      rowFilter: (row) => (sourceIsHuarte || !hiddenLotKeySet.has(lotKeyOf(row.producto, row.lote))) && toNum(row.stock) > 0,
    }).rows
      .filter((row) => (selectedProduct ? clean(row.producto) === selectedProduct : true))
      .filter((row) => (selectedWarehouse ? normalizeWarehouseAlias(row.bodega) === selectedWarehouse : true))
      .filter((row) => {
        const key = lotKeyOf(row.producto, row.lote);
        if (keepKey && key === keepKey) return true;
        return (lotStateByProductLot.get(key) || 'ACTIVO') !== 'AGOTADO' && toNum(row.stock) > 0;
      })
      .map((row) => ({ producto: clean(row.producto), lote: clean(row.lote), bodega: normalizeWarehouseAlias(row.bodega) }));
    const rows = isStockOutput ? stockRows : activeMasterRows;
    return Array.from(
      new Set(
        rows
          .map((r) => ({
            ...r,
            lote: sourceIsHuarte ? clean(r.lote) : canonicalLotForProduct(canonicalKnownCanetLotRows, r.producto, r.lote),
          }))
          .filter((r) => {
            if (sourceIsHuarte) return true;
            const candidates = canonicalKnownCanetLotRows
              .filter((lotRow) => clean(lotRow.producto) === clean(r.producto))
              .map((lotRow) => clean(lotRow.lote))
              .filter(Boolean);
            return !hasLongerLotAlias(candidates, r.lote);
          })
          .map((r) => r.lote)
          .filter(Boolean),
      ),
    ).sort();
  }, [
    canetKnownActiveLotRows,
    movementForm.producto,
    movementForm.bodega,
    movementForm.cantidad,
    movementForm.tipo_movimiento,
    lotStateByProductLot,
    editingId,
    normalizedMovements,
    signByType,
    stockBaseVisible,
    huarteMovimientosShared,
    canonicalKnownCanetLotRows,
    hiddenLotKeySet,
  ]);

  const getLotOptionsForMovementLine = useCallback((line: MovementDraftLine) => {
    const editingMovement = editingId ? normalizedMovements.find((m) => m.id === editingId) : null;
    const keepKey = editingMovement ? lotKeyOf(editingMovement.producto, editingMovement.lote) : '';
    const selectedProduct = clean(line.producto);
    const selectedWarehouse = normalizeWarehouseAlias(clean(line.bodega) || movementForm.bodega);
    const rawQty = toNum(line.cantidad);
    const configuredSign = toNum(signByType.get(movementForm.tipo_movimiento));
    const sign = configuredSign !== 0 ? configuredSign : inferMovementSignByType(movementForm.tipo_movimiento, rawQty);
    const isStockOutput = sign < 0 || normalizeSearch(movementForm.tipo_movimiento).includes('traspaso');
    const sourceIsHuarte = HUARTE_OWN_WAREHOUSES.has(selectedWarehouse);
    const activeMasterRows = canetKnownActiveLotRows
      .map((l) => ({ producto: clean(l.producto), lote: clean(l.lote), bodega: normalizeWarehouseAlias((l as any).bodega) }))
      .filter((l) => !!l.producto && !!l.lote)
      .filter((l) => (selectedProduct ? l.producto === selectedProduct : true))
      .filter((l) => {
        const key = lotKeyOf(l.producto, l.lote);
        if (keepKey && key === keepKey) return true;
        return (lotStateByProductLot.get(key) || 'ACTIVO') !== 'AGOTADO';
      });
    const stockRows = calculateInventoryStockSnapshot(sourceIsHuarte ? (huarteMovimientosShared as Movement[]) : stockBaseVisible, {
      scope: sourceIsHuarte ? 'huarte' : 'canet',
      normalizeProduct: (value) => clean(value),
      normalizeLot: (value, movement) =>
        sourceIsHuarte
          ? clean(value)
          : canonicalLotForProduct(canonicalKnownCanetLotRows, clean((movement as any).producto), clean(value)),
      normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
      includeMovement: sourceIsHuarte
        ? undefined
        : (movement) => !isHuarteMirrorWarehouse(normalizeWarehouseAlias((movement as any).bodega)),
      rowTransform: (row) => {
        const safeStock = Math.max(0, toNum(row.stock));
        if (!sourceIsHuarte && isForcedAgotadoLot(row.producto, row.lote)) return { ...row, stock: 0 };
        return { ...row, stock: safeStock };
      },
      rowFilter: (row) => (sourceIsHuarte || !hiddenLotKeySet.has(lotKeyOf(row.producto, row.lote))) && toNum(row.stock) > 0,
    }).rows
      .filter((row) => (selectedProduct ? clean(row.producto) === selectedProduct : true))
      .filter((row) => (selectedWarehouse ? normalizeWarehouseAlias(row.bodega) === selectedWarehouse : true))
      .filter((row) => {
        const key = lotKeyOf(row.producto, row.lote);
        if (keepKey && key === keepKey) return true;
        return (lotStateByProductLot.get(key) || 'ACTIVO') !== 'AGOTADO' && toNum(row.stock) > 0;
      })
      .map((row) => ({ producto: clean(row.producto), lote: clean(row.lote), bodega: normalizeWarehouseAlias(row.bodega) }));
    const rows = isStockOutput ? stockRows : activeMasterRows;
    return Array.from(
      new Set(
        rows
          .map((r) => ({
            ...r,
            lote: sourceIsHuarte ? clean(r.lote) : canonicalLotForProduct(canonicalKnownCanetLotRows, r.producto, r.lote),
          }))
          .filter((r) => {
            if (sourceIsHuarte) return true;
            const candidates = canonicalKnownCanetLotRows
              .filter((lotRow) => clean(lotRow.producto) === clean(r.producto))
              .map((lotRow) => clean(lotRow.lote))
              .filter(Boolean);
            return !hasLongerLotAlias(candidates, r.lote);
          })
          .map((r) => r.lote)
          .filter(Boolean),
      ),
    ).sort();
  }, [
    canonicalKnownCanetLotRows,
    editingId,
    hiddenLotKeySet,
    huarteMovimientosShared,
    lotStateByProductLot,
    movementForm.bodega,
    movementForm.tipo_movimiento,
    normalizedMovements,
    signByType,
    stockBaseVisible,
    canetKnownActiveLotRows,
  ]);

  const visibleMovements = useMemo(() => {
    const base = periodHasDateFilter ? monthMovements : normalizedMovements.filter((m) => movementMatchesFilters(m, false));
    return [...base].sort((a, b) => {
      const byDate = movementDateMs(clean(b.fecha)) - movementDateMs(clean(a.fecha));
      if (byDate !== 0) return byDate;
      return b.id - a.id;
    });
  }, [periodHasDateFilter, monthMovements, normalizedMovements, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter, quickSearch]);

  const visibleMovementsLast7Days = useMemo(() => {
    if (showMovementsAll) return visibleMovements;
    const allowedDays = new Set<string>();
    const rows: Movement[] = [];
    for (const m of visibleMovements) {
      const dateKey = clean(m.fecha);
      if (!dateKey) continue;
      if (!allowedDays.has(dateKey)) {
        if (allowedDays.size >= 7) continue;
        allowedDays.add(dateKey);
      }
      rows.push(m);
    }
    return rows;
  }, [visibleMovements, showMovementsAll]);

  useEffect(() => {
    setShowMovementsAll(false);
  }, [periodFileKey, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter]);

  const notifyAnabela = async (message: string) => {
    const responsibleIds = Array.from(
      new Set([anabela?.id, fernando?.id].filter(Boolean) as string[]),
    ).filter((id) => id !== actorId);
    const targetIds = responsibleIds.length > 0
      ? responsibleIds
      : admins.map((admin) => admin.id).filter((id) => id !== actorId);
    await Promise.allSettled(
      targetIds.map((userId) =>
        addNotification({
          message,
          userId,
          type: 'info',
        }),
      ),
    );
  };

  const getUserName = (id: string) => USERS.find((u) => u.id === id)?.name || id;

  const openCreateModal = () => {
    if (!canEditNow) return;
    const preferredType =
      tipos.find((t) => clean(t.tipo_movimiento).toLowerCase() === 'venta')?.tipo_movimiento ||
      tipos.find((t) => clean(t.tipo_movimiento).toLowerCase().includes('ajuste'))?.tipo_movimiento ||
      tipos.find((t) => clean(t.tipo_movimiento))?.tipo_movimiento ||
      '';
    setEditingId(null);
    setMovementForm({
      ...EMPTY_FORM,
      tipo_movimiento: preferredType,
      bodega: 'CANET',
    });
    setMovementLines([createEmptyMovementDraftLine()]);
    setMovementKitLots({});
    setMovementModalOpen(true);
  };
  const openCreateAssemblyModal = () => {
    if (!canEditNow) return;
    const preferredType =
      tipos.find((t) => clean(t.tipo_movimiento).toLowerCase().includes('ensam'))?.tipo_movimiento ||
      tipos.find((t) => clean(t.tipo_movimiento).toLowerCase().includes('entrada'))?.tipo_movimiento ||
      tipos.find((t) => clean(t.tipo_movimiento))?.tipo_movimiento ||
      '';
    setEditingId(null);
    setMovementForm({
      ...EMPTY_FORM,
      tipo_movimiento: preferredType,
      bodega: 'CANET',
    });
    setMovementLines([createEmptyMovementDraftLine()]);
    setMovementKitLots({});
    setMovementModalOpen(true);
  };

  const startEdit = (m: Movement) => {
    if (!canEditNow) return;
    setEditingId(m.id);
    setMovementForm({
      fecha: m.fecha,
      tipo_movimiento: m.tipo_movimiento,
      producto: m.producto,
      lote: m.lote,
      cantidad: String(m.cantidad),
      bodega: m.bodega,
      cliente: m.cliente || '',
      destino: m.destino || '',
      notas: m.notas || '',
    });
    setMovementLines([{ id: `edit-${m.id}`, producto: m.producto, lote: m.lote, cantidad: String(m.cantidad) }]);
    setMovementKitLots({});
    setMovementModalOpen(true);
  };

  const updateMovementDraftLine = (lineId: string, patch: Partial<MovementDraftLine>) => {
    setMovementLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
    if (patch.producto !== undefined) {
      setMovementKitLots({});
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

  const closedMonthForDate = (dateRaw: unknown) => {
    const date = dateFromAny(clean(dateRaw));
    if (!date) return null;
    return getInventoryMonthlyCloseSnapshot(monthlyClosures, 'canet', monthKeyFromDate(date)) || null;
  };

  const confirmClosedMonthWrite = (dateRaw: unknown, action: string) => {
    const closed = closedMonthForDate(dateRaw);
    if (!closed) return null;
    const ok = window.confirm(
      `${action} está fechado dentro de ${closed.monthLabel}, un mes que ya tiene cierre congelado.\n\n` +
      'El stock del cierre no se recalculará automáticamente; esta acción quedará registrada en bitácora/auditoría como corrección sobre mes cerrado.\n\n' +
      '¿Deseas continuar?',
    );
    return ok ? closed : false;
  };

  const saveMovement = async () => {
    if (!canEditNow) {
      window.alert('Tu usuario no tiene edición habilitada en este inventario.');
      return;
    }
    if (savingMovement) return;
    const draftLinesForSave = !editingId
      ? movementLines
        .map((line, index) => ({
          ...line,
          index,
          producto: clean(line.producto),
          lote: clean(line.lote),
          cantidad: clean(line.cantidad),
          bodega: normalizeWarehouseAlias(clean(line.bodega) || movementForm.bodega),
          destino: normalizeWarehouseAlias(clean(line.destino) || clean(movementForm.destino || movementForm.cliente)),
        }))
        .filter((line) => !!line.producto || !!line.lote || !!line.cantidad)
      : [];
    const primaryDraftLine = draftLinesForSave[0] || {
      producto: clean(movementForm.producto),
      lote: clean(movementForm.lote),
      cantidad: clean(movementForm.cantidad),
      bodega: normalizeWarehouseAlias(movementForm.bodega),
      destino: normalizeWarehouseAlias(movementForm.destino || movementForm.cliente),
      index: 0,
      id: 'single',
    };
    const qty = Math.abs(toNum(!editingId ? primaryDraftLine.cantidad : movementForm.cantidad));
    const isTransfer = normalizeSearch(movementForm.tipo_movimiento).includes('traspaso');
    const isKitMovement = !editingId && movementIsKit;
    const isMultiLineCreate = !editingId && !isKitMovement;
    const transferDestination = clean(movementForm.destino || movementForm.cliente);
    const transferOrigin = clean(movementForm.bodega);
    const missingFields: string[] = [];
    if (!clean(movementForm.tipo_movimiento)) missingFields.push('Tipo');
    if (!isMultiLineCreate && !transferOrigin) missingFields.push(isTransfer ? 'Origen' : 'Bodega');
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
      if (!clean(movementForm.producto)) missingFields.push('Producto');
      if (!isKitMovement && !clean(movementForm.lote)) missingFields.push('Lote');
      if (!qty) missingFields.push('Cantidad');
    }
    if (isKitMovement) {
      movementKitComponents.forEach((component, index) => {
        const key = movementKitComponentKey(component, index);
        if (!clean(movementKitLots[key])) missingFields.push(`Lote ${clean(component.producto).toUpperCase()}`);
      });
    }
    if (missingFields.length > 0) {
      window.alert(`Completa estos campos para guardar:\n- ${missingFields.join('\n- ')}`);
      return;
    }
    const producto = clean(!editingId ? primaryDraftLine.producto : movementForm.producto);
    const bodega = normalizeWarehouseAlias(transferOrigin);
    const destinoNormalizado = isTransfer ? normalizeWarehouseAlias(transferDestination) || transferDestination : clean(movementForm.destino);
    const transferOriginIsHuarte = HUARTE_OWN_WAREHOUSES.has(bodega);
    const transferOriginIsCanet = CANET_OWN_WAREHOUSES.has(bodega);
    if (!isMultiLineCreate && !transferOriginIsCanet && !transferOriginIsHuarte) {
      window.alert('Selecciona una bodega real de Canet o Huarte.');
      return;
    }
    if (!isMultiLineCreate && isTransfer && !destinoNormalizado) {
      window.alert('Selecciona una bodega o cliente destino válido.');
      return;
    }
    if (!isMultiLineCreate && isTransfer) {
      const destinationWarehouse = normalizeWarehouseAlias(destinoNormalizado);
      if (!CANET_OWN_WAREHOUSES.has(destinationWarehouse) && !HUARTE_OWN_WAREHOUSES.has(destinationWarehouse)) {
        window.alert('El destino del traspaso debe ser una bodega real de Canet o Huarte.');
        return;
      }
      if (destinationWarehouse === bodega) {
        window.alert('El origen y el destino del traspaso no pueden ser la misma bodega.');
        return;
      }
    }
    const closedMonthWrite = confirmClosedMonthWrite(
      movementForm.fecha,
      editingId ? 'La edición del movimiento' : 'La creación del movimiento',
    );
    if (closedMonthWrite === false) return;
    const closedMonthAuditSuffix = closedMonthWrite ? ` · Corrección mes cerrado: ${closedMonthWrite.monthLabel}` : '';
    const rawQty = toNum(!editingId ? primaryDraftLine.cantidad : movementForm.cantidad);
    const configuredSign = toNum(signByType.get(movementForm.tipo_movimiento));
    const sign = configuredSign !== 0 ? configuredSign : inferMovementSignByType(movementForm.tipo_movimiento, rawQty);
    const signedQty = qty * sign;
    const validationContextCache = new Map<string, {
      origin: string;
      originIsHuarte: boolean;
      originIsCanet: boolean;
      stockRows: Array<{ producto: string; lote: string; bodega: string; stock: number }>;
    }>();
    const getValidationContext = (originRaw: string) => {
      const origin = normalizeWarehouseAlias(originRaw);
      const cached = validationContextCache.get(origin);
      if (cached) return cached;
      const originIsHuarte = HUARTE_OWN_WAREHOUSES.has(origin);
      const originIsCanet = CANET_OWN_WAREHOUSES.has(origin);
      const stockRows = calculateInventoryStockSnapshot(
        (originIsHuarte ? (huarteMovimientosShared as Movement[]) : stockBaseVisible).filter((m) => (editingId ? m.id !== editingId : true)),
        {
          scope: originIsHuarte ? 'huarte' : 'canet',
          normalizeProduct: (value) => clean(value),
          normalizeLot: (value, movement) =>
            originIsHuarte
              ? clean(value)
              : canonicalLotForProduct(canonicalKnownCanetLotRows, clean((movement as any).producto), clean(value)),
          normalizeWarehouse: (value) => normalizeWarehouseAlias(value),
          includeMovement: originIsHuarte
            ? undefined
            : (movement) => !isHuarteMirrorWarehouse(normalizeWarehouseAlias((movement as any).bodega)),
          rowTransform: (row) => {
            if (!originIsHuarte && isForcedAgotadoLot(row.producto, row.lote)) return { ...row, stock: 0 };
            return { ...row, stock: toNum(row.stock) };
          },
        },
      ).rows;
      const context = { origin, originIsHuarte, originIsCanet, stockRows };
      validationContextCache.set(origin, context);
      return context;
    };
    const defaultValidationContext = getValidationContext(bodega);

    const validateProductLot = (targetProduct: string, targetLot: string) => {
      const context = defaultValidationContext;
      const loteValido = context.originIsHuarte
        ? context.stockRows.some(
            (row) =>
              clean(row.producto) === targetProduct &&
              normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot),
          )
        : canetKnownActiveLotRows.some((l) => {
            if (clean(l.producto) !== targetProduct) return false;
            return normalizeLotCompareToken(clean(l.lote)) === normalizeLotCompareToken(targetLot);
          });
      if (!loteValido) {
        return `El lote ${targetLot} no corresponde al producto ${targetProduct}.`;
      }
      const lotState = context.originIsHuarte ? 'ACTIVO' : lotStateByProductLot.get(lotKeyOf(targetProduct, targetLot)) || 'ACTIVO';
      if (lotState === 'AGOTADO') {
        const originalMovement = editingId ? normalizedMovements.find((m) => m.id === editingId) : null;
        const isEditingSameLot = !!(
          originalMovement &&
          clean(originalMovement.producto) === targetProduct &&
          clean(originalMovement.lote) === targetLot
        );
        if (!isEditingSameLot) {
          return `El lote ${targetLot} está marcado como AGOTADO. Reactívalo en Maestros > Lotes para usarlo.`;
        }
      }
      return '';
    };

    const stockFor = (targetProduct: string, targetLot: string) =>
      toNum(
        defaultValidationContext.stockRows.find(
          (row) =>
            clean(row.producto) === targetProduct &&
            normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot) &&
            normalizeWarehouseAlias(row.bodega) === bodega,
        )?.stock,
      );
    const validateProductLotForContext = (
      context: ReturnType<typeof getValidationContext>,
      targetProduct: string,
      targetLot: string,
    ) => {
      const loteValido = context.originIsHuarte
        ? context.stockRows.some(
            (row) =>
              clean(row.producto) === targetProduct &&
              normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot),
          )
        : canetKnownActiveLotRows.some((l) => {
            if (clean(l.producto) !== targetProduct) return false;
            return normalizeLotCompareToken(clean(l.lote)) === normalizeLotCompareToken(targetLot);
          });
      if (!loteValido) {
        return `El lote ${targetLot} no corresponde al producto ${targetProduct}.`;
      }
      const lotState = context.originIsHuarte ? 'ACTIVO' : lotStateByProductLot.get(lotKeyOf(targetProduct, targetLot)) || 'ACTIVO';
      if (lotState === 'AGOTADO') {
        return `El lote ${targetLot} está marcado como AGOTADO. Reactívalo en Maestros > Lotes para usarlo.`;
      }
      return '';
    };
    const stockForContext = (context: ReturnType<typeof getValidationContext>, targetProduct: string, targetLot: string) =>
      toNum(
        context.stockRows.find(
          (row) =>
            clean(row.producto) === targetProduct &&
            normalizeLotCompareToken(row.lote) === normalizeLotCompareToken(targetLot) &&
            normalizeWarehouseAlias(row.bodega) === context.origin,
        )?.stock,
      );

    const preparedBulkLines: Array<{
      producto: string;
      lote: string;
      qty: number;
      signedQty: number;
      sourceIndex: number;
      bodega: string;
      destino: string;
      originIsCanet: boolean;
      originIsHuarte: boolean;
    }> = [];

    const kitParts = isKitMovement
      ? movementKitComponents.map((component, index) => {
          const componentProduct = clean(component.producto).toUpperCase();
          const rawComponentLot = clean(movementKitLots[movementKitComponentKey(component, index)]);
          const componentLot = transferOriginIsHuarte
            ? rawComponentLot
            : canonicalLotForProduct(canonicalKnownCanetLotRows, componentProduct, rawComponentLot);
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
        const baseStock = stockFor(part.componentProduct, part.componentLot);
        if (baseStock + part.componentSignedQty < 0) {
          window.alert(
            `Movimiento inválido: el kit ${producto} dejaría stock negativo en ${part.componentProduct} · ${part.componentLot} · ${bodega}.\n\n` +
            `Stock disponible calculado: ${baseStock.toLocaleString('es-ES')}.`,
          );
          return;
        }
      }
    } else if (isMultiLineCreate) {
      const runningDeltaByStockKey = new Map<string, number>();
      for (const line of draftLinesForSave) {
        const targetProduct = clean(line.producto);
        const lineContext = getValidationContext(line.bodega);
        if (!lineContext.originIsCanet && !lineContext.originIsHuarte) {
          window.alert(`Línea ${line.index + 1}: selecciona una bodega real de Canet o Huarte.`);
          return;
        }
        const lineDestination = isTransfer ? normalizeWarehouseAlias(line.destino) : clean(line.destino || movementForm.destino);
        if (isTransfer) {
          if (!CANET_OWN_WAREHOUSES.has(lineDestination) && !HUARTE_OWN_WAREHOUSES.has(lineDestination)) {
            window.alert(`Línea ${line.index + 1}: el destino del traspaso debe ser una bodega real de Canet o Huarte.`);
            return;
          }
          if (lineDestination === lineContext.origin) {
            window.alert(`Línea ${line.index + 1}: el origen y el destino no pueden ser la misma bodega.`);
            return;
          }
        }
        const rawLineLot = clean(line.lote);
        const targetLot = lineContext.originIsHuarte
          ? rawLineLot
          : canonicalLotForProduct(canonicalKnownCanetLotRows, targetProduct, rawLineLot);
        const lineQty = Math.abs(toNum(line.cantidad));
        const lineRawQty = toNum(line.cantidad);
        const lineConfiguredSign = toNum(signByType.get(movementForm.tipo_movimiento));
        const lineSign = lineConfiguredSign !== 0 ? lineConfiguredSign : inferMovementSignByType(movementForm.tipo_movimiento, lineRawQty);
        const lineSignedQty = lineQty * lineSign;

        const productRow = productos.find((p) => clean(p.producto).toUpperCase() === targetProduct.toUpperCase());
        const lineKitComponents = productRow
          ? normalizeKitComponents((productRow as any).kit_componentes || (productRow as any).componentes_kit)
          : [];
        const lineMode = clean((productRow as any)?.modo_stock || (productRow as any)?.tipo_producto).toUpperCase();
        if (lineMode === 'KIT' || lineKitComponents.length > 0) {
          window.alert(`La línea ${line.index + 1} contiene un kit (${targetProduct}). Los kits se crean de uno en uno para poder elegir lotes por componente.`);
          return;
        }

        const validationError = validateProductLotForContext(lineContext, targetProduct, targetLot);
        if (validationError) {
          window.alert(`Línea ${line.index + 1}: ${validationError}`);
          return;
        }
        const stockKey = `${targetProduct}|${normalizeLotCompareToken(targetLot)}|${lineContext.origin}`;
        const baseStock = stockForContext(lineContext, targetProduct, targetLot) + (runningDeltaByStockKey.get(stockKey) || 0);
        if (baseStock + lineSignedQty < 0) {
          window.alert(
            `Movimiento inválido en línea ${line.index + 1}: dejaría stock negativo en ${targetProduct} · ${targetLot} · ${lineContext.origin}.\n\n` +
            `Stock disponible calculado: ${baseStock.toLocaleString('es-ES')}.`,
          );
          return;
        }
        runningDeltaByStockKey.set(stockKey, (runningDeltaByStockKey.get(stockKey) || 0) + lineSignedQty);
        preparedBulkLines.push({
          producto: targetProduct,
          lote: targetLot,
          qty: lineQty,
          signedQty: lineSignedQty,
          sourceIndex: line.index,
          bodega: lineContext.origin,
          destino: lineDestination,
          originIsCanet: lineContext.originIsCanet,
          originIsHuarte: lineContext.originIsHuarte,
        });
      }
    } else {
      const lote = transferOriginIsHuarte
        ? clean(movementForm.lote)
        : canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(movementForm.lote));
      const validationError = validateProductLot(producto, lote);
      if (validationError) {
        window.alert(validationError);
        return;
      }
      const baseStock = stockFor(producto, lote);
      if (baseStock + signedQty < 0) {
        window.alert(`Movimiento inválido: dejaría stock negativo en ${producto} · ${lote} · ${bodega}.\n\nStock disponible calculado: ${baseStock.toLocaleString('es-ES')}.`);
        return;
      }
    }

    const nowIso = new Date().toISOString();
    setSavingMovement(true);
    const isSharedMasBorras = false;
    const targetDb = transferOriginIsHuarte ? huarteDB : canetDB;
    const targetInventoryLabel = transferOriginIsHuarte ? 'Inventario Huarte' : 'Inventario Canet';
    const shouldSyncCanetMirror = transferOriginIsCanet;
    let primaryWriteCommitted = false;
    const addTransferAutoEntry = async (
      payload: any,
      quantity: number,
      pairMarker: string,
      originWarehouseRaw = bodega,
      destinationWarehouseRaw = destinoNormalizado,
    ) => {
      if (!isTransfer) return;
      const originWarehouse = normalizeWarehouseAlias(originWarehouseRaw);
      const destinationWarehouse = normalizeWarehouseAlias(destinationWarehouseRaw);
      if (!destinationWarehouse || destinationWarehouse === originWarehouse) return;
      const autoDb = CANET_OWN_WAREHOUSES.has(destinationWarehouse)
        ? canetDB
        : HUARTE_OWN_WAREHOUSES.has(destinationWarehouse)
          ? huarteDB
          : null;
      if (!autoDb) return;
      await autoDb.addMovement({
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
          const lineTargetDb = line.originIsHuarte ? huarteDB : canetDB;
          const nextPayload = {
            fecha: movementForm.fecha,
            tipo_movimiento: movementForm.tipo_movimiento,
            producto: line.producto,
            lote: line.lote,
            cantidad: line.qty,
            bodega: line.bodega,
            cliente: isTransfer ? line.destino : movementForm.cliente,
            destino: isTransfer ? line.destino : movementForm.destino,
            notas: [clean(movementForm.notas), isTransfer ? pairMarker : ''].filter(Boolean).join(' | '),
            afecta_stock: 'SI',
            signo: line.signedQty < 0 ? -1 : 1,
            cantidad_signed: line.signedQty,
            created_at: nowIso,
            updated_at: nowIso,
            updated_by: actorName,
            source: 'manual_batch',
          };
          const nextMovement = await lineTargetDb.addMovement(nextPayload as any);
          primaryWriteCommitted = true;
          createdMovements.push(nextMovement as Movement);
          if (line.originIsCanet && !isSharedMasBorras) {
            await syncMirrorUpsertStrict(nextMovement);
          }
          await addTransferAutoEntry(nextPayload, line.qty, pairMarker, line.bodega, line.destino);
        }
        void notifyAnabela(`${actorName} creó ${createdMovements.length} movimiento(s) en Inventario: ${movementForm.tipo_movimiento}.`);
        appendAudit(
          'Creación de movimientos múltiples',
          `${movementForm.tipo_movimiento} · ${createdMovements.map((m) => `${m.producto} ${m.lote} ${m.cantidad_signed}`).join(', ')}${closedMonthAuditSuffix}`,
        );
        emitSuccessFeedback(`${createdMovements.length} movimiento(s) creados con éxito.`);
        setMovementModalOpen(false);
        setEditingId(null);
        setMovementLines([createEmptyMovementDraftLine()]);
        setMovementKitLots({});
      } else if (isKitMovement) {
        const createdMovements: Movement[] = [];
        for (const part of kitParts) {
          const pairMarker = makeTransferPairId();
          const notes = [
            clean(movementForm.notas),
            `Kit ${producto} · ${qty.toLocaleString('es-ES')} unidad(es)`,
            isTransfer ? pairMarker : '',
          ].filter(Boolean).join(' | ');
          const nextPayload = {
            fecha: movementForm.fecha,
            tipo_movimiento: movementForm.tipo_movimiento,
            producto: part.componentProduct,
            lote: part.componentLot,
            cantidad: part.componentQty,
            bodega,
            cliente: isTransfer ? destinoNormalizado : movementForm.cliente,
            destino: isTransfer ? destinoNormalizado : movementForm.destino,
            notas: notes,
            afecta_stock: 'SI',
            signo: sign,
            cantidad_signed: part.componentSignedQty,
            created_at: nowIso,
            updated_at: nowIso,
            updated_by: actorName,
            source: 'manual_kit',
          };
          const nextMovement = await targetDb.addMovement(nextPayload as any);
          primaryWriteCommitted = true;
          createdMovements.push(nextMovement as Movement);
          if (shouldSyncCanetMirror && !isSharedMasBorras) {
            await syncMirrorUpsertStrict(nextMovement);
          }
          await addTransferAutoEntry(nextPayload, part.componentQty, pairMarker);
        }
        void notifyAnabela(`${actorName} creó una venta/movimiento de kit en Inventario: ${producto} · ${qty.toLocaleString('es-ES')}.`);
        appendAudit(
          'Creación de movimiento kit',
          `${movementForm.tipo_movimiento} · ${producto} · ${qty.toLocaleString('es-ES')} · ${createdMovements.map((m) => `${m.producto} ${m.lote}`).join(', ')}${closedMonthAuditSuffix}`,
        );
        emitSuccessFeedback('Movimiento de kit creado con éxito.');
        setMovementModalOpen(false);
        setEditingId(null);
        setMovementKitLots({});
      } else if (editingId) {
        const lote = canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(movementForm.lote));
        const originalMovement = normalizedMovements.find((m) => Number(m.id) === Number(editingId)) || null;
        const editTargetDb = canetDB;
        const targetId = editingId;
        const edited = {
          fecha: movementForm.fecha,
          tipo_movimiento: movementForm.tipo_movimiento,
          producto,
          lote,
          cantidad: qty,
          bodega,
          cliente: isTransfer ? destinoNormalizado : movementForm.cliente,
          destino: isTransfer ? destinoNormalizado : movementForm.destino,
          notas: movementForm.notas,
          afecta_stock: 'SI',
          signo: sign,
          cantidad_signed: qty * sign,
          updated_at: nowIso,
          updated_by: actorName,
        };

        const nextMovement = await editTargetDb.updateMovement(targetId, edited);
        primaryWriteCommitted = true;

          if (shouldSyncCanetMirror && !isSharedMasBorras) {
            const editedMirrorCandidate: Movement = {
              ...nextMovement,
              afecta_stock: 'SI',
          };
          await syncMirrorUpsertStrict(editedMirrorCandidate);
        }
        void notifyAnabela(`${actorName} editó un movimiento en Inventario (ID ${editingId}).`);
        appendAudit('Edición de movimiento', `ID ${editingId} · ${movementForm.tipo_movimiento} · ${movementForm.producto} ${movementForm.lote}${closedMonthAuditSuffix}`);
        emitSuccessFeedback('Movimiento actualizado con éxito.');
        setMovementModalOpen(false);
        setEditingId(null);
      } else {
        const lote = transferOriginIsHuarte
          ? clean(movementForm.lote)
          : canonicalLotForProduct(canonicalKnownCanetLotRows, producto, clean(movementForm.lote));
        const pairMarker = makeTransferPairId();
        const nextPayload = {
          fecha: movementForm.fecha,
          tipo_movimiento: movementForm.tipo_movimiento,
          producto,
          lote,
          cantidad: qty,
          bodega,
          cliente: isTransfer ? destinoNormalizado : movementForm.cliente,
          destino: isTransfer ? destinoNormalizado : movementForm.destino,
          notas: [clean(movementForm.notas), isTransfer ? pairMarker : ''].filter(Boolean).join(' | '),
          afecta_stock: 'SI',
          signo: sign,
          cantidad_signed: qty * sign,
          created_at: nowIso,
          updated_at: nowIso,
          updated_by: actorName,
          source: 'manual',
        };
        const nextMovement = await targetDb.addMovement(nextPayload as any);
        primaryWriteCommitted = true;
        if (shouldSyncCanetMirror && !isSharedMasBorras) {
          await syncMirrorUpsertStrict(nextMovement);
        }
        await addTransferAutoEntry(nextPayload, qty, pairMarker);
        void notifyAnabela(`${actorName} creó un movimiento en Inventario: ${nextMovement.tipo_movimiento} · ${nextMovement.producto} ${nextMovement.lote}.`);
        appendAudit('Creación de movimiento', `${nextMovement.tipo_movimiento} · ${nextMovement.producto} ${nextMovement.lote} · ${nextMovement.cantidad_signed}${closedMonthAuditSuffix}`);
        emitSuccessFeedback('Movimiento creado con éxito.');
        setMovementModalOpen(false);
        setEditingId(null);
      }
    } catch (error) {
      console.error('Error guardando movimiento de inventario:', error);
      if (primaryWriteCommitted && !isSharedMasBorras) {
        window.alert(`Movimiento guardado en ${targetInventoryLabel}, pero NO se pudo confirmar el movimiento automático relacionado.\n\nDetalle: ${describeDbError(error)}\n\nNo se mostrará "éxito" hasta que ambos queden sincronizados.`);
      } else if (primaryWriteCommitted && isSharedMasBorras) {
        window.alert(`Movimiento guardado en ${targetInventoryLabel}, pero hubo un error posterior.\n\nDetalle: ${describeDbError(error)}`);
      } else {
        window.alert(`No se pudo guardar el movimiento.\n\nDetalle: ${describeDbError(error)}`);
      }
    } finally {
      setSavingMovement(false);
    }
  };

  const deleteMovement = async (id: number) => {
    if (!canEditNow) {
      window.alert('Tu usuario no tiene edición habilitada en este inventario.');
      return;
    }
    const safeId = toNum(id);
    if (!Number.isFinite(safeId) || safeId < INT32_MIN || safeId > INT32_MAX) {
      window.alert('ID de movimiento fuera de rango para base de datos. No se puede eliminar desde aquí.');
      return;
    }
    if (deletingMovementId === safeId) return;
    const originalMovement = normalizedMovements.find((m) => Number(m.id) === Number(safeId)) || null;
    const closedMonthWrite = confirmClosedMonthWrite(originalMovement?.fecha, 'La eliminación del movimiento');
    if (closedMonthWrite === false) return;
    const closedMonthAuditSuffix = closedMonthWrite ? ` · Corrección mes cerrado: ${closedMonthWrite.monthLabel}` : '';
    const ok = window.confirm('¿Estás segura de eliminar este movimiento?');
    if (!ok) return;
    setDeletingMovementId(safeId);
    const targetDb = canetDB;
    const targetId = safeId;
    let primaryDeleteCommitted = false;
    try {
      await targetDb.deleteMovement(targetId);
      primaryDeleteCommitted = true;
      if (!isMasBorrasWarehouse(clean(originalMovement?.bodega))) {
        await syncMirrorDeleteStrict(safeId);
      }
      void notifyAnabela(`${actorName} eliminó un movimiento en Inventario (ID ${safeId}).`);
      appendAudit('Eliminación de movimiento', `ID ${safeId}${closedMonthAuditSuffix}`);
      emitSuccessFeedback('Movimiento eliminado con éxito.');
    } catch (error) {
      console.error('Error eliminando movimiento de inventario:', error);
      if (primaryDeleteCommitted && !isMasBorrasWarehouse(clean(originalMovement?.bodega))) {
        window.alert(`Movimiento eliminado en Inventario Canet, pero NO se pudo confirmar la sincronización del borrado en Inventario Huarte.\n\nDetalle: ${describeDbError(error)}\n\nNo se mostrará "éxito" hasta confirmar ambos lados.`);
      } else if (primaryDeleteCommitted && isMasBorrasWarehouse(clean(originalMovement?.bodega))) {
        window.alert(`Movimiento eliminado en Inventario Huarte, pero hubo un error posterior.\n\nDetalle: ${describeDbError(error)}`);
      } else {
        window.alert(`No se pudo eliminar el movimiento.\n\nDetalle: ${describeDbError(error)}`);
      }
    } finally {
      setDeletingMovementId(null);
    }
  };

  const getCaducitySemaforo = (dateKey: string) => {
    const d = dateFromAny(dateKey);
    if (!d) return '-';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'ROJO';
    if (diffDays <= 90) return 'AMARILLO';
    return 'VERDE';
  };

  const openLotCreateModal = () => {
    if (!canEditNow) return;
    setEditingLotKey(null);
    setLotForm({ producto: '', lote: '', viales_recibidos: '', fecha_caducidad: '', estado: 'ACTIVO', ensamblaje_finalizado: 'NO' });
    setLotModalOpen(true);
  };

  const openLotEditModal = (l: GenericRow) => {
    if (!canEditNow) return;
    setEditingLotKey(`${clean(l.producto)}|${clean(l.lote)}`);
    setLotForm({
      producto: clean(l.producto),
      lote: clean(l.lote),
      viales_recibidos: normalizeVialesDigits(
        String(effectiveLotVialesByKey.get(lotKeyOf(l.producto, l.lote)) || clean(l.viales_recibidos)),
      ),
      fecha_caducidad: normalizeDateForInput(
        effectiveLotCaducityByKey.get(lotKeyOf(l.producto, l.lote)) || clean(l.fecha_caducidad),
      ),
      estado: effectiveLotState(l.producto, l.lote, l.estado),
      ensamblaje_finalizado:
        lotAssemblyFinalizedByProductLot.get(lotKeyOf(l.producto, l.lote)) ||
        normalizeEnsamblajeFinalizado((l as any).ensamblaje_finalizado),
    });
    setLotModalOpen(true);
  };

  const saveLot = async () => {
    if (!canEditNow) return;
    if (!lotForm.producto || !lotForm.lote) return;
    const semaforo = getCaducitySemaforo(lotForm.fecha_caducidad);
    const normalizedState = isForcedAgotadoLot(lotForm.producto, lotForm.lote)
      ? 'AGOTADO'
      : normalizeLotState(lotForm.estado);
    const currentLotRow = editingLotKey
      ? (() => {
          const [editingProductoRaw, editingLoteRaw] = editingLotKey.split('|');
          const editingKey = lotKeyOf(editingProductoRaw, editingLoteRaw);
          return lotes.find((l) => lotKeyOf(l.producto, l.lote) === editingKey);
        })()
      : null;
    const currentAsm = normalizeEnsamblajeFinalizado((currentLotRow as any)?.ensamblaje_finalizado);
    const currentAsmAt = clean((currentLotRow as any)?.ensamblaje_finalizado_at || (currentLotRow as any)?.ensamblajeFinalizadoAt || (currentLotRow as any)?.assemblyFinalizedAt);
    const nextAsm = normalizeEnsamblajeFinalizado(lotForm.ensamblaje_finalizado);
    const asmChanged = nextAsm !== currentAsm;
    const assemblyFinalizedAt = nextAsm === 'SI'
      ? (asmChanged || !currentAsmAt ? nowIso() : currentAsmAt)
      : (asmChanged ? nowIso() : currentAsmAt);
    const lotPatch = {
      ...lotForm,
      viales_recibidos: normalizeVialesDigits(lotForm.viales_recibidos),
      estado: normalizedState,
      ensamblaje_finalizado: nextAsm,
      ...(assemblyFinalizedAt ? { ensamblaje_finalizado_at: assemblyFinalizedAt } : {}),
      semaforo_caducidad: semaforo,
    };
    if (editingLotKey) {
      const [oldProductoRaw, oldLoteRaw] = editingLotKey.split('|');
      const oldProducto = clean(oldProductoRaw);
      const oldLote = clean(oldLoteRaw);
      const newProducto = clean(lotForm.producto);
      const newLote = clean(lotForm.lote);
      const oldKey = lotKeyOf(oldProducto, oldLote);
      const newKey = lotKeyOf(newProducto, newLote);
      setLotes((prev) =>
        prev.map((l) =>
          lotKeyOf(l.producto, l.lote) === oldKey
            ? stampLotRow(clearDeletedLotFields({ ...l, ...lotPatch }))
            : l,
        ),
      );
      upsertLotAssemblyFinalization(newProducto, newLote, nextAsm);
      setDeletedLotKeys((prev) => prev.filter((storedKey) => clean(storedKey) !== oldKey && clean(storedKey) !== newKey));
      const oldLotToken = normalizeLotCompareToken(oldLote);
      const changedMovements = movimientos
        .filter((m) => {
          const mvLot = clean(m.lote);
          if (!mvLot) return false;
          const mvToken = normalizeLotCompareToken(mvLot);
          return mvLot === oldLote || mvToken === oldLotToken || mvToken.endsWith(oldLotToken) || oldLotToken.endsWith(mvToken);
        })
        .map((m) => ({
          ...m,
          lote: newLote,
          updated_at: new Date().toISOString(),
          updated_by: actorName,
        }));
      if (changedMovements.length > 0) {
        for (const m of changedMovements) {
          const nextMovement = await canetDB.updateMovement(m.id, { lote: newLote, updated_by: m.updated_by });
          await syncMirrorUpsert(nextMovement);
        }
      }
      await notifyAnabela(`${actorName} editó un lote en Inventario: ${lotForm.producto} ${lotForm.lote}.`);
      appendAudit(
        'Edición de lote',
        `${oldProducto} ${oldLote} → ${lotForm.producto} ${lotForm.lote} · Movimientos actualizados: ${changedMovements.length}`,
      );
      emitSuccessFeedback('Lote actualizado con éxito.');
    } else {
      setLotes((prev) => [stampLotRow(clearDeletedLotFields({ ...lotPatch })), ...prev]);
      upsertLotAssemblyFinalization(lotForm.producto, lotForm.lote, nextAsm);
      const createdKey = lotKeyOf(lotForm.producto, lotForm.lote);
      setDeletedLotKeys((prev) => prev.filter((storedKey) => clean(storedKey) !== createdKey));
      await notifyAnabela(`${actorName} creó un lote en Inventario: ${lotForm.producto} ${lotForm.lote}.`);
      appendAudit('Creación de lote', `${lotForm.producto} ${lotForm.lote}`);
      emitSuccessFeedback('Lote creado con éxito.');
    }
    setLotModalOpen(false);
    setEditingLotKey(null);
  };

  const toggleLotExhausted = async (lot: GenericRow) => {
    if (!canEditNow) return;
    const producto = clean(lot.producto);
    const lote = clean(lot.lote);
    if (isForcedAgotadoLot(producto, lote)) {
      window.alert(`El lote ${lote} está bloqueado como AGOTADO.`);
      return;
    }
    const key = lotKeyOf(producto, lote);
    let nextState = 'ACTIVO';
    setLotes((prev) =>
      prev.map((row) => {
        if (lotKeyOf(row.producto, row.lote) !== key) return row;
        const currentState = normalizeLotState(row.estado);
        nextState = currentState === 'AGOTADO' ? 'ACTIVO' : 'AGOTADO';
        return stampLotRow({ ...row, estado: nextState });
      }),
    );
    await notifyAnabela(`${actorName} marcó lote ${producto} ${lote} como ${nextState}.`);
    appendAudit('Cambio estado lote', `${producto} ${lote} → ${nextState}`);
    emitSuccessFeedback(`Lote ${lote} marcado como ${nextState}.`);
  };

  const toggleLotAssemblyFinalized = async (lot: GenericRow) => {
    if (!canEditNow) return;
    const producto = clean(lot.producto);
    const lote = clean(lot.lote);
    const key = lotKeyOf(producto, lote);
    const currentState =
      lotAssemblyFinalizedByProductLot.get(key) ||
      normalizeEnsamblajeFinalizado((lot as any).ensamblaje_finalizado);
    const nextState: 'SI' | 'NO' = currentState === 'SI' ? 'NO' : 'SI';
    setLotes((prev) =>
      prev.map((row) => {
        if (lotKeyOf(row.producto, row.lote) !== key) return row;
        return stampLotRow({ ...row, ensamblaje_finalizado: nextState, ensamblaje_finalizado_at: nowIso() });
      }),
    );
    upsertLotAssemblyFinalization(producto, lote, nextState);
    const nextLabel = nextState === 'SI' ? 'FINALIZADO' : 'REABIERTO';
    await notifyAnabela(`${actorName} marcó ensamblaje ${nextLabel} para lote ${producto} ${lote}.`);
    appendAudit('Cambio ensamblaje lote', `${producto} ${lote} → ${nextLabel}`);
    emitSuccessFeedback(
      nextState === 'SI'
        ? `Lote ${lote}: ensamblaje finalizado (potenciales = 0).`
        : `Lote ${lote}: ensamblaje reabierto.`,
    );
  };

  const archiveLot = async (lot: GenericRow) => {
    if (!canEditNow) return;
    const producto = clean(lot.producto);
    const lote = clean(lot.lote);
    if (!producto || !lote) return;
    const key = lotKeyOf(producto, lote);
    const now = nowIso();
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
    await notifyAnabela(`${actorName} archivó el lote ${producto} ${lote}.`);
    appendAudit('Archivado de lote', `${producto} ${lote}`);
    emitSuccessFeedback(`Lote ${lote} archivado con éxito.`);
  };

  const restoreLot = async (lot: GenericRow) => {
    if (!canEditNow) return;
    const producto = clean(lot.producto);
    const lote = clean(lot.lote);
    if (!producto || !lote) return;
    const key = lotKeyOf(producto, lote);
    const now = nowIso();
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
        lotKeyOf(row.producto, row.lote) === key
          ? stampLotRow({ ...row, estado: 'ACTIVO' })
          : row,
      ),
    );
    await notifyAnabela(`${actorName} restauró el lote ${producto} ${lote}.`);
    appendAudit('Restauración de lote', `${producto} ${lote}`);
    emitSuccessFeedback(`Lote ${lote} restaurado con éxito.`);
  };

  const deleteLot = async (lot: GenericRow) => {
    if (!canEditNow) return;
    const producto = clean(lot.producto);
    const lote = clean(lot.lote);
    const key = lotKeyOf(producto, lote);
    if (!producto || !lote || deletingLotKey === key) return;
    if (isForcedAgotadoLot(producto, lote)) {
      window.alert(`El lote ${lote} está protegido y no se puede eliminar.`);
      return;
    }

    const associatedMovements = normalizedMovements.filter(
      (m) => clean(m.producto) === producto && lotKeyOf(m.producto, m.lote) === key,
    );
    if (associatedMovements.length > 0) {
      window.alert(
        `No se puede eliminar el lote ${producto} ${lote} porque tiene ${associatedMovements.length} movimiento(s) asociado(s).\n\n` +
        'Si este lote está mal escrito, edítalo para renombrarlo; si no, elimina primero sus movimientos.',
      );
      return;
    }

    const ok = window.confirm(`¿Quieres eliminar el lote ${producto} ${lote}?`);
    if (!ok) return;

    setDeletingLotKey(key);
    try {
      setDeletedLotKeys((prev) => (prev.some((storedKey) => clean(storedKey) === key) ? prev : [key, ...prev]));
      setLotes((prev) => {
        let matched = false;
        const next = prev.map((row) => {
          if (lotKeyOf(row.producto, row.lote) !== key) return row;
          matched = true;
          return stampDeletedLotRow(row, actorName);
        });
        if (matched) return next;
        return [stampDeletedLotRow({ producto, lote, bodega: 'CANET' }, actorName), ...prev];
      });
      await notifyAnabela(`${actorName} eliminó un lote en Inventario: ${producto} ${lote}.`);
      appendAudit('Eliminación de lote', `${producto} ${lote}`);
      emitSuccessFeedback('Lote eliminado con éxito.');
    } finally {
      setDeletingLotKey(null);
    }
  };

  const saveBodega = async () => {
    if (!canEditNow) return;
    const bodega = normalizeCanetMasterWarehouseInput(bodegaForm.bodega);
    if (!bodega) {
      alert(`Canet solo permite estas bodegas: ${CANET_MASTER_WAREHOUSE_ORDER.join(', ')}.`);
      return;
    }
    if (activeBodegas.some((b) => normalizeWarehouseAlias(b.bodega) === bodega)) {
      alert(`La bodega ${bodega} ya existe en Canet.`);
      return;
    }
    setBodegas((prev) => [{ bodega, activo_si_no: bodegaForm.activo_si_no }, ...prev]);
    await notifyAnabela(`${actorName} creó una bodega en Inventario: ${bodega}.`);
    appendAudit('Creación de bodega', bodega);
    emitSuccessFeedback('Bodega creada con éxito.');
    setBodegaForm({ bodega: '', activo_si_no: 'SI' });
    setBodegaModalOpen(false);
  };

  const editBodega = async (oldBodegaRaw: string) => {
    if (!canEditNow) return;
    const oldBodega = normalizeWarehouseAlias(oldBodegaRaw);
    if (!oldBodega) return;
    setTextEditDialog({
      title: 'Editar bodega',
      value: oldBodegaRaw,
      confirmLabel: 'Guardar bodega',
      onConfirm: async (nextValue) => {
        const nextBodega = normalizeCanetMasterWarehouseInput(nextValue);
        if (!nextBodega) {
          alert(`Canet solo permite estas bodegas: ${CANET_MASTER_WAREHOUSE_ORDER.join(', ')}.`);
          return;
        }
        if (!nextBodega || nextBodega === oldBodega) return;
        if (activeBodegas.some((b) => normalizeWarehouseAlias(b.bodega) === nextBodega && normalizeWarehouseAlias(b.bodega) !== oldBodega)) {
          alert(`La bodega ${nextBodega} ya existe en Canet.`);
          return;
        }
        setBodegas((prev) => prev.map((b) => (normalizeWarehouseAlias(b.bodega) === oldBodega ? { ...b, bodega: nextBodega } : b)));
        emitSuccessFeedback('Bodega actualizada con éxito.');
      },
    });
  };

  const deleteBodega = async (oldBodegaRaw: string) => {
    if (!canEditNow) return;
    const oldBodega = normalizeWarehouseAlias(oldBodegaRaw);
    if (!oldBodega) return;
    if (CANET_MASTER_WAREHOUSE_SET.has(normalizeWarehouseAlias(oldBodegaRaw))) {
      alert('Esta bodega forma parte de la estructura base de Canet y no puede borrarse.');
      return;
    }
    const ok = window.confirm(`¿Borrar la bodega "${oldBodegaRaw}"?`);
    if (!ok) return;
    const ts = nowIso();
    setBodegas((prev) =>
      prev.map((b) =>
        normalizeWarehouseAlias(b.bodega) === oldBodega
          ? { ...b, deletedAt: ts, deleted_at: ts, deletedBy: actorName, deleted_by: actorName, updatedAt: ts, updated_at: ts, updatedBy: actorName, updated_by: actorName }
          : b,
      ),
    );
    emitSuccessFeedback('Bodega eliminada con éxito.');
  };

  const saveTipo = async () => {
    if (!canEditNow) return;
    if (!tipoForm.tipo_movimiento.trim()) return;
    setTipos((prev) => [
      {
        tipo_movimiento: tipoForm.tipo_movimiento.trim(),
        signo_1_1: tipoForm.signo_1_1,
        afecta_stock_si_no: tipoForm.afecta_stock_si_no,
        requiere_cliente_si_no: 'NO',
        requiere_destino_si_no: 'NO',
        notas: '',
      },
      ...prev,
    ]);
    await notifyAnabela(`${actorName} creó tipo de movimiento: ${tipoForm.tipo_movimiento.trim()}.`);
    appendAudit('Creación de tipo', `${tipoForm.tipo_movimiento.trim()} (signo ${tipoForm.signo_1_1})`);
    emitSuccessFeedback('Tipo de movimiento creado con éxito.');
    setTipoForm({ tipo_movimiento: '', signo_1_1: '-1', afecta_stock_si_no: 'SI' });
    setTipoModalOpen(false);
  };

  const addClient = () => {
    if (!canEditNow) return;
    if (!newClient.trim()) return;
    setClientes((prev) => [{ cliente: newClient.trim() }, ...prev]);
    void notifyAnabela(`${actorName} creó un cliente en Inventario: ${newClient.trim()}.`);
    appendAudit('Creación de cliente', newClient.trim());
    emitSuccessFeedback('Cliente creado con éxito.');
    setNewClient('');
  };

  const deleteClient = async (oldClientRaw: string) => {
    if (!canEditNow) return;
    const oldClient = clean(oldClientRaw);
    if (!oldClient) return;
    const ok = window.confirm(`¿Borrar el cliente "${oldClientRaw}"?`);
    if (!ok) return;
    const ts = nowIso();
    setClientes((prev) =>
      prev.map((c) =>
        clean(c.cliente) === oldClient
          ? { ...c, deletedAt: ts, deleted_at: ts, deletedBy: actorName, deleted_by: actorName, updatedAt: ts, updated_at: ts, updatedBy: actorName, updated_by: actorName }
          : c,
      ),
    );
    emitSuccessFeedback('Cliente eliminado con éxito.');
  };

  const editClient = async (oldClientRaw: string) => {
    if (!canEditNow) return;
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
        const changedMovements = movimientos
          .filter((m) => clean(m.cliente) === oldClient)
          .map((m) => ({
            ...m,
            cliente: nextClient,
            updated_at: new Date().toISOString(),
            updated_by: actorName,
          }));
        if (changedMovements.length > 0) {
          for (const m of changedMovements) {
            const nextMovement = await canetDB.updateMovement(m.id, { cliente: nextClient, updated_by: m.updated_by });
            await syncMirrorUpsert(nextMovement);
          }
        }
        await notifyAnabela(`${actorName} editó cliente en Inventario: ${oldClientRaw} → ${nextClient}.`);
        appendAudit('Edición de cliente', `${oldClientRaw} → ${nextClient} · Movimientos actualizados: ${changedMovements.length}`);
        emitSuccessFeedback('Cliente actualizado con éxito.');
      },
    });
  };

  const editTipoMovimiento = async (oldTipoRaw: string) => {
    if (!canEditNow) return;
    const oldTipo = clean(oldTipoRaw);
    if (!oldTipo) return;
    setTextEditDialog({
      title: 'Editar tipo de movimiento',
      value: oldTipoRaw,
      confirmLabel: 'Guardar tipo',
      onConfirm: async (nextValue) => {
        const nextTipo = clean(nextValue);
        if (!nextTipo || nextTipo === oldTipo) return;
        setTipos((prev) =>
          prev.map((t) =>
            clean(t.tipo_movimiento) === oldTipo ? { ...t, tipo_movimiento: nextTipo } : t,
          ),
        );
        const changedMovements = movimientos
          .filter((m) => clean(m.tipo_movimiento) === oldTipo)
          .map((m) => ({
            ...m,
            tipo_movimiento: nextTipo,
            updated_at: new Date().toISOString(),
            updated_by: actorName,
          }));
        if (changedMovements.length > 0) {
          for (const m of changedMovements) {
            const nextMovement = await canetDB.updateMovement(m.id, { tipo_movimiento: nextTipo, updated_by: m.updated_by });
            await syncMirrorUpsert(nextMovement);
          }
        }
        await notifyAnabela(`${actorName} editó tipo de movimiento: ${oldTipoRaw} → ${nextTipo}.`);
        appendAudit('Edición de tipo', `${oldTipoRaw} → ${nextTipo} · Movimientos actualizados: ${changedMovements.length}`);
        emitSuccessFeedback('Tipo de movimiento actualizado con éxito.');
      },
    });
  };

  const closeProductModal = () => {
    setProductModalOpen(false);
    setEditingProductCode(null);
    setNewProductForm({ ...EMPTY_PRODUCT_FORM });
  };

  const openProductCreateModal = () => {
    if (!canEditNow) return;
    setEditingProductCode(null);
    setNewProductForm({ ...EMPTY_PRODUCT_FORM });
    setProductModalOpen(true);
  };

  const openProductEditModal = (row: GenericRow) => {
    if (!canEditNow) return;
    const code = clean(row.producto).toUpperCase();
    if (!code) return;
    setEditingProductCode(code);
    setNewProductForm({
      producto: code,
      tipo_producto: clean(row.tipo_producto) || 'COMPLEMENTO ALIMENTICIO',
      stock_min: clean(row.stock_min),
      stock_optimo: clean((row as any).stock_optimo || (row as any).stock_opt),
      consumo_mensual_cajas: clean((row as any).consumo_mensual_cajas),
      modo_stock: clean(row.modo_stock) || 'ENSAMBLAJE',
      activo_si_no: clean(row.activo_si_no) || 'SI',
      kit_componentes_text: formatKitComponents((row as any).kit_componentes || (row as any).componentes_kit),
    });
    setProductModalOpen(true);
  };

  const createProducto = async () => {
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
    const now = nowIso();
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
    };
    if (editingProductCode) {
      const target = editingProductCode.toUpperCase();
      setProductos((prev) =>
        prev.map((p) =>
          clean(p.producto).toUpperCase() === target
            ? {
              ...p,
              ...productPayload,
              producto: target,
              updatedAt: now,
              updated_at: now,
              updatedBy: actorName,
              updated_by: actorName,
            }
            : p,
        ),
      );
      setHuarteProductosCatalog((prev) => upsertProductCatalogRow(prev, { ...productPayload, producto: target, updatedAt: now, updated_at: now, updatedBy: actorName, updated_by: actorName }));
      await notifyAnabela(`${actorName} editó producto en Inventario: ${target}.`);
      appendAudit('Edición de producto', target);
      closeProductModal();
      emitSuccessFeedback('Producto actualizado con éxito.');
      return;
    }
    if (productos.some((p) => clean(p.producto) === code)) return;
    setProductos((prev) => [
      ...prev,
      {
        ...productPayload,
        updatedAt: now,
        updated_at: now,
        updatedBy: actorName,
        updated_by: actorName,
      },
    ]);
    setHuarteProductosCatalog((prev) => upsertProductCatalogRow(prev, { ...productPayload, updatedAt: now, updated_at: now, updatedBy: actorName, updated_by: actorName }));
    closeProductModal();
    emitSuccessFeedback('Producto creado con éxito.');
  };

  const createCartonajeMovement = async () => {
    const qty = toNum(cartonajeForm.cantidad);
    if (!qty || !clean(cartonajeForm.producto) || !clean(cartonajeForm.lote)) {
      alert('Por favor completa todos los campos (Producto, Lote, Cantidad).');
      return;
    }
    const sign = clean(cartonajeForm.tipo_movimiento) === 'ENTRADA de cartonaje' ? 1 : -1;
    const nowIso = new Date().toISOString();
    const payload = {
      fecha: nowIso.slice(0, 10),
      tipo_movimiento: clean(cartonajeForm.tipo_movimiento),
      producto: clean(cartonajeForm.producto),
      lote: clean(cartonajeForm.lote),
      cantidad: qty,
      bodega: 'CANET',
      signo: sign,
      cantidad_signed: qty * sign,
      source: 'manual',
      created_at: nowIso,
      updated_at: nowIso,
      updated_by: currentUser?.name || actorName,
    };
    await canetDB.addMovement(payload as any);
    setCartonajeModalOpen(false);
    setCartonajeForm({ tipo_movimiento: 'ENTRADA de cartonaje', producto: '', lote: '', cantidad: '' });
    emitSuccessFeedback('Movimiento cartonaje registrado con éxito.');
  };

  const downloadMovements = async () => {
    const headers = ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Destino', 'Notas'];
    const rows = visibleMovements.map((m) => [m.fecha, m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed ?? m.cantidad, m.bodega, m.cliente || '', m.destino || '', m.notas || '']);
    openTablePdf('Inventario - Movimientos', `inventario-movimientos-${periodFileKey}.pdf`, headers, rows);
    await notifyAnabela(`${actorName} descargó movimientos de Inventario (${periodFileKey}).`);
    appendAudit('Descarga PDF', `Movimientos (${periodFileKey})`);
    emitSuccessFeedback('PDF generado con éxito.');
  };
  const downloadMovementsExcel = async () => {
    const headers = ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Destino', 'Notas'];
    const rows = visibleMovements.map((m) => [m.fecha, m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed ?? m.cantidad, m.bodega, m.cliente || '', m.destino || '', m.notas || '']);
    openTableExcel('Inventario - Movimientos', `inventario-movimientos-${periodFileKey}.xlsx`, headers, rows);
    await notifyAnabela(`${actorName} descargó Excel de movimientos de Inventario (${periodFileKey}).`);
    appendAudit('Descarga Excel', `Movimientos (${periodFileKey})`);
    emitSuccessFeedback('Excel generado con éxito.');
  };
  const downloadExecutiveReport = async () => {
    const summaryRows: Array<Array<string | number>> = [
      ['Productos en riesgo', criticalProducts.length],
      ['Salidas del mes', monthOutputTotal],
      ['Ajustes del mes', monthAdjustmentsTotal],
      ['Stock total (filtro)', stockByPLB.reduce((acc, r) => acc + toNum(r.stock), 0)],
    ];
    openPrintablePdfReport({
      title: 'Inventario Canet - Reporte gerencial',
      subtitle: `Periodo: ${periodLabel} · Generado: ${new Date().toLocaleString('es-ES')}`,
      fileName: `inventario-canet-gerencial-${periodFileKey}.pdf`,
      headers: ['Indicador', 'Valor'],
      rows: appendTotalRow(['Indicador', 'Valor'], summaryRows),
      signatures: ['Responsable', 'Revisión'],
    });
    await notifyAnabela(`${actorName} descargó reporte gerencial de Inventario (${periodFileKey}).`);
    appendAudit('Descarga PDF', `Gerencial (${periodFileKey})`);
    emitSuccessFeedback('PDF gerencial generado con éxito.');
  };
  const downloadExecutiveReportExcel = async () => {
    const summaryRows: Array<[string, string | number]> = [
      ['Productos en riesgo', criticalProducts.length],
      ['Salidas del mes', monthOutputTotal],
      ['Ajustes del mes', monthAdjustmentsTotal],
      ['Stock total (filtro)', stockByPLB.reduce((acc, r) => acc + toNum(r.stock), 0)],
    ];
    openTableExcel(
      'Inventario Canet - Reporte gerencial',
      `inventario-canet-gerencial-${periodFileKey}.xlsx`,
      ['Indicador', 'Valor'],
      appendTotalRow(['Indicador', 'Valor'], summaryRows),
      `Periodo: ${periodLabel} · Generado: ${new Date().toLocaleString('es-ES')}`,
      summaryRows,
    );
    await notifyAnabela(`${actorName} descargó Excel de reporte gerencial de Inventario (${periodFileKey}).`);
    appendAudit('Descarga Excel', `Gerencial (${periodFileKey})`);
    emitSuccessFeedback('Excel gerencial generado con éxito.');
  };
  const saveMonthlyClose = async () => {
    if (!closeMonthKey) {
      alert('Selecciona el modo Mes para guardar el cierre mensual.');
      return;
    }
    if (!isEditModeActive) {
      alert('Para guardar un cierre debes entrar en modo edición.');
      return;
    }
    if (currentMonthlyClose && !window.confirm(`Ya existe un cierre de ${monthLabel(closeMonthKey)}. ¿Deseas reemplazarlo?`)) {
      return;
    }
    const snapshot = buildInventoryMonthlyCloseSnapshot({
      scope: 'canet',
      monthKey: closeMonthKey,
      monthLabel: monthLabel(closeMonthKey),
      closedBy: actorName,
      rows: monthlyCloseRows,
    });
    setMonthlyClosures((prev) => upsertInventoryMonthlyCloseSnapshot(prev, snapshot));
    await notifyAnabela(`${actorName} guardó el cierre mensual de Inventario Canet (${monthLabel(closeMonthKey)}).`);
    appendAudit('Cierre mensual', `Canet (${closeMonthKey})`);
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
    openTableExcel(
      'Inventario Canet - Cierre de mes',
      `cierre-mes-canet-${snapshot.monthKey}.xlsx`,
      ['Producto', 'Lote', 'Bodega', 'Stock cierre'],
      appendTotalRow(['Producto', 'Lote', 'Bodega', 'Stock cierre'], monthlyCloseRowsForExport(snapshot)),
      `Foto congelada · Cierre: ${snapshot.monthLabel} · Guardado: ${new Date(snapshot.closedAt).toLocaleString('es-ES')} · Responsable: ${snapshot.closedBy}`,
      [
        ['Stock cierre', snapshot.totalStock],
        ['Productos', snapshot.productCount],
        ['Lotes', snapshot.lotCount],
        ['Bodegas', snapshot.warehouseCount],
        ['Filas snapshot', snapshot.rowCount ?? snapshot.rows.length],
        ['Huella snapshot', snapshot.snapshotHash || 'legacy'],
      ],
    );
    appendAudit('Descarga Excel', `Cierre mensual Canet (${snapshot.monthKey})`);
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
    await notifyAnabela(`${actorName} movió el cierre mensual de Inventario Canet de ${snapshot.monthLabel} a ${nextLabel}.`);
    appendAudit('Edición de cierre mensual', `Canet: ${snapshot.monthKey} -> ${nextMonthKey}`);
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
    await notifyAnabela(`${actorName} eliminó el cierre mensual de Inventario Canet (${snapshot.monthLabel}).`);
    appendAudit('Eliminación de cierre mensual', `Canet (${snapshot.monthKey})`);
    emitSuccessFeedback('Cierre mensual eliminado.');
  };

  const tabs: Array<{ key: InventoryTab; label: string; icon: React.ElementType; compact?: boolean }> = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'movimientos', label: 'Movimientos', icon: ClipboardList },
    { key: 'ensamblajes', label: 'Ensamblajes', icon: Layers3 },
    { key: 'maestros', label: 'Maestros', icon: Tags },
    { key: 'cierres', label: 'Cierres', icon: Archive },
    { key: 'auditoria', label: 'Auditoría', icon: AlertTriangle },
  ];
  const visibleTabs = isRestrictedUser
    ? tabs.filter((item) => item.key === 'dashboard' || item.key === 'control_stock')
    : tabs;

  const scrollToSection = (id: string) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const selectInventoryTab = (nextTab: InventoryTab) => {
    setTab(nextTab);
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'control_stock') next.set('tab', nextTab);
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const isStandaloneControlStock = tab === 'control_stock';
  const showAccessSelector = !isRestrictedUser;
  const effectiveAccessMode: InventoryAccessMode = isStandaloneControlStock || !showAccessSelector ? 'consult' : accessMode;
  const accessReady = effectiveAccessMode !== 'unset';
  const isEditModeActive = effectiveAccessMode === 'edit' && canEditNow;
  const monthlyCloseSaveDisabledReason = !closeMonthKey
    ? 'Selecciona el modo Mes para cerrar.'
    : !accessReady
      ? 'Elige consultar o editar para activar el panel.'
      : !isEditModeActive
        ? 'Entra en modo edición para guardar el cierre.'
        : '';
  const activeMainFiltersCount = [productFilters.length > 0, lotFilter, warehouseFilter, typeFilter, clientFilter, quickSearch].filter(Boolean).length;
  const compactInventoryTiles: Array<{ key: 'stock' | 'moves' | 'clients' | 'adjust' | 'outputs'; label: string; Icon: any }> = [
    { key: 'stock', label: 'Stock', Icon: Package },
    { key: 'moves', label: 'Movimientos', Icon: ClipboardList },
    { key: 'clients', label: 'Clientes', Icon: Users },
    { key: 'adjust', label: 'Ajustes', Icon: Wrench },
    { key: 'outputs', label: 'Salidas', Icon: ArrowDownCircle },
  ];
  const visibleCompactInventoryTiles = isRestrictedUser
    ? compactInventoryTiles.filter((tile) => tile.key === 'stock')
    : compactInventoryTiles;
  const activeMainFilterChips = [
    ...productFilters.map((p) => ({ key: `producto-${p}`, label: `Producto: ${p}`, onClear: () => removeProductFilter(p) })),
    lotFilter ? { key: 'lote', label: `Lote: ${lotFilter}`, onClear: () => setLotFilter('') } : null,
    warehouseFilter ? { key: 'bodega', label: `Bodega: ${warehouseFilter}`, onClear: () => setWarehouseFilter('') } : null,
    typeFilter ? { key: 'tipo', label: `Tipo: ${typeFilter}`, onClear: () => setTypeFilter('') } : null,
    clientFilter ? { key: 'cliente', label: `Cliente: ${clientFilter}`, onClear: () => setClientFilter('') } : null,
    quickSearch ? { key: 'quick', label: `Buscar: ${quickSearch}`, onClear: () => setQuickSearch('') } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>;
  const stockWarehouseSummary = useMemo(() => {
    const map = new Map<string, number>();
    CANET_OWN_WAREHOUSE_ORDER.forEach((bodega) => map.set(bodega, 0));
    stockByPLB.forEach((row) => {
      const bodega = normalizeWarehouseAlias(row.bodega) || 'Sin bodega';
      if (!CANET_OWN_WAREHOUSES.has(bodega)) return;
      map.set(bodega, (map.get(bodega) || 0) + Math.max(0, toNum(row.stock)));
    });
    return Array.from(map.entries())
      .map(([bodega, stock]) => ({ bodega, stock }))
      .sort((a, b) => {
        const ai = CANET_OWN_WAREHOUSE_ORDER.indexOf(a.bodega);
        const bi = CANET_OWN_WAREHOUSE_ORDER.indexOf(b.bodega);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return b.stock - a.stock;
      });
  }, [stockByPLB]);
  const inventorySummaryTones = ['violet', 'amber', 'indigo'] as const;
  const inventorySummaryChips = [
    ...stockWarehouseSummary.map((row, idx) => ({
      label: row.bodega,
      value: row.stock,
      tone: inventorySummaryTones[idx % inventorySummaryTones.length],
    })),
    { label: 'Caducidades', value: caducityAlerts.length, tone: 'rose' as const },
  ];

  useEffect(() => {
    if (accessMode === 'edit' && !canEditNow) {
      setAccessMode('consult');
    }
  }, [accessMode, canEditNow]);

  useEffect(() => {
    if (accessMode === 'unset') setShowMainFilters(false);
  }, [accessMode]);

  useEffect(() => {
    if (!isRestrictedUser) return;
    if (tab !== 'dashboard' && tab !== 'control_stock') {
      setTab('dashboard');
    }
  }, [isRestrictedUser, tab]);

  useEffect(() => {
    if (!isRestrictedUser) return;
    if (compactInventoryPanel !== 'stock') {
      setCompactInventoryPanel('stock');
    }
  }, [isRestrictedUser, compactInventoryPanel]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 app-page-shell inventory-readable">
      {!isStandaloneControlStock && (
      <div className="rounded-2xl border border-violet-100 bg-white p-4 md:p-5 shadow-sm compact-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">Inventario</p>
            <h1 className="text-2xl font-black text-violet-950">Control de stock Canet</h1>
            <p className="text-sm text-violet-700/80">Lo importante primero: stock, lotes y trazabilidad.</p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                Periodo
                <select
                  value={dateFilterMode}
                  onChange={(e) => setDateFilterMode(e.target.value as DateFilterMode)}
                  disabled={isRestrictedUser}
                  className="mt-1 block rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                    className="mt-1 block rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 outline-none min-w-[180px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
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
                <Download size={14} />
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
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => void downloadExecutiveReportExcel()} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                <Download size={14} />
                Excel gerencial
              </button>
              <button onClick={() => void downloadExecutiveReport()} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
                <Download size={14} />
                PDF gerencial
              </button>
            </div>
          )}
      </div>
      )}

      {!isStandaloneControlStock && (showAccessSelector && accessMode === 'unset' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-violet-950">Acceso a Inventario</h2>
            <p className="mt-1 text-sm text-violet-700">Elige cómo quieres entrar: consultar o editar.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <button
                onClick={() => setAccessMode('consult')}
                className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left hover:bg-violet-100"
              >
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
                <p className="text-xs text-amber-800">Permite modificar inventario. Los responsables recibirán notificación y quedará registro en bitácora.</p>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm compact-card">
            <div className="flex flex-wrap items-center gap-2">
              {showAccessSelector && (
                <>
                  <button
                    onClick={() => setAccessMode('consult')}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${!isEditModeActive ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-100 bg-violet-50 text-violet-700'}`}
                  >
                    Consultar
                  </button>
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
                Cada cambio notificará a los responsables de Canet y quedará guardado en bitácora.
              </p>
            )}
          </div>

          <InventoryConnectionBanner
            label="Canet"
            isOnline={canetDB.isOnline}
            isSyncing={canetDB.isSyncing}
            lastError={canetDB.lastError}
            lastSyncedAt={canetDB.lastSyncedAt}
            onRetry={canetDB.reload}
          />

          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm compact-card">
            <div className="flex flex-wrap gap-2">
              {visibleTabs.map((item) => {
                const isActive = item.key === tab;
                return (
                  <button key={item.key} onClick={() => selectInventoryTab(item.key)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 font-semibold transition ${item.compact ? 'text-xs' : 'text-sm'} ${isActive ? 'border-violet-500 bg-violet-600 text-white shadow-sm' : 'border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
                    <item.icon size={15} /> {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          {tab === 'maestros' && (
            <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm compact-card">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                {[
                  { key: 'cartonaje' as const, label: 'Cartonaje', Icon: Package },
                  { key: 'productos' as const, label: 'Productos', Icon: Package },
                  { key: 'lotes' as const, label: 'Lotes', Icon: Layers3 },
                  { key: 'bodegas' as const, label: 'Bodegas', Icon: Building2 },
                  { key: 'clientes' as const, label: 'Clientes', Icon: Users },
                  { key: 'tipos' as const, label: 'Tipos', Icon: Tags },
                  { key: 'bitacora' as const, label: 'Bitácora', Icon: AlertTriangle },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMasterSection(key)}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition ${
                      masterSection === key
                        ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                        : 'border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ))}

      {accessReady && (tab === 'dashboard' || tab === 'movimientos') && (
        <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm compact-card">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowMainFilters((prev) => !prev)}
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
            >
              {showMainFilters ? 'Ocultar filtros' : 'Filtros'}
              {activeMainFiltersCount > 0 ? ` (${activeMainFiltersCount})` : ''}
            </button>
            {activeMainFiltersCount > 0 && (
              <button
                onClick={() => {
                  setProductFilterInput('');
                  setProductFilters([]);
                  setLotFilter('');
                  setWarehouseFilter('');
                  setTypeFilter('');
                  setClientFilter('');
                  setQuickSearch('');
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Limpiar
              </button>
            )}
          </div>

          {showMainFilters && (
            <div className="mt-3 grid gap-2 md:grid-cols-6">
              <InputAutocompleteTag label="Producto" value={productFilterInput} onChange={setProductFilterInput} onSelect={addProductFilter} options={productOptions} placeholder="Escribe producto..." />
              <InputAutocomplete label="Lote" value={lotFilter} onChange={setLotFilter} options={lotOptions} placeholder="Escribe lote..." />
              <InputAutocomplete label="Bodega" value={warehouseFilter} onChange={setWarehouseFilter} options={warehouseOptions} placeholder="Escribe bodega..." />
              <InputAutocomplete label="Tipo movimiento" value={typeFilter} onChange={setTypeFilter} options={typeOptions} placeholder="Escribe tipo..." />
              <InputAutocomplete label="Cliente" value={clientFilter} onChange={setClientFilter} options={clientOptions} placeholder="Escribe cliente..." />
              <Input label="Búsqueda rápida" value={quickSearch} onChange={setQuickSearch} placeholder="producto, lote, nota..." />
            </div>
          )}
          {activeMainFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeMainFilterChips.map((chip) => (
                <span key={chip.key} className="app-filter-chip">
                  {chip.label}
                  <button className="app-filter-chip-x" onClick={chip.onClear}>x</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {accessReady && tab === 'dashboard' && (
        <div className="space-y-4">
          {isCompact && (
            <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {visibleCompactInventoryTiles.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setCompactInventoryPanel(key)}
                    className={`compact-card rounded-xl border p-2 text-xs font-black ${compactInventoryPanel === key
                      ? 'border-violet-400 bg-violet-700 text-white'
                      : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
                      }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Icon size={15} />
                      <span>{label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="rounded-2xl border border-violet-200 bg-white p-2">
            <section className="grid gap-2 md:grid-cols-4">
              <KpiCard
                title="Productos en riesgo"
                value={`${criticalProducts.length}`}
                helper={criticalProducts.length > 0 ? `Críticos: ${criticalProducts.join(', ')}` : 'Sin riesgo crítico'}
                tone={criticalProducts.length > 0 ? 'rose' : 'emerald'}
                onClick={() => setRiskModalOpen(true)}
              />
              <KpiCard
                title="Stock total (Canet)"
                value={stockTotalCanet.toLocaleString('es-ES')}
                helper="Suma total en bodega CANET"
                tone="emerald"
              />
              <KpiCard
                title="Salidas del mes"
                value={monthOutputTotal.toLocaleString('es-ES')}
                helper="Ventas, envíos y traspasos"
                tone="violet"
                onClick={() => scrollToSection('inventory-output-section')}
              />
              <KpiCard
                title="Ajustes del mes"
                value={monthAdjustmentsTotal.toLocaleString('es-ES')}
                helper="Suma absoluta de ajustes"
                tone="amber"
                onClick={() => scrollToSection('inventory-adjustments-section')}
              />
            </section>
            <div className="mt-2 flex justify-end">
              <button onClick={() => void downloadExecutiveReport()} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
                <Download size={14} />
                PDF gerencial
              </button>
            </div>
          </section>

          {(!isCompact || compactInventoryPanel === 'stock') && stockCartonaje.length > 0 && (
            <DataSection title="Stock Cartonaje Canet" subtitle="Stock acumulado por producto (CARTONAJE) y lote" tone="violet" onDownload={async () => {
              openTablePdf(
                'Inventario Canet - Stock Cartonaje',
                `dashboard-stock-cartonaje-${periodFileKey}.pdf`,
                ['Producto', 'Lote', 'Stock'],
                stockCartonaje.map((r) => [r.producto, r.lote, r.stock]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Stock Cartonaje (${periodFileKey}).`);
              appendAudit('Descarga PDF', `Dashboard stock cartonaje (${periodFileKey})`);
            }} onDownloadExcel={async () => {
              openTableExcel(
                'Inventario Canet - Stock Cartonaje',
                `dashboard-stock-cartonaje-${periodFileKey}.xlsx`,
                ['Producto', 'Lote', 'Stock'],
                stockCartonaje.map((r) => [r.producto, r.lote, r.stock]),
              );
              await notifyAnabela(`${actorName} descargó Excel tablero: Stock Cartonaje (${periodFileKey}).`);
              appendAudit('Descarga Excel', `Dashboard stock cartonaje (${periodFileKey})`);
            }}>
              <SimpleDataTable headers={['Producto', 'Lote', 'Stock']} rows={stockCartonaje.map((r) => [
                <ProductPill key={`${r.producto}-${r.lote}-cart`} code={r.producto} colorMap={productColorMap} />,
                r.lote,
                <span key={`${r.producto}-${r.lote}-qty`} className="font-mono text-sm font-semibold">{Number(r.stock.toFixed(2)).toLocaleString('es-ES')}</span>
              ])}
              />
            </DataSection>
          )}

          {(!isCompact || compactInventoryPanel === 'stock') && (
            <DataSection title="Stock por producto por lote y bodega" subtitle="Acumulado hasta el mes seleccionado." tone="violet" onDownload={async () => {
              openTablePdf(
                'Inventario - Stock por producto/lote/bodega',
                `dashboard-stock-${periodFileKey}.pdf`,
                ['Producto', 'Lote', 'Bodega', 'Stock'],
                stockByPLB.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Stock por producto/lote/bodega (${periodFileKey}).`);
              appendAudit('Descarga PDF', `Dashboard stock (${periodFileKey})`);
            }} onDownloadExcel={async () => {
              openTableExcel(
                'Inventario - Stock por producto/lote/bodega',
                `dashboard-stock-${periodFileKey}.xlsx`,
                ['Producto', 'Lote', 'Bodega', 'Stock'],
                stockByPLB.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
              );
              await notifyAnabela(`${actorName} descargó Excel tablero: Stock por producto/lote/bodega (${periodFileKey}).`);
              appendAudit('Descarga Excel', `Dashboard stock (${periodFileKey})`);
            }}>
              <SimpleDataTable headers={['Producto', 'Lote', 'Bodega', 'Stock', 'Estado']} rows={stockByPLB.map((r) => {
                const stockVal = toNum(r.stock);
                const consumoMes = Math.max(0, toNum(productConsumoMesMap.get(r.producto) || 0));
                const stockOptimo = Math.max(0, toNum(productStockOptimoMap.get(r.producto) || 0));
                const coberturaMeses = consumoMes > 0
                  ? stockVal / consumoMes
                  : (stockOptimo > 0 ? stockVal / (stockOptimo / 4) : 0);
                const semaforo = getCoverageSemaforo(coberturaMeses, stockVal);
                const status = semaforo === 'AGOTADO'
                  ? 'Agotado'
                  : semaforo === 'CRITICO'
                    ? 'Crítico'
                    : semaforo === 'ATENCION'
                      ? 'Stock bajo'
                      : 'OK';
                return [
                  <ProductPill key={`${r.producto}-${r.lote}-${r.bodega}`} code={r.producto} colorMap={productColorMap} />,
                  r.lote,
                  r.bodega,
                  Math.max(0, stockVal),
                  <span
                    key={`${r.producto}-${r.lote}-status`}
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${status === 'Agotado'
                      ? 'bg-slate-100 text-slate-600'
                      : status === 'Crítico'
                        ? 'bg-rose-100 text-rose-700'
                        : status === 'Stock bajo'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                  >
                    {status}
                  </span>,
                ];
              })} />
              <StockByProductVisual
                rows={stockVisualByProduct}
                colorMap={productColorMap}
                onSelectLot={(producto, lote, cantidad) => setStockLotSelected({ producto, lote, cantidad: Number(cantidad.toFixed(2)) })}
              />
              {stockLotSelected && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800">
                  <ProductPill code={stockLotSelected.producto} colorMap={productColorMap} /> Lote {stockLotSelected.lote}: {stockLotSelected.cantidad}
                </div>
              )}
            </DataSection>
          )}

          {!isRestrictedUser && (!isCompact || compactInventoryPanel === 'moves') && (
            <DataSection title="Movimientos por lote del mes" subtitle="Detalle filtrable de movimientos mensuales." tone="indigo" onDownload={async () => {
              openTablePdf(
                'Inventario - Movimientos por lote del mes',
                `dashboard-mov-lote-${periodFileKey}.pdf`,
                ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad'],
                movementByLotDetail.map((m) => [m.fecha, m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || 0]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Movimientos por lote (${periodFileKey}).`);
              appendAudit('Descarga PDF', `Dashboard movimientos por lote (${periodFileKey})`);
            }} onDownloadExcel={async () => {
              openTableExcel(
                'Inventario - Movimientos por lote del mes',
                `dashboard-mov-lote-${periodFileKey}.xlsx`,
                ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad'],
                movementByLotDetail.map((m) => [m.fecha, m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || 0]),
              );
              await notifyAnabela(`${actorName} descargó Excel tablero: Movimientos por lote (${periodFileKey}).`);
              appendAudit('Descarga Excel', `Dashboard movimientos por lote (${periodFileKey})`);
            }}>
              <div className="grid gap-2 md:grid-cols-3 mb-3">
                <SelectFilter label="Producto" value={dashMoveProduct} onChange={setDashMoveProduct} options={productOptions} />
                <SelectFilter label="Lote" value={dashMoveLot} onChange={setDashMoveLot} options={dashMoveLotOptions} />
                <SelectFilter label="Bodega" value={dashMoveBodega} onChange={setDashMoveBodega} options={warehouseOptions} />
              </div>
              <SimpleDataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad']} rows={takeRows(movementByLotDetail, showMovesAll).map((m) => [m.fecha, m.tipo_movimiento, <ProductPill key={`${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />, m.lote, m.bodega, m.cantidad_signed || 0])} />
              {movementByLotDetail.length > 5 && (
                <ToggleRowsButton showAll={showMovesAll} onToggle={() => setShowMovesAll((v) => !v)} />
              )}
            </DataSection>
          )}

          {!isRestrictedUser && (!isCompact || compactInventoryPanel === 'clients') && (
            <DataSection title="Stock por cliente o bodega por producto y lote" subtitle="Solo ventas." tone="emerald" onDownload={async () => {
              openTablePdf(
                'Inventario - Stock por cliente o bodega',
                `dashboard-clientes-${periodFileKey}.pdf`,
                ['Cliente/Bodega', 'Producto', 'Lote', 'Cantidad'],
                stockByClient.map((r) => [r.destino_cliente, r.producto, r.lote, r.cantidad]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Stock por cliente/bodega (${periodFileKey}).`);
              appendAudit('Descarga PDF', `Dashboard stock cliente/bodega (${periodFileKey})`);
            }} onDownloadExcel={async () => {
              openTableExcel(
                'Inventario - Stock por cliente o bodega',
                `dashboard-clientes-${periodFileKey}.xlsx`,
                ['Cliente/Bodega', 'Producto', 'Lote', 'Cantidad'],
                stockByClient.map((r) => [r.destino_cliente, r.producto, r.lote, r.cantidad]),
              );
              await notifyAnabela(`${actorName} descargó Excel tablero: Stock cliente/bodega (${periodFileKey}).`);
              appendAudit('Descarga Excel', `Dashboard stock cliente/bodega (${periodFileKey})`);
            }}>
              <div className="mb-3">
                <SelectFilter label="Cliente/Bodega" value={dashClientTarget} onChange={setDashClientTarget} options={clientTargetOptions} />
              </div>
              <SimpleDataTable headers={['Cliente/Bodega', 'Producto', 'Lote', 'Cantidad']} rows={takeRows(stockByClient, showClientsAll).map((r) => [r.destino_cliente, <ProductPill key={`${r.destino_cliente}-${r.producto}-${r.lote}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.cantidad])} />
              {stockByClient.length > 5 && (
                <ToggleRowsButton showAll={showClientsAll} onToggle={() => setShowClientsAll((v) => !v)} />
              )}
            </DataSection>
          )}

          {!isRestrictedUser && (!isCompact || compactInventoryPanel === 'adjust') && (
            <DataSection id="inventory-adjustments-section" title="Control de ajustes" subtitle="Ajustes positivos y negativos." tone="amber" onDownload={async () => {
              openTablePdf(
                'Inventario - Control de ajustes',
                `dashboard-ajustes-${periodFileKey}.pdf`,
                ['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad'],
                adjustmentControl.map((r) => [r.producto, r.lote, r.bodega, r.tipo, r.cantidad]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Control de ajustes (${periodFileKey}).`);
              appendAudit('Descarga PDF', `Dashboard ajustes (${periodFileKey})`);
            }} onDownloadExcel={async () => {
              openTableExcel(
                'Inventario - Control de ajustes',
                `dashboard-ajustes-${periodFileKey}.xlsx`,
                ['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad'],
                adjustmentControl.map((r) => [r.producto, r.lote, r.bodega, r.tipo, r.cantidad]),
              );
              await notifyAnabela(`${actorName} descargó Excel tablero: Control de ajustes (${periodFileKey}).`);
              appendAudit('Descarga Excel', `Dashboard ajustes (${periodFileKey})`);
            }}>
              <SimpleDataTable headers={['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad']} rows={takeRows(adjustmentControl, showAdjustAll).map((r) => [<ProductPill key={`${r.producto}-${r.lote}-${r.tipo}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.tipo, r.cantidad])} />
              {adjustmentControl.length > 5 && (
                <ToggleRowsButton showAll={showAdjustAll} onToggle={() => setShowAdjustAll((v) => !v)} />
              )}
            </DataSection>
          )}

          {!isRestrictedUser && (!isCompact || compactInventoryPanel === 'outputs') && (
            <DataSection id="inventory-output-section" title="Control de salidas por lote" subtitle="Traspaso, venta y envio." tone="rose" onDownload={async () => {
              openTablePdf(
                'Inventario - Control de salidas por lote',
                `dashboard-salidas-${periodFileKey}.pdf`,
                ['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad'],
                outputControl.map((r) => [r.producto, r.lote, r.bodega, r.tipo, r.cantidad]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Control de salidas (${periodFileKey}).`);
              appendAudit('Descarga PDF', `Dashboard salidas (${periodFileKey})`);
            }} onDownloadExcel={async () => {
              openTableExcel(
                'Inventario - Control de salidas por lote',
                `dashboard-salidas-${periodFileKey}.xlsx`,
                ['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad'],
                outputControl.map((r) => [r.producto, r.lote, r.bodega, r.tipo, r.cantidad]),
              );
              await notifyAnabela(`${actorName} descargó Excel tablero: Control de salidas (${periodFileKey}).`);
              appendAudit('Descarga Excel', `Dashboard salidas (${periodFileKey})`);
            }}>
              <div className="grid gap-2 md:grid-cols-2 mb-3">
                <SelectFilter label="Producto" value={dashOutProduct} onChange={setDashOutProduct} options={productOptions} />
                <SelectFilter label="Lote" value={dashOutLot} onChange={setDashOutLot} options={dashOutLotOptions} />
              </div>
              <SimpleDataTable headers={['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad']} rows={takeRows(outputControl, showOutputAll).map((r) => [<ProductPill key={`${r.producto}-${r.lote}-${r.tipo}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.tipo, r.cantidad])} />
              {outputControl.length > 5 && (
                <ToggleRowsButton showAll={showOutputAll} onToggle={() => setShowOutputAll((v) => !v)} />
              )}
            </DataSection>
          )}
        </div>
      )}

      {accessReady && tab === 'control_stock' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Control de stock vendible</h2>
                <p className="mt-1 max-w-3xl text-sm font-medium text-slate-600">
                  Esta vista responde una sola pregunta: cuánto producto tiene Solaris disponible para vender. Cuenta solo Canet, Huarte y Mas Borrás, más el potencial pendiente de ensamblar.
                </p>
              </div>
              <button
                onClick={() => openHypotheticalModal('potential')}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Simular venta
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Periodo
                <select
                  value={dateFilterMode}
                  onChange={(e) => setDateFilterMode(e.target.value as DateFilterMode)}
                  disabled={isRestrictedUser}
                  className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="day">Día</option>
                  <option value="range">Rango</option>
                  <option value="month">Mes</option>
                  <option value="year">Año</option>
                  {!isRestrictedUser && <option value="all">Todo</option>}
                </select>
              </label>
              {dateFilterMode === 'month' && (
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Mes
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    disabled={isRestrictedUser}
                    className="mt-1 block min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                </label>
              )}
              {dateFilterMode === 'year' && (
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Año
                  <input
                    type="number"
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none"
                  />
                </label>
              )}
              {(dateFilterMode === 'day' || dateFilterMode === 'range') && (
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {dateFilterMode === 'day' ? 'Día' : 'Desde'}
                  <input
                    type="date"
                    value={dateFilterStart}
                    onChange={(e) => setDateFilterStart(e.target.value)}
                    className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none"
                  />
                </label>
              )}
              {dateFilterMode === 'range' && (
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Hasta
                  <input
                    type="date"
                    value={dateFilterEnd}
                    onChange={(e) => setDateFilterEnd(e.target.value)}
                    className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none"
                  />
                </label>
              )}
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                Periodo activo: {periodLabel}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-[11px] font-black uppercase text-rose-700">Críticos</p>
                <p className="mt-1 text-2xl font-black text-rose-900">{stockControlSummary.critico}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-[11px] font-black uppercase text-amber-700">Atención</p>
                <p className="mt-1 text-2xl font-black text-amber-900">{stockControlSummary.atencion}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-black uppercase text-emerald-700">Óptimos</p>
                <p className="mt-1 text-2xl font-black text-emerald-900">{stockControlSummary.optimo}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase text-slate-600">Disponible total</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{Number(stockControlSummary.stockDisponibleTotal.toFixed(2))}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase text-slate-600">Potencial</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{Number(stockControlSummary.potencialTotal.toFixed(2))}</p>
              </div>
            </div>
          </div>

            <div className="grid gap-2 md:grid-cols-3">
              <SelectFilter
                label="Estado"
              value={controlSemaforoFilter}
              onChange={setControlSemaforoFilter}
              options={['AGOTADO', 'CRITICO', 'ATENCION', 'OPTIMO']}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-600 md:col-span-2">
              <p className="font-black uppercase tracking-wide text-slate-700">Cómo leerlo</p>
              <p className="mt-1">Crítico: menos de 3 meses de cobertura. Atención: entre 3 y 4 meses. Óptimo: 4 meses o más. No cuentan Valencia, Pamplona, Bilbao, Barcelona, Logroño ni Ensamblaje Colombia.</p>
            </div>
          </div>
          <DataSection
            title="Productos y acción sugerida"
            subtitle={`Periodo activo: ${periodLabel}. Haz clic en un producto para ver sus lotes.`}
            tone="emerald"
            onDownload={async () => {
              openTablePdf(
                'Inventario - Control stock',
                `control-stock-${periodFileKey}.pdf`,
                ['Producto', 'Lotes vendibles', 'Stock vendible', 'Potencial', 'Disponible estimado', 'Stock mínimo', 'Stock óptimo', 'Consumo mes', 'Cobertura', 'Estado', 'Acción sugerida'],
                stockControlDecisionRows.map((r) => [
                  r.producto,
                  r.lotesCount,
                  Number(r.stockVendible.toFixed(2)),
                  Number(r.potencialCajas.toFixed(2)),
                  Number(r.stockDisponible.toFixed(2)),
                  r.stockMin || '-',
                  r.stockOptimo || '-',
                  r.consumoMes,
                  formatCoverage(r.coberturaMeses),
                  r.estado,
                  r.accion,
                ]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Control stock (${periodFileKey}).`);
              appendAudit('Descarga PDF', `Control stock (${periodFileKey})`);
            }} onDownloadExcel={async () => {
              openTableExcel(
                'Inventario - Control stock',
                `control-stock-${periodFileKey}.xlsx`,
                ['Producto', 'Lotes vendibles', 'Stock vendible', 'Potencial', 'Disponible estimado', 'Stock mínimo', 'Stock óptimo', 'Consumo mes', 'Cobertura', 'Estado', 'Acción sugerida'],
                stockControlDecisionRows.map((r) => [
                  r.producto,
                  r.lotesCount,
                  Number(r.stockVendible.toFixed(2)),
                  Number(r.potencialCajas.toFixed(2)),
                  Number(r.stockDisponible.toFixed(2)),
                  r.stockMin || '-',
                  r.stockOptimo || '-',
                  r.consumoMes,
                  formatCoverage(r.coberturaMeses),
                  r.estado,
                  r.accion,
                ]),
              );
              await notifyAnabela(`${actorName} descargó Excel tablero: Control stock (${periodFileKey}).`);
              appendAudit('Descarga Excel', `Control stock (${periodFileKey})`);
            }}
          >
            <SimpleDataTable
              headers={['Producto', 'Lotes vendibles', 'Stock vendible', 'Potencial', 'Disponible', 'Consumo mes', 'Cobertura', 'Estado', 'Acción sugerida']}
              rows={stockControlDecisionRows.map((r) => [
                <ProductPill key={`${r.producto}-decision`} code={r.producto} colorMap={productColorMap} />,
                r.lotesCount,
                Number(r.stockVendible.toFixed(2)),
                Number(r.potencialCajas.toFixed(2)),
                Number(r.stockDisponible.toFixed(2)),
                r.consumoMes,
                formatCoverage(r.coberturaMeses),
                <span
                  key={`${r.producto}-decision-estado`}
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${getCoverageSemaforoClass(r.estado)}`}
                >
                  {r.estado}
                </span>,
                <span key={`${r.producto}-decision-action`} className="text-xs font-semibold text-slate-700">{r.accion}</span>,
              ])}
              onRowClick={(_, idx) => {
                const row = stockControlDecisionRows[idx];
                if (!row) return;
                setPotentialDetailProduct(row.producto);
              }}
            />
          </DataSection>

          {potentialDetailProduct && (
            <DataSection
              title={`Detalle por lote · ${potentialDetailProduct}`}
              subtitle="Desglose por lote en bodegas vendibles: Canet, Huarte y Mas Borrás."
              tone="amber"
            >
              <div className="mb-2 flex justify-end">
                <button
                  onClick={() => setPotentialDetailProduct(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cerrar detalle
                </button>
              </div>
              <SimpleDataTable
                headers={['Lote', 'Canet', 'Huarte', 'Mas Borrás', 'Stock vendible', 'Potencial', 'Disponible', 'Consumo mes', 'Cobertura', 'Estado']}
                rows={stockControlDetailRows.map((r) => [
                  r.lote,
                  Number(r.stockCanet.toFixed(2)),
                  Number(r.stockHuarte.toFixed(2)),
                  Number(r.stockMasBorras.toFixed(2)),
                  Number(r.stockVendible.toFixed(2)),
                  Number(r.potencialCajas.toFixed(2)),
                  Number(r.disponible.toFixed(2)),
                  r.consumoMes,
                  formatCoverage(r.coberturaMeses),
                  <span
                    key={`${r.producto}-${r.lote}-detail-status`}
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${getCoverageSemaforoClass(r.estado)}`}
                  >
                    {r.estado}
                  </span>,
                ])}
              />
            </DataSection>
          )}
        </div>
      )}

      {accessReady && tab === 'movimientos' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Movimientos</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={openCreateModal} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Nuevo movimiento</button>
                <button onClick={() => void downloadMovementsExcel()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"><Download size={14} /> Excel mes/filtro</button>
                <button onClick={() => void downloadMovements()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"><Download size={14} /> PDF mes/filtro</button>
              </div>
            </div>
          </div>

          <SimpleDataTable
            headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Cliente', 'Destino', 'Notas', 'Últ. edición', 'Acciones']}
            rows={visibleMovementsLast7Days.map((m) => [
              m.fecha,
              m.tipo_movimiento,
              <ProductPill key={`${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />,
              m.lote,
              m.bodega,
              m.cantidad_signed ?? m.cantidad,
              m.cliente || '-',
              m.destino || '-',
              m.notas || '-',
              `${m.updated_by || '-'} ${m.updated_at ? `· ${new Date(m.updated_at).toLocaleDateString('es-ES')}` : ''}`,
              <div key={`act-${m.id}`} className="flex items-center gap-1">
                <button disabled={!isEditModeActive} onClick={() => startEdit(m)} className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Pencil size={13} /></button>
                <button disabled={!isEditModeActive || deletingMovementId === toNum(m.id)} onClick={() => void deleteMovement(m.id)} className={`rounded-lg p-1.5 ${isEditModeActive && deletingMovementId !== toNum(m.id) ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Trash2 size={13} /></button>
              </div>,
            ])}
          />
          {visibleMovements.length > visibleMovementsLast7Days.length && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowMovementsAll(true)}
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
              >
                Mostrar historial completo ({visibleMovements.length})
              </button>
            </div>
          )}
          {showMovementsAll && visibleMovements.length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowMovementsAll(false)}
                className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              >
                Mostrar solo últimos 7 días
              </button>
            </div>
          )}
        </div>
      )}

      {accessReady && tab === 'ensamblajes' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-violet-950">Ensamblajes</h3>
                <p className="text-sm text-violet-700">Movimientos de ensamblaje y preparación de producto.</p>
              </div>
              <button onClick={openCreateAssemblyModal} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}>
                <Plus size={14} /> Nuevo ensamblaje
              </button>
            </div>
          </div>
          <SimpleDataTable
            headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Notas', 'Acciones']}
            rows={visibleMovements.filter((m) => normalizeSearch(m.tipo_movimiento).includes('ensam')).map((m) => [
              formatDateForDisplay(m.fecha),
              clean(m.tipo_movimiento),
              <ProductPill key={`ens-${m.id}-${m.producto}`} code={clean(m.producto)} colorMap={productColorMap} />,
              clean(m.lote),
              m.cantidad_signed ?? m.cantidad,
              clean(m.bodega),
              clean(m.notas) || '-',
              <div key={`ens-actions-${m.id}`} className="flex items-center gap-1">
                <button disabled={!isEditModeActive} onClick={() => startEdit(m)} className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Pencil size={13} /></button>
                <button onClick={() => void deleteMovement(m.id)} disabled={!isEditModeActive || deletingMovementId === toNum(m.id)} className={`rounded-lg p-1.5 ${isEditModeActive && deletingMovementId !== toNum(m.id) ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} title="Eliminar">
                  <Trash2 size={13} />
                </button>
              </div>,
            ])}
          />
        </div>
      )}

      {accessReady && tab === 'cierres' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Cierres congelados</p>
                <h3 className="text-lg font-black text-slate-950">Cierres de mes Canet</h3>
                <p className="text-sm text-slate-600">
                  Aquí puedes revisar qué meses están cerrados. Si un cierre quedó guardado en el mes equivocado, muévelo al mes correcto o elimínalo.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {canetMonthlyClosures.length} cierres
              </span>
            </div>
            {!isEditModeActive && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                Entra en modo edición para mover o eliminar cierres. En modo consulta solo puedes revisarlos y descargar Excel.
              </div>
            )}
          </div>

          <SimpleDataTable
            headers={['Mes cerrado', 'Guardado', 'Responsable', 'Stock', 'Lotes', 'Bodegas', 'Mover a', 'Acciones']}
            rows={[...canetMonthlyClosures].reverse().map((snapshot) => [
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
                disabled={!isEditModeActive}
                onChange={(event) => void moveMonthlyCloseToMonth(snapshot, event.target.value)}
                className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />,
              <div key={`${snapshot.id}-actions`} className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadMonthlyCloseSnapshotExcel(snapshot)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                >
                  <Download size={13} />
                  Excel
                </button>
                <button
                  type="button"
                  disabled={!isEditModeActive}
                  onClick={() => void deleteMonthlyCloseSnapshot(snapshot)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Trash2 size={13} />
                  Eliminar
                </button>
              </div>,
            ])}
          />
        </div>
      )}

      {accessReady && tab === 'auditoria' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-amber-600">Auditoría</p>
                <h3 className="text-lg font-black text-slate-950">Diagnóstico de cambios de stock</h3>
                <p className="text-sm text-slate-600">
                  Vista de lectura: detecta cierres que cambiaron, movimientos antiguos tocados, lotes cortos y traspasos incompletos.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {inventoryAuditFindings.length} hallazgos
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-rose-700">Críticos</p>
              <p className="mt-1 text-2xl font-black text-rose-900">{inventoryAuditSummary.critical}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-amber-700">Revisar</p>
              <p className="mt-1 text-2xl font-black text-amber-900">{inventoryAuditSummary.review}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">Informativos</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{inventoryAuditSummary.info}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h3 className="text-lg font-black text-slate-950">Hallazgos</h3>
              <p className="text-sm text-slate-600">
                Estos registros no modifican inventario. Sirven para decidir qué corregir y en qué movimiento empezar a mirar.
              </p>
            </div>
            <SimpleDataTable
              headers={['Estado', 'Categoría', 'Periodo', 'Producto', 'Lote', 'Bodega', 'Detalle']}
              rows={inventoryAuditFindings.map((finding) => [
                <span
                  key={`${finding.category}-${finding.period}-${finding.product}-${finding.lot}-sev`}
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    finding.severity === 'crítico'
                      ? 'bg-rose-100 text-rose-700'
                      : finding.severity === 'revisar'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {finding.severity}
                </span>,
                finding.category,
                finding.period,
                finding.product === '-'
                  ? '-'
                  : <ProductPill key={`${finding.category}-${finding.product}-${finding.lot}`} code={finding.product} colorMap={productColorMap} />,
                finding.lot,
                finding.warehouse,
                <span key={`${finding.category}-${finding.period}-${finding.product}-${finding.lot}-detail`} className="text-xs font-semibold text-slate-700">
                  {finding.detail}
                </span>,
              ])}
            />
          </div>
        </div>
      )}

      {accessReady && tab === 'maestros' && masterSection === 'cartonaje' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Movimientos Cartonaje</h3>
              <button onClick={() => setCartonajeModalOpen(true)} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}>
                <Plus size={14} /> Nuevo movimiento cartonaje
              </button>
            </div>
          </div>
          <SimpleDataTable
            headers={['Fecha/hora', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Usuario', 'Acción']}
            rows={visibleMovements.filter(m => cartonajeProducts.includes(clean(m.producto))).map(m => [
              new Date(m.created_at || m.fecha).toLocaleString('es-ES'),
              clean(m.tipo_movimiento),
              <ProductPill key={m.id} code={clean(m.producto)} colorMap={productColorMap} />,
              clean(m.lote),
              <span key={`${m.id}-qty`} className={`rounded-md px-1.5 py-0.5 text-sm font-bold ${toNum(m.cantidad_signed || m.cantidad) < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {(m.cantidad_signed ?? m.cantidad) > 0 ? `+${m.cantidad_signed ?? m.cantidad}` : m.cantidad_signed ?? m.cantidad}
              </span>,
              clean(m.bodega),
              clean(m.updated_by || 'Sistema'),
              <button key={`dm-${m.id}`} onClick={() => void deleteMovement(m.id)} disabled={!isEditModeActive || deletingMovementId === toNum(m.id)} className={`rounded-lg p-1.5 ${isEditModeActive && deletingMovementId !== toNum(m.id) ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} title="Eliminar">
                <Trash2 size={13} />
              </button>,
            ])}
          />
        </div>
      )}

      {accessReady && tab === 'maestros' && masterSection === 'bitacora' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-black text-violet-950">Bitácora de cambios</h3>
            <p className="text-sm text-violet-700">Registro de quién hizo qué y cuándo en inventario.</p>
          </div>
          <SimpleDataTable
            headers={['Fecha/hora', 'Usuario', 'Acción', 'Detalle']}
            rows={auditLog.map((entry) => [
              new Date(entry.at).toLocaleString('es-ES'),
              entry.userName || getUserName(entry.userId),
              entry.action,
              entry.details || '-',
            ])}
          />
        </div>
      )}

      {accessReady && tab === 'maestros' && masterSection === 'productos' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Productos</h3>
              {isEditModeActive && (
                <button onClick={openProductCreateModal} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                  <Plus size={14} /> Crear Producto
                </button>
              )}
            </div>
          </div>
          <SimpleDataTable
            headers={['Producto', 'Tipo', 'Color', 'Stock min', 'Stock optimo', 'Consumo mes', 'Modo', 'Receta', 'Activo', 'Acciones']}
            rows={productos.filter((p) => !isRetiredProductCode(p.producto)).map((p) => [
              <ProductPill key={clean(p.producto)} code={clean(p.producto)} colorMap={productColorMap} />,
              clean(p.tipo_producto) || 'COMPLEMENTO ALIMENTICIO',
              <span key={`${clean(p.producto)}-sw`} className="inline-flex h-5 w-5 rounded-full border border-violet-200" style={{ backgroundColor: productColorMap.get(clean(p.producto)) || '#7c3aed' }} />,
              p.stock_min || '-',
              p.stock_opt || p.stock_optimo || '-',
              p.consumo_mensual_cajas || '-',
              p.modo_stock || '-',
              formatKitComponentsInline((p as any).kit_componentes || (p as any).componentes_kit),
              p.activo_si_no || 'SI',
              <button
                key={`product-edit-${clean(p.producto)}`}
                disabled={!isEditModeActive}
                onClick={() => openProductEditModal(p)}
                className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <Pencil size={13} />
              </button>,
            ])}
          />
        </div>
      )}

      {accessReady && tab === 'maestros' && masterSection === 'lotes' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-black text-violet-950">Lotes</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-violet-200 bg-violet-50 p-1">
                  <button
                    onClick={() => setLotViewMode('active')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      lotViewMode === 'active' ? 'bg-violet-600 text-white shadow-sm' : 'text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    Activos ({visibleLotes.length})
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
                <button onClick={openLotCreateModal} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Añadir lote</button>
              </div>
            </div>
          </div>
          {lotViewMode === 'archived' ? (
            <SimpleDataTable
              headers={['Producto', 'Lote', 'Estado', 'Viales', 'Caducidad', 'Archivado', 'Acciones']}
              rows={archivedLotes.map((l, idx) => {
                const lotState = effectiveLotState(l.producto, l.lote, l.estado);
                const lotKey = lotKeyOf(l.producto, l.lote);
                const lotFinalizado =
                  lotAssemblyFinalizedByProductLot.get(lotKey) === 'SI' ||
                  normalizeEnsamblajeFinalizado((l as any).ensamblaje_finalizado) === 'SI';
                const vialesDisplay = effectiveLotVialesByKey.get(lotKey) || toVialesNum(l.viales_recibidos);
                const caducityDisplay = effectiveLotCaducityByKey.get(lotKey) || clean(l.fecha_caducidad);
                const archivedEntry = archivedLotEntryByKey.get(lotKey);
                return [
                  <ProductPill key={`${clean(l.producto)}-${clean(l.lote)}-${idx}`} code={clean(l.producto)} colorMap={productColorMap} />,
                  clean(l.lote),
                  <div key={`arch-lot-state-wrap-${idx}`} className="flex flex-wrap items-center gap-1">
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      ARCHIVADO
                    </span>
                    {lotFinalizado && (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        ENS. FINALIZADO
                      </span>
                    )}
                    {lotState === 'AGOTADO' && (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                        AGOTADO
                      </span>
                    )}
                  </div>,
                  vialesDisplay > 0 ? formatVialesForInput(String(vialesDisplay)) : '-',
                  formatDateForDisplay(caducityDisplay),
                  archivedEntry?.archivedAt ? formatDateForDisplay(archivedEntry.archivedAt) : '-',
                  <div key={`arch-lot-actions-${idx}`} className="flex flex-wrap items-center gap-1">
                    <button
                      disabled={!isEditModeActive}
                      onClick={() => void restoreLot(l)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                        isEditModeActive
                          ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <RotateCcw size={12} />
                        Restaurar / activar
                      </span>
                    </button>
                  </div>,
                ];
              })}
            />
          ) : (
          <SimpleDataTable
            headers={['Producto', 'Lote', 'Estado', 'Viales', 'Caducidad', 'Semáforo', 'Acciones']}
            rows={visibleLotes.map((l, idx) => {
              const lotState = effectiveLotState(l.producto, l.lote, l.estado);
              const lotKey = lotKeyOf(l.producto, l.lote);
              const lotFinalizado =
                lotAssemblyFinalizedByProductLot.get(lotKey) === 'SI' ||
                normalizeEnsamblajeFinalizado((l as any).ensamblaje_finalizado) === 'SI';
              const vialesDisplay = effectiveLotVialesByKey.get(lotKey) || toVialesNum(l.viales_recibidos);
              const caducityDisplay = effectiveLotCaducityByKey.get(lotKey) || clean(l.fecha_caducidad);
              return [
                <ProductPill key={`${clean(l.producto)}-${clean(l.lote)}-${idx}`} code={clean(l.producto)} colorMap={productColorMap} />,
                clean(l.lote),
                <div key={`lot-state-wrap-${idx}`} className="flex flex-wrap items-center gap-1">
                  <span
                    key={`lot-state-${idx}`}
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${lotState === 'AGOTADO' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}
                  >
                    {lotState}
                  </span>
                  {lotFinalizado && (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      ENS. FINALIZADO
                    </span>
                  )}
                </div>,
                vialesDisplay > 0 ? formatVialesForInput(String(vialesDisplay)) : '-',
                formatDateForDisplay(caducityDisplay),
                clean(l.semaforo_caducidad) || '-',
                <div key={`lot-actions-${idx}`} className="flex flex-wrap items-center gap-1">
                  <button disabled={!isEditModeActive} onClick={() => openLotEditModal(l)} className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Pencil size={13} /></button>
                  <button
                    disabled={!isEditModeActive || isForcedAgotadoLot(l.producto, l.lote)}
                    onClick={() => void toggleLotExhausted(l)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold ${isEditModeActive && !isForcedAgotadoLot(l.producto, l.lote) ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                  >
                    {isForcedAgotadoLot(l.producto, l.lote) ? 'Fijo' : lotState === 'AGOTADO' ? 'Activar' : 'Agotar'}
                  </button>
                  <button
                    disabled={!isEditModeActive || lotState === 'AGOTADO'}
                    onClick={() => void toggleLotAssemblyFinalized(l)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                      isEditModeActive && lotState !== 'AGOTADO'
                        ? lotFinalizado
                          ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border border-violet-300 bg-white text-violet-700 hover:bg-violet-50'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                  {lotFinalizado ? 'Reabrir ensamblaje' : 'Finalizar ensamblaje'}
                  </button>
                  <button
                    disabled={!isEditModeActive}
                    onClick={() => void archiveLot(l)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                      isEditModeActive
                        ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Archive size={12} />
                      Archivar
                    </span>
                  </button>
                  <button
                    disabled={!isEditModeActive || deletingLotKey === lotKeyOf(l.producto, l.lote) || isForcedAgotadoLot(l.producto, l.lote)}
                    onClick={() => void deleteLot(l)}
                    className={`rounded-lg p-1.5 ${
                      isEditModeActive && deletingLotKey !== lotKeyOf(l.producto, l.lote) && !isForcedAgotadoLot(l.producto, l.lote)
                        ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                    title="Eliminar lote"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>,
              ];
            })}
          />
          )}
        </div>
      )}

      {accessReady && tab === 'maestros' && masterSection === 'bodegas' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Bodegas</h3>
              <button onClick={() => setBodegaModalOpen(true)} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Añadir bodega</button>
            </div>
          </div>
              <SimpleDataTable
                headers={['Bodega', 'Activo', 'Acciones']}
                rows={activeBodegas.map((b, idx) => [
                  b.bodega,
                  b.activo_si_no,
                  <div key={`bodega-actions-${idx}`} className="flex items-center gap-1">
                    <button
                      disabled={!isEditModeActive}
                      onClick={() => void editBodega(b.bodega)}
                      className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      title="Editar bodega"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      disabled={!isEditModeActive}
                      onClick={() => void deleteBodega(b.bodega)}
                      className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      title="Eliminar bodega"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>,
                ])}
              />
        </div>
      )}

      {accessReady && tab === 'maestros' && masterSection === 'clientes' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm space-y-2">
            <h3 className="text-lg font-black text-violet-950">Crear cliente</h3>
            <div className="flex gap-2">
              <input disabled={!isEditModeActive} value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="Nombre del cliente" className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${isEditModeActive ? 'border-violet-200 bg-violet-50 text-violet-900' : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'}`} />
              <button onClick={addClient} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Añadir</button>
            </div>
          </div>
              <SimpleDataTable
                headers={['Cliente', 'Acciones']}
                rows={activeClientes.map((c, idx) => [
                  c.cliente,
                  <div key={`client-actions-${idx}`} className="flex items-center gap-1">
                    <button
                      disabled={!isEditModeActive}
                      onClick={() => void editClient(c.cliente)}
                      className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      title="Editar cliente"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      disabled={!isEditModeActive}
                      onClick={() => void deleteClient(c.cliente)}
                      className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      title="Eliminar cliente"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>,
                ])}
              />
        </div>
      )}

      {accessReady && tab === 'maestros' && masterSection === 'tipos' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Tipos de movimiento</h3>
              <button onClick={() => setTipoModalOpen(true)} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Añadir tipo</button>
            </div>
          </div>
          <SimpleDataTable
            headers={['Tipo', 'Signo', 'Afecta stock', 'Acciones']}
            rows={tipos.map((t, idx) => [
              t.tipo_movimiento,
              t.signo_1_1,
              t.afecta_stock_si_no,
              <button
                key={`tipo-edit-${idx}`}
                disabled={!isEditModeActive}
                onClick={() => void editTipoMovimiento(t.tipo_movimiento)}
                className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <Pencil size={13} />
              </button>,
            ])}
          />
        </div>
      )}

      {textEditDialog && (
        <TextEditModal dialog={textEditDialog} onClose={() => setTextEditDialog(null)} />
      )}

      {movementModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="movement-modal-panel flex flex-col rounded-2xl border border-violet-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-lg font-black text-violet-950">{editingId ? 'Editar movimiento' : 'Crear movimiento'}</h3>
              <button disabled={savingMovement} onClick={() => setMovementModalOpen(false)} className={`rounded-lg p-1.5 ${savingMovement ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}><X size={14} /></button>
            </div>
            <div className="movement-modal-body grid gap-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input label="Fecha" type="date" value={movementForm.fecha} onChange={(v) => setMovementForm({ ...movementForm, fecha: v })} />
              <SelectInput
                label="Tipo"
                value={movementForm.tipo_movimiento}
                onChange={(v) => {
                  setMovementForm({ ...movementForm, tipo_movimiento: v });
                  setMovementKitLots({});
                }}
                options={typeOptions}
                placeholder="Selecciona tipo"
              />
              {(editingId || movementIsKit) && (normalizeSearch(movementForm.tipo_movimiento).includes('traspaso') ? (
                <SelectInput
                  label="Origen"
                  value={movementForm.bodega}
                  onChange={(v) => {
                    setMovementForm({ ...movementForm, bodega: v });
                    setMovementKitLots({});
                  }}
                  options={transferNodeOptions}
                  placeholder="Selecciona origen"
                />
              ) : (
                <SelectInput
                  label="Bodega"
                  value={movementForm.bodega}
                  onChange={(v) => {
                    setMovementForm({ ...movementForm, bodega: v });
                    setMovementKitLots({});
                  }}
                  options={transferNodeOptions}
                  placeholder="Selecciona bodega"
                />
              ))}
              {editingId ? (
                <>
                  <ProductColorSelect
                    label="Producto"
                    value={movementForm.producto}
                    onChange={(v) => {
                      setMovementForm({ ...movementForm, producto: v, lote: '' });
                      setMovementKitLots({});
                    }}
                    options={productOptions}
                    colorMap={productColorMap}
                  />
                  <Input label="Cantidad" type="number" value={movementForm.cantidad} onChange={(v) => setMovementForm({ ...movementForm, cantidad: v })} />
                  <AutocompleteInput
                    label="Lote"
                    value={movementForm.lote}
                    onChange={(v) => setMovementForm({ ...movementForm, lote: v.toUpperCase() })}
                    options={lotOptionsForForm}
                    placeholder="Selecciona lote"
                    emptyMessage="Sin lotes activos con stock para este producto/bodega."
                  />
                </>
              ) : (
                <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-600">Líneas del movimiento</p>
                    <button
                      type="button"
                      disabled={savingMovement || movementLines.length >= MAX_MOVEMENT_DRAFT_LINES || movementIsKit}
                      onClick={addMovementDraftLine}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-black ${
                        savingMovement || movementLines.length >= MAX_MOVEMENT_DRAFT_LINES || movementIsKit
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-teal-600 text-white hover:bg-teal-700'
                      }`}
                    >
                      <Plus size={13} /> Añadir línea
                    </button>
                  </div>
                  <div className="grid gap-1.5">
                    {movementLines.map((line, index) => {
                      const isFirstKitLine = movementIsKit && index === 0;
                      const lineIsTransfer = normalizeSearch(movementForm.tipo_movimiento).includes('traspaso');
                      return (
                        <div
                          key={line.id}
                          className={`movement-line-compact grid gap-1.5 rounded-md border border-slate-200 bg-white p-1.5 ${
                            lineIsTransfer
                              ? 'md:grid-cols-[0.9fr_0.9fr_1.15fr_1fr_0.65fr_34px]'
                              : 'md:grid-cols-[0.95fr_1.15fr_1fr_0.65fr_34px]'
                          }`}
                        >
                          <SelectInput
                            label={lineIsTransfer ? 'Origen' : `Bodega ${index + 1}`}
                            value={line.bodega || movementForm.bodega}
                            onChange={(v) => updateMovementDraftLine(line.id, { bodega: v, lote: '' })}
                            options={transferNodeOptions}
                            placeholder={lineIsTransfer ? 'Origen' : 'Bodega'}
                          />
                          {lineIsTransfer && (
                            <SelectInput
                              label="Destino"
                              value={line.destino || movementForm.destino || movementForm.cliente}
                              onChange={(v) => updateMovementDraftLine(line.id, { destino: v })}
                              options={transferNodeOptions}
                              placeholder="Destino"
                            />
                          )}
                          <ProductColorSelect
                            label={`Producto ${index + 1}`}
                            value={line.producto}
                            onChange={(v) => updateMovementDraftLine(line.id, { producto: v, lote: '' })}
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
                              placeholder="Selecciona lote"
                              emptyMessage="Sin lotes activos con stock para este producto/bodega."
                            />
                          )}
                          <Input label="Cantidad" type="number" value={line.cantidad} onChange={(v) => updateMovementDraftLine(line.id, { cantidad: v })} />
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
                  {movementIsKit && (
                    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wider text-violet-700">
                        Lotes de componentes del kit
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {movementKitComponents.map((component, index) => {
                          const product = clean(component.producto).toUpperCase();
                          const key = movementKitComponentKey(component, index);
                          const unitQty = Math.max(0, toNum(component.cantidad));
                          const totalQty = unitQty * Math.abs(toNum(movementForm.cantidad));
                          return (
                            <AutocompleteInput
                              key={key}
                              label={`Lote ${product}`}
                              value={movementKitLots[key] || ''}
                              onChange={(v) => setMovementKitLots((prev) => ({ ...prev, [key]: v.toUpperCase() }))}
                              options={movementKitLotOptionsByProduct.get(product) || []}
                              placeholder="Selecciona lote"
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
              {(editingId || movementIsKit) && normalizeSearch(movementForm.tipo_movimiento).includes('traspaso') ? (
                <SelectInput
                  label="Destino"
                  value={movementForm.destino || movementForm.cliente}
                  onChange={(v) => setMovementForm({ ...movementForm, destino: v, cliente: v })}
                  options={transferNodeOptions}
                  placeholder="Selecciona destino"
                />
              ) : !normalizeSearch(movementForm.tipo_movimiento).includes('traspaso') ? (
                <>
                  <InputDatalist label="Cliente" value={movementForm.cliente} onChange={(v) => setMovementForm({ ...movementForm, cliente: v })} listId="inventory-clientes" options={clientOptions} placeholder="Opcional" />
                  <Input label="Destino" value={movementForm.destino} onChange={(v) => setMovementForm({ ...movementForm, destino: v })} />
                </>
              ) : null}
              <Input label="Notas" value={movementForm.notas} onChange={(v) => setMovementForm({ ...movementForm, notas: v })} />
            </div>
            <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button disabled={savingMovement} onClick={() => void saveMovement()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white ${savingMovement ? 'bg-violet-300 cursor-wait' : 'bg-violet-600 hover:bg-violet-700'}`}>{editingId ? <Pencil size={14} /> : <Plus size={14} />} {savingMovement ? 'Guardando...' : (editingId ? 'Guardar cambios' : 'Crear movimiento')}</button>
              <button disabled={savingMovement} onClick={() => setMovementModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${savingMovement ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {lotModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-2xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">{editingLotKey ? 'Editar lote' : 'Añadir lote'}</h3>
              <button onClick={() => setLotModalOpen(false)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <InputDatalist label="Producto" value={lotForm.producto} onChange={(v) => setLotForm({ ...lotForm, producto: v })} listId="inventory-products-lot" options={productOptions} placeholder="Código producto" />
              <Input label="Lote" value={lotForm.lote} onChange={(v) => setLotForm({ ...lotForm, lote: v })} />
              <Input
                label="Cantidad viales"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={lotForm.viales_recibidos}
                onChange={(v) => setLotForm({ ...lotForm, viales_recibidos: normalizeVialesDigits(v) })}
              />
              <Input label="Fecha caducidad" type="date" value={lotForm.fecha_caducidad} onChange={(v) => setLotForm({ ...lotForm, fecha_caducidad: v })} />
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Estado
                <select value={lotForm.estado} onChange={(e) => setLotForm({ ...lotForm, estado: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="AGOTADO">AGOTADO</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void saveLot()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">{editingLotKey ? <Pencil size={14} /> : <Plus size={14} />} {editingLotKey ? 'Guardar lote' : 'Crear lote'}</button>
              <button onClick={() => setLotModalOpen(false)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {bodegaModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Añadir bodega</h3>
              <button onClick={() => setBodegaModalOpen(false)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input label="Nombre bodega" value={bodegaForm.bodega} onChange={(v) => setBodegaForm({ ...bodegaForm, bodega: v })} />
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Activa
                <select value={bodegaForm.activo_si_no} onChange={(e) => setBodegaForm({ ...bodegaForm, activo_si_no: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void saveBodega()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><Plus size={14} /> Guardar bodega</button>
              <button onClick={() => setBodegaModalOpen(false)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {productModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">{editingProductCode ? 'Editar producto' : 'Añadir producto'}</h3>
              <button onClick={closeProductModal} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Siglas Producto
                <input
                  value={newProductForm.producto}
                  disabled={!!editingProductCode}
                  onChange={(e) => setNewProductForm({ ...newProductForm, producto: e.target.value })}
                  className={`rounded-xl border p-2 text-sm outline-none ${editingProductCode ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-violet-200 bg-violet-50 text-violet-900'}`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Tipo de Producto
                <select value={newProductForm.tipo_producto} onChange={(e) => setNewProductForm({ ...newProductForm, tipo_producto: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="COMPLEMENTO ALIMENTICIO">COMPLEMENTO ALIMENTICIO</option>
                  <option value="CARTONAJE">CARTONAJE</option>
                  <option value="KIT">KIT</option>
                </select>
              </label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-5">
              <Input label="Stock Mínimo" value={newProductForm.stock_min} onChange={(v) => setNewProductForm({ ...newProductForm, stock_min: v })} />
              <Input label="Stock Óptimo" value={newProductForm.stock_optimo} onChange={(v) => setNewProductForm({ ...newProductForm, stock_optimo: v })} />
              <Input label="Consumo mes" type="number" value={newProductForm.consumo_mensual_cajas} onChange={(v) => setNewProductForm({ ...newProductForm, consumo_mensual_cajas: v })} />
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Modo
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
                  className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
                >
                  <option value="ENSAMBLAJE">ENSAMBLAJE</option>
                  <option value="DIRECTO">DIRECTO</option>
                  <option value="KIT">KIT</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Activo
                <select value={newProductForm.activo_si_no} onChange={(e) => setNewProductForm({ ...newProductForm, activo_si_no: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
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
            {editingProductCode && (
              <p className="mt-2 text-xs text-violet-600">El código de producto se mantiene fijo para no romper movimientos históricos.</p>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => void createProducto()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">{editingProductCode ? <Pencil size={14} /> : <Plus size={14} />} {editingProductCode ? 'Guardar cambios' : 'Guardar producto'}</button>
              <button onClick={closeProductModal} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {cartonajeModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Movimiento cartonaje</h3>
              <button onClick={() => setCartonajeModalOpen(false)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Tipo
                <select value={cartonajeForm.tipo_movimiento} onChange={(e) => setCartonajeForm({ ...cartonajeForm, tipo_movimiento: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="ENTRADA de cartonaje">ENTRADA de cartonaje</option>
                  <option value="SALIDA cartonaje">SALIDA cartonaje</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Producto
                <select value={cartonajeForm.producto} onChange={(e) => setCartonajeForm({ ...cartonajeForm, producto: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="">Selecciona un producto</option>
                  {cartonajeProducts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Lote
                <select value={cartonajeForm.lote} onChange={(e) => setCartonajeForm({ ...cartonajeForm, lote: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="">Selecciona un lote</option>
                  {Array.from(new Set(visibleLotes.filter(l => clean(l.producto) === cartonajeForm.producto).map(l => clean(l.lote)))).sort().map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Cantidad
                <input type="number" step="0.01" value={cartonajeForm.cantidad} onChange={(e) => setCartonajeForm({ ...cartonajeForm, cantidad: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none" />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void createCartonajeMovement()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><Plus size={14} /> Registrar movimiento</button>
              <button onClick={() => setCartonajeModalOpen(false)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {tipoModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Añadir tipo de movimiento</h3>
              <button onClick={() => setTipoModalOpen(false)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input label="Tipo" value={tipoForm.tipo_movimiento} onChange={(v) => setTipoForm({ ...tipoForm, tipo_movimiento: v })} />
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Signo
                <select value={tipoForm.signo_1_1} onChange={(e) => setTipoForm({ ...tipoForm, signo_1_1: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="-1">-1</option>
                  <option value="1">1</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Afecta stock
                <select value={tipoForm.afecta_stock_si_no} onChange={(e) => setTipoForm({ ...tipoForm, afecta_stock_si_no: e.target.value })} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none">
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void saveTipo()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><Plus size={14} /> Guardar tipo</button>
              <button onClick={() => setTipoModalOpen(false)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {riskModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-2xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Productos en riesgo</h3>
              <button onClick={() => setRiskModalOpen(false)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <SimpleDataTable
              headers={['Producto', 'Stock actual', 'Cobertura estimada']}
              rows={riskyProductsSummary.length > 0
                ? riskyProductsSummary.map((r) => [
                  <ProductPill key={`risk-${r.producto}`} code={r.producto} colorMap={productColorMap} />,
                  Number(r.stockTotal.toFixed(2)),
                  formatCoverage(r.coberturaMeses),
                ])
                : [['Sin productos en riesgo', '-', '-']]}
            />
          </div>
        </div>
      )}
      {potentialDetailProduct && tab !== 'control_stock' && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-4xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-black text-violet-950">
                <span>Detalle potencial por lote</span>
                <ProductPill code={potentialDetailProduct} colorMap={productColorMap} />
              </h3>
              <button onClick={() => setPotentialDetailProduct(null)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>
                  <span className="font-bold">España</span> y <span className="font-bold">Colombia</span> se muestran por separado.
                  <span className="font-bold">Total ensamblado</span> es la suma de ambas y <span className="font-bold">Potencial cajas</span> muestra lo que aún queda por ensamblar.
                </p>
              </div>
            </div>
            <SimpleDataTable
              headers={['Lote', 'Viales', 'España', 'Colombia', 'Total ensamblado', 'Potencial cajas', 'Stock óptimo', 'Consumo mes', 'Cobertura', 'Estado stock']}
              rows={potentialDetailRows.map((r) => [
                r.lote,
                Number(r.viales.toFixed(2)),
                Number(r.ensambladasEsp.toFixed(2)),
                Number(r.ensambladasCol.toFixed(2)),
                Number(r.salidas.toFixed(2)),
                Number(r.potencialCajas.toFixed(2)),
                r.stockOptimo || '-',
                r.consumoMes,
                formatCoverage(r.coberturaMeses),
                <span
                  key={`${r.producto}-${r.lote}-detail-estado`}
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${getPotentialStatusClass(r.estadoStock)}`}
                >
                  {r.estadoStock}
                </span>,
              ])}
            />
          </div>
        </div>
      )}
      {canetHuarteDetailRow && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-2xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-black text-violet-950">
                <span>Desglose Canet + Huarte</span>
                <ProductPill code={canetHuarteDetailRow.producto} colorMap={productColorMap} />
                <span className="text-sm font-bold text-violet-700">{canetHuarteDetailRow.lote}</span>
              </h3>
              <button onClick={() => setCanetHuarteDetailRow(null)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <SimpleDataTable
              headers={['Bodega', 'Stock']}
              rows={[
                ['CANET', Number(canetHuarteDetailRow.stockCanet.toFixed(2))],
                ['HUARTE', Number(canetHuarteDetailRow.stockHuarte.toFixed(2))],
                ['TOTAL CANET + HUARTE', Number(canetHuarteDetailRow.stockCanetHuarte.toFixed(2))],
              ]}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Stock mín (C+H)</p>
                <p className="text-sm font-black text-violet-900">{canetHuarteDetailRow.stockMinCH || '-'}</p>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Consumo mes</p>
                <p className="text-sm font-black text-indigo-900">{canetHuarteDetailRow.consumoMes}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Cobertura</p>
                <p className="text-sm font-black text-emerald-900">{formatCoverage(canetHuarteDetailRow.coberturaMeses)}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Semáforo</p>
                <p className="text-sm font-black text-amber-900">{canetHuarteDetailRow.semaforo}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {hypotheticalScope && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-2xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">
                Ventas hipotéticas · {hypotheticalScope === 'potential' ? 'Stock potencial' : hypotheticalScope === 'canet_huarte' ? 'Canet + Huarte' : 'Canet'}
              </h3>
              <button onClick={closeHypotheticalModal} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Producto
                <select
                  value={hypotheticalForm.producto}
                  onChange={(e) => {
                    const producto = e.target.value;
                    const firstLot =
                      hypotheticalRows.find((r) => r.producto === producto)?.lote ||
                      '';
                    setHypotheticalForm((prev) => ({ ...prev, producto, lote: firstLot }));
                    setHypotheticalResult(null);
                  }}
                  className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
                >
                  <option value="">Selecciona producto</option>
                  {hypotheticalProducts.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Lote
                <select
                  value={hypotheticalForm.lote}
                  onChange={(e) => {
                    setHypotheticalForm((prev) => ({ ...prev, lote: e.target.value }));
                    setHypotheticalResult(null);
                  }}
                  className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
                >
                  <option value="">Selecciona lote</option>
                  {hypotheticalLots.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
                Cajas a vender
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hypotheticalForm.cantidad}
                  onChange={(e) => {
                    setHypotheticalForm((prev) => ({ ...prev, cantidad: e.target.value }));
                    setHypotheticalResult(null);
                  }}
                  className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={runHypotheticalCalc} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">Calcular</button>
              <button onClick={closeHypotheticalModal} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cerrar</button>
            </div>
            {hypotheticalResult && (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                <SimpleDataTable
                  headers={['Producto', 'Lote', 'Stock inicial', 'Venta hipotética', 'Stock final']}
                  rows={[[
                    <ProductPill key={`hyp-${hypotheticalResult.producto}`} code={hypotheticalResult.producto} colorMap={productColorMap} />,
                    hypotheticalResult.lote,
                    Number(hypotheticalResult.stockInicial.toFixed(2)),
                    Number(hypotheticalResult.venta.toFixed(2)),
                    Number(hypotheticalResult.stockFinal.toFixed(2)),
                  ]]}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Consumo mes</p>
                    <p className="text-sm font-black text-indigo-900">{hypotheticalResult.consumoMes}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Cobertura resultante</p>
                    <p className="text-sm font-black text-emerald-900">{formatCoverage(hypotheticalResult.coberturaMeses)}</p>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-white p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Semáforo</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        hypotheticalResult.scope === 'potential'
                          ? getPotentialStatusClass(hypotheticalResult.semaforo)
                          : getCoverageSemaforoClass(hypotheticalResult.semaforo)
                      }`}
                    >
                      {hypotheticalResult.semaforo}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function ProductPill({ code, colorMap }: { code: string; colorMap: Map<string, string> }) {
  const color = colorMap.get(code) || '#7c3aed';
  return <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: `${color}22`, color }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{code || '-'}</span>;
}

function StockByProductVisual({
  rows,
  colorMap,
  onSelectLot,
}: {
  rows: Array<{ producto: string; total: number; byLote: Record<string, number> }>;
  colorMap: Map<string, string>;
  onSelectLot: (producto: string, lote: string, cantidad: number) => void;
}) {
  if (rows.length === 0) return null;
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const totalVisualizado = rows.reduce((acc, r) => acc + Math.max(0, toNum(r.total)), 0);
  const lotPalette = ['#4f46e5', '#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#84cc16', '#f97316', '#06b6d4'];
  const allLots = Array.from(new Set(rows.flatMap((r) => Object.keys(r.byLote)).filter(Boolean))).sort();
  const lotColorMap = new Map<string, string>();
  allLots.forEach((l, i) => lotColorMap.set(l, lotPalette[i % lotPalette.length]));
  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-violet-700">Vista visual de stock por producto</h4>
      <div className="mt-2 space-y-2">
        {rows.map((row) => {
          const total = Math.max(1, row.total);
          const rowWidthPct = Math.max(6, (row.total / maxTotal) * 100);
          const sortedLots = Object.entries(row.byLote).filter(([, qty]) => qty > 0).sort((a, b) => b[1] - a[1]);
          return (
            <div key={`stock-visual-${row.producto}`} className="grid w-full grid-cols-[120px_1fr_64px] items-center gap-2">
              <div className="truncate">
                <ProductPill code={row.producto} colorMap={colorMap} />
              </div>
              <div className="h-6 overflow-hidden rounded-md border border-violet-100 bg-white">
                <div className="flex h-full" style={{ width: `${rowWidthPct}%` }}>
                  {sortedLots.map(([lote, qty]) => (
                    <div
                      key={`${row.producto}-${lote}`}
                      title={`Lote ${lote}: ${Math.round(qty)}`}
                      onClick={() => onSelectLot(row.producto, lote, qty)}
                      className="h-full cursor-pointer transition-opacity hover:opacity-80"
                      style={{ width: `${(qty / total) * 100}%`, backgroundColor: lotColorMap.get(lote) || '#4f46e5' }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-right text-xs font-black text-violet-900">{Math.round(row.total)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-violet-700">Total visualizado: {Math.round(totalVisualizado).toLocaleString('es-ES')}</p>
        <p className="text-[10px] font-semibold text-violet-600">Haz clic en un color para ver el lote y la cantidad.</p>
      </div>
    </div>
  );
}

function ToggleRowsButton({ showAll, onToggle }: { showAll: boolean; onToggle: () => void }) {
  return (
    <div className="pt-2">
      <button onClick={onToggle} className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
        {showAll ? 'Mostrar menos' : 'Mostrar todas'}
      </button>
    </div>
  );
}

function KpiCard({
  title,
  value,
  helper,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  helper: string;
  tone: 'violet' | 'emerald' | 'rose' | 'amber';
  onClick?: () => void;
}) {
  const toneMap: Record<string, string> = {
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return (
    <button onClick={onClick} className={`w-full text-left rounded-2xl border px-4 py-3 shadow-sm transition hover:brightness-95 ${toneMap[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-widest opacity-70">{title}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs opacity-75">{helper}</p>
    </button>
  );
}

function DataSection({
  id,
  title,
  subtitle,
  children,
  tone,
  onDownload,
  onDownloadExcel,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tone: 'violet' | 'indigo' | 'emerald' | 'amber' | 'rose';
  onDownload?: () => void;
  onDownloadExcel?: () => void;
}) {
  const toneMap: Record<string, string> = {
    violet: 'border-violet-200 bg-violet-50/30',
    indigo: 'border-indigo-200 bg-indigo-50/30',
    emerald: 'border-emerald-200 bg-emerald-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    rose: 'border-rose-200 bg-rose-50/30',
  };
  return (
    <section id={id} className={`rounded-2xl border p-4 shadow-sm space-y-3 compact-card adaptive-surface ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-black text-violet-950 adaptive-text-strong">{title}</h2>
          {subtitle && <p className="text-xs text-violet-700/80 adaptive-text-muted">{subtitle}</p>}
        </div>
        {(onDownload || onDownloadExcel) && (
          <div className="flex items-center gap-2">
            {onDownloadExcel && (
              <button onClick={onDownloadExcel} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                <Download size={12} /> Excel
              </button>
            )}
            {onDownload && <button onClick={onDownload} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"><Download size={12} /> PDF</button>}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 rounded-xl border border-violet-200 bg-violet-50 p-2 text-xs font-semibold uppercase tracking-wider text-violet-600 compact-card">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-sm text-violet-900 outline-none">
        <option value="">Todos</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
  pattern,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  pattern?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        pattern={pattern}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecciona...',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm font-semibold text-violet-900 outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={`${label}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function filterAutocompleteOptions(options: string[], value: string) {
  const q = clean(value).toLowerCase();
  return options
    .filter((option) => {
      if (!q) return true;
      return clean(option).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aa = clean(a).toLowerCase();
      const bb = clean(b).toLowerCase();
      if (!q) return aa.localeCompare(bb);
      const aStarts = aa.startsWith(q);
      const bStarts = bb.startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return aa.localeCompare(bb);
    })
    .slice(0, 12);
}

function InputAutocomplete({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = filterAutocompleteOptions(options, value);
  return (
    <label className="relative flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        placeholder={placeholder}
        className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-xl border border-violet-200 bg-white py-1 shadow-xl">
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <button
                key={`${label}-${option}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-xs font-bold text-violet-900 hover:bg-violet-50"
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-xs font-semibold normal-case tracking-normal text-slate-500">
              Sin opciones para este filtro.
            </div>
          )}
        </div>
      )}
    </label>
  );
}

function InputAutocompleteTag({
  label,
  value,
  onChange,
  onSelect,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = filterAutocompleteOptions(options, value);
  return (
    <label className="relative flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSelect(value);
            setOpen(false);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        placeholder={placeholder}
        className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-xl border border-violet-200 bg-white py-1 shadow-xl">
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <button
                key={`${label}-${option}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-xs font-bold text-violet-900 hover:bg-violet-50"
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-xs font-semibold normal-case tracking-normal text-slate-500">
              Sin opciones para este filtro.
            </div>
          )}
        </div>
      )}
    </label>
  );
}

function InputDatalist({ label, value, onChange, listId, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; listId: string; options: string[]; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <>
        <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none" />
        <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      </>
    </label>
  );
}

function InputDatalistTag({
  label,
  value,
  onChange,
  onSelect,
  listId,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  listId: string;
  options: string[];
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <>
        <input
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSelect(value);
            }
          }}
          onBlur={() => {
            if (!value) return;
            if (options.includes(value)) onSelect(value);
          }}
          placeholder={placeholder}
          className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
        />
        <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      </>
    </label>
  );
}

function AutocompleteInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  emptyMessage = 'Sin opciones disponibles.',
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  emptyMessage?: string;
  helperText?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = normalizeSearch(value);
  const filtered = options
    .filter((option) => {
      if (!query) return true;
      return normalizeSearch(option).includes(query);
    })
    .sort((a, b) => {
      const aText = normalizeSearch(a);
      const bText = normalizeSearch(b);
      const aRank = !query ? 0 : aText === query ? 0 : aText.startsWith(query) ? 1 : 2;
      const bRank = !query ? 0 : bText === query ? 0 : bText.startsWith(query) ? 1 : 2;
      return aRank - bRank || clean(a).localeCompare(clean(b));
    })
    .slice(0, 12);

  return (
    <label className="relative flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
      />
      {helperText && <span className="text-[11px] font-semibold normal-case tracking-normal text-violet-500">{helperText}</span>}
      {open && (
        <div className="absolute left-0 right-0 top-full z-[260] mt-1 max-h-48 overflow-auto rounded-xl border border-violet-200 bg-white shadow-xl">
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <button
                key={`${label}-${option}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-violet-900 hover:bg-violet-50"
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-left text-xs font-semibold normal-case tracking-normal text-slate-500">
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
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm outline-none"
        style={{ color: selectedColor }}
      >
        <option value="" style={{ color: '#6b7280' }}>Selecciona producto</option>
        {options.map((o) => (
          <option key={o} value={o} style={{ color: colorMap.get(o) || '#7c3aed' }}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function SimpleDataTable({
  headers,
  rows,
  onRowClick,
}: {
  headers: string[];
  rows: Array<Array<any>>;
  onRowClick?: (row: Array<any>, idx: number) => void;
}) {
  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead className="bg-violet-50 text-violet-700">
          <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6">
                <div className="app-empty-card">No hay datos para estos filtros. Prueba cambiarlos o limpiar filtros.</div>
              </td>
            </tr>
          ) : rows.map((row, idx) => (
            <tr
              key={idx}
              className={`border-t border-violet-100 hover:bg-violet-50/60 ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
            >
              {row.map((cell, i) => <td key={i} className="px-3 py-2.5 text-violet-900">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
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
    <div className="app-modal-overlay" onClick={close}>
      <div className="app-modal-panel w-full max-w-xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-violet-950">{dialog.title}</h3>
          <button onClick={close} className="rounded-full border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><X size={16} /></button>
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
          Nuevo valor
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none"
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
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
    </div>
  );
}

export default InventoryPage;
