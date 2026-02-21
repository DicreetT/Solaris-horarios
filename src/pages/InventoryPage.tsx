import React, { useEffect, useMemo, useState } from 'react';
import seed from '../data/inventory_seed.json';
import { AlertTriangle, ArrowDownCircle, BarChart3, Building2, ClipboardList, Download, Layers3, Package, Pencil, Plus, Tags, Trash2, Users, Wrench, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import { USERS } from '../constants';
import { openPrintablePdfReport } from '../utils/pdfReport';

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
};

type GenericRow = Record<string, any>;

const clean = (v: any) => (v == null ? '' : String(v).trim());
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
  return null;
};
const monthKeyFromDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
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
const EDIT_GRANT_HOURS = 6;

const readLocalJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeLocalJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
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
  const actorIsAdmin = !!currentUser?.isAdmin;
  const actorIsAnabela = !!(currentUser && anabela && currentUser.id === anabela.id);
  const actorIsFernando = !!(currentUser && fernando && currentUser.id === fernando.id);

  const [tab, setTab] = useState<InventoryTab>('dashboard');
  const [accessMode, setAccessMode] = useState<InventoryAccessMode>('unset');
  const [editRequests, setEditRequests] = useState<InventoryEditRequest[]>(() => readLocalJson(INVENTORY_EDIT_REQUESTS_KEY, []));
  const [editGrants, setEditGrants] = useState<InventoryEditGrant[]>(() => readLocalJson(INVENTORY_EDIT_GRANTS_KEY, []));
  const [auditLog, setAuditLog] = useState<InventoryAuditEntry[]>(() => readLocalJson(INVENTORY_AUDIT_KEY, []));

  const [movimientos, setMovimientos] = useState<Movement[]>(seed.movimientos as Movement[]);
  const [productos] = useState<GenericRow[]>(seed.productos as GenericRow[]);
  const [lotes, setLotes] = useState<GenericRow[]>(seed.lotes as GenericRow[]);
  const [bodegas, setBodegas] = useState<GenericRow[]>(seed.bodegas as GenericRow[]);
  const [clientes, setClientes] = useState<GenericRow[]>(seed.clientes as GenericRow[]);
  const [tipos, setTipos] = useState<GenericRow[]>(seed.tipos_movimiento as GenericRow[]);

  const [monthFilter, setMonthFilter] = useState<string>('');
  const [productFilter, setProductFilter] = useState<string>('');
  const [lotFilter, setLotFilter] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');

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
  const [riskModalOpen, setRiskModalOpen] = useState(false);

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

  const canApproveRequests = actorIsAdmin || actorIsAnabela;
  const canEditByDefault = actorIsAdmin || actorIsAnabela || actorIsFernando;

  const normalizedActiveGrants = useMemo(() => {
    const nowMs = Date.now();
    return editGrants.filter((g) => new Date(g.expiresAt).getTime() > nowMs);
  }, [editGrants]);

  useEffect(() => {
    if (normalizedActiveGrants.length !== editGrants.length) {
      setEditGrants(normalizedActiveGrants);
      writeLocalJson(INVENTORY_EDIT_GRANTS_KEY, normalizedActiveGrants);
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
      writeLocalJson(INVENTORY_AUDIT_KEY, next);
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
      const color = clean(p.color_hex_opcional);
      if (code) map.set(code, isValidHexColor(color) ? color : '#7c3aed');
    }
    return map;
  }, [productos]);

  const normalizedMovements = useMemo(() => {
    return movimientos.map((m) => {
      const tipo = clean(m.tipo_movimiento);
      const qty = Math.abs(toNum(m.cantidad));
      const rowSign = toNum(m.signo);
      const sign = rowSign !== 0 ? rowSign : (signByType.get(tipo) ?? (toNum(m.cantidad_signed) < 0 ? -1 : 1));
      const hasSigned = m.cantidad_signed !== undefined && m.cantidad_signed !== null && clean(m.cantidad_signed) !== '';
      const signedFromRow = toNum(m.cantidad_signed);
      return {
        ...m,
        cantidad: qty,
        signo: sign,
        cantidad_signed: hasSigned ? signedFromRow : qty * sign,
        afecta_stock: clean(m.afecta_stock) || 'SI',
      };
    });
  }, [movimientos, signByType]);

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
    if (productFilter && clean(m.producto) !== productFilter) return false;
    if (lotFilter && clean(m.lote) !== lotFilter) return false;
    if (warehouseFilter && clean(m.bodega) !== warehouseFilter) return false;
    if (typeFilter && clean(m.tipo_movimiento) !== typeFilter) return false;
    if (clientFilter && clean(m.cliente) !== clientFilter) return false;
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
  }, [normalizedMovements, productFilter, lotFilter, warehouseFilter, typeFilter, clientFilter, monthEnd]);

  const monthMovements = useMemo(() => normalizedMovements.filter((m) => movementMatchesFilters(m, true)), [normalizedMovements, monthFilter, productFilter, lotFilter, warehouseFilter, typeFilter, clientFilter]);

  const stockByPLB = useMemo(() => {
    const map = new Map<string, { producto: string; lote: string; bodega: string; stock: number }>();
    for (const m of stockBase) {
      const key = `${clean(m.producto)}|${clean(m.lote)}|${clean(m.bodega)}`;
      if (!map.has(key)) map.set(key, { producto: clean(m.producto), lote: clean(m.lote), bodega: clean(m.bodega), stock: 0 });
      map.get(key)!.stock += toNum(m.cantidad_signed);
    }
    return Array.from(map.values()).sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote) || a.bodega.localeCompare(b.bodega));
  }, [stockBase]);

  const movementByLotDetail = useMemo(() => {
    return monthMovements
      .filter((m) => (dashMoveProduct ? clean(m.producto) === dashMoveProduct : true))
      .filter((m) => (dashMoveLot ? clean(m.lote) === dashMoveLot : true))
      .filter((m) => (dashMoveBodega ? clean(m.bodega) === dashMoveBodega : true))
      .sort((a, b) => clean(a.fecha).localeCompare(clean(b.fecha)));
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
  const lotOptions = useMemo(() => Array.from(new Set(lotes.map((l) => clean(l.lote)).filter(Boolean))).sort(), [lotes]);
  const warehouseOptions = useMemo(() => Array.from(new Set(bodegas.map((b) => clean(b.bodega)).filter(Boolean))).sort(), [bodegas]);
  const typeOptions = useMemo(() => Array.from(new Set(tipos.map((t) => clean(t.tipo_movimiento)).filter(Boolean))).sort(), [tipos]);
  const clientOptions = useMemo(() => Array.from(new Set(clientes.map((c) => clean(c.cliente)).filter(Boolean))).sort(), [clientes]);

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
      .filter((r: any) => (productFilter ? r.producto === productFilter : true))
      .sort((a: any, b: any) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote));
  }, [lotes, productos, stockByPLB, productFilter]);

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

  useEffect(() => {
    const payload = {
      updatedAt: new Date().toISOString(),
      criticalProducts: riskyProductsSummary.slice(0, 12).map((r) => ({
        producto: r.producto,
        stockTotal: Number(r.stockTotal.toFixed(2)),
        coberturaMeses: Number(r.coberturaMeses.toFixed(2)),
      })),
      caducity: caducityAlerts.slice(0, 20),
    };
    writeLocalJson(INVENTORY_ALERTS_KEY, payload);
  }, [riskyProductsSummary, caducityAlerts]);

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

  const visibleMovements = useMemo(() => (monthFilter ? monthMovements : normalizedMovements.filter((m) => movementMatchesFilters(m, false))), [monthFilter, monthMovements, normalizedMovements, productFilter, lotFilter, warehouseFilter, typeFilter, clientFilter]);

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
    writeLocalJson(INVENTORY_EDIT_REQUESTS_KEY, next);
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
    writeLocalJson(INVENTORY_EDIT_GRANTS_KEY, nextGrants);

    const nextReqs = editRequests.map((r) =>
      r.id === requestId
        ? { ...r, status: 'approved' as EditRequestStatus, resolvedAt: now.toISOString(), resolvedById: actorId, resolvedByName: actorName }
        : r,
    );
    setEditRequests(nextReqs);
    writeLocalJson(INVENTORY_EDIT_REQUESTS_KEY, nextReqs);
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
    writeLocalJson(INVENTORY_EDIT_REQUESTS_KEY, nextReqs);
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
    const sign = signByType.get(movementForm.tipo_movimiento) ?? 1;

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
      } : m));
      await notifyAnabela(`${actorName} editó un movimiento en Inventario (ID ${editingId}).`);
      appendAudit('Edición de movimiento', `ID ${editingId} · ${movementForm.tipo_movimiento} · ${movementForm.producto} ${movementForm.lote}`);
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
      };
      setMovimientos((prev) => [next, ...prev]);
      await notifyAnabela(`${actorName} creó un movimiento en Inventario: ${next.tipo_movimiento} · ${next.producto} ${next.lote}.`);
      appendAudit('Creación de movimiento', `${next.tipo_movimiento} · ${next.producto} ${next.lote} · ${next.cantidad_signed}`);
    }

    setMovementModalOpen(false);
    setEditingId(null);
  };

  const deleteMovement = async (id: number) => {
    if (!canEditNow) return;
    const ok = window.confirm('¿Estás segura de eliminar este movimiento?');
    if (!ok) return;
    setMovimientos((prev) => prev.filter((m) => m.id !== id));
    await notifyAnabela(`${actorName} eliminó un movimiento en Inventario (ID ${id}).`);
    appendAudit('Eliminación de movimiento', `ID ${id}`);
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
      setLotes((prev) =>
        prev.map((l) =>
          `${clean(l.producto)}|${clean(l.lote)}` === editingLotKey
            ? { ...l, ...lotForm, semaforo_caducidad: semaforo }
            : l,
        ),
      );
      await notifyAnabela(`${actorName} editó un lote en Inventario: ${lotForm.producto} ${lotForm.lote}.`);
      appendAudit('Edición de lote', `${lotForm.producto} ${lotForm.lote}`);
    } else {
      setLotes((prev) => [{ ...lotForm, semaforo_caducidad: semaforo }, ...prev]);
      await notifyAnabela(`${actorName} creó un lote en Inventario: ${lotForm.producto} ${lotForm.lote}.`);
      appendAudit('Creación de lote', `${lotForm.producto} ${lotForm.lote}`);
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
    setTipoForm({ tipo_movimiento: '', signo_1_1: '-1', afecta_stock_si_no: 'SI' });
    setTipoModalOpen(false);
  };

  const addClient = () => {
    if (!canEditNow) return;
    if (!newClient.trim()) return;
    setClientes((prev) => [{ cliente: newClient.trim() }, ...prev]);
    void notifyAnabela(`${actorName} creó un cliente en Inventario: ${newClient.trim()}.`);
    appendAudit('Creación de cliente', newClient.trim());
    setNewClient('');
  };

  const downloadMovements = async () => {
    const headers = ['Fecha', 'Tipo', 'Producto', 'Lote', 'Cantidad', 'Bodega', 'Cliente', 'Destino', 'Notas'];
    const rows = visibleMovements.map((m) => [m.fecha, m.tipo_movimiento, m.producto, m.lote, m.cantidad_signed ?? m.cantidad, m.bodega, m.cliente || '', m.destino || '', m.notas || '']);
    openTablePdf('Inventario - Movimientos', `inventario-movimientos-${monthFilter || 'todos'}.pdf`, headers, rows);
    await notifyAnabela(`${actorName} descargó movimientos de Inventario (${monthFilter || 'todos'}).`);
    appendAudit('Descarga PDF', `Movimientos (${monthFilter || 'todos'})`);
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

  useEffect(() => {
    if (accessMode === 'edit' && !canEditNow) {
      setAccessMode('consult');
    }
  }, [accessMode, canEditNow]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="rounded-2xl border border-violet-100 bg-white p-4 md:p-5 shadow-sm">
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
          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
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

          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
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
        <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm grid gap-2 md:grid-cols-5">
          <SelectFilter label="Producto" value={productFilter} onChange={setProductFilter} options={productOptions} />
          <SelectFilter label="Lote" value={lotFilter} onChange={setLotFilter} options={lotOptions} />
          <SelectFilter label="Bodega" value={warehouseFilter} onChange={setWarehouseFilter} options={warehouseOptions} />
          <SelectFilter label="Tipo movimiento" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
          <SelectFilter label="Cliente" value={clientFilter} onChange={setClientFilter} options={clientOptions} />
        </div>
      )}

      {accessMode !== 'unset' && tab === 'dashboard' && (
        <div className="space-y-4">
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
          </DataSection>

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
              <SelectFilter label="Lote" value={dashMoveLot} onChange={setDashMoveLot} options={lotOptions} />
              <SelectFilter label="Bodega" value={dashMoveBodega} onChange={setDashMoveBodega} options={warehouseOptions} />
            </div>
            <SimpleDataTable headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad']} rows={takeRows(movementByLotDetail, showMovesAll).map((m) => [m.fecha, m.tipo_movimiento, <ProductPill key={`${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />, m.lote, m.bodega, m.cantidad_signed || 0])} />
            {movementByLotDetail.length > 5 && (
              <ToggleRowsButton showAll={showMovesAll} onToggle={() => setShowMovesAll((v) => !v)} />
            )}
          </DataSection>

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
              <SelectFilter label="Lote" value={dashOutLot} onChange={setDashOutLot} options={lotOptions} />
            </div>
            <SimpleDataTable headers={['Producto', 'Lote', 'Bodega', 'Tipo', 'Cantidad']} rows={takeRows(outputControl, showOutputAll).map((r) => [<ProductPill key={`${r.producto}-${r.lote}-${r.tipo}`} code={r.producto} colorMap={productColorMap} />, r.lote, r.bodega, r.tipo, r.cantidad])} />
            {outputControl.length > 5 && (
              <ToggleRowsButton showAll={showOutputAll} onToggle={() => setShowOutputAll((v) => !v)} />
            )}
          </DataSection>
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
            headers={['Fecha', 'Tipo', 'Producto', 'Lote', 'Bodega', 'Cantidad', 'Cliente', 'Destino', 'Notas', 'Acciones']}
            rows={visibleMovements.map((m) => [
              m.fecha,
              m.tipo_movimiento,
              <ProductPill key={`${m.id}-${m.producto}`} code={m.producto} colorMap={productColorMap} />,
              m.lote,
              m.bodega,
              m.cantidad_signed ?? m.cantidad,
              m.cliente || '-',
              m.destino || '-',
              m.notas || '-',
              <div key={`act-${m.id}`} className="flex items-center gap-1">
                <button disabled={!isEditModeActive} onClick={() => startEdit(m)} className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Pencil size={13} /></button>
                <button disabled={!isEditModeActive} onClick={() => void deleteMovement(m.id)} className={`rounded-lg p-1.5 ${isEditModeActive ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Trash2 size={13} /></button>
              </div>,
            ])}
          />
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
          <SimpleDataTable headers={['Cliente']} rows={clientes.map((c) => [c.cliente])} />
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
          <SimpleDataTable headers={['Tipo', 'Signo', 'Afecta stock']} rows={tipos.map((t) => [t.tipo_movimiento, t.signo_1_1, t.afecta_stock_si_no])} />
        </div>
      )}

      {movementModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
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
    <section id={id} className={`rounded-2xl border p-4 shadow-sm space-y-3 ${toneMap[tone]}`}>
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
    <label className="flex flex-col gap-1 rounded-xl border border-violet-200 bg-violet-50 p-2 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-sm text-violet-900 outline-none">
        <option value="">Todos</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-violet-600">
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900 outline-none" />
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
    <div className="overflow-x-auto rounded-2xl border border-violet-100 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-violet-50 text-violet-700">
          <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-3 py-6 text-center text-sm text-violet-400">Sin datos para estos filtros.</td></tr>
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
