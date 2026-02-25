import React, { useEffect, useMemo, useState } from 'react';
import seed from '../data/inventory_seed.json';
import { AlertTriangle, ArrowDownCircle, BarChart3, Building2, ClipboardList, Download, Layers3, Package, Pencil, Plus, Tags, Trash2, Users, Wrench, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import { USERS } from '../constants';
import { openPrintablePdfReport } from '../utils/pdfReport';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { useDensityMode } from '../hooks/useDensityMode';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import huarteSeed from '../data/inventory_facturacion_seed.json';

type InventoryTab = 'dashboard' | 'control_stock' | 'movimientos' | 'productos' | 'lotes' | 'bodegas' | 'clientes' | 'tipos' | 'bitacora';
type InventoryAccessMode = 'unset' | 'consult' | 'edit';
type EditRequestStatus = 'pending' | 'approved' | 'denied';

type InventoryEditRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  requestedAt: string;
  status: EditRequestStatus;
  resolvedAt?: string;
  resolvedById?: string;
  resolvedByName?: string;
};

type InventoryEditGrant = {
  userId: string;
  approvedById: string;
  approvedByName: string;
  approvedAt: string;
  expiresAt: string;
};

type InventoryAuditEntry = {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
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
};

type GenericRow = Record<string, any>;

const clean = (v: any) => (v == null ? '' : String(v).trim());
const normalizeSearch = (v: any) =>
  clean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isValidHexColor = (v: string) => /^#([0-9a-fA-F]{6})$/.test(v);
const contains = (a: string, b: string) => clean(a).toLowerCase().includes(clean(b).toLowerCase());

const dateFromAny = (v: string): Date | null => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const dd = Number(slash[1]);
    const mm = Number(slash[2]);
    const yy = Number(slash[3]);
    const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const monthKeyFromDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};
const movementDateMs = (fecha: string) => {
  const d = dateFromAny(clean(fecha));
  return d ? d.getTime() : 0;
};

const openTablePdf = (title: string, fileName: string, headers: string[], rows: Array<Array<string | number>>) => {
  openPrintablePdfReport({
    title,
    fileName,
    headers,
    rows,
    subtitle: `Generado: ${new Date().toLocaleString('es-ES')}`,
  });
};

const takeRows = <T,>(rows: T[], showAll: boolean) => (showAll ? rows : rows.slice(0, 5));

const MONTH_DAYS = 30;
const INVENTORY_EDIT_REQUESTS_KEY = 'inventory_edit_requests_v1';
const INVENTORY_EDIT_GRANTS_KEY = 'inventory_edit_grants_v1';
const INVENTORY_AUDIT_KEY = 'inventory_audit_v1';
const INVENTORY_ALERTS_KEY = 'inventory_alerts_summary_v1';
const INVENTORY_CANET_MOVS_KEY = 'inventory_canet_movimientos_v1';
const INVENTORY_HUARTE_MOVS_KEY = 'invhf_movimientos_v1';
const CANET_MOVEMENT_SYNC_START = '2026-02-23';
const EDIT_GRANT_HOURS = 6;
const INVENTORY_PRODUCT_COLORS: Record<string, string> = {
  SV: '#83b06f',
  ENT: '#76a5af',
  KL: '#f9a8d4',
  ISO: '#fca5a5',
  AV: '#f9cb9c',
  RG: '#1e3a8a',
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
  const actorNameLower = clean(currentUser?.name).toLowerCase();
  const actorIsAdmin = !!currentUser?.isAdmin;
  const actorIsAnabela = !!(
    (currentUser && anabela && currentUser.id === anabela.id) ||
    actorNameLower.includes('anab') ||
    actorEmail.includes('anab')
  );
  const actorIsFernando = !!(
    (currentUser && fernando && currentUser.id === fernando.id) ||
    actorNameLower.includes('fernando') ||
    actorNameLower === 'fer' ||
    actorNameLower.startsWith('fer ') ||
    actorEmail.includes('fer')
  );

  const [tab, setTab] = useState<InventoryTab>('dashboard');
  const [accessMode, setAccessMode] = useState<InventoryAccessMode>('unset');
  const [editRequests, setEditRequests] = useSharedJsonState<InventoryEditRequest[]>(
    INVENTORY_EDIT_REQUESTS_KEY,
    [],
    { userId: actorId },
  );
  const [editGrants, setEditGrants] = useSharedJsonState<InventoryEditGrant[]>(
    INVENTORY_EDIT_GRANTS_KEY,
    [],
    { userId: actorId },
  );
  const [auditLog, setAuditLog] = useSharedJsonState<InventoryAuditEntry[]>(
    INVENTORY_AUDIT_KEY,
    [],
    { userId: actorId },
  );

  const [movimientos, setMovimientos, movimientosLoading] = useSharedJsonState<Movement[]>(
    INVENTORY_CANET_MOVS_KEY,
    seed.movimientos as Movement[],
    { userId: actorId, pollIntervalMs: 300 },
  );
  const [productos] = useState<GenericRow[]>(seed.productos as GenericRow[]);
  const [lotes, setLotes] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_lotes_v1',
    seed.lotes as GenericRow[],
    { userId: actorId },
  );
  const [bodegas, setBodegas] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_bodegas_v1',
    seed.bodegas as GenericRow[],
    { userId: actorId },
  );
  const [clientes, setClientes] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_clientes_v1',
    seed.clientes as GenericRow[],
    { userId: actorId },
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
  const [huarteMovimientosShared, setHuarteMovimientosShared, huarteMovimientosLoading] = useSharedJsonState<any[]>(
    INVENTORY_HUARTE_MOVS_KEY,
    (huarteSeed.movimientos as any[]) || [],
    { userId: actorId, initializeIfMissing: false, pollIntervalMs: 300 },
  );

  const [monthFilter, setMonthFilter] = useState<string>('');
  const [productFilterInput, setProductFilterInput] = useState<string>('');
  const [productFilters, setProductFilters] = useState<string[]>([]);
  const [lotFilter, setLotFilter] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [quickSearch, setQuickSearch] = useState<string>('');
  const [controlSemaforoFilter, setControlSemaforoFilter] = useState<string>('');
  const [showMainFilters, setShowMainFilters] = useState(false);

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
  const [stockLotSelected, setStockLotSelected] = useState<{ producto: string; lote: string; cantidad: number } | null>(null);
  const densityMode = useDensityMode();
  const isCompact = densityMode === 'compact';
  const [compactInventoryPanel, setCompactInventoryPanel] = useState<'stock' | 'moves' | 'clients' | 'adjust' | 'outputs'>('stock');

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [movementForm, setMovementForm] = useState({ ...EMPTY_FORM });

  const [lotModalOpen, setLotModalOpen] = useState(false);
  const [editingLotKey, setEditingLotKey] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState({ producto: '', lote: '', viales_recibidos: '', fecha_caducidad: '' });
  const [bodegaModalOpen, setBodegaModalOpen] = useState(false);
  const [bodegaForm, setBodegaForm] = useState({ bodega: '', activo_si_no: 'SI' });
  const [tipoModalOpen, setTipoModalOpen] = useState(false);
  const [tipoForm, setTipoForm] = useState({ tipo_movimiento: '', signo_1_1: '-1', afecta_stock_si_no: 'SI' });
  const [newClient, setNewClient] = useState('');
  const canetMovementSyncStartDate = useMemo(
    () => dateFromAny(CANET_MOVEMENT_SYNC_START) || new Date('2026-02-23T00:00:00'),
    [],
  );

  const isCanetMirroredMovement = (m: Movement) => clean((m as any).source).toLowerCase() === 'canet';
  const toHuarteMirrorMovement = (m: Movement): Movement => ({
    ...m,
    id: 900000000 + toNum(m.id),
    source: 'canet',
    origin_canet_id: toNum(m.id),
  });
  const isCanetTransferToHuarte = (m: Movement) => {
    const tipo = normalizeSearch(m.tipo_movimiento);
    const dest = clean(m.destino).toUpperCase();
    const client = clean(m.cliente).toUpperCase();
    const bodega = clean(m.bodega).toUpperCase();
    const d = dateFromAny(clean(m.fecha));
    return (
      !!d &&
      d >= canetMovementSyncStartDate &&
      tipo.includes('traspaso') &&
      (dest === 'HUARTE' || client === 'HUARTE') &&
      bodega !== 'HUARTE'
    );
  };
  const toHuarteAutoInMovement = (m: Movement): Movement => ({
    ...m,
    id: 1900000000 + toNum(m.id),
    source: 'canet_auto_in',
    origin_canet_id: toNum(m.id),
    tipo_movimiento: 'entrada_traspaso',
    bodega: 'HUARTE',
    cliente: clean(m.bodega) || 'CANET',
    destino: 'HUARTE',
    cantidad: Math.abs(toNum(m.cantidad_signed || m.cantidad)),
    cantidad_signed: Math.abs(toNum(m.cantidad_signed || m.cantidad)),
    signo: 1,
    notas: clean(m.notas)
      ? `${clean(m.notas)} · Auto entrada por traspaso Canet→Huarte`
      : 'Auto entrada por traspaso Canet→Huarte',
  });
  const syncMirrorUpsert = (m: Movement) => {
    const mirror = toHuarteMirrorMovement(m);
    const shouldAutoIn = isCanetTransferToHuarte(m);
    const autoIn = shouldAutoIn ? toHuarteAutoInMovement(m) : null;
    setHuarteMovimientosShared((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const next = [...base];
      const mirrorIdx = next.findIndex(
        (row: any) => clean(row.source).toLowerCase() === 'canet' && toNum(row.origin_canet_id) === toNum(m.id),
      );
      if (mirrorIdx >= 0) next[mirrorIdx] = mirror;
      else next.unshift(mirror);
      const autoIdx = next.findIndex(
        (row: any) => clean(row.source).toLowerCase() === 'canet_auto_in' && toNum(row.origin_canet_id) === toNum(m.id),
      );
      if (autoIn) {
        if (autoIdx >= 0) next[autoIdx] = autoIn;
        else next.unshift(autoIn);
      } else if (autoIdx >= 0) {
        next.splice(autoIdx, 1);
      }
      return next;
    });
  };
  const syncMirrorDelete = (canetId: number) => {
    setHuarteMovimientosShared((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      return base.filter((row: any) => {
        const src = clean(row.source).toLowerCase();
        if (toNum(row.origin_canet_id) !== toNum(canetId)) return true;
        return src !== 'canet' && src !== 'canet_auto_in';
      });
    });
  };

  const addProductFilter = (value: string) => {
    const v = clean(value);
    if (!v) return;
    if (!productOptions.includes(v)) return;
    setProductFilters((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setProductFilterInput('');
  };
  const removeProductFilter = (value: string) => {
    setProductFilters((prev) => prev.filter((p) => p !== value));
  };

  const canApproveRequests = actorIsAdmin || actorIsAnabela;
  const canEditByDefault = actorIsAdmin || actorIsAnabela || actorIsFernando;

  const normalizedActiveGrants = useMemo(() => {
    const nowMs = Date.now();
    return editGrants.filter((g) => new Date(g.expiresAt).getTime() > nowMs);
  }, [editGrants]);

  useEffect(() => {
    if (normalizedActiveGrants.length !== editGrants.length) {
      setEditGrants(normalizedActiveGrants);
    }
  }, [normalizedActiveGrants, editGrants.length]);

  const actorGrant = useMemo(
    () => normalizedActiveGrants.find((g) => g.userId === actorId),
    [normalizedActiveGrants, actorId],
  );

  const canEditNow = canEditByDefault || !!actorGrant;

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
      const allLots = lotes
        .filter((l) => clean(l.producto) === producto)
        .map((l) => clean(l.lote))
        .filter(Boolean);
      const exact = allLots.find((candidate) => clean(candidate) === lote);
      if (exact) return exact;
      const suffixMatches = allLots.filter((candidate) => clean(candidate).endsWith(lote));
      if (suffixMatches.length === 1) return suffixMatches[0];
      return lote;
    };
    return movimientos.map((m) => {
      const tipo = clean(m.tipo_movimiento);
      const qty = Math.abs(toNum(m.cantidad));
      const rowSign = toNum(m.signo);
      const sign = rowSign !== 0 ? rowSign : (signByType.get(tipo) ?? (toNum(m.cantidad_signed) < 0 ? -1 : 1));
      const hasSigned = m.cantidad_signed !== undefined && m.cantidad_signed !== null && clean(m.cantidad_signed) !== '';
      const signedFromRow = toNum(m.cantidad_signed);
      const producto = clean(m.producto);
      const lote = canonicalLot(producto, clean(m.lote));
      return {
        ...m,
        producto,
        lote,
        cantidad: qty,
        signo: sign,
        cantidad_signed: hasSigned ? signedFromRow : qty * sign,
        afecta_stock: clean(m.afecta_stock) || 'SI',
      };
    });
  }, [movimientos, signByType, lotes]);

  useEffect(() => {
    if (movimientosLoading) return;
    const canonicalLot = (productoRaw: string, loteRaw: string) => {
      const producto = clean(productoRaw);
      const lote = clean(loteRaw);
      if (!producto || !lote) return lote;
      const allLots = lotes
        .filter((l) => clean(l.producto) === producto)
        .map((l) => clean(l.lote))
        .filter(Boolean);
      const exact = allLots.find((candidate) => clean(candidate) === lote);
      if (exact) return exact;
      const suffixMatches = allLots.filter((candidate) => clean(candidate).endsWith(lote));
      if (suffixMatches.length === 1) return suffixMatches[0];
      return lote;
    };

    const next = movimientos.map((m) => {
      const producto = clean(m.producto);
      const lote = canonicalLot(producto, clean(m.lote));
      if (lote === clean(m.lote) && producto === clean(m.producto)) return m;
      return {
        ...m,
        producto,
        lote,
        updated_at: new Date().toISOString(),
        updated_by: actorName,
      };
    });
    const changed = next.some((m, idx) => clean(m.lote) !== clean(movimientos[idx]?.lote) || clean(m.producto) !== clean(movimientos[idx]?.producto));
    if (!changed) return;
    setMovimientos(next);
  }, [movimientos, lotes, movimientosLoading, actorName]);

  useEffect(() => {
    // Evita sobreescribir Huarte con fallback local antes de que Canet cargue desde Supabase.
    if (movimientosLoading || huarteMovimientosLoading) return;

    const eligibleRows = normalizedMovements
      .filter((m) => {
        const d = dateFromAny(clean(m.fecha));
        return !!d && d >= canetMovementSyncStartDate;
      });
    const mirrorRows = eligibleRows.map((m) => toHuarteMirrorMovement(m));
    const autoInRows = eligibleRows
      .filter((m) => isCanetTransferToHuarte(m))
      .map((m) => toHuarteAutoInMovement(m));

    const signature = (m: any) => [
      clean(m.fecha),
      clean(m.tipo_movimiento),
      clean(m.producto),
      clean(m.lote),
      clean(m.bodega),
      String(toNum(m.cantidad_signed)),
      clean(m.cliente),
      clean(m.destino),
      clean(m.notas),
      clean(m.source),
    ].join('|');

    setHuarteMovimientosShared((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const prevCanet = base.filter((m) => clean(m.source).toLowerCase() === 'canet');
      const prevAuto = base.filter((m) => clean(m.source).toLowerCase() === 'canet_auto_in');
      const prevSig = prevCanet.map(signature).sort();
      const nextSig = mirrorRows.map(signature).sort();
      const prevAutoSig = prevAuto.map(signature).sort();
      const nextAutoSig = autoInRows.map(signature).sort();
      const sameCanet =
        prevSig.length === nextSig.length &&
        prevSig.every((item, idx) => item === nextSig[idx]);
      const sameAuto =
        prevAutoSig.length === nextAutoSig.length &&
        prevAutoSig.every((item, idx) => item === nextAutoSig[idx]);
      if (sameCanet && sameAuto) return base;
      const nonMirrored = base.filter((m) => {
        const src = clean(m.source).toLowerCase();
        return src !== 'canet' && src !== 'canet_auto_in';
      });
      return [...mirrorRows, ...autoInRows, ...nonMirrored];
    });
  }, [
    normalizedMovements,
    canetMovementSyncStartDate,
    setHuarteMovimientosShared,
    movimientosLoading,
    huarteMovimientosLoading,
  ]);

  const validDates = useMemo(() => normalizedMovements.map((m) => dateFromAny(clean(m.fecha))).filter(Boolean) as Date[], [normalizedMovements]);
  const currentMonth = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of validDates) {
      const mk = monthKeyFromDate(d);
      if (mk <= currentMonth && d.getFullYear() >= 2024) set.add(mk);
    }
    return Array.from(set).sort();
  }, [validDates, currentMonth]);

  useEffect(() => {
    if (!monthFilter && monthOptions.length > 0) setMonthFilter(monthOptions[monthOptions.length - 1]);
  }, [monthOptions, monthFilter]);

  const monthEnd = useMemo(() => {
    if (!monthFilter) return null;
    const [yy, mm] = monthFilter.split('-').map(Number);
    return new Date(yy, mm, 0, 23, 59, 59, 999);
  }, [monthFilter]);

  const movementMatchesFilters = (m: Movement, monthExact: boolean) => {
    const d = dateFromAny(clean(m.fecha));
    if (monthFilter && monthExact) {
      if (!d || monthKeyFromDate(d) !== monthFilter) return false;
    }
    if (productFilters.length > 0 && !productFilters.includes(clean(m.producto))) return false;
    if (lotFilter && clean(m.lote) !== lotFilter) return false;
    if (warehouseFilter && clean(m.bodega) !== warehouseFilter) return false;
    if (typeFilter && clean(m.tipo_movimiento) !== typeFilter) return false;
    if (clientFilter && clean(m.cliente) !== clientFilter) return false;
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
    return normalizedMovements.filter((m) => {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') return false;
      if (!movementMatchesFilters(m, false)) return false;
      if (!monthEnd) return true;
      const d = dateFromAny(clean(m.fecha));
      // Rows without ISO date act as opening/base balances and should be included in stock.
      if (!d) return true;
      return d <= monthEnd;
    });
  }, [normalizedMovements, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter, monthEnd, quickSearch]);

  const monthMovements = useMemo(() => normalizedMovements.filter((m) => movementMatchesFilters(m, true)), [normalizedMovements, monthFilter, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter, quickSearch]);

  const stockByPLB = useMemo(() => {
    const map = new Map<string, { producto: string; lote: string; bodega: string; stock: number }>();
    for (const m of stockBase) {
      const key = `${clean(m.producto)}|${clean(m.lote)}|${clean(m.bodega)}`;
      if (!map.has(key)) map.set(key, { producto: clean(m.producto), lote: clean(m.lote), bodega: clean(m.bodega), stock: 0 });
      map.get(key)!.stock += toNum(m.cantidad_signed);
    }
    return Array.from(map.values()).sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote) || a.bodega.localeCompare(b.bodega));
  }, [stockBase]);

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
    return monthMovements
      .filter((m) => (dashMoveProduct ? clean(m.producto) === dashMoveProduct : true))
      .filter((m) => (dashMoveLot ? clean(m.lote) === dashMoveLot : true))
      .filter((m) => (dashMoveBodega ? clean(m.bodega) === dashMoveBodega : true))
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
      .filter((m) => (dashOutProduct ? clean(m.producto) === dashOutProduct : true))
      .filter((m) => (dashOutLot ? clean(m.lote) === dashOutLot : true))
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

  const productOptions = useMemo(() => Array.from(new Set(productos.map((p) => clean(p.producto)).filter(Boolean))).sort(), [productos]);
  const productByLotMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of lotes) {
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
  }, [lotes, normalizedMovements]);

  const lotOptions = useMemo(() => {
    const all = Array.from(new Set(lotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (productFilters.length === 0) return all;
    return all.filter((lot) => {
      const set = productByLotMap.get(lot) || new Set<string>();
      return productFilters.some((p) => set.has(p));
    });
  }, [lotes, productFilters, productByLotMap]);

  const dashMoveLotOptions = useMemo(() => {
    const all = Array.from(new Set(lotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (!dashMoveProduct) return all;
    return all.filter((lot) => (productByLotMap.get(lot) || new Set<string>()).has(dashMoveProduct));
  }, [lotes, dashMoveProduct, productByLotMap]);

  const dashOutLotOptions = useMemo(() => {
    const all = Array.from(new Set(lotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (!dashOutProduct) return all;
    return all.filter((lot) => (productByLotMap.get(lot) || new Set<string>()).has(dashOutProduct));
  }, [lotes, dashOutProduct, productByLotMap]);

  const warehouseOptions = useMemo(() => Array.from(new Set(bodegas.map((b) => clean(b.bodega)).filter(Boolean))).sort(), [bodegas]);
  const typeOptions = useMemo(() => Array.from(new Set(tipos.map((t) => clean(t.tipo_movimiento)).filter(Boolean))).sort(), [tipos]);
  const clientOptions = useMemo(() => Array.from(new Set(clientes.map((c) => clean(c.cliente)).filter(Boolean))).sort(), [clientes]);

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
      const key = `${row.producto}|${row.lote}`;
      stockByProductLot.set(key, (stockByProductLot.get(key) || 0) + toNum(row.stock));
    }

    return lotes
      .map((l) => {
        const producto = clean(l.producto);
        const lote = clean(l.lote);
        if (!producto || !lote) return null;

        const meta = productMeta.get(producto) || { vialesPorCaja: 0, consumoMensual: 0, modo: 'DIRECTO' };
        const vialesRecibidos = toNum(l.viales_recibidos);
        const stockActualCajas = toNum(stockByProductLot.get(`${producto}|${lote}`) || 0);
        const cajasPotenciales =
          meta.modo === 'ENSAMBLAJE' && meta.vialesPorCaja > 0
            ? vialesRecibidos / meta.vialesPorCaja
            : 0;
        const coberturaMeses =
          meta.consumoMensual > 0
            ? (stockActualCajas + cajasPotenciales) / meta.consumoMensual
            : 0;

        let semaforo: 'AGOTADO' | 'ROJO' | 'AMARILLO' | 'VERDE' = 'VERDE';
        if (coberturaMeses <= 0) semaforo = 'AGOTADO';
        else if (coberturaMeses < 2) semaforo = 'ROJO';
        else if (coberturaMeses < 4) semaforo = 'AMARILLO';

        return {
          producto,
          lote,
          modo: meta.modo || 'DIRECTO',
          vialesRecibidos,
          vialesPorCaja: meta.vialesPorCaja,
          stockActualCajas,
          cajasPotenciales,
          consumoMensual: meta.consumoMensual,
          coberturaMeses,
          semaforo,
        };
      })
      .filter(Boolean)
      .filter((r: any) => (productFilters.length > 0 ? productFilters.includes(r.producto) : true))
      .filter((r: any) => (controlSemaforoFilter ? r.semaforo === controlSemaforoFilter : true))
      .sort((a: any, b: any) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
  }, [lotes, productos, stockByPLB, productFilters, controlSemaforoFilter]);

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

  const caducityAlerts = useMemo(() => {
    const list = lotes
      .map((l) => {
        const producto = clean(l.producto);
        const lote = clean(l.lote);
        const fecha = clean(l.fecha_caducidad);
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
  }, [lotes]);

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

    const stockByPLB = new Map<string, number>();
    for (const m of allMovs) {
      const producto = clean(m?.producto);
      const lote = clean(m?.lote);
      const bodega = clean(m?.bodega);
      if (!producto || !lote || !bodega) continue;
      const key = `${producto}|${lote}|${bodega}`;
      stockByPLB.set(key, (stockByPLB.get(key) || 0) + signedFromMovement(m));
    }

    const mountedByProduct = new Map<string, number>();
    const mountedByProductBodega = new Map<string, Map<string, number>>();
    const mountedByProductLote = new Map<string, Map<string, number>>();
    for (const [key, qty] of stockByPLB.entries()) {
      const [producto, lote, bodega] = key.split('|');
      const safeQty = Math.max(0, qty);
      mountedByProduct.set(producto, (mountedByProduct.get(producto) || 0) + safeQty);
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

    const potentialByProduct = new Map<string, number>();
    const potentialByProductLote = new Map<string, Map<string, number>>();
    for (const l of lotes) {
      const producto = clean(l.producto);
      const lote = clean(l.lote);
      if (!producto) continue;
      const meta = productMeta.get(producto);
      if (!meta || meta.modo !== 'ENSAMBLAJE' || meta.vialesPorCaja <= 0) continue;
      const potential = toNum(l.viales_recibidos) / meta.vialesPorCaja;
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
        const consumo = productMeta.get(producto)?.consumoMensual || 0;
        const stockTotal = toNum(mountedByProduct.get(producto) || 0);
        const coberturaMeses = consumo > 0 ? stockTotal / consumo : 0;
        return { producto, stockTotal, coberturaMeses };
      })
      .filter((row) => row.stockTotal > 0 && row.coberturaMeses > 0 && row.coberturaMeses < 2)
      .sort((a, b) => a.coberturaMeses - b.coberturaMeses);

    const potentialCritical = Array.from(allProducts)
      .map((producto) => {
        const consumo = productMeta.get(producto)?.consumoMensual || 0;
        const cajasPotenciales = toNum(potentialByProduct.get(producto) || 0);
        const coberturaMeses = consumo > 0 ? cajasPotenciales / consumo : 0;
        return { producto, cajasPotenciales, coberturaMeses };
      })
      .filter((row) => row.cajasPotenciales >= 0 && row.coberturaMeses >= 0 && row.coberturaMeses < 2)
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

    const globalStockByProductLotBodega = Array.from(stockByPLB.entries())
      .map(([key, stockTotal]) => {
        const [producto, lote, bodega] = key.split('|');
        return {
          producto,
          lote,
          bodega,
          stockTotal: toNum(Math.max(0, stockTotal)),
        };
      })
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
  }, [productos, lotes]);

  useEffect(() => {
    const payload = {
      updatedAt: new Date().toISOString(),
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
    };
    setInventoryAlertsShared(payload);
  }, [riskyProductsSummary, caducityAlerts, mountedAndPotentialAlerts, setInventoryAlertsShared]);

  const stockByProductLot = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of normalizedMovements) {
      if (clean(m.afecta_stock).toUpperCase() !== 'SI') continue;
      const key = `${clean(m.producto)}|${clean(m.lote)}`;
      map.set(key, (map.get(key) || 0) + toNum(m.cantidad_signed));
    }
    return map;
  }, [normalizedMovements]);

  const lotOptionsForForm = useMemo(() => {
    const rows = lotes
      .map((l) => ({ producto: clean(l.producto), lote: clean(l.lote) }))
      .filter((l) => !!l.producto && !!l.lote)
      .filter((l) => (movementForm.producto ? l.producto === movementForm.producto : true))
      .filter((l) => (stockByProductLot.get(`${l.producto}|${l.lote}`) || 0) !== 0);
    return Array.from(new Set(rows.map((r) => r.lote))).sort();
  }, [lotes, movementForm.producto, stockByProductLot]);

  const visibleMovements = useMemo(() => {
    const base = monthFilter ? monthMovements : normalizedMovements.filter((m) => movementMatchesFilters(m, false));
    return [...base].sort((a, b) => {
      const byDate = movementDateMs(clean(b.fecha)) - movementDateMs(clean(a.fecha));
      if (byDate !== 0) return byDate;
      return b.id - a.id;
    });
  }, [monthFilter, monthMovements, normalizedMovements, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter, quickSearch]);

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
  }, [monthFilter, productFilters, lotFilter, warehouseFilter, typeFilter, clientFilter]);

  const notifyAnabela = async (message: string) => {
    if (!anabela?.id) return;
    try {
      await addNotification({ message, userId: anabela.id, type: 'info' });
    } catch {
      // noop
    }
  };

  const notifyInventoryApprovers = async (message: string) => {
    const targetIds = Array.from(
      new Set([anabela?.id, ...admins.map((a) => a.id)].filter(Boolean) as string[]),
    );
    if (targetIds.length === 0) return;
    await Promise.all(
      targetIds.map(async (id) => {
        try {
          await addNotification({ message, userId: id, type: 'action_required' });
        } catch {
          // noop
        }
      }),
    );
  };

  const getUserName = (id: string) => USERS.find((u) => u.id === id)?.name || id;

  const actorPendingRequest = useMemo(
    () => editRequests.find((r) => r.requesterId === actorId && r.status === 'pending'),
    [editRequests, actorId],
  );

  const pendingRequestsForApprover = useMemo(
    () => editRequests.filter((r) => r.status === 'pending'),
    [editRequests],
  );

  const requestEditAccess = async () => {
    if (!actorId || !currentUser) return;
    if (actorPendingRequest) return;
    const request: InventoryEditRequest = {
      id: `${Date.now()}-${actorId}`,
      requesterId: actorId,
      requesterName: actorName,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };
    const next = [request, ...editRequests];
    setEditRequests(next);
    appendAudit('Solicitud de edición', 'Solicitó permiso temporal para editar inventario');
    await notifyInventoryApprovers(`${actorName} solicitó permiso para editar Inventario.`);
  };

  const approveEditRequest = async (requestId: string) => {
    if (!canApproveRequests || !actorId || !currentUser) return;
    const req = editRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'pending') return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EDIT_GRANT_HOURS * 60 * 60 * 1000).toISOString();
    const grant: InventoryEditGrant = {
      userId: req.requesterId,
      approvedById: actorId,
      approvedByName: actorName,
      approvedAt: now.toISOString(),
      expiresAt,
    };
    const nextGrants = [grant, ...normalizedActiveGrants.filter((g) => g.userId !== req.requesterId)];
    setEditGrants(nextGrants);

    const nextReqs = editRequests.map((r) =>
      r.id === requestId
        ? { ...r, status: 'approved' as EditRequestStatus, resolvedAt: now.toISOString(), resolvedById: actorId, resolvedByName: actorName }
        : r,
    );
    setEditRequests(nextReqs);
    appendAudit('Aprobación de edición', `Aprobó a ${req.requesterName} por ${EDIT_GRANT_HOURS} horas`);

    try {
      await addNotification({
        userId: req.requesterId,
        type: 'success',
        message: `Tu permiso para editar Inventario fue aprobado por ${actorName} hasta ${new Date(expiresAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`,
      });
    } catch {
      // noop
    }
  };

  const denyEditRequest = async (requestId: string) => {
    if (!canApproveRequests || !actorId || !currentUser) return;
    const req = editRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'pending') return;
    const now = new Date().toISOString();
    const nextReqs = editRequests.map((r) =>
      r.id === requestId
        ? { ...r, status: 'denied' as EditRequestStatus, resolvedAt: now, resolvedById: actorId, resolvedByName: actorName }
        : r,
    );
    setEditRequests(nextReqs);
    appendAudit('Denegación de edición', `Denegó la solicitud de ${req.requesterName}`);
    try {
      await addNotification({
        userId: req.requesterId,
        type: 'error',
        message: `Tu solicitud para editar Inventario fue denegada por ${actorName}.`,
      });
    } catch {
      // noop
    }
  };

  const openCreateModal = () => {
    if (!canEditNow) return;
    setEditingId(null);
    setMovementForm({ ...EMPTY_FORM });
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
    setMovementModalOpen(true);
  };

  const saveMovement = async () => {
    if (!canEditNow) return;
    const qty = Math.abs(toNum(movementForm.cantidad));
    if (!movementForm.tipo_movimiento || !movementForm.producto || !movementForm.lote || !movementForm.bodega || !qty) return;
    const producto = clean(movementForm.producto);
    const lote = clean(movementForm.lote);
    const bodega = clean(movementForm.bodega);
    const loteValido = lotes.some((l) => clean(l.producto) === producto && clean(l.lote) === lote);
    if (!loteValido) {
      window.alert(`El lote ${lote} no corresponde al producto ${producto}.`);
      return;
    }
    const sign = signByType.get(movementForm.tipo_movimiento) ?? 1;
    const signedQty = qty * sign;
    const key = `${producto}|${lote}|${bodega}`;
    const baseStock = normalizedMovements
      .filter((m) => (editingId ? m.id !== editingId : true))
      .reduce((acc, m) => {
        const mk = `${clean(m.producto)}|${clean(m.lote)}|${clean(m.bodega)}`;
        if (mk !== key) return acc;
        return acc + toNum(m.cantidad_signed);
      }, 0);
    if (baseStock + signedQty < 0) {
      window.alert(`Movimiento inválido: dejaría stock negativo en ${producto} · ${lote} · ${bodega}.`);
      return;
    }
    const nowIso = new Date().toISOString();

    if (editingId) {
      setMovimientos((prev) => prev.map((m) => m.id === editingId ? {
        ...m,
        fecha: movementForm.fecha,
        tipo_movimiento: movementForm.tipo_movimiento,
        producto: movementForm.producto,
        lote: movementForm.lote,
        cantidad: qty,
        bodega: movementForm.bodega,
        cliente: movementForm.cliente,
        destino: movementForm.destino,
        notas: movementForm.notas,
        signo: sign,
        cantidad_signed: qty * sign,
        updated_at: nowIso,
        updated_by: actorName,
      } : m));
      const editedMirrorCandidate: Movement = {
        id: editingId,
        fecha: movementForm.fecha,
        tipo_movimiento: movementForm.tipo_movimiento,
        producto: movementForm.producto,
        lote: movementForm.lote,
        cantidad: qty,
        bodega: movementForm.bodega,
        cliente: movementForm.cliente,
        destino: movementForm.destino,
        notas: movementForm.notas,
        afecta_stock: 'SI',
        signo: sign,
        cantidad_signed: qty * sign,
        updated_at: nowIso,
        updated_by: actorName,
      };
      syncMirrorUpsert(editedMirrorCandidate);
      await notifyAnabela(`${actorName} editó un movimiento en Inventario (ID ${editingId}).`);
      appendAudit('Edición de movimiento', `ID ${editingId} · ${movementForm.tipo_movimiento} · ${movementForm.producto} ${movementForm.lote}`);
      emitSuccessFeedback('Movimiento actualizado con éxito.');
    } else {
      const next: Movement = {
        id: normalizedMovements.length ? Math.max(...normalizedMovements.map((m) => m.id || 0)) + 1 : 1,
        fecha: movementForm.fecha,
        tipo_movimiento: movementForm.tipo_movimiento,
        producto: movementForm.producto,
        lote: movementForm.lote,
        cantidad: qty,
        bodega: movementForm.bodega,
        cliente: movementForm.cliente,
        destino: movementForm.destino,
        notas: movementForm.notas,
        afecta_stock: 'SI',
        signo: sign,
        cantidad_signed: qty * sign,
        created_at: nowIso,
        updated_at: nowIso,
        updated_by: actorName,
      };
      setMovimientos((prev) => [next, ...prev]);
      syncMirrorUpsert(next);
      await notifyAnabela(`${actorName} creó un movimiento en Inventario: ${next.tipo_movimiento} · ${next.producto} ${next.lote}.`);
      appendAudit('Creación de movimiento', `${next.tipo_movimiento} · ${next.producto} ${next.lote} · ${next.cantidad_signed}`);
      emitSuccessFeedback('Movimiento creado con éxito.');
    }

    setMovementModalOpen(false);
    setEditingId(null);
  };

  const deleteMovement = async (id: number) => {
    if (!canEditNow) return;
    const ok = window.confirm('¿Estás segura de eliminar este movimiento?');
    if (!ok) return;
    setMovimientos((prev) => prev.filter((m) => m.id !== id));
    syncMirrorDelete(id);
    await notifyAnabela(`${actorName} eliminó un movimiento en Inventario (ID ${id}).`);
    appendAudit('Eliminación de movimiento', `ID ${id}`);
    emitSuccessFeedback('Movimiento eliminado con éxito.');
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
    setLotForm({ producto: '', lote: '', viales_recibidos: '', fecha_caducidad: '' });
    setLotModalOpen(true);
  };

  const openLotEditModal = (l: GenericRow) => {
    if (!canEditNow) return;
    setEditingLotKey(`${clean(l.producto)}|${clean(l.lote)}`);
    setLotForm({
      producto: clean(l.producto),
      lote: clean(l.lote),
      viales_recibidos: clean(l.viales_recibidos),
      fecha_caducidad: clean(l.fecha_caducidad),
    });
    setLotModalOpen(true);
  };

  const saveLot = async () => {
    if (!canEditNow) return;
    if (!lotForm.producto || !lotForm.lote) return;
    const semaforo = getCaducitySemaforo(lotForm.fecha_caducidad);
    if (editingLotKey) {
      const [oldProductoRaw, oldLoteRaw] = editingLotKey.split('|');
      const oldProducto = clean(oldProductoRaw);
      const oldLote = clean(oldLoteRaw);
      const newProducto = clean(lotForm.producto);
      const newLote = clean(lotForm.lote);
      setLotes((prev) =>
        prev.map((l) =>
          `${clean(l.producto)}|${clean(l.lote)}` === editingLotKey
            ? { ...l, ...lotForm, semaforo_caducidad: semaforo }
            : l,
        ),
      );
      const changedMovements = movimientos
        .filter((m) => {
          if (clean(m.producto) !== oldProducto) return false;
          const mvLot = clean(m.lote);
          if (mvLot === oldLote) return true;
          // Soporta histórico con lote corto cuando maestro quedó en formato largo.
          return oldLote.endsWith(mvLot) || mvLot.endsWith(oldLote);
        })
        .map((m) => ({
          ...m,
          producto: newProducto,
          lote: newLote,
          updated_at: new Date().toISOString(),
          updated_by: actorName,
        }));
      if (changedMovements.length > 0) {
        const changedById = new Map<number, Movement>(changedMovements.map((m) => [m.id, m]));
        setMovimientos((prev) => prev.map((m) => changedById.get(m.id) || m));
        changedMovements.forEach((m) => syncMirrorUpsert(m));
      }
      await notifyAnabela(`${actorName} editó un lote en Inventario: ${lotForm.producto} ${lotForm.lote}.`);
      appendAudit(
        'Edición de lote',
        `${oldProducto} ${oldLote} → ${lotForm.producto} ${lotForm.lote} · Movimientos actualizados: ${changedMovements.length}`,
      );
      emitSuccessFeedback('Lote actualizado con éxito.');
    } else {
      setLotes((prev) => [{ ...lotForm, semaforo_caducidad: semaforo }, ...prev]);
      await notifyAnabela(`${actorName} creó un lote en Inventario: ${lotForm.producto} ${lotForm.lote}.`);
      appendAudit('Creación de lote', `${lotForm.producto} ${lotForm.lote}`);
      emitSuccessFeedback('Lote creado con éxito.');
    }
    setLotModalOpen(false);
    setEditingLotKey(null);
  };

  const saveBodega = async () => {
    if (!canEditNow) return;
    if (!bodegaForm.bodega.trim()) return;
    setBodegas((prev) => [{ bodega: bodegaForm.bodega.trim(), activo_si_no: bodegaForm.activo_si_no }, ...prev]);
    await notifyAnabela(`${actorName} creó una bodega en Inventario: ${bodegaForm.bodega.trim()}.`);
    appendAudit('Creación de bodega', bodegaForm.bodega.trim());
    emitSuccessFeedback('Bodega creada con éxito.');
    setBodegaForm({ bodega: '', activo_si_no: 'SI' });
    setBodegaModalOpen(false);
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

  const editClient = async (oldClientRaw: string) => {
    if (!canEditNow) return;
    const oldClient = clean(oldClientRaw);
    if (!oldClient) return;
    const nextClient = window.prompt('Nuevo nombre de cliente', oldClientRaw)?.trim();
    if (!nextClient) return;
    const nextClientClean = clean(nextClient);
    if (!nextClientClean || nextClientClean === oldClient) return;
    setClientes((prev) =>
      prev.map((c) => (clean(c.cliente) === oldClient ? { ...c, cliente: nextClient } : c)),
    );
    const changedMovements = movimientos
      .filter((m) => clean(m.cliente) === oldClient)
      .map((m) => ({
        ...m,
        cliente: nextClient,
        updated_at: new Date().toISOString(),
        updated_by: actorName,
      }));
    if (changedMovements.length > 0) {
      const changedById = new Map<number, Movement>(changedMovements.map((m) => [m.id, m]));
      setMovimientos((prev) => prev.map((m) => changedById.get(m.id) || m));
      changedMovements.forEach((m) => syncMirrorUpsert(m));
    }
    await notifyAnabela(`${actorName} editó cliente en Inventario: ${oldClientRaw} → ${nextClient}.`);
    appendAudit('Edición de cliente', `${oldClientRaw} → ${nextClient} · Movimientos actualizados: ${changedMovements.length}`);
    emitSuccessFeedback('Cliente actualizado con éxito.');
  };

  const editTipoMovimiento = async (oldTipoRaw: string) => {
    if (!canEditNow) return;
    const oldTipo = clean(oldTipoRaw);
    if (!oldTipo) return;
    const nextTipo = window.prompt('Nuevo tipo de movimiento', oldTipoRaw)?.trim();
    if (!nextTipo) return;
    const nextTipoClean = clean(nextTipo);
    if (!nextTipoClean || nextTipoClean === oldTipo) return;
    setTipos((prev) =>
      prev.map((t) =>
        clean(t.tipo_movimiento) === oldTipo
          ? { ...t, tipo_movimiento: nextTipo }
          : t,
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
      const changedById = new Map<number, Movement>(changedMovements.map((m) => [m.id, m]));
      setMovimientos((prev) => prev.map((m) => changedById.get(m.id) || m));
      changedMovements.forEach((m) => syncMirrorUpsert(m));
    }
    await notifyAnabela(`${actorName} editó tipo de movimiento: ${oldTipoRaw} → ${nextTipo}.`);
    appendAudit('Edición de tipo', `${oldTipoRaw} → ${nextTipo} · Movimientos actualizados: ${changedMovements.length}`);
    emitSuccessFeedback('Tipo de movimiento actualizado con éxito.');
  };

  const downloadMovements = async () => {
    const headers = ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Destino', 'Notas'];
    const rows = visibleMovements.map((m) => [m.fecha, m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed ?? m.cantidad, m.bodega, m.cliente || '', m.destino || '', m.notas || '']);
    openTablePdf('Inventario - Movimientos', `inventario-movimientos-${monthFilter || 'todos'}.pdf`, headers, rows);
    await notifyAnabela(`${actorName} descargó movimientos de Inventario (${monthFilter || 'todos'}).`);
    appendAudit('Descarga PDF', `Movimientos (${monthFilter || 'todos'})`);
    emitSuccessFeedback('PDF generado con éxito.');
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
      subtitle: `Mes: ${monthFilter ? monthLabel(monthFilter) : 'Todos'} · Generado: ${new Date().toLocaleString('es-ES')}`,
      fileName: `inventario-canet-gerencial-${monthFilter || 'todos'}.pdf`,
      headers: ['Indicador', 'Valor'],
      rows: summaryRows,
      signatures: ['Responsable', 'Revisión'],
    });
    await notifyAnabela(`${actorName} descargó reporte gerencial de Inventario (${monthFilter || 'todos'}).`);
    appendAudit('Descarga PDF', `Gerencial (${monthFilter || 'todos'})`);
    emitSuccessFeedback('PDF gerencial generado con éxito.');
  };

  const tabs: Array<{ key: InventoryTab; label: string; icon: React.ElementType; compact?: boolean }> = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'control_stock', label: 'Control stock', icon: Wrench },
    { key: 'movimientos', label: 'Movimientos', icon: ClipboardList },
    { key: 'bitacora', label: 'Bitácora', icon: AlertTriangle, compact: true },
    { key: 'productos', label: 'Productos', icon: Package, compact: true },
    { key: 'lotes', label: 'Lotes', icon: Layers3, compact: true },
    { key: 'bodegas', label: 'Bodegas', icon: Building2, compact: true },
    { key: 'clientes', label: 'Clientes', icon: Users, compact: true },
    { key: 'tipos', label: 'Tipos', icon: Tags, compact: true },
  ];

  const scrollToSection = (id: string) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isEditModeActive = accessMode === 'edit' && canEditNow;
  const activeMainFiltersCount = [productFilters.length > 0, lotFilter, warehouseFilter, typeFilter, clientFilter, quickSearch].filter(Boolean).length;
  const compactInventoryTiles: Array<{ key: 'stock' | 'moves' | 'clients' | 'adjust' | 'outputs'; label: string; Icon: any }> = [
    { key: 'stock', label: 'Stock', Icon: Package },
    { key: 'moves', label: 'Movimientos', Icon: ClipboardList },
    { key: 'clients', label: 'Clientes', Icon: Users },
    { key: 'adjust', label: 'Ajustes', Icon: Wrench },
    { key: 'outputs', label: 'Salidas', Icon: ArrowDownCircle },
  ];
  const activeMainFilterChips = [
    ...productFilters.map((p) => ({ key: `producto-${p}`, label: `Producto: ${p}`, onClear: () => removeProductFilter(p) })),
    lotFilter ? { key: 'lote', label: `Lote: ${lotFilter}`, onClear: () => setLotFilter('') } : null,
    warehouseFilter ? { key: 'bodega', label: `Bodega: ${warehouseFilter}`, onClear: () => setWarehouseFilter('') } : null,
    typeFilter ? { key: 'tipo', label: `Tipo: ${typeFilter}`, onClear: () => setTypeFilter('') } : null,
    clientFilter ? { key: 'cliente', label: `Cliente: ${clientFilter}`, onClear: () => setClientFilter('') } : null,
    quickSearch ? { key: 'quick', label: `Buscar: ${quickSearch}`, onClear: () => setQuickSearch('') } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>;

  useEffect(() => {
    if (accessMode === 'edit' && !canEditNow) {
      setAccessMode('consult');
    }
  }, [accessMode, canEditNow]);

  useEffect(() => {
    if (accessMode === 'unset') setShowMainFilters(false);
  }, [accessMode]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 app-page-shell">
      <div className="rounded-2xl border border-violet-100 bg-white p-4 md:p-5 shadow-sm compact-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">Inventario</p>
            <h1 className="text-2xl font-black text-violet-950">Control de stock Canet</h1>
            <p className="text-sm text-violet-700/80">Vista integrada con filtros y tablas operativas.</p>
          </div>
          <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
            Mes de análisis
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="mt-1 block rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 outline-none min-w-[220px]">
              <option value="">Todos</option>
              {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </label>
        </div>
        {accessMode !== 'unset' && (
          <div className="mt-3 flex justify-end">
            <button onClick={() => void downloadExecutiveReport()} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
              <Download size={14} />
              PDF gerencial
            </button>
          </div>
        )}
      </div>

      {accessMode === 'unset' ? (
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
                  if (canEditNow) {
                    setAccessMode('edit');
                    return;
                  }
                  void requestEditAccess();
                  setAccessMode('consult');
                }}
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100"
              >
                <p className="text-sm font-black text-amber-900">Editar</p>
                <p className="text-xs text-amber-800">Requiere autorización de Anabela o administradora (vigencia de 6 horas).</p>
              </button>
            </div>
            {!canEditNow && actorPendingRequest && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Solicitud enviada el {new Date(actorPendingRequest.requestedAt).toLocaleString('es-ES')}. Esperando aprobación.
              </div>
            )}
            {canEditNow && actorGrant && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Tienes permiso de edición activo hasta {new Date(actorGrant.expiresAt).toLocaleString('es-ES')}.
              </div>
            )}
          </div>

          {canApproveRequests && (
            <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black text-violet-950">Solicitudes de edición pendientes</h3>
              {pendingRequestsForApprover.length === 0 ? (
                <p className="mt-2 text-sm text-violet-600">No hay solicitudes pendientes.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {pendingRequestsForApprover.map((r) => (
                    <div key={r.id} className="rounded-xl border border-violet-100 bg-violet-50 p-3">
                      <p className="text-sm font-semibold text-violet-900">{r.requesterName} solicita editar inventario</p>
                      <p className="text-xs text-violet-600">Enviado: {new Date(r.requestedAt).toLocaleString('es-ES')}</p>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => void approveEditRequest(r.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Aprobar 6 horas</button>
                        <button onClick={() => void denyEditRequest(r.id)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Denegar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm compact-card">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setAccessMode('consult')}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${!isEditModeActive ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-100 bg-violet-50 text-violet-700'}`}
              >
                Consultar
              </button>
              <button
                onClick={() => {
                  if (canEditNow) {
                    setAccessMode('edit');
                    return;
                  }
                  void requestEditAccess();
                }}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${isEditModeActive ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              >
                Editar
              </button>
              <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${isEditModeActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {isEditModeActive ? 'Modo edición activo' : 'Modo consulta'}
              </span>
            </div>
            {isEditModeActive && actorGrant && (
              <p className="mt-2 text-xs text-violet-700">
                Permiso temporal aprobado por {actorGrant.approvedByName} hasta {new Date(actorGrant.expiresAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.
              </p>
            )}
          </div>

          {canApproveRequests && pendingRequestsForApprover.length > 0 && (
            <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
              <p className="text-sm font-black text-violet-950">Tienes {pendingRequestsForApprover.length} solicitud(es) de edición pendiente(s)</p>
              <div className="mt-2 space-y-2">
                {pendingRequestsForApprover.map((r) => (
                  <div key={r.id} className="rounded-xl border border-violet-100 bg-violet-50 p-2.5">
                    <p className="text-sm font-semibold text-violet-900">{r.requesterName}</p>
                    <p className="text-xs text-violet-600">Solicitó acceso el {new Date(r.requestedAt).toLocaleString('es-ES')}</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => void approveEditRequest(r.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Aprobar 6 horas</button>
                      <button onClick={() => void denyEditRequest(r.id)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Denegar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm compact-card">
            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => {
                const isActive = item.key === tab;
                return (
                  <button key={item.key} onClick={() => setTab(item.key)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 font-semibold transition ${item.compact ? 'text-xs' : 'text-sm'} ${isActive ? 'border-violet-500 bg-violet-600 text-white shadow-sm' : 'border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
                    <item.icon size={15} /> {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {accessMode !== 'unset' && (tab === 'dashboard' || tab === 'movimientos') && (
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
              <InputDatalistTag label="Producto" value={productFilterInput} onChange={setProductFilterInput} onSelect={addProductFilter} listId="inv-filter-product" options={productOptions} placeholder="Escribe producto..." />
              <InputDatalist label="Lote" value={lotFilter} onChange={setLotFilter} listId="inv-filter-lot" options={lotOptions} placeholder="Escribe lote..." />
              <InputDatalist label="Bodega" value={warehouseFilter} onChange={setWarehouseFilter} listId="inv-filter-bodega" options={warehouseOptions} placeholder="Escribe bodega..." />
              <InputDatalist label="Tipo movimiento" value={typeFilter} onChange={setTypeFilter} listId="inv-filter-type" options={typeOptions} placeholder="Escribe tipo..." />
              <InputDatalist label="Cliente" value={clientFilter} onChange={setClientFilter} listId="inv-filter-client" options={clientOptions} placeholder="Escribe cliente..." />
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

      {accessMode !== 'unset' && tab === 'dashboard' && (
        <div className="space-y-4">
          {isCompact && (
            <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {compactInventoryTiles.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setCompactInventoryPanel(key)}
                    className={`compact-card rounded-xl border p-2 text-xs font-black ${
                      compactInventoryPanel === key
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
          <section className="grid gap-2 md:grid-cols-3">
            <KpiCard
              title="Productos en riesgo"
              value={`${criticalProducts.length}`}
              helper={criticalProducts.length > 0 ? `Críticos: ${criticalProducts.join(', ')}` : 'Sin riesgo crítico'}
              tone={criticalProducts.length > 0 ? 'rose' : 'emerald'}
              onClick={() => setRiskModalOpen(true)}
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

          {(!isCompact || compactInventoryPanel === 'stock') && (
          <DataSection title="Stock por producto por lote y bodega" subtitle="Acumulado hasta el mes seleccionado." tone="violet" onDownload={async () => {
            openTablePdf(
              'Inventario - Stock por producto/lote/bodega',
              `dashboard-stock-${monthFilter || 'todos'}.pdf`,
              ['Producto', 'Lote', 'Bodega', 'Stock'],
              stockByPLB.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
            );
            await notifyAnabela(`${actorName} descargó tablero: Stock por producto/lote/bodega (${monthFilter || 'todos'}).`);
            appendAudit('Descarga PDF', `Dashboard stock (${monthFilter || 'todos'})`);
          }}>
            <SimpleDataTable headers={['Producto', 'Lote', 'Bodega', 'Stock', 'Estado']} rows={stockByPLB.map((r) => {
              const stockVal = toNum(r.stock);
              const status =
                stockVal <= 0
                  ? 'Agotado'
                  : stockVal < 1000
                    ? 'Crítico'
                    : stockVal <= 2000
                      ? 'Stock bajo'
                      : 'OK';
              return [
                <ProductPill key={`${r.producto}-${r.lote}-${r.bodega}`} code={r.producto} colorMap={productColorMap} />,
                r.lote,
                r.bodega,
                r.stock,
                <span
                  key={`${r.producto}-${r.lote}-status`}
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    status === 'Agotado'
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

          {(!isCompact || compactInventoryPanel === 'moves') && (
          <DataSection title="Movimientos por lote del mes" subtitle="Detalle filtrable de movimientos mensuales." tone="indigo" onDownload={async () => {
            openTablePdf(
              'Inventario - Movimientos por lote del mes',
              `dashboard-mov-lote-${monthFilter || 'todos'}.pdf`,
              ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad'],
              movementByLotDetail.map((m) => [m.fecha, m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || 0]),
            );
            await notifyAnabela(`${actorName} descargó tablero: Movimientos por lote (${monthFilter || 'todos'}).`);
            appendAudit('Descarga PDF', `Dashboard movimientos por lote (${monthFilter || 'todos'})`);
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

          {(!isCompact || compactInventoryPanel === 'clients') && (
          <DataSection title="Stock por cliente o bodega por producto y lote" subtitle="Solo ventas." tone="emerald" onDownload={async () => {
            openTablePdf(
              'Inventario - Stock por cliente o bodega',
              `dashboard-clientes-${monthFilter || 'todos'}.pdf`,
              ['Cliente/Bodega', 'Producto', 'Lote', 'Cantidad'],
              stockByClient.map((r) => [r.destino_cliente, r.producto, r.lote, r.cantidad]),
            );
            await notifyAnabela(`${actorName} descargó tablero: Stock por cliente/bodega (${monthFilter || 'todos'}).`);
            appendAudit('Descarga PDF', `Dashboard stock cliente/bodega (${monthFilter || 'todos'})`);
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

          {(!isCompact || compactInventoryPanel === 'adjust') && (
          <DataSection id="inventory-adjustments-section" title="Control de ajustes" subtitle="Ajustes positivos y negativos." tone="amber" onDownload={async () => {
            openTablePdf(
              'Inventario - Control de ajustes',
              `dashboard-ajustes-${monthFilter || 'todos'}.pdf`,
              ['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad'],
              adjustmentControl.map((r) => [r.producto, r.lote, r.bodega, r.tipo, r.cantidad]),
            );
            await notifyAnabela(`${actorName} descargó tablero: Control de ajustes (${monthFilter || 'todos'}).`);
            appendAudit('Descarga PDF', `Dashboard ajustes (${monthFilter || 'todos'})`);
          }}>
            <SimpleDataTable headers={['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad']} rows={takeRows(adjustmentControl, showAdjustAll).map((r) => [<ProductPill key={`${r.producto}-${r.lote}-${r.tipo}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.tipo, r.cantidad])} />
            {adjustmentControl.length > 5 && (
              <ToggleRowsButton showAll={showAdjustAll} onToggle={() => setShowAdjustAll((v) => !v)} />
            )}
          </DataSection>
          )}

          {(!isCompact || compactInventoryPanel === 'outputs') && (
          <DataSection id="inventory-output-section" title="Control de salidas por lote" subtitle="Traspaso, venta y envio." tone="rose" onDownload={async () => {
            openTablePdf(
              'Inventario - Control de salidas por lote',
              `dashboard-salidas-${monthFilter || 'todos'}.pdf`,
              ['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad'],
              outputControl.map((r) => [r.producto, r.lote, r.bodega, r.tipo, r.cantidad]),
            );
            await notifyAnabela(`${actorName} descargó tablero: Control de salidas (${monthFilter || 'todos'}).`);
            appendAudit('Descarga PDF', `Dashboard salidas (${monthFilter || 'todos'})`);
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

      {accessMode !== 'unset' && tab === 'control_stock' && (
        <div className="space-y-4">
          <DataSection
            title="Control de stock"
            subtitle="Cobertura por lote según viales, consumo mensual y modo de stock."
            tone="indigo"
            onDownload={async () => {
              openTablePdf(
                'Inventario - Control de stock',
                `control-stock-${monthFilter || 'todos'}.pdf`,
                ['Producto', 'Lote', 'Viales recibidos', 'Stock actual cajas', 'Cajas potenciales', 'Consumo mensual', 'Cobertura', 'Semáforo'],
                controlStockRows.map((r: any) => [
                  r.producto,
                  r.lote,
                  r.vialesRecibidos,
                  Number(r.stockActualCajas.toFixed(2)),
                  Number(r.cajasPotenciales.toFixed(2)),
                  r.consumoMensual,
                  formatCoverage(r.coberturaMeses),
                  r.semaforo,
                ]),
              );
              await notifyAnabela(`${actorName} descargó tablero: Control de stock (${monthFilter || 'todos'}).`);
              appendAudit('Descarga PDF', `Control de stock (${monthFilter || 'todos'})`);
            }}
          >
            <div className="mb-3 grid gap-2 md:grid-cols-3">
              <SelectFilter
                label="Semáforo"
                value={controlSemaforoFilter}
                onChange={setControlSemaforoFilter}
                options={['AGOTADO', 'ROJO', 'AMARILLO', 'VERDE']}
              />
            </div>
            <SimpleDataTable
              headers={['Producto', 'Lote', 'Viales', 'Stock cajas', 'Potencial cajas', 'Consumo mes', 'Cobertura', 'Semáforo']}
              rows={controlStockRows.map((r: any) => [
                <ProductPill key={`${r.producto}-${r.lote}-control`} code={r.producto} colorMap={productColorMap} />,
                r.lote,
                r.vialesRecibidos,
                Number(r.stockActualCajas.toFixed(2)),
                Number(r.cajasPotenciales.toFixed(2)),
                r.consumoMensual,
                formatCoverage(r.coberturaMeses),
                <span
                  key={`${r.producto}-${r.lote}-sem`}
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    r.semaforo === 'AGOTADO'
                      ? 'bg-slate-100 text-slate-600'
                      : r.semaforo === 'ROJO'
                      ? 'bg-rose-100 text-rose-700'
                      : r.semaforo === 'AMARILLO'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {r.semaforo}
                </span>,
              ])}
            />
          </DataSection>
        </div>
      )}

      {accessMode !== 'unset' && tab === 'movimientos' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Movimientos</h3>
              <div className="flex gap-2">
                <button onClick={openCreateModal} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Nuevo movimiento</button>
                <button onClick={() => void downloadMovements()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"><Download size={14} /> Descargar mes/filtro</button>
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
                <button disabled={!isEditModeActive} onClick={() => void deleteMovement(m.id)} className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Trash2 size={13} /></button>
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

      {accessMode !== 'unset' && tab === 'bitacora' && (
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

      {accessMode !== 'unset' && tab === 'productos' && <SimpleDataTable headers={['Producto', 'Color', 'Stock min', 'Stock optimo', 'Modo', 'Activo']} rows={productos.map((p) => [<ProductPill key={clean(p.producto)} code={clean(p.producto)} colorMap={productColorMap} />, <span key={`${clean(p.producto)}-sw`} className="inline-flex h-5 w-5 rounded-full border border-violet-200" style={{ backgroundColor: productColorMap.get(clean(p.producto)) || '#7c3aed' }} />, p.stock_min, p.stock_opt, p.modo_stock, p.activo_si_no])} />}

      {accessMode !== 'unset' && tab === 'lotes' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Lotes</h3>
              <button onClick={openLotCreateModal} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Añadir lote</button>
            </div>
          </div>
          <SimpleDataTable
            headers={['Producto', 'Lote', 'Viales', 'Caducidad', 'Semáforo', 'Acciones']}
            rows={lotes.map((l, idx) => [
              <ProductPill key={`${clean(l.producto)}-${clean(l.lote)}-${idx}`} code={clean(l.producto)} colorMap={productColorMap} />,
              clean(l.lote),
              clean(l.viales_recibidos) || '-',
              clean(l.fecha_caducidad) || '-',
              clean(l.semaforo_caducidad) || '-',
              <button key={`lot-edit-${idx}`} disabled={!isEditModeActive} onClick={() => openLotEditModal(l)} className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Pencil size={13} /></button>,
            ])}
          />
        </div>
      )}

      {accessMode !== 'unset' && tab === 'bodegas' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">Bodegas</h3>
              <button onClick={() => setBodegaModalOpen(true)} disabled={!isEditModeActive} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${isEditModeActive ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}><Plus size={14} /> Añadir bodega</button>
            </div>
          </div>
          <SimpleDataTable headers={['Bodega', 'Activo']} rows={bodegas.map((b) => [b.bodega, b.activo_si_no])} />
        </div>
      )}

      {accessMode !== 'unset' && tab === 'clientes' && (
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
            rows={clientes.map((c, idx) => [
              c.cliente,
              <button
                key={`client-edit-${idx}`}
                disabled={!isEditModeActive}
                onClick={() => void editClient(c.cliente)}
                className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <Pencil size={13} />
              </button>,
            ])}
          />
        </div>
      )}

      {accessMode !== 'unset' && tab === 'tipos' && (
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

      {movementModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 p-2 sm:p-3 md:pl-64">
          <div className="w-full max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">{editingId ? 'Editar movimiento' : 'Crear movimiento'}</h3>
              <button onClick={() => setMovementModalOpen(false)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><X size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Input label="Fecha" type="date" value={movementForm.fecha} onChange={(v) => setMovementForm({ ...movementForm, fecha: v })} />
              <InputDatalist label="Tipo" value={movementForm.tipo_movimiento} onChange={(v) => setMovementForm({ ...movementForm, tipo_movimiento: v })} listId="inventory-types" options={typeOptions} placeholder="venta, traspaso..." />
              <ProductColorSelect
                label="Producto"
                value={movementForm.producto}
                onChange={(v) => setMovementForm({ ...movementForm, producto: v, lote: '' })}
                options={productOptions}
                colorMap={productColorMap}
              />
              <InputDatalist label="Lote" value={movementForm.lote} onChange={(v) => setMovementForm({ ...movementForm, lote: v })} listId="inventory-lotes" options={lotOptionsForForm} placeholder="Lote" />
              <Input label="Cantidad" type="number" value={movementForm.cantidad} onChange={(v) => setMovementForm({ ...movementForm, cantidad: v })} />
              <InputDatalist label="Bodega" value={movementForm.bodega} onChange={(v) => setMovementForm({ ...movementForm, bodega: v })} listId="inventory-bodegas" options={warehouseOptions} placeholder="Bodega" />
              <InputDatalist label="Cliente" value={movementForm.cliente} onChange={(v) => setMovementForm({ ...movementForm, cliente: v })} listId="inventory-clientes" options={clientOptions} placeholder="Opcional" />
              <Input label="Destino" value={movementForm.destino} onChange={(v) => setMovementForm({ ...movementForm, destino: v })} />
              <Input label="Notas" value={movementForm.notas} onChange={(v) => setMovementForm({ ...movementForm, notas: v })} />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void saveMovement()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">{editingId ? <Pencil size={14} /> : <Plus size={14} />} {editingId ? 'Guardar cambios' : 'Crear movimiento'}</button>
              <button onClick={() => setMovementModalOpen(false)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Cancelar</button>
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
              <Input label="Cantidad viales" type="number" value={lotForm.viales_recibidos} onChange={(v) => setLotForm({ ...lotForm, viales_recibidos: v })} />
              <Input label="Fecha caducidad" type="date" value={lotForm.fecha_caducidad} onChange={(v) => setLotForm({ ...lotForm, fecha_caducidad: v })} />
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
      <p className="mt-2 text-[10px] font-semibold text-violet-600">Haz clic en un color para ver el lote y la cantidad.</p>
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

function DataSection({ id, title, subtitle, children, tone, onDownload }: { id?: string; title: string; subtitle?: string; children: React.ReactNode; tone: 'violet' | 'indigo' | 'emerald' | 'amber' | 'rose'; onDownload?: () => void }) {
  const toneMap: Record<string, string> = {
    violet: 'border-violet-200 bg-violet-50/30',
    indigo: 'border-indigo-200 bg-indigo-50/30',
    emerald: 'border-emerald-200 bg-emerald-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    rose: 'border-rose-200 bg-rose-50/30',
  };
  return (
    <section id={id} className={`rounded-2xl border p-4 shadow-sm space-y-3 compact-card ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base md:text-lg font-black text-violet-950">{title}</h2>
          {subtitle && <p className="text-xs text-violet-700/80">{subtitle}</p>}
        </div>
        {onDownload && <button onClick={onDownload} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"><Download size={12} /> Descargar</button>}
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

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none" />
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

function SimpleDataTable({ headers, rows }: { headers: string[]; rows: Array<Array<any>> }) {
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
            <tr key={idx} className="border-t border-violet-100 hover:bg-violet-50/60">
              {row.map((cell, i) => <td key={i} className="px-3 py-2.5 text-violet-900">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default InventoryPage;
