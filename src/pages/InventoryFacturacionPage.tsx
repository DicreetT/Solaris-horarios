import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Boxes, Calculator, Download, FileWarning, FolderTree, Plus, Save, Trash2, X } from 'lucide-react';
import seed from '../data/inventory_facturacion_seed.json';
import { useAuth } from '../context/AuthContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import { USERS } from '../constants';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { openPrintablePdfReport } from '../utils/pdfReport';
import { useDensityMode } from '../hooks/useDensityMode';
import { useSharedJsonState } from '../hooks/useSharedJsonState';

type TabKey = 'dashboard' | 'movimientos' | 'rectificativas' | 'ensamblajes' | 'maestros';
type DashboardKey = 'stock' | 'control' | 'rect' | 'ventas_anual' | 'envios_mes' | 'ensam_anual';
type MasterKey = 'productos' | 'lotes' | 'bodegas' | 'tipos' | 'clientes';
type InventoryAccessMode = 'unset' | 'consult' | 'edit';
type EditRequestStatus = 'pending' | 'approved' | 'denied';

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
};

type GenericRow = Record<string, any>;
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

const STORAGE_MOVS_KEY = 'invhf_movimientos_v1';
const STORAGE_CANET_MOVS_KEY = 'inventory_canet_movimientos_v1';
const STORAGE_CANET_ASSEMBLIES_SEEN = 'invhf_canet_assemblies_seen_v1';
const STORAGE_CANET_ASSEMBLIES_NOTIFIED = 'invhf_canet_assemblies_notified_v1';
// Desde esta fecha se activa la integración automática de ensamblajes de Canet -> Huarte.
const CANET_ASSEMBLY_SYNC_START = '2026-02-24';
// Desde esta fecha se activa la integración automática de movimientos de Canet -> Huarte.
const CANET_MOVEMENT_SYNC_START = '2026-02-24';
const STORAGE_HUARTE_EDIT_REQUESTS = 'inventory_huarte_edit_requests_v1';
const STORAGE_HUARTE_EDIT_GRANTS = 'inventory_huarte_edit_grants_v1';
const EDIT_GRANT_HOURS = 6;
const HUARTE_PRODUCT_COLORS: Record<string, string> = {
  SV: '#83b06f',
  ENT: '#76a5af',
  KL: '#f9a8d4',
  ISO: '#fca5a5',
  AV: '#f9cb9c',
  RG: '#1e3a8a',
};

const clean = (v: unknown) => (v == null ? '' : String(v).trim());
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
const isHuarteAlias = (v: unknown) => {
  const x = normalizeSearch(v);
  return x.includes('huarte') || x.includes('guarte') || x.includes('warte') || x.includes('wuarte');
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
const HUARTE_BUILD_TAG = 'HF-2026-02-25-1130';

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
  const actorName = currentUser?.name || 'Usuario';
  const actorId = currentUser?.id || '';
  const actorIsAdmin = !!currentUser?.isAdmin;
  const actorIsItziar = !!(currentUser && itziar && currentUser.id === itziar.id);

  const [tab, setTab] = useState<TabKey>('dashboard');
  const [dashboardSection, setDashboardSection] = useState<DashboardKey>('stock');
  const [masterSection, setMasterSection] = useState<MasterKey>('productos');
  const [accessMode, setAccessMode] = useState<InventoryAccessMode>('unset');
  const [editRequests, setEditRequests] = useSharedJsonState<InventoryEditRequest[]>(
    STORAGE_HUARTE_EDIT_REQUESTS,
    [],
    { userId: actorId },
  );
  const [editGrants, setEditGrants] = useSharedJsonState<InventoryEditGrant[]>(
    STORAGE_HUARTE_EDIT_GRANTS,
    [],
    { userId: actorId },
  );

  const [monthFilter, setMonthFilter] = useState('');
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

  const [movimientos, setMovimientos] = useSharedJsonState<Movement[]>(
    STORAGE_MOVS_KEY,
    seed.movimientos as Movement[],
    { userId: actorId, pollIntervalMs: 300 },
  );
  const [canetMovimientos, , canetMovimientosLoading] = useSharedJsonState<Movement[]>(
    STORAGE_CANET_MOVS_KEY,
    [],
    { userId: actorId, initializeIfMissing: false, pollIntervalMs: 300 },
  );
  const [canetAssembliesSeenIds, setCanetAssembliesSeenIds] = useSharedJsonState<number[]>(
    `${STORAGE_CANET_ASSEMBLIES_SEEN}:${actorId || 'anon'}`,
    [],
    { userId: actorId, initializeIfMissing: !!actorId },
  );
  const [canetAssembliesNotifiedKey, setCanetAssembliesNotifiedKey] = useSharedJsonState<string>(
    `${STORAGE_CANET_ASSEMBLIES_NOTIFIED}:${actorId || 'anon'}`,
    '',
    { userId: actorId, initializeIfMissing: !!actorId },
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_MOV });

  const [productos, setProductos] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_productos_v1',
    seed.productos as GenericRow[],
    { userId: actorId },
  );
  const [lotes, setLotes] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_lotes_v1',
    seed.lotes as GenericRow[],
    { userId: actorId },
  );
  const [bodegas, setBodegas] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_bodegas_v1',
    seed.bodegas as GenericRow[],
    { userId: actorId },
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

  const [newProducto, setNewProducto] = useState('');
  const [newLote, setNewLote] = useState({ producto: '', lote: '', bodega: '', estado: 'ACTIVO' });
  const [newTipo, setNewTipo] = useState('');
  const [newCliente, setNewCliente] = useState('');
  const [newBodega, setNewBodega] = useState({ bodega: '', activo_si_no: 'SI' });

  const ensamblajesArchivos = seed.ensamblajes_archivos as GenericRow[];
  const canetAssemblySyncStartDate = useMemo(
    () => parseDate(CANET_ASSEMBLY_SYNC_START) || new Date('2026-02-23T00:00:00'),
    [],
  );
  const canetMovementSyncStartDate = useMemo(
    () => parseDate(CANET_MOVEMENT_SYNC_START) || new Date('2026-02-23T00:00:00'),
    [],
  );

  useEffect(() => {
    const t = clean(searchParams.get('tab')).toLowerCase();
    const allowed: Record<string, TabKey> = {
      dashboard: 'dashboard',
      movimientos: 'movimientos',
      rectificativas: 'rectificativas',
      ensamblajes: 'ensamblajes',
      maestros: 'maestros',
    };
    if (t && allowed[t]) {
      setTab(allowed[t]);
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const canApproveRequests = actorIsAdmin || actorIsItziar;
  const canEditByDefault = actorIsAdmin || actorIsItziar;
  const normalizedActiveGrants = useMemo(() => {
    const nowMs = Date.now();
    return editGrants.filter((g) => new Date(g.expiresAt).getTime() > nowMs);
  }, [editGrants]);
  useEffect(() => {
    if (normalizedActiveGrants.length !== editGrants.length) {
      setEditGrants(normalizedActiveGrants);
    }
  }, [normalizedActiveGrants, editGrants.length]);
  const actorGrant = useMemo(() => normalizedActiveGrants.find((g) => g.userId === actorId), [normalizedActiveGrants, actorId]);
  const canEditNow = canEditByDefault || !!actorGrant;
  const isEditModeActive = accessMode === 'edit' && canEditNow;
  const canEdit = isEditModeActive;
  const actorPendingRequest = useMemo(
    () => editRequests.find((r) => r.requesterId === actorId && r.status === 'pending'),
    [editRequests, actorId],
  );
  const pendingRequestsForApprover = useMemo(
    () => editRequests.filter((r) => r.status === 'pending'),
    [editRequests],
  );
  useEffect(() => {
    if (accessMode === 'edit' && !canEditNow) {
      setAccessMode('consult');
    }
  }, [accessMode, canEditNow]);

  const requestEditAccess = async () => {
    if (!actorId || !currentUser || actorPendingRequest) return;
    const request: InventoryEditRequest = {
      id: `${Date.now()}-${actorId}`,
      requesterId: actorId,
      requesterName: actorName,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };
    setEditRequests((prev) => [request, ...prev]);
    const approvers = Array.from(new Set([itziar?.id, ...USERS.filter((u) => u.isAdmin).map((u) => u.id)].filter(Boolean) as string[]));
    await Promise.all(
      approvers.map(async (uid) => {
        try {
          await addNotification({
            userId: uid,
            type: 'action_required',
            message: `${actorName} solicita edición en Inventario Huarte.`,
          });
        } catch {
          // noop
        }
      }),
    );
    emitSuccessFeedback('Solicitud enviada. Esperando aprobación.');
  };

  const approveEditRequest = async (requestId: string) => {
    if (!currentUser) return;
    const req = editRequests.find((r) => r.id === requestId && r.status === 'pending');
    if (!req) return;
    const now = new Date();
    const expires = new Date(now.getTime() + EDIT_GRANT_HOURS * 60 * 60 * 1000);
    setEditRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: 'approved', resolvedAt: now.toISOString(), resolvedById: currentUser.id, resolvedByName: currentUser.name }
          : r,
      ),
    );
    setEditGrants((prev) => [
      ...prev.filter((g) => g.userId !== req.requesterId),
      {
        userId: req.requesterId,
        approvedById: currentUser.id,
        approvedByName: currentUser.name,
        approvedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      },
    ]);
    try {
      await addNotification({
        userId: req.requesterId,
        type: 'success',
        message: `Tu acceso de edición en Inventario Huarte fue aprobado por ${currentUser.name} (6 horas).`,
      });
    } catch {
      // noop
    }
  };

  const denyEditRequest = async (requestId: string) => {
    if (!currentUser) return;
    const req = editRequests.find((r) => r.id === requestId && r.status === 'pending');
    if (!req) return;
    const now = new Date();
    setEditRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: 'denied', resolvedAt: now.toISOString(), resolvedById: currentUser.id, resolvedByName: currentUser.name }
          : r,
      ),
    );
    try {
      await addNotification({
        userId: req.requesterId,
        type: 'warning',
        message: `Tu solicitud de edición en Inventario Huarte fue denegada por ${currentUser.name}.`,
      });
    } catch {
      // noop
    }
  };

  const canetMovimientosEffective = useMemo(() => {
    const canonicalLotForProduct = (productoRaw: string, loteRaw: string) => {
      const producto = clean(productoRaw);
      const lote = clean(loteRaw);
      if (!producto || !lote) return lote;
      const lotToken = normalizeLotToken(lote);
      const allLots = (lotes || [])
        .filter((l) => clean(l.producto) === producto)
        .map((l) => clean(l.lote))
        .filter(Boolean);
      const suffixMatches = allLots.filter((candidate) => normalizeLotToken(candidate).endsWith(lotToken));
      if (suffixMatches.length > 0) {
        const preferred = [...suffixMatches].sort((a, b) => clean(b).length - clean(a).length)[0];
        if (preferred) return preferred;
      }
      const globalLots = (lotes || []).map((l) => clean(l.lote)).filter(Boolean);
      const globalSuffix = globalLots.filter((candidate) => normalizeLotToken(candidate).endsWith(lotToken));
      if (globalSuffix.length === 1) return globalSuffix[0];
      return lote;
    };

    const direct = (canetMovimientos || [])
      .filter((m) => {
        const d = parseDate(clean(m.fecha));
        return !!d && d >= canetMovementSyncStartDate;
      })
      .map((m) => ({
        ...m,
        lote: canonicalLotForProduct(clean(m.producto), clean(m.lote)),
        source: 'canet' as const,
        origin_canet_id: toNum((m as any).origin_canet_id) || toNum(m.id),
      }));

    const mirrored = (movimientos || [])
      .filter((m) => {
        const src = clean((m as any).source).toLowerCase();
        if (src !== 'canet') return false;
        const d = parseDate(clean(m.fecha));
        return !!d && d >= canetMovementSyncStartDate;
      })
      .map((m) => ({
        ...m,
        lote: canonicalLotForProduct(clean(m.producto), clean(m.lote)),
        source: 'canet' as const,
        origin_canet_id: toNum((m as any).origin_canet_id) || toNum(m.id),
      }));

    // Prioriza la fuente directa de Canet y usa el espejo solo como respaldo.
    const merged = new Map<number, Movement>();
    direct.forEach((m) => merged.set(toNum((m as any).origin_canet_id) || toNum(m.id), m));
    mirrored.forEach((m) => {
      const key = toNum((m as any).origin_canet_id) || toNum(m.id);
      if (!merged.has(key)) merged.set(key, m);
    });

    return Array.from(merged.values()).sort(
      (a, b) => (parseDate(clean(b.fecha))?.getTime() || 0) - (parseDate(clean(a.fecha))?.getTime() || 0),
    );
  }, [movimientos, canetMovimientos, canetMovementSyncStartDate, lotes]);

  const canetTransferAutoInMovements = useMemo(() => {
    const isTransfer = (v: unknown) => normalizeSearch(v).includes('traspaso');

    return canetMovimientosEffective
      .filter((m) => isTransfer(m.tipo_movimiento))
      .filter((m) => isHuarteAlias(m.destino) || isHuarteAlias(m.cliente))
      .filter((m) => !isHuarteAlias(m.bodega))
      .map((m) => {
        const qty = Math.abs(toNum(m.cantidad_signed || m.cantidad));
        const baseId = toNum((m as any).origin_canet_id) || toNum(m.id);
        return {
          ...m,
          id: -1_000_000_000 - baseId,
          bodega: 'HUARTE',
          tipo_movimiento: clean(m.tipo_movimiento) || 'traspaso',
          cliente: clean(m.bodega) || 'CANET',
          destino: 'HUARTE',
          cantidad: qty,
          cantidad_signed: qty,
          signo: 1,
          source: 'canet_auto_in',
          notas: clean(m.notas)
            ? `${clean(m.notas)} · Auto entrada por traspaso Canet→Huarte`
            : 'Auto entrada por traspaso Canet→Huarte',
        } as Movement;
      });
  }, [canetMovimientosEffective]);

  useEffect(() => {
    if (canetMovimientosLoading) return;
    const direct = (canetMovimientos || [])
      .filter((m) => {
        const d = parseDate(clean(m.fecha));
        return !!d && d >= canetMovementSyncStartDate;
      })
      .map((m) => ({
        ...m,
        source: 'canet',
        origin_canet_id: toNum((m as any).origin_canet_id) || toNum(m.id),
      }));

    const signature = (m: any) =>
      [
        String(toNum((m as any).origin_canet_id) || toNum(m.id)),
        clean(m.fecha),
        clean(m.tipo_movimiento),
        clean(m.producto),
        clean(m.lote),
        clean(m.bodega),
        String(toNum(m.cantidad_signed || m.cantidad)),
        clean(m.cliente),
        clean(m.destino),
        clean(m.notas),
      ].join('|');

    setMovimientos((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const prevCanet = base.filter((m) => clean((m as any).source).toLowerCase() === 'canet');
      const prevSig = prevCanet.map(signature).sort();
      const nextSig = direct.map(signature).sort();
      const same =
        prevSig.length === nextSig.length &&
        prevSig.every((item, idx) => item === nextSig[idx]);
      if (same) return base;

      const nonCanet = base.filter((m) => clean((m as any).source).toLowerCase() !== 'canet');
      return [...direct, ...nonCanet];
    });
  }, [canetMovimientos, canetMovementSyncStartDate, setMovimientos, canetMovimientosLoading]);

  const integratedMovements = useMemo(() => {
    const own = (movimientos || []).map((m) => ({ ...m, source: m.source || 'facturacion' }));
    return [
      ...canetMovimientosEffective,
      ...canetTransferAutoInMovements,
      ...own.filter((m) => {
        const src = clean(m.source).toLowerCase();
        return src !== 'canet' && src !== 'canet_auto_in';
      }),
    ];
  }, [movimientos, canetMovimientosEffective, canetTransferAutoInMovements]);

  const monthSortedMovements = useMemo(() => {
    return [...integratedMovements].sort((a, b) => {
      const da = parseDate(clean(a.fecha))?.getTime() || 0;
      const db = parseDate(clean(b.fecha))?.getTime() || 0;
      return db - da;
    });
  }, [integratedMovements]);

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    monthSortedMovements.forEach((m) => {
      const d = parseDate(clean(m.fecha));
      if (d) keys.add(monthKeyFromDate(d));
    });
    return Array.from(keys).sort();
  }, [monthSortedMovements]);

  const productOptions = useMemo(
    () =>
      Array.from(new Set(productos.map((p) => clean(p.producto)).filter((p) => p && p.toLowerCase() !== 'producto'))).sort(),
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
  const lotOptions = useMemo(() => {
    const all = Array.from(new Set(lotes.map((l) => clean(l.lote)).filter(Boolean))).sort();
    if (selectedProducts.length === 0) return all;
    return all.filter((lot) => lotes.some((l) => clean(l.lote) === lot && selectedProducts.includes(clean(l.producto))));
  }, [lotes, selectedProducts]);
  const warehouseOptions = useMemo(() => Array.from(new Set(bodegas.map((b) => clean(b.bodega)).filter(Boolean))).sort(), [bodegas]);
  const typeOptions = useMemo(() => Array.from(new Set(tipos.map((t) => clean(t.tipo_movimiento)).filter(Boolean))).sort(), [tipos]);
  const clientOptions = useMemo(() => Array.from(new Set(clientes.map((c) => clean(c.cliente)).filter(Boolean))).sort(), [clientes]);

  const movementPassesFilters = (m: Movement, includeMonth = true) => {
    if (includeMonth && monthFilter) {
      const d = parseDate(clean(m.fecha));
      if (!d || monthKeyFromDate(d) !== monthFilter) return false;
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

  const filteredMovements = useMemo(() => monthSortedMovements.filter((m) => movementPassesFilters(m, true)), [monthSortedMovements, monthFilter, selectedProducts, lotFilter, warehouseFilter, typeFilter, quickSearch]);
  const filteredMovementsForStock = useMemo(() => {
    const monthEnd = monthFilter ? monthEndFromKey(monthFilter) : null;
    return monthSortedMovements.filter((m) => {
      if (!movementPassesFilters(m, false)) return false;
      if (!monthEnd) return true;
      const d = parseDate(clean(m.fecha));
      if (!d) return false;
      return d.getTime() <= monthEnd.getTime();
    });
  }, [monthSortedMovements, monthFilter, selectedProducts, lotFilter, warehouseFilter, typeFilter, quickSearch]);
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
    const map = new Map<string, { producto: string; lote: string; bodega: string; stock: number }>();
    const ordered = [...filteredMovementsForStock].sort((a, b) => {
      const da = parseDate(clean(a.fecha))?.getTime() || 0;
      const db = parseDate(clean(b.fecha))?.getTime() || 0;
      if (da !== db) return da - db;
      return toNum(a.id) - toNum(b.id);
    });
    ordered.forEach((m) => {
      const key = `${clean(m.producto)}|${clean(m.lote)}|${clean(m.bodega)}`;
      if (!map.has(key)) {
        map.set(key, { producto: clean(m.producto), lote: clean(m.lote), bodega: clean(m.bodega), stock: 0 });
      }
      const row = map.get(key)!;
      const signed = toNum(m.cantidad_signed || toNum(m.cantidad) * (toNum(m.signo) || 1));
      row.stock = Math.max(0, row.stock + signed);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, stock: Math.max(0, toNum(r.stock)) }))
      .sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote) || a.bodega.localeCompare(b.bodega));
  }, [filteredMovementsForStock]);
  const safeControlByLot = useMemo(
    () =>
      controlByLot.map((r) => ({
        ...r,
        stock: Math.max(0, Math.round(toNum(r.stock))),
      })),
    [controlByLot],
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
    safeControlByLot.forEach((m) => {
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
  }, [safeControlByLot]);
  useEffect(() => {
    setStockSectionSelected(null);
  }, [monthFilter, selectedProducts, lotFilter, warehouseFilter, typeFilter, dashboardSection]);

  const rectificativas = useMemo(() => filteredMovements.filter((m) => {
    const t = clean(m.tipo_movimiento).toLowerCase();
    return t.includes('rectific') || t.includes('credito') || t.includes('corregir');
  }), [filteredMovements]);

  const ensamblajesMovements = useMemo(() => {
    const own = filteredMovements
      .filter((m) => m.source !== 'canet')
      .filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('ensamblaje'))
      .map((m) => ({ ...m, source: m.source || 'facturacion' }));
    const canet = canetMovimientosEffective
      .filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('ensamblaje'))
      .map((m) => ({ ...m, source: 'canet' }));
    // Evita duplicados exactos entre Canet y Huarte, priorizando Canet en la fase nueva.
    const dedup = new Map<string, Movement>();
    [...canet, ...own].forEach((m) => {
      const sig = [
        clean(m.fecha),
        clean(m.tipo_movimiento),
        clean(m.producto),
        clean(m.lote),
        clean(m.bodega),
        String(toNum(m.cantidad_signed || m.cantidad)),
      ].join('|');
      if (!dedup.has(sig)) dedup.set(sig, m);
    });
    return Array.from(dedup.values()).sort((a, b) => (parseDate(clean(b.fecha))?.getTime() || 0) - (parseDate(clean(a.fecha))?.getTime() || 0));
  }, [filteredMovements, canetMovimientosEffective]);

  const canetAssemblyIds = useMemo(
    () =>
      canetMovimientosEffective
        .filter((m) => clean(m.tipo_movimiento).toLowerCase().includes('ensamblaje'))
        .map((m) => Number(m.id))
        .filter(Number.isFinite),
    [canetMovimientosEffective],
  );
  const unseenCanetAssemblies = useMemo(() => {
    const seen = new Set<number>((canetAssembliesSeenIds || []).map((id) => Number(id)).filter(Number.isFinite));
    return canetAssemblyIds.filter((id) => !seen.has(id)).length;
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
    const totalStock = Math.max(0, controlByLot.reduce((acc, row) => acc + Math.max(0, toNum(row.stock)), 0));
    const totalMovements = filteredMovements.length;
    const totalRect = rectificativas.length;
    const activeMaster = new Set(
      lotes
        .filter((l) => clean(l.estado || 'ACTIVO').toLowerCase() !== 'cerrado')
        .map((l) => `${clean(l.producto)}|${clean(l.lote)}|${clean(l.bodega)}`),
    );
    const totalLots = safeControlByLot.filter((r) => r.stock > 0).filter((r) => activeMaster.size === 0 || activeMaster.has(`${r.producto}|${r.lote}|${r.bodega}`)).length;
    return { totalStock, totalMovements, totalRect, totalLots };
  }, [controlByLot, safeControlByLot, filteredMovements, rectificativas, lotes]);

  const stockByProductTotals = useMemo(() => {
    const map = new Map<string, number>();
    safeControlByLot.forEach((r) => {
      map.set(r.producto, (map.get(r.producto) || 0) + Math.max(0, toNum(r.stock)));
    });
    return Array.from(map.entries())
      .map(([producto, total]) => ({ producto, total: Math.max(0, toNum(total)) }))
      .sort((a, b) => b.total - a.total);
  }, [safeControlByLot]);
  const safeKpiStockTotal = useMemo(
    () => Math.max(0, Math.round(safeControlByLot.reduce((acc, r) => acc + Math.max(0, toNum(r.stock)), 0))),
    [safeControlByLot],
  );

  const activeLotsByProduct = useMemo(() => {
    const map = new Map<string, Set<string>>();
    safeControlByLot
      .filter((r) => toNum(r.stock) > 0)
      .forEach((r) => {
        if (!map.has(r.producto)) map.set(r.producto, new Set<string>());
        map.get(r.producto)!.add(r.lote);
      });
    return Array.from(map.entries())
      .map(([producto, lots]) => ({ producto, lots: lots.size }))
      .sort((a, b) => b.lots - a.lots);
  }, [safeControlByLot]);

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

  const persist = (next: Movement[]) => {
    setMovimientos(next);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_MOV, responsable: currentUser?.name || '' });
    setModalOpen(true);
  };

  const openCreateWithType = (tipo: string) => {
    setEditingId(null);
    setForm({
      ...EMPTY_MOV,
      tipo_movimiento: tipo,
      responsable: currentUser?.name || '',
    });
    setModalOpen(true);
  };

  const openEdit = (m: Movement) => {
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
    setModalOpen(true);
  };

  const saveMovement = () => {
    const qty = Math.abs(toNum(form.cantidad));
    if (!form.tipo_movimiento || !form.producto || !form.lote || !form.bodega || !qty) return;
    const producto = clean(form.producto);
    const lote = clean(form.lote);
    const bodega = clean(form.bodega);
    const lotMatch = lotes.some((l) => clean(l.producto) === producto && clean(l.lote) === lote);
    if (!lotMatch) {
      window.alert(`El lote ${lote} no corresponde al producto ${producto}. Revisa producto/lote.`);
      return;
    }
    const t = clean(form.tipo_movimiento).toLowerCase();
    let sign = 1;
    if (t.includes('venta') || t.includes('envio') || t.includes('ajuste-')) sign = -1;
    if (t.includes('nota credito')) sign = 1;
    const signedQty = qty * sign;
    const key = `${producto}|${lote}|${bodega}`;
    const base = monthSortedMovements
      .filter((m) => (editingId && m.source !== 'canet' ? m.id !== editingId : true))
      .reduce((acc, m) => {
        const mk = `${clean(m.producto)}|${clean(m.lote)}|${clean(m.bodega)}`;
        if (mk !== key) return acc;
        const currentSigned = toNum(m.cantidad_signed || toNum(m.cantidad) * (toNum(m.signo) || 1));
        return acc + currentSigned;
      }, 0);
    if (base + signedQty < 0) {
      window.alert(`Movimiento inválido: dejaría stock negativo en ${producto} · ${lote} · ${bodega}.`);
      return;
    }
    const nowIso = new Date().toISOString();
    const payload: Movement = {
      id: editingId ?? (Math.max(0, ...movimientos.map((m) => toNum(m.id))) + 1),
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
      signo: sign,
      cantidad_signed: qty * sign,
      source: editingId ? 'edited' : 'manual',
      created_at: editingId ? movimientos.find((m) => m.id === editingId)?.created_at : nowIso,
      updated_at: nowIso,
      updated_by: currentUser?.name || actorName,
    };
    if (editingId) {
      persist(movimientos.map((m) => (m.id === editingId ? payload : m)));
      emitSuccessFeedback('Movimiento actualizado con éxito.');
    } else {
      persist([payload, ...movimientos]);
      emitSuccessFeedback('Movimiento creado con éxito.');
    }
    setModalOpen(false);
  };

  const deleteMovement = (id: number) => {
    if (!window.confirm('¿Seguro que quieres eliminar este movimiento?')) return;
    persist(movimientos.filter((m) => m.id !== id));
    emitSuccessFeedback('Movimiento eliminado con éxito.');
  };

  const createProducto = () => {
    const code = clean(newProducto).toUpperCase();
    if (!code) return;
    if (productos.some((p) => clean(p.producto) === code)) return;
    setProductos((prev) => [...prev, { producto: code, activo_si_no: 'SI' }]);
    setNewProducto('');
    emitSuccessFeedback('Producto creado con éxito.');
  };

  const createLote = () => {
    const producto = clean(newLote.producto).toUpperCase();
    const lote = clean(newLote.lote).toUpperCase();
    const bodega = clean(newLote.bodega).toUpperCase();
    if (!producto || !lote || !bodega) return;
    if (lotes.some((l) => clean(l.producto) === producto && clean(l.lote) === lote && clean(l.bodega) === bodega)) return;
    setLotes((prev) => [...prev, { producto, lote, bodega, estado: clean(newLote.estado || 'ACTIVO'), fecha_alta: new Date().toISOString().slice(0, 10) }]);
    setNewLote({ producto: '', lote: '', bodega: '', estado: 'ACTIVO' });
    emitSuccessFeedback('Lote creado con éxito.');
  };

  const createTipo = () => {
    const t = clean(newTipo);
    if (!t) return;
    if (tipos.some((x) => clean(x.tipo_movimiento).toLowerCase() === t.toLowerCase())) return;
    setTipos((prev) => [...prev, { tipo_movimiento: t, afecta_stock_si_no: 'SI' }]);
    setNewTipo('');
    emitSuccessFeedback('Tipo de movimiento creado con éxito.');
  };

  const createBodega = () => {
    const b = clean(newBodega.bodega).toUpperCase();
    if (!b) return;
    if (bodegas.some((x) => clean(x.bodega).toLowerCase() === b.toLowerCase())) return;
    setBodegas((prev) => [...prev, { bodega: b, activo_si_no: clean(newBodega.activo_si_no || 'SI') }]);
    setNewBodega({ bodega: '', activo_si_no: 'SI' });
    emitSuccessFeedback('Bodega creada con éxito.');
  };

  const createCliente = () => {
    const c = clean(newCliente);
    if (!c) return;
    if (clientes.some((x) => clean(x.cliente).toLowerCase() === c.toLowerCase())) return;
    setClientes((prev) => [...prev, { cliente: c }]);
    setNewCliente('');
    emitSuccessFeedback('Cliente creado con éxito.');
  };

  const exportPdf = (title: string, headers: string[], rows: Array<Array<string | number>>) => {
    openPrintablePdfReport({
      title,
      headers,
      rows,
      fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
      subtitle: `Generado: ${new Date().toLocaleString('es-ES')}`,
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
      subtitle: `Mes: ${monthFilter ? monthLabel(monthFilter) : 'Todos'} · Generado: ${new Date().toLocaleString('es-ES')}`,
      fileName: `inventario-huarte-gerencial-${monthFilter || 'todos'}.pdf`,
      headers: ['Indicador', 'Valor'],
      rows: summaryRows,
      signatures: ['Responsable', 'Revisión'],
    });
    openPrintablePdfReport({
      title: 'Inventario Huarte - Detalle operativo',
      subtitle: `Top ${detailRows.length} movimientos filtrados`,
      fileName: `inventario-huarte-detalle-${monthFilter || 'todos'}.pdf`,
      headers: ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Responsable', 'Última edición por', 'Última edición'],
      rows: detailRows,
    });
    emitSuccessFeedback('PDF gerencial y detalle generados.');
  };

  const limitRows = <T,>(key: string, rows: T[]) => (showAllRows[key] ? rows : rows.slice(0, 6));
  const activeFilterCount = [
    selectedProducts.length > 0,
    !!lotFilter,
    !!warehouseFilter,
    !!typeFilter,
    !!quickSearch,
  ].filter(Boolean).length;

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

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-14">
      <section className="rounded-3xl border border-violet-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">Inventario Huarte</p>
            <h1 className="text-3xl font-black text-violet-950">Control de stock Huarte</h1>
            <p className="text-sm text-violet-700/80">Vista integrada con filtros, visuales y tablas operativas.</p>
            <p className="text-[10px] font-semibold text-violet-300">build {HUARTE_BUILD_TAG}</p>
          </div>
          <label className="text-xs font-semibold uppercase tracking-wider text-violet-600">
            Mes de análisis
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="mt-1 block min-w-[220px] rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              <option value="">Todos</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {accessMode !== 'unset' && (
          <div className="mt-3 flex justify-end">
            <button onClick={exportExecutivePdf} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
              <Download size={14} />
              PDF gerencial
            </button>
          </div>
        )}
      </section>

      {accessMode === 'unset' ? (
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
                <p className="text-xs text-amber-800">Requiere autorización de Itziar o administradora (vigencia de 6 horas).</p>
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
          <section className="rounded-2xl border border-violet-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setAccessMode('consult')} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${!isEditModeActive ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-100 bg-violet-50 text-violet-700'}`}>Consultar</button>
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
          </section>

          <section className="rounded-2xl border border-violet-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {tabButton('dashboard', 'Dashboard', BarChart3)}
              {tabButton('movimientos', 'Movimientos', Plus)}
              {tabButton('rectificativas', 'Rectificativas', FileWarning)}
              {tabButton('ensamblajes', 'Ensamblajes', Boxes, unseenCanetAssemblies)}
              {tabButton('maestros', 'Maestros', FolderTree)}
            </div>
          </section>
        </>
      )}

      {accessMode !== 'unset' && tab === 'dashboard' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-violet-200 bg-white p-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard title={`Stock total · ${HUARTE_BUILD_TAG}`} value={String(safeKpiStockTotal)} tone="violet" onClick={() => setStockTotalModalOpen(true)} />
              <KpiCard title="Movimientos (filtro)" value={String(dashboard.totalMovements)} tone="sky" onClick={() => setMovementTypesModalOpen(true)} />
              <KpiCard title="Rectificativas (filtro)" value={String(dashboard.totalRect)} tone="amber" onClick={() => setRectByProductModalOpen(true)} />
              <KpiCard title="Lotes activos (stock>0)" value={String(dashboard.totalLots)} tone="emerald" onClick={() => setLotsActiveModalOpen(true)} />
            </div>
            <div className="mt-2 flex justify-end">
              <button onClick={exportExecutivePdf} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
                <Download size={14} />
                PDF gerencial
              </button>
            </div>
          </div>

          {isCompact && (
            <section className="rounded-2xl border border-violet-200 bg-white p-3">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                <DashSwitch label="Stock" active={dashboardSection === 'stock'} onClick={() => setDashboardSection('stock')} icon={<Boxes size={15} />} />
                <DashSwitch label="Control lote" active={dashboardSection === 'control'} onClick={() => setDashboardSection('control')} icon={<Calculator size={15} />} />
                <DashSwitch label="Rectificativas" active={dashboardSection === 'rect'} onClick={() => setDashboardSection('rect')} icon={<FileWarning size={15} />} />
                <DashSwitch label="Ventas anual" active={dashboardSection === 'ventas_anual'} onClick={() => setDashboardSection('ventas_anual')} icon={<BarChart3 size={15} />} />
                <DashSwitch label="Envíos mes" active={dashboardSection === 'envios_mes'} onClick={() => setDashboardSection('envios_mes')} icon={<BarChart3 size={15} />} />
                <DashSwitch label="Ensamblajes anual" active={dashboardSection === 'ensam_anual'} onClick={() => setDashboardSection('ensam_anual')} icon={<BarChart3 size={15} />} />
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

          {(!isCompact || dashboardSection === 'stock') && (
            <Panel
              title={`Stock por producto/lote/bodega · ${HUARTE_BUILD_TAG}`}
              onDownload={() =>
                exportPdf(
                  'Inventario Facturacion - Stock por Lote',
                  ['Producto', 'Lote', 'Bodega', 'Stock'],
                  safeControlByLot.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
                )
              }
              actions={safeControlByLot.length > 6 ? <ToggleMore k="stock" showAllRows={showAllRows} setShowAllRows={setShowAllRows} /> : undefined}
            >
              <DataTable
                headers={['Producto', 'Lote', 'Bodega', 'Stock']}
                rows={limitRows('stock', safeControlByLot).map((r, idx) => [
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

          {(!isCompact || dashboardSection === 'control') && (
            <Panel
              title={`Control por lote${monthFilter ? ` · ${monthLabel(monthFilter)}` : ''}`}
              onDownload={() =>
                exportPdf(
                  'Inventario Facturacion - Control por lote',
                  ['Producto', 'Lote', 'Bodega', 'Stock calculado'],
                  safeControlByLot.map((r) => [r.producto, r.lote, r.bodega, r.stock]),
                )
              }
            >
              <DataTable
                headers={['Producto', 'Lote', 'Bodega', 'Stock calculado']}
                rows={safeControlByLot.map((r, idx) => [
                  <ProductPill key={`h-control-${idx}-${r.producto}-${r.lote}`} code={r.producto} colorMap={productColorMap} />,
                  r.lote,
                  r.bodega,
                  r.stock,
                ])}
              />
            </Panel>
          )}

          {(!isCompact || dashboardSection === 'rect') && (
            <Panel
              title="Rectificativas recientes"
              onDownload={() => exportPdf('Inventario Facturacion - Rectificativas', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Factura/Doc'], rectificativas.map((r) => [displayDate(r.fecha), r.tipo_movimiento, r.producto, r.lote, r.bodega, r.cantidad_signed || r.cantidad, r.factura_doc || '']))}
              actions={rectificativas.length > 6 ? <ToggleMore k="rect" showAllRows={showAllRows} setShowAllRows={setShowAllRows} /> : undefined}
            >
              <DataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Factura/Doc']} rows={limitRows('rect', rectificativas).map((r, idx) => [displayDate(r.fecha), r.tipo_movimiento, <ProductPill key={`h-rect-${idx}-${r.producto}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.cantidad_signed || r.cantidad, r.factura_doc || ''])} />
            </Panel>
          )}

          {(!isCompact || dashboardSection === 'ventas_anual') && (
            <Panel title="Ventas anuales" onDownload={() => exportPdf('Inventario Facturacion - Ventas anuales', ['Año', 'Cantidad'], ventasAnuales.map(([y, q]) => [y, q]))}>
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

          {(!isCompact || dashboardSection === 'envios_mes') && (
            <Panel title="Envíos mensuales" onDownload={() => exportPdf('Inventario Facturacion - Envios mensuales', ['Mes', 'Cantidad'], enviosMensuales.map(([m, q]) => [monthLabel(m), q]))}>
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

          {(!isCompact || dashboardSection === 'ensam_anual') && (
            <Panel title="Ensamblajes anuales" onDownload={() => exportPdf('Inventario Facturacion - Ensamblajes anuales', ['Año', 'Cantidad'], ensamblajesAnuales.map(([y, q]) => [y, q]))}>
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

      {accessMode !== 'unset' && tab !== 'dashboard' && (
        <section className="rounded-2xl border border-violet-200 bg-white p-3">
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
              <AutocompleteFilter label="Bodega" value={warehouseFilter} onChange={setWarehouseFilter} options={warehouseOptions} />
              <AutocompleteFilter label="Tipo" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
              <TextFilter label="Búsqueda rápida" value={quickSearch} onChange={setQuickSearch} placeholder="producto, lote, factura..." />
            </div>
          )}
          {[selectedProducts.length > 0, lotFilter, warehouseFilter, typeFilter, quickSearch].some(Boolean) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedProducts.map((p) => <button key={`pp-${p}`} onClick={() => removeSelectedProduct(p)} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Producto: {p} ×</button>)}
              {lotFilter && <button onClick={() => setLotFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Lote: {lotFilter} ×</button>}
              {warehouseFilter && <button onClick={() => setWarehouseFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Bodega: {warehouseFilter} ×</button>}
              {typeFilter && <button onClick={() => setTypeFilter('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Tipo: {typeFilter} ×</button>}
              {quickSearch && <button onClick={() => setQuickSearch('')} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Buscar: {quickSearch} ×</button>}
            </div>
          )}
        </section>
      )}

      {accessMode !== 'unset' && tab === 'movimientos' && (
        <Panel
          title="Movimientos"
          actions={
            <div className="flex items-center gap-2">
              <button onClick={() => exportPdf('Inventario Facturacion - Movimientos', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Factura/Doc', 'Responsable', 'Fuente'], filteredMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed || m.cantidad, m.bodega, m.cliente || '', m.factura_doc || '', m.responsable || '', m.source === 'canet' ? 'Inventario Canet' : m.source === 'canet_auto_in' ? 'Auto entrada Huarte' : 'Inventario/Facturación']))} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
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
            headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Factura/Doc', 'Responsable', 'Fuente', 'Últ. edición', 'Acciones']}
            rows={visibleMovementsLast7Days.map((m) => [
              displayDate(m.fecha),
              m.tipo_movimiento,
              <ProductPill key={`h-mov-${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />,
              m.lote,
              m.cantidad_signed || m.cantidad,
              m.bodega,
              m.cliente || '',
              m.factura_doc || '',
              m.responsable || '',
              m.source === 'canet' ? 'Inventario Canet' : m.source === 'canet_auto_in' ? 'Auto entrada Huarte' : 'Inventario/Facturación',
              `${m.updated_by || '-'} ${m.updated_at ? `· ${new Date(m.updated_at).toLocaleDateString('es-ES')}` : ''}`,
              canEdit && m.source !== 'canet' && m.source !== 'canet_auto_in' ? (
                <div className="flex items-center gap-1" key={`a-${m.id}`}>
                  <button onClick={() => openEdit(m)} className="rounded-lg border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><Save size={13} /></button>
                  <button onClick={() => deleteMovement(m.id)} className="rounded-lg border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"><Trash2 size={13} /></button>
                </div>
              ) : '-',
            ])}
          />
        </Panel>
      )}

      {accessMode !== 'unset' && tab === 'rectificativas' && (
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
            onDownload={() => exportPdf('Inventario Facturacion - Rectificativas detalle', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Factura/Doc', 'Responsable'], rectificativas.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.motivo || '', m.factura_doc || '', m.responsable || '']))}
          >
            <DataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Factura/Doc', 'Responsable', 'Últ. edición', 'Acciones']} rows={rectificativas.map((m) => [displayDate(m.fecha), m.tipo_movimiento, <ProductPill key={`h-r2-${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.motivo || '', m.factura_doc || '', m.responsable || '', `${m.updated_by || '-'} ${m.updated_at ? `· ${new Date(m.updated_at).toLocaleDateString('es-ES')}` : ''}`, canEdit ? <div key={`rr-${m.id}`} className="flex items-center gap-1"><button onClick={() => openEdit(m)} className="rounded-lg border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><Save size={13} /></button><button onClick={() => deleteMovement(m.id)} className="rounded-lg border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"><Trash2 size={13} /></button></div> : '-'])} />
          </Panel>
          <Panel title="Auditoría de rectificativas" onDownload={() => exportPdf('Inventario Facturacion - Audit rectificativas', ['Fecha', 'Tipo', 'Factura', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Responsable'], rectAudit.map((r) => [r.fecha, r.tipo, r.factura, r.producto, r.lote, r.bodega, r.cantidad, r.motivo, r.responsable]))}>
            <DataTable headers={['Fecha', 'Tipo', 'Factura', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Motivo', 'Responsable']} rows={rectAudit.map((r, idx) => [r.fecha, r.tipo, r.factura, <ProductPill key={`h-ra-${idx}-${r.producto}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.cantidad, r.motivo, r.responsable])} />
          </Panel>
        </section>
      )}

      {accessMode !== 'unset' && tab === 'ensamblajes' && (
        <section className="space-y-3">
          <Panel
            title="Ensamblajes registrados por movimiento"
            actions={canEdit ? <button onClick={() => openCreateWithType('ensamblaje_esp')} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Nuevo ensamblaje</button> : undefined}
            onDownload={() => exportPdf('Inventario Facturacion - Ensamblajes', ['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Fuente'], ensamblajesMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, m.producto, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.source || '']))}
          >
            <DataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Fuente', 'Acciones']} rows={ensamblajesMovements.map((m) => [displayDate(m.fecha), m.tipo_movimiento, <ProductPill key={`h-ens-${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />, m.lote, m.bodega, m.cantidad_signed || m.cantidad, m.source === 'canet' ? 'Inventario Canet' : 'Inventario/Facturación', canEdit && m.source !== 'canet' ? <div key={`ee-${m.id}`} className="flex items-center gap-1"><button onClick={() => openEdit(m)} className="rounded-lg border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><Save size={13} /></button><button onClick={() => deleteMovement(m.id)} className="rounded-lg border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"><Trash2 size={13} /></button></div> : '-'])} />
          </Panel>

          <Panel title="Archivos de ensamblaje importados (fase 0)">
            <DataTable headers={['Archivo', 'Tipo', 'Total hojas', 'Hojas detectadas']} rows={ensamblajesArchivos.map((a) => [clean(a.archivo), clean(a.tipo), clean(a.total_hojas), Array.isArray(a.hojas) ? a.hojas.join(', ') : ''])} />
          </Panel>
        </section>
      )}

      {accessMode !== 'unset' && tab === 'maestros' && (
        <section className="space-y-3">
          <section className="rounded-2xl border border-violet-200 bg-white p-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <DashSwitch label="Productos" active={masterSection === 'productos'} onClick={() => setMasterSection('productos')} icon={<Boxes size={15} />} />
              <DashSwitch label="Lotes" active={masterSection === 'lotes'} onClick={() => setMasterSection('lotes')} icon={<FolderTree size={15} />} />
              <DashSwitch label="Bodegas" active={masterSection === 'bodegas'} onClick={() => setMasterSection('bodegas')} icon={<Calculator size={15} />} />
              <DashSwitch label="Tipos" active={masterSection === 'tipos'} onClick={() => setMasterSection('tipos')} icon={<FileWarning size={15} />} />
              <DashSwitch label="Clientes" active={masterSection === 'clientes'} onClick={() => setMasterSection('clientes')} icon={<BarChart3 size={15} />} />
            </div>
          </section>

          {masterSection === 'productos' && (
            <Panel
              title="Productos"
              actions={
                canEdit ? (
                  <div className="flex items-center gap-2">
                    <input value={newProducto} onChange={(e) => setNewProducto(e.target.value)} placeholder="Nuevo producto" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <button onClick={createProducto} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Agregar</button>
                  </div>
                ) : undefined
              }
            >
              <DataTable
                headers={['Producto', 'Activo']}
                rows={limitRows('maestros_productos', productos.filter((p) => clean(p.producto).toLowerCase() !== 'producto')).map((p, idx) => [<ProductPill key={`h-pm-${idx}-${clean(p.producto)}`} code={clean(p.producto)} colorMap={productColorMap} />, clean(p.activo_si_no || 'SI')])}
              />
              {productos.filter((p) => clean(p.producto).toLowerCase() !== 'producto').length > 6 && (
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
                  <div className="grid grid-cols-4 gap-1">
                    <input value={newLote.producto} onChange={(e) => setNewLote((s) => ({ ...s, producto: e.target.value.toUpperCase() }))} placeholder="Producto" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <input value={newLote.lote} onChange={(e) => setNewLote((s) => ({ ...s, lote: e.target.value.toUpperCase() }))} placeholder="Lote" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <input value={newLote.bodega} onChange={(e) => setNewLote((s) => ({ ...s, bodega: e.target.value.toUpperCase() }))} placeholder="Bodega" className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs font-semibold" />
                    <button onClick={createLote} className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700">Agregar</button>
                  </div>
                ) : undefined
              }
            >
              <DataTable headers={['Producto', 'Lote', 'Bodega', 'Estado', 'Fecha alta']} rows={limitRows('maestros_lotes', lotes).map((l, idx) => [<ProductPill key={`h-lm-${idx}-${clean(l.producto)}-${clean(l.lote)}`} code={clean(l.producto)} colorMap={productColorMap} />, clean(l.lote), clean(l.bodega), clean(l.estado || 'ACTIVO'), clean(l.fecha_alta || '')])} />
              {lotes.length > 6 && (
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
              <DataTable headers={['Bodega', 'Activo']} rows={limitRows('maestros_bodegas', bodegas).map((b) => [clean(b.bodega), clean(b.activo_si_no || 'SI')])} />
              {bodegas.length > 6 && (
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
              <DataTable headers={['Cliente']} rows={limitRows('maestros_clientes', clientes).map((c) => [clean(c.cliente)])} />
              {clientes.length > 6 && (
                <div className="mt-2">
                  <ToggleMore k="maestros_clientes" showAllRows={showAllRows} setShowAllRows={setShowAllRows} />
                </div>
              )}
            </Panel>
          )}
        </section>
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
          <div className="app-modal-panel w-full max-w-3xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-violet-950">{editingId ? 'Editar movimiento' : 'Nuevo movimiento'}</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-full border border-violet-200 p-1 text-violet-700 hover:bg-violet-50"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Fecha" value={form.fecha} onChange={(v) => setForm((s) => ({ ...s, fecha: v }))} />
              <AutocompleteInput label="Tipo movimiento" value={form.tipo_movimiento} onChange={(v) => setForm((s) => ({ ...s, tipo_movimiento: v }))} options={typeOptions} />
              <AutocompleteInput label="Producto" value={form.producto} onChange={(v) => setForm((s) => ({ ...s, producto: v.toUpperCase() }))} options={productOptions} />
              <AutocompleteInput label="Lote" value={form.lote} onChange={(v) => setForm((s) => ({ ...s, lote: v.toUpperCase() }))} options={lotOptions} />
              <Input label="Cantidad" value={form.cantidad} onChange={(v) => setForm((s) => ({ ...s, cantidad: v }))} />
              <AutocompleteInput label="Bodega" value={form.bodega} onChange={(v) => setForm((s) => ({ ...s, bodega: v.toUpperCase() }))} options={warehouseOptions} />
              <AutocompleteInput label="Cliente" value={form.cliente} onChange={(v) => setForm((s) => ({ ...s, cliente: v }))} options={clientOptions} />
              <Input label="Destino" value={form.destino} onChange={(v) => setForm((s) => ({ ...s, destino: v }))} />
              <Input label="Factura/Doc" value={form.factura_doc} onChange={(v) => setForm((s) => ({ ...s, factura_doc: v }))} />
              <Input label="Responsable" value={form.responsable} onChange={(v) => setForm((s) => ({ ...s, responsable: v }))} />
              <Input label="Motivo" value={form.motivo} onChange={(v) => setForm((s) => ({ ...s, motivo: v }))} />
              <Input label="Notas" value={form.notas} onChange={(v) => setForm((s) => ({ ...s, notas: v }))} />
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={saveMovement} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">
                <Save size={14} />
                Guardar
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

function Panel({ title, children, actions, onDownload }: { title: string; children: React.ReactNode; actions?: React.ReactNode; onDownload?: () => void }) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-violet-950">{title}</h2>
        <div className="flex items-center gap-2">
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

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-violet-700">Vista visual de stock (top lotes)</h4>
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
      <p className="mt-2 text-[10px] font-semibold text-violet-600">Haz clic en un color para ver la bodega y cantidad.</p>
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

function AutocompleteInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
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

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-violet-200 px-2 py-2 text-sm font-semibold text-violet-900" />
    </label>
  );
}
