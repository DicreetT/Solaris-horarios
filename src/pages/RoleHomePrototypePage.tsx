import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AtSign,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  PackageCheck,
  PlusCircle,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Truck,
  UserCheck,
  Users,
  WalletCards,
  Wrench,
  X,
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { ESTEBAN_ID, USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import { supabase } from '../lib/supabase';
import { useAbsences } from '../hooks/useAbsences';
import { isAnnouncementActiveOn, isAnnouncementVisibleForUser, useAnnouncements } from '../hooks/useAnnouncements';
import { useFinanceOperations } from '../hooks/useFinanceOperations';
import { getInventoryDailyStatus, useInventoryDailyEvents } from '../hooks/useInventoryDailyEvents';
import { Mention, mentionStatusLabel, mentionTypeLabel, useMentions } from '../hooks/useMentions';
import { calculateProjectProgress, canUserSeeProject, projectStatusLabel, projectTypeLabel, useProjects } from '../hooks/useProjects';
import type { LunarisProject } from '../hooks/useProjects';
import { useSalesLearning } from '../hooks/useSalesLearning';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { useShoppingList } from '../hooks/useShoppingList';
import { useTodos } from '../hooks/useTodos';
import { getWeekDateKeys, getWeekStartKey, useWeeklyWorkPlans } from '../hooks/useWeeklyWorkPlans';
import { toDateKey } from '../utils/dateUtils';

type RoleKey = 'direction' | 'sales' | 'warehouse' | 'finance' | 'operations' | 'support';

const FER_ID = '4ca49a9d-7ee5-4b54-8e93-bc4833de549a';

type PanelRow = {
  label: string;
  detail?: string;
  status?: string;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'slate';
};

type PanelMetric = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'slate';
};

type PanelCard = {
  title: string;
  icon: React.ElementType;
  badge?: string;
  span?: 'wide' | 'tall';
  rows?: PanelRow[];
  metrics?: PanelMetric[];
  table?: {
    headers: string[];
    rows: string[][];
  };
  progress?: {
    value: number;
    label: string;
    detail?: string;
  };
  actions?: string[];
  note?: string;
  path?: string;
  panelTitle?: string;
};

type RoleHome = {
  key: RoleKey;
  userName: string;
  userId: string;
  title: string;
  greeting: string;
  motto: string;
  accent: string;
  accentText: string;
  pageBg: string;
  sidebarBg: string;
  sidebarActive: string;
  soft: string;
  border: string;
  nav: Array<{ label: string; icon: React.ElementType; path?: string; panelTitle?: string; section?: 'primary' | 'secondary' }>;
  cards: PanelCard[];
};

type DailyAgendaState = Record<string, Record<string, Record<string, string>>>;
type HomeChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
  source?: 'template' | 'personal';
  created_at?: string;
};

const FACTURACION_ARCHIVE_KEY = 'facturacion_archive_v1';
const ALBARANES_STATE_KEY = 'albaranes_state_v1';
const PAYMENT_REQUESTS_KEY = 'facturacion_payment_requests_v1';

const agendaHours = Array.from({ length: 10 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);

const userIdByName = (name: string) => USERS.find((u) => u.name.toLowerCase() === name.toLowerCase())?.id || '';

const roleHomes: RoleHome[] = [
  {
    key: 'direction',
    userName: 'Thalia',
    userId: userIdByName('Thalia'),
    greeting: 'Hola, Thalia',
    title: 'Dirección · Estrategia · Administración',
    motto: 'Visión, coherencia y crecimiento',
    accent: 'bg-amber-600',
    accentText: 'text-amber-800',
    pageBg: 'bg-[#fff7e6]',
    sidebarBg: 'bg-[#f9edcf]',
    sidebarActive: 'bg-amber-700 text-white',
    soft: 'bg-amber-50',
    border: 'border-amber-200',
    nav: [
      { label: 'Mi espacio', icon: Home, path: '/inicio-roles' },
      { label: 'Inicio', icon: Home, path: '/inicio-roles' },
      { label: 'Consumo de empresa', icon: BarChart3, panelTitle: 'Consumo de empresa' },
      { label: 'Control de stock', icon: Boxes, path: '/inventory?view=canet&tab=control_stock' },
      { label: 'Proveedores', icon: ShoppingCart, path: '/dossier-trazabilidad' },
      { label: 'Trazabilidad', icon: ShieldCheck, path: '/dossier-trazabilidad' },
      { label: 'Facturación a pagar', icon: ReceiptText, path: '/facturacion' },
      { label: 'Equipo y horas', icon: Users, path: '/time-tracking' },
      { label: 'Presupuesto de proyecto', icon: FolderKanban, panelTitle: 'Presupuesto de proyecto' },
      { label: 'Estado general de áreas', icon: ShieldCheck, section: 'secondary', panelTitle: 'Estado general de áreas' },
      { label: 'Decisiones pendientes', icon: Inbox, section: 'secondary', panelTitle: 'Decisiones pendientes' },
      { label: 'Presupuestos de proyecto', icon: FolderKanban, section: 'secondary', panelTitle: 'Presupuestos de proyecto' },
      { label: 'Ventas', icon: BarChart3, section: 'secondary', panelTitle: 'Estado ventas' },
      { label: 'Operaciones', icon: Wrench, section: 'secondary', panelTitle: 'Estado operaciones' },
      { label: 'Inventario', icon: Boxes, section: 'secondary', path: '/inventory' },
      { label: 'Finanzas', icon: WalletCards, section: 'secondary', path: '/facturacion' },
      { label: 'Recursos', icon: Users, section: 'secondary', panelTitle: 'Recursos' },
      { label: 'Documentos', icon: FileText, section: 'secondary', path: '/folders' },
    ],
    cards: [
      {
        title: 'Estado general de áreas',
        icon: ShieldCheck,
        span: 'wide',
        rows: [
          { label: 'Ventas', detail: 'Clientes del día, producto, lote y cantidades vendidas', status: 'Desplegar', tone: 'green' },
          { label: 'Operaciones', detail: 'Proyectos activos de la semana y porcentaje de avance', status: 'Desplegar', tone: 'amber' },
          { label: 'Inventario', detail: 'Control de stock visible para Dirección', status: 'Desplegar', tone: 'green' },
          { label: 'Finanzas', detail: 'Proveedores y deuda pendiente por proveedor', status: 'Desplegar', tone: 'amber' },
          { label: 'Formación', detail: 'Resumen de formaciones creadas y activas', status: 'Desplegar', tone: 'green' },
        ],
        panelTitle: 'Estado general de áreas',
      },
      {
        title: 'Formación y aprendizaje',
        icon: BookOpen,
        rows: [
          { label: 'Sin formaciones activas reales', detail: 'Se alimenta de Formación', tone: 'slate' },
        ],
        panelTitle: 'Formación y aprendizaje',
      },
      {
        title: 'Calendario de hoy',
        icon: CalendarDays,
        span: 'wide',
        table: {
          headers: ['Hora', 'Actividad'],
          rows: agendaHours.map((hour) => [hour, '']),
        },
        panelTitle: 'Calendario de hoy',
      },
    ],
  },
  {
    key: 'sales',
    userName: 'Itzi',
    userId: userIdByName('Itzi'),
    greeting: 'Hola, Itzi',
    title: 'Ventas · Soporte de alumnos · Formación',
    motto: 'Conectar, entender, ayudar y crecer',
    accent: 'bg-rose-500',
    accentText: 'text-rose-700',
    pageBg: 'bg-[#fff0f4]',
    sidebarBg: 'bg-[#ffd8e3]',
    sidebarActive: 'bg-rose-500 text-white',
    soft: 'bg-rose-50',
    border: 'border-rose-200',
    nav: [
      { label: 'Mi espacio', icon: Home, path: '/inicio-roles' },
      { label: 'Inicio', icon: Home, path: '/inicio-roles' },
      { label: 'Mis tareas', icon: CheckSquare, path: '/tasks' },
      { label: 'Mi jornada', icon: Clock, path: '/time-tracking' },
      { label: 'Despachos', icon: Truck, path: '/despachos' },
      { label: 'Inventario vista', icon: Boxes, path: '/inventory' },
      { label: 'Acuerdos comerciales', icon: WalletCards, panelTitle: 'Acuerdos comerciales' },
      { label: 'Incidencias alumnos', icon: UserCheck, panelTitle: 'Incidencias de alumnos' },
      { label: 'Control operativo', icon: ClipboardCheck, path: '/control-operativo' },
      { label: 'Cuaderno comercial', icon: MessageSquareText, section: 'secondary', panelTitle: 'Cuaderno comercial' },
      { label: 'Preguntas frecuentes', icon: BookOpen, section: 'secondary', panelTitle: 'Preguntas frecuentes' },
      { label: 'Propuesta proyecto', icon: PlusCircle, section: 'secondary', panelTitle: 'Propuesta de proyecto' },
    ],
    cards: [
      {
        title: 'Soporte de alumnos hoy',
        icon: UserCheck,
        badge: '0',
        rows: [
          { label: '0 consultas pendientes reales', detail: 'Según soporte de alumnos', tone: 'slate' },
        ],
        panelTitle: 'Soporte de alumnos',
      },
      {
        title: 'Formaciones activas',
        icon: BookOpen,
        badge: '0',
        rows: [
          { label: 'Sin formaciones activas reales', detail: 'Se alimenta de Formación y aprendizaje', tone: 'slate' },
        ],
      },
      {
        title: 'Radar comercial',
        icon: BarChart3,
        metrics: [
          { label: 'Consultas recibidas', value: '0', hint: 'Soporte real', tone: 'slate' },
          { label: 'Oportunidades', value: '0', hint: 'Radar real', tone: 'slate' },
          { label: 'Preguntas frecuentes', value: '0', hint: 'FAQ reales', tone: 'slate' },
          { label: 'Necesidades detectadas', value: '0', hint: 'Necesidades reales', tone: 'slate' },
        ],
      },
      {
        title: 'Preguntas frecuentes nuevas',
        icon: MessageSquareText,
        rows: [
          { label: '0 preguntas frecuentes reales', detail: 'Se alimenta de Preguntas frecuentes', tone: 'slate' },
        ],
      },
      {
        title: 'Detección de necesidades',
        icon: Lightbulb,
        rows: [
          { label: '0 necesidades reales registradas', detail: 'Se alimenta de Cuaderno comercial', tone: 'slate' },
        ],
      },
      {
        title: 'Mis tareas de hoy',
        icon: CheckSquare,
        rows: [
          { label: 'Responder WhatsApp' },
          { label: 'Revisar dudas de acceso' },
          { label: 'Detectar nuevas necesidades' },
          { label: 'Actualizar preguntas frecuentes' },
        ],
        path: '/tasks',
      },
      {
        title: 'Mi jornada',
        icon: Clock,
        table: {
          headers: ['Hora', 'Bloque'],
          rows: [
            ['09:00', 'Atención clientes'],
            ['12:00', 'Soporte alumnos'],
            ['15:00', 'Seguimiento comercial'],
            ['17:00', 'Revisión necesidades'],
          ],
        },
        path: '/time-tracking',
      },
      {
        title: 'Notas rápidas',
        icon: FileText,
        note: 'Ideas, recordatorios, cosas para revisar...',
      },
    ],
  },
  {
    key: 'warehouse',
    userName: 'Anabella',
    userId: userIdByName('Anabella'),
    greeting: 'Hola, Anabella',
    title: 'Almacén · Inventario · Logística',
    motto: 'Orden, calidad y flujo',
    accent: 'bg-sky-600',
    accentText: 'text-sky-800',
    pageBg: 'bg-[#ecf8ff]',
    sidebarBg: 'bg-[#d6effc]',
    sidebarActive: 'bg-sky-600 text-white',
    soft: 'bg-sky-50',
    border: 'border-sky-200',
    nav: [
      { label: 'Mi espacio', icon: Home, path: '/inicio-roles' },
      { label: 'Inicio', icon: Home, path: '/inicio-roles' },
      { label: 'Mis tareas', icon: CheckSquare, path: '/tasks' },
      { label: 'Mi jornada', icon: Clock, path: '/time-tracking' },
      { label: 'Inventario', icon: Boxes, path: '/inventory' },
      { label: 'Lotes y trazabilidad', icon: ShieldCheck, path: '/dossier-trazabilidad' },
      { label: 'Incidencias', icon: AlertCircle, panelTitle: 'Incidencias de producto' },
      { label: 'Despachos', icon: Truck, path: '/despachos' },
      { label: 'Proveedores', icon: ShoppingCart, panelTitle: 'Reposición a proveedor' },
      { label: 'Check-list diario', icon: ListChecks, path: '/checklist' },
    ],
    cards: [
      {
        title: 'Pedidos de hoy',
        icon: PackageCheck,
        metrics: [
          { label: 'Pendientes', value: '0', tone: 'slate' },
          { label: 'En preparación', value: '0', tone: 'slate' },
          { label: 'Listos para enviar', value: '0', tone: 'slate' },
        ],
        path: '/despachos',
      },
      {
        title: 'Stock crítico',
        icon: AlertCircle,
        rows: [
          { label: 'Solar Vital', status: '5 unidades', tone: 'red' },
          { label: 'Digestivo', status: '8 unidades', tone: 'amber' },
          { label: 'Sales de Prana', status: '6 unidades', tone: 'amber' },
        ],
        path: '/inventory?view=canet&tab=control_stock',
      },
      {
        title: 'Incidencias de producto',
        icon: AlertCircle,
        badge: '2',
        rows: [
          { label: 'Lote SV-2026-08', status: '3 dañadas', tone: 'red' },
          { label: 'Lote DP-2026-07', status: '1 dañada', tone: 'red' },
        ],
        path: '/albaranes',
      },
      {
        title: 'Evento diario inventario',
        icon: CalendarDays,
        rows: [
          { label: 'Crear evento del día', detail: 'Stock, movimientos y revisión diaria' },
          { label: 'Revisión Anabela', status: 'Físico' },
          { label: 'Revisión Itzi', status: 'Zoho / movimientos' },
          { label: 'Revisión Heidy', status: 'Conciliación' },
        ],
        path: '/eventos-inventario',
      },
      {
        title: 'Despachos de hoy',
        icon: Truck,
        table: {
          headers: ['Pedido', 'Cliente', 'Estado'],
          rows: [
            ['#4582', 'Cliente del día', 'Preparando'],
            ['#4581', 'Cliente del día', 'Listo'],
            ['#4580', 'Cliente del día', 'Enviado'],
          ],
        },
        path: '/despachos',
      },
      {
        title: 'Carpeta despachos',
        icon: FileText,
        span: 'wide',
        rows: [
          { label: 'Despachos guardados', detail: 'Acceso a la carpeta y registros existentes' },
          { label: 'Documentos del día', detail: 'Facturas, clientes y soporte de salida' },
        ],
        path: '/folders',
      },
    ],
  },
  {
    key: 'finance',
    userName: 'Heidy',
    userId: userIdByName('Heidy'),
    greeting: 'Buenas, Heidy',
    title: 'Finanzas · Contabilidad · Administración',
    motto: 'Claridad, control y sostenibilidad',
    accent: 'bg-violet-600',
    accentText: 'text-violet-800',
    pageBg: 'bg-[#f5efff]',
    sidebarBg: 'bg-[#eadfff]',
    sidebarActive: 'bg-violet-600 text-white',
    soft: 'bg-violet-50',
    border: 'border-violet-200',
    nav: [
      { label: 'Mi espacio', icon: Home, path: '/inicio-roles' },
      { label: 'Inicio', icon: Home, path: '/inicio-roles' },
      { label: 'Mis tareas', icon: CheckSquare, path: '/tasks' },
      { label: 'Mi jornada', icon: Clock, path: '/time-tracking' },
      { label: 'Microcobrables', icon: WalletCards, panelTitle: 'Microcobrables' },
      { label: 'Cierres contables', icon: ClipboardCheck, panelTitle: 'Cierres contables' },
      { label: 'Facturación', icon: ReceiptText, path: '/facturacion' },
      { label: 'Compras', icon: ShoppingCart, path: '/shopping' },
      { label: 'Cupones y promociones', icon: Tags, panelTitle: 'Cupones y promociones' },
      { label: 'Inventario vista', icon: Boxes, path: '/inventory' },
      { label: 'Informes', icon: FileText, path: '/finanzas-operativas?view=informes' },
      { label: 'Proyectos costes', icon: BriefcaseBusiness, path: '/finanzas-operativas?view=costes' },
      { label: 'Documentos', icon: FileText, path: '/folders' },
    ],
    cards: [
      {
        title: 'Cierre del mes',
        icon: ClipboardCheck,
        rows: [
          { label: 'Facturas por revisar', detail: 'Pendientes para conciliar' },
          { label: 'Conciliación inventario', detail: 'Conciliado / no cuadra' },
          { label: 'Gastos del mes', detail: 'Total mensual estimado' },
          { label: 'Informe mensual', detail: 'Socios · PyG · gastos/proveedores' },
        ],
        path: '/finanzas-operativas?view=informes',
      },
      {
        title: 'Cupones y promociones',
        icon: Tags,
        badge: '0',
        rows: [
          { label: '0 promociones pendientes reales', detail: 'Se alimenta de Cupones y descuentos', tone: 'slate' },
        ],
      },
      {
        title: 'Compras pendientes',
        icon: ShoppingCart,
        rows: [
          { label: '0 compras pendientes reales', detail: 'Se alimenta de Compras', tone: 'slate' },
        ],
        path: '/shopping',
      },
      {
        title: 'Informes mensuales',
        icon: FileText,
        rows: [
          { label: 'Informe de socios' },
          { label: 'Pérdidas y ganancias' },
          { label: 'Gastos y proveedores' },
        ],
        path: '/finanzas-operativas?view=informes',
      },
      {
        title: 'Solicitudes recibidas',
        icon: WalletCards,
        rows: [
          { label: '0 solicitudes reales recibidas', detail: 'Según solicitudes y compras', tone: 'slate' },
        ],
      },
      {
        title: 'Control operativo',
        icon: ClipboardCheck,
        rows: [
          { label: 'Sin pendientes reales de cierre', detail: 'Se alimenta de Control operativo', tone: 'slate' },
        ],
        path: '/control-operativo',
      },
      {
        title: 'Mis tareas',
        icon: CheckSquare,
        rows: [
          { label: 'Revisar facturas pendientes' },
          { label: 'Conciliar inventario con Anabella' },
          { label: 'Validar promociones con Itzi' },
          { label: 'Preparar cierre mensual' },
        ],
        path: '/tasks',
      },
      {
        title: 'Solicitudes recibidas',
        icon: Inbox,
        table: {
          headers: ['Área', 'Solicitud', 'Estado'],
          rows: [
            ['Sin registros', 'No hay solicitudes reales', '0'],
          ],
        },
      },
      {
        title: 'Notas rápidas',
        icon: FileText,
        note: 'Apuntes, recordatorios...',
      },
    ],
  },
  {
    key: 'operations',
    userName: 'Esteban',
    userId: userIdByName('Esteban'),
    greeting: 'Buenas, Esteban',
    title: 'Operaciones · Proyectos · Sistemas',
    motto: 'Del plan a la acción',
    accent: 'bg-emerald-700',
    accentText: 'text-emerald-800',
    pageBg: 'bg-[#edf9f0]',
    sidebarBg: 'bg-[#dff2e4]',
    sidebarActive: 'bg-emerald-700 text-white',
    soft: 'bg-emerald-50',
    border: 'border-emerald-200',
    nav: [
      { label: 'Mi espacio', icon: Home, path: '/inicio-roles' },
      { label: 'Inicio', icon: Home, path: '/inicio-roles' },
      { label: 'Mis proyectos', icon: FolderKanban, panelTitle: 'Mis proyectos' },
      { label: 'Mis tareas', icon: CheckSquare, path: '/tasks' },
      { label: 'Mi jornada', icon: Clock, path: '/time-tracking' },
      { label: 'Decisiones', icon: Inbox, panelTitle: 'Decisiones a preparar' },
      { label: 'Zoho y sistemas', icon: Wrench, panelTitle: 'Zoho y sistemas' },
      { label: 'Proveedores', icon: ShoppingCart, panelTitle: 'Proveedores' },
      { label: 'Documentación', icon: FileText, path: '/folders' },
      { label: 'Soporte a Fer', icon: Users, panelTitle: 'Adjunto de operaciones' },
      { label: 'Operaciones', icon: BriefcaseBusiness, section: 'secondary', panelTitle: 'Operaciones' },
      { label: 'Ventas vista', icon: BarChart3, section: 'secondary', panelTitle: 'Ventas vista' },
      { label: 'Inventario vista', icon: Boxes, section: 'secondary', path: '/inventory' },
      { label: 'Finanzas vista', icon: WalletCards, section: 'secondary', path: '/facturacion' },
      { label: 'Recursos', icon: Users, section: 'secondary', path: '/folders' },
    ],
    cards: [
      {
        title: 'Mis 3 proyectos prioritarios esta semana',
        icon: FolderKanban,
        span: 'wide',
        table: {
          headers: ['Proyecto', 'Próximo entregable', 'Fecha', 'Estado'],
          rows: [
            ['Sin prioridades reales', 'Marcar desde Proyectos', 'Sin fecha', '0%'],
          ],
        },
      },
      {
        title: 'Tareas de esta semana',
        icon: CalendarDays,
        rows: [
          { label: '0 tareas reales esta semana', detail: 'Se alimenta de Tareas', tone: 'slate' },
        ],
        path: '/tasks',
      },
      {
        title: 'Menciones para mí',
        icon: AtSign,
        rows: [
          { label: '0 menciones reales pendientes', detail: 'Se alimenta de Menciones', tone: 'slate' },
        ],
      },
      {
        title: 'Soporte a Fer',
        icon: Users,
        rows: [
          { label: '0 tareas activas reales esta semana', detail: 'Se alimenta de Solicitud de apoyo', tone: 'slate' },
        ],
      },
      {
        title: 'Decisiones a preparar',
        icon: ShieldCheck,
        rows: [
          { label: '0 decisiones reales pendientes', detail: 'Se alimenta de Menciones tipo Decidir/Validar', tone: 'slate' },
        ],
      },
      {
        title: 'Notas rápidas',
        icon: MessageSquareText,
        note: 'Enlaces, ideas, procedimientos...',
      },
    ],
  },
  {
    key: 'support',
    userName: 'Fer',
    userId: userIdByName('Fer'),
    greeting: 'Hola, Fer',
    title: 'Soporte operativo · Almacén y Proyectos',
    motto: 'Apoyo, orden y movimiento',
    accent: 'bg-teal-600',
    accentText: 'text-teal-800',
    pageBg: 'bg-[#edfbf7]',
    sidebarBg: 'bg-[#d8f4ed]',
    sidebarActive: 'bg-teal-600 text-white',
    soft: 'bg-teal-50',
    border: 'border-teal-200',
    nav: [
      { label: 'Mi espacio', icon: Home, path: '/inicio-roles' },
      { label: 'Inicio', icon: Home, path: '/inicio-roles' },
      { label: 'Mis tareas', icon: CheckSquare, path: '/tasks' },
      { label: 'Mi jornada', icon: Clock, path: '/time-tracking' },
      { label: 'Almacén 4h', icon: PackageCheck, panelTitle: 'Almacén 4h' },
      { label: 'Proyectos 4h', icon: FolderKanban, panelTitle: 'Proyectos 4h' },
      { label: 'Check-list diario', icon: ListChecks, path: '/checklist' },
    ],
    cards: [
      {
        title: 'Mi jornada de hoy',
        icon: Clock,
        span: 'wide',
        table: {
          headers: ['Bloque', 'Horario', 'Tareas'],
          rows: [
            ['Almacén', '08:00-12:00', 'Sin bloque real asignado'],
            ['Operaciones / proyectos', '13:00-17:00', 'Sin bloque real asignado'],
          ],
        },
      },
      {
        title: 'Mis tareas de hoy',
        icon: ListChecks,
        badge: '0',
        rows: [
          { label: '0 tareas reales pendientes hoy', detail: 'Se alimenta de Tareas', tone: 'slate' },
        ],
        path: '/tasks',
      },
      {
        title: 'Proyectos en los que participo',
        icon: BriefcaseBusiness,
        rows: [
          { label: '0 proyectos reales asignados', detail: 'Se alimenta de Proyectos', tone: 'slate' },
        ],
      },
      {
        title: 'Siguientes pasos y progreso',
        icon: BarChart3,
        progress: { value: 0, label: '0 entregables reales completados', detail: 'Proyectos y entregables de la semana' },
      },
      {
        title: 'Mis entregables esta semana',
        icon: ClipboardCheck,
        rows: [
          { label: '0 entregables reales esta semana', detail: 'Se alimenta de pasos/tareas vinculadas', tone: 'slate' },
        ],
      },
    ],
  },
];

const tagGroups = [
  ['SV', 'ENT', 'AV', 'RG', 'KL', 'ISO', 'Digestivo', 'Sales de Prana', 'Testing Kit'],
  ['protocolo', 'precio', 'descuento', 'acceso', 'certificación', 'webinar', 'promoción', 'pregunta'],
  ['@Thalia', '@Itzi', '@Anabella', '@Heidy', '@Esteban', '@Fer', '@almacén', '@contabilidad'],
];

const mentionAliasesByUserId: Record<string, string[]> = {
  '6bafcb97-6a1b-4224-adbb-1340b86ffeb9': ['anabela', 'anabella'],
};

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatVisibleTags(tags: unknown, limit = 2) {
  const visible = (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || '').trim())
    .filter((tag) => tag && !tag.startsWith('__') && !tag.includes(':') && tag.length <= 28)
    .slice(0, limit);
  return visible.length > 0 ? visible.join(', ') : 'sin tags';
}

function normalizeSearchText(value: unknown) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isCouponLikeProject(project: LunarisProject) {
  const searchable = normalizeSearchText([
    project.name,
    project.objective,
    project.description,
    project.expectedResult,
    project.tags?.join(' '),
  ].filter(Boolean).join(' '));
  return (
    project.type === 'cupon_promocion'
    || !!project.promotionKind
    || !!project.promotionStatus
    || searchable.includes('cupon')
    || searchable.includes('promocion')
    || searchable.includes('descuento')
  );
}

function isLegacyCouponProjectActive(project: LunarisProject) {
  if (project.promotionStatus) return project.promotionStatus === 'active';
  return !['done', 'paused'].includes(project.status);
}

function isActivePromotionRecord(promotion: any) {
  const status = normalizeSearchText(promotion?.status);
  return status === 'active' || status === 'activo' || status === 'activa';
}

function normalizeMentionText(value: unknown) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findMentionedUsers(value: string) {
  const text = ` ${normalizeMentionText(value)} `;
  return USERS.filter((user) => {
    const name = normalizeMentionText(user.name);
    const firstName = name.split(/\s+/)[0];
    const emailAlias = normalizeMentionText(user.email.split('@')[0]);
    const aliases = Array.from(new Set([
      name,
      firstName,
      emailAlias,
      ...(mentionAliasesByUserId[user.id] || []),
    ].filter((alias) => alias.length >= 3)));

    return aliases.some((alias) => text.includes(`@${alias}`));
  });
}

function mentionCreatedTime(mention: Mention) {
  return Date.parse(mention.createdAt || mention.updatedAt || '') || 0;
}

function mentionLatestResponseTime(mention: Mention) {
  return Math.max(
    0,
    ...(mention.responses || []).map((response) => Date.parse(response.createdAt || '') || 0),
  );
}

function sortMentionsNewestFirst(a: Mention, b: Mention) {
  return mentionCreatedTime(b) - mentionCreatedTime(a);
}

function sortMentionResponsesNewestFirst(a: Mention, b: Mention) {
  return (
    mentionLatestResponseTime(b) - mentionLatestResponseTime(a)
    || mentionCreatedTime(b) - mentionCreatedTime(a)
  );
}

function formatMentionActivityDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatEuros(value: number) {
  return value.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

function RoleHomePrototypePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { notifications, markAllAsRead } = useNotificationsContext();
  const { todos } = useTodos(currentUser);
  const { projects, ensureEstebanInitialPortfolio, updateProject } = useProjects(currentUser);
  const { activeFormations, needs, faqs, support } = useSalesLearning(currentUser);
  const { promotions, monthlyReports } = useFinanceOperations(currentUser);
  const { reports: inventoryDailyReports } = useInventoryDailyEvents(currentUser?.id);
  const { shoppingItems } = useShoppingList(currentUser);
  const { blocks, addBlock } = useWeeklyWorkPlans(currentUser);
  const { absenceRequests } = useAbsences(currentUser);
  const { announcements } = useAnnouncements(currentUser);
  const { mentions, createMention } = useMentions(currentUser);
  const [dailyAgenda, setDailyAgenda] = useSharedJsonState<DailyAgendaState>(
    'daily_agenda_v1',
    {},
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      mergeBeforePersist: true,
      mergeStrategy: (_remote, next) => next && typeof next === 'object' ? next : {},
      isUsefulPayload: (payload) => !!payload && typeof payload === 'object',
    },
  );
  const [inventoryAlertsSummary] = useSharedJsonState<any>(
    'inventory_alerts_summary_v1',
    {},
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      isUsefulPayload: (payload) => !!payload && typeof payload === 'object',
    },
  );
  const [facturacionArchive] = useSharedJsonState<any[]>(
    FACTURACION_ARCHIVE_KEY,
    [],
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      isUsefulPayload: (payload) => Array.isArray(payload),
    },
  );
  const [albaranesState] = useSharedJsonState<any>(
    ALBARANES_STATE_KEY,
    { products: [] },
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      isUsefulPayload: (payload) => !!payload && typeof payload === 'object',
    },
  );
  const [paymentRequests] = useSharedJsonState<any[]>(
    PAYMENT_REQUESTS_KEY,
    [],
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      isUsefulPayload: (payload) => Array.isArray(payload),
    },
  );

  const initialRole = useMemo(() => {
    if (currentUser?.isAdmin && typeof window !== 'undefined') {
      const storedRole = window.localStorage.getItem('lunaris_role_preview') as RoleKey | null;
      if (storedRole && roleHomes.some((role) => role.key === storedRole)) return storedRole;
    }
    const match = roleHomes.find((role) => role.userId && role.userId === currentUser?.id);
    return match?.key || 'direction';
  }, [currentUser?.id, currentUser?.isAdmin]);

  const [selectedRoleKey, setSelectedRoleKey] = useState<RoleKey>(initialRole);
  const [activePanelTitle, setActivePanelTitle] = useState<string | null>(null);
  const [homeChecklistItems, setHomeChecklistItems] = useState<HomeChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const hasEnsuredEstebanPortfolioRef = useRef(false);
  const selectedRole = roleHomes.find((role) => role.key === selectedRoleKey) || roleHomes[0];
  const selectedUser = USERS.find((user) => user.id === selectedRole.userId) || currentUser;
  const currentUserRoleKey = roleHomes.find((role) => role.userId === currentUser?.id)?.key || 'direction';
  const isAdminPreview = !!currentUser?.isAdmin && selectedRoleKey !== currentUserRoleKey;
  const criticalStockRows = useMemo(() => (
    (Array.isArray(inventoryAlertsSummary?.criticalProducts) ? inventoryAlertsSummary.criticalProducts : [])
      .slice(0, 3)
      .map((row: any) => ({
        label: row.producto || 'Producto',
        status: `${row.stockTotal ?? 0} uds`,
        detail: row.coberturaMeses !== undefined ? `${row.coberturaMeses} meses` : undefined,
        tone: 'red' as const,
      }))
  ), [inventoryAlertsSummary]);

  useEffect(() => {
    window.localStorage.setItem('lunaris_role_preview', selectedRoleKey);
    window.dispatchEvent(new Event('lunaris-role-preview-change'));
  }, [selectedRoleKey]);

  useEffect(() => {
    if (!currentUser?.isAdmin && selectedRoleKey !== initialRole) {
      setSelectedRoleKey(initialRole);
    }
  }, [currentUser?.isAdmin, initialRole, selectedRoleKey]);

  useEffect(() => {
    if (selectedRoleKey === 'operations' && !hasEnsuredEstebanPortfolioRef.current) {
      hasEnsuredEstebanPortfolioRef.current = true;
      ensureEstebanInitialPortfolio();
    }
  }, [ensureEstebanInitialPortfolio, selectedRoleKey]);

  const today = new Date();
  const todayKey = toDateKey(today);
  const todayLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(today);
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(todayKey);
  const currentMonthKeyForReports = todayKey.slice(0, 7);

  useEffect(() => {
    setSelectedAgendaDate(todayKey);
  }, [selectedRole.userId, todayKey]);

  const selectedAssignedTasks = useMemo(() => {
    if (!selectedRole.userId) return [];
    return todos.filter((todo: any) => (
      todo.assigned_to?.includes(selectedRole.userId)
    ));
  }, [selectedRole.userId, todos]);
  const selectedPendingTasks = useMemo(() => (
    selectedAssignedTasks.filter((todo: any) => !todo.completed_by?.includes(selectedRole.userId))
  ), [selectedAssignedTasks, selectedRole.userId]);
  const selectedCompletedTasks = useMemo(() => (
    selectedAssignedTasks.filter((todo: any) => todo.completed_by?.includes(selectedRole.userId))
  ), [selectedAssignedTasks, selectedRole.userId]);
  const selectedUserAllProjects = useMemo(() => (
    projects.filter((project) => canUserSeeProject(project, selectedUser))
  ), [projects, selectedUser]);
  const selectedUserCouponProjects = useMemo(() => (
    selectedUserAllProjects.filter(isCouponLikeProject)
  ), [selectedUserAllProjects]);
  const selectedUserProjects = useMemo(() => (
    selectedUserAllProjects.filter((project) => !isCouponLikeProject(project)).slice(0, 3)
  ), [selectedUserAllProjects]);
  const activeCoupons = useMemo(() => (
    [
      ...promotions
        .filter(isActivePromotionRecord)
        .map((promotion) => ({
          ...promotion,
          source: 'promotion' as const,
        })),
      ...selectedUserCouponProjects
        .filter(isLegacyCouponProjectActive)
        .map((project) => ({
          id: `legacy-project-${project.id}`,
          name: project.name,
          audience: project.objective || project.description || 'Cupón/promoción',
          endDate: project.targetDate || '',
          howItWorks: project.expectedResult,
          source: 'legacy-project' as const,
          sourceProjectId: project.id,
        })),
    ].filter((coupon, index, list) => (
      list.findIndex((item) => normalizeSearchText(item.name) === normalizeSearchText(coupon.name)) === index
    ))
  ), [promotions, selectedUserCouponProjects]);

  const todayArchive = useMemo(() => (
    (Array.isArray(facturacionArchive) ? facturacionArchive : []).find((entry) => entry.dateKey === todayKey)
  ), [facturacionArchive, todayKey]);
  const todayDispatchRows = useMemo(() => {
    const orders = Array.isArray(todayArchive?.orders) ? todayArchive.orders : [];
    return orders
      .filter((order: any) => String(order.status || '').toUpperCase() === 'DESPACHADO')
      .slice(0, 3)
      .map((order: any) => ({
        label: order.invoiceNumber || order.id || 'Pedido',
        detail: order.customerName || 'Cliente sin nombre',
        status: `${(order.lines || []).length} línea(s)`,
        tone: 'green' as const,
      }));
  }, [todayArchive]);
  const dispatchFolderRows = useMemo(() => (
    (Array.isArray(facturacionArchive) ? facturacionArchive : [])
      .slice()
      .sort((a, b) => String(b.dateKey || '').localeCompare(String(a.dateKey || '')))
      .slice(0, 3)
      .map((day) => ({
        label: day.dateKey || 'Día sin fecha',
        detail: `${day.totalOrders || 0} factura(s) · ${day.totalLines || 0} línea(s)`,
        status: `${day.totalQuantity || 0} uds`,
        tone: 'blue' as const,
      }))
  ), [facturacionArchive]);
  const monthlyIncidenceRows = useMemo(() => {
    const monthKey = todayKey.slice(0, 7);
    const totals = new Map<string, number>();
    (Array.isArray(albaranesState?.products) ? albaranesState.products : []).forEach((product: any) => {
      const productName = product.name || 'Producto';
      const tags = [
        ...(Array.isArray(product.tags) ? product.tags : []),
        ...(Array.isArray(product.damageHistory) || Array.isArray(product.documents)
          ? [{ name: 'General', damageHistory: product.damageHistory || [], documents: product.documents || [] }]
          : []),
      ];
      tags.forEach((tag: any) => {
        const pushDamage = (damage: any) => {
          const createdAt = String(damage?.createdAt || damage?.fecha || damage?.date || damage?.updatedAt || '').trim();
          if (createdAt && !createdAt.startsWith(monthKey)) return;
          const quantity = Math.abs(Number(damage?.quantity ?? damage?.cantidad ?? damage?.amount ?? damage?.qty) || 0);
          if (quantity <= 0) return;
          totals.set(productName, (totals.get(productName) || 0) + quantity);
        };
        (Array.isArray(tag.damageHistory) ? tag.damageHistory : []).forEach(pushDamage);
        (Array.isArray(tag.documents) ? tag.documents : []).forEach((document: any) => (
          (Array.isArray(document.damageHistory) ? document.damageHistory : []).forEach(pushDamage)
        ));
      });
    });
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([product, quantity]) => ({
        label: product,
        status: `${quantity} dañados`,
        tone: 'red' as const,
      }));
  }, [albaranesState, todayKey]);
  const realSupportRows = useMemo(() => {
    const pending = support.filter((item) => item.status === 'pending');
    const typeLabels: Record<string, string> = {
      access: 'dudas de acceso',
      content: 'consultas de contenido',
      functionality: 'consultas de funcionamiento',
      other: 'otras consultas',
    };
    const rows = Object.entries(typeLabels)
      .map(([type, label]) => {
        const count = pending.filter((item) => item.type === type).length;
        return count > 0 ? { label: `${count} ${label}`, tone: 'amber' as const } : null;
      })
      .filter(Boolean) as PanelRow[];
    return rows.length > 0 ? rows : [{ label: '0 consultas pendientes reales', detail: 'Según soporte de alumnos', tone: 'slate' as const }];
  }, [support]);
  const salesRadarMetrics = useMemo(() => {
    const openNeeds = needs.filter((item) => item.status === 'need').length;
    const opportunities = needs.filter((item) => ['opportunity', 'project_proposed'].includes(item.status)).length;
    return [
      { label: 'Consultas recibidas', value: String(support.length), hint: 'Soporte real', tone: 'blue' as const },
      { label: 'Oportunidades', value: String(opportunities), hint: 'Radar real', tone: opportunities > 0 ? 'green' as const : 'slate' as const },
      { label: 'Preguntas frecuentes', value: String(faqs.length), hint: 'FAQ reales', tone: faqs.length > 0 ? 'purple' as const : 'slate' as const },
      { label: 'Necesidades detectadas', value: String(openNeeds), hint: 'Necesidades reales', tone: openNeeds > 0 ? 'amber' as const : 'slate' as const },
    ];
  }, [faqs, needs, support]);
  const faqRows = useMemo(() => (
    faqs.length > 0
      ? faqs.slice(0, 5).map((faq) => ({
        label: faq.question,
        detail: faq.group === 'formations' ? 'Formaciones' : 'Producto / empresa',
        status: faq.status,
        tone: faq.status === 'published' ? 'green' as const : 'slate' as const,
      }))
      : [{ label: '0 preguntas frecuentes reales', detail: 'Se alimenta de Preguntas frecuentes', tone: 'slate' as const }]
  ), [faqs]);
  const heidyMonthlyReportRows = useMemo(() => {
    const requiredReports = [
      { type: 'socios', label: 'Informe de socios' },
      { type: 'perdidas_ganancias', label: 'Pérdidas y ganancias' },
      { type: 'gastos_proveedores', label: 'Gastos y proveedores' },
    ];
    return requiredReports.map((required) => {
      const exists = monthlyReports.some((report) => (
        report.monthKey === currentMonthKeyForReports && report.reportType === required.type
      ));
      return {
        label: required.label,
        status: exists ? 'Subido' : 'Pendiente',
        tone: exists ? 'green' as const : 'amber' as const,
      };
    });
  }, [currentMonthKeyForReports, monthlyReports]);
  const activeCouponRows = useMemo(() => (
    activeCoupons.length > 0
      ? activeCoupons.map((promotion) => ({
        label: promotion.name,
        detail: promotion.audience || ('reason' in promotion ? promotion.reason : '') || promotion.howItWorks || 'Cupón/promoción activa',
        status: 'Activo',
        tone: 'green' as const,
      }))
      : [{ label: '0 cupones o promociones activas', detail: 'Se alimenta de Cupones y descuentos', tone: 'slate' as const }]
  ), [activeCoupons]);
  const pendingShoppingRows = useMemo(() => {
    const pending = shoppingItems.filter((item: any) => !item.is_purchased).slice(0, 4);
    return pending.length > 0
      ? pending.map((item: any) => ({
        label: item.name || 'Compra sin título',
        detail: item.location || 'Sin ubicación',
        status: 'Pendiente',
        tone: 'amber' as const,
      }))
      : [{ label: '0 compras pendientes reales', detail: 'Se alimenta de Compras', tone: 'slate' as const }];
  }, [shoppingItems]);
  const supportProjectRows = useMemo(() => (
    selectedUserAllProjects.length > 0
      ? selectedUserAllProjects.slice(0, 3).map((project) => ({
        label: project.name,
        detail: projectTypeLabel(project.type),
        status: projectStatusLabel(project.status),
        tone: project.status === 'done' ? 'green' as const : 'slate' as const,
      }))
      : [{ label: '0 proyectos reales asignados', detail: 'Se alimenta de Proyectos', tone: 'slate' as const }]
  ), [selectedUserAllProjects]);
  const supportDeliverableRows = useMemo(() => (
    selectedPendingTasks.length > 0
      ? selectedPendingTasks.slice(0, 4).map((task: any) => ({
        label: task.title,
        detail: task.due_date_key || 'Sin fecha',
        status: 'Pendiente',
        tone: 'amber' as const,
      }))
      : [{ label: '0 entregables reales esta semana', detail: 'Se alimenta de pasos/tareas vinculadas', tone: 'slate' as const }]
  ), [selectedPendingTasks]);
  const selectedTaskProgress = selectedAssignedTasks.length === 0
    ? 0
    : Math.round((selectedCompletedTasks.length / selectedAssignedTasks.length) * 100);
  const todayInventoryDailyReport = inventoryDailyReports.find((report) => report.dateKey === todayKey) || null;
  const latestInventoryDailyReport = inventoryDailyReports[0] || null;
  const directionInventoryDailyReport = todayInventoryDailyReport || latestInventoryDailyReport;
  const directionWeekDays = useMemo(() => getWeekDateKeys(getWeekStartKey(today)), [todayKey]);
  const directionAreaRows = useMemo(() => {
    const latestStatus = getInventoryDailyStatus(directionInventoryDailyReport);
    const dailyTables = directionInventoryDailyReport?.manualTables || {};
    const shipments = Array.isArray(dailyTables.shipments) ? dailyTables.shipments : [];
    const clients = Array.isArray(dailyTables.clients) ? dailyTables.clients : [];
    const transfers = Array.isArray(dailyTables.transfers) ? dailyTables.transfers : [];
    const soldUnits = shipments.reduce((sum: number, row: any) => sum + Math.abs(Number(String(row?.cantidad || 0).replace(',', '.')) || 0), 0);

    const activeWeekProjects = projects.filter((project) => {
      if (['done', 'paused'].includes(project.status)) return false;
      return (
        !!project.weeklyPriorityRank
        || (project.targetDate && directionWeekDays.includes(project.targetDate))
        || project.steps.some((step) => step.targetDate && directionWeekDays.includes(step.targetDate))
      );
    });
    const averageProgress = activeWeekProjects.length > 0
      ? Math.round(activeWeekProjects.reduce((sum, project) => sum + calculateProjectProgress(project).completed, 0) / activeWeekProjects.length)
      : 0;
    const responsibleNames = Array.from(new Set(activeWeekProjects.map((project) => (
      USERS.find((user) => user.id === project.responsibleId)?.name || 'Sin responsable'
    )))).slice(0, 3).join(', ');

    const criticalProducts = Array.isArray(inventoryAlertsSummary?.criticalProducts) ? inventoryAlertsSummary.criticalProducts : [];
    const stockRows = Array.isArray(inventoryAlertsSummary?.canetVisibleStockRows) ? inventoryAlertsSummary.canetVisibleStockRows : [];
    const pendingPayments = (Array.isArray(paymentRequests) ? paymentRequests : [])
      .filter((request: any) => !request.deletedAt)
      .filter((request: any) => !['PAGADO', 'CANCELADO'].includes(String(request.status || '').toUpperCase()));
    const pendingAmount = pendingPayments.reduce((sum: number, request: any) => sum + (Number(request.amount) || 0), 0);

    return [
      {
        label: 'Ventas',
        detail: directionInventoryDailyReport
          ? `${directionInventoryDailyReport.dateKey === todayKey ? 'Hoy' : `Ultimo control ${directionInventoryDailyReport.dateKey}`}: ${clients.length} cliente(s) · ${shipments.length} venta/envio(s) · ${soldUnits} uds · ${transfers.length} traspaso(s)`
          : 'Sin control diario creado todavía',
        status: directionInventoryDailyReport ? directionInventoryDailyReport.dateKey : 'Pendiente',
        tone: latestStatus.complete ? 'green' as const : directionInventoryDailyReport ? 'amber' as const : 'slate' as const,
      },
      {
        label: 'Operaciones',
        detail: activeWeekProjects.length > 0
          ? `${activeWeekProjects.length} proyecto(s) activos esta semana · avance medio ${averageProgress}% · ${responsibleNames || 'equipo'}`
          : 'Sin proyectos marcados para esta semana',
        status: activeWeekProjects.length > 0 ? `${averageProgress}%` : '0',
        tone: activeWeekProjects.length > 0 ? 'blue' as const : 'slate' as const,
      },
      {
        label: 'Inventario',
        detail: stockRows.length > 0
          ? `${stockRows.length} filas de stock visibles · ${criticalProducts.length} producto(s) criticos`
          : 'Sin snapshot reciente de Control de Stock',
        status: criticalProducts.length > 0 ? `${criticalProducts.length} criticos` : 'OK',
        tone: criticalProducts.length > 0 ? 'red' as const : stockRows.length > 0 ? 'green' as const : 'slate' as const,
      },
      {
        label: 'Finanzas',
        detail: pendingPayments.length > 0
          ? `${pendingPayments.length} factura(s)/solicitud(es) por pagar · ${formatEuros(pendingAmount)}`
          : 'Sin facturas pendientes registradas',
        status: pendingPayments.length > 0 ? formatEuros(pendingAmount) : '0 €',
        tone: pendingPayments.length > 0 ? 'amber' as const : 'green' as const,
      },
      {
        label: 'Formacion',
        detail: activeFormations.length > 0
          ? activeFormations.slice(0, 3).map((formation) => formation.name).join(' · ')
          : 'Sin formaciones activas reales',
        status: `${activeFormations.length} activa(s)`,
        tone: activeFormations.length > 0 ? 'green' as const : 'slate' as const,
      },
    ];
  }, [activeFormations, directionInventoryDailyReport, directionWeekDays, inventoryAlertsSummary, paymentRequests, projects, todayKey]);

  const dashboardCards = useMemo(() => (
    selectedRole.cards.map((card) => (
      selectedRole.key === 'direction' && card.title === 'Estado general de áreas'
        ? { ...card, rows: directionAreaRows }
        : selectedRole.key === 'warehouse' && card.title === 'Stock crítico'
        ? { ...card, rows: criticalStockRows.length > 0 ? criticalStockRows : [{ label: 'Sin productos críticos registrados', detail: 'Según Control de stock', tone: 'green' as const }] }
        : selectedRole.key === 'direction' && card.title === 'Formación y aprendizaje'
        ? {
          ...card,
          rows: activeFormations.length > 0
            ? activeFormations.slice(0, 4).map((formation) => ({
              label: formation.name,
              detail: formation.objective || formation.purpose || 'Formación activa',
              status: formation.duration || 'Activa',
              tone: 'green' as const,
            }))
            : [{ label: 'Sin formaciones activas reales', detail: 'Se alimenta de Formación', tone: 'slate' as const }],
        }
        : selectedRole.key === 'sales' && card.title === 'Soporte de alumnos hoy'
        ? { ...card, badge: String(support.filter((item) => item.status === 'pending').length), rows: realSupportRows }
        : selectedRole.key === 'sales' && card.title === 'Formaciones activas'
        ? {
          ...card,
          badge: String(activeFormations.length),
          rows: activeFormations.length > 0
            ? activeFormations.slice(0, 3).map((formation) => ({
              label: formation.name,
              detail: formation.objective || formation.purpose || 'Formación activa',
              status: formation.duration || 'Activa',
              tone: 'green' as const,
            }))
            : [{ label: 'Sin formaciones activas reales', detail: 'Se alimenta de Formación y aprendizaje', tone: 'slate' as const }],
        }
        : selectedRole.key === 'sales' && card.title === 'Radar comercial'
        ? { ...card, metrics: salesRadarMetrics }
        : selectedRole.key === 'sales' && card.title === 'Preguntas frecuentes nuevas'
        ? { ...card, rows: faqRows }
        : selectedRole.key === 'finance' && card.title === 'Informes mensuales'
        ? { ...card, rows: heidyMonthlyReportRows }
        : selectedRole.key === 'finance' && card.title === 'Cupones y promociones'
        ? { ...card, badge: String(activeCoupons.length), rows: activeCouponRows }
        : selectedRole.key === 'finance' && card.title === 'Compras pendientes'
        ? { ...card, rows: pendingShoppingRows }
        : selectedRole.key === 'support' && card.title === 'Proyectos en los que participo'
        ? { ...card, rows: supportProjectRows }
        : selectedRole.key === 'support' && card.title === 'Siguientes pasos y progreso'
        ? { ...card, progress: { value: selectedTaskProgress, label: `${selectedCompletedTasks.length}/${selectedAssignedTasks.length} tareas completadas`, detail: 'Tareas y entregables reales asignados' } }
        : selectedRole.key === 'support' && card.title === 'Mis entregables esta semana'
        ? { ...card, rows: supportDeliverableRows }
        : selectedRole.key === 'warehouse' && card.title === 'Incidencias de producto'
        ? { ...card, badge: String(monthlyIncidenceRows.length), rows: monthlyIncidenceRows.length > 0 ? monthlyIncidenceRows : [{ label: 'Sin incidencias del mes', detail: 'Según Incidencias producto/lote', tone: 'green' as const }] }
        : selectedRole.key === 'warehouse' && card.title === 'Despachos de hoy'
        ? { ...card, table: undefined, rows: todayDispatchRows.length > 0 ? todayDispatchRows : [{ label: '0 despachos reales hoy', detail: 'Según carpeta despachos', tone: 'slate' as const }] }
        : selectedRole.key === 'warehouse' && card.title === 'Carpeta despachos'
        ? { ...card, rows: dispatchFolderRows.length > 0 ? dispatchFolderRows : [{ label: 'Aún no hay días archivados', detail: 'Carpeta Despachos', tone: 'slate' as const }] }
        : card
    )).filter((card) => {
      const title = card.title.toLowerCase();
      return !title.includes('tarea')
        && !title.includes('checklist')
        && !title.includes('aviso')
        && !title.includes('mencion')
        && !title.includes('decisi')
        && !title.includes('jornada')
        && !title.includes('inventario')
        && !title.includes('calendario')
        && !title.includes('solicitud');
    })
  ), [activeCouponRows, activeCoupons.length, activeFormations, criticalStockRows, directionAreaRows, dispatchFolderRows, faqRows, heidyMonthlyReportRows, monthlyIncidenceRows, pendingShoppingRows, realSupportRows, salesRadarMetrics, selectedAssignedTasks.length, selectedCompletedTasks.length, selectedRole.cards, selectedRole.key, selectedTaskProgress, support, supportDeliverableRows, supportProjectRows, todayDispatchRows]);

  const loadHomeChecklist = async () => {
    if (!selectedRole.userId) {
      setHomeChecklistItems([]);
      return;
    }
    setChecklistLoading(true);
    const [{ data: dailyData }, { data: templateData }] = await Promise.all([
      supabase
        .from('daily_checklists')
        .select('*')
        .eq('user_id', selectedRole.userId)
        .eq('date_key', toDateKey(new Date()))
        .single(),
      supabase
        .from('checklist_templates')
        .select('tasks')
        .eq('user_id', selectedRole.userId)
        .single(),
    ]);

    const savedHistory = Array.isArray(dailyData?.history) ? dailyData.history : [];
    const completionMap = new Map<string, boolean>();
    savedHistory.forEach((item: any) => completionMap.set(item.id, !!item.completed));
    const templateItems = Array.isArray(templateData?.tasks)
      ? templateData.tasks.map((item: any) => ({
        ...item,
        source: 'template' as const,
        completed: completionMap.has(item.id) ? completionMap.get(item.id) || false : false,
      }))
      : [];
    const personalItems = savedHistory
      .filter((item: any) => item?.source === 'personal' || String(item?.id || '').startsWith('personal-'))
      .map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        text: String(item.text || '').trim(),
        completed: !!item.completed,
        source: 'personal' as const,
        created_at: item.created_at,
      }))
      .filter((item: HomeChecklistItem) => item.text);

    setHomeChecklistItems([...templateItems, ...personalItems]);
    setChecklistLoading(false);
  };

  useEffect(() => {
    loadHomeChecklist();
  }, [selectedRole.userId, todayKey]);

  const completeTaskFromHome = async (todo: any) => {
    if (!selectedRole.userId) return;
    const nextCompleted = Array.from(new Set([...(todo.completed_by || []), selectedRole.userId]));
    const { error } = await supabase
      .from('todos')
      .update({
        completed_by: nextCompleted,
      })
      .eq('id', todo.id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    }
  };

  const toggleChecklistFromHome = async (itemId: string) => {
    if (!selectedRole.userId) return;
    const nextItems = homeChecklistItems.map((item) => (
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ));
    setHomeChecklistItems(nextItems);
    const { error } = await supabase
      .from('daily_checklists')
      .upsert({
        user_id: selectedRole.userId,
        date_key: todayKey,
        history: nextItems,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date_key' });
    if (error) {
      setHomeChecklistItems(homeChecklistItems);
    }
  };

  const unreadNotifications = notifications.filter((notification: any) => !notification.read);
  const timeGreeting = useMemo(() => {
    const hour = today.getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }, [todayKey]);
  const weekLabel = useMemo(() => {
    const start = new Date(today);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const format = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });
    return `${format.format(start)} - ${format.format(end)}`;
  }, [todayKey]);

  const weeklyAbsences = useMemo(() => {
    const start = new Date(today);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return absenceRequests.filter((absence: any) => {
      const absenceStart = absence.date_key;
      const absenceEnd = absence.end_date || absence.date_key;
      return absenceStart <= endKey && absenceEnd >= startKey && absence.status === 'approved';
    });
  }, [absenceRequests, todayKey]);

  const selectedDueTodayTasks = useMemo(() => (
    selectedPendingTasks.filter((todo: any) => todo.due_date_key === todayKey)
  ), [selectedPendingTasks, todayKey]);

  const activeAnnouncements = useMemo(() => (
    announcements.filter((announcement) => (
      isAnnouncementActiveOn(announcement, todayKey)
      && isAnnouncementVisibleForUser(announcement, selectedUser)
    ))
  ), [announcements, selectedUser, todayKey]);

  const pendingMentionsForSelectedUser = useMemo(() => (
    mentions.filter((mention) => mention.targetUserId === selectedRole.userId && mention.status === 'pending')
  ), [mentions, selectedRole.userId]);
  const mentionsForSelectedUser = useMemo(() => (
    mentions
      .filter((mention) => mention.targetUserId === selectedRole.userId)
      .sort(sortMentionsNewestFirst)
  ), [mentions, selectedRole.userId]);
  const mentionsBySelectedUser = useMemo(() => (
    mentions
      .filter((mention) => mention.sourceUserId === selectedRole.userId)
      .sort(sortMentionsNewestFirst)
  ), [mentions, selectedRole.userId]);
  const mentionResponsesForSelectedUser = useMemo(() => (
    mentionsBySelectedUser
      .filter((mention) => (mention.responses || []).length > 0)
      .sort(sortMentionResponsesNewestFirst)
  ), [mentionsBySelectedUser]);
  const decisionMentionsForSelectedUser = useMemo(() => (
    pendingMentionsForSelectedUser.filter((mention) => ['validar', 'decidir'].includes(mention.mentionType)).slice(0, 3)
  ), [pendingMentionsForSelectedUser]);
  const generalMentionsForSelectedUser = useMemo(() => (
    pendingMentionsForSelectedUser.filter((mention) => !['validar', 'decidir'].includes(mention.mentionType)).slice(0, 3)
  ), [pendingMentionsForSelectedUser]);
  const selectedAgenda = dailyAgenda?.[selectedAgendaDate]?.[selectedRole.userId] || {};

  const updateAgendaItem = (dateKey: string, hour: string, value: string) => {
    if (!selectedRole.userId) return;
    setDailyAgenda((prev) => ({
      ...(prev || {}),
      [dateKey]: {
        ...((prev || {})[dateKey] || {}),
        [selectedRole.userId]: {
          ...(((prev || {})[dateKey] || {})[selectedRole.userId] || {}),
          [hour]: value,
        },
      },
    }));
  };

  const registerAgendaMentions = async (dateKey: string, hour: string, value: string) => {
    if (!selectedRole.userId || !value.trim()) return;
    const mentionedUsers = findMentionedUsers(value)
      .filter((user) => user.id !== selectedRole.userId);
    if (mentionedUsers.length === 0) return;
    const originId = `daily-agenda:${selectedRole.userId}:${dateKey}:${hour}`;

    setDailyAgenda((prev) => {
      const next = { ...(prev || {}) };
      const dayAgenda = { ...(next[dateKey] || {}) };
      mentionedUsers.forEach((user) => {
        const userAgenda = { ...(dayAgenda[user.id] || {}) };
        const previousValue = userAgenda[hour] || '';
        userAgenda[hour] = previousValue && !previousValue.includes(value)
          ? `${previousValue} · ${value}`
          : value;
        dayAgenda[user.id] = userAgenda;
      });
      next[dateKey] = dayAgenda;
      return next;
    });

    await Promise.allSettled(mentionedUsers.map((user) => {
      const alreadyExists = mentions.some((mention) => (
        mention.originId === originId
        && mention.targetUserId === user.id
        && mention.context === value
      ));
      if (alreadyExists) return Promise.resolve();
      return createMention({
        title: `Calendario · ${selectedRole.userName} · ${dateKey} · ${hour}`,
        originType: 'other',
        originId,
        originLabel: 'Mi jornada',
        objectPath: '/inicio-roles',
        targetUserId: user.id,
        mentionType: 'consultar',
        context: value,
      });
    }));
  };

  const weeklyAbsenceLabel = weeklyAbsences.length > 0
    ? weeklyAbsences
      .map((absence: any) => {
        const user = USERS.find((candidate) => candidate.id === absence.created_by);
        const end = absence.end_date && absence.end_date !== absence.date_key ? ` → ${absence.end_date}` : '';
        return `${user?.name || 'Equipo'} ${absence.date_key}${end}`;
      })
      .join(' · ')
    : 'Sin ausencias aprobadas esta semana';

  const currentWeekStart = useMemo(() => getWeekStartKey(today), [todayKey]);
  const currentWeekDays = useMemo(() => getWeekDateKeys(currentWeekStart), [currentWeekStart]);
  const selectedUserWeekBlocks = useMemo(() => (
    blocks.filter((block) => block.userId === selectedRole.userId && block.weekStart === currentWeekStart)
  ), [blocks, currentWeekStart, selectedRole.userId]);
  const selectedUserWeekSuggestions = useMemo(() => (
    selectedUserAllProjects.flatMap((project) => {
      const projectItems = project.targetDate ? [{
        id: `project-${project.id}`,
        dateKey: project.targetDate,
        projectId: project.id,
        title: project.name,
        detail: 'Fecha objetivo del proyecto',
        source: 'Proyecto',
      }] : [];
      const stepItems = (project.steps || [])
        .filter((step: any) => step.targetDate)
        .map((step: any) => ({
          id: `step-${project.id}-${step.id}`,
          dateKey: step.targetDate,
          projectId: project.id,
          stepId: step.id,
          title: step.name,
          detail: project.name,
          source: 'Paso',
        }));
      return [...projectItems, ...stepItems];
    }).filter((item) => currentWeekDays.includes(item.dateKey))
  ), [currentWeekDays, selectedUserAllProjects]);
  const estebanProjects = useMemo(() => (
    projects.filter((project) => (
      project.ownerId === ESTEBAN_ID
      || project.responsibleId === ESTEBAN_ID
      || project.participants.includes(ESTEBAN_ID)
      || project.steps.some((step) => step.responsibleId === ESTEBAN_ID)
    ))
  ), [projects]);
  const estebanWeeklyPriorities = useMemo(() => (
    estebanProjects
      .filter((project) => project.weeklyPriorityRank)
      .sort((a, b) => Number(a.weeklyPriorityRank || 99) - Number(b.weeklyPriorityRank || 99))
      .slice(0, 3)
  ), [estebanProjects]);
  const orderedEstebanProjects = useMemo(() => (
    [...estebanProjects].sort((a, b) => (
      Number(a.weeklyPriorityRank || 99) - Number(b.weeklyPriorityRank || 99)
      || a.name.localeCompare(b.name)
    ))
  ), [estebanProjects]);
  const toggleEstebanWeeklyPriority = (projectId: string) => {
    const project = estebanProjects.find((item) => item.id === projectId);
    if (!project) return;
    if (project.weeklyPriorityRank) {
      const remaining = estebanProjects
        .filter((item) => item.id !== projectId && item.weeklyPriorityRank)
        .sort((a, b) => Number(a.weeklyPriorityRank || 99) - Number(b.weeklyPriorityRank || 99))
        .slice(0, 3);
      updateProject(projectId, { weeklyPriorityRank: undefined }, 'Proyecto retirado de prioridades semanales');
      remaining.forEach((item, index) => {
        if (item.weeklyPriorityRank !== index + 1) {
          updateProject(item.id, { weeklyPriorityRank: index + 1 }, `Prioridad semanal ajustada a P${index + 1}`);
        }
      });
      return;
    }
    const currentPriorities = estebanProjects
      .filter((item) => item.weeklyPriorityRank)
      .sort((a, b) => Number(a.weeklyPriorityRank || 99) - Number(b.weeklyPriorityRank || 99));
    if (currentPriorities.length >= 3) {
      const displaced = currentPriorities[currentPriorities.length - 1];
      updateProject(displaced.id, { weeklyPriorityRank: undefined }, 'Proyecto desplazado de prioridades semanales');
    }
    updateProject(projectId, { weeklyPriorityRank: Math.min(3, currentPriorities.length + 1) }, `Proyecto marcado como prioridad semanal P${Math.min(3, currentPriorities.length + 1)}`);
  };
  const ferTasks = useMemo(() => (
    todos.filter((todo: any) => (todo.assigned_to || []).includes(FER_ID))
  ), [todos]);
  const ferActiveTasks = useMemo(() => (
    ferTasks.filter((todo: any) => !(todo.completed_by || []).includes(FER_ID))
  ), [ferTasks]);
  const ferCompletedTasks = useMemo(() => (
    ferTasks.filter((todo: any) => (todo.completed_by || []).includes(FER_ID))
  ), [ferTasks]);
  const ferProgress = ferTasks.length === 0 ? 0 : Math.round((ferCompletedTasks.length / ferTasks.length) * 100);
  const estebanWeekBlocks = useMemo(() => (
    blocks.filter((block) => block.weekStart === currentWeekStart && [ESTEBAN_ID, FER_ID].includes(block.userId))
  ), [blocks, currentWeekStart]);
  const ferSupportRequests = useMemo(() => (
    estebanWeekBlocks.filter((block) => block.userId === FER_ID && block.kind === 'support')
  ), [estebanWeekBlocks]);

  const addPersonalWeekBlock = (draft: {
    dateKey: string;
    startTime: string;
    endTime: string;
    title: string;
    kind?: 'warehouse' | 'projects' | 'support' | 'admin';
    projectId?: string;
    notes?: string;
  }) => {
    if (!selectedRole.userId || !draft.title.trim()) return;
    addBlock({
      userId: selectedRole.userId,
      weekStart: getWeekStartKey(new Date(`${draft.dateKey}T00:00:00`)),
      dateKey: draft.dateKey,
      startTime: draft.startTime,
      endTime: draft.endTime,
      kind: draft.kind || 'projects',
      title: draft.title.trim(),
      projectId: draft.projectId,
      requesterId: selectedRole.userId,
      notes: draft.notes,
      updatedBy: currentUser?.id || selectedRole.userId,
    });
    const agendaText = draft.notes ? `${draft.title} · ${draft.notes}` : draft.title;
    const existingValue = dailyAgenda?.[draft.dateKey]?.[selectedRole.userId]?.[draft.startTime] || '';
    const nextValue = existingValue && !existingValue.includes(agendaText)
      ? `${existingValue} · ${agendaText}`
      : agendaText;
    updateAgendaItem(draft.dateKey, draft.startTime, nextValue);
  };

  const openCard = (card: PanelCard) => {
    if (card.path) {
      navigate(card.path);
      return;
    }
    setActivePanelTitle(card.panelTitle || card.title);
  };

  return (
    <div className="mx-auto max-w-[1260px]">
      <section className={classNames('overflow-hidden rounded-[2rem] border shadow-sm', selectedRole.pageBg, selectedRole.border)}>
        <div className="min-h-[780px]">
          <main className="min-w-0 p-4 md:p-6">
            <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <UserAvatar name={selectedRole.userName} size="lg" />
                <div>
                  <h1 className="text-3xl font-black tracking-normal text-slate-950 md:text-4xl">{timeGreeting}, {selectedRole.userName}</h1>
                  <p className="mt-1 text-base font-semibold text-slate-700">{selectedRole.title}</p>
                  <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-500">
                    Semana {weekLabel}. Vencen hoy: {selectedDueTodayTasks.length}. Pendientes: {selectedPendingTasks.length}. Ausencias: {weeklyAbsenceLabel}.
                  </p>
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">{todayLabel}</p>
                <p className={classNames('mt-2 rounded-xl px-4 py-2 text-xs font-black', selectedRole.soft, selectedRole.accentText)}>
                  {selectedRole.motto}
                </p>
              </div>
            </header>

            {currentUser?.isAdmin && (
              <div className="mb-5 rounded-2xl border border-white/80 bg-white/65 p-2">
                <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Selector de maqueta admin</p>
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  {roleHomes.map((role) => (
                    <button
                      key={role.key}
                      type="button"
                      onClick={() => {
                        setSelectedRoleKey(role.key);
                        setActivePanelTitle(null);
                      }}
                      className={classNames(
                        'rounded-xl border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm',
                        selectedRoleKey === role.key ? `${role.soft} ${role.border}` : 'border-white/80 bg-white/70',
                      )}
                    >
                      <p className="text-sm font-black text-slate-950">{role.userName}</p>
                      <p className="truncate text-[11px] font-bold text-slate-500">{role.title.split('·')[0].trim()}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isAdminPreview && (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
                Modo preview admin: estás previsualizando el espacio de {selectedRole.userName}. No cambia tu usuario real ni concede permisos nuevos.
              </div>
            )}

            {activeAnnouncements.length > 0 && (
              <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/90 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-600">Aviso activo hoy</p>
                    <h2 className="mt-1 text-lg font-black text-rose-950">{activeAnnouncements[0].title}</h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-rose-800">{activeAnnouncements[0].description || 'Sin descripción.'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/avisos')}
                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50"
                  >
                    Ver avisos
                  </button>
                </div>
              </div>
            )}

            <HomeSectionHeader
              title="Bandeja personal"
              detail="Decisiones, validaciones y menciones que necesitan tu atención."
            />

            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <MentionSummaryCard
                role={selectedRole}
                title="Decisiones pendientes"
                icon={Inbox}
                rows={decisionMentionsForSelectedUser}
                empty="No hay decisiones ni validaciones pendientes."
                onOpenAll={() => navigate('/mentions')}
                onOpenMention={(mention) => navigate(mention.objectPath || '/mentions')}
              />
              <MentionSummaryCard
                role={selectedRole}
                title="Menciones para mí"
                icon={AtSign}
                rows={generalMentionsForSelectedUser}
                empty="No hay menciones informativas o de consulta pendientes."
                onOpenAll={() => navigate('/mentions')}
                onOpenMention={(mention) => navigate(mention.objectPath || '/mentions')}
              />
            </div>

            <MentionActivityDrawer
              role={selectedRole}
              receivedMentions={mentionsForSelectedUser}
              sentMentions={mentionsBySelectedUser}
              repliedMentions={mentionResponsesForSelectedUser}
              onOpenAll={() => navigate('/mentions')}
              onOpenMention={(mention) => navigate(mention.objectPath || '/mentions')}
            />

            <HomeSectionHeader
              title="Resumen rápido"
              detail="Lo más útil para empezar el día sin entrar todavía en cada módulo."
            />

            <QuickOverviewGrid
              role={selectedRole}
              tasks={selectedPendingTasks.slice(0, 3)}
              checklistItems={homeChecklistItems.filter((item) => !item.completed).slice(0, 3)}
              projects={selectedUserProjects}
              coupons={activeCoupons}
              checklistLoading={checklistLoading}
              onCompleteTask={completeTaskFromHome}
              onToggleChecklist={toggleChecklistFromHome}
              onNavigate={navigate}
            />

            <TagGuideCard role={selectedRole} />

            <HomeSectionHeader
              title={selectedRole.key === 'operations' ? 'Operaciones y proyectos' : 'Mi área'}
              detail="Tableros específicos de este espacio, alimentados por los módulos reales."
            />

            {activePanelTitle && (
              <section className="mb-5 rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={classNames('text-xs font-black uppercase tracking-[0.22em]', selectedRole.accentText)}>Panel abierto</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{activePanelTitle}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActivePanelTitle(null)}
                    className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                    aria-label="Cerrar panel"
                  >
                    <X size={18} />
                  </button>
                </div>
                <PanelPreview
                  role={selectedRole}
                  title={activePanelTitle}
                  tasks={selectedPendingTasks}
                  notifications={unreadNotifications}
                  markAllAsRead={markAllAsRead}
                />
              </section>
            )}

            {selectedRole.key === 'operations' ? (
              <OperationsHomeDashboard
                role={selectedRole}
                priorities={estebanWeeklyPriorities}
                allProjects={orderedEstebanProjects}
                weekDays={currentWeekDays}
                weekBlocks={estebanWeekBlocks}
                ferActiveTasks={ferActiveTasks}
                ferCompletedTasks={ferCompletedTasks}
                ferProgress={ferProgress}
                ferSupportRequests={ferSupportRequests}
                userTasks={selectedPendingTasks}
                selectedAgendaDate={selectedAgendaDate}
                onSelectAgendaDate={setSelectedAgendaDate}
                agenda={selectedAgenda}
                onAgendaChange={(hour, value) => updateAgendaItem(selectedAgendaDate, hour, value)}
                onAgendaMentionCommit={(hour, value) => registerAgendaMentions(selectedAgendaDate, hour, value)}
                onAddWeekBlock={addBlock}
                onAddPersonalWeekBlock={addPersonalWeekBlock}
                onToggleWeeklyPriority={toggleEstebanWeeklyPriority}
                onNavigate={navigate}
              />
            ) : (
              <section className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {dashboardCards.map((card) => (
                  <DashboardCard key={card.title} card={card} role={selectedRole} onClick={() => openCard(card)} />
                ))}
                <WeeklyPersonalAgendaCard
                  role={selectedRole}
                  userId={selectedRole.userId}
                  weekDays={currentWeekDays}
                  weekBlocks={selectedUserWeekBlocks}
                  suggestions={selectedUserWeekSuggestions}
                  projects={selectedUserAllProjects}
                  tasks={selectedPendingTasks}
                  selectedDate={selectedAgendaDate}
                  onSelectDate={setSelectedAgendaDate}
                  agenda={selectedAgenda}
                  onChange={(hour, value) => updateAgendaItem(selectedAgendaDate, hour, value)}
                  onCommitMentions={(hour, value) => registerAgendaMentions(selectedAgendaDate, hour, value)}
                  onAddBlock={addPersonalWeekBlock}
                />
              </section>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function OperationsHomeDashboard({
  role,
  priorities,
  allProjects,
  weekDays,
  weekBlocks,
  ferActiveTasks,
  ferCompletedTasks,
  ferProgress,
  ferSupportRequests,
  userTasks,
  selectedAgendaDate,
  onSelectAgendaDate,
  agenda,
  onAgendaChange,
  onAgendaMentionCommit,
  onAddWeekBlock,
  onAddPersonalWeekBlock,
  onToggleWeeklyPriority,
  onNavigate,
}: {
  role: RoleHome;
  priorities: any[];
  allProjects: any[];
  weekDays: string[];
  weekBlocks: any[];
  ferActiveTasks: any[];
  ferCompletedTasks: any[];
  ferProgress: number;
  ferSupportRequests: any[];
  userTasks: any[];
  selectedAgendaDate: string;
  onSelectAgendaDate: (dateKey: string) => void;
  agenda: Record<string, string>;
  onAgendaChange: (hour: string, value: string) => void;
  onAgendaMentionCommit: (hour: string, value: string) => void;
  onAddWeekBlock: (draft: any) => any;
  onAddPersonalWeekBlock: (draft: any) => void;
  onToggleWeeklyPriority: (projectId: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [inlineBlockDay, setInlineBlockDay] = useState<string | null>(null);
  const [inlineBlockDraft, setInlineBlockDraft] = useState({
    source: 'project',
    projectId: '',
    taskId: '',
    title: '',
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
  });
  const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  const nextStepFor = (project: any) => (
    (project.steps || []).find((step: any) => step.status !== 'completed')
    || (project.steps || [])[0]
  );
  const weeklyProjectSuggestions = useMemo(() => (
    allProjects.flatMap((project) => {
      const projectItems = project.targetDate ? [{
        id: `project-${project.id}`,
        dateKey: project.targetDate,
        projectId: project.id,
        title: project.name,
        detail: 'Fecha objetivo del proyecto',
        source: 'Proyecto',
      }] : [];
      const stepItems = (project.steps || [])
        .filter((step: any) => step.targetDate)
        .map((step: any) => ({
          id: `step-${project.id}-${step.id}`,
          dateKey: step.targetDate,
          projectId: project.id,
          stepId: step.id,
          title: step.name,
          detail: project.name,
          source: 'Paso',
        }));
      return [...projectItems, ...stepItems];
    }).filter((item) => weekDays.includes(item.dateKey))
  ), [allProjects, weekDays]);
  const handleInlineBlockSourceChange = (source: string) => {
    setInlineBlockDraft({
      source,
      projectId: '',
      taskId: '',
      title: '',
      startTime: inlineBlockDraft.startTime,
      endTime: inlineBlockDraft.endTime,
      notes: '',
    });
  };
  const handleSaveInlineBlock = (dayKey: string) => {
    const project = allProjects.find((item) => item.id === inlineBlockDraft.projectId);
    const task = userTasks.find((item) => String(item.id) === inlineBlockDraft.taskId);
    const title = inlineBlockDraft.title.trim() || project?.name || task?.title || '';
    if (!title) return;
    onAddWeekBlock({
      userId: ESTEBAN_ID,
      weekStart: getWeekStartKey(new Date(`${dayKey}T00:00:00`)),
      dateKey: dayKey,
      startTime: inlineBlockDraft.startTime,
      endTime: inlineBlockDraft.endTime,
      kind: inlineBlockDraft.source === 'task' ? 'admin' : inlineBlockDraft.source === 'support' ? 'support' : 'projects',
      title,
      projectId: project?.id,
      requesterId: ESTEBAN_ID,
      notes: inlineBlockDraft.notes || (task ? `Tarea vinculada #${task.id}` : ''),
      updatedBy: ESTEBAN_ID,
    });
    setInlineBlockDraft((prev) => ({ ...prev, projectId: '', taskId: '', title: '', notes: '' }));
    setInlineBlockDay(null);
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
                <FolderKanban size={17} />
              </span>
              <div>
                <h3 className="text-base font-black text-slate-950">Mis prioridades de esta semana</h3>
                <p className="text-xs font-bold text-slate-500">Máximo visual recomendado: 3 proyectos activos.</p>
              </div>
            </div>
            <a href="/projects" onClick={() => onNavigate('/projects')} className={classNames('rounded-xl px-3 py-2 text-xs font-black text-white', role.accent)}>
              Ver cartera
            </a>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {priorities.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500 lg:col-span-3">
                Esteban todavía no tiene proyectos marcados como prioridad activa esta semana.
              </p>
            )}
            {priorities.map((project) => {
              const progress = calculateProjectProgress(project);
              const nextStep = nextStepFor(project);
              return (
                <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className={classNames('rounded-lg px-2 py-1 text-xs font-black text-white', role.accent)}>
                      P{project.weeklyPriorityRank}
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600">
                      {progress.completed}%
                    </span>
                  </div>
                  <h4 className="mt-3 line-clamp-2 text-sm font-black text-slate-950">{project.name}</h4>
                  <p className="mt-1 text-xs font-bold text-slate-500">{projectTypeLabel(project.type)} · {projectStatusLabel(project.status)}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress.completed}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/projects?project=${project.id}&action=step`)}
                    className="mt-3 w-full rounded-lg bg-white p-2 text-left transition hover:bg-emerald-50"
                  >
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Próximo paso</p>
                    <p className="mt-1 text-xs font-bold text-slate-700">{nextStep?.name || 'Añadir siguiente paso'}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{nextStep?.targetDate || project.targetDate || 'Sin fecha objetivo'}</p>
                  </button>
                  <a href={`/projects?project=${project.id}`} onClick={() => onNavigate(`/projects?project=${project.id}`)} className="mt-3 block w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-center text-xs font-black text-emerald-800 hover:bg-emerald-50">
                    Abrir proyecto
                  </a>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <Users size={17} />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-950">Fer · soporte operativo</h3>
              <p className="text-xs font-bold text-slate-500">Tareas activas, completadas y solicitudes de apoyo.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <InfoBlock label="Activas" value={String(ferActiveTasks.length)} />
            <InfoBlock label="Completadas" value={String(ferCompletedTasks.length)} />
            <InfoBlock label="Progreso" value={`${ferProgress}%`} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${ferProgress}%` }} />
          </div>
          <div className="mt-4 space-y-2">
            {ferActiveTasks.slice(0, 4).map((task: any) => (
              <div key={task.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="truncate text-sm font-black text-slate-800">{task.title}</p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">{task.due_date_key || 'Sin fecha'} · {formatVisibleTags(task.tags, 3)}</p>
              </div>
            ))}
            {ferActiveTasks.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay tareas activas para Fer.</p>}
          </div>
          <button type="button" onClick={() => onNavigate('/operaciones-fer?view=solicitud-apoyo')} className={classNames('mt-4 w-full rounded-xl px-3 py-2 text-xs font-black text-white', role.accent)}>
            Ver tareas de Fer
          </button>
        </article>
      </div>

      <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <BriefcaseBusiness size={17} />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-950">Cartera completa de proyectos</h3>
              <p className="text-xs font-bold text-slate-500">Activos, en espera y cartera futura de Esteban.</p>
            </div>
          </div>
          <a href="/projects" onClick={() => onNavigate('/projects')} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-50">
            Abrir proyectos
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <div className="grid grid-cols-[1.5fr_0.8fr_0.7fr_0.7fr_1fr_0.9fr] bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
            <span>Proyecto</span>
            <span>Tipo</span>
            <span>Estado</span>
            <span>Progreso</span>
            <span>Siguiente paso</span>
            <span>Semana</span>
          </div>
          {allProjects.slice(0, 10).map((project) => {
            const progress = calculateProjectProgress(project);
            const nextStep = nextStepFor(project);
            return (
              <div
                key={project.id}
                className={classNames(
                  'grid w-full grid-cols-[1.5fr_0.8fr_0.7fr_0.7fr_1fr_0.9fr] items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs font-bold text-slate-700',
                  project.weeklyPriorityRank ? 'bg-emerald-50/70' : 'hover:bg-slate-50',
                )}
              >
                <button type="button" onClick={() => onNavigate(`/projects?project=${project.id}`)} className="truncate text-left font-black text-slate-900 hover:text-emerald-800">
                  {project.name}
                </button>
                <span className="truncate">{projectTypeLabel(project.type)}</span>
                <span className="truncate">{projectStatusLabel(project.status)}</span>
                <span>{progress.completed}%</span>
                <span className="truncate">{nextStep?.name || 'Por definir'}</span>
                <button
                  type="button"
                  onClick={() => onToggleWeeklyPriority(project.id)}
                  className={classNames(
                    'rounded-lg border px-2 py-1 text-[11px] font-black transition',
                    project.weeklyPriorityRank
                      ? 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-800',
                  )}
                >
                  {project.weeklyPriorityRank ? `P${project.weeklyPriorityRank} activa` : 'Marcar top 3'}
                </button>
              </div>
            );
          })}
          {allProjects.length === 0 && <p className="border-t border-slate-100 px-3 py-4 text-sm font-bold text-slate-500">No hay proyectos de Esteban todavía.</p>}
        </div>
      </article>


      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <WeeklyPersonalAgendaCard
          role={role}
          userId={ESTEBAN_ID}
          weekDays={weekDays}
          weekBlocks={weekBlocks.filter((block) => block.userId === ESTEBAN_ID)}
          suggestions={weeklyProjectSuggestions}
          projects={allProjects}
          tasks={userTasks}
          selectedDate={selectedAgendaDate}
          onSelectDate={onSelectAgendaDate}
          agenda={agenda}
          onChange={onAgendaChange}
          onCommitMentions={onAgendaMentionCommit}
          onAddBlock={onAddPersonalWeekBlock}
        />

        <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <Inbox size={17} />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-950">Solicitudes de apoyo</h3>
              <p className="text-xs font-bold text-slate-500">Peticiones de Fer fuera de sus bloques habituales.</p>
            </div>
          </div>
          <div className="space-y-2">
            {ferSupportRequests.slice(0, 5).map((request) => {
              const requester = USERS.find((user) => user.id === request.requesterId);
              return (
                <div key={request.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                  <p className="text-sm font-black text-slate-800">{request.title}</p>
                  <p className="mt-0.5 text-xs font-bold text-slate-500">{request.dateKey} · {request.startTime}-{request.endTime} · {requester?.name || 'Equipo'}</p>
                </div>
              );
            })}
            {ferSupportRequests.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay solicitudes de apoyo esta semana.</p>}
          </div>
          <button type="button" onClick={() => onNavigate('/operaciones-fer?view=solicitud-apoyo')} className={classNames('mt-4 w-full rounded-xl px-3 py-2 text-xs font-black text-white', role.accent)}>
            Gestionar solicitudes
          </button>
        </article>
      </div>

    </section>
  );
}

function QuickOverviewGrid({
  role,
  tasks,
  checklistItems,
  projects,
  coupons,
  checklistLoading,
  onCompleteTask,
  onToggleChecklist,
  onNavigate,
}: {
  role: RoleHome;
  tasks: any[];
  checklistItems: HomeChecklistItem[];
  projects: any[];
  coupons: any[];
  checklistLoading: boolean;
  onCompleteTask: (todo: any) => void;
  onToggleChecklist: (itemId: string) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <CheckSquare size={17} />
            </span>
            <h3 className="text-base font-black text-slate-950">Tareas pendientes</h3>
          </div>
          <button type="button" onClick={() => onNavigate('/tasks')} className="text-xs font-black text-slate-500 hover:text-slate-900">
            Ver todas
          </button>
        </div>
        <div className="space-y-2">
          {tasks.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay tareas pendientes.</p>}
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <button
                type="button"
                onClick={() => onCompleteTask(task)}
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-600"
                aria-label="Completar tarea"
              >
                <CheckSquare size={13} />
              </button>
              <button type="button" onClick={() => onNavigate(`/tasks?task=${task.id}`)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-black text-slate-800">{task.title}</p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">{task.due_date_key || 'Sin fecha'} · {formatVisibleTags(task.tags, 2)}</p>
              </button>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <ListChecks size={17} />
            </span>
            <h3 className="text-base font-black text-slate-950">Checklist diario</h3>
          </div>
          <button type="button" onClick={() => onNavigate('/checklist')} className="text-xs font-black text-slate-500 hover:text-slate-900">
            Abrir
          </button>
        </div>
        <div className="space-y-2">
          {checklistLoading && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">Cargando checklist...</p>}
          {!checklistLoading && checklistItems.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">Checklist al día.</p>}
          {checklistItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggleChecklist(item.id)}
              className="flex w-full items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:bg-emerald-50"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-slate-300 bg-white text-transparent">
                <CheckSquare size={13} />
              </span>
              <span className="min-w-0 truncate text-sm font-black text-slate-800">{item.text}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <FolderKanban size={17} />
            </span>
            <h3 className="text-base font-black text-slate-950">Mis proyectos</h3>
          </div>
          <button type="button" onClick={() => onNavigate('/projects')} className="text-xs font-black text-slate-500 hover:text-slate-900">
            Ver cartera
          </button>
        </div>
        <div className="space-y-2">
          {projects.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay proyectos visibles.</p>}
          {projects.map((project) => {
            const progress = calculateProjectProgress(project);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onNavigate(`/projects?project=${project.id}`)}
                className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:bg-white"
              >
                <p className="truncate text-sm font-black text-slate-900">{project.name}</p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">{projectStatusLabel(project.status)} · {progress.completed}%</p>
              </button>
            );
          })}
        </div>
      </article>

      <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <Tags size={17} />
            </span>
            <h3 className="text-base font-black text-slate-950">Cupones activos</h3>
          </div>
          <button type="button" onClick={() => onNavigate('/finanzas-operativas?view=promociones')} className="text-xs font-black text-slate-500 hover:text-slate-900">
            Abrir
          </button>
        </div>
        <div className="space-y-2">
          {coupons.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">No hay cupones activos.</p>}
          {coupons.length > 0 && (
            <details className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{coupons.length} cupón/promoción activa(s)</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-500">Abrir lista sin ocupar toda la pantalla</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">Ver</span>
                </div>
              </summary>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {coupons.map((promotion) => (
                  <button
                    key={promotion.id}
                    type="button"
                    onClick={() => onNavigate('/finanzas-operativas?view=promociones')}
                    className="w-full rounded-xl border border-white bg-white px-3 py-2 text-left hover:border-slate-200"
                  >
                    <p className="truncate text-sm font-black text-slate-900">{promotion.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs font-bold text-slate-500">
                      {promotion.audience || promotion.howItWorks || 'Sin público'} · {promotion.endDate || 'sin fin'}
                    </p>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </article>
    </section>
  );
}

function HomeSectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function TagGuideCard({ role }: { role: RoleHome }) {
  const [isOpen, setIsOpen] = useState(false);
  const mentionTypes = [
    { label: 'Informar', detail: 'solo para que la persona lo vea' },
    { label: 'Consultar', detail: 'necesita respuesta u opinión' },
    { label: 'Participar', detail: 'la persona debe intervenir' },
    { label: 'Validar', detail: 'requiere visto bueno' },
    { label: 'Decidir', detail: 'requiere una decisión registrada' },
  ];
  const responseActions = ['Aprobar', 'En espera', 'No aprobar', 'Observación'];

  return (
    <section className="mb-5 rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
              <AtSign size={17} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Guía rápida</p>
              <h3 className="text-base font-black text-slate-950">Cómo usar menciones y tags</h3>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">@persona conecta contexto</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">tipo: informar / validar / decidir</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">#tag clasifica y busca</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className={classNames('shrink-0 rounded-xl px-3 py-2 text-xs font-black text-white shadow-sm', role.accent)}
        >
          {isOpen ? 'Ocultar guía' : 'Ver guía'}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold leading-6 text-slate-600">
            Usa <span className="font-black text-slate-900">@persona</span> cuando necesites conectar a alguien con un contexto concreto. Esa persona verá solo ese objeto en <span className="font-black text-slate-900">Menciones para mí</span>, no todo tu espacio.
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <AtSign size={15} className={role.accentText} />
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Tipos de mención</p>
            </div>
            <div className="mt-3 space-y-2">
              {mentionTypes.map((type) => (
                <div key={type.label} className="rounded-lg border border-white bg-white px-3 py-2">
                  <p className="text-sm font-black text-slate-900">{type.label}</p>
                  <p className="text-xs font-semibold text-slate-500">{type.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <CheckSquare size={15} className={role.accentText} />
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Si requiere acción</p>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Las menciones de consultar, validar o decidir pueden responderse y quedan guardadas con usuario, fecha, respuesta y comentario.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {responseActions.map((action) => (
                <span key={action} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">{action}</span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Tags size={15} className={role.accentText} />
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Tags de búsqueda</p>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Usa <span className="font-black text-slate-900">#tags</span> para clasificar productos, temas y patrones. Los tags no aprueban nada: solo ordenan y ayudan a encontrar.
            </p>
            <div className="mt-3 space-y-2">
              {tagGroups.map((tags, index) => (
                <div key={index} className="flex flex-wrap gap-2">
                  {tags.slice(0, 6).map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">{tag.startsWith('@') ? tag : `#${tag}`}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MentionActivityDrawer({
  role,
  receivedMentions,
  sentMentions,
  repliedMentions,
  onOpenAll,
  onOpenMention,
}: {
  role: RoleHome;
  receivedMentions: Mention[];
  sentMentions: Mention[];
  repliedMentions: Mention[];
  onOpenAll: () => void;
  onOpenMention: (mention: Mention) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pendingReceived = receivedMentions.filter((mention) => mention.status === 'pending').length;

  return (
    <section className="mb-5 rounded-2xl border border-white/85 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
            <Bell size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-950">Actividad de menciones</h3>
            <p className="mt-0.5 text-xs font-bold text-slate-500">
              Recibidas, enviadas y respuestas recientes. La más nueva aparece primero.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
            {pendingReceived} pendiente(s)
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {sentMentions.length} enviadas
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
            {repliedMentions.length} con respuesta
          </span>
          <span className={classNames('rounded-xl px-3 py-2 text-xs font-black text-white', role.accent)}>
            {isOpen ? 'Ocultar' : 'Ver resumen'}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <MentionActivityList
              title="Me mencionaron"
              empty="No hay menciones recibidas todavía."
              mentions={receivedMentions}
              mode="received"
              onOpenAll={onOpenAll}
              onOpenMention={onOpenMention}
            />
            <MentionActivityList
              title="Menciones que hice"
              empty="No has mencionado a nadie todavía."
              mentions={sentMentions}
              mode="sent"
              onOpenAll={onOpenAll}
              onOpenMention={onOpenMention}
            />
            <MentionActivityList
              title="Respuestas recibidas"
              empty="Todavía no han respondido tus menciones."
              mentions={repliedMentions}
              mode="responses"
              onOpenAll={onOpenAll}
              onOpenMention={onOpenMention}
            />
          </div>
          <button
            type="button"
            onClick={onOpenAll}
            className={classNames('mt-4 rounded-xl px-3 py-2 text-xs font-black text-white', role.accent)}
          >
            Abrir bandeja completa
          </button>
        </div>
      )}
    </section>
  );
}

function MentionActivityList({
  title,
  empty,
  mentions,
  mode,
  onOpenAll,
  onOpenMention,
}: {
  title: string;
  empty: string;
  mentions: Mention[];
  mode: 'received' | 'sent' | 'responses';
  onOpenAll: () => void;
  onOpenMention: (mention: Mention) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600">{mentions.length}</span>
      </div>
      <div className="space-y-2">
        {mentions.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-sm font-bold text-slate-500">{empty}</p>
        )}
        {mentions.slice(0, 4).map((mention) => {
          const source = USERS.find((user) => user.id === mention.sourceUserId);
          const target = USERS.find((user) => user.id === mention.targetUserId);
          const latestResponse = [...(mention.responses || [])]
            .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0))[0];
          const dateLabel = mode === 'responses'
            ? formatMentionActivityDate(latestResponse?.createdAt || mention.updatedAt)
            : formatMentionActivityDate(mention.createdAt);
          const personLabel = mode === 'sent'
            ? `Para ${target?.name || 'Equipo'}`
            : mode === 'responses'
              ? `${target?.name || 'Equipo'} respondió`
              : `De ${source?.name || 'Equipo'}`;

          return (
            <button
              key={mention.id}
              type="button"
              onClick={() => mention.objectPath ? onOpenMention(mention) : onOpenAll()}
              className="w-full rounded-lg border border-white bg-white px-3 py-2 text-left hover:border-slate-200 hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-800">{mention.title}</span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                    {personLabel} · {mention.originLabel || mention.originType}
                  </span>
                </span>
                <span className={classNames('shrink-0 rounded-lg px-2 py-1 text-[11px] font-black', tonePill(mention.status === 'pending' ? 'amber' : mention.status === 'approved' || mention.status === 'informed' ? 'green' : mention.status === 'rejected' ? 'red' : 'blue'))}>
                  {mode === 'responses' ? mentionStatusLabel(mention.status) : mentionTypeLabel(mention.mentionType)}
                </span>
              </div>
              {mode === 'responses' && latestResponse?.comment && (
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{latestResponse.comment}</p>
              )}
              <p className="mt-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{dateLabel}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MentionSummaryCard({
  role,
  title,
  icon: Icon,
  rows,
  empty,
  onOpenAll,
  onOpenMention,
}: {
  role: RoleHome;
  title: string;
  icon: React.ElementType;
  rows: Mention[];
  empty: string;
  onOpenAll: () => void;
  onOpenMention: (mention: Mention) => void;
}) {
  return (
    <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
            <Icon size={17} />
          </span>
          <h3 className="text-base font-black text-slate-950">{title}</h3>
        </div>
        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-black text-red-600">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">{empty}</p>
        )}
        {rows.slice(0, 3).map((mention) => {
          const source = USERS.find((user) => user.id === mention.sourceUserId);
          return (
            <button
              key={mention.id}
              type="button"
              onClick={() => mention.objectPath ? onOpenMention(mention) : onOpenAll()}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-left hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-800">{mention.title}</span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                  {source?.name || 'Equipo'} · {mention.originLabel || mention.originType}
                </span>
              </span>
              <span className={classNames('shrink-0 rounded-lg px-2 py-1 text-[11px] font-black', tonePill(mention.mentionType === 'decidir' ? 'amber' : mention.mentionType === 'validar' ? 'blue' : 'slate'))}>
                {mentionTypeLabel(mention.mentionType)}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onOpenAll} className={classNames('mt-3 rounded-xl px-3 py-2 text-xs font-black text-white', role.accent)}>
        Ver todas
      </button>
    </article>
  );
}

function WeeklyPersonalAgendaCard({
  role,
  userId,
  weekDays,
  weekBlocks,
  suggestions,
  projects,
  tasks,
  selectedDate,
  onSelectDate,
  agenda,
  onChange,
  onCommitMentions,
  onAddBlock,
}: {
  role: RoleHome;
  userId: string;
  weekDays: string[];
  weekBlocks: any[];
  suggestions: any[];
  projects: any[];
  tasks: any[];
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  agenda: Record<string, string>;
  onChange: (hour: string, value: string) => void;
  onCommitMentions?: (hour: string, value: string) => void;
  onAddBlock: (draft: any) => void;
}) {
  const [draft, setDraft] = useState({
    source: 'suggestion',
    suggestionId: '',
    projectId: '',
    taskId: '',
    title: '',
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
  });
  const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  const selectedDaySuggestions = suggestions.filter((item) => item.dateKey === selectedDate);
  const selectedDayBlocks = weekBlocks.filter((block) => block.dateKey === selectedDate);

  const saveBlock = (sourceOverride?: any) => {
    const suggestion = sourceOverride || suggestions.find((item) => item.id === draft.suggestionId);
    const project = projects.find((item) => item.id === (suggestion?.projectId || draft.projectId));
    const task = tasks.find((item) => String(item.id) === draft.taskId);
    const title = String(draft.title || suggestion?.title || project?.name || task?.title || '').trim();
    if (!title || !userId || !selectedDate) return;
    const notes = draft.notes || suggestion?.detail || (task ? `Tarea vinculada #${task.id}` : '');
    onAddBlock({
      dateKey: selectedDate,
      startTime: draft.startTime,
      endTime: draft.endTime,
      title,
      projectId: project?.id || suggestion?.projectId,
      kind: draft.source === 'task' ? 'admin' : 'projects',
      notes,
    });
    const agendaText = notes ? `${title} · ${notes}` : title;
    if (agendaText.includes('@')) {
      onCommitMentions?.(draft.startTime, agendaText);
    }
    setDraft((prev) => ({
      ...prev,
      suggestionId: '',
      projectId: '',
      taskId: '',
      title: '',
      notes: '',
    }));
  };

  return (
    <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm md:col-span-2 xl:col-span-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
            <CalendarDays size={17} />
          </span>
          <div>
            <h3 className="text-base font-black text-slate-950">Mi jornada semanal</h3>
            <p className="text-xs font-bold text-slate-500">
              Las fechas objetivo de proyectos y pasos aparecen aquí por defecto. Clica un día para asignar horas.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
          {weekBlocks.length} bloque(s)
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50">
          {weekDays.map((dayKey, index) => {
            const isSelected = selectedDate === dayKey;
            return (
              <button
                key={`head-${dayKey}`}
                type="button"
                onClick={() => onSelectDate(dayKey)}
                className={classNames(
                  'border-r border-slate-200 px-3 py-2 text-left last:border-r-0',
                  isSelected ? role.soft : 'hover:bg-white',
                )}
              >
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{weekdayLabels[index]}</p>
                <p className="mt-0.5 text-sm font-black text-slate-900">{dayKey.slice(8)} / {dayKey.slice(5, 7)}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-5">
          {weekDays.map((dayKey) => {
            const dayBlocks = weekBlocks.filter((block) => block.dateKey === dayKey);
            const daySuggestions = suggestions.filter((item) => item.dateKey === dayKey);
            const visibleBlocks = dayBlocks.slice(0, 3);
            const visibleSuggestions = daySuggestions.slice(0, Math.max(0, 4 - visibleBlocks.length));
            const isSelected = selectedDate === dayKey;
            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => onSelectDate(dayKey)}
                className={classNames(
                  'min-h-[190px] border-r border-slate-200 p-2.5 text-left transition last:border-r-0',
                  isSelected ? `${role.soft} ring-2 ring-inset ring-white/80` : 'bg-white hover:bg-slate-50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={classNames('h-2 w-2 rounded-full', isSelected ? role.accent : 'bg-slate-300')} />
                  {(dayBlocks.length + daySuggestions.length) > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                      {dayBlocks.length + daySuggestions.length}
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1.5">
                  {visibleBlocks.map((block) => (
                    <div key={block.id} className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1.5">
                      <p className="text-[10px] font-black text-emerald-700">{block.startTime}-{block.endTime}</p>
                      <p className="truncate text-[11px] font-bold text-slate-800">{block.title}</p>
                    </div>
                  ))}
                  {visibleSuggestions.map((item) => (
                    <div key={item.id} className="rounded-lg border border-dashed border-slate-200 bg-white/80 px-2 py-1.5">
                      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{item.source}</p>
                      <p className="truncate text-[11px] font-bold text-slate-700">{item.title}</p>
                    </div>
                  ))}
                  {dayBlocks.length === 0 && daySuggestions.length === 0 && (
                    <p className="pt-10 text-center text-[11px] font-semibold text-slate-300">Sin fechas</p>
                  )}
                  {(dayBlocks.length + daySuggestions.length) > 4 && (
                    <p className="text-[10px] font-black text-slate-400">+{dayBlocks.length + daySuggestions.length - 4} más</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Proyectos de {selectedDate}</p>
              <p className="text-xs font-semibold text-slate-500">Asigna hora o añade otro proyecto/tarea.</p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600">
              {selectedDaySuggestions.length + selectedDayBlocks.length}
            </span>
          </div>

          <div className="space-y-2">
            {selectedDaySuggestions.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-white bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{item.source} · {item.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((prev) => ({ ...prev, source: 'suggestion', suggestionId: item.id, title: item.title, projectId: item.projectId || '' }));
                    }}
                    className={classNames('shrink-0 rounded-lg px-2 py-1 text-[11px] font-black text-white', role.accent)}
                  >
                    Preparar
                  </button>
                </div>
              </div>
            ))}
            {selectedDaySuggestions.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-sm font-bold text-slate-500">
                No hay proyectos o pasos con fecha objetivo este día. Puedes añadir uno manualmente.
              </p>
            )}
          </div>

          <div className="mt-3 space-y-2 rounded-xl border border-white bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={draft.source} onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value, suggestionId: '', projectId: '', taskId: '' }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold">
                <option value="suggestion">Fecha sugerida</option>
                <option value="project">Elegir proyecto</option>
                <option value="task">Elegir tarea</option>
                <option value="free">Bloque libre</option>
              </select>
              {draft.source === 'suggestion' && (
                <select value={draft.suggestionId} onChange={(event) => setDraft((prev) => ({ ...prev, suggestionId: event.target.value }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold">
                  <option value="">Elegir sugerencia</option>
                  {selectedDaySuggestions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              )}
              {draft.source === 'project' && (
                <select value={draft.projectId} onChange={(event) => setDraft((prev) => ({ ...prev, projectId: event.target.value }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold">
                  <option value="">Elegir proyecto</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              )}
              {draft.source === 'task' && (
                <select value={draft.taskId} onChange={(event) => setDraft((prev) => ({ ...prev, taskId: event.target.value }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold">
                  <option value="">Elegir tarea</option>
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={draft.startTime} onChange={(event) => setDraft((prev) => ({ ...prev, startTime: event.target.value }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold" />
              <input type="time" value={draft.endTime} onChange={(event) => setDraft((prev) => ({ ...prev, endTime: event.target.value }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold" />
            </div>
            <input value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título opcional o bloque libre" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold" />
            <input value={draft.notes} onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notas opcionales, puedes escribir @persona" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold" />
            <button type="button" onClick={() => saveBlock()} className={classNames('w-full rounded-lg px-3 py-2 text-xs font-black text-white', role.accent)}>
              Guardar en jornada semanal y calendario del día
            </button>
          </div>
        </div>

        <DailyAgendaCard
          role={role}
          dateKey={selectedDate}
          agenda={agenda}
          onChange={onChange}
          onCommitMentions={onCommitMentions}
        />
      </div>
    </article>
  );
}

function DailyAgendaCard({
  role,
  dateKey,
  agenda,
  onChange,
  onCommitMentions,
}: {
  role: RoleHome;
  dateKey?: string;
  agenda: Record<string, string>;
  onChange: (hour: string, value: string) => void;
  onCommitMentions?: (hour: string, value: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-white/85 bg-white/82 p-4 shadow-sm backdrop-blur-sm md:col-span-2 xl:col-span-3">
      <div className="mb-3 flex items-center gap-2">
        <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
          <CalendarDays size={17} />
        </span>
        <div>
          <h3 className="text-base font-black text-slate-950">{dateKey ? `Calendario del día · ${dateKey}` : 'Calendario de hoy'}</h3>
          <p className="text-xs font-bold text-slate-500">Planifica de 08:00 a 17:00. Puedes escribir @persona dentro de la actividad.</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-100">
        {agendaHours.map((hour) => (
          <div key={hour} className="grid grid-cols-[86px_minmax(0,1fr)] border-b border-slate-100 last:border-b-0">
            <div className="bg-slate-50 px-3 py-2 text-xs font-black text-slate-500">{hour}</div>
            <input
              value={agenda[hour] || ''}
              onChange={(event) => onChange(hour, event.target.value)}
              onBlur={(event) => onCommitMentions?.(hour, event.target.value)}
              placeholder="Actividad, reunión, foco de trabajo..."
              className="min-w-0 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-300"
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function DashboardCard({ card, role, onClick }: { card: PanelCard; role: RoleHome; onClick: () => void }) {
  const Icon = card.icon;
  const isCompactWarehouseCard = role.key === 'warehouse' && ['Pedidos de hoy', 'Stock crítico', 'Incidencias de producto', 'Despachos de hoy'].includes(card.title);
  return (
    <article
      className={classNames(
        'rounded-2xl border border-white/85 bg-white/82 shadow-sm backdrop-blur-sm',
        isCompactWarehouseCard ? 'p-3' : 'p-4',
        card.span === 'wide' && 'md:col-span-2',
        card.span === 'tall' && 'row-span-2',
      )}
    >
      <button type="button" onClick={onClick} className="mb-3 flex w-full items-start justify-between gap-3 text-left">
        <div className="flex items-center gap-2">
          <span className={classNames('rounded-xl p-2 text-white', role.accent)}>
            <Icon size={17} />
          </span>
          <h3 className="text-base font-black text-slate-950">{card.title}</h3>
        </div>
        {card.badge && (
          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-black text-red-600">{card.badge}</span>
        )}
      </button>

      {card.metrics && (
        <div className={classNames('grid grid-cols-3', isCompactWarehouseCard ? 'gap-1.5' : 'gap-2')}>
          {card.metrics.map((metric) => (
            <div key={metric.label} className={classNames('rounded-xl bg-slate-50 text-center', isCompactWarehouseCard ? 'px-2 py-2' : 'px-3 py-3')}>
              <p className={classNames(isCompactWarehouseCard ? 'text-xl font-black' : 'text-2xl font-black', toneText(metric.tone))}>{metric.value}</p>
              <p className="mt-1 text-[11px] font-bold leading-4 text-slate-500">{metric.label}</p>
              {metric.hint && <p className="mt-1 text-[11px] font-black text-emerald-600">{metric.hint}</p>}
            </div>
          ))}
        </div>
      )}

      {card.rows && (
        <div className={classNames(isCompactWarehouseCard ? 'space-y-1.5' : 'space-y-2')}>
          {card.rows.map((row) => (
            <div key={`${card.title}-${row.label}`} className={classNames('flex items-start justify-between gap-2 border-b border-slate-100 last:border-0 last:pb-0', isCompactWarehouseCard ? 'pb-1.5' : 'pb-2')}>
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-slate-300 bg-white" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-700">{row.label}</p>
                  {row.detail && <p className="truncate text-xs font-semibold text-slate-500">{row.detail}</p>}
                </div>
              </div>
              {row.status && (
                <span className={classNames('shrink-0 rounded-lg px-2 py-1 text-[11px] font-black', tonePill(row.tone))}>
                  {row.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {card.table && (
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <div className="grid bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: `repeat(${card.table.headers.length}, minmax(0, 1fr))` }}>
            {card.table.headers.map((header) => <div key={header} className="px-2 py-2">{header}</div>)}
          </div>
          {card.table.rows.map((row, rowIndex) => (
            <div key={`${card.title}-${rowIndex}`} className="grid border-t border-slate-100 text-xs font-bold text-slate-700" style={{ gridTemplateColumns: `repeat(${card.table.headers.length}, minmax(0, 1fr))` }}>
              {row.map((cell, cellIndex) => <div key={`${cell}-${cellIndex}`} className="truncate px-2 py-2">{cell}</div>)}
            </div>
          ))}
        </div>
      )}

      {card.progress && (
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[10px] border-teal-200 bg-white">
            <span className="text-lg font-black text-teal-700">{card.progress.value}%</span>
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">{card.progress.label}</p>
            {card.progress.detail && <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{card.progress.detail}</p>}
          </div>
        </div>
      )}

      {card.actions && (
        <div className="space-y-2">
          {card.actions.map((action) => (
            <button key={action} type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-50">
              <PlusCircle size={14} className={role.accentText} />
              {action}
            </button>
          ))}
        </div>
      )}

      {card.note && (
        <div className="min-h-[112px] rounded-xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-400">
          {card.note}
        </div>
      )}
    </article>
  );
}

function PanelPreview({
  role,
  title,
  tasks,
  notifications,
  markAllAsRead,
}: {
  role: RoleHome;
  title: string;
  tasks: any[];
  notifications: any[];
  markAllAsRead: () => void;
}) {
  if (title === 'Notificaciones') {
    return (
      <div className="mt-4">
        <button type="button" onClick={markAllAsRead} className={classNames('mb-3 rounded-xl px-3 py-2 text-sm font-black text-white', role.accent)}>
          Marcar todas como leídas
        </button>
        <PreviewRows rows={notifications.slice(0, 5).map((notification: any) => notification.title || notification.message || 'Notificación')} empty="No hay notificaciones sin leer." />
      </div>
    );
  }

  if (title === 'Inicio') {
    return (
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoBlock label="Tareas pendientes" value={String(tasks.length)} />
        <InfoBlock label="Menciones" value={String(notifications.length)} />
        <InfoBlock label="Estado" value="En revisión" />
      </div>
    );
  }

  if (title.toLowerCase().includes('tag') || title.toLowerCase().includes('mencion')) {
    return (
      <div className="mt-4 space-y-3">
        {tagGroups.map((tags, index) => (
          <div key={index} className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">{tag}</span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <PreviewRows rows={tasks.slice(0, 4).map((todo: any) => todo.title || todo.description || 'Tarea pendiente')} empty="No hay tareas pendientes para mostrar." />
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-sm font-black text-slate-900">Plantilla editable propuesta</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          Aquí irían notas, observaciones, menciones, archivos adjuntos, estado y enlace al origen exacto.
        </p>
      </div>
    </div>
  );
}

function PreviewRows({ rows, empty }: { rows: string[]; empty: string }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">{empty}</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm font-bold text-slate-700">
          <span className="h-4 w-4 rounded border-2 border-slate-300" />
          {row}
        </div>
      ))}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <p className="text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function tonePill(tone: PanelRow['tone']) {
  if (tone === 'green') return 'bg-emerald-100 text-emerald-700';
  if (tone === 'amber') return 'bg-amber-100 text-amber-700';
  if (tone === 'red') return 'bg-red-100 text-red-700';
  if (tone === 'blue') return 'bg-blue-100 text-blue-700';
  if (tone === 'purple') return 'bg-violet-100 text-violet-700';
  return 'bg-slate-100 text-slate-600';
}

function toneText(tone: PanelMetric['tone']) {
  if (tone === 'green') return 'text-emerald-700';
  if (tone === 'amber') return 'text-amber-700';
  if (tone === 'red') return 'text-red-700';
  if (tone === 'blue') return 'text-blue-700';
  if (tone === 'purple') return 'text-violet-700';
  return 'text-slate-900';
}

export default RoleHomePrototypePage;
