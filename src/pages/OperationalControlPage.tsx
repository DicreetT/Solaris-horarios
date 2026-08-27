import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AtSign,
  AlertTriangle,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Lock,
  Monitor,
  PackageCheck,
  RotateCcw,
  Save,
  Send,
  ShoppingCart,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USERS } from '../constants';
import { sharedJsonHistoryKeyFor, useSharedJsonState } from '../hooks/useSharedJsonState';
import { useInventoryMovementsDB, type InventoryMovementRow } from '../hooks/useInventoryMovementsDB';
import { useTodos } from '../hooks/useTodos';
import { supabase } from '../lib/supabase';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { getOperationalControlUrl, makeOperationalControlTag } from '../utils/taskLinks';
import { FileUploader, type Attachment } from '../components/FileUploader';
import {
  calculateInventoryStockSnapshot,
  formatInventoryWarehouseLabel,
  getInventorySignedQuantity,
} from '../utils/inventoryStock';
import canetSeed from '../data/inventory_seed.json';
import huarteSeed from '../data/inventory_facturacion_seed.json';

type ProcessKey =
  | 'entradas_canet'
  | 'traspasos_huarte'
  | 'ensamblajes'
  | 'inventario_stock'
  | 'ventas_salidas'
  | 'contabilidad'
  | 'sistemas_analytics'
  | 'estado_almacen'
  | 'cierre_comun';

type StatusKey = 'pendiente' | 'correcto' | 'revision' | 'critica';
type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'money' | 'status';

type ProcessRecord = {
  id: string;
  process: ProcessKey;
  year: number;
  month: number;
  status: StatusKey;
  reviewed: boolean;
  fields: Record<string, string>;
  checklist: Record<string, boolean>;
  attachments: Record<string, Attachment[]>;
  participantProgress?: Record<string, ParticipantProgress>;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
};

type ParticipantProgress = {
  label: string;
  savedAt?: string;
  savedBy?: string;
  savedByName?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
};

type MonthClosure = {
  id: string;
  year: number;
  month: number;
  closed: boolean;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenedByName?: string;
  archiveId?: string;
};

type OperationalMonthArchive = {
  id: string;
  year: number;
  month: number;
  monthLabel: string;
  closedAt: string;
  closedBy: string;
  closedByName: string;
  records: ProcessRecord[];
  statusCounts: Record<StatusKey, number>;
  missingAttachments: number;
  openIncidentCount: number;
};

type OperationalMonthlyState = {
  records: ProcessRecord[];
  monthClosures: MonthClosure[];
  operationalClosures?: OperationalMonthArchive[];
};

type OperationalHistorySnapshot = {
  id: string;
  savedAt: string;
  source?: 'before_remote' | 'after_save' | 'backup_non_empty';
  updatedBy?: string | null;
  payload: OperationalMonthlyState;
};

type MetricField = {
  id: string;
  label: string;
  type?: FieldType;
  hint?: string;
};

type TableDefinition = {
  id: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[];
};

type ProcessDefinition = {
  key: ProcessKey;
  index: number;
  title: string;
  shortTitle: string;
  responsible: string;
  review?: string;
  warehouse?: string;
  accounting?: string;
  users: string[];
  icon: React.ElementType;
  color: {
    text: string;
    border: string;
    soft: string;
    button: string;
    ring: string;
  };
  summary: string;
  fields?: MetricField[];
  tables?: TableDefinition[];
  checklist?: string[];
  attachments: string[];
  validations: string[];
};

type GenericRow = Record<string, any>;

type TraceabilityDossierState = {
  suppliers?: Array<{
    id: string;
    name: string;
    sanitaryRegister?: string;
    products?: Array<{ id: string; name: string; reference?: string; category?: string; unit?: string }>;
  }>;
  lots?: Array<{
    id: string;
    productName: string;
    lotNumber: string;
    quantity?: string;
    quantityUnit?: string;
    deliveryDate?: string;
    albaranNumber?: string;
    zohoPurchaseOrder?: string;
    zohoInvoiceNumber?: string;
    deliveryNoteQuantity?: string;
    calculatedBoxes?: string;
    expiryDate?: string;
    status?: string;
    entries?: Array<{
      id: string;
      supplierId: string;
      supplierProductId: string;
      deliveryDate?: string;
      albaranNumber?: string;
      solarisInvoiceNumber?: string;
      deliveryNoteQuantity?: string;
      quantity?: string;
      quantityMatchesInvoice?: string;
      quantityDifference?: string;
      quantityCheckNotes?: string;
      expiryDate?: string;
      attachments?: Record<string, Attachment[]>;
    }>;
  }>;
};

type AlbaranesState = {
  products?: Array<{
    id: string;
    name: string;
    tags?: Array<{
      id: string;
      name: string;
      documents?: Array<{
        id: string;
        title?: string;
        damageHistory?: Array<{
          id: string;
          quantity: number;
          kind?: 'origen' | 'envio';
          comment?: string;
          createdAt?: string;
          createdBy?: string;
          attachments?: Attachment[];
        }>;
      }>;
    }>;
  }>;
};

type LotAssemblyFinalizationEntry = {
  id: string;
  producto: string;
  lote: string;
  ensamblaje_finalizado: 'SI' | 'NO';
  updatedAt: string;
  updatedBy?: string;
};

const INVENTORY_CANET_LOT_FINALIZATIONS_KEY = 'inventory_canet_lot_finalizations_v1';

const EMPTY_STATE: OperationalMonthlyState = {
  records: [],
  monthClosures: [],
  operationalClosures: [],
};

const STATUS_META: Record<StatusKey, { label: string; short: string; dot: string; badge: string; border: string }> = {
  correcto: {
    label: 'Completado',
    short: 'Correcto',
    dot: 'bg-emerald-600',
    badge: 'bg-emerald-100 text-emerald-800',
    border: 'border-emerald-200',
  },
  revision: {
    label: 'En revisión',
    short: 'Revisión',
    dot: 'bg-amber-400',
    badge: 'bg-amber-100 text-amber-800',
    border: 'border-amber-200',
  },
  critica: {
    label: 'Incidencia',
    short: 'Crítico',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    border: 'border-red-200',
  },
  pendiente: {
    label: 'Pendiente',
    short: 'Pendiente',
    dot: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-600',
    border: 'border-slate-200',
  },
};

const DIFFERENCE_REASONS = [
  'Movimiento pendiente',
  'Traspaso pendiente',
  'Devolución',
  'Error de lectura',
  'Error del sistema',
  'Producto dañado',
  'Evolución / ajuste justificado',
  'Pendiente investigar',
  'Otro',
];

const PRODUCT_OPTIONS = [
  { code: 'SV', label: 'Solar Vital' },
  { code: 'ENT', label: 'Enterovital' },
  { code: 'AV', label: 'Aviro Vital' },
  { code: 'RG', label: 'Regenerium' },
  { code: 'ISO', label: 'Isotónico' },
  { code: 'KL', label: 'Cala' },
];

const BASE_LOTS_BY_PRODUCT: Record<string, string[]> = {
  SV: ['2511A34', '2601A35', '2602A36'],
  ENT: ['2511A20', '2603A21'],
  AV: ['2403A05', '2410A06', '2507A07'],
  RG: ['2504A04'],
  ISO: ['250932'],
  KL: ['260101'],
};

const PRODUCT_CODE_BY_LABEL = new Map(
  PRODUCT_OPTIONS.flatMap((product) => [
    [normalize(product.code), product.code],
    [normalize(product.label), product.code],
  ]),
);

const operationalProductCode = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = normalize(raw);
  return PRODUCT_CODE_BY_LABEL.get(normalized) || raw.toUpperCase();
};

const operationalLotCode = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const isLongOperationalLot = (value: string) => {
  const lot = operationalLotCode(value);
  return /^2[3-9]\d{2}A\d{2}$/.test(lot) || /^2[3-9]\d{4}$/.test(lot);
};
const isActiveOperationalLot = (row: GenericRow) => {
  const state = normalize(String(row.estado || row.activo_si_no || row.activo || 'ACTIVO'));
  return !state || (!state.includes('agotado') && !state.includes('archivado') && state !== 'no');
};
const normalizeAssemblyFinalized = (value: unknown) => {
  const token = normalize(String(value || ''));
  return token === 'si' || token === 'true' || token === '1' || token === 'finalizado';
};
const operationalLotMatches = (left: unknown, right: unknown) => {
  const a = operationalLotCode(left);
  const b = operationalLotCode(right);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
};
const numberFromControlValue = (value: unknown) => parseControlNumber(String(value || '')) || 0;
const formatControlQuantity = (value: number, decimals = 2) => {
  if (!Number.isFinite(value)) return '-';
  const rounded = Number(value.toFixed(decimals));
  return rounded.toLocaleString('es-ES', { maximumFractionDigits: decimals });
};
const traceabilityDateInMonth = (value: unknown, targetYear: number, targetMonth: number) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === targetYear && date.getMonth() + 1 === targetMonth;
};
const traceabilityFilesCount = (attachments?: Record<string, Attachment[]>) => (
  Object.values(attachments || {}).reduce((total, files) => total + (Array.isArray(files) ? files.length : 0), 0)
);
const movementDateInMonth = (movement: InventoryMovementRow, targetYear: number, targetMonth: number) => {
  const raw = String((movement as any).fecha || (movement as any).date || (movement as any).created_at || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === targetYear && date.getMonth() + 1 === targetMonth;
};
const isoDateInMonth = (value: unknown, targetYear: number, targetMonth: number) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === targetYear && date.getMonth() + 1 === targetMonth;
};

const PROCESS_DEFINITIONS: Record<ProcessKey, ProcessDefinition> = {
  entradas_canet: {
    key: 'entradas_canet',
    index: 1,
    title: 'Entradas Canet',
    shortTitle: 'Entradas',
    responsible: 'Anabela / Fernando / Heidy / Esteban',
    review: 'Esteban',
    warehouse: 'Canet',
    accounting: 'Heidy',
    users: ['anabela', 'anabella', 'fernando', 'fer', 'heidy', 'heidi', 'esteban'],
    icon: Building2,
    color: {
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      soft: 'bg-emerald-50',
      button: 'bg-emerald-700 hover:bg-emerald-800',
      ring: 'focus:ring-emerald-100 focus:border-emerald-500',
    },
    summary: 'Canet es la única bodega que recibe entradas directas de proveedor.',
    tables: [
      {
        id: 'entradas',
        title: 'Recepciones del mes',
        subtitle: 'Cada línea representa una recepción/albarán cuya entrada cae en este mes. El cierre final del lote puede ocurrir meses después.',
        columns: [
          'Producto',
          'Lote',
          'Cantidad según albarán',
          'Orden de compra Zoho',
          'Ingresó a Lunaris',
          'Cantidad recibida/verificada',
          'Factura Solaris',
          'Situación del ingreso',
          'Revisión contable',
          'Observaciones',
        ],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5', 'Línea 6'],
      },
    ],
    attachments: [
      'Informe de órdenes de compra del mes descargado desde Zoho',
      'Informe de entradas desde Lunaris',
      'Informe de proveedores del mes de contabilidad',
    ],
    validations: [
      'Cada albarán del mes debe indicar si la recepción quedó registrada en Lunaris.',
      'Si la cantidad recibida/verificada todavía no está cerrada, debe quedar como pendiente o en proceso.',
      'Contabilidad debe marcar si existe registro de pago en banco o si aún está pendiente.',
    ],
  },
  traspasos_huarte: {
    key: 'traspasos_huarte',
    index: 2,
    title: 'Traspasos',
    shortTitle: 'Traspasos',
    responsible: 'Itziar',
    review: 'Esteban',
    warehouse: 'Todas',
    users: ['itzi', 'itziar'],
    icon: PackageCheck,
    color: {
      text: 'text-amber-800',
      border: 'border-amber-200',
      soft: 'bg-amber-50',
      button: 'bg-amber-600 hover:bg-amber-700',
      ring: 'focus:ring-amber-100 focus:border-amber-500',
    },
    summary: 'Control mensual de traspasos entre bodegas registrados en Lunaris y contrastables con Zoho.',
    tables: [
      {
        id: 'traspasos',
        title: 'Traspasos entre bodegas',
        columns: [
          'Producto',
          'Lote',
          'Bodega origen',
          'Bodega destino',
          'Cantidad enviada',
          'Cantidad recibida',
          'Cantidad registrada en Zoho',
          'Cantidad registrada en Lunaris',
          'Diferencia',
          'Motivo diferencia',
          'Movimiento Lunaris',
          'Observaciones',
        ],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5', 'Línea 6'],
      },
    ],
    attachments: [
      'Informe de traspasos entre bodegas descargado desde Zoho',
      'Informe de traspasos entre bodegas descargado desde Lunaris',
    ],
    validations: [
      'Los traspasos de Zoho deben coincidir con los traspasos de Lunaris.',
      'Las cantidades enviadas desde una bodega deben coincidir con las recibidas en la bodega destino.',
    ],
  },
  ensamblajes: {
    key: 'ensamblajes',
    index: 3,
    title: 'Ensamblajes',
    shortTitle: 'Ensamblajes',
    responsible: 'Itziar / Anabela / Fernando / Esteban',
    review: 'Esteban',
    users: ['itzi', 'itziar', 'anabela', 'anabella', 'fernando', 'fer', 'esteban'],
    icon: ClipboardCheck,
    color: {
      text: 'text-teal-800',
      border: 'border-teal-200',
      soft: 'bg-teal-50',
      button: 'bg-teal-700 hover:bg-teal-800',
      ring: 'focus:ring-teal-100 focus:border-teal-500',
    },
    summary: 'Control de cajas ensambladas frente a Zoho y Lunaris.',
    tables: [
      {
        id: 'ensamblajes',
        title: 'Ensamblajes por producto y lote',
        columns: [
          'Producto ensamblado',
          'Lote',
          'Cantidad ensamblada en Zoho',
          'Cantidad ensamblada en Lunaris',
          'Cantidad dañada o perdida',
          'Diferencia',
          'Motivo diferencia',
          'Observaciones',
        ],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5'],
      },
      {
        id: 'danados_ensamblaje',
        title: 'Historial de dañados Lunaris por lote',
        subtitle: 'Resumen mensual descargado desde Albaranes para comparar pérdidas de origen o envío.',
        columns: [
          'Producto',
          'Lote',
          'Dañados origen',
          'Dañados envío',
          'Total dañados',
          'Informe Albaranes adjunto',
          'Observaciones',
        ],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5'],
      },
      {
        id: 'ensamblajes_finalizados',
        title: 'Ensamblajes finalizados',
        subtitle: 'Aparecen los lotes marcados como ensamblaje finalizado en Inventario durante este mes.',
        columns: [
          'Producto',
          'Lote',
          'Fecha finalización',
          'Cantidad albarán (viales/unid.)',
          'Cantidad caja según albarán',
          'Cantidad ensamblada Lunaris',
          'Dañados Canet origen',
          'Dañados Canet envío',
          'Dañados Huarte origen',
          'Dañados Huarte envío',
          'Total dañados',
          'Diferencia albarán vs cierre Lunaris',
          'Cantidad final según Zoho',
          'Diferencia Zoho vs Lunaris',
          'Motivo diferencia',
          'Observaciones',
        ],
        rows: ['Lote 1', 'Lote 2', 'Lote 3'],
      },
    ],
    attachments: [
      'Informe de ensamblajes descargado desde Zoho',
      'Informe de ensamblajes descargado desde Lunaris',
      'Informe del historial de dañados del mes',
    ],
    validations: [
      'Los ensamblajes de Zoho deben coincidir con los ensamblajes de Lunaris.',
      'Las cantidades ensambladas deben descontar daños o pérdidas cuando aplique.',
    ],
  },
  inventario_stock: {
    key: 'inventario_stock',
    index: 4,
    title: 'Inventario / Stock',
    shortTitle: 'Inventario',
    responsible: 'Anabela / Fernando / Itziar',
    review: 'Esteban',
    users: ['anabela', 'anabella', 'fernando', 'fer', 'itzi', 'itziar'],
    icon: FileCheck2,
    color: {
      text: 'text-red-700',
      border: 'border-red-200',
      soft: 'bg-red-50',
      button: 'bg-red-600 hover:bg-red-700',
      ring: 'focus:ring-red-100 focus:border-red-500',
    },
    summary: 'Comparación por producto, lote y bodega: Zoho, Lunaris y conteo físico.',
    tables: [
      {
        id: 'stock',
        title: 'Stock por producto, lote y bodega',
        subtitle: 'Prellenado desde el stock vivo del inventario Canet.',
        columns: [
          'Producto',
          'Lote',
          'Bodega',
          'Stock Zoho',
          'Stock Lunaris',
          'Stock físico',
          'Diferencia',
          'Motivo diferencia',
          'Observaciones',
        ],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5', 'Línea 6', 'Línea 7', 'Línea 8'],
      },
    ],
    attachments: [
      'Informe de stock por producto, lote y bodega descargado desde Zoho',
      'Informe de stock por producto, lote y bodega descargado desde Lunaris',
      'Conteo físico de Canet',
      'Conteo físico de Huarte',
    ],
    validations: [
      'Stock Zoho, stock Lunaris y stock físico deben coincidir por producto, lote y bodega.',
      'Si no coinciden, debe quedar registrado el motivo.',
    ],
  },
  ventas_salidas: {
    key: 'ventas_salidas',
    index: 5,
    title: 'Ventas / Salidas',
    shortTitle: 'Ventas',
    responsible: 'Itziar / Esteban / Anabela / Fernando / Heidy',
    review: 'Anabela cuando aplique',
    accounting: 'Heidy',
    users: ['itzi', 'itziar', 'esteban', 'anabela', 'anabella', 'fernando', 'fer', 'heidy', 'heidi'],
    icon: ShoppingCart,
    color: {
      text: 'text-violet-800',
      border: 'border-violet-200',
      soft: 'bg-violet-50',
      button: 'bg-violet-700 hover:bg-violet-800',
      ring: 'focus:ring-violet-100 focus:border-violet-500',
    },
    summary: 'Comparación de salidas por venta entre Zoho y Lunaris por producto, lote e inventario.',
    fields: [
      { id: 'ventas_mes_lunaris', label: 'Cantidad ventas/salidas por venta del mes', type: 'number' },
      { id: 'traspasos_mes_lunaris', label: 'Cantidad traspasos del mes', type: 'number' },
      { id: 'total_salidas_mes_lunaris', label: 'Total salidas del mes', type: 'number' },
      { id: 'devoluciones_mes_lunaris', label: 'Devoluciones o rectificativas del mes' },
      { id: 'ventas_por_bodega_lunaris', label: 'Ventas por bodega en Lunaris', type: 'textarea' },
      { id: 'traspasos_por_bodega_lunaris', label: 'Traspasos por bodega en Lunaris', type: 'textarea' },
      { id: 'estado_ventas_salidas', label: 'Estado ventas vs salidas', type: 'status' },
      { id: 'comentario_ventas', label: 'Comentario de ventas/salidas', type: 'textarea' },
    ],
    tables: [
      {
        id: 'ventas_producto_lote',
        title: 'Salidas por producto, lote e inventario',
        subtitle: 'Lunaris prellena las salidas por venta/envío; Zoho se completa para comparar por línea.',
        columns: ['Producto', 'Lote', 'Inventario', 'Cantidad vendida Zoho', 'Cantidad salida Lunaris', 'Diferencia', 'Salidas revisadas por contabilidad', 'Motivo diferencia', 'Observaciones'],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5'],
      },
      {
        id: 'devoluciones_lunaris',
        title: 'Devoluciones / rectificativas detectadas en Lunaris',
        subtitle: 'Detalle de movimientos del mes que contienen devolución, rectificativa o nota crédito.',
        columns: ['Fecha', 'Producto', 'Lote', 'Inventario', 'Tipo', 'Cantidad', 'Movimiento Lunaris', 'Observaciones'],
        rows: ['Movimiento 1', 'Movimiento 2', 'Movimiento 3'],
      },
    ],
    attachments: [
      'Informe de facturas emitidas descargado desde Zoho',
      'Informe de ventas por producto y lote descargado desde Zoho',
      'Informe de salidas por venta descargado desde Lunaris',
      'Soporte de devoluciones o rectificativas del mes',
    ],
    validations: [
      'La comparación principal se revisa por producto, lote e inventario.',
      'Las cantidades vendidas en Zoho deben coincidir con las salidas por venta/envío de Lunaris.',
      'Las devoluciones o rectificativas deben quedar anotadas para explicar diferencias.',
    ],
  },
  contabilidad: {
    key: 'contabilidad',
    index: 6,
    title: 'Contabilidad',
    shortTitle: 'Contabilidad',
    responsible: 'Heidy',
    users: ['heidy', 'heidi'],
    icon: Calculator,
    color: {
      text: 'text-orange-700',
      border: 'border-orange-200',
      soft: 'bg-orange-50',
      button: 'bg-orange-600 hover:bg-orange-700',
      ring: 'focus:ring-orange-100 focus:border-orange-500',
    },
    summary: 'Conciliación mensual de facturas de proveedor, facturas cliente, Caixa, BBVA y cobros pendientes.',
    fields: [
      { id: 'facturas_proveedor_revisadas', label: 'Nº facturas proveedor revisadas', type: 'number' },
      { id: 'facturas_cliente_revisadas', label: 'Nº facturas cliente revisadas', type: 'number' },
      { id: 'deuda_clientes_zoho', label: 'Por cobrar según Zoho', type: 'money' },
      { id: 'cobros_vencidos_mas_un_mes', label: 'Cobros vencidos de más de un mes', type: 'textarea' },
      { id: 'caixa_conciliada', label: 'Caixa conciliada', type: 'status' },
      { id: 'bbva_conciliada', label: 'BBVA conciliada', type: 'status' },
      { id: 'estado_financiero', label: 'Estado financiero del mes', type: 'status' },
      { id: 'objetivo_caixa', label: 'Objetivo colchón Caixa', type: 'money' },
      { id: 'diferencia_objetivo_caixa', label: 'Diferencia frente a objetivo Caixa', type: 'money' },
      { id: 'objetivo_bbva', label: 'Objetivo colchón BBVA', type: 'money' },
      { id: 'diferencia_objetivo_bbva', label: 'Diferencia frente a objetivo BBVA', type: 'money' },
      { id: 'resultado_mes', label: 'Resultado del mes', type: 'money' },
      { id: 'comparacion_mes_anterior', label: 'Comparación con mes anterior' },
      { id: 'comentario_financiero', label: 'Comentario financiero general', type: 'textarea' },
    ],
    tables: [
      {
        id: 'cobros_pendientes',
        title: 'Cobros pendientes y vencidos',
        columns: ['Cliente', 'Factura', 'Importe pendiente', 'Vencimiento', 'Más de un mes', 'Estado', 'Observaciones'],
        rows: ['Cobro 1', 'Cobro 2', 'Cobro 3'],
      },
    ],
    attachments: [
      'Informe de facturas proveedor revisadas',
      'Informe de facturas cliente revisadas',
      'Informe de conciliación bancaria Caixa',
      'Informe de conciliación bancaria BBVA',
      'Informe de cobros vencidos',
    ],
    validations: [
      'Facturas cliente deben ser coherentes con ventas/salidas.',
      'Facturas proveedor deben ser coherentes con entradas/albaranes del dossier.',
      'Caixa y BBVA deben revisarse por separado.',
    ],
  },
  sistemas_analytics: {
    key: 'sistemas_analytics',
    index: 7,
    title: 'Sistemas / Analytics',
    shortTitle: 'Sistemas',
    responsible: 'Esteban',
    users: ['esteban'],
    icon: Monitor,
    color: {
      text: 'text-blue-800',
      border: 'border-blue-200',
      soft: 'bg-blue-50',
      button: 'bg-blue-700 hover:bg-blue-800',
      ring: 'focus:ring-blue-100 focus:border-blue-500',
    },
    summary: 'Indicadores mensuales de sistemas y datos útiles de Zoho.',
    fields: [
      { id: 'entradas_estado_sistemas', label: 'Entradas revisadas entre sistemas', type: 'status' },
      { id: 'traspasos_estado_sistemas', label: 'Traspasos revisados entre sistemas', type: 'status' },
      { id: 'ensamblajes_estado_sistemas', label: 'Ensamblajes revisados entre sistemas', type: 'status' },
      { id: 'stock_estado_sistemas', label: 'Stock revisado entre sistemas', type: 'status' },
      { id: 'ventas_estado_sistemas', label: 'Ventas revisadas entre sistemas', type: 'status' },
      { id: 'diferencias_abiertas_total', label: 'Total diferencias abiertas', type: 'number' },
      { id: 'comentario_sistemas', label: 'Comentario sistemas/analytics', type: 'textarea' },
    ],
    tables: [
      {
        id: 'indicadores_mes',
        title: 'Indicadores del mes',
        columns: ['Indicador', 'Valor Zoho', 'Valor Lunaris', 'Comentario'],
        rows: ['Producto más vendido', 'Producto menos vendido', 'Variación frente al mes anterior'],
      },
    ],
    attachments: [
      'Zoho: Informe de compras a proveedores',
      'Zoho: Informe de entradas',
      'Zoho: Informe de ensamblajes',
      'Zoho: Informe de stock por producto y lote',
      'Zoho: Informe de facturas emitidas',
      'Zoho: Informe de pedidos / envíos',
      'Zoho: Informe de ventas por producto',
      'Zoho: Informe de traspasos',
      'Lunaris: Informe de entradas',
      'Lunaris: Informe de ensamblajes',
      'Lunaris: Informe de stock por producto y lote',
      'Lunaris: Informe de salidas por venta',
      'Lunaris: Informe de traspasos',
      'Lunaris: Informe de incidencias',
    ],
    validations: [
      'Sistemas registra indicadores de Zoho que aporten contexto al cierre mensual.',
      'Las diferencias operativas se revisan en su propia sección y pasan al cierre común.',
    ],
  },
  estado_almacen: {
    key: 'estado_almacen',
    index: 8,
    title: 'Estado de almacén',
    shortTitle: 'Almacén',
    responsible: 'Anabela / Fernando / Itziar',
    users: ['anabela', 'anabella', 'fernando', 'fer', 'itzi', 'itziar'],
    icon: Building2,
    color: {
      text: 'text-lime-800',
      border: 'border-lime-200',
      soft: 'bg-lime-50',
      button: 'bg-lime-700 hover:bg-lime-800',
      ring: 'focus:ring-lime-100 focus:border-lime-500',
    },
    summary: 'Revisión mensual de limpieza, plagas, seguridad y estado general por almacén o inventario.',
    tables: [
      {
        id: 'estado_inventario_canet',
        title: 'Inventario Canet',
        columns: ['Correcto', 'Requiere atención', 'Incidencia'],
        rows: ['Limpieza y orden', 'Control de plagas', 'Seguridad en instalaciones', 'Estado general'],
      },
      {
        id: 'estado_inventario_huarte',
        title: 'Inventario Huarte',
        columns: ['Correcto', 'Requiere atención', 'Incidencia'],
        rows: ['Limpieza y orden', 'Control de plagas', 'Seguridad en instalaciones', 'Estado general'],
      },
    ],
    attachments: [
      'Evidencia de revisión de inventario Canet',
      'Evidencia de revisión de inventario Huarte',
    ],
    validations: [
      'Cada almacén o inventario debe quedar marcado como correcto, requiere atención o incidencia.',
      'Toda incidencia debe explicarse en observaciones y quedar registrada antes del cierre común.',
    ],
  },
  cierre_comun: {
    key: 'cierre_comun',
    index: 9,
    title: 'Cierre común del mes',
    shortTitle: 'Cierre',
    responsible: 'Thalia',
    users: ['thalia'],
    icon: Lock,
    color: {
      text: 'text-slate-800',
      border: 'border-slate-200',
      soft: 'bg-slate-50',
      button: 'bg-slate-900 hover:bg-slate-800',
      ring: 'focus:ring-slate-100 focus:border-slate-500',
    },
    summary: 'Resumen final visible para todos y editable solo por administración.',
    checklist: [
      'Entradas cuadran',
      'Traspasos cuadran',
      'Ensamblajes cuadran',
      'Stock cuadra',
      'Ventas cuadran',
      'Contabilidad cuadra',
      'Incidencias revisadas',
      'Incidencias abiertas registradas',
      'Compras necesarias identificadas',
      'Riesgos de stock identificados',
      'Decisiones de marketing registradas',
      'Acciones pendientes asignadas',
    ],
    fields: [
      { id: 'estado_general_mes', label: 'Estado general del mes', type: 'status' },
      { id: 'resumen_mes', label: 'Resumen del mes', type: 'textarea' },
      { id: 'incidencias_abiertas', label: 'Incidencias abiertas', type: 'textarea' },
      { id: 'decisiones_tomadas', label: 'Decisiones tomadas', type: 'textarea' },
    ],
    tables: [
      {
        id: 'acciones_pendientes',
        title: 'Acciones pendientes',
        columns: ['Acción pendiente', 'Responsable', 'Fecha límite', 'Estado'],
        rows: ['Acción 1', 'Acción 2', 'Acción 3', 'Acción 4'],
      },
    ],
    attachments: [
      'Acta/resumen del cierre operativo mensual',
      'Listado de incidencias abiertas',
      'Plan de acciones pendientes',
    ],
    validations: [
      'Al cerrar el mes, la edición normal queda bloqueada.',
      'El mes cerrado queda disponible en lectura con sus datos y adjuntos descargables.',
      'Solo administración puede reabrir un mes cerrado.',
    ],
  },
};

const PROCESS_ORDER: ProcessKey[] = [
  'entradas_canet',
  'traspasos_huarte',
  'ensamblajes',
  'inventario_stock',
  'ventas_salidas',
  'contabilidad',
  'sistemas_analytics',
  'estado_almacen',
  'cierre_comun',
];

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2026, index, 1)),
}));

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function userMatchesOperationalAlias(userName: string, alias: string) {
  const normalizedAlias = normalize(alias);
  const aliases: Record<string, string[]> = {
    anabela: ['anabela', 'anabella'],
    anabella: ['anabela', 'anabella'],
    fernando: ['fernando', 'fer'],
    fer: ['fernando', 'fer'],
    heidy: ['heidy', 'heidi'],
    heidi: ['heidy', 'heidi'],
    itzi: ['itzi', 'itziar'],
    itziar: ['itzi', 'itziar'],
  };
  const acceptedAliases = aliases[normalizedAlias] || [normalizedAlias];
  return acceptedAliases.some((item) => userName.includes(item));
}

function safeState(state: OperationalMonthlyState | undefined | null): OperationalMonthlyState {
  return {
    records: Array.isArray(state?.records) ? state.records : [],
    monthClosures: Array.isArray(state?.monthClosures) ? state.monthClosures : [],
    operationalClosures: Array.isArray(state?.operationalClosures) ? state.operationalClosures : [],
  };
}

function nonBlankFieldCount(fields?: Record<string, string>) {
  return Object.values(fields || {}).filter((value) => !isBlankFieldValue(value)).length;
}

function checkedItemCount(checklist?: Record<string, boolean>) {
  return Object.values(checklist || {}).filter(Boolean).length;
}

function attachmentCount(attachments?: Record<string, Attachment[]>) {
  return Object.values(attachments || {}).reduce((total, files) => total + (Array.isArray(files) ? files.length : 0), 0);
}

function progressCount(progress?: Record<string, ParticipantProgress>) {
  return Object.values(progress || {}).filter((item) => !!item.savedAt || !!item.reviewedAt).length;
}

function recordContentStats(record: ProcessRecord | undefined) {
  return {
    fields: nonBlankFieldCount(record?.fields),
    checks: checkedItemCount(record?.checklist),
    attachments: attachmentCount(record?.attachments),
    progress: progressCount(record?.participantProgress),
  };
}

function stateContentStats(state: OperationalMonthlyState | undefined | null, year?: number, month?: number) {
  const payload = safeState(state);
  const records = payload.records.filter((record) => {
    if (year != null && record.year !== year) return false;
    if (month != null && record.month !== month) return false;
    return true;
  });
  const stats = records.reduce(
    (acc, record) => {
      const recordStats = recordContentStats(record);
      acc.fields += recordStats.fields;
      acc.checks += recordStats.checks;
      acc.attachments += recordStats.attachments;
      acc.progress += recordStats.progress;
      return acc;
    },
    { records: records.length, fields: 0, checks: 0, attachments: 0, progress: 0 },
  );
  return {
    ...stats,
    useful:
      stats.fields + stats.checks + stats.attachments + stats.progress > 0 ||
      payload.monthClosures.length > 0 ||
      (payload.operationalClosures || []).length > 0,
  };
}

function hasUsefulOperationalContent(state: OperationalMonthlyState | undefined | null) {
  return stateContentStats(state).useful;
}

function getRecordKey(process: ProcessKey, year: number, month: number) {
  return `${year}:${month}:${process}`;
}

function getRecord(records: ProcessRecord[], process: ProcessKey, year: number, month: number) {
  const key = getRecordKey(process, year, month);
  return records.find((record) => getRecordKey(record.process, record.year, record.month) === key);
}

function getMonthClosure(closures: MonthClosure[], year: number, month: number) {
  return closures.find((closure) => closure.year === year && closure.month === month);
}

function timestampMs(value?: string) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mergeParticipantProgress(
  base?: Record<string, ParticipantProgress>,
  incoming?: Record<string, ParticipantProgress>,
) {
  const merged: Record<string, ParticipantProgress> = { ...(base || {}) };
  for (const [key, progress] of Object.entries(incoming || {})) {
    const current = merged[key];
    if (!current) {
      merged[key] = progress;
      continue;
    }
    merged[key] = {
      ...current,
      ...progress,
      savedAt: timestampMs(progress.savedAt) >= timestampMs(current.savedAt) ? progress.savedAt : current.savedAt,
      savedBy: timestampMs(progress.savedAt) >= timestampMs(current.savedAt) ? progress.savedBy : current.savedBy,
      savedByName: timestampMs(progress.savedAt) >= timestampMs(current.savedAt) ? progress.savedByName : current.savedByName,
      reviewedAt: timestampMs(progress.reviewedAt) >= timestampMs(current.reviewedAt) ? progress.reviewedAt : current.reviewedAt,
      reviewedBy: timestampMs(progress.reviewedAt) >= timestampMs(current.reviewedAt) ? progress.reviewedBy : current.reviewedBy,
      reviewedByName: timestampMs(progress.reviewedAt) >= timestampMs(current.reviewedAt) ? progress.reviewedByName : current.reviewedByName,
    };
  }
  return merged;
}

function attachmentIdentity(file: Attachment) {
  return `${file.url || ''}|${file.name || ''}|${file.size || 0}`;
}

function mergeAttachmentLists(base: Attachment[] = [], incoming: Attachment[] = []) {
  const byId = new Map<string, Attachment>();
  [...base, ...incoming].forEach((file) => {
    const id = attachmentIdentity(file);
    if (!id.trim()) return;
    byId.set(id, file);
  });
  return Array.from(byId.values());
}

function mergeAttachmentsByField(
  base?: Record<string, Attachment[]>,
  incoming?: Record<string, Attachment[]>,
) {
  const merged: Record<string, Attachment[]> = {};
  const fields = new Set([...Object.keys(base || {}), ...Object.keys(incoming || {})]);
  fields.forEach((field) => {
    merged[field] = mergeAttachmentLists(base?.[field] || [], incoming?.[field] || []);
  });
  return merged;
}

function mergeChecklist(base?: Record<string, boolean>, incoming?: Record<string, boolean>) {
  const merged: Record<string, boolean> = { ...(base || {}), ...(incoming || {}) };
  Object.entries(base || {}).forEach(([key, value]) => {
    if (value === true && incoming?.[key] !== false) merged[key] = true;
  });
  return merged;
}

function isBlankFieldValue(value: string | undefined) {
  if (value == null) return true;
  const trimmed = String(value).trim();
  return trimmed === '' || trimmed === '[]';
}

function mergeFields(base?: Record<string, string>, incoming?: Record<string, string>) {
  const merged: Record<string, string> = { ...(base || {}) };
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (!isBlankFieldValue(value) || isBlankFieldValue(merged[key])) {
      merged[key] = value;
    }
  });
  return merged;
}

function mergeOperationalControlState(remote: OperationalMonthlyState, local: OperationalMonthlyState): OperationalMonthlyState {
  const safeRemote = safeState(remote);
  const safeLocal = safeState(local);
  const records = new Map<string, ProcessRecord>();
  const upsertRecord = (record: ProcessRecord) => {
    const key = getRecordKey(record.process, record.year, record.month);
    const current = records.get(key);
    if (!current) {
      records.set(key, record);
      return;
    }
    const keepRecord = timestampMs(record.updatedAt) >= timestampMs(current.updatedAt);
    const newer = keepRecord ? record : current;
    const older = keepRecord ? current : record;
    records.set(key, {
      ...older,
      ...newer,
      fields: mergeFields(older.fields, newer.fields),
      checklist: mergeChecklist(older.checklist, newer.checklist),
      attachments: mergeAttachmentsByField(older.attachments, newer.attachments),
      participantProgress: mergeParticipantProgress(older.participantProgress, newer.participantProgress),
    });
  };
  safeRemote.records.forEach(upsertRecord);
  safeLocal.records.forEach(upsertRecord);

  const monthClosures = new Map<string, MonthClosure>();
  const upsertClosure = (closure: MonthClosure) => {
    const key = `${closure.year}:${closure.month}`;
    const current = monthClosures.get(key);
    if (!current) {
      monthClosures.set(key, closure);
      return;
    }
    const currentTs = Math.max(timestampMs(current.closedAt), timestampMs(current.reopenedAt));
    const nextTs = Math.max(timestampMs(closure.closedAt), timestampMs(closure.reopenedAt));
    monthClosures.set(key, nextTs >= currentTs ? { ...current, ...closure } : { ...closure, ...current });
  };
  safeRemote.monthClosures.forEach(upsertClosure);
  safeLocal.monthClosures.forEach(upsertClosure);

  const archives = new Map<string, OperationalMonthArchive>();
  const upsertArchive = (archive: OperationalMonthArchive) => {
    const key = `${archive.year}:${archive.month}`;
    const current = archives.get(key);
    if (!current || timestampMs(archive.closedAt) >= timestampMs(current.closedAt)) archives.set(key, archive);
  };
  (safeRemote.operationalClosures || []).forEach(upsertArchive);
  (safeLocal.operationalClosures || []).forEach(upsertArchive);

  return {
    records: Array.from(records.values()),
    monthClosures: Array.from(monthClosures.values()),
    operationalClosures: Array.from(archives.values()).sort((a, b) => (a.year === b.year ? b.month - a.month : b.year - a.year)),
  };
}

function restoreOperationalSnapshot(current: OperationalMonthlyState, snapshot: OperationalMonthlyState, userName: string): OperationalMonthlyState {
  const now = new Date().toISOString();
  const touchedSnapshot = safeState(snapshot);
  return mergeOperationalControlState(current, {
    ...touchedSnapshot,
    records: touchedSnapshot.records.map((record) => ({
      ...record,
      updatedAt: now,
      updatedByName: userName || record.updatedByName || 'Administración',
    })),
  });
}

function operationalSnapshotSignature(snapshot: OperationalHistorySnapshot) {
  const payload = safeState(snapshot.payload);
  return JSON.stringify({
    records: payload.records
      .map((record) => ({
        ...record,
        updatedAt: '',
        updatedBy: '',
        updatedByName: '',
      }))
      .sort((a, b) => getRecordKey(a.process, a.year, a.month).localeCompare(getRecordKey(b.process, b.year, b.month), 'es')),
    monthClosures: payload.monthClosures,
    operationalClosures: payload.operationalClosures || [],
  });
}

function formatDateTime(value?: string) {
  if (!value) return 'Sin guardar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin guardar';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function attachmentKey(label: string) {
  return normalize(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function attachmentFolderPath(year: number, month: number, process: ProcessKey, label: string) {
  return `control-operativo-mensual/${year}/${String(month).padStart(2, '0')}/${process}/${attachmentKey(label)}`;
}

function fieldKey(sectionId: string, row: string, column: string) {
  return `${sectionId}.${row}.${column}`;
}

function tableRowsKey(tableId: string) {
  return `__tableRows.${tableId}`;
}

function parseExtraRows(value: string | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function tableSupportsExtraRows(table: TableDefinition) {
  if (isStatusMatrix(table.columns)) return false;
  return table.columns.some((column) => {
    const normalizedColumn = normalize(column);
    return (
      normalizedColumn.includes('producto') ||
      normalizedColumn.includes('lote') ||
      normalizedColumn.includes('cantidad') ||
      normalizedColumn.includes('stock')
    );
  });
}

function tableRowHasContent(table: TableDefinition, row: string, fields: Record<string, string>) {
  return table.columns.some((column) => String(fields[fieldKey(table.id, row, column)] || '').trim());
}

function buildEntradasSummary(table: TableDefinition, rows: string[], fields: Record<string, string>) {
  const activeRows = rows.filter((row) => tableRowHasContent(table, row, fields));
  const ingresoColumn = table.columns.find((column) => normalize(column).includes('ingreso a lunaris') || normalize(column).includes('ingreso lunaris'));
  const ingresadas = ingresoColumn
    ? activeRows.filter((row) => normalize(fields[fieldKey(table.id, row, ingresoColumn)] || '') === 'ingreso').length
    : 0;
  const noIngresadas = ingresoColumn
    ? activeRows.filter((row) => normalize(fields[fieldKey(table.id, row, ingresoColumn)] || '') === 'no ingreso').length
    : 0;
  return {
    totalCompras: activeRows.length,
    ingresadas,
    noIngresadas,
    pendientes: Math.max(0, activeRows.length - ingresadas - noIngresadas),
  };
}

function canUserEditProcess(definition: ProcessDefinition, currentUserName: string, isAdmin: boolean) {
  if (isAdmin) return true;
  if (definition.key === 'cierre_comun') return false;
  return definition.users.some((userName) => currentUserName.includes(userName));
}

function splitResponsibleLabels(definition: ProcessDefinition) {
  return definition.responsible
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
}

function progressKey(label: string) {
  return normalize(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'usuario';
}

function participantLabelForCurrentUser(definition: ProcessDefinition, currentUserName: string, fallbackName: string) {
  const labels = splitResponsibleLabels(definition);
  const matched = labels.find((label) => currentUserName.includes(normalize(label)));
  return matched || fallbackName || 'Usuario';
}

function progressForLabels(record: ProcessRecord | undefined, definition: ProcessDefinition) {
  return splitResponsibleLabels(definition).map((label) => {
    const key = progressKey(label);
    return record?.participantProgress?.[key] || { label };
  });
}

function allResponsibleLabelsReviewed(record: ProcessRecord | undefined, definition: ProcessDefinition) {
  const progress = progressForLabels(record, definition);
  return progress.length > 0 && progress.every((item) => !!item.reviewedAt);
}

function hasResponsibleProgress(record: ProcessRecord | undefined) {
  return Object.values(record?.participantProgress || {}).some((item) => !!item.savedAt || !!item.reviewedAt);
}

function effectiveProcessStatus(record: ProcessRecord | undefined, definition: ProcessDefinition): StatusKey {
  if (!record) return 'pendiente';
  if (record.status === 'critica') return 'critica';
  if (allResponsibleLabelsReviewed(record, definition)) return record.status === 'revision' ? 'revision' : 'correcto';
  if (record.status === 'correcto') return hasResponsibleProgress(record) ? 'revision' : 'pendiente';
  return record.status || 'pendiente';
}

function inputType(type?: FieldType) {
  if (type === 'number' || type === 'money') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}

function ProcessStatusIcon({ status }: { status: StatusKey }) {
  if (status === 'correcto') return <CheckCircle2 size={20} />;
  if (status === 'revision') return <AlertTriangle size={20} />;
  if (status === 'critica') return <AlertTriangle size={20} />;
  return <Circle size={20} />;
}

function parseControlNumber(value: string) {
  const normalized = String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isStatusMatrix(columns: string[]) {
  const allowed = new Set(['correcto', 'requiere atencion', 'incidencia']);
  return columns.length > 0 && columns.every((column) => allowed.has(normalize(column)));
}

function renderCellInput(
  key: string,
  row: string,
  table: TableDefinition,
  column: string,
  value: string,
  otherValue: string,
  fields: Record<string, string>,
  lotOptionsByProduct: Map<string, string[]>,
  canEdit: boolean,
  setFieldValue: (key: string, value: string) => void,
  ringClass: string,
) {
  const normalizedColumn = normalize(column);
  if (normalizedColumn === 'producto' || normalizedColumn === 'producto ensamblado') {
    return (
      <select
        value={value}
        onChange={(event) => {
          setFieldValue(key, event.target.value);
          const lotColumn = table.columns.find((item) => normalize(item) === 'lote');
          if (lotColumn) setFieldValue(fieldKey(table.id, row, lotColumn), '');
        }}
        disabled={!canEdit}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
      >
        <option value="">Producto</option>
        {PRODUCT_OPTIONS.map((product) => (
          <option key={product.code} value={product.code}>{product.label} ({product.code})</option>
        ))}
      </select>
    );
  }

  if (normalizedColumn === 'lote') {
    const productColumn = table.columns.find((item) => {
      const normalized = normalize(item);
      return normalized === 'producto' || normalized === 'producto ensamblado';
    });
    const selectedProduct = productColumn ? operationalProductCode(fields[fieldKey(table.id, row, productColumn)]) : '';
    const lotOptions = selectedProduct ? lotOptionsByProduct.get(selectedProduct) || [] : [];
    const normalizedValue = operationalLotCode(value);
    const visibleLotOptions =
      normalizedValue && !lotOptions.includes(normalizedValue) ? [normalizedValue, ...lotOptions] : lotOptions;
    return (
      <select
        value={normalizedValue}
        onChange={(event) => setFieldValue(key, event.target.value)}
        disabled={!canEdit || !selectedProduct}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
      >
        <option value="">{selectedProduct ? 'Lote' : 'Selecciona producto'}</option>
        {visibleLotOptions.map((lot) => (
          <option key={lot} value={lot}>{lot}</option>
        ))}
      </select>
    );
  }

  if (normalizedColumn.includes('motivo diferencia')) {
    return (
      <div className="space-y-1">
        <select
          value={value}
          onChange={(event) => setFieldValue(key, event.target.value)}
          disabled={!canEdit}
          className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
        >
          <option value="">Seleccionar</option>
          {DIFFERENCE_REASONS.map((reason) => (
            <option key={reason} value={reason}>{reason}</option>
          ))}
        </select>
        {value === 'Otro' && (
          <input
            value={otherValue}
            onChange={(event) => setFieldValue(`${key}.otro`, event.target.value)}
            disabled={!canEdit}
            placeholder="Especificar otro motivo"
            className={`h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
          />
        )}
      </div>
    );
  }

  if (normalizedColumn.includes('ingreso a lunaris') || normalizedColumn.includes('ingreso lunaris')) {
    return (
      <select
        value={value}
        onChange={(event) => setFieldValue(key, event.target.value)}
        disabled={!canEdit}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
      >
        <option value="">Pendiente</option>
        <option value="Ingresó">Ingresó</option>
        <option value="No ingresó">No ingresó</option>
      </select>
    );
  }

  if (normalizedColumn.includes('situacion del ingreso')) {
    const situationTone = normalize(value).includes('programado')
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : normalize(value).includes('retraso') || normalize(value).includes('incidencia') || normalize(value).includes('no ingreso')
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-slate-200 bg-white text-slate-800';
    return (
      <select
        value={value}
        onChange={(event) => setFieldValue(key, event.target.value)}
        disabled={!canEdit}
        className={`h-9 w-full rounded-lg border px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50 ${situationTone}`}
      >
        <option value="">Sin clasificar</option>
        <option value="Pedido programado para entrar otro mes">Pedido programado para entrar otro mes</option>
        <option value="Retraso pendiente">Retraso pendiente</option>
        <option value="No ingresó sin justificar">No ingresó sin justificar</option>
        <option value="Incidencia de entrada">Incidencia de entrada</option>
        <option value="Revisión necesaria">Revisión necesaria</option>
      </select>
    );
  }

  if (normalizedColumn.includes('revision contable')) {
    const accountingTone = normalize(value).includes('registro de pago')
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : normalize(value).includes('aun no') || normalize(value).includes('pendiente')
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-slate-200 bg-white text-slate-800';
    return (
      <select
        value={value}
        onChange={(event) => setFieldValue(key, event.target.value)}
        disabled={!canEdit}
        className={`h-9 w-full rounded-lg border px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50 ${accountingTone}`}
      >
        <option value="">Pendiente</option>
        <option value="Registro de pago en banco">Registro de pago en banco</option>
        <option value="Aún no hay registro de pago en banco">Aún no hay registro de pago en banco</option>
        <option value="No aplica este mes">No aplica este mes</option>
      </select>
    );
  }

  if (normalizedColumn.includes('validada') || normalizedColumn.includes('estado')) {
    return (
      <select
        value={value}
        onChange={(event) => setFieldValue(key, event.target.value)}
        disabled={!canEdit}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
      >
        <option value="">Pendiente</option>
        <option value="Correcto">Correcto</option>
        <option value="Revisión necesaria">Revisión necesaria</option>
        <option value="Incidencia crítica">Incidencia crítica</option>
      </select>
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => setFieldValue(key, event.target.value)}
      disabled={!canEdit}
      className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
    />
  );
}

export default function OperationalControlPage() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const { createTodo } = useTodos(currentUser);
  const [canetMovements] = useInventoryMovementsDB('canet');
  const [huarteMovements] = useInventoryMovementsDB('huarte');
  const [canetProductos] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_productos_v1',
    (canetSeed as any).productos as GenericRow[],
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
    },
  );
  const [canetLotes] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_lotes_v1',
    (canetSeed as any).lotes as GenericRow[],
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
    },
  );
  const [huarteLotes] = useSharedJsonState<GenericRow[]>(
    'inventory_huarte_lotes_v1',
    (huarteSeed as any).lotes as GenericRow[],
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
    },
  );
  const [lotAssemblyFinalizations] = useSharedJsonState<LotAssemblyFinalizationEntry[]>(
    INVENTORY_CANET_LOT_FINALIZATIONS_KEY,
    [],
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
    },
  );
  const [traceabilityDossier] = useSharedJsonState<TraceabilityDossierState>(
    'traceability_dossier_v1',
    { suppliers: [], lots: [] },
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      preferRemoteSnapshot: true,
    },
  );
  const [albaranesState] = useSharedJsonState<AlbaranesState>(
    'albaranes_state_v1',
    { products: [] },
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      preferRemoteSnapshot: true,
    },
  );
  const today = new Date();
  const currentUserName = normalize(currentUser?.name || currentUser?.email || '');
  const isAdmin = !!currentUser?.isAdmin || currentUserName.includes('thalia');
  const [state, setState, loading] = useSharedJsonState<OperationalMonthlyState>(
    'operational_control_monthly_v2',
    EMPTY_STATE,
    {
      userId: currentUser?.id,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      mergeIncomingWithLocal: true,
      mergeStrategy: mergeOperationalControlState,
      pollIntervalMs: 8000,
      enableHistory: true,
      maxHistoryEntries: 80,
      isUsefulPayload: hasUsefulOperationalContent,
    },
  );

  const normalizedState = safeState(state);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedProcess, setSelectedProcess] = useState<ProcessKey>('inventario_stock');
  const records = normalizedState.records;
  const closures = normalizedState.monthClosures;
  const monthClosure = getMonthClosure(closures, year, month);
  const isMonthClosed = !!monthClosure?.closed;
  const activeDefinition = PROCESS_DEFINITIONS[selectedProcess];
  const currentRecord = getRecord(records, selectedProcess, year, month);
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [draftChecklist, setDraftChecklist] = useState<Record<string, boolean>>({});
  const [draftAttachments, setDraftAttachments] = useState<Record<string, Attachment[]>>({});
  const [draftStatus, setDraftStatus] = useState<StatusKey>('pendiente');
  const [draftReviewed, setDraftReviewed] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteAssigneeIds, setNoteAssigneeIds] = useState<string[]>([]);
  const [creatingNoteTask, setCreatingNoteTask] = useState(false);
  const [focusActiveCard, setFocusActiveCard] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<OperationalHistorySnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [recoveringAttachments, setRecoveringAttachments] = useState(false);

  const monthLabel = MONTHS.find((item) => item.value === month)?.label || '';
  const canEditActiveProcess = canUserEditProcess(activeDefinition, currentUserName, isAdmin) && !isMonthClosed;
  const recordsForMonth = useMemo(
    () => PROCESS_ORDER.map((process) => getRecord(records, process, year, month)).filter(Boolean) as ProcessRecord[],
    [records, year, month],
  );
  const statusCounts = PROCESS_ORDER.reduce<Record<StatusKey, number>>(
    (acc, process) => {
      const record = getRecord(records, process, year, month);
      const definition = PROCESS_DEFINITIONS[process];
      acc[effectiveProcessStatus(record, definition)] += 1;
      return acc;
    },
    { pendiente: 0, correcto: 0, revision: 0, critica: 0 },
  );
  const missingAttachments = PROCESS_ORDER.reduce((total, process) => {
    const record = getRecord(records, process, year, month);
    const definition = PROCESS_DEFINITIONS[process];
    return total + definition.attachments.filter((item) => (record?.attachments?.[item] || []).length === 0).length;
  }, 0);
  const openIncidents = recordsForMonth.filter((record) => record.status === 'critica');
  const recordsToCorrect = recordsForMonth.filter((record) => {
    if (record.process === 'cierre_comun') return false;
    if (record.status === 'revision' || record.status === 'critica') return true;
    return Object.entries(record.fields || {}).some(([key, value]) => (
      normalize(key).includes('diferencia') && !!String(value || '').trim() && String(value).trim() !== '0'
    ));
  });
  const traceabilityEntradasMonth = useMemo(() => {
    const suppliers = Array.isArray(traceabilityDossier?.suppliers) ? traceabilityDossier.suppliers : [];
    const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    return (Array.isArray(traceabilityDossier?.lots) ? traceabilityDossier.lots : [])
      .flatMap((lot) => (Array.isArray(lot.entries) ? lot.entries : []).map((entry) => {
        const supplier = supplierById.get(entry.supplierId);
        const supplierProduct = supplier?.products?.find((product) => product.id === entry.supplierProductId);
        return {
          lot,
          entry,
          supplier,
          supplierProduct,
          productCode: operationalProductCode(lot.productName),
          files: traceabilityFilesCount(entry.attachments),
        };
      }))
      .filter(({ entry }) => traceabilityDateInMonth(entry.deliveryDate, year, month))
      .sort((a, b) => String(a.entry.deliveryDate || '').localeCompare(String(b.entry.deliveryDate || '')));
  }, [traceabilityDossier, year, month]);
  const traceabilityEntradasWithDifferences = traceabilityEntradasMonth.filter(({ entry }) => (
    entry.quantityMatchesInvoice === 'no'
    || !!String(entry.quantityDifference || '').trim()
  ));
  const productMetaByCode = useMemo(() => {
    const map = new Map<string, { mode: string; vialsPerBox: number }>();
    const push = (row: GenericRow) => {
      const code = operationalProductCode(row?.producto || row?.product || row?.name);
      if (!code) return;
      const mode = normalize(String(row?.modo_stock || row?.tipo_producto || row?.mode || 'DIRECTO')).includes('ensambl')
        ? 'ENSAMBLAJE'
        : String(row?.modo_stock || row?.tipo_producto || row?.mode || 'DIRECTO').toUpperCase();
      const vialsPerBox = numberFromControlValue(row?.viales_por_caja || row?.vialsPerBox);
      map.set(code, {
        mode: mode || 'DIRECTO',
        vialsPerBox: vialsPerBox > 0 ? vialsPerBox : code === 'SV' || code === 'ENT' ? 20 : 0,
      });
    };
    ((canetSeed as any).productos as GenericRow[] || []).forEach(push);
    (Array.isArray(canetProductos) ? canetProductos : []).forEach(push);
    return map;
  }, [canetProductos]);
  const assemblyAccumulatedByLot = useMemo(() => {
    const map = new Map<string, number>();
    [...(canetMovements || []), ...(huarteMovements || [])]
      .filter((movement) => normalize(String(movement.tipo_movimiento || '')).includes('ensamblaje'))
      .forEach((movement) => {
        const product = operationalProductCode(movement.producto);
        const lot = operationalLotCode(movement.lote);
        const quantity = Math.abs(getInventorySignedQuantity(movement as any) || 0);
        if (!product || !lot || quantity <= 0) return;
        const key = `${product}::${lot}`;
        map.set(key, (map.get(key) || 0) + quantity);
      });
    return map;
  }, [canetMovements, huarteMovements]);
  const assemblyMovementsMonth = useMemo(() => (
    [...(canetMovements || []), ...(huarteMovements || [])]
      .filter((movement) => normalize(String(movement.tipo_movimiento || '')).includes('ensamblaje'))
      .filter((movement) => movementDateInMonth(movement, year, month))
      .map((movement) => ({
        id: String((movement as any).id || `${movement.fecha}-${movement.producto}-${movement.lote}-${movement.bodega}`),
        date: String((movement as any).fecha || ''),
        product: operationalProductCode(movement.producto),
        lot: operationalLotCode(movement.lote),
        warehouse: String((movement as any).bodega || '').trim() || '-',
        type: String(movement.tipo_movimiento || '').trim(),
        quantity: Math.abs(parseControlNumber(String((movement as any).cantidad_signed ?? movement.cantidad ?? '0')) || 0),
      }))
      .filter((movement) => movement.product && movement.lot && movement.quantity > 0)
  ), [canetMovements, huarteMovements, year, month]);
  const assemblySummaryRows = useMemo(() => {
    const map = new Map<string, { product: string; lot: string; warehouse: string; quantity: number; count: number }>();
    assemblyMovementsMonth.forEach((movement) => {
      const key = `${movement.product}::${movement.lot}::${movement.warehouse}`;
      const existing = map.get(key) || {
        product: movement.product,
        lot: movement.lot,
        warehouse: movement.warehouse,
        quantity: 0,
        count: 0,
      };
      existing.quantity += movement.quantity;
      existing.count += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.product.localeCompare(b.product, 'es') || a.lot.localeCompare(b.lot, 'es'));
  }, [assemblyMovementsMonth]);
  const assemblyMonthTotal = assemblySummaryRows.reduce((total, row) => total + row.quantity, 0);
  const transferSummaryRows = useMemo(() => {
    const map = new Map<string, {
      product: string;
      lot: string;
      origin: string;
      destination: string;
      sent: number;
      received: number;
      lunaris: number;
      count: number;
      sources: string[];
    }>();
    [...(canetMovements || []), ...(huarteMovements || [])]
      .filter((movement) => normalize(String(movement.tipo_movimiento || '')).includes('traspaso') || normalize(String(movement.tipo_movimiento || '')).includes('transfer'))
      .filter((movement) => movementDateInMonth(movement, year, month))
      .forEach((movement) => {
        const product = operationalProductCode(movement.producto);
        const lot = operationalLotCode(movement.lote);
        if (!product || !lot) return;
        const signed = getInventorySignedQuantity(movement as any);
        const quantity = Math.abs(signed || 0);
        if (quantity <= 0) return;
        const movementType = normalize(String(movement.tipo_movimiento || ''));
        const isIncoming = (movementType.includes('entrada') && movementType.includes('traspaso')) || signed > 0;
        const rawWarehouse = formatInventoryWarehouseLabel((movement as any).bodega || '').trim();
        const rawCounterparty = formatInventoryWarehouseLabel(
          isIncoming
            ? ((movement as any).cliente || (movement as any).destino || '')
            : ((movement as any).destino || (movement as any).cliente || ''),
        ).trim();
        const origin = isIncoming ? (rawCounterparty || '-') : (rawWarehouse || '-');
        const destination = isIncoming ? (rawWarehouse || '-') : (rawCounterparty || '-');
        const key = `${product}::${lot}::${origin}::${destination}`;
        const existing = map.get(key) || {
          product,
          lot,
          origin,
          destination,
          sent: 0,
          received: 0,
          lunaris: 0,
          count: 0,
          sources: [],
        };
        if (isIncoming) {
          existing.received += quantity;
        } else {
          existing.sent += quantity;
        }
        existing.lunaris = Math.max(existing.sent, existing.received);
        existing.count += 1;
        existing.sources.push([
          `ID ${(movement as any).id || '-'}`,
          String((movement as any).fecha || '-'),
          String((movement as any).tipo_movimiento || 'Traspaso'),
          `${origin || '-'} -> ${destination || '-'}`,
        ].join(' · '));
        map.set(key, existing);
      });
    return Array.from(map.values()).sort((a, b) => (
      a.product.localeCompare(b.product, 'es')
      || a.lot.localeCompare(b.lot, 'es')
      || a.origin.localeCompare(b.origin, 'es')
      || a.destination.localeCompare(b.destination, 'es')
    ));
  }, [canetMovements, huarteMovements, year, month]);
  const stockSummaryRows = useMemo(() => (
    calculateInventoryStockSnapshot(canetMovements as any[], {
      scope: 'canet',
      normalizeProduct: (value) => operationalProductCode(value),
      normalizeLot: (value) => operationalLotCode(value),
      excludeMirrorSources: true,
      clampNegative: true,
      round: true,
    }).positiveRows
      .map((row) => ({
        product: row.producto,
        lot: row.lote,
        warehouse: formatInventoryWarehouseLabel(row.bodega),
        stock: row.stock,
      }))
      .filter((row) => row.product && row.lot && row.warehouse && row.stock > 0)
      .sort((a, b) => (
        a.product.localeCompare(b.product, 'es')
        || a.lot.localeCompare(b.lot, 'es')
        || a.warehouse.localeCompare(b.warehouse, 'es')
      ))
  ), [canetMovements]);
  const salesExitSummaryRows = useMemo(() => {
    const map = new Map<string, {
      product: string;
      lot: string;
      inventory: string;
      quantity: number;
      documents: Set<string>;
    }>();
    const pushMovement = (movement: InventoryMovementRow, fallbackInventory: string) => {
      const type = normalize(String(movement.tipo_movimiento || ''));
      if ((!type.includes('venta') && !type.includes('envio')) || type.includes('traspaso') || type.includes('entrada')) return;
      if (!movementDateInMonth(movement, year, month)) return;
      const signed = getInventorySignedQuantity(movement as any);
      if (signed >= 0) return;
      const quantity = Math.abs(signed);
      const product = operationalProductCode(movement.producto);
      const lot = operationalLotCode(movement.lote);
      const inventory = formatInventoryWarehouseLabel((movement as any).bodega || fallbackInventory);
      if (!product || !lot || !inventory || quantity <= 0) return;
      const key = `${product}::${lot}::${inventory}`;
      const existing = map.get(key) || {
        product,
        lot,
        inventory,
        quantity: 0,
        documents: new Set<string>(),
      };
      existing.quantity += quantity;
      const documentName = String((movement as any).factura_doc || '').trim();
      if (documentName) existing.documents.add(documentName);
      map.set(key, existing);
    };

    (canetMovements || []).forEach((movement) => pushMovement(movement, 'Canet'));
    (huarteMovements || []).forEach((movement) => pushMovement(movement, 'Huarte'));

    return Array.from(map.values()).sort((a, b) => (
      a.product.localeCompare(b.product, 'es')
      || a.lot.localeCompare(b.lot, 'es')
      || a.inventory.localeCompare(b.inventory, 'es')
    ));
  }, [canetMovements, huarteMovements, year, month]);
  const returnSummaryRows = useMemo(() => (
    [...(canetMovements || []), ...(huarteMovements || [])]
      .filter((movement) => {
        if (!movementDateInMonth(movement, year, month)) return false;
        const haystack = normalize([
          movement.tipo_movimiento,
          (movement as any).destino,
          (movement as any).cliente,
          (movement as any).motivo,
          (movement as any).notas,
        ].filter(Boolean).join(' '));
        return haystack.includes('devolucion') || haystack.includes('rectificativa') || haystack.includes('nota credito');
      })
      .map((movement) => ({
        id: String((movement as any).id || ''),
        date: String((movement as any).fecha || ''),
        product: operationalProductCode(movement.producto),
        lot: operationalLotCode(movement.lote),
        inventory: formatInventoryWarehouseLabel((movement as any).bodega || ''),
        type: String(movement.tipo_movimiento || '').trim() || '-',
        quantity: Math.abs(getInventorySignedQuantity(movement as any) || 0),
        notes: String((movement as any).notas || (movement as any).motivo || '').trim(),
      }))
      .sort((a, b) => (
        a.date.localeCompare(b.date)
        || a.product.localeCompare(b.product, 'es')
        || a.lot.localeCompare(b.lot, 'es')
      ))
  ), [canetMovements, huarteMovements, year, month]);
  const returnSummary = useMemo(() => ({
    count: returnSummaryRows.length,
    quantity: returnSummaryRows.reduce((total, movement) => total + movement.quantity, 0),
  }), [returnSummaryRows]);
  const salesTotalsByWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    salesExitSummaryRows.forEach((row) => {
      map.set(row.inventory, (map.get(row.inventory) || 0) + row.quantity);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .map(([warehouse, quantity]) => `${warehouse}: ${quantity}`);
  }, [salesExitSummaryRows]);
  const transferTotalsByWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    transferSummaryRows.forEach((row) => {
      const quantity = row.sent || row.received || row.lunaris;
      if (row.origin && row.origin !== '-') map.set(row.origin, (map.get(row.origin) || 0) + quantity);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .map(([warehouse, quantity]) => `${warehouse}: ${quantity}`);
  }, [transferSummaryRows]);
  const automaticFieldValues = useMemo(() => {
    const salesTotal = salesExitSummaryRows.reduce((total, row) => total + row.quantity, 0);
    const transferTotal = transferSummaryRows.reduce((total, row) => total + (row.sent || row.received || row.lunaris), 0);
    return {
      ventas_mes_lunaris: String(salesTotal),
      traspasos_mes_lunaris: String(transferTotal),
      total_salidas_mes_lunaris: String(salesTotal + transferTotal),
      devoluciones_mes_lunaris: returnSummary.count > 0 ? `${returnSummary.count} mov. / ${returnSummary.quantity} unidades` : '0',
      ventas_por_bodega_lunaris: salesTotalsByWarehouse.join('\n') || 'Sin ventas/salidas por venta registradas.',
      traspasos_por_bodega_lunaris: transferTotalsByWarehouse.join('\n') || 'Sin traspasos registrados.',
    } as Record<string, string>;
  }, [returnSummary, salesExitSummaryRows, salesTotalsByWarehouse, transferSummaryRows, transferTotalsByWarehouse]);
  const damageSummaryRows = useMemo(() => {
    const map = new Map<string, {
      product: string;
      lot: string;
      origin: number;
      shipping: number;
      total: number;
      documents: number;
      notes: string[];
    }>();

    (Array.isArray(albaranesState?.products) ? albaranesState.products : []).forEach((product) => {
      const productCode = operationalProductCode(product.name);
      (product.tags || []).forEach((tag) => {
        const lot = operationalLotCode(tag.name);
        (tag.documents || []).forEach((document) => {
          (document.damageHistory || []).forEach((damage) => {
            if (!isoDateInMonth(damage.createdAt, year, month)) return;
            const key = `${productCode}::${lot || operationalLotCode(document.title) || 'SINLOTE'}`;
            const existing = map.get(key) || {
              product: productCode || product.name,
              lot: lot || operationalLotCode(document.title) || '-',
              origin: 0,
              shipping: 0,
              total: 0,
              documents: 0,
              notes: [],
            };
            const quantity = Math.abs(Number(damage.quantity) || 0);
            if ((damage.kind || 'origen') === 'envio') {
              existing.shipping += quantity;
            } else {
              existing.origin += quantity;
            }
            existing.total += quantity;
            existing.documents += Array.isArray(damage.attachments) ? damage.attachments.length : 0;
            if (damage.comment) existing.notes.push(String(damage.comment));
            map.set(key, existing);
          });
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => a.product.localeCompare(b.product, 'es') || a.lot.localeCompare(b.lot, 'es'));
  }, [albaranesState, year, month]);
  const damageByProductLot = useMemo(() => {
    const map = new Map<string, {
      canetOrigin: number;
      canetShipping: number;
      huarteOrigin: number;
      huarteShipping: number;
      total: number;
    }>();
    (Array.isArray(albaranesState?.products) ? albaranesState.products : []).forEach((product) => {
      const productCode = operationalProductCode(product.name);
      (product.tags || []).forEach((tag) => {
        const tagLot = operationalLotCode(tag.name);
        (tag.documents || []).forEach((document) => {
          const documentLot = operationalLotCode(document.title);
          const lot = tagLot || documentLot || 'SINLOTE';
          const key = `${productCode}::${lot}`;
          const existing = map.get(key) || {
            canetOrigin: 0,
            canetShipping: 0,
            huarteOrigin: 0,
            huarteShipping: 0,
            total: 0,
          };
          (document.damageHistory || []).forEach((damage) => {
            const quantity = Math.abs(Number(damage.quantity) || 0);
            if (quantity <= 0) return;
            const ownerText = normalize([damage.createdBy, damage.comment].filter(Boolean).join(' '));
            const isHuarte = ownerText.includes('huarte') || ownerText.includes('guarte') || ownerText.includes('itzi') || ownerText.includes('ichi');
            const isShipping = (damage.kind || 'origen') === 'envio';
            if (isHuarte && isShipping) existing.huarteShipping += quantity;
            else if (isHuarte) existing.huarteOrigin += quantity;
            else if (isShipping) existing.canetShipping += quantity;
            else existing.canetOrigin += quantity;
            existing.total += quantity;
          });
          map.set(key, existing);
        });
      });
    });
    return map;
  }, [albaranesState]);
  const finalizedAssemblyRows = useMemo(() => {
    const latest = new Map<string, {
      product: string;
      lot: string;
      finalizedAt: string;
      finalizedBy: string;
    }>();
    const upsert = (productRaw: unknown, lotRaw: unknown, finalizedRaw: unknown, finalizedAtRaw: unknown, finalizedByRaw: unknown) => {
      if (!normalizeAssemblyFinalized(finalizedRaw)) return;
      const product = operationalProductCode(productRaw);
      const lot = operationalLotCode(lotRaw);
      const finalizedAt = String(finalizedAtRaw || '').trim();
      if (!product || !lot || !traceabilityDateInMonth(finalizedAt, year, month)) return;
      const key = `${product}::${lot}`;
      const prev = latest.get(key);
      if (!prev || new Date(finalizedAt).getTime() >= new Date(prev.finalizedAt).getTime()) {
        latest.set(key, {
          product,
          lot,
          finalizedAt,
          finalizedBy: String(finalizedByRaw || '').trim(),
        });
      }
    };
    (Array.isArray(lotAssemblyFinalizations) ? lotAssemblyFinalizations : []).forEach((entry) => {
      upsert(entry.producto, entry.lote, entry.ensamblaje_finalizado, entry.updatedAt, entry.updatedBy);
    });
    (Array.isArray(canetLotes) ? canetLotes : []).forEach((lot) => {
      upsert(
        lot.producto,
        lot.lote,
        (lot as any).ensamblaje_finalizado,
        (lot as any).ensamblaje_finalizado_at || (lot as any).ensamblajeFinalizadoAt || (lot as any).assemblyFinalizedAt,
        (lot as any).updated_by || (lot as any).updatedBy,
      );
    });

    const traceLots = Array.isArray(traceabilityDossier?.lots) ? traceabilityDossier.lots : [];
    const masterLots = Array.isArray(canetLotes) ? canetLotes : [];
    const findMatchingTraceLot = (product: string, lot: string) => (
      traceLots.find((item) => operationalProductCode(item.productName) === product && operationalLotMatches(item.lotNumber, lot))
      || null
    );
    const findMatchingMasterLot = (product: string, lot: string) => (
      masterLots.find((item) => operationalProductCode(item.producto) === product && operationalLotMatches(item.lote, lot))
      || null
    );
    const findDamage = (product: string, lot: string) => {
      const exact = damageByProductLot.get(`${product}::${lot}`);
      if (exact) return exact;
      for (const [key, value] of damageByProductLot.entries()) {
        const [keyProduct, keyLot] = key.split('::');
        if (keyProduct === product && operationalLotMatches(keyLot, lot)) return value;
      }
      return { canetOrigin: 0, canetShipping: 0, huarteOrigin: 0, huarteShipping: 0, total: 0 };
    };
    const accumulatedFor = (product: string, lot: string) => {
      const exact = assemblyAccumulatedByLot.get(`${product}::${lot}`);
      if (exact !== undefined) return exact;
      for (const [key, value] of assemblyAccumulatedByLot.entries()) {
        const [keyProduct, keyLot] = key.split('::');
        if (keyProduct === product && operationalLotMatches(keyLot, lot)) return value;
      }
      return 0;
    };

    return Array.from(latest.values())
      .map((finalized) => {
        const meta = productMetaByCode.get(finalized.product) || { mode: 'DIRECTO', vialsPerBox: 0 };
        const traceLot = findMatchingTraceLot(finalized.product, finalized.lot);
        const masterLot = findMatchingMasterLot(finalized.product, finalized.lot);
        const albaranQuantity = numberFromControlValue(
          traceLot?.deliveryNoteQuantity
          || traceLot?.quantity
          || traceLot?.entries?.find((entry) => entry.deliveryNoteQuantity)?.deliveryNoteQuantity
          || (masterLot as any)?.viales_recibidos,
        );
        const albaranBoxes = numberFromControlValue(traceLot?.calculatedBoxes)
          || (meta.mode === 'ENSAMBLAJE' && meta.vialsPerBox > 0 && albaranQuantity > 0
            ? albaranQuantity / meta.vialsPerBox
            : albaranQuantity);
        const assembled = accumulatedFor(finalized.product, finalized.lot);
        const damage = findDamage(finalized.product, finalized.lot);
        const damagedAsOutputUnits = meta.mode === 'ENSAMBLAJE' && meta.vialsPerBox > 0
          ? damage.total / meta.vialsPerBox
          : damage.total;
        const albaranDifference = albaranBoxes - assembled - damagedAsOutputUnits;
        return {
          ...finalized,
          albaranQuantity,
          albaranBoxes,
          assembled,
          canetOrigin: damage.canetOrigin,
          canetShipping: damage.canetShipping,
          huarteOrigin: damage.huarteOrigin,
          huarteShipping: damage.huarteShipping,
          damageTotal: damage.total,
          albaranDifference,
        };
      })
      .sort((a, b) => a.finalizedAt.localeCompare(b.finalizedAt) || a.product.localeCompare(b.product, 'es') || a.lot.localeCompare(b.lot, 'es'));
  }, [
    assemblyAccumulatedByLot,
    canetLotes,
    damageByProductLot,
    lotAssemblyFinalizations,
    month,
    productMetaByCode,
    traceabilityDossier,
    year,
  ]);
  const automaticTableRows = useMemo(() => {
    const map = new Map<string, string[]>();
    if (assemblySummaryRows.length > 0) {
      map.set('ensamblajes', assemblySummaryRows.map((row) => `${row.product} · ${row.lot} · ${row.warehouse}`));
    }
    if (damageSummaryRows.length > 0) {
      map.set('danados_ensamblaje', damageSummaryRows.map((row) => `${row.product} · ${row.lot}`));
    }
    if (finalizedAssemblyRows.length > 0) {
      map.set('ensamblajes_finalizados', finalizedAssemblyRows.map((row) => `${row.product} · ${row.lot} · ${row.finalizedAt.slice(0, 10)}`));
    }
    if (transferSummaryRows.length > 0) {
      map.set('traspasos', transferSummaryRows.map((row) => `${row.product} · ${row.lot} · ${row.origin} → ${row.destination}`));
    }
    if (stockSummaryRows.length > 0) {
      map.set('stock', stockSummaryRows.map((row) => `${row.product} · ${row.lot} · ${row.warehouse}`));
    }
    if (salesExitSummaryRows.length > 0) {
      map.set('ventas_producto_lote', salesExitSummaryRows.map((row) => `${row.product} · ${row.lot} · ${row.inventory}`));
    }
    if (returnSummaryRows.length > 0) {
      map.set('devoluciones_lunaris', returnSummaryRows.map((row) => `${row.date || '-'} · ${row.product || '-'} · ${row.lot || '-'} · ${row.id || '-'}`));
    }
    return map;
  }, [assemblySummaryRows, damageSummaryRows, finalizedAssemblyRows, transferSummaryRows, stockSummaryRows, salesExitSummaryRows, returnSummaryRows]);
  const automaticTableValues = useMemo(() => {
    const values: Record<string, string> = {};
    assemblySummaryRows.forEach((row) => {
      const rowLabel = `${row.product} · ${row.lot} · ${row.warehouse}`;
      values[fieldKey('ensamblajes', rowLabel, 'Producto ensamblado')] = row.product;
      values[fieldKey('ensamblajes', rowLabel, 'Lote')] = row.lot;
      values[fieldKey('ensamblajes', rowLabel, 'Cantidad ensamblada en Lunaris')] = String(row.quantity);
    });
    damageSummaryRows.forEach((row) => {
      const rowLabel = `${row.product} · ${row.lot}`;
      values[fieldKey('danados_ensamblaje', rowLabel, 'Producto')] = row.product;
      values[fieldKey('danados_ensamblaje', rowLabel, 'Lote')] = row.lot;
      values[fieldKey('danados_ensamblaje', rowLabel, 'Dañados origen')] = String(row.origin);
      values[fieldKey('danados_ensamblaje', rowLabel, 'Dañados envío')] = String(row.shipping);
      values[fieldKey('danados_ensamblaje', rowLabel, 'Total dañados')] = String(row.total);
      values[fieldKey('danados_ensamblaje', rowLabel, 'Informe Albaranes adjunto')] = row.documents > 0 ? `${row.documents} evidencia(s)` : 'Sin evidencia adjunta';
    });
    finalizedAssemblyRows.forEach((row) => {
      const rowLabel = `${row.product} · ${row.lot} · ${row.finalizedAt.slice(0, 10)}`;
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Producto')] = row.product;
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Lote')] = row.lot;
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Fecha finalización')] = row.finalizedAt.slice(0, 10);
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Cantidad albarán (viales/unid.)')] = row.albaranQuantity > 0 ? formatControlQuantity(row.albaranQuantity) : '-';
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Cantidad caja según albarán')] = row.albaranBoxes > 0 ? formatControlQuantity(row.albaranBoxes) : '-';
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Cantidad ensamblada Lunaris')] = formatControlQuantity(row.assembled);
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Dañados Canet origen')] = formatControlQuantity(row.canetOrigin);
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Dañados Canet envío')] = formatControlQuantity(row.canetShipping);
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Dañados Huarte origen')] = formatControlQuantity(row.huarteOrigin);
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Dañados Huarte envío')] = formatControlQuantity(row.huarteShipping);
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Total dañados')] = formatControlQuantity(row.damageTotal);
      values[fieldKey('ensamblajes_finalizados', rowLabel, 'Diferencia albarán vs cierre Lunaris')] = formatControlQuantity(row.albaranDifference);
    });
    transferSummaryRows.forEach((row) => {
      const rowLabel = `${row.product} · ${row.lot} · ${row.origin} → ${row.destination}`;
      values[fieldKey('traspasos', rowLabel, 'Producto')] = row.product;
      values[fieldKey('traspasos', rowLabel, 'Lote')] = row.lot;
      values[fieldKey('traspasos', rowLabel, 'Bodega origen')] = row.origin;
      values[fieldKey('traspasos', rowLabel, 'Bodega destino')] = row.destination;
      values[fieldKey('traspasos', rowLabel, 'Cantidad enviada')] = row.sent ? String(row.sent) : '';
      values[fieldKey('traspasos', rowLabel, 'Cantidad recibida')] = row.received ? String(row.received) : '';
      values[fieldKey('traspasos', rowLabel, 'Cantidad registrada en Lunaris')] = String(row.lunaris);
      values[fieldKey('traspasos', rowLabel, 'Movimiento Lunaris')] = row.sources.slice(0, 3).join(' | ');
    });
    stockSummaryRows.forEach((row) => {
      const rowLabel = `${row.product} · ${row.lot} · ${row.warehouse}`;
      values[fieldKey('stock', rowLabel, 'Producto')] = row.product;
      values[fieldKey('stock', rowLabel, 'Lote')] = row.lot;
      values[fieldKey('stock', rowLabel, 'Bodega')] = row.warehouse;
      values[fieldKey('stock', rowLabel, 'Stock Lunaris')] = String(row.stock);
    });
    salesExitSummaryRows.forEach((row) => {
      const rowLabel = `${row.product} · ${row.lot} · ${row.inventory}`;
      values[fieldKey('ventas_producto_lote', rowLabel, 'Producto')] = row.product;
      values[fieldKey('ventas_producto_lote', rowLabel, 'Lote')] = row.lot;
      values[fieldKey('ventas_producto_lote', rowLabel, 'Inventario')] = row.inventory;
      values[fieldKey('ventas_producto_lote', rowLabel, 'Cantidad salida Lunaris')] = String(row.quantity);
      values[fieldKey('ventas_producto_lote', rowLabel, 'Salidas revisadas por contabilidad')] = row.documents.size > 0
        ? `Pendiente de revisar (${row.documents.size} doc(s))`
        : 'Pendiente de revisar';
    });
    returnSummaryRows.forEach((row) => {
      const rowLabel = `${row.date || '-'} · ${row.product || '-'} · ${row.lot || '-'} · ${row.id || '-'}`;
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Fecha')] = row.date || '-';
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Producto')] = row.product || '-';
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Lote')] = row.lot || '-';
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Inventario')] = row.inventory || '-';
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Tipo')] = row.type;
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Cantidad')] = String(row.quantity);
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Movimiento Lunaris')] = row.id ? `ID ${row.id}` : '-';
      values[fieldKey('devoluciones_lunaris', rowLabel, 'Observaciones')] = row.notes || '-';
    });
    return values;
  }, [assemblySummaryRows, damageSummaryRows, finalizedAssemblyRows, transferSummaryRows, stockSummaryRows, salesExitSummaryRows, returnSummaryRows]);
  const lotOptionsByProduct = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const ensure = (product: string) => {
      const code = normalize(product).toUpperCase();
      if (!code) return null;
      if (!map.has(code)) map.set(code, new Set<string>());
      return map.get(code) || null;
    };

    for (const product of PRODUCT_OPTIONS) {
      const set = ensure(product.code);
      (BASE_LOTS_BY_PRODUCT[product.code] || []).forEach((lot) => set?.add(lot));
    }

    const pushLotRow = (row: GenericRow) => {
      const product = operationalProductCode(row?.producto || row?.product);
      const lot = operationalLotCode(row?.lote || row?.lot);
      if (!product || !lot || !isLongOperationalLot(lot) || !isActiveOperationalLot(row)) return;
      const set = ensure(product);
      set?.add(lot);
    };

    const pushMovement = (movement: InventoryMovementRow) => {
      const product = operationalProductCode(movement?.producto);
      const lot = operationalLotCode(movement?.lote);
      if (!product || !lot || !isLongOperationalLot(lot)) return;
      const set = ensure(product);
      set?.add(lot);
    };

    [...(canetLotes || []), ...(huarteLotes || [])].forEach(pushLotRow);
    [...(canetMovements || []), ...(huarteMovements || [])].forEach(pushMovement);
    return new Map(
      Array.from(map.entries()).map(([product, lots]) => [
        product,
        Array.from(lots).sort((a, b) => b.localeCompare(a, 'es')),
      ]),
    );
  }, [canetLotes, canetMovements, huarteLotes, huarteMovements]);

  const suggestedNoteUsers = useMemo(() => {
    const aliases = activeDefinition.users || [];
    const suggested = USERS.filter((user) => {
      const name = normalize(user.name);
      const emailName = normalize(user.email.split('@')[0] || '');
      return aliases.some((alias) => userMatchesOperationalAlias(name, alias) || userMatchesOperationalAlias(emailName, alias));
    });
    return suggested.length > 0 ? suggested : USERS.filter((user) => !user.isRestricted);
  }, [activeDefinition.users]);

  const noteTargetUrl = getOperationalControlUrl({ process: selectedProcess, year, month });

  useEffect(() => {
    const process = searchParams.get('process');
    const nextYear = Number(searchParams.get('year'));
    const nextMonth = Number(searchParams.get('month'));

    if (process && PROCESS_DEFINITIONS[process as ProcessKey]) {
      setSelectedProcess(process as ProcessKey);
    }
    if (Number.isFinite(nextYear) && nextYear >= 2020 && nextYear <= 2100) {
      setYear(nextYear);
    }
    if (Number.isFinite(nextMonth) && nextMonth >= 1 && nextMonth <= 12) {
      setMonth(nextMonth);
    }

    if (searchParams.get('focus') === '1') {
      setFocusActiveCard(true);
      const timer = window.setTimeout(() => {
        const activeCard = document.getElementById('operational-control-active-card');
        activeCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 160);
      const clearTimer = window.setTimeout(() => setFocusActiveCard(false), 2600);
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(clearTimer);
      };
    }
  }, [searchParams]);

  useEffect(() => {
    setDraftFields(currentRecord?.fields || {});
    setDraftChecklist(currentRecord?.checklist || {});
    setDraftAttachments(currentRecord?.attachments || {});
    setDraftStatus(currentRecord?.status || 'pendiente');
    setDraftReviewed(!!currentRecord?.reviewed);
  }, [currentRecord?.id, currentRecord?.updatedAt, selectedProcess, year, month]);

  const setFieldValue = (key: string, value: string) => {
    if (!canEditActiveProcess) return;
    setDraftFields((prev) => ({ ...prev, [key]: value }));
  };

  const addTableLine = (table: TableDefinition) => {
    if (!canEditActiveProcess) return;
    setDraftFields((prev) => {
      const key = tableRowsKey(table.id);
      const extraRows = parseExtraRows(prev[key]);
      const nextNumber = table.rows.length + extraRows.length + 1;
      return {
        ...prev,
        [key]: JSON.stringify([...extraRows, `Línea ${nextNumber}`]),
      };
    });
  };

  const setChecklistValue = (item: string, checked: boolean) => {
    if (!canEditActiveProcess) return;
    setDraftChecklist((prev) => ({ ...prev, [item]: checked }));
  };

  const setAttachmentValue = (item: string, files: Attachment[]) => {
    if (!canEditActiveProcess) return;
    setDraftAttachments((prev) => ({ ...prev, [item]: files }));
    if (files.length > 0) {
      setDraftChecklist((prev) => ({ ...prev, [item]: true }));
    }
  };

  const toggleNoteAssignee = (userId: string) => {
    setNoteAssigneeIds((prev) => (
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    ));
  };

  const createOperationalNoteTask = async () => {
    if (!currentUser || creatingNoteTask) return;
    if (noteAssigneeIds.length === 0) {
      alert('Elige al menos una persona para asignarle la nota.');
      return;
    }
    const trimmedNote = noteText.trim();
    if (!trimmedNote) {
      alert('Escribe una nota cortita para que la persona sepa qué revisar.');
      return;
    }

    setCreatingNoteTask(true);
    try {
      const absoluteUrl = typeof window !== 'undefined'
        ? `${window.location.origin}${noteTargetUrl}`
        : noteTargetUrl;
      await createTodo({
        title: `Revisar control operativo: ${activeDefinition.title}`,
        description: [
          trimmedNote,
          '',
          `Tarjeta: ${activeDefinition.title}`,
          `Periodo: ${monthLabel} ${year}`,
          `Abrir tarjeta: ${absoluteUrl}`,
        ].join('\n'),
        assignedTo: noteAssigneeIds,
        dueDateKey: new Date().toISOString().split('T')[0],
        attachments: [],
        tags: [
          'control operativo',
          makeOperationalControlTag(selectedProcess, year, month),
        ],
      });
      setNoteText('');
      setNoteAssigneeIds([]);
      emitSuccessFeedback('Nota enviada como tarea y notificación.');
    } catch (error) {
      console.error('Error creating operational note task:', error);
      alert('No se pudo crear la tarea de control operativo.');
    } finally {
      setCreatingNoteTask(false);
    }
  };

  const saveProcess = (markReviewed = false) => {
    if (!canEditActiveProcess) return;
    const nextReviewed = markReviewed || draftReviewed;
    const nextStatus: StatusKey = markReviewed && draftStatus === 'pendiente' ? 'correcto' : draftStatus;
    const now = new Date().toISOString();
    const participantLabel = participantLabelForCurrentUser(
      activeDefinition,
      currentUserName,
      currentUser?.name || currentUser?.email || 'Usuario',
    );
    const participantKey = progressKey(participantLabel);
    setState((prev) => {
      const base = safeState(prev);
      const existing = getRecord(base.records, selectedProcess, year, month);
      const participantProgress: Record<string, ParticipantProgress> = {
        ...(existing?.participantProgress || {}),
        [participantKey]: {
          ...(existing?.participantProgress?.[participantKey] || { label: participantLabel }),
          label: participantLabel,
          savedAt: now,
          savedBy: currentUser?.id || '',
          savedByName: currentUser?.name || currentUser?.email || '',
          ...(markReviewed
            ? {
                reviewedAt: now,
                reviewedBy: currentUser?.id || '',
                reviewedByName: currentUser?.name || currentUser?.email || '',
              }
            : {}),
        },
      };
      const nextRecord: ProcessRecord = {
        id: existing?.id || createId(),
        process: selectedProcess,
        year,
        month,
        status: nextStatus,
        reviewed: nextReviewed,
        fields: mergeFields(existing?.fields, { ...draftFields, ...automaticFieldValues, ...automaticTableValues }),
        checklist: mergeChecklist(existing?.checklist, draftChecklist),
        attachments: mergeAttachmentsByField(existing?.attachments, draftAttachments),
        participantProgress,
        updatedAt: now,
        updatedBy: currentUser?.id || '',
        updatedByName: currentUser?.name || currentUser?.email || '',
      };
      const key = getRecordKey(selectedProcess, year, month);
      return {
        ...base,
        records: [
          ...base.records.filter((record) => getRecordKey(record.process, record.year, record.month) !== key),
          nextRecord,
        ],
      };
    });
    setDraftStatus(nextStatus);
    setDraftReviewed(nextReviewed);
    emitSuccessFeedback(markReviewed ? 'Sección marcada como revisada.' : 'Sección guardada correctamente.');
  };

  const closeMonth = () => {
    if (!isAdmin || isMonthClosed) return;
    const confirmed = window.confirm(`¿Cerrar ${monthLabel} de ${year}? El mes quedará bloqueado en modo lectura.`);
    if (!confirmed) return;
    const now = new Date().toISOString();
    setState((prev) => {
      const base = safeState(prev);
      const existing = getMonthClosure(base.monthClosures, year, month);
      const recordsSnapshot = PROCESS_ORDER
        .map((process) => getRecord(base.records, process, year, month))
        .filter(Boolean) as ProcessRecord[];
      const snapshotStatusCounts = PROCESS_ORDER.reduce<Record<StatusKey, number>>(
        (acc, process) => {
          const record = getRecord(base.records, process, year, month);
          const definition = PROCESS_DEFINITIONS[process];
          acc[effectiveProcessStatus(record, definition)] += 1;
          return acc;
        },
        { pendiente: 0, correcto: 0, revision: 0, critica: 0 },
      );
      const snapshotMissingAttachments = PROCESS_ORDER.reduce((total, process) => {
        const record = getRecord(base.records, process, year, month);
        const definition = PROCESS_DEFINITIONS[process];
        return total + definition.attachments.filter((item) => (record?.attachments?.[item] || []).length === 0).length;
      }, 0);
      const archiveId = existing?.archiveId || createId();
      const archive: OperationalMonthArchive = {
        id: archiveId,
        year,
        month,
        monthLabel,
        closedAt: now,
        closedBy: currentUser?.id || '',
        closedByName: currentUser?.name || currentUser?.email || '',
        records: recordsSnapshot,
        statusCounts: snapshotStatusCounts,
        missingAttachments: snapshotMissingAttachments,
        openIncidentCount: recordsSnapshot.filter((record) => record.status === 'critica').length,
      };
      const closure: MonthClosure = {
        id: existing?.id || createId(),
        year,
        month,
        closed: true,
        closedAt: now,
        closedBy: currentUser?.id || '',
        closedByName: currentUser?.name || currentUser?.email || '',
        archiveId,
      };
      return {
        ...base,
        monthClosures: [...base.monthClosures.filter((item) => !(item.year === year && item.month === month)), closure],
        operationalClosures: [
          ...(base.operationalClosures || []).filter((item) => !(item.year === year && item.month === month)),
          archive,
        ].sort((a, b) => (a.year === b.year ? b.month - a.month : b.year - a.year)),
      };
    });
    emitSuccessFeedback('Cierre operativo guardado y mes bloqueado en lectura.');
  };

  const reopenMonth = () => {
    if (!isAdmin || !isMonthClosed) return;
    const confirmed = window.confirm(`¿Reabrir ${monthLabel} de ${year}? Se permitirá editar otra vez.`);
    if (!confirmed) return;
    setState((prev) => {
      const base = safeState(prev);
      const existing = getMonthClosure(base.monthClosures, year, month);
      const closure: MonthClosure = {
        ...(existing || { id: createId(), year, month }),
        closed: false,
        reopenedAt: new Date().toISOString(),
        reopenedBy: currentUser?.id || '',
        reopenedByName: currentUser?.name || '',
      };
      return {
        ...base,
        monthClosures: [...base.monthClosures.filter((item) => !(item.year === year && item.month === month)), closure],
      };
    });
    emitSuccessFeedback('Mes reabierto correctamente.');
  };

  const loadHistorySnapshots = async () => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const { data, error } = await supabase
        .from('shared_json_state')
        .select('payload')
        .eq('key', sharedJsonHistoryKeyFor('operational_control_monthly_v2'))
        .maybeSingle();
      if (error) throw error;
      const snapshots = Array.isArray(data?.payload?.snapshots)
        ? (data.payload.snapshots as OperationalHistorySnapshot[])
        : [];
      const { data: backupData, error: backupError } = await supabase
        .from('shared_json_state')
        .select('payload')
        .eq('key', 'shared_json_state_backup_non_empty:operational_control_monthly_v2')
        .maybeSingle();
      if (backupError) throw backupError;
      const backupPayload = safeState(backupData?.payload as OperationalMonthlyState | undefined);
      const backupUpdatedAt = [
        ...backupPayload.records.map((record) => record.updatedAt),
        ...backupPayload.monthClosures.map((closure) => closure.closedAt || closure.reopenedAt || ''),
        ...(backupPayload.operationalClosures || []).map((closure) => closure.closedAt),
      ]
        .map(timestampMs)
        .filter((value) => value > 0)
        .sort((a, b) => b - a)[0];
      const backupSnapshot: OperationalHistorySnapshot[] = backupPayload.records.length > 0
        ? [{
            id: 'backup_non_empty',
            savedAt: backupUpdatedAt ? new Date(backupUpdatedAt).toISOString() : new Date().toISOString(),
            source: 'backup_non_empty',
            updatedBy: null,
            payload: backupPayload,
          }]
        : [];
      const seenSignatures = new Set<string>();
      setHistorySnapshots(
        [...backupSnapshot, ...snapshots]
          .filter((snapshot) => snapshot?.payload && Array.isArray(snapshot.payload.records))
          .sort((a, b) => timestampMs(b.savedAt) - timestampMs(a.savedAt))
          .filter((snapshot) => {
            const signature = operationalSnapshotSignature(snapshot);
            if (seenSignatures.has(signature)) return false;
            seenSignatures.add(signature);
            return true;
          }),
      );
      setHistoryLoaded(true);
    } catch (error) {
      console.error('[operational_control] history load failed:', error);
      setHistoryError('No se pudo cargar el historial de seguridad.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreHistorySnapshot = (snapshot: OperationalHistorySnapshot) => {
    if (!isAdmin || !snapshot?.payload) return;
    const stats = stateContentStats(snapshot.payload, year, month);
    if (!stats.useful) {
      window.alert('Esta copia no contiene campos, adjuntos, checks ni revisiones para restaurar.');
      return;
    }
    const confirmed = window.confirm(
      `¿Restaurar la copia del ${formatDateTime(snapshot.savedAt)}?\n\nSe fusionará con lo actual para recuperar datos sin borrar guardados recientes.`,
    );
    if (!confirmed) return;
    setState((prev) => restoreOperationalSnapshot(
      safeState(prev),
      safeState(snapshot.payload),
      currentUser?.name || currentUser?.email || 'Administración',
    ));
    emitSuccessFeedback('Copia histórica restaurada. Revisa la información y guarda/recarga si hace falta.');
  };

  const recoverAttachmentsFromStorage = async () => {
    if (!canEditActiveProcess || recoveringAttachments) return;
    setRecoveringAttachments(true);
    try {
      const recovered: Record<string, Attachment[]> = {};
      const errors: string[] = [];

      for (const item of activeDefinition.attachments) {
        const folderPath = attachmentFolderPath(year, month, selectedProcess, item);
        const { data, error } = await supabase.storage
          .from('attachments')
          .list(folderPath, {
            limit: 100,
            sortBy: { column: 'created_at', order: 'desc' },
          });
        if (error) {
          errors.push(`${item}: ${error.message}`);
          continue;
        }
        const files = (data || [])
          .filter((file) => file.name && !file.name.startsWith('.'))
          .map((file) => {
            const path = `${folderPath}/${file.name}`;
            const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(path);
            return {
              name: file.name.replace(/^[a-z0-9]+_\\d+\\./i, 'archivo.'),
              url: publicData.publicUrl,
              type: file.metadata?.mimetype || file.metadata?.mimeType || 'application/octet-stream',
              size: Number(file.metadata?.size || 0),
            };
          });
        if (files.length > 0) recovered[item] = files;
      }

      const recoveredCount = Object.values(recovered).reduce((total, files) => total + files.length, 0);
      if (recoveredCount === 0) {
        window.alert(errors.length > 0
          ? `No pude recuperar adjuntos. Detalle: ${errors.slice(0, 3).join(' | ')}`
          : 'No encontré adjuntos guardados en Storage para esta sección y mes.');
        return;
      }

      setDraftAttachments((prev) => mergeAttachmentsByField(prev, recovered));
      setDraftChecklist((prev) => {
        const next = { ...prev };
        Object.keys(recovered).forEach((item) => {
          next[item] = true;
        });
        return next;
      });
      emitSuccessFeedback(`Recuperé ${recoveredCount} adjunto(s). Revisa la sección y pulsa Guardar sección.`);
    } catch (error) {
      console.error('[operational_control] attachment recovery failed:', error);
      window.alert('No pude buscar adjuntos en Storage. Revisa conexión/permisos e inténtalo otra vez.');
    } finally {
      setRecoveringAttachments(false);
    }
  };

  const ActiveIcon = activeDefinition.icon;
  const activeDisplayStatus = currentRecord
    ? effectiveProcessStatus({ ...currentRecord, status: draftStatus }, activeDefinition)
    : draftStatus;
  const activeStatusMeta = STATUS_META[activeDisplayStatus];
  const activeProgress = progressForLabels(currentRecord, activeDefinition);
  const activeReviewedCount = activeProgress.filter((item) => !!item.reviewedAt).length;
  const activeSavedCount = activeProgress.filter((item) => !!item.savedAt).length;

  return (
    <main className="min-h-screen bg-[#f7f3ec] px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1760px] space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Centro de mando / Operación</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Control Operativo Mensual Solaris</h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
                Revisión mensual de Zoho, Lunaris y stock físico con responsables, evidencias exactas y cierre bloqueable.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Mes</span>
                <select
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold capitalize"
                >
                  {MONTHS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Año</span>
                <select
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"
                >
                  {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              {loading && <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">Sincronizando...</span>}
              {isMonthClosed ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-black text-white">
                  <Lock size={14} />
                  Mes cerrado
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Mes editable</span>
              )}
            </div>
          </div>
        </section>

        {isAdmin && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Historial de seguridad</p>
                <p className="mt-1 text-sm font-semibold text-amber-900">
                  Copias automáticas del control operativo para recuperar información si una sincronización vacía pisa la vista actual.
                </p>
              </div>
              <button
                type="button"
                onClick={loadHistorySnapshots}
                disabled={historyLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-black text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
              >
                <RotateCcw size={17} />
                {historyLoading ? 'Cargando...' : 'Ver copias'}
              </button>
            </div>
            {historyError && <p className="mt-3 text-sm font-bold text-red-700">{historyError}</p>}
            {historyLoaded && historySnapshots.length === 0 && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-800">
                Todavía no hay copias históricas guardadas. Las próximas ediciones quedarán versionadas aquí.
              </p>
            )}
            {historySnapshots.length > 0 && (
              <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
                {historySnapshots.slice(0, 8).map((snapshot) => {
                  const payload = safeState(snapshot.payload);
                  const currentMonthRecords = payload.records.filter((record) => record.year === year && record.month === month);
                  const stats = stateContentStats(payload, year, month);
                  const label = snapshot.source === 'backup_non_empty'
                    ? 'Última copia válida'
                    : snapshot.source === 'before_remote'
                      ? 'Antes de guardar'
                      : 'Después de guardar';
                  return (
                    <div key={snapshot.id} className="rounded-xl border border-amber-200 bg-white p-3">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">{label}</p>
                      <p className="mt-1 text-sm font-black text-slate-950">{formatDateTime(snapshot.savedAt)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {currentMonthRecords.length} secciones de {monthLabel} {year} · {payload.records.length} registros totales
                      </p>
                      <p className={`mt-2 rounded-lg px-2 py-1 text-xs font-black ${stats.useful ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                        {stats.fields} campos · {stats.attachments} adjuntos · {stats.checks} checks · {stats.progress} responsables
                      </p>
                      <button
                        type="button"
                        onClick={() => restoreHistorySnapshot(snapshot)}
                        disabled={!stats.useful}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <RotateCcw size={14} />
                        {stats.useful ? 'Restaurar copia' : 'Copia vacía'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-9">
          {PROCESS_ORDER.map((process) => {
            const definition = PROCESS_DEFINITIONS[process];
            const record = getRecord(records, process, year, month);
            const status = effectiveProcessStatus(record, definition);
            const meta = STATUS_META[status];
            const Icon = definition.icon;
            const canEdit = canUserEditProcess(definition, currentUserName, isAdmin);
            const progress = progressForLabels(record, definition);
            const reviewedCount = progress.filter((item) => !!item.reviewedAt).length;
            return (
              <button
                key={process}
                onClick={() => setSelectedProcess(process)}
                className={`rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  selectedProcess === process ? `${definition.color.border} ${definition.color.soft}` : meta.border
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full p-2 text-white ${meta.dot}`}>
                    <ProcessStatusIcon status={status} />
                  </span>
                  <Icon size={19} className={definition.color.text} />
                </div>
                <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  {definition.index}. {definition.shortTitle}
                </p>
                <p className="mt-1 min-h-[2rem] text-sm font-black leading-tight text-slate-950">{definition.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{definition.responsible}</p>
                <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-black uppercase ${meta.badge}`}>{meta.label}</span>
                <p className="mt-2 text-[11px] font-black text-slate-500">
                  Revisado: {reviewedCount}/{progress.length}
                </p>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">{formatDateTime(record?.updatedAt)}</p>
                {!canEdit && <p className="mt-1 text-[11px] font-bold text-slate-400">Solo lectura para tu usuario</p>}
              </button>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-4">
            <section
              id="operational-control-active-card"
              className={`rounded-xl border bg-white shadow-sm transition ${activeDefinition.color.border} ${focusActiveCard ? 'ring-4 ring-red-300 ring-offset-2' : ''}`}
            >
              <div className={`border-b px-4 py-3 ${activeDefinition.color.border} ${activeDefinition.color.soft}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-xl border bg-white p-3 ${activeDefinition.color.border} ${activeDefinition.color.text}`}>
                      <ActiveIcon size={28} />
                    </div>
                    <div>
                      <p className={`text-xs font-black uppercase tracking-[0.18em] ${activeDefinition.color.text}`}>
                        {activeDefinition.index}. {activeDefinition.title}
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-slate-950">{monthLabel} {year}</h2>
                      <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">{activeDefinition.summary}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-black uppercase ${activeStatusMeta.badge}`}>{activeStatusMeta.label}</span>
                    <button
                      type="button"
                      onClick={() => saveProcess(false)}
                      disabled={!canEditActiveProcess}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300 ${activeDefinition.color.button}`}
                    >
                      <Save size={17} />
                      Guardar sección
                    </button>
                    <button
                      type="button"
                      onClick={() => saveProcess(true)}
                      disabled={!canEditActiveProcess}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check size={17} />
                      Marcar revisado
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <p>Responsable: <span className="text-slate-950">{activeDefinition.responsible}</span></p>
                  {activeDefinition.warehouse && <p>Bodega: <span className="text-slate-950">{activeDefinition.warehouse}</span></p>}
                  {activeDefinition.accounting && <p>Contabilidad: <span className="text-slate-950">{activeDefinition.accounting}</span></p>}
                  <p>Guardado/revisión: <span className="text-slate-950">{activeSavedCount}/{activeProgress.length} · {activeReviewedCount}/{activeProgress.length}</span></p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeProgress.map((item) => {
                    const tone = item.reviewedAt
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : item.savedAt
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-500';
                    const label = item.reviewedAt ? 'Revisado' : item.savedAt ? 'Guardado' : 'Falta';
                    return (
                      <span key={progressKey(item.label)} className={`rounded-full border px-3 py-1 text-xs font-black ${tone}`}>
                        {item.label}: {label}
                      </span>
                    );
                  })}
                </div>
                {activeProgress.length > 1 && activeReviewedCount === activeProgress.length && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
                    Todos los responsables marcaron esta sección como revisada.
                  </div>
                )}
                {isMonthClosed && (
                  <div className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                    Este mes está cerrado. Los datos y adjuntos quedan en lectura hasta que administración lo reabra.
                  </div>
                )}
                {!isMonthClosed && (
                  <section className="mt-3 rounded-xl border border-red-200 bg-white/90 p-3 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-red-700">
                          <AtSign size={14} />
                          Dejar nota y asignar revisión
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Crea una tarea automática para que la persona abra esta tarjeta, revise y guarde su parte.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={createOperationalNoteTask}
                        disabled={creatingNoteTask || noteAssigneeIds.length === 0 || !noteText.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Send size={16} />
                        {creatingNoteTask ? 'Enviando...' : 'Enviar tarea'}
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,380px)]">
                      <textarea
                        value={noteText}
                        onChange={(event) => setNoteText(event.target.value)}
                        rows={3}
                        placeholder="Ej. @Anabella revisa esta diferencia de stock y guarda la sección cuando esté corregida."
                        className="w-full rounded-xl border border-red-100 bg-red-50/40 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
                      />
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Personas sugeridas</p>
                        <div className="flex flex-wrap gap-2">
                          {suggestedNoteUsers.map((user) => {
                            const selected = noteAssigneeIds.includes(user.id);
                            return (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => toggleNoteAssignee(user.id)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                                  selected
                                    ? 'border-red-500 bg-red-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-red-300'
                                }`}
                              >
                                @{user.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-4 p-4">
                <section className="grid gap-3 md:grid-cols-4">
                  {(['correcto', 'revision', 'critica', 'pendiente'] as StatusKey[]).map((status) => {
                    const meta = STATUS_META[status];
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => canEditActiveProcess && setDraftStatus(status)}
                        disabled={!canEditActiveProcess}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          draftStatus === status ? `${meta.border} bg-white shadow-sm ring-2 ring-slate-100` : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <span className="text-sm font-black text-slate-800">{meta.short}</span>
                        <span className={`h-3 w-3 rounded-full ${meta.dot}`} />
                      </button>
                    );
                  })}
                </section>

                {activeDefinition.checklist && (
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <ClipboardCheck size={18} className="text-slate-700" />
                      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Checklist final</h3>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {activeDefinition.checklist.map((item) => (
                        <label key={item} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                          <input
                            type="checkbox"
                            checked={!!draftChecklist[item]}
                            onChange={(event) => setChecklistValue(item, event.target.checked)}
                            disabled={!canEditActiveProcess}
                            className="h-4 w-4 rounded border-slate-300 text-teal-700"
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                {selectedProcess === 'entradas_canet' && (
                  <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-emerald-800">Recepciones leídas del dossier</h3>
                        <p className="mt-1 text-xs font-semibold text-emerald-900/70">
                          Estas líneas vienen de Dossier trazabilidad por fecha de entrada. Sirven como base automática de Entradas del mes.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-800">{traceabilityEntradasMonth.length} entrada(s)</span>
                        {traceabilityEntradasWithDifferences.length > 0 && (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">{traceabilityEntradasWithDifferences.length} con diferencia</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 max-h-[330px] overflow-y-auto rounded-xl border border-emerald-100 bg-white">
                      <table className="w-full min-w-[900px] text-left text-xs">
                        <thead className="sticky top-0 bg-white text-[11px] font-black uppercase tracking-widest text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Producto</th>
                            <th className="px-3 py-2">Lote</th>
                            <th className="px-3 py-2">Proveedor</th>
                            <th className="px-3 py-2">Albarán</th>
                            <th className="px-3 py-2">Factura Solaris</th>
                            <th className="px-3 py-2">Cant. albarán</th>
                            <th className="px-3 py-2">Cant. recibida</th>
                            <th className="px-3 py-2">Estado</th>
                            <th className="px-3 py-2">Docs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {traceabilityEntradasMonth.map(({ lot, entry, supplier, supplierProduct, productCode, files }) => {
                            const hasDifference = entry.quantityMatchesInvoice === 'no' || !!String(entry.quantityDifference || '').trim();
                            return (
                              <tr key={`${lot.id}-${entry.id}`} className={hasDifference ? 'bg-red-50/70' : 'bg-white'}>
                                <td className="px-3 py-2 font-semibold text-slate-600">{entry.deliveryDate || '-'}</td>
                                <td className="px-3 py-2 font-black text-slate-900">{productCode || lot.productName}</td>
                                <td className="px-3 py-2 font-black text-slate-900">{lot.lotNumber}</td>
                                <td className="px-3 py-2 font-semibold text-slate-600">{supplier?.name || '-'}</td>
                                <td className="px-3 py-2 font-semibold text-slate-600">{entry.albaranNumber || '-'}</td>
                                <td className="px-3 py-2 font-semibold text-slate-600">{entry.solarisInvoiceNumber || '-'}</td>
                                <td className="px-3 py-2 font-semibold text-slate-600">{entry.deliveryNoteQuantity || '-'} {supplierProduct?.unit || ''}</td>
                                <td className="px-3 py-2 font-semibold text-slate-600">{entry.quantity || '-'}</td>
                                <td className="px-3 py-2">
                                  <span className={`rounded-full px-2 py-1 font-black ${hasDifference ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
                                    {hasDifference ? 'A corregir' : lot.status || 'abierto'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-black text-slate-600">{files}</td>
                              </tr>
                            );
                          })}
                          {traceabilityEntradasMonth.length === 0 && (
                            <tr>
                              <td colSpan={10} className="px-3 py-8 text-center text-sm font-bold text-slate-400">
                                No hay recepciones del dossier para este mes.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {selectedProcess === 'cierre_comun' && (
                  <section className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-red-800">Pendiente para cierre común</h3>
                        <p className="mt-1 text-xs font-semibold text-red-900/70">
                          Aquí aparecen las secciones marcadas en revisión/incidencia o con campos de diferencia rellenos.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-red-700">{recordsToCorrect.length} punto(s)</span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {recordsToCorrect.map((record) => {
                        const definition = PROCESS_DEFINITIONS[record.process];
                        return (
                          <button
                            key={record.id}
                            type="button"
                            onClick={() => setSelectedProcess(record.process)}
                            className="rounded-xl border border-red-100 bg-white px-3 py-2 text-left text-sm font-bold text-slate-800 hover:bg-red-50"
                          >
                            {definition.title}
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-black text-red-700">{STATUS_META[record.status].short}</span>
                            <span className="mt-1 block text-xs font-semibold text-slate-500">Última edición: {formatDateTime(record.updatedAt)}</span>
                          </button>
                        );
                      })}
                      {recordsToCorrect.length === 0 && (
                        <p className="rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-black text-emerald-800">No hay secciones marcadas para corregir.</p>
                      )}
                    </div>
                  </section>
                )}

                {activeDefinition.fields && activeDefinition.fields.length > 0 && (
                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-700">Campos de control</h3>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {activeDefinition.fields.map((field) => {
                        const autoValue = automaticFieldValues[field.id];
                        const fieldValue = autoValue ?? draftFields[field.id] ?? '';
                        const isAutomatic = autoValue !== undefined;
                        return (
                        <label key={field.id} className={field.type === 'textarea' ? 'space-y-1 lg:col-span-2' : 'space-y-1'}>
                          <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{field.label}</span>
                          {field.type === 'textarea' ? (
                            <textarea
                              value={fieldValue}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              disabled={!canEditActiveProcess || isAutomatic}
                              rows={3}
                              className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none ${isAutomatic ? 'border-teal-100 bg-teal-50 text-teal-900' : `border-slate-200 bg-white ${activeDefinition.color.ring}`} disabled:bg-slate-50`}
                            />
                          ) : field.type === 'status' ? (
                            <select
                              value={fieldValue}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              disabled={!canEditActiveProcess || isAutomatic}
                              className={`h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none ${activeDefinition.color.ring} disabled:bg-slate-50`}
                            >
                              <option value="">Seleccionar estado</option>
                              <option value="Correcto">Correcto</option>
                              <option value="Revisión necesaria">Revisión necesaria</option>
                              <option value="Incidencia crítica">Incidencia crítica</option>
                            </select>
                          ) : (
                            <input
                              type={inputType(field.type)}
                              value={fieldValue}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              disabled={!canEditActiveProcess || isAutomatic}
                              className={`h-10 w-full rounded-xl border px-3 text-sm font-semibold outline-none ${isAutomatic ? 'border-teal-100 bg-teal-50 text-teal-900' : `border-slate-200 bg-white ${activeDefinition.color.ring}`} disabled:bg-slate-50`}
                            />
                          )}
                          {isAutomatic ? <span className="text-xs font-semibold text-teal-600">Automático desde movimientos de inventario.</span> : field.hint && <span className="text-xs font-semibold text-slate-400">{field.hint}</span>}
                        </label>
                      );
                      })}
                    </div>
                  </section>
                )}

                {activeDefinition.tables?.map((table) => {
                  const statusMatrix = isStatusMatrix(table.columns);
                  const generatedRows = automaticTableRows.get(table.id) || [];
                  const rows = generatedRows.length > 0
                    ? [...generatedRows, ...parseExtraRows(draftFields[tableRowsKey(table.id)])]
                    : [...table.rows, ...parseExtraRows(draftFields[tableRowsKey(table.id)])];
                  const canAddRows = tableSupportsExtraRows(table) && generatedRows.length === 0;
                  return (
                  <section key={table.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">{table.title}</h3>
                        {table.subtitle && <p className="mt-1 text-xs font-semibold text-slate-500">{table.subtitle}</p>}
                      </div>
                      {canAddRows && (
                        <button
                          type="button"
                          onClick={() => addTableLine(table)}
                          disabled={!canEditActiveProcess}
                          className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          + Añadir línea
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className={`w-full border-collapse text-sm ${statusMatrix ? 'min-w-[620px]' : 'min-w-[980px]'}`}>
                        <thead>
                          <tr className="bg-white text-xs uppercase tracking-[0.12em] text-slate-500">
                            <th className="border-b border-slate-200 px-2 py-2 text-left">Línea</th>
                            {table.columns.map((column) => (
                              <th key={column} className="border-b border-slate-200 px-2 py-2 text-left">{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const isGeneratedRow = generatedRows.includes(row);
                            return (
                            <tr key={row} className="border-b border-slate-100 last:border-b-0">
                              <td className="w-20 px-2 py-1.5 text-xs font-black text-slate-500">{isGeneratedRow ? 'Auto' : row}</td>
                              {table.columns.map((column) => {
                                const key = fieldKey(table.id, row, column);
                                const rowStatusKey = fieldKey(table.id, row, 'estado');
                                const autoValue = automaticTableValues[key];
                                const cellValue = autoValue ?? draftFields[key] ?? '';
                                const normalizedColumn = normalize(column);
                                const isDifferenceColumn = normalizedColumn.includes('diferencia');
                                const zohoColumn = table.columns.find((item) => normalize(item).includes('zoho'));
                                const lunarisColumn = table.columns.find((item) => normalize(item).includes('lunaris'));
                                const zohoKey = zohoColumn ? fieldKey(table.id, row, zohoColumn) : '';
                                const lunarisKey = lunarisColumn ? fieldKey(table.id, row, lunarisColumn) : '';
                                const zohoValue = zohoColumn ? parseControlNumber(draftFields[zohoKey] || automaticTableValues[zohoKey] || '') : null;
                                const lunarisValue = lunarisColumn ? parseControlNumber(draftFields[lunarisKey] || automaticTableValues[lunarisKey] || '') : null;
                                const explicitDiff = parseControlNumber(cellValue);
                                const hasComparableValues = zohoValue !== null && lunarisValue !== null;
                                const hasDifference = explicitDiff !== null ? explicitDiff !== 0 : hasComparableValues ? zohoValue !== lunarisValue : false;
                                const hasMatch = explicitDiff !== null ? explicitDiff === 0 : hasComparableValues ? zohoValue === lunarisValue : false;
                                const computedDifference = isDifferenceColumn && explicitDiff === null && hasComparableValues
                                  ? String((zohoValue || 0) - (lunarisValue || 0))
                                  : cellValue;
                                const diffTone = isDifferenceColumn
                                  ? hasDifference
                                    ? 'bg-red-50'
                                    : hasMatch
                                      ? 'bg-emerald-50'
                                      : ''
                                  : '';
                                return (
                                  <td key={column} className={`${statusMatrix ? 'min-w-[130px] text-center' : 'min-w-[140px]'} px-1.5 py-1.5 ${diffTone}`}>
                                    {statusMatrix ? (
                                      <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
                                        <input
                                          type="radio"
                                          name={rowStatusKey}
                                          checked={draftFields[rowStatusKey] === column}
                                          onChange={() => setFieldValue(rowStatusKey, column)}
                                          disabled={!canEditActiveProcess}
                                          className="h-4 w-4"
                                        />
                                        {column}
                                      </label>
                                    ) : autoValue !== undefined || (isDifferenceColumn && computedDifference) ? (
                                      <div className={`min-h-9 rounded-lg border px-2 py-2 text-sm font-black ${autoValue !== undefined ? 'border-teal-100 bg-teal-50 text-teal-900' : hasDifference ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}>
                                        {computedDifference || '-'}
                                      </div>
                                    ) : renderCellInput(
                                      key,
                                      row,
                                      table,
                                      column,
                                      cellValue,
                                      draftFields[`${key}.otro`] || '',
                                      draftFields,
                                      lotOptionsByProduct,
                                      canEditActiveProcess,
                                      setFieldValue,
                                      activeDefinition.color.ring,
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {activeDefinition.key === 'entradas_canet' && table.id === 'entradas' && (() => {
                      const summary = buildEntradasSummary(table, rows, draftFields);
                      return (
                        <div className="grid gap-2 border-t border-emerald-100 bg-emerald-50/70 p-3 text-sm sm:grid-cols-4">
                          <div className="rounded-lg border border-emerald-100 bg-white p-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">Total compras Zoho</p>
                            <p className="mt-1 text-2xl font-black text-slate-950">{summary.totalCompras}</p>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-white p-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">Ingresos Lunaris</p>
                            <p className="mt-1 text-2xl font-black text-emerald-800">{summary.ingresadas}</p>
                          </div>
                          <div className="rounded-lg border border-amber-100 bg-white p-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">No ingresaron</p>
                            <p className="mt-1 text-2xl font-black text-amber-800">{summary.noIngresadas}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Pendientes</p>
                            <p className="mt-1 text-2xl font-black text-slate-800">{summary.pendientes}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </section>
                  );
                })}

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-slate-700" />
                      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Adjuntos requeridos con nombre exacto</h3>
                    </div>
                    {canEditActiveProcess && (
                      <button
                        type="button"
                        onClick={recoverAttachmentsFromStorage}
                        disabled={recoveringAttachments}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-black text-teal-800 transition hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        <Upload size={14} />
                        {recoveringAttachments ? 'Buscando...' : 'Buscar adjuntos guardados'}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {activeDefinition.attachments.map((item) => {
                      const files = draftAttachments[item] || [];
                      return (
                        <div key={item} className="rounded-xl border border-slate-200 bg-white p-3">
                          <label className="flex items-start gap-2 text-sm font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={!!draftChecklist[item]}
                              onChange={(event) => setChecklistValue(item, event.target.checked)}
                              disabled={!canEditActiveProcess}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700"
                            />
                            <span>{item}</span>
                          </label>
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            {canEditActiveProcess ? (
                              <FileUploader
                                key={`${selectedProcess}-${year}-${month}-${item}`}
                                compact
                                maxSizeMB={18}
                                acceptedTypes="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                                folderPath={attachmentFolderPath(year, month, selectedProcess, item)}
                                existingFiles={files}
                                onUploadComplete={(uploadedFiles) => setAttachmentValue(item, uploadedFiles)}
                              />
                            ) : files.length > 0 ? (
                              <div className="grid gap-2">
                                {files.map((file) => (
                                  <a
                                    key={`${file.url}-${file.name}`}
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:text-teal-700"
                                  >
                                    {file.name}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs font-semibold text-slate-400">Sin adjuntos.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-700">Observaciones</h3>
                  <textarea
                    value={draftFields.observaciones || ''}
                    onChange={(event) => setFieldValue('observaciones', event.target.value)}
                    disabled={!canEditActiveProcess}
                    rows={4}
                    className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none ${activeDefinition.color.ring} disabled:bg-slate-50`}
                    placeholder="Notas, explicación de diferencias, decisiones o contexto del mes..."
                  />
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <h3 className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-slate-700">Validación esperada</h3>
                  <div className="grid gap-2">
                    {activeDefinition.validations.map((item) => (
                      <div key={item} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-700" />
                        {item}
                      </div>
                    ))}
                  </div>
                </section>

                {selectedProcess === 'cierre_comun' && (
                  <section className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-lg font-black text-slate-950">Cierre operativo del mes</h3>
                        <p className="text-sm font-semibold text-slate-600">
                          {isMonthClosed
                            ? `Cerrado por ${monthClosure?.closedByName || 'administración'} el ${formatDateTime(monthClosure?.closedAt)}.`
                            : 'Al cerrar, todas las secciones quedan en modo lectura y los adjuntos se conservan para descarga.'}
                        </p>
                      </div>
                      {isMonthClosed ? (
                        <button
                          type="button"
                          onClick={reopenMonth}
                          disabled={!isAdmin}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw size={17} />
                          Reabrir mes
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={closeMonth}
                          disabled={!isAdmin}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          <Lock size={17} />
                          Cerrar mes
                        </button>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Resumen general del mes</h3>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(['correcto', 'revision', 'critica', 'pendiente'] as StatusKey[]).map((status) => {
                  const meta = STATUS_META[status];
                  return (
                    <div key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${meta.dot}`} />
                        <span className="text-xs font-black uppercase text-slate-500">{meta.label}</span>
                      </div>
                      <p className="mt-2 text-2xl font-black text-slate-950">{statusCounts[status]}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                Adjuntos pendientes: {missingAttachments}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Incidencias abiertas</h3>
              <div className="mt-3 space-y-2">
                {openIncidents.length === 0 ? (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Sin incidencias críticas marcadas.</p>
                ) : (
                  openIncidents.map((record) => (
                    <button
                      key={record.id}
                      onClick={() => setSelectedProcess(record.process)}
                      className="w-full rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-left text-sm font-bold text-red-700"
                    >
                      {PROCESS_DEFINITIONS[record.process].title}
                      <span className="block text-xs font-semibold text-red-500">{formatDateTime(record.updatedAt)}</span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Próximas acciones</h3>
              <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
                <p className="rounded-lg bg-slate-50 px-3 py-2">Revisar secciones en amarillo antes de cierre.</p>
                <p className="rounded-lg bg-slate-50 px-3 py-2">Adjuntar todos los informes exactos solicitados.</p>
                <p className="rounded-lg bg-slate-50 px-3 py-2">Cerrar el mes desde Cierre común cuando todo esté validado.</p>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Comentarios generales</h3>
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                {getRecord(records, 'cierre_comun', year, month)?.fields?.resumen_mes || 'Sin resumen común guardado para este mes.'}
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
