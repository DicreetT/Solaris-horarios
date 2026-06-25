import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calculator,
  Check,
  ClipboardCheck,
  ClipboardList,
  Monitor,
  Save,
  ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { FileUploader, type Attachment } from '../components/FileUploader';

type AreaKey = 'bodega' | 'ventas' | 'sistemas' | 'contabilidad' | 'administracion';
type Cadence = 'weekly' | 'monthly';
type StatusKey = 'pendiente' | 'correcto' | 'revision' | 'critica';

type OperationalRecord = {
  id: string;
  area: AreaKey;
  cadence: Cadence;
  year: number;
  month: number;
  week?: number;
  checklist: Record<string, boolean>;
  attachments?: Record<string, Attachment[]>;
  fields: Record<string, string>;
  status: StatusKey;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
};

type TableSection = {
  type: 'table';
  id: string;
  title: string;
  columns: string[];
  rows: string[];
};

type StatusSection = {
  type: 'statusRows';
  id: string;
  title: string;
  rows: string[];
};

type TextSection = {
  type: 'textarea';
  id: string;
  title: string;
};

type TemplateSection = TableSection | StatusSection | TextSection;

type TemplateDefinition = {
  title: string;
  checklist: string[];
  sections: TemplateSection[];
};

type AreaDefinition = {
  key: AreaKey;
  label: string;
  shortLabel: string;
  accent: string;
  soft: string;
  border: string;
  text: string;
  icon: React.ElementType;
  users: string[];
  weekly: TemplateDefinition;
  monthly: TemplateDefinition;
};

const STATUS_OPTIONS: Array<{ key: Exclude<StatusKey, 'pendiente'>; label: string; className: string }> = [
  { key: 'correcto', label: 'Correcto', className: 'bg-emerald-600' },
  { key: 'revision', label: 'Revisión necesaria', className: 'bg-amber-400' },
  { key: 'critica', label: 'Incidencia crítica', className: 'bg-red-500' },
];

const DEFAULT_DOCUMENTATION = [
  'Informe de entradas',
  'Informe de salidas',
  'Informe de stock',
  'Facturas',
  'Inventarios',
];

const AREA_DEFINITIONS: Record<AreaKey, AreaDefinition> = {
  bodega: {
    key: 'bodega',
    label: 'Bodega Canet',
    shortLabel: 'Bodega',
    accent: 'emerald',
    soft: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-800',
    icon: Building2,
    users: ['anabella', 'anabela', 'fer', 'fernando'],
    weekly: {
      title: 'Informe semanal - Bodega Canet',
      checklist: DEFAULT_DOCUMENTATION,
      sections: [
        {
          type: 'table',
          id: 'actividad_almacen',
          title: 'Actividad de almacén',
          columns: ['Cantidad', 'Observaciones'],
          rows: ['Entradas recibidas', 'Salidas realizadas', 'Diferencias detectadas', 'Productos dañados'],
        },
        {
          type: 'statusRows',
          id: 'estado_almacen',
          title: 'Estado del almacén',
          rows: ['Limpieza y orden', 'Control de plagas', 'Seguridad en instalaciones', 'Estado general'],
        },
        {
          type: 'table',
          id: 'incidencias',
          title: 'Incidencias',
          columns: ['Acción tomada', 'Responsable', 'Estado'],
          rows: ['Incidencia 1', 'Incidencia 2'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
    monthly: {
      title: 'Informe mensual - Bodega Canet',
      checklist: ['Informe de entradas', 'Informe de salidas', 'Cierre de stock', 'Incidencias', 'Inventarios'],
      sections: [
        {
          type: 'table',
          id: 'resumen_almacen',
          title: 'Resumen del almacén',
          columns: ['Cantidad / Importe', 'Observaciones'],
          rows: ['Stock inicial valorado', 'Entradas del mes', 'Salidas del mes', 'Stock final valorado', 'Diferencias detectadas'],
        },
        {
          type: 'table',
          id: 'productos',
          title: 'Productos',
          columns: ['Más movimientos (top 5)', 'Menos movimientos (top 5)'],
          rows: ['1', '2', '3', '4', '5'],
        },
        {
          type: 'table',
          id: 'incidencias_mes',
          title: 'Incidencias del mes',
          columns: ['Descripción', 'Impacto'],
          rows: ['Incidencia 1', 'Incidencia 2', 'Incidencia 3', 'Incidencia 4'],
        },
        {
          type: 'table',
          id: 'danados',
          title: 'Productos dañados / obsolescentes',
          columns: ['Cantidad', 'Motivo'],
          rows: ['Producto 1', 'Producto 2', 'Producto 3'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
  },
  ventas: {
    key: 'ventas',
    label: 'Ventas',
    shortLabel: 'Ventas',
    accent: 'violet',
    soft: 'bg-violet-50',
    border: 'border-violet-300',
    text: 'text-violet-800',
    icon: ShoppingCart,
    users: ['itzi', 'itziar'],
    weekly: {
      title: 'Informe semanal - Ventas',
      checklist: ['Informe de ventas', 'Facturas emitidas', 'Pedidos pendientes', 'Cobros pendientes', 'Incidencias de clientes'],
      sections: [
        {
          type: 'table',
          id: 'actividad_comercial',
          title: 'Actividad comercial',
          columns: ['Cantidad / Importe', 'Observaciones'],
          rows: ['Pedidos recibidos', 'Facturas emitidas', 'Pedidos pendientes de expedición', 'Pagos pendientes de clientes'],
        },
        {
          type: 'table',
          id: 'incidencias_clientes',
          title: 'Incidencias de clientes',
          columns: ['Cliente', 'Acción tomada', 'Estado'],
          rows: ['Incidencia 1', 'Incidencia 2', 'Incidencia 3'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
    monthly: {
      title: 'Informe mensual - Ventas',
      checklist: ['Resumen comercial', 'Facturas', 'Cobros', 'Pedidos pendientes', 'Incidencias de clientes'],
      sections: [
        {
          type: 'table',
          id: 'resumen_comercial',
          title: 'Resumen comercial',
          columns: ['Importe (€)'],
          rows: ['Ventas totales del mes', 'Pedidos recibidos', 'Facturas emitidas', 'Cobros realizados', 'Pedidos pendientes de entrega'],
        },
        {
          type: 'table',
          id: 'clientes',
          title: 'Clientes',
          columns: ['Cantidad'],
          rows: ['Nuevos clientes', 'Clientes activos'],
        },
        {
          type: 'table',
          id: 'productos',
          title: 'Productos',
          columns: ['Más vendidos (top 5)', 'Menos vendidos (top 5)'],
          rows: ['1', '2', '3', '4', '5'],
        },
        {
          type: 'table',
          id: 'incidencias_clientes',
          title: 'Incidencias de clientes',
          columns: ['Cliente', 'Acción tomada', 'Estado'],
          rows: ['Incidencia 1', 'Incidencia 2', 'Incidencia 3'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
  },
  sistemas: {
    key: 'sistemas',
    label: 'Sistemas y Control',
    shortLabel: 'Sistemas',
    accent: 'blue',
    soft: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-800',
    icon: Monitor,
    users: ['esteban'],
    weekly: {
      title: 'Informe semanal - Sistemas y Control',
      checklist: ['Zoho Inventory', 'Zoho Analytics', 'Control de stock', 'Diferencias detectadas', 'Incidencias del sistema'],
      sections: [
        {
          type: 'statusRows',
          id: 'estado_sistemas',
          title: 'Estado de los sistemas',
          rows: ['Zoho Inventory', 'Zoho Analytics'],
        },
        {
          type: 'table',
          id: 'control_stock',
          title: 'Control de stock',
          columns: ['Cantidad / Importe', 'Observaciones'],
          rows: ['Diferencias detectadas', 'Diferencias resueltas', 'Diferencias pendientes'],
        },
        {
          type: 'table',
          id: 'incidencias_sistema',
          title: 'Incidencias del sistema',
          columns: ['Acción tomada', 'Estado'],
          rows: ['Incidencia 1', 'Incidencia 2'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
    monthly: {
      title: 'Informe mensual - Sistemas y Control',
      checklist: ['Resumen de stock', 'Diferencias', 'Análisis de productos', 'Consumo', 'Estado de sistemas'],
      sections: [
        {
          type: 'table',
          id: 'resumen_stock',
          title: 'Resumen de stock',
          columns: ['Importe (€)'],
          rows: ['Stock inicial valorado', 'Entradas del mes', 'Salidas del mes', 'Stock final valorado'],
        },
        {
          type: 'table',
          id: 'diferencias',
          title: 'Diferencias',
          columns: ['Importe (€)'],
          rows: ['Diferencias detectadas', 'Diferencias resueltas', 'Diferencias pendientes'],
        },
        {
          type: 'table',
          id: 'analisis_productos',
          title: 'Análisis de productos',
          columns: ['Exceso de stock', 'Riesgo de rotura', 'Baja rotación'],
          rows: ['1', '2', '3', '4', '5'],
        },
        {
          type: 'table',
          id: 'consumo',
          title: 'Consumo',
          columns: ['Consumo medio mensual (unidades)'],
          rows: ['1', '2', '3', '4', '5'],
        },
        {
          type: 'statusRows',
          id: 'estado_sistemas',
          title: 'Estado de los sistemas',
          rows: ['Zoho Inventory', 'Zoho Analytics'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
  },
  contabilidad: {
    key: 'contabilidad',
    label: 'Contabilidad',
    shortLabel: 'Contabilidad',
    accent: 'orange',
    soft: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-700',
    icon: Calculator,
    users: ['heidy', 'heidi'],
    weekly: {
      title: 'Informe semanal - Contabilidad',
      checklist: ['Bancos', 'Facturas proveedor', 'Facturas cliente', 'Pagos realizados', 'Alertas financieras'],
      sections: [
        {
          type: 'table',
          id: 'situacion_financiera',
          title: 'Situación financiera',
          columns: ['Saldo actual', 'Objetivo', 'Estado'],
          rows: ['Caja', 'BBVA', 'Total'],
        },
        {
          type: 'table',
          id: 'resultado_semanal',
          title: 'Resultado semanal',
          columns: ['Importe (€)'],
          rows: ['Ingresos', 'Gastos', 'Resultado'],
        },
        {
          type: 'table',
          id: 'facturas_pagos',
          title: 'Facturas y pagos',
          columns: ['Importe (€)'],
          rows: ['Facturas proveedor pendientes de pago', 'Facturas cliente pendientes de cobro', 'Pagos realizados', 'Pagos pendientes'],
        },
        {
          type: 'table',
          id: 'alertas_financieras',
          title: 'Alertas financieras',
          columns: ['Detalle'],
          rows: ['Próximos pagos importantes', 'Impuestos próximos', 'Cobros importantes pendientes', 'Otras alertas'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
    monthly: {
      title: 'Informe mensual - Contabilidad',
      checklist: ['Situación financiera', 'Resultado del mes', 'Comparativa', 'Facturas y pagos', 'Alertas financieras'],
      sections: [
        {
          type: 'table',
          id: 'bancos',
          title: 'Situación financiera - bancos',
          columns: ['Saldo actual (€)', 'Objetivo (€)', 'Estado'],
          rows: ['Caja', 'BBVA', 'Total'],
        },
        {
          type: 'table',
          id: 'fondos',
          title: 'Fondos estratégicos',
          columns: ['Objetivo (€)', 'Actual (€)', '% avance'],
          rows: ['Fondo Reserva', 'Fondo Educación', 'Fondo Marketing', 'Fondo Proyectos', 'Total fondos'],
        },
        {
          type: 'table',
          id: 'resultado_mes',
          title: 'Resultado del mes',
          columns: ['Importe (€)'],
          rows: ['Ingresos', 'Gastos', 'Resultado del mes', '% Margen'],
        },
        {
          type: 'table',
          id: 'comparativa',
          title: 'Comparativa',
          columns: ['Mes anterior (€)', 'Mes actual (€)', 'Variación (%)'],
          rows: ['Ingresos', 'Gastos', 'Resultado'],
        },
        {
          type: 'table',
          id: 'alertas',
          title: 'Alertas financieras',
          columns: ['Descripción', 'Fecha / Vencimiento'],
          rows: ['Alerta 1', 'Alerta 2', 'Alerta 3', 'Alerta 4'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones financieras' },
      ],
    },
  },
  administracion: {
    key: 'administracion',
    label: 'Administración',
    shortLabel: 'Administración',
    accent: 'teal',
    soft: 'bg-teal-50',
    border: 'border-teal-300',
    text: 'text-teal-800',
    icon: ClipboardList,
    users: ['thalia'],
    weekly: {
      title: 'Informe semanal - Administración',
      checklist: ['Compras y proveedores', 'Documentación de bodega', 'Documentación de ventas', 'Documentación de sistemas', 'Documentación de contabilidad'],
      sections: [
        {
          type: 'table',
          id: 'compras_proveedores',
          title: 'Compras y proveedores',
          columns: ['Observaciones'],
          rows: ['Compras realizadas', 'Compras pendientes', 'Proveedores pendientes documentación', 'Incidencias con proveedores'],
        },
        {
          type: 'table',
          id: 'documentacion',
          title: 'Documentación',
          columns: ['Completa', 'Pendiente'],
          rows: ['Documentación de Bodega Canet', 'Documentación de Ventas', 'Documentación de Sistemas', 'Documentación de Contabilidad'],
        },
        {
          type: 'table',
          id: 'acciones_abiertas',
          title: 'Acciones abiertas',
          columns: ['Responsable', 'Fecha límite', 'Estado'],
          rows: ['Acción 1', 'Acción 2', 'Acción 3'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
    monthly: {
      title: 'Informe mensual - Administración',
      checklist: ['Compras', 'Proveedores', 'Documentación', 'Acciones abiertas', 'Decisiones estratégicas'],
      sections: [
        {
          type: 'table',
          id: 'compras_proveedores',
          title: 'Compras y proveedores',
          columns: ['Cantidad / Importe (€)', 'Observaciones'],
          rows: ['Compras realizadas', 'Compras pendientes', 'Proveedores activos', 'Proveedores pendientes documentación', 'Incidencias con proveedores'],
        },
        {
          type: 'table',
          id: 'documentacion',
          title: 'Documentación',
          columns: ['Completa', 'Pendiente'],
          rows: ['Documentación Bodega Canet', 'Documentación Ventas', 'Documentación Sistemas', 'Documentación Contabilidad'],
        },
        {
          type: 'table',
          id: 'acciones_abiertas',
          title: 'Acciones abiertas',
          columns: ['Responsable', 'Fecha límite', 'Estado'],
          rows: ['Acción 1', 'Acción 2', 'Acción 3', 'Acción 4'],
        },
        {
          type: 'table',
          id: 'decisiones',
          title: 'Decisiones y acciones estratégicas',
          columns: ['Responsable', 'Prioridad'],
          rows: ['Decisión 1', 'Decisión 2', 'Decisión 3'],
        },
        { type: 'textarea', id: 'observaciones', title: 'Observaciones generales' },
      ],
    },
  },
};

const AREA_ORDER: AreaKey[] = ['bodega', 'ventas', 'sistemas', 'contabilidad', 'administracion'];
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

function getWeekOfMonth(date: Date) {
  return Math.max(1, Math.ceil(date.getDate() / 7));
}

function getRecordKey(area: AreaKey, cadence: Cadence, year: number, month: number, week?: number) {
  return [area, cadence, year, month, cadence === 'weekly' ? week || 1 : 'month'].join(':');
}

function getRecord(records: OperationalRecord[], area: AreaKey, cadence: Cadence, year: number, month: number, week?: number) {
  const key = getRecordKey(area, cadence, year, month, week);
  return records.find((record) => getRecordKey(record.area, record.cadence, record.year, record.month, record.week) === key);
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

function statusMeta(status: StatusKey) {
  if (status === 'correcto') return { label: 'Guardado correcto', dot: 'bg-emerald-600', card: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800' };
  if (status === 'revision') return { label: 'Revisión necesaria', dot: 'bg-amber-400', card: 'border-amber-200 bg-amber-50', text: 'text-amber-800' };
  if (status === 'critica') return { label: 'Incidencia crítica', dot: 'bg-red-500', card: 'border-red-200 bg-red-50', text: 'text-red-700' };
  return { label: 'Pendiente de rellenar', dot: 'bg-slate-300', card: 'border-slate-200 bg-white', text: 'text-slate-600' };
}

function fieldKey(sectionId: string, row: string, column: string) {
  return `${sectionId}.${row}.${column}`;
}

function checklistAttachmentKey(item: string) {
  return normalize(item).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function getUserAreas(currentUserName: string, isAdmin: boolean) {
  if (isAdmin) return AREA_ORDER;
  return AREA_ORDER.filter((areaKey) =>
    AREA_DEFINITIONS[areaKey].users.some((userName) => currentUserName.includes(userName)),
  );
}

function isPastPeriod(cadence: Cadence, year: number, month: number, week: number) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  if (year < currentYear) return true;
  if (year > currentYear) return false;
  if (month < currentMonth) return true;
  if (month > currentMonth) return false;
  if (cadence === 'monthly') return false;
  return week < getWeekOfMonth(today);
}

function EmptyAccessState() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <p className="font-bold">No hay plantillas asignadas a este usuario.</p>
      <p className="mt-1 text-sm">Thalia puede revisar la asignación de roles si esta persona debe tener acceso al Control Operativo.</p>
    </div>
  );
}

export default function OperationalControlPage() {
  const { currentUser } = useAuth();
  const today = new Date();
  const currentUserName = normalize(currentUser?.name || currentUser?.email || '');
  const isAdmin = !!currentUser?.isAdmin || currentUserName.includes('thalia');
  const userAreas = useMemo(() => getUserAreas(currentUserName, isAdmin), [currentUserName, isAdmin]);
  const [records, setRecords, loading] = useSharedJsonState<OperationalRecord[]>(
    'operational_control_records_v1',
    [],
    {
      userId: currentUser?.id,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
    },
  );

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [week, setWeek] = useState(getWeekOfMonth(today));
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [selectedArea, setSelectedArea] = useState<AreaKey>(userAreas[0] || 'bodega');
  const visibleAreas = userAreas.length > 0 ? userAreas : [];
  const activeArea = visibleAreas.includes(selectedArea) ? selectedArea : visibleAreas[0];
  const areaDef = activeArea ? AREA_DEFINITIONS[activeArea] : null;
  const template = areaDef ? areaDef[cadence] : null;
  const currentRecord = activeArea ? getRecord(records, activeArea, cadence, year, month, week) : undefined;
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [draftChecklist, setDraftChecklist] = useState<Record<string, boolean>>({});
  const [draftAttachments, setDraftAttachments] = useState<Record<string, Attachment[]>>({});
  const [draftStatus, setDraftStatus] = useState<StatusKey>('pendiente');
  const fields = draftFields;
  const checklist = draftChecklist;
  const attachments = draftAttachments;
  const selectedStatus = draftStatus;
  const readOnly = !isAdmin && isPastPeriod(cadence, year, month, week);
  const canEdit = !!activeArea && !readOnly && visibleAreas.includes(activeArea);

  useEffect(() => {
    setDraftFields(currentRecord?.fields || {});
    setDraftChecklist(currentRecord?.checklist || {});
    setDraftAttachments(currentRecord?.attachments || {});
    setDraftStatus(currentRecord?.status || 'pendiente');
  }, [currentRecord?.id, currentRecord?.updatedAt, activeArea, cadence, year, month, week]);

  const setFieldValue = (key: string, value: string) => {
    if (!activeArea || !canEdit) return;
    setDraftFields((prev) => ({ ...prev, [key]: value }));
  };

  const setChecklistValue = (item: string, checked: boolean) => {
    if (!activeArea || !canEdit) return;
    setDraftChecklist((prev) => ({ ...prev, [item]: checked }));
  };

  const setAttachmentValue = (item: string, files: Attachment[]) => {
    if (!activeArea || !canEdit) return;
    setDraftAttachments((prev) => ({ ...prev, [item]: files }));
    if (files.length > 0) {
      setDraftChecklist((prev) => ({ ...prev, [item]: true }));
    }
  };

  const setStatus = (status: Exclude<StatusKey, 'pendiente'>) => {
    if (!activeArea || !canEdit) return;
    setDraftStatus(status);
  };

  const saveRecord = () => {
    if (!activeArea || !canEdit) return;
    setRecords((prev) => {
      const existing = getRecord(prev, activeArea, cadence, year, month, week);
      const nextRecord: OperationalRecord = {
        id: existing?.id || createId(),
        area: activeArea,
        cadence,
        year,
        month,
        week: cadence === 'weekly' ? week : undefined,
        checklist: draftChecklist,
        attachments: draftAttachments,
        fields: draftFields,
        status: draftStatus === 'pendiente' ? 'correcto' : draftStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.id || '',
        updatedByName: currentUser?.name || '',
      };
      const recordKey = getRecordKey(activeArea, cadence, year, month, week);
      return [...prev.filter((record) => getRecordKey(record.area, record.cadence, record.year, record.month, record.week) !== recordKey), nextRecord];
    });
    if (draftStatus === 'pendiente') setDraftStatus('correcto');
    emitSuccessFeedback('Informe guardado correctamente.');
  };

  if (!areaDef || !template || !activeArea) {
    return (
      <main className="min-h-screen bg-[#f7f3ec] px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <EmptyAccessState />
        </div>
      </main>
    );
  }

  const AreaIcon = areaDef.icon;
  const monthLabel = MONTHS.find((item) => item.value === month)?.label || '';

  return (
    <main className="min-h-screen bg-[#f7f3ec] px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-700">Centro de mando / Operación</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Control Operativo Solaris</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">
                Semáforo documental por área, con informes semanales y mensuales guardados dentro de Lunaris.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Año</span>
                <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">
                  {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Mes</span>
                <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold capitalize">
                  {MONTHS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Periodo</span>
                <select value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </label>
              {cadence === 'weekly' && (
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Semana</span>
                  <select value={week} onChange={(event) => setWeek(Number(event.target.value))} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">
                    {[1, 2, 3, 4, 5].map((item) => (
                      <option key={item} value={item}>Semana {item}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          {visibleAreas.map((areaKey) => {
            const definition = AREA_DEFINITIONS[areaKey];
            const record = getRecord(records, areaKey, cadence, year, month, week);
            const meta = statusMeta(record?.status || 'pendiente');
            const Icon = definition.icon;
            return (
              <button
                key={areaKey}
                onClick={() => setSelectedArea(areaKey)}
                className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  selectedArea === areaKey ? `${definition.border} ${definition.soft}` : meta.card
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`rounded-xl border bg-white p-2 ${definition.border} ${definition.text}`}>
                    <Icon size={22} />
                  </div>
                  <span className={`mt-1 h-3 w-3 rounded-full ${meta.dot}`} />
                </div>
                <h2 className="mt-4 text-lg font-black text-slate-950">{definition.shortLabel}</h2>
                <p className={`mt-1 text-sm font-bold ${meta.text}`}>{meta.label}</p>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {record ? `Última modificación: ${formatDateTime(record.updatedAt)}` : 'Sin informe guardado'}
                </p>
              </button>
            );
          })}
        </section>

        <section className={`rounded-2xl border bg-white shadow-sm ${areaDef.border}`}>
          <div className={`border-b px-5 py-4 ${areaDef.border} ${areaDef.soft}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border bg-white p-3 ${areaDef.border} ${areaDef.text}`}>
                  <AreaIcon size={28} />
                </div>
                <div>
                  <p className={`text-xs font-black uppercase tracking-[0.22em] ${areaDef.text}`}>
                    {cadence === 'weekly' ? `Semana ${week} / ${monthLabel} ${year}` : `${monthLabel} ${year}`}
                  </p>
                  <h2 className="text-2xl font-black text-slate-950">{template.title}</h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {loading && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Sincronizando...</span>}
                {readOnly && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Modo lectura histórico</span>}
                <button
                  onClick={saveRecord}
                  disabled={!canEdit}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Save size={18} />
                  Guardar
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck size={20} className="text-slate-700" />
                <h3 className="text-lg font-black text-slate-950">Documentación revisada</h3>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {template.checklist.map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="flex items-center gap-3 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!checklist[item]}
                        onChange={(event) => setChecklistValue(item, event.target.checked)}
                        disabled={!canEdit}
                        className="h-4 w-4 rounded border-slate-300 text-teal-700"
                      />
                      {item}
                    </label>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {canEdit ? (
                        <FileUploader
                          key={`${activeArea}-${cadence}-${year}-${month}-${week}-${item}`}
                          compact
                          maxSizeMB={12}
                          acceptedTypes="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                          folderPath={`control-operativo/${year}/${String(month).padStart(2, '0')}/${cadence}/${activeArea}/${checklistAttachmentKey(item)}`}
                          existingFiles={attachments[item] || []}
                          onUploadComplete={(files) => setAttachmentValue(item, files)}
                        />
                      ) : (attachments[item] || []).length > 0 ? (
                        <div className="grid gap-2">
                          {(attachments[item] || []).map((file) => (
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
                ))}
              </div>
            </section>

            {template.sections.map((section) => {
              if (section.type === 'textarea') {
                return (
                  <section key={section.id} className={`rounded-2xl border ${areaDef.border} bg-white`}>
                    <h3 className={`border-b px-4 py-2 text-sm font-black uppercase tracking-[0.12em] ${areaDef.border} ${areaDef.soft} ${areaDef.text}`}>{section.title}</h3>
                    <textarea
                      value={fields[section.id] || ''}
                      onChange={(event) => setFieldValue(section.id, event.target.value)}
                      disabled={!canEdit}
                      rows={5}
                      className="min-h-32 w-full resize-y rounded-b-2xl border-0 px-4 py-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"
                    />
                  </section>
                );
              }

              if (section.type === 'statusRows') {
                return (
                  <section key={section.id} className={`overflow-hidden rounded-2xl border ${areaDef.border} bg-white`}>
                    <h3 className={`border-b px-4 py-2 text-sm font-black uppercase tracking-[0.12em] ${areaDef.border} ${areaDef.soft} ${areaDef.text}`}>{section.title}</h3>
                    <div className="divide-y divide-slate-100">
                      {section.rows.map((row) => (
                        <div key={row} className="grid gap-2 px-4 py-3 lg:grid-cols-[1.2fr_2fr] lg:items-center">
                          <p className="text-sm font-bold text-slate-700">{row}</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {STATUS_OPTIONS.map((option) => {
                              const key = fieldKey(section.id, row, 'estado');
                              return (
                                <label key={option.key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                                  <input
                                    type="radio"
                                    name={key}
                                    checked={fields[key] === option.key}
                                    onChange={() => setFieldValue(key, option.key)}
                                    disabled={!canEdit}
                                  />
                                  {option.label}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              }

              return (
                <section key={section.id} className={`overflow-hidden rounded-2xl border ${areaDef.border} bg-white`}>
                  <h3 className={`border-b px-4 py-2 text-sm font-black uppercase tracking-[0.12em] ${areaDef.border} ${areaDef.soft} ${areaDef.text}`}>{section.title}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                          <th className="border-b border-slate-200 px-3 py-2 text-left">Concepto</th>
                          {section.columns.map((column) => (
                            <th key={column} className="border-b border-slate-200 px-3 py-2 text-left">{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row) => (
                          <tr key={row} className="border-b border-slate-100 last:border-b-0">
                            <td className="w-56 px-3 py-2 font-bold text-slate-700">{row}</td>
                            {section.columns.map((column) => {
                              const key = fieldKey(section.id, row, column);
                              return (
                                <td key={column} className="px-2 py-1.5">
                                  <input
                                    value={fields[key] || ''}
                                    onChange={(event) => setFieldValue(key, event.target.value)}
                                    disabled={!canEdit}
                                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50"
                                  />
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

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-600">
                {cadence === 'weekly' ? 'Semáforo semanal' : 'Estado general del mes'}
              </h3>
              <div className="flex flex-wrap gap-3">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setStatus(option.key)}
                    disabled={!canEdit}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black transition ${
                      selectedStatus === option.key ? 'border-slate-900 bg-white text-slate-950 shadow-sm' : 'border-slate-200 bg-white text-slate-600'
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    <span className={`h-4 w-4 rounded-full ${option.className}`} />
                    {selectedStatus === option.key && <Check size={16} />}
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                <AlertTriangle size={16} />
                Los informes anteriores quedan en lectura para usuarias sin permiso de administración.
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
