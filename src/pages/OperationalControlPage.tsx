import React, { useEffect, useMemo, useState } from 'react';
import {
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
  ShoppingCart,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sharedJsonHistoryKeyFor, useSharedJsonState } from '../hooks/useSharedJsonState';
import { useInventoryMovementsDB, type InventoryMovementRow } from '../hooks/useInventoryMovementsDB';
import { supabase } from '../lib/supabase';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { FileUploader, type Attachment } from '../components/FileUploader';

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
  { code: 'AV', label: 'Avira Vital' },
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

const isLongOperationalLot = (value: string) => value.replace(/[^A-Z0-9]/gi, '').length >= 6;

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
        title: 'Entradas de proveedor por producto y lote',
        columns: [
          'Producto',
          'Lote',
          'Cantidad recibida',
          'Cantidad registrada en Zoho',
          'Cantidad registrada en Lunaris',
          'Cantidad dañada',
          'Tipo de daño',
          'Diferencia',
          'Motivo diferencia',
          'Observaciones',
          'Factura proveedor validada por contabilidad',
        ],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5', 'Línea 6'],
      },
    ],
    attachments: [
      'Informe de entradas de proveedor descargado desde Zoho',
      'Informe de entradas de proveedor descargado desde Lunaris',
      'Albaranes de proveedor del periodo',
      'Informe de proveedores del mes de contabilidad',
      'Validación contable: factura proveedor existe para producto y lote',
    ],
    validations: [
      'Las cantidades recibidas deben coincidir con Zoho y Lunaris.',
      'Los lotes recibidos deben coincidir con los albaranes.',
      'Las facturas de proveedor deben coincidir con productos, lotes y cantidades recibidas.',
    ],
  },
  traspasos_huarte: {
    key: 'traspasos_huarte',
    index: 2,
    title: 'Traspasos Huarte',
    shortTitle: 'Traspasos',
    responsible: 'Itziar',
    review: 'Esteban',
    warehouse: 'Huarte',
    users: ['itzi', 'itziar'],
    icon: PackageCheck,
    color: {
      text: 'text-amber-800',
      border: 'border-amber-200',
      soft: 'bg-amber-50',
      button: 'bg-amber-600 hover:bg-amber-700',
      ring: 'focus:ring-amber-100 focus:border-amber-500',
    },
    summary: 'Huarte no recibe proveedor directo; sus entradas vienen de traspasos desde Canet.',
    tables: [
      {
        id: 'traspasos',
        title: 'Traspasos entre bodegas',
        columns: [
          'Producto',
          'Lote',
          'Cantidad enviada desde Canet',
          'Cantidad recibida en Huarte',
          'Cantidad registrada en Zoho',
          'Cantidad registrada en Lunaris',
          'Diferencia',
          'Motivo diferencia',
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
      'Las cantidades enviadas desde Canet deben coincidir con las recibidas en Huarte.',
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
    ],
    attachments: [
      'Informe de ensamblajes descargado desde Zoho',
      'Informe de ensamblajes descargado desde Lunaris',
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
        subtitle: 'Incluye bodegas de inventario Canet e inventario Huarte.',
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
    summary: 'Ventas, salidas por venta y facturación cobrada frente a Zoho y bancos.',
    fields: [
      { id: 'total_facturas_zoho', label: 'Total facturas emitidas en Zoho', type: 'money' },
      { id: 'total_pedidos_preparados', label: 'Total pedidos preparados', type: 'number' },
      { id: 'total_salidas_lunaris', label: 'Total salidas por venta en Lunaris', type: 'number' },
      { id: 'total_salidas_zoho', label: 'Total salidas por venta en Zoho', type: 'number' },
      { id: 'total_traspasos', label: 'Total traspasos', type: 'number' },
      { id: 'total_etiquetas', label: 'Total etiquetas creadas', type: 'number' },
      { id: 'diferencia_ventas_salidas', label: 'Diferencia ventas vs salidas', type: 'text' },
      { id: 'ventas_banco_vs_zoho', label: 'Total facturas/ventas reflejadas en bancos vs Zoho', type: 'money' },
    ],
    tables: [
      {
        id: 'resumen_comercial',
        title: 'Resumen comercial comparativo',
        subtitle: 'Tres productos más vendidos según cada fuente.',
        columns: ['Zoho', 'Inventario Canet', 'Inventario Huarte'],
        rows: ['Top 1', 'Top 2', 'Top 3'],
      },
      {
        id: 'ventas_producto_lote',
        title: 'Salidas por producto, lote e inventario',
        columns: ['Producto', 'Lote', 'Inventario', 'Cantidad vendida Zoho', 'Cantidad salida Lunaris', 'Diferencia', 'Motivo diferencia'],
        rows: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5'],
      },
    ],
    attachments: [
      'Informe de facturas emitidas descargado desde Zoho',
      'Informe de pedidos / envíos descargado desde Zoho',
      'Informe de salidas por venta descargado desde Lunaris',
      'Informe de ventas pagadas en banco vs ventas pendientes',
    ],
    validations: [
      'Facturas emitidas deben coincidir con pedidos preparados.',
      'Ventas registradas deben coincidir con salidas por venta.',
      'El total facturado en banco debe coincidir con las facturas por cliente.',
      'Las etiquetas creadas solo requieren número total, no PDF de etiquetas.',
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
    summary: 'Conciliación de facturas, bancos, cobros vencidos y resultado financiero.',
    fields: [
      { id: 'facturas_proveedor_revisadas', label: 'Facturas proveedor revisadas', type: 'number' },
      { id: 'facturas_cliente_revisadas', label: 'Facturas cliente revisadas', type: 'number' },
      { id: 'bancos_conciliados', label: 'Bancos conciliados: Caixa / BBVA' },
      { id: 'cobros_vencidos', label: 'Cobros vencidos relevantes', type: 'textarea' },
      { id: 'estado_financiero', label: 'Estado financiero del mes', type: 'status' },
      { id: 'objetivo_caixa', label: 'Objetivo colchón Caixa', type: 'money' },
      { id: 'objetivo_bbva', label: 'Objetivo colchón BBVA', type: 'money' },
      { id: 'diferencia_objetivo', label: 'Diferencia frente a objetivo', type: 'money' },
      { id: 'resultado_mes', label: 'Resultado del mes', type: 'money' },
      { id: 'comparacion_mes_anterior', label: 'Comparación con mes anterior' },
      { id: 'comentario_financiero', label: 'Comentario financiero general', type: 'textarea' },
    ],
    attachments: [
      'Informe de facturas proveedor revisadas',
      'Informe de facturas cliente revisadas',
      'Informe de conciliación bancaria Caixa',
      'Informe de conciliación bancaria BBVA',
      'Informe de cobros vencidos',
    ],
    validations: [
      'Facturas cliente deben ser coherentes con ventas.',
      'Facturas proveedor deben ser coherentes con entradas/albaranes.',
      'Bancos deben estar conciliados o marcar incidencia.',
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
    summary: 'Valida que los informes existen, se revisaron y coinciden entre sistemas.',
    fields: [
      { id: 'diferencias_detectadas', label: 'Diferencias detectadas', type: 'number' },
      { id: 'area_diferencia', label: 'Área de diferencia' },
      { id: 'diferencias_resueltas', label: 'Diferencias resueltas', type: 'number' },
      { id: 'diferencias_pendientes', label: 'Diferencias pendientes', type: 'number' },
      { id: 'producto_mas_vendido', label: 'Producto más vendido del mes' },
      { id: 'producto_menos_vendido', label: 'Producto menos vendido del mes' },
      { id: 'variacion_mes_anterior', label: 'Variación frente al mes anterior' },
    ],
    tables: [
      {
        id: 'analisis_stock_fuente',
        title: 'Análisis de stock por fuente',
        subtitle: 'Comparativa de exceso, riesgo y consumo aproximado entre Zoho, Canet y Huarte.',
        columns: ['Zoho', 'Inventario Canet', 'Inventario Huarte'],
        rows: ['Productos con exceso de stock', 'Productos con riesgo de rotura de stock', 'Consumo mensual aproximado'],
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
      'Sistemas debe confirmar si Zoho, Lunaris y conteos físicos coinciden.',
      'Si no coinciden, debe registrar área, motivo y responsable de resolución.',
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
    const selectedProduct = productColumn ? String(fields[fieldKey(table.id, row, productColumn)] || '').toUpperCase() : '';
    const lotOptions = selectedProduct ? lotOptionsByProduct.get(selectedProduct) || [] : [];
    return (
      <select
        value={value}
        onChange={(event) => setFieldValue(key, event.target.value)}
        disabled={!canEdit || !selectedProduct}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${ringClass} disabled:bg-slate-50`}
      >
        <option value="">{selectedProduct ? 'Lote' : 'Selecciona producto'}</option>
        {lotOptions.map((lot) => (
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
  const [canetMovements] = useInventoryMovementsDB('canet');
  const [huarteMovements] = useInventoryMovementsDB('huarte');
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

    const pushMovement = (movement: InventoryMovementRow) => {
      const product = String(movement?.producto || '').trim().toUpperCase();
      const lot = String(movement?.lote || '').trim().toUpperCase();
      if (!product || !lot || !isLongOperationalLot(lot)) return;
      const set = ensure(product);
      set?.add(lot);
    };

    [...(canetMovements || []), ...(huarteMovements || [])].forEach(pushMovement);
    return new Map(
      Array.from(map.entries()).map(([product, lots]) => [
        product,
        Array.from(lots).sort((a, b) => b.localeCompare(a, 'es')),
      ]),
    );
  }, [canetMovements, huarteMovements]);

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
        fields: mergeFields(existing?.fields, draftFields),
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
            <section className={`rounded-xl border bg-white shadow-sm ${activeDefinition.color.border}`}>
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

                {activeDefinition.fields && activeDefinition.fields.length > 0 && (
                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-700">Campos de control</h3>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {activeDefinition.fields.map((field) => (
                        <label key={field.id} className={field.type === 'textarea' ? 'space-y-1 lg:col-span-2' : 'space-y-1'}>
                          <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{field.label}</span>
                          {field.type === 'textarea' ? (
                            <textarea
                              value={draftFields[field.id] || ''}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              disabled={!canEditActiveProcess}
                              rows={3}
                              className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none ${activeDefinition.color.ring} disabled:bg-slate-50`}
                            />
                          ) : field.type === 'status' ? (
                            <select
                              value={draftFields[field.id] || ''}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              disabled={!canEditActiveProcess}
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
                              value={draftFields[field.id] || ''}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              disabled={!canEditActiveProcess}
                              className={`h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none ${activeDefinition.color.ring} disabled:bg-slate-50`}
                            />
                          )}
                          {field.hint && <span className="text-xs font-semibold text-slate-400">{field.hint}</span>}
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                {activeDefinition.tables?.map((table) => {
                  const statusMatrix = isStatusMatrix(table.columns);
                  const rows = [...table.rows, ...parseExtraRows(draftFields[tableRowsKey(table.id)])];
                  const canAddRows = tableSupportsExtraRows(table);
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
                          {rows.map((row) => (
                            <tr key={row} className="border-b border-slate-100 last:border-b-0">
                              <td className="w-20 px-2 py-1.5 text-xs font-black text-slate-500">{row}</td>
                              {table.columns.map((column) => {
                                const key = fieldKey(table.id, row, column);
                                const rowStatusKey = fieldKey(table.id, row, 'estado');
                                const normalizedColumn = normalize(column);
                                const isDifferenceColumn = normalizedColumn.includes('diferencia');
                                const zohoColumn = table.columns.find((item) => normalize(item).includes('zoho'));
                                const lunarisColumn = table.columns.find((item) => normalize(item).includes('lunaris'));
                                const zohoValue = zohoColumn ? parseControlNumber(draftFields[fieldKey(table.id, row, zohoColumn)] || '') : null;
                                const lunarisValue = lunarisColumn ? parseControlNumber(draftFields[fieldKey(table.id, row, lunarisColumn)] || '') : null;
                                const explicitDiff = parseControlNumber(draftFields[key] || '');
                                const hasComparableValues = zohoValue !== null && lunarisValue !== null;
                                const hasDifference = explicitDiff !== null ? explicitDiff !== 0 : hasComparableValues ? zohoValue !== lunarisValue : false;
                                const hasMatch = explicitDiff !== null ? explicitDiff === 0 : hasComparableValues ? zohoValue === lunarisValue : false;
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
                                    ) : renderCellInput(
                                      key,
                                      row,
                                      table,
                                      column,
                                      draftFields[key] || '',
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
                          ))}
                        </tbody>
                      </table>
                    </div>
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
