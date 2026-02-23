import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    CalendarClock,
    Coffee,
    Clock3,
    Download,
    Edit2,
    GraduationCap,
    Info,
    MessageCircle,
    Save,
    Sparkles,
    UserX,
    XCircle,
    Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useTraining } from '../hooks/useTraining';
import { useAbsences } from '../hooks/useAbsences';
import { useTimeData } from '../hooks/useTimeData';
import { useDailyStatus } from '../hooks/useDailyStatus';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useNotificationsContext } from '../context/NotificationsContext';
import { useWorkProfile } from '../hooks/useWorkProfile';
import { useChat } from '../hooks/useChat';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import { UserAvatar } from '../components/UserAvatar';
import { CARLOS_EMAIL, ESTEBAN_ID, USERS } from '../constants';
import { formatDatePretty, toDateKey } from '../utils/dateUtils';
import { calculateHours, formatHours } from '../utils/timeUtils';
import { openPrintablePdfReport } from '../utils/pdfReport';
import { supabase } from '../lib/supabase';
import { FileUploader, Attachment } from '../components/FileUploader';
import TaskDetailModal from '../components/TaskDetailModal';
import { Todo } from '../types';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { useDensityMode } from '../hooks/useDensityMode';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import huarteSeed from '../data/inventory_facturacion_seed.json';
import canetSeed from '../data/inventory_seed.json';
import LinkifiedText from '../components/LinkifiedText';

type NotificationFilter = 'all' | 'tasks' | 'schedule' | 'meetings' | 'absences' | 'trainings' | 'stock';
type QuickRequestType = 'absence' | 'vacation' | 'meeting' | 'training' | null;
type ManagedRequestRow = {
    source: 'absence' | 'meeting' | 'training';
    id: number;
    created_by: string;
    created_at: string;
    status: string;
    title: string;
    dateText: string;
    description: string;
    responseMessage: string;
    attachments: Attachment[];
    absenceType?: 'absence' | 'vacation' | 'special_permit';
    dateKey?: string;
    endDate?: string;
    preferredDateKey?: string | null;
    requestedDateKey?: string | null;
};
type InventoryAlertsSummary = {
    updatedAt?: string;
    criticalProducts?: Array<{ producto: string; stockTotal: number; coberturaMeses: number }>;
    mountedCritical?: Array<{ producto: string; stockTotal: number; coberturaMeses: number }>;
    potentialCritical?: Array<{ producto: string; cajasPotenciales: number; coberturaMeses: number }>;
    mountedVisual?: Array<{ producto: string; stockTotal: number; byBodega: Array<{ bodega: string; cantidad: number }> }>;
    potentialVisual?: Array<{ producto: string; cajasPotenciales: number; coberturaMeses: number }>;
    mountedCriticalDetails?: Array<{ producto: string; byBodega: Array<{ bodega: string; cantidad: number }>; byLote: Array<{ lote: string; cantidad: number }> }>;
    potentialCriticalDetails?: Array<{ producto: string; byLote: Array<{ lote: string; cantidad: number }> }>;
    globalStockByProductLot?: Array<{ producto: string; lote: string; stockTotal: number }>;
    globalStockByProductLotBodega?: Array<{ producto: string; lote: string; bodega: string; stockTotal: number }>;
    caducity?: Array<{ producto: string; lote: string; fecha: string; days: number }>;
};

const INVENTORY_ALERTS_KEY = 'inventory_alerts_summary_v1';
const INVENTORY_HUARTE_MOVS_KEY = 'invhf_movimientos_v1';
const INVENTORY_CANET_MOVS_KEY = 'inventory_canet_movimientos_v1';

const notificationFilterLabels: Record<NotificationFilter, string> = {
    all: 'Todas',
    tasks: 'Tareas',
    schedule: 'Horario',
    meetings: 'Reuniones',
    absences: 'Ausencias',
    trainings: 'Formaciones',
    stock: 'Stock',
};

const PRODUCT_COLORS: Record<string, string> = {
    SV: '#83b06f',
    ENT: '#76a5af',
    KL: '#ec4899',
    ISO: '#fca5a5',
    AV: '#fdba74',
    RG: '#1e3a8a',
};

const BODEGA_COLORS = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#e11d48'];
const PRODUCT_LOT_PALETTES: Record<string, string[]> = {
    SV: ['#4d7c0f', '#65a30d', '#84cc16', '#a3e635', '#bef264'],
    ENT: ['#155e75', '#0e7490', '#0891b2', '#06b6d4', '#67e8f9'],
    KL: ['#9d174d', '#be185d', '#db2777', '#ec4899', '#f472b6'],
    ISO: ['#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#fca5a5'],
    AV: ['#9a3412', '#c2410c', '#ea580c', '#f59e0b', '#fdba74'],
    RG: ['#1e1b4b', '#312e81', '#3730a3', '#4338ca', '#6366f1'],
};

const formatCoverageText = (months: number) => {
    if (!Number.isFinite(months) || months <= 0) return '0 días';
    const totalDays = Math.round(months * 30);
    if (totalDays < 30) return `${totalDays} días`;
    const wholeMonths = Math.floor(totalDays / 30);
    const restDays = totalDays % 30;
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

const clean = (v: unknown) => (v == null ? '' : String(v).trim());
const productKey = (v: unknown) => clean(v).toUpperCase();
const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const normStatus = (value: unknown) => clean(value).toLowerCase();

function Dashboard() {
    const { currentUser } = useAuth();
    const queryClient = useQueryClient();
    const isAdmin = !!currentUser?.isAdmin;
    const navigate = useNavigate();
    const location = useLocation();
    const { todos } = useTodos(currentUser);
    const { meetingRequests, createMeeting, updateMeetingStatus, deleteMeeting } = useMeetings(currentUser);
    const { trainingRequests, createTrainingRequest, updateTrainingRequest, deleteTrainingRequest } = useTraining(currentUser);
    const { absenceRequests, createAbsence, updateAbsence, updateAbsenceStatus, deleteAbsence } = useAbsences(currentUser);
    const { timeData, updateTimeEntry } = useTimeData();
    const { userProfiles } = useWorkProfile();
    const { dailyStatuses, setDailyStatus } = useDailyStatus(currentUser);
    const { calendarEvents, createEvent } = useCalendarEvents();
    const { notifications, sendCaffeineBoost, markAllAsRead, markAsRead } = useNotificationsContext();
    const { conversations: chatConversations } = useChat(currentUser, null);

    const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all');
    const [eventDraft, setEventDraft] = useState('');
    const [savingMood, setSavingMood] = useState<string | null>(null);
    const [editingDateKey, setEditingDateKey] = useState<string | null>(null);
    const [timeEdit, setTimeEdit] = useState({ entry: '', exit: '' });
    const [savingRow, setSavingRow] = useState(false);

    const [checklistLoading, setChecklistLoading] = useState(false);
    const [checklistSaving, setChecklistSaving] = useState(false);
    const [checklistTasks, setChecklistTasks] = useState<Array<{ id: string; text: string; completed: boolean }>>([]);
    const [showAllTimeRows, setShowAllTimeRows] = useState(false);
    const [activeRequestModal, setActiveRequestModal] = useState<QuickRequestType>(null);
    const [requestDate, setRequestDate] = useState(toDateKey(new Date()));
    const [requestEndDate, setRequestEndDate] = useState('');
    const [requestIsDateRange, setRequestIsDateRange] = useState(false);
    const [requestAbsenceType, setRequestAbsenceType] = useState<'special_permit' | 'absence'>('absence');
    const [requestMakeUpHours, setRequestMakeUpHours] = useState(false);
    const [requestReason, setRequestReason] = useState('');
    const [requestTitle, setRequestTitle] = useState('');
    const [requestDescription, setRequestDescription] = useState('');
    const [requestSlot, setRequestSlot] = useState('indiferente');
    const [requestParticipants, setRequestParticipants] = useState<string[]>([]);
    const [requestAttachments, setRequestAttachments] = useState<Attachment[]>([]);
    const [requestTargetUserId, setRequestTargetUserId] = useState<string>('');
    const [requestSubmitting, setRequestSubmitting] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Todo | null>(null);
    const [sendingBoostTo, setSendingBoostTo] = useState<string | null>(null);
    const [boostToastName, setBoostToastName] = useState<string | null>(null);
    const [inventoryAlerts] = useSharedJsonState<InventoryAlertsSummary | null>(
        INVENTORY_ALERTS_KEY,
        null,
        { userId: currentUser?.id },
    );
    const [huarteMovementsShared] = useSharedJsonState<any[]>(
        INVENTORY_HUARTE_MOVS_KEY,
        (huarteSeed.movimientos as any[]) || [],
        { userId: currentUser?.id },
    );
    const [canetMovementsShared] = useSharedJsonState<any[]>(
        INVENTORY_CANET_MOVS_KEY,
        (canetSeed.movimientos as any[]) || [],
        { userId: currentUser?.id },
    );
    const [inventoryPanelMode, setInventoryPanelMode] = useState<'critical' | 'general'>('critical');
    const [selectedInventoryDetail, setSelectedInventoryDetail] = useState<{
        tipo: 'mounted' | 'potential' | 'canet';
        producto: string;
        byBodega?: Array<{ bodega: string; cantidad: number }>;
        byLote: Array<{ lote: string; cantidad: number }>;
    } | null>(null);
    const [selectedGeneralLotDetail, setSelectedGeneralLotDetail] = useState<{
        producto: string;
        lote: string;
        total: number;
        byBodega: Array<{ bodega: string; cantidad: number }>;
    } | null>(null);
    const [showAbsencesManageModal, setShowAbsencesManageModal] = useState(false);
    const [showMyRequestModal, setShowMyRequestModal] = useState(false);
    const [manageRequestsTab, setManageRequestsTab] = useState<'pending' | 'resolved'>('pending');
    const [selectedManagedRequest, setSelectedManagedRequest] = useState<ManagedRequestRow | null>(null);
    const [selectedMyRequest, setSelectedMyRequest] = useState<ManagedRequestRow | null>(null);
    const [manageRequestDate, setManageRequestDate] = useState('');
    const [manageRequestTitle, setManageRequestTitle] = useState('');
    const [manageRequestDescription, setManageRequestDescription] = useState('');
    const [manageRequestComment, setManageRequestComment] = useState('');
    const [manageRequestAttachments, setManageRequestAttachments] = useState<Attachment[]>([]);
    const [manageSaving, setManageSaving] = useState(false);
    const [showCompactTimeTracker, setShowCompactTimeTracker] = useState(false);
    const [summaryModal, setSummaryModal] = useState<{
        kind: 'tasks' | 'meetings' | 'trainings' | 'absences';
        title: string;
        items: any[];
    } | null>(null);
    const densityMode = useDensityMode();
    const isCompact = densityMode === 'compact';
    const [compactSection, setCompactSection] = useState<
        'events' | 'quick' | 'checklist' | 'time' | 'absences' | 'trainings' | 'alerts' | 'notifications' | 'pulse' | 'chat'
    >('events');

    useEffect(() => {
        if (location.hash !== '#time-summary') return;
        const timer = window.setTimeout(() => {
            const block = document.getElementById('dashboard-time-summary');
            if (block) {
                block.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            navigate('/dashboard', { replace: true });
        }, 80);
        return () => window.clearTimeout(timer);
    }, [location.hash, navigate]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('section') === 'time') {
            setCompactSection('time');
            params.delete('section');
            navigate(
                {
                    pathname: '/dashboard',
                    search: params.toString() ? `?${params.toString()}` : '',
                    hash: location.hash,
                },
                { replace: true },
            );
        }
    }, [location.search, location.hash, navigate]);

    const today = new Date();
    const todayKey = toDateKey(today);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const { timeData: monthTimeData } = useTimeData({
        from: monthStart,
        to: monthEnd,
    });

    const weekStart = useMemo(() => {
        const d = new Date(today);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d;
    }, [todayKey]);

    const weekEnd = useMemo(() => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + 6);
        return d;
    }, [weekStart]);

    const weekStartKey = toDateKey(weekStart);
    const weekEndKey = toDateKey(weekEnd);

    const myProfile = userProfiles.find((p) => p.user_id === currentUser?.id);
    const weeklyTargetHours = myProfile?.weekly_hours || 40;
    const vacationTotal = myProfile?.vacation_days_total || 22;

    const extractHHMM = (value: string | null | undefined): string | null => {
        if (!value) return null;
        if (value.includes('T')) return value.slice(11, 16);
        if (value.length >= 5) return value.slice(0, 5);
        return null;
    };

    const toMinutes = (value: string | null | undefined): number => {
        const hhmm = extractHHMM(value);
        if (!hhmm) return -1;
        const [h, m] = hhmm.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return -1;
        return h * 60 + m;
    };

    const consolidateDailyEntries = (entries: any[]) => {
        if (!entries || entries.length === 0) return null;

        const withEntry = entries.filter((e) => !!extractHHMM(e.entry));
        const withExit = entries.filter((e) => !!extractHHMM(e.exit));

        const entrySource = withEntry.length > 0
            ? withEntry.reduce((min, item) => (toMinutes(item.entry) < toMinutes(min.entry) ? item : min), withEntry[0])
            : entries[0];

        const exitSource = withExit.length > 0
            ? withExit.reduce((max, item) => (toMinutes(item.exit) > toMinutes(max.exit) ? item : max), withExit[0])
            : entries[0];

        return {
            id: entrySource?.id || entries[0].id,
            date_key: entries[0].date_key,
            entry: extractHHMM(entrySource?.entry),
            exit: extractHHMM(exitSource?.exit),
            status: entries[0].status,
            note: entries[0].note,
        };
    };

    const pendingTodos = useMemo(
        () => todos.filter((t) => t.assigned_to.includes(currentUser?.id || '') && !t.completed_by.includes(currentUser?.id || '')),
        [todos, currentUser],
    );

    const dueTodayTodos = pendingTodos.filter((t) => t.due_date_key === todayKey);
    const nowHour = new Date().getHours();
    const greeting = nowHour < 12 ? 'Buenos días' : nowHour < 20 ? 'Buenas tardes' : 'Buenas noches';

    const weeklyMeetings = useMemo(
        () =>
            meetingRequests.filter((m) => {
                const target = m.scheduled_date_key || m.preferred_date_key;
                if (!target || m.status !== 'scheduled') return false;
                const involved = m.created_by === currentUser?.id || (m.participants || []).includes(currentUser?.id || '');
                return involved && target >= weekStartKey && target <= weekEndKey;
            }),
        [meetingRequests, currentUser, weekStartKey, weekEndKey],
    );

    const weeklyTrainings = useMemo(
        () =>
            trainingRequests.filter((t) => {
                const target = t.scheduled_date_key || t.requested_date_key;
                if (!target || t.status === 'rejected') return false;
                const visible = currentUser?.isTrainingManager || t.user_id === currentUser?.id;
                return visible && target >= weekStartKey && target <= weekEndKey;
            }),
        [trainingRequests, currentUser, weekStartKey, weekEndKey],
    );

    const weeklyAbsences = useMemo(
        () =>
            absenceRequests.filter((a) => {
                if (normStatus(a.status) !== 'approved') return false;
                const start = a.date_key;
                const end = a.end_date || a.date_key;
                return end >= weekStartKey && start <= weekEndKey;
            }),
        [absenceRequests, weekStartKey, weekEndKey],
    );
    const isTrainingManagerUser = currentUser?.id === ESTEBAN_ID;
    const isRestrictedUser = ((currentUser?.email || '').toLowerCase() === CARLOS_EMAIL) || !!currentUser?.isRestricted;
    const canSeeTrainingsPanel = !!isTrainingManagerUser;

    const weeklyMeetingsSorted = useMemo(
        () =>
            weeklyMeetings
                .slice()
                .sort((a, b) => `${a.scheduled_date_key || a.preferred_date_key}`.localeCompare(`${b.scheduled_date_key || b.preferred_date_key}`)),
        [weeklyMeetings],
    );

    const weeklyTrainingsSorted = useMemo(
        () =>
            weeklyTrainings
                .slice()
                .sort((a, b) => `${a.scheduled_date_key || a.requested_date_key}`.localeCompare(`${b.scheduled_date_key || b.requested_date_key}`)),
        [weeklyTrainings],
    );

    const weeklyAbsenceDetails = useMemo(
        () =>
            weeklyAbsences
                .slice()
                .sort((a, b) => a.date_key.localeCompare(b.date_key))
                .map((a) => ({
                    ...a,
                    personName: USERS.find((u) => u.id === a.created_by)?.name || 'Compañera/o',
                })),
        [weeklyAbsences],
    );

    const summaryLines = useMemo(() => {
        const lines: Array<{
            id: string;
            text: string;
            onClick?: () => void;
        }> = [];

        if (dueTodayTodos.length > 0) {
            lines.push({ id: 'due-today', text: `Hoy tienes ${dueTodayTodos.length} tarea(s) que vencen.` });
        } else {
            lines.push({ id: 'due-today-none', text: 'Hoy no tienes tareas que venzan.' });
        }
        lines.push({
            id: 'pending-total',
            text: `Tareas pendientes totales: ${pendingTodos.length}.`,
            onClick: pendingTodos.length > 0
                ? () => setSummaryModal({ kind: 'tasks', title: 'Tareas pendientes', items: pendingTodos })
                : undefined,
        });

        const todayMeetings = weeklyMeetings.filter((m) => (m.scheduled_date_key || m.preferred_date_key) === todayKey);
        if (todayMeetings.length > 0) {
            lines.push({
                id: 'meetings-today',
                text: `Hoy tienes ${todayMeetings.length} reunión(es).`,
                onClick: () => setSummaryModal({ kind: 'meetings', title: 'Reuniones de la semana', items: weeklyMeetingsSorted }),
            });
        } else if (weeklyMeetingsSorted.length > 0) {
            const nextMeeting = weeklyMeetingsSorted[0];
            const nextDate = nextMeeting.scheduled_date_key || nextMeeting.preferred_date_key;
            lines.push({
                id: 'meetings-next',
                text: `Recuerda: tienes reunión el ${nextDate}.`,
                onClick: () => setSummaryModal({ kind: 'meetings', title: 'Próxima reunión', items: [nextMeeting] }),
            });
        }

        const todayTrainings = weeklyTrainings.filter((t) => (t.scheduled_date_key || t.requested_date_key) === todayKey);
        if (todayTrainings.length > 0) {
            lines.push({
                id: 'trainings-today',
                text: `Hoy tienes ${todayTrainings.length} formación(es).`,
                onClick: () => setSummaryModal({ kind: 'trainings', title: 'Formaciones de la semana', items: weeklyTrainingsSorted }),
            });
        } else if (weeklyTrainingsSorted.length > 0) {
            const nextTraining = weeklyTrainingsSorted[0];
            const nextDate = nextTraining.scheduled_date_key || nextTraining.requested_date_key;
            lines.push({
                id: 'trainings-next',
                text: `Recuerda: tienes formación el ${nextDate}.`,
                onClick: () => setSummaryModal({ kind: 'trainings', title: 'Próxima formación', items: [nextTraining] }),
            });
        }

        if (weeklyAbsences.length === 0) {
            lines.push({ id: 'absences-none', text: 'Esta semana no hay ausencias.' });
        } else {
            const todayAbsences = weeklyAbsences.filter((a) => {
                const start = a.date_key;
                const end = a.end_date || a.date_key;
                return todayKey >= start && todayKey <= end;
            });
            if (todayAbsences.length > 0) {
                const names = todayAbsences
                    .map((a) => USERS.find((u) => u.id === a.created_by)?.name || 'Compañera/o')
                    .join(', ');
                lines.push({
                    id: 'absences-today',
                    text: `Hoy está(n) ausente(s): ${names}.`,
                    onClick: () => setSummaryModal({ kind: 'absences', title: 'Ausencias de la semana', items: weeklyAbsenceDetails }),
                });
            } else {
                const nextAbsence = weeklyAbsenceDetails[0];
                const name = USERS.find((u) => u.id === nextAbsence.created_by)?.name || 'Compañera/o';
                lines.push({
                    id: 'absences-next',
                    text: `Recuerda: ${name} estará ausente el ${nextAbsence.date_key}.`,
                    onClick: () => setSummaryModal({ kind: 'absences', title: 'Ausencias de la semana', items: weeklyAbsenceDetails }),
                });
            }
        }

        return lines;
    }, [
        dueTodayTodos.length,
        pendingTodos,
        weeklyMeetings,
        weeklyMeetingsSorted,
        weeklyTrainings,
        weeklyTrainingsSorted,
        weeklyAbsences,
        weeklyAbsenceDetails,
        todayKey,
    ]);

    const vacationUsed = useMemo(() => {
        return absenceRequests
            .filter((a) => a.created_by === currentUser?.id && a.type === 'vacation' && a.status !== 'rejected')
            .reduce((total, a) => {
                if (!a.end_date || a.end_date === a.date_key) return total + 1;
                const start = new Date(`${a.date_key}T00:00:00`);
                const end = new Date(`${a.end_date}T00:00:00`);
                const diff = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
                return total + diff + 1;
            }, 0);
    }, [absenceRequests, currentUser]);

    const managedAbsenceRows = useMemo(() => {
        if (!currentUser) return [];
        const visible = isAdmin
            ? absenceRequests
            : absenceRequests.filter((a) => a.created_by === currentUser.id);
        return [...visible].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }, [absenceRequests, currentUser, isAdmin]);
    const managedMeetingRows = useMemo(() => {
        if (!currentUser) return [];
        const visible = isAdmin
            ? meetingRequests
            : meetingRequests.filter((m) => m.created_by === currentUser.id);
        return [...visible].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }, [meetingRequests, currentUser, isAdmin]);
    const managedRequestRows = useMemo<ManagedRequestRow[]>(() => {
        const absRows: ManagedRequestRow[] = managedAbsenceRows.map((a: any) => ({
            source: 'absence',
            id: a.id,
            created_by: a.created_by,
            created_at: a.created_at,
            status: a.status,
            title: a.type === 'vacation' ? 'Vacaciones' : a.type === 'special_permit' ? 'Permiso especial' : 'Ausencia',
            dateText: `${a.date_key}${a.end_date ? ` al ${a.end_date}` : ''}`,
            description: a.reason || '',
            responseMessage: a.response_message || '',
            attachments: (a.attachments || []) as Attachment[],
            absenceType: a.type,
            dateKey: a.date_key,
            endDate: a.end_date || '',
        }));
        const meetingRows: ManagedRequestRow[] = managedMeetingRows.map((m: any) => ({
            source: 'meeting',
            id: m.id,
            created_by: m.created_by,
            created_at: m.created_at,
            status: m.status,
            title: m.title || 'Reunión',
            dateText: m.scheduled_date_key || m.preferred_date_key || '-',
            description: m.description || '',
            responseMessage: m.response_message || '',
            attachments: (m.attachments || []) as Attachment[],
            preferredDateKey: m.preferred_date_key || '',
        }));
        return [...absRows, ...meetingRows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }, [managedAbsenceRows, managedMeetingRows]);

    const myDetailedRequestRows = useMemo<ManagedRequestRow[]>(() => {
        if (!currentUser) return [];
        const abs = managedAbsenceRows
            .filter((a: any) => a.created_by === currentUser.id)
            .map((a: any) => ({
                source: 'absence' as const,
                id: a.id,
                created_by: a.created_by,
                created_at: a.created_at,
                status: a.status,
                title: a.type === 'vacation' ? 'Vacaciones' : a.type === 'special_permit' ? 'Permiso especial' : 'Ausencia',
                dateText: `${a.date_key}${a.end_date ? ` al ${a.end_date}` : ''}`,
                description: a.reason || '',
                responseMessage: a.response_message || '',
                attachments: (a.attachments || []) as Attachment[],
                absenceType: a.type,
                dateKey: a.date_key,
                endDate: a.end_date || '',
            }));
        const meets = managedMeetingRows
            .filter((m: any) => m.created_by === currentUser.id)
            .map((m: any) => ({
                source: 'meeting' as const,
                id: m.id,
                created_by: m.created_by,
                created_at: m.created_at,
                status: m.status,
                title: m.title || 'Reunión',
                dateText: m.scheduled_date_key || m.preferred_date_key || '-',
                description: m.description || '',
                responseMessage: m.response_message || '',
                attachments: (m.attachments || []) as Attachment[],
                preferredDateKey: m.preferred_date_key || '',
            }));
        const trainings = trainingRequests
            .filter((t: any) => t.user_id === currentUser.id)
            .map((t: any) => ({
                source: 'training' as const,
                id: t.id,
                created_by: t.user_id,
                created_at: t.created_at,
                status: t.status,
                title: 'Formación',
                dateText: t.scheduled_date_key || t.requested_date_key || '-',
                description: t.reason || '',
                responseMessage: (Array.isArray(t.comments) ? t.comments.map((c: any) => c?.text).filter(Boolean).join('\n') : '') || '',
                attachments: (t.attachments || []) as Attachment[],
                requestedDateKey: t.requested_date_key || '',
            }));
        return [...abs, ...meets, ...trainings].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }, [currentUser, managedAbsenceRows, managedMeetingRows, trainingRequests]);
    const myRequestRows = useMemo(() => {
        if (!currentUser) return [] as Array<{ id: string; source: ManagedRequestRow['source']; requestId: number; title: string; date: string; status: string }>;
        const absenceRows = absenceRequests
            .filter((a) => a.created_by === currentUser.id)
            .map((a) => ({
                id: `absence-${a.id}`,
                source: 'absence' as const,
                requestId: a.id,
                title: a.type === 'vacation' ? 'Vacaciones' : a.type === 'special_permit' ? 'Permiso especial' : 'Ausencia',
                date: a.date_key || '-',
                status: a.status,
            }));
        const meetingRows = meetingRequests
            .filter((m) => m.created_by === currentUser.id)
            .map((m) => ({
                id: `meeting-${m.id}`,
                source: 'meeting' as const,
                requestId: m.id,
                title: m.title || 'Solicitud de reunión',
                date: m.scheduled_date_key || m.preferred_date_key || '-',
                status: m.status,
            }));
        const trainingRows = trainingRequests
            .filter((t) => t.user_id === currentUser.id)
            .map((t) => ({
                id: `training-${t.id}`,
                source: 'training' as const,
                requestId: t.id,
                title: 'Solicitud de formación',
                date: t.scheduled_date_key || t.requested_date_key || '-',
                status: t.status,
            }));
        return [...absenceRows, ...meetingRows, ...trainingRows].sort((a, b) => (a.date < b.date ? 1 : -1));
    }, [absenceRequests, meetingRequests, trainingRequests, currentUser]);

    const pendingManagedRows = useMemo(
        () => managedRequestRows.filter((r) => normStatus(r.status) === 'pending'),
        [managedRequestRows],
    );
    const resolvedManagedRows = useMemo(() => {
        return managedRequestRows.filter((r) => {
            const approvedStatus =
                (r.source === 'absence' && normStatus(r.status) === 'approved') ||
                (r.source === 'meeting' && normStatus(r.status) === 'scheduled');
            if (!approvedStatus) return false;
            const rawDate = r.source === 'absence' ? (r.endDate || r.dateKey || '') : (r.preferredDateKey || '');
            if (!rawDate) return false;
            return rawDate >= todayKey;
        });
    }, [managedRequestRows, todayKey]);
    const requestPreviewRows = useMemo(
        () => (isAdmin ? managedRequestRows : myDetailedRequestRows).slice(0, 6),
        [isAdmin, managedRequestRows, myDetailedRequestRows],
    );

    const weeklyWorkedHours = useMemo(() => {
        if (!currentUser) return 0;
        let total = 0;
        Object.keys(timeData)
            .filter((dateKey) => dateKey >= weekStartKey && dateKey <= weekEndKey)
            .forEach((dateKey) => {
                const dayEntries = timeData[dateKey]?.[currentUser.id] || [];
                const consolidated = consolidateDailyEntries(dayEntries);
                if (!consolidated?.entry || !consolidated?.exit) return;
                total += calculateHours(consolidated.entry, consolidated.exit);
            });
        return Number(total.toFixed(1));
    }, [timeData, currentUser, weekStartKey, weekEndKey]);

    const remainingWeeklyHours = Math.max(0, Number((weeklyTargetHours - weeklyWorkedHours).toFixed(1)));

    const monthlyRows = useMemo(() => {
        if (!currentUser) return [] as Array<{ dateKey: string; entry: string; exit: string; hours: number; status: string }>;
        const rows: Array<{ dateKey: string; entry: string; exit: string; hours: number; status: string }> = [];
        const cursor = new Date(monthStart);

        while (cursor <= monthEnd) {
            const dateKey = toDateKey(cursor);
            const dayEntries = monthTimeData[dateKey]?.[currentUser.id] || [];
            const consolidated = consolidateDailyEntries(dayEntries);
            const hours = consolidated?.entry && consolidated?.exit ? calculateHours(consolidated.entry, consolidated.exit) : 0;

            rows.push({
                dateKey,
                entry: consolidated?.entry || '-',
                exit: consolidated?.exit || '-',
                hours,
                status: consolidated?.status || '-',
            });
            cursor.setDate(cursor.getDate() + 1);
        }

        return rows;
    }, [currentUser, monthStart, monthEnd, monthTimeData]);

    const monthlyWorkedHours = useMemo(
        () => Number(monthlyRows.reduce((acc, row) => acc + row.hours, 0).toFixed(1)),
        [monthlyRows],
    );

    const monthlyObjectiveHours = useMemo(() => {
        const dailyTarget = weeklyTargetHours / 5;
        let workingDays = 0;
        const cursor = new Date(monthStart);
        while (cursor <= monthEnd) {
            const day = cursor.getDay();
            if (day !== 0 && day !== 6) workingDays += 1;
            cursor.setDate(cursor.getDate() + 1);
        }
        return Number((workingDays * dailyTarget).toFixed(1));
    }, [monthStart, monthEnd, weeklyTargetHours]);

    const monthlyRemainingHours = Math.max(0, Number((monthlyObjectiveHours - monthlyWorkedHours).toFixed(1)));

    const recentTimeRows = useMemo(() => {
        if (!currentUser) return [] as any[];
        return Object.keys(timeData)
            .sort((a, b) => (a < b ? 1 : -1))
            .slice(0, 14)
            .map((dateKey) => {
                const entries = timeData[dateKey]?.[currentUser.id] || [];
                const consolidated = consolidateDailyEntries(entries);
                if (!consolidated) return null;
                const total = consolidated.entry && consolidated.exit
                    ? calculateHours(consolidated.entry, consolidated.exit)
                    : 0;
                return { ...consolidated, total };
            })
            .filter(Boolean) as any[];
    }, [timeData, currentUser]);

    const myStatusToday = dailyStatuses.find((s) => s.user_id === currentUser?.id && s.date_key === todayKey);

    const teamPulse = USERS.map((u) => {
        const mood = dailyStatuses.find((s) => s.user_id === u.id && s.date_key === todayKey);
        const entries = (timeData[todayKey] || {})[u.id] || [];
        const isActive = (entries || []).some((e: any) => e.entry && !e.exit);
        return { user: u, mood, isActive };
    });

    const todayEvents = calendarEvents.filter((e) => e.date_key === todayKey);

    const categorizeNotification = (n: any): NotificationFilter => {
        const text = `${n.message || ''}`.toLowerCase();
        if (text.includes('stock') || text.includes('inventario') || text.includes('caduc')) return 'stock';
        if (n.type === 'action_required' || n.type === 'shock' || text.includes('tarea')) return 'tasks';
        if (text.includes('fich') || text.includes('jornada') || text.includes('pausa') || text.includes('horario')) return 'schedule';
        if (text.includes('reun')) return 'meetings';
        if (text.includes('ausenc') || text.includes('vacaci') || text.includes('permiso')) return 'absences';
        if (text.includes('formaci') || text.includes('training')) return 'trainings';
        return 'schedule';
    };

    const unreadPendingNotifications = useMemo(() => {
        return notifications.filter((n) => !n.read && n.type !== 'recognition');
    }, [notifications]);

    const notificationCounts = useMemo(() => {
        const base: Record<NotificationFilter, number> = {
            all: unreadPendingNotifications.length,
            tasks: 0,
            schedule: 0,
            meetings: 0,
            absences: 0,
            trainings: 0,
            stock: 0,
        };
        unreadPendingNotifications.forEach((n) => {
            base[categorizeNotification(n)] += 1;
        });
        return base;
    }, [unreadPendingNotifications]);

    const filteredNotifications = useMemo(() => {
        return unreadPendingNotifications.filter((n) => {
            if (notificationFilter !== 'all' && categorizeNotification(n) !== notificationFilter) return false;
            if (notificationFilter === 'schedule') {
                const text = `${n.message || ''}`.toLowerCase();
                if (text.includes('has fichado') || text.includes('jornada iniciada') || text.includes('jornada finalizada')) {
                    return false;
                }
            }
            return true;
        });
    }, [unreadPendingNotifications, notificationFilter]);

    const compactNotifications = useMemo(() => filteredNotifications.slice(0, 4), [filteredNotifications]);

    const findTaskFromNotification = (notification: any) => {
        const message = `${notification.message || ''}`;
        const idMatch = message.match(/\[#(\d+)\]/);
        if (idMatch) {
            const id = Number(idMatch[1]);
            const byId = todos.find((t) => t.id === id);
            if (byId) return byId;
        }

        const quoted = message.match(/"([^"]+)"/);
        if (quoted?.[1]) {
            const title = quoted[1].trim().toLowerCase();
            const exact = todos.find((t) => t.title.trim().toLowerCase() === title);
            if (exact) return exact;
            const partial = todos.find((t) => t.title.trim().toLowerCase().includes(title) || title.includes(t.title.trim().toLowerCase()));
            if (partial) return partial;
        }

        return null;
    };

    const handleNotificationClick = (notification: any) => {
        void markAsRead(notification.id);
        const category = categorizeNotification(notification);
        if (category === 'tasks') {
            const task = findTaskFromNotification(notification);
            if (task) {
                setSelectedTask(task);
                return;
            }
            navigate('/tasks');
        }
        if (category === 'meetings') navigate('/meetings');
        if (category === 'absences') navigate('/absences');
        if (category === 'trainings') navigate('/trainings');
        if (category === 'schedule') {
            const block = document.getElementById('dashboard-time-summary');
            if (block) {
                block.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
        if (category === 'stock') {
            setInventoryPanelMode('critical');
            setCompactSection('alerts');
            const block = document.getElementById('dashboard-inventory-panel');
            if (block) {
                block.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    const markFilteredAsRead = async () => {
        if (notificationFilter === 'all') {
            await markAllAsRead();
            return;
        }
        await Promise.all(filteredNotifications.map((n: any) => markAsRead(n.id)));
    };

    const openRequestModal = (type: QuickRequestType, presetDate?: string) => {
        setActiveRequestModal(type);
        setRequestDate(presetDate || todayKey);
        setRequestEndDate('');
        setRequestIsDateRange(false);
        setRequestAbsenceType('absence');
        setRequestMakeUpHours(false);
        setRequestReason('');
        setRequestTitle('');
        setRequestDescription('');
        setRequestSlot('indiferente');
        setRequestParticipants([]);
        setRequestAttachments([]);
        setRequestTargetUserId(currentUser?.id || '');
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const action = params.get('action');
        if (action !== 'request') return;
        const typeParam = params.get('type');
        const dateParam = params.get('date') || todayKey;
        const validTypes: QuickRequestType[] = ['absence', 'vacation', 'meeting', 'training'];
        if (!typeParam || !validTypes.includes(typeParam as QuickRequestType)) return;
        openRequestModal(typeParam as QuickRequestType, dateParam);

        params.delete('action');
        params.delete('type');
        params.delete('date');
        navigate(
            {
                pathname: '/dashboard',
                search: params.toString() ? `?${params.toString()}` : '',
                hash: location.hash,
            },
            { replace: true },
        );
    }, [location.search, location.hash, navigate, todayKey]);

    const closeRequestModal = () => {
        setActiveRequestModal(null);
    };

    const submitQuickRequest = async () => {
        if (!currentUser || !activeRequestModal) return;
        setRequestSubmitting(true);
        try {
            if (activeRequestModal === 'absence' || activeRequestModal === 'vacation') {
                if (!requestReason.trim()) {
                    alert('Escribe un motivo.');
                    return;
                }

                const absenceType = activeRequestModal === 'vacation' ? 'vacation' : requestAbsenceType;
                await createAbsence({
                    reason: requestReason.trim(),
                    date_key: requestDate,
                    end_date: requestIsDateRange && requestEndDate ? requestEndDate : undefined,
                    type: absenceType,
                    makeUpHours: absenceType === 'special_permit' ? requestMakeUpHours : false,
                    attachments: requestAttachments,
                    userId: currentUser.isAdmin ? requestTargetUserId : undefined,
                });
                emitSuccessFeedback(activeRequestModal === 'vacation' ? 'Vacaciones solicitadas con éxito.' : 'Ausencia solicitada con éxito.');
            }

            if (activeRequestModal === 'training') {
                if (!requestReason.trim()) {
                    alert('Escribe el motivo de la formación.');
                    return;
                }
                await createTrainingRequest({
                    requested_date_key: requestDate,
                    reason: requestReason.trim(),
                    comments: '',
                    attachments: requestAttachments,
                    userId: currentUser.isAdmin ? requestTargetUserId : undefined,
                });
                emitSuccessFeedback('Formación solicitada con éxito.');
            }

            if (activeRequestModal === 'meeting') {
                if (!requestTitle.trim() || !requestDescription.trim()) {
                    alert('Completa título y descripción.');
                    return;
                }
                await createMeeting({
                    title: requestTitle.trim(),
                    description: requestDescription.trim(),
                    preferred_date_key: requestDate,
                    preferred_slot: requestSlot,
                    participants: requestParticipants,
                    attachments: requestAttachments,
                });
                emitSuccessFeedback('Reunión solicitada con éxito.');
            }
            closeRequestModal();
        } catch (error: any) {
            const message = error?.message || 'No se pudo enviar la solicitud. Revisa permisos de base de datos.';
            alert(message);
            console.error('submitQuickRequest error', error);
        } finally {
            setRequestSubmitting(false);
        }
    };

    const handleMoodSelect = async (emoji: string, customStatus: string) => {
        if (!currentUser) return;
        setSavingMood(emoji);
        try {
            await setDailyStatus({
                dateKey: todayKey,
                status: myStatusToday?.status || 'in_person',
                customEmoji: emoji,
                customStatus,
            });
        } finally {
            setTimeout(() => setSavingMood(null), 500);
        }
    };

    const handleSendCaffeineBoost = async (targetUserId: string, targetName: string) => {
        if (!currentUser) return;
        setSendingBoostTo(targetUserId);
        try {
            await sendCaffeineBoost(currentUser.name || 'Equipo', [targetUserId]);
            setBoostToastName(targetName);
            window.setTimeout(() => setBoostToastName(null), 2200);
        } finally {
            setSendingBoostTo(null);
        }
    };

    const openDirectChat = (targetUserId: string) => {
        navigate(`/chat?user=${targetUserId}`);
    };

    const saveTimeRow = async (row: any) => {
        if (!row?.id) return;
        setSavingRow(true);
        try {
            await updateTimeEntry({
                id: row.id,
                updates: {
                    entry: timeEdit.entry || null,
                    exit: timeEdit.exit || null,
                },
            });
            setEditingDateKey(null);
            emitSuccessFeedback('Registro horario guardado con éxito.');
        } finally {
            setSavingRow(false);
        }
    };

    const downloadMonthlyPdf = () => {
        if (!currentUser) return;

        const monthLabel = monthStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const vacationsLeft = Math.max(0, vacationTotal - vacationUsed);
        openPrintablePdfReport({
            title: 'Registro horario mensual',
            fileName: `registro-${currentUser.name.toLowerCase().replace(/\s+/g, '-')}-${toDateKey(monthStart)}.pdf`,
            subtitle: `Trabajador: ${currentUser.name} · Mes: ${monthLabel} · Horas mes: ${monthlyWorkedHours.toFixed(1)} · Objetivo: ${monthlyObjectiveHours.toFixed(1)} · Restantes: ${monthlyRemainingHours.toFixed(1)} · Vacaciones restantes: ${vacationsLeft}`,
            headers: ['Fecha', 'Entrada', 'Salida', 'Horas', 'Estado'],
            rows: monthlyRows.map((row) => [row.dateKey, row.entry, row.exit, row.hours > 0 ? row.hours.toFixed(2) : '-', row.status]),
            signatures: ['Firma trabajador', 'Firma responsable'],
        });
        emitSuccessFeedback('PDF mensual generado con éxito.');
    };

    const downloadAbsencesPdf = () => {
        if (!currentUser) return;
        const rows = managedAbsenceRows.map((r) => {
            const owner = USERS.find((u) => u.id === r.created_by)?.name || r.created_by;
            return [
                owner,
                r.type === 'vacation' ? 'Vacaciones' : r.type === 'special_permit' ? 'Permiso especial' : 'Ausencia',
                r.date_key,
                r.end_date || '-',
                r.status,
                r.resolution_type || '-',
                r.reason || '-',
            ];
        });
        openPrintablePdfReport({
            title: isAdmin ? 'Gestión de ausencias del equipo' : 'Mis ausencias y vacaciones',
            subtitle: `Usuario: ${currentUser.name} · Registros: ${rows.length}`,
            fileName: `ausencias-${currentUser.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
            headers: ['Persona', 'Tipo', 'Inicio', 'Fin', 'Estado', 'Resolución', 'Motivo'],
            rows,
        });
        emitSuccessFeedback('PDF de ausencias generado con éxito.');
    };

    const openManagedRequest = (request: ManagedRequestRow) => {
        setSelectedManagedRequest(request);
        setManageRequestDate(request.source === 'absence' ? (request.dateKey || '') : (request.preferredDateKey || ''));
        setManageRequestTitle(request.title || '');
        setManageRequestDescription(request.description || '');
        setManageRequestComment(request.responseMessage || '');
        setManageRequestAttachments(request.attachments || []);
    };

    const openMyRequest = (request: ManagedRequestRow) => {
        setSelectedMyRequest(request);
        setManageRequestDate(
            request.source === 'absence'
                ? (request.dateKey || '')
                : request.source === 'meeting'
                    ? (request.preferredDateKey || '')
                    : (request.requestedDateKey || ''),
        );
        setManageRequestTitle(request.title || '');
        setManageRequestDescription(request.description || '');
        setManageRequestComment(request.responseMessage || '');
        setManageRequestAttachments(request.attachments || []);
        setShowMyRequestModal(true);
    };

    const canEditOwnRequest = useMemo(() => {
        if (!selectedManagedRequest || !currentUser) return false;
        return selectedManagedRequest.created_by === currentUser.id && normStatus(selectedManagedRequest.status) === 'pending';
    }, [selectedManagedRequest, currentUser]);
    const canEditMyRequest = useMemo(() => {
        if (!selectedMyRequest || !currentUser) return false;
        return selectedMyRequest.created_by === currentUser.id && normStatus(selectedMyRequest.status) === 'pending';
    }, [selectedMyRequest, currentUser]);
    const canDeleteMyRequest = useMemo(() => {
        if (!selectedMyRequest || !currentUser) return false;
        return selectedMyRequest.created_by === currentUser.id || currentUser.isAdmin;
    }, [selectedMyRequest, currentUser]);

    const refreshRequestQueries = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['absences'] }),
            queryClient.invalidateQueries({ queryKey: ['absences', currentUser?.id] }),
            queryClient.invalidateQueries({ queryKey: ['meetings'] }),
            queryClient.invalidateQueries({ queryKey: ['meetings', currentUser?.id] }),
            queryClient.invalidateQueries({ queryKey: ['training'] }),
            queryClient.invalidateQueries({ queryKey: ['training', currentUser?.id] }),
            queryClient.refetchQueries({ queryKey: ['absences', currentUser?.id] }),
            queryClient.refetchQueries({ queryKey: ['meetings', currentUser?.id] }),
            queryClient.refetchQueries({ queryKey: ['training', currentUser?.id] }),
        ]);
    };

    const saveManagedRequestChanges = async () => {
        if (!selectedManagedRequest || !canEditOwnRequest) return;
        setManageSaving(true);
        try {
            if (selectedManagedRequest.source === 'absence') {
                await updateAbsence({
                    id: selectedManagedRequest.id,
                    date_key: manageRequestDate || selectedManagedRequest.dateKey,
                    reason: manageRequestDescription,
                    response_message: manageRequestComment || null,
                    attachments: manageRequestAttachments,
                });
            } else {
                const { error } = await supabase
                    .from('meeting_requests')
                    .update({
                        title: manageRequestTitle,
                        description: manageRequestDescription,
                        preferred_date_key: manageRequestDate || null,
                        response_message: manageRequestComment || null,
                        attachments: manageRequestAttachments,
                    })
                    .eq('id', selectedManagedRequest.id)
                    .eq('created_by', currentUser?.id);
                if (error) throw error;
                emitSuccessFeedback('Solicitud actualizada con éxito.');
            }
            await refreshRequestQueries();
            setShowAbsencesManageModal(false);
            setSelectedManagedRequest(null);
        } catch (error: any) {
            window.alert(error?.message || 'No se pudo guardar la solicitud.');
        } finally {
            setManageSaving(false);
        }
    };

    const deleteManagedRequest = async () => {
        if (!selectedManagedRequest || !currentUser) return;
        const canDelete = isAdmin || (selectedManagedRequest.created_by === currentUser.id && selectedManagedRequest.status === 'pending');
        if (!canDelete) return;
        const ok = window.confirm('¿Eliminar esta solicitud?');
        if (!ok) return;
        setManageSaving(true);
        try {
            if (selectedManagedRequest.source === 'absence') {
                await deleteAbsence(selectedManagedRequest.id);
            } else {
                await deleteMeeting(selectedManagedRequest.id);
            }
            await refreshRequestQueries();
            setSelectedManagedRequest(null);
            setShowAbsencesManageModal(false);
        } finally {
            setManageSaving(false);
        }
    };

    const saveMyRequestChanges = async () => {
        if (!selectedMyRequest || !canEditMyRequest) return;
        setManageSaving(true);
        try {
            if (selectedMyRequest.source === 'absence') {
                await updateAbsence({
                    id: selectedMyRequest.id,
                    date_key: manageRequestDate || selectedMyRequest.dateKey,
                    reason: manageRequestDescription,
                    response_message: manageRequestComment || null,
                    attachments: manageRequestAttachments,
                });
            } else if (selectedMyRequest.source === 'meeting') {
                const { error } = await supabase
                    .from('meeting_requests')
                    .update({
                        title: manageRequestTitle,
                        description: manageRequestDescription,
                        preferred_date_key: manageRequestDate || null,
                        response_message: manageRequestComment || null,
                        attachments: manageRequestAttachments,
                    })
                    .eq('id', selectedMyRequest.id)
                    .eq('created_by', currentUser?.id);
                if (error) throw error;
                emitSuccessFeedback('Solicitud actualizada con éxito.');
            } else {
                await updateTrainingRequest({
                    id: selectedMyRequest.id,
                    requested_date_key: manageRequestDate || selectedMyRequest.requestedDateKey || undefined,
                    reason: manageRequestDescription,
                    attachments: manageRequestAttachments,
                });
            }
            await refreshRequestQueries();
            setShowMyRequestModal(false);
            setSelectedMyRequest(null);
        } catch (error: any) {
            window.alert(error?.message || 'No se pudo guardar la solicitud.');
        } finally {
            setManageSaving(false);
        }
    };

    const deleteMyRequest = async () => {
        if (!selectedMyRequest || !currentUser || !canDeleteMyRequest) return;
        const ok = window.confirm('¿Eliminar esta solicitud?');
        if (!ok) return;
        setManageSaving(true);
        try {
            if (selectedMyRequest.source === 'absence') {
                await deleteAbsence(selectedMyRequest.id);
            } else if (selectedMyRequest.source === 'meeting') {
                await deleteMeeting(selectedMyRequest.id);
            } else {
                await deleteTrainingRequest(selectedMyRequest.id);
            }
            await refreshRequestQueries();
            setShowMyRequestModal(false);
            setSelectedMyRequest(null);
        } finally {
            setManageSaving(false);
        }
    };

    const resolveManagedRequest = async (action: 'approve' | 'reprogram' | 'reject') => {
        if (!selectedManagedRequest || !isAdmin) return;
        setManageSaving(true);
        try {
            if (selectedManagedRequest.source === 'absence') {
                if (action === 'reprogram') {
                    await updateAbsence({
                        id: selectedManagedRequest.id,
                        date_key: manageRequestDate || selectedManagedRequest.dateKey,
                        reason: manageRequestDescription || selectedManagedRequest.description,
                        response_message: manageRequestComment || null,
                        attachments: manageRequestAttachments,
                    });
                } else {
                    await updateAbsenceStatus({
                        id: selectedManagedRequest.id,
                        status: action === 'approve' ? 'approved' : 'rejected',
                        response_message: manageRequestComment || '',
                    });
                }
            } else {
                if (action === 'approve') {
                    await updateMeetingStatus({
                        id: selectedManagedRequest.id,
                        status: 'scheduled',
                        scheduled_date_key: manageRequestDate || selectedManagedRequest.preferredDateKey || undefined,
                        response_message: manageRequestComment || undefined,
                    });
                } else if (action === 'reprogram') {
                    const { error } = await supabase
                        .from('meeting_requests')
                        .update({
                            preferred_date_key: manageRequestDate || selectedManagedRequest.preferredDateKey || null,
                            response_message: manageRequestComment || null,
                        })
                        .eq('id', selectedManagedRequest.id);
                    if (error) throw error;
                } else {
                    await updateMeetingStatus({
                        id: selectedManagedRequest.id,
                        status: 'rejected',
                        response_message: manageRequestComment || undefined,
                    });
                }
            }
            await refreshRequestQueries();
            setShowAbsencesManageModal(false);
            setSelectedManagedRequest(null);
            emitSuccessFeedback('Solicitud actualizada con éxito.');
        } catch (error: any) {
            window.alert(error?.message || 'No se pudo actualizar la solicitud.');
        } finally {
            setManageSaving(false);
        }
    };

    useEffect(() => {
        const loadChecklist = async () => {
            if (!currentUser) return;
            setChecklistLoading(true);
            try {
                const [{ data: dailyData }, { data: templateData }] = await Promise.all([
                    supabase
                        .from('daily_checklists')
                        .select('history')
                        .eq('user_id', currentUser.id)
                        .eq('date_key', todayKey)
                        .single(),
                    supabase
                        .from('checklist_templates')
                        .select('tasks')
                        .eq('user_id', currentUser.id)
                        .single(),
                ]);

                const completionMap = new Map<string, boolean>();
                if (dailyData?.history) {
                    (dailyData.history as any[]).forEach((task) => {
                        completionMap.set(task.id, !!task.completed);
                    });
                }

                const merged = ((templateData?.tasks || []) as any[]).map((task) => ({
                    id: task.id,
                    text: task.text,
                    completed: completionMap.get(task.id) || false,
                }));

                setChecklistTasks(merged);
            } finally {
                setChecklistLoading(false);
            }
        };

        loadChecklist();
    }, [currentUser, todayKey]);

    const saveChecklist = async (nextTasks: Array<{ id: string; text: string; completed: boolean }>) => {
        if (!currentUser) return;
        setChecklistSaving(true);
        try {
            await supabase
                .from('daily_checklists')
                .upsert({
                    user_id: currentUser.id,
                    date_key: todayKey,
                    history: nextTasks,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,date_key' });
            emitSuccessFeedback('Checklist guardado con éxito.');
        } finally {
            setChecklistSaving(false);
        }
    };

    const toggleChecklistTask = async (taskId: string) => {
        const next = checklistTasks.map((task) =>
            task.id === taskId ? { ...task, completed: !task.completed } : task,
        );
        setChecklistTasks(next);
        await saveChecklist(next);
    };

    const checklistDone = checklistTasks.filter((task) => task.completed).length;
    const criticalProductsFromInventory = inventoryAlerts?.criticalProducts || [];
    const potentialCriticalFromInventoryRaw = inventoryAlerts?.potentialCritical || [];
    const mountedVisualFromInventory = inventoryAlerts?.mountedVisual || [];
    const potentialVisualFromInventory = inventoryAlerts?.potentialVisual || [];
    const globalStockByProductLotFromInventory = inventoryAlerts?.globalStockByProductLot || [];
    const globalStockByProductLotBodegaFromInventory = inventoryAlerts?.globalStockByProductLotBodega || [];
    const mountedCriticalDetailsFromInventory = inventoryAlerts?.mountedCriticalDetails || [];
    const potentialCriticalDetailsFromInventory = inventoryAlerts?.potentialCriticalDetails || [];
    const caducityAlertsFromInventory = inventoryAlerts?.caducity || [];
    const huarteMovementsSource = useMemo(
        () =>
            Array.isArray(huarteMovementsShared) && huarteMovementsShared.length > 0
                ? huarteMovementsShared
                : ((huarteSeed.movimientos as any[]) || []),
        [huarteMovementsShared],
    );
    const canetMovementsSource = useMemo(
        () =>
            Array.isArray(canetMovementsShared) && canetMovementsShared.length > 0
                ? canetMovementsShared
                : ((canetSeed.movimientos as any[]) || []),
        [canetMovementsShared],
    );
    const fallbackCriticalFromHuarte = useMemo(() => {
        try {
            // Montadas: fuente principal Huarte (incluye todas las bodegas).
            const source = huarteMovementsSource;
            // Potenciales: fuente Canet (control de stock / viales).
            const productRows = (canetSeed.productos as any[]) || [];
            const lotRows = (canetSeed.lotes as any[]) || [];

            const productMeta = new Map<string, { consumo: number; modo: string; vialesPorCaja: number }>();
            productRows.forEach((p: any) => {
                const code = clean(p.producto);
                if (!code || code.toUpperCase() === 'PRODUCTO') return;
                productMeta.set(code, {
                    consumo: toNum(p.consumo_mensual_cajas),
                    modo: clean(p.modo_stock).toUpperCase(),
                    vialesPorCaja: toNum(p.viales_por_caja),
                });
            });

            const mountedByProduct = new Map<string, number>();
            source.forEach((m: any) => {
                const producto = clean(m?.producto);
                const lote = clean(m?.lote);
                const bodega = clean(m?.bodega);
                if (producto.toUpperCase() === 'PRODUCTO') return;
                if (!producto || !lote || !bodega) return;
                const signed = Number(m?.cantidad_signed);
                const qty = Number.isFinite(signed) ? signed : toNum(m?.cantidad) * (toNum(m?.signo) || 1);
                mountedByProduct.set(producto, (mountedByProduct.get(producto) || 0) + qty);
            });

            const potentialByProduct = new Map<string, number>();
            lotRows.forEach((l: any) => {
                const producto = clean(l.producto);
                if (producto.toUpperCase() === 'PRODUCTO') return;
                if (!producto) return;
                const meta = productMeta.get(producto);
                if (!meta || meta.modo !== 'ENSAMBLAJE' || meta.vialesPorCaja <= 0) return;
                const potential = toNum(l.viales_recibidos) / meta.vialesPorCaja;
                potentialByProduct.set(producto, (potentialByProduct.get(producto) || 0) + Math.max(0, potential));
            });

            const allProducts = new Set<string>([
                ...Array.from(mountedByProduct.keys()),
                ...Array.from(potentialByProduct.keys()),
                ...Array.from(productMeta.keys()),
            ]);

            const mounted = Array.from(allProducts)
                .map((producto) => {
                    const consumo = productMeta.get(producto)?.consumo || 0;
                    const stockTotal = Math.max(0, toNum(mountedByProduct.get(producto) || 0));
                    const coberturaMeses = consumo > 0 ? stockTotal / consumo : 0;
                    return { producto, stockTotal, coberturaMeses };
                })
                .filter((r) => r.producto.toUpperCase() !== 'PRODUCTO')
                .filter((r) => r.stockTotal > 0 && r.coberturaMeses > 0 && r.coberturaMeses < 3)
                .sort((a, b) => a.coberturaMeses - b.coberturaMeses)
                .slice(0, 12);

            const potential = Array.from(allProducts)
                .map((producto) => {
                    const consumo = productMeta.get(producto)?.consumo || 0;
                    const cajasPotenciales = Math.max(0, toNum(potentialByProduct.get(producto) || 0));
                    const coberturaMeses = consumo > 0 ? cajasPotenciales / consumo : 0;
                    return { producto, cajasPotenciales, coberturaMeses };
                })
                .filter((r) => r.producto.toUpperCase() !== 'PRODUCTO')
                .filter((r) => r.cajasPotenciales >= 0 && r.coberturaMeses >= 0 && r.coberturaMeses < 2)
                .sort((a, b) => a.coberturaMeses - b.coberturaMeses)
                .slice(0, 12);

            return { mounted, potential };
        } catch {
            return { mounted: [], potential: [] };
        }
    }, [huarteMovementsSource]);
    const mountedCriticalFromInventory = fallbackCriticalFromHuarte.mounted;
    const potentialCriticalFromInventory =
        potentialCriticalFromInventoryRaw.length > 0 ? potentialCriticalFromInventoryRaw : fallbackCriticalFromHuarte.potential;
    const maxPotentialVisual = Math.max(1, ...potentialVisualFromInventory.map((row) => row.cajasPotenciales || 0));
    const generalStockRowsWithBodega = useMemo(() => {
        const map = new Map<string, number>();
        huarteMovementsSource.forEach((m: any) => {
            const producto = clean(m?.producto);
            const lote = clean(m?.lote);
            const bodega = clean(m?.bodega);
            if (!producto || !lote || !bodega || producto.toUpperCase() === 'PRODUCTO') return;
            const signed = Number(m?.cantidad_signed);
            const qty = Number.isFinite(signed) ? signed : toNum(m?.cantidad) * (toNum(m?.signo) || 1);
            const key = `${producto}|${lote}|${bodega}`;
            map.set(key, (map.get(key) || 0) + qty);
        });
        return Array.from(map.entries())
            .map(([key, stockTotal]) => {
                const [producto, lote, bodega] = key.split('|');
                return { producto, lote, bodega, stockTotal: Math.max(0, toNum(stockTotal)) };
            })
            .filter((r) => r.stockTotal > 0);
    }, [huarteMovementsSource]);

    const generalStockByProduct = useMemo(() => {
        const sourceRows = generalStockRowsWithBodega;
        const byProduct = new Map<
            string,
            {
                total: number;
                byLote: Map<string, { total: number; byBodega: Map<string, number> }>;
                byBodega: Map<string, number>;
            }
        >();
        sourceRows.forEach((r) => {
            const producto = (r.producto || '').trim();
            const lote = (r.lote || '').trim();
            const bodega = (r.bodega || '').trim() || 'Sin bodega';
            const qty = Number(r.stockTotal || 0);
            if (!producto || !lote || qty <= 0) return;
            if (!byProduct.has(producto)) {
                byProduct.set(producto, {
                    total: 0,
                    byLote: new Map(),
                    byBodega: new Map(),
                });
            }
            const p = byProduct.get(producto)!;
            p.total += qty;
            p.byBodega.set(bodega, (p.byBodega.get(bodega) || 0) + qty);
            if (!p.byLote.has(lote)) {
                p.byLote.set(lote, { total: 0, byBodega: new Map() });
            }
            const l = p.byLote.get(lote)!;
            l.total += qty;
            l.byBodega.set(bodega, (l.byBodega.get(bodega) || 0) + qty);
        });
        return Array.from(byProduct.entries())
            .map(([producto, payload]) => ({
                producto,
                total: payload.total,
                byBodega: Array.from(payload.byBodega.entries())
                    .map(([bodega, cantidad]) => ({ bodega, cantidad }))
                    .sort((a, b) => b.cantidad - a.cantidad),
                byLote: Array.from(payload.byLote.entries())
                    .map(([lote, info]) => ({
                        lote,
                        total: info.total,
                        byBodega: Array.from(info.byBodega.entries()).map(([bodega, cantidad]) => ({ bodega, cantidad })),
                    }))
                    .sort((a, b) => b.total - a.total),
            }))
            .sort((a, b) => b.total - a.total);
    }, [generalStockRowsWithBodega]);
    const monthlyConsumptionByProduct = useMemo(() => {
        const map = new Map<string, number>();
        ((canetSeed.productos as any[]) || []).forEach((p: any) => {
            const code = productKey(p?.producto);
            if (!code || code === 'PRODUCTO') return;
            map.set(code, toNum(p?.consumo_mensual_cajas));
        });
        return map;
    }, []);
    const restrictedGeneralRows = useMemo(() => {
        return generalStockByProduct.slice(0, 12).map((row) => {
            const producto = productKey(row.producto);
            const consumoMensual = monthlyConsumptionByProduct.get(producto) || 0;
            const coberturaMeses = consumoMensual > 0 ? row.total / consumoMensual : 0;
            return {
                producto,
                stockTotal: row.total,
                coberturaMeses,
            };
        });
    }, [generalStockByProduct, monthlyConsumptionByProduct]);
    const canetStockRowsWithBodega = useMemo(() => {
        if (globalStockByProductLotBodegaFromInventory.length > 0) {
            return globalStockByProductLotBodegaFromInventory
                .map((row: { producto: string; lote: string; bodega: string; stockTotal: number }) => ({
                    producto: productKey(row.producto),
                    lote: clean(row.lote),
                    bodega: clean(row.bodega) || 'Canet',
                    stockTotal: toNum(row.stockTotal),
                }))
                .filter((row: { producto: string; lote: string; bodega: string; stockTotal: number }) => !!row.producto && !!row.lote && row.stockTotal > 0);
        }
        const map = new Map<string, number>();
        canetMovementsSource.forEach((m: any) => {
            const producto = productKey(m?.producto);
            const lote = clean(m?.lote);
            const bodega = clean(m?.bodega) || 'Canet';
            if (!producto || producto === 'PRODUCTO' || !lote) return;
            const signed = Number(m?.cantidad_signed);
            const qty = Number.isFinite(signed) ? signed : toNum(m?.cantidad) * (toNum(m?.signo) || 1);
            const key = `${producto}|${lote}|${bodega}`;
            map.set(key, (map.get(key) || 0) + qty);
        });
        return Array.from(map.entries())
            .map(([key, stockTotal]) => {
                const [producto, lote, bodega] = key.split('|');
                return { producto, lote, bodega, stockTotal: Math.max(0, toNum(stockTotal)) };
            })
            .filter((row) => row.stockTotal > 0);
    }, [globalStockByProductLotBodegaFromInventory, canetMovementsSource]);
    const canetTopLots = useMemo(() => {
        const byProductLot = new Map<string, number>();
        canetStockRowsWithBodega.forEach((row) => {
            const key = `${row.producto}|${row.lote}`;
            byProductLot.set(key, (byProductLot.get(key) || 0) + row.stockTotal);
        });
        return Array.from(byProductLot.entries())
            .map(([key, cantidad]) => {
                const [producto, lote] = key.split('|');
                return { producto, lote, cantidad };
            })
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, 8);
    }, [canetStockRowsWithBodega]);
    const fallbackCanetCritical = useMemo(() => {
        const consumoByProduct = new Map<string, number>();
        ((canetSeed.productos as any[]) || []).forEach((p: any) => {
            const code = clean(p.producto);
            if (!code || code.toUpperCase() === 'PRODUCTO') return;
            consumoByProduct.set(productKey(code), toNum(p.consumo_mensual_cajas));
        });

        const byProduct = new Map<string, number>();
        const byProductLote = new Map<string, Map<string, number>>();
        canetMovementsSource.forEach((m: any) => {
            const producto = clean(m?.producto);
            const lote = clean(m?.lote);
            const bodega = clean(m?.bodega);
            if (!producto || !lote || !bodega || productKey(producto) === 'PRODUCTO') return;
            const qtyRaw = Number(m?.cantidad_signed);
            const qty = Number.isFinite(qtyRaw) ? qtyRaw : toNum(m?.cantidad) * (toNum(m?.signo) || 1);
            const key = productKey(producto);
            byProduct.set(key, (byProduct.get(key) || 0) + qty);
            if (!byProductLote.has(key)) byProductLote.set(key, new Map());
            const lotes = byProductLote.get(key)!;
            lotes.set(lote, (lotes.get(lote) || 0) + qty);
        });

        const items = Array.from(byProduct.entries())
            .map(([producto, stockTotal]) => {
                const consumo = consumoByProduct.get(producto) || 0;
                const total = Math.max(0, toNum(stockTotal));
                const coberturaMeses = consumo > 0 ? total / consumo : 0;
                return { producto, stockTotal: total, coberturaMeses };
            })
            .filter((r) => r.stockTotal > 0 && r.coberturaMeses > 0 && r.coberturaMeses < 3)
            .sort((a, b) => a.coberturaMeses - b.coberturaMeses)
            .slice(0, 12);

        const details = Array.from(byProductLote.entries()).map(([producto, lotes]) => ({
            producto,
            byLote: Array.from(lotes.entries())
                .map(([lote, cantidad]) => ({ lote, cantidad }))
                .filter((r) => r.cantidad > 0)
                .sort((a, b) => b.cantidad - a.cantidad),
        }));

        return { items, details };
    }, [canetMovementsSource]);
    const canetCriticalFromInventory =
        criticalProductsFromInventory.length > 0 ? criticalProductsFromInventory : fallbackCanetCritical.items;
    const canetCriticalDetailsFromInventory = useMemo(() => {
        const summaryDetails = canetCriticalFromInventory.map((item) => {
            const rows = globalStockByProductLotFromInventory
                .filter((r) => productKey(r.producto) === productKey(item.producto))
                .sort((a, b) => b.stockTotal - a.stockTotal);
            return {
                producto: productKey(item.producto),
                byLote: rows.map((r) => ({ lote: r.lote, cantidad: r.stockTotal })),
            };
        });
        const hasSummaryRows = summaryDetails.some((r) => r.byLote.length > 0);
        return hasSummaryRows ? summaryDetails : fallbackCanetCritical.details;
    }, [canetCriticalFromInventory, globalStockByProductLotFromInventory, fallbackCanetCritical.details]);
    const mountedCriticalDetailsFallback = useMemo(() => {
        try {
            const source = huarteMovementsSource;

            const acc = new Map<string, { byBodega: Map<string, number>; byLote: Map<string, number> }>();
            source.forEach((m: any) => {
                const producto = clean(m?.producto);
                const lote = clean(m?.lote);
                const bodega = clean(m?.bodega) || 'Sin bodega';
                const qtyRaw = Number(m?.cantidad_signed);
                const qty = Number.isFinite(qtyRaw) ? qtyRaw : toNum(m?.cantidad) * (toNum(m?.signo) || 1);
                if (!producto || !lote || productKey(producto) === 'PRODUCTO') return;
                const key = productKey(producto);
                if (!acc.has(key)) {
                    acc.set(key, { byBodega: new Map(), byLote: new Map() });
                }
                const row = acc.get(key)!;
                row.byBodega.set(bodega, (row.byBodega.get(bodega) || 0) + qty);
                row.byLote.set(lote, (row.byLote.get(lote) || 0) + qty);
            });

            return Array.from(acc.entries()).map(([key, row]) => ({
                producto: key,
                byBodega: Array.from(row.byBodega.entries())
                    .map(([bodega, cantidad]) => ({ bodega, cantidad }))
                    .filter((r) => r.cantidad > 0)
                    .sort((a, b) => b.cantidad - a.cantidad),
                byLote: Array.from(row.byLote.entries())
                    .map(([lote, cantidad]) => ({ lote, cantidad }))
                    .filter((r) => r.cantidad > 0)
                    .sort((a, b) => b.cantidad - a.cantidad),
            }));
        } catch {
            return [] as Array<{ producto: string; byBodega: Array<{ bodega: string; cantidad: number }>; byLote: Array<{ lote: string; cantidad: number }> }>;
        }
    }, [huarteMovementsSource]);
    const weeklyTeamAbsences = useMemo(
        () => weeklyAbsences.filter((a) => a.created_by !== currentUser?.id),
        [weeklyAbsences, currentUser?.id],
    );
    const pauseScheduleBadge = useMemo(
        () =>
            unreadPendingNotifications.filter((n) => {
                const text = `${n.message || ''}`.toLowerCase();
                return text.includes('pausa') || text.includes('retomar');
            }).length,
        [unreadPendingNotifications],
    );
    const inventoryBadgeCount = useMemo(() => {
        const set = new Set<string>();
        mountedCriticalFromInventory.forEach((r) => set.add(r.producto));
        potentialCriticalFromInventory.forEach((r) => set.add(r.producto));
        canetCriticalFromInventory.forEach((r) => set.add(r.producto));
        return set.size;
    }, [mountedCriticalFromInventory, potentialCriticalFromInventory, canetCriticalFromInventory]);
    const chatBadgeCount = useMemo(
        () =>
            unreadPendingNotifications.filter((n) => {
                const text = `${n.message || ''}`.toLowerCase();
                return text.includes('chat') || text.includes('mensaje');
            }).length,
        [unreadPendingNotifications],
    );
    const absencesBadgeCount = isAdmin ? pendingManagedRows.length : weeklyTeamAbsences.length;
    const trainingsBadgeCount = canSeeTrainingsPanel ? weeklyTrainings.length : 0;
    const absencesTileLabel = isAdmin ? 'Gestionar solicitudes' : 'Ausencias';
    const trainingsTileLabel = canSeeTrainingsPanel ? 'Gestionar formaciones' : 'Formaciones';

    const compactTiles: Array<{
        key: 'events' | 'quick' | 'checklist' | 'time' | 'absences' | 'trainings' | 'alerts' | 'notifications' | 'pulse' | 'chat';
        label: string;
        Icon: any;
    }> = [
        { key: 'events', label: 'Eventos', Icon: CalendarClock },
        { key: 'quick', label: 'Solicitudes', Icon: Users },
        { key: 'checklist', label: 'Checklist', Icon: Sparkles },
        { key: 'time', label: 'Jornada', Icon: Clock3 },
        { key: 'absences', label: absencesTileLabel, Icon: UserX },
        { key: 'trainings', label: trainingsTileLabel, Icon: GraduationCap },
        { key: 'alerts', label: 'Inventario', Icon: Info },
        { key: 'notifications', label: 'Notifs', Icon: MessageCircle },
        { key: 'pulse', label: 'Pulso', Icon: Coffee },
        { key: 'chat', label: 'Chat', Icon: MessageCircle },
    ];
    const compactTilesVisible = compactTiles.filter((tile) => tile.key !== 'trainings' || canSeeTrainingsPanel);
    const compactTileBadges: Partial<Record<typeof compactTiles[number]['key'], number>> = {
        events: todayEvents.length,
        time: pauseScheduleBadge,
        absences: absencesBadgeCount,
        trainings: trainingsBadgeCount,
        alerts: inventoryBadgeCount,
        chat: chatBadgeCount,
    };

    if (isRestrictedUser) {
        return (
            <div className="max-w-7xl mx-auto pb-16 space-y-6 app-page-shell">
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                    <h1 className="text-2xl font-black text-violet-950">{greeting}, {currentUser?.name || 'Carlos'}</h1>
                    <p className="mt-2 text-sm text-gray-700">Hoy no tienes tareas que venzan.</p>
                    <p className="text-sm text-gray-700">Tareas pendientes totales: {pendingTodos.length}.</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                    <div className="flex flex-wrap gap-2 mb-4">
                        <button
                            type="button"
                            className="px-3 py-2 rounded-xl border text-sm font-bold bg-violet-700 text-white border-violet-700"
                        >
                            Inventario
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setInventoryPanelMode('critical')}
                                className={`px-3 py-2 rounded-xl border text-sm font-bold ${inventoryPanelMode === 'critical' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-700 border-rose-200'}`}
                            >
                                Stock crítico
                            </button>
                            <button
                                type="button"
                                onClick={() => setInventoryPanelMode('general')}
                                className={`px-3 py-2 rounded-xl border text-sm font-bold ${inventoryPanelMode === 'general' ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-violet-700 border-violet-200'}`}
                            >
                                Datos generales
                            </button>
                        </div>

                        {inventoryPanelMode === 'critical' && (
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-1.5">Stock crítico · Cajas montadas (todas las bodegas)</p>
                                    <div className="space-y-1.5">
                                        {mountedCriticalFromInventory.map((item) => (
                                            <div key={`rm-${item.producto}`} className="w-full text-left p-2 rounded-xl border border-rose-100 bg-rose-50">
                                                <p className="text-sm font-bold text-rose-900">{item.producto}</p>
                                                <p className="text-xs text-rose-700">Stock: {item.stockTotal.toLocaleString('es-ES')} · Cobertura: {formatCoverageText(item.coberturaMeses)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-1.5">Stock crítico · Cajas potenciales</p>
                                    <div className="space-y-1.5">
                                        {potentialCriticalFromInventory.map((item) => (
                                            <div key={`rp-${item.producto}`} className="w-full text-left p-2 rounded-xl border border-amber-100 bg-amber-50">
                                                <p className="text-sm font-bold text-amber-900">{item.producto}</p>
                                                <p className="text-xs text-amber-700">Potencial: {item.cajasPotenciales.toLocaleString('es-ES')} · Cobertura: {formatCoverageText(item.coberturaMeses)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-1.5">Stock crítico Canet</p>
                                    <div className="space-y-1.5">
                                        {canetCriticalFromInventory.map((item) => (
                                            <div key={`rc-${item.producto}`} className="w-full text-left p-2 rounded-xl border border-rose-100 bg-rose-50">
                                                <p className="text-sm font-bold text-rose-900">{item.producto}</p>
                                                <p className="text-xs text-rose-700">Stock: {item.stockTotal.toLocaleString('es-ES')} · Cobertura: {formatCoverageText(item.coberturaMeses)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {inventoryPanelMode === 'general' && (
                            <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
                                <p className="text-xs font-bold uppercase tracking-widest text-violet-700 mb-2">Datos generales · Producto y stock total</p>
                                <div className="app-table-wrap">
                                    <table className="app-table">
                                        <thead>
                                            <tr>
                                                <th>Producto</th>
                                                <th>Stock total</th>
                                                <th>Cobertura</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {restrictedGeneralRows.map((row) => (
                                                <tr key={`carlos-general-${row.producto}`}>
                                                    <td>
                                                        <span className="inline-flex items-center gap-2 font-bold text-gray-900">
                                                            <span
                                                                className="h-2.5 w-2.5 rounded-full border border-violet-200/70"
                                                                style={{ backgroundColor: PRODUCT_COLORS[row.producto] || '#7c3aed' }}
                                                            />
                                                            {row.producto}
                                                        </span>
                                                    </td>
                                                    <td>{row.stockTotal.toLocaleString('es-ES')}</td>
                                                    <td>{formatCoverageText(row.coberturaMeses)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto pb-16 space-y-6 app-page-shell">
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h1 className="text-2xl font-black text-violet-950">{greeting}, {currentUser?.name || 'equipo'}</h1>
                    <span className="px-3 py-1 rounded-full bg-violet-700 text-white text-xs font-bold">
                        {weeklyAbsences.length === 0 ? 'Equipo completo' : `${weeklyAbsences.length} ausencia(s) esta semana`}
                    </span>
                </div>
                <p className="text-sm font-semibold text-violet-900/90 mb-2">
                    Semana: {formatDatePretty(weekStart)} - {formatDatePretty(weekEnd)}.
                </p>
                <div className="space-y-1.5">
                    {summaryLines.map((line) => (
                        line.onClick ? (
                            <button
                                key={line.id}
                                onClick={line.onClick}
                                className="text-left text-sm text-violet-700 hover:text-violet-900 hover:underline font-semibold"
                            >
                                {line.text}
                            </button>
                        ) : (
                            <p key={line.id} className="text-sm text-gray-700">{line.text}</p>
                        )
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
                <div className="space-y-6">
                    {isCompact && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {compactTilesVisible.map(({ key, label, Icon }) => (
                                <button
                                    key={key}
                                    onClick={() => setCompactSection(key)}
                                    className={`compact-card rounded-2xl border p-2 text-xs font-black transition ${
                                        compactSection === key
                                            ? 'border-violet-400 bg-violet-700 text-white'
                                            : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
                                    }`}
                                >
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="relative">
                                            <Icon size={16} />
                                            {(compactTileBadges[key] || 0) > 0 && (
                                                <span className={`absolute -top-2 -right-2 w-4 h-4 rounded-full text-[10px] leading-4 text-center font-black ${
                                                    compactSection === key ? 'bg-white text-violet-700' : 'bg-rose-500 text-white'
                                                }`}>
                                                    {compactTileBadges[key]! > 9 ? '9+' : compactTileBadges[key]}
                                                </span>
                                            )}
                                        </div>
                                        <span>{label}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {isCompact ? (
                        <div className="bg-white border border-gray-200 rounded-3xl p-3 shadow-sm compact-card">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-black text-violet-950">Registro de jornada</h3>
                                    <p className="text-xs text-violet-700">Panel compacto</p>
                                </div>
                                <button
                                    onClick={() => setShowCompactTimeTracker((prev) => !prev)}
                                    className="px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-bold"
                                >
                                    {showCompactTimeTracker ? 'Ocultar' : 'Abrir'}
                                </button>
                            </div>
                            {showCompactTimeTracker && (
                                <div className="mt-3">
                                    <TimeTrackerWidget showEntries={false} compact />
                                </div>
                            )}
                        </div>
                    ) : (
                        <TimeTrackerWidget showEntries={false} />
                    )}

                    {(!isCompact || compactSection === 'events') && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-violet-950">Eventos del día</h2>
                            <span className="text-xs font-bold text-violet-600">{todayEvents.length} evento(s)</span>
                        </div>
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (!eventDraft.trim() || !currentUser) return;
                                try {
                                    await createEvent({
                                        date_key: todayKey,
                                        title: eventDraft.trim(),
                                        description: null,
                                        created_by: currentUser.id,
                                    });
                                    setEventDraft('');
                                } catch {
                                    // fallback is handled in hook; prevent app-level error
                                }
                            }}
                            className="mb-3"
                        >
                            <textarea
                                value={eventDraft}
                                onChange={(e) => setEventDraft(e.target.value)}
                                className="w-full min-h-[84px] border border-violet-200 rounded-xl px-3 py-2 text-sm"
                                placeholder="Ej: Hoy llega Solar Vital&#10;Recordar envío a las 11:00&#10;Notas del día"
                            />
                            <div className="mt-2 flex justify-end">
                                <button className="px-3 py-2 bg-violet-700 text-white rounded-xl text-sm font-bold">
                                    Añadir evento
                                </button>
                            </div>
                        </form>
                        <div className="space-y-2">
                            {todayEvents.length > 0 ? todayEvents.map((event) => (
                                <div key={event.id} className="p-3 rounded-xl border border-violet-100 bg-violet-50 text-sm font-medium text-violet-900 whitespace-pre-line">
                                    {event.title}
                                </div>
                            )) : <div className="app-empty-card">Aún no hay eventos para hoy.</div>}
                        </div>
                    </div>
                    )}

                    {(!isCompact || compactSection === 'quick') && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                            <h2 className="text-lg font-black text-violet-950 mb-3">Solicitudes rápidas</h2>
                            <p className="text-sm text-violet-700 mb-4">Todo desde el dashboard, sin cambiar de página.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                    onClick={() => openRequestModal('absence')}
                                    className="p-3 rounded-xl border border-violet-200 bg-white hover:bg-violet-50 flex items-center gap-2 text-sm font-bold text-violet-900"
                                >
                                    <UserX size={16} />
                                    Solicitar ausencia
                                </button>
                                <button
                                    onClick={() => openRequestModal('vacation')}
                                    className="p-3 rounded-xl border border-violet-200 bg-white hover:bg-violet-50 flex items-center gap-2 text-sm font-bold text-violet-900"
                                >
                                    <CalendarClock size={16} />
                                    Solicitar vacaciones
                                </button>
                                <button
                                    onClick={() => openRequestModal('meeting')}
                                    className="p-3 rounded-xl border border-violet-200 bg-white hover:bg-violet-50 flex items-center gap-2 text-sm font-bold text-violet-900"
                                >
                                    <Users size={16} />
                                    Solicitar reunión/sugerencia
                                </button>
                                <button
                                    onClick={() => openRequestModal('training')}
                                    className="p-3 rounded-xl border border-violet-200 bg-white hover:bg-violet-50 flex items-center gap-2 text-sm font-bold text-violet-900"
                                >
                                    <GraduationCap size={16} />
                                    Solicitar formación
                                </button>
                                <button
                                    onClick={() => {
                                        const block = document.getElementById('dashboard-my-requests');
                                        if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }}
                                    className="sm:col-span-2 p-3 rounded-xl border border-violet-300 bg-violet-700 hover:bg-violet-800 text-white flex items-center justify-center gap-2 text-sm font-black"
                                >
                                    <Clock3 size={16} />
                                    Mis solicitudes
                                </button>
                            </div>
                            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                                <p className="text-xs font-bold uppercase tracking-widest text-violet-700 mb-2">Mis solicitudes recientes</p>
                                <div className="space-y-1.5">
                                    {myRequestRows.slice(0, 6).map((row) => (
                                        <button
                                            key={row.id}
                                            onClick={() => {
                                                const target = myDetailedRequestRows.find((r) => r.source === row.source && r.id === row.requestId);
                                                if (!target) return;
                                                openMyRequest(target);
                                            }}
                                            className="w-full text-left rounded-lg border border-violet-100 bg-white p-2 text-xs hover:border-violet-300 transition"
                                        >
                                            <p className="font-bold text-violet-900">{row.title}</p>
                                            <p className="text-violet-700">{row.date} · Estado: {row.status}</p>
                                        </button>
                                    ))}
                                    {myRequestRows.length === 0 && <div className="app-empty-card">Aún no tienes solicitudes creadas.</div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {(!isCompact || compactSection === 'checklist') && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-black text-violet-950">Check-list diario</h3>
                            <div className="text-xs font-bold text-violet-700">
                                {checklistDone}/{checklistTasks.length} completadas {checklistSaving ? '· guardando...' : ''}
                            </div>
                        </div>
                        {checklistLoading ? (
                            <p className="text-sm text-violet-600">Cargando checklist...</p>
                        ) : checklistTasks.length === 0 ? (
                            <div className="app-empty-card">No tienes tareas en tu checklist de hoy.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {checklistTasks.slice(0, 8).map((task) => (
                                    <label key={task.id} className="flex items-center gap-2 p-2 rounded-xl border border-violet-100 bg-violet-50/70 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={task.completed}
                                            onChange={() => toggleChecklistTask(task.id)}
                                            className="accent-violet-700"
                                        />
                                        <span className={task.completed ? 'line-through text-violet-500' : 'text-violet-900'}>{task.text}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        <div className="mt-3">
                            <Link to="/checklist" className="text-xs font-bold text-violet-700">Abrir checklist completo</Link>
                        </div>
                        </div>
                    )}

                    {(!isCompact || compactSection === 'time') && (
                    <div id="dashboard-time-summary" className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <h2 className="text-lg font-black text-violet-950">Registro de jornada</h2>
                            <div className="flex items-center gap-3">
                                {!isAdmin && (
                                    <button
                                        onClick={downloadMonthlyPdf}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 bg-violet-50"
                                    >
                                        Descargar PDF del mes
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowAllTimeRows((prev) => !prev)}
                                    className="text-xs font-bold text-violet-700"
                                >
                                    {showAllTimeRows ? 'Ver menos' : 'Ver todo el periodo'}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                            <div className="rounded-xl border border-violet-200 bg-white p-3">
                                <p className="text-xs font-bold text-violet-600">Horas esta semana</p>
                                <p className="text-xl font-black text-violet-950">{formatHours(weeklyWorkedHours)}</p>
                            </div>
                            <div className="rounded-xl border border-violet-200 bg-white p-3">
                                <p className="text-xs font-bold text-violet-600">Faltan para objetivo</p>
                                <p className="text-xl font-black text-violet-950">{formatHours(remainingWeeklyHours)}</p>
                            </div>
                            <div className="rounded-xl border border-violet-200 bg-white p-3">
                                <p className="text-xs font-bold text-violet-600">Vacaciones usadas</p>
                                <p className="text-xl font-black text-violet-950">{vacationUsed} / {vacationTotal}</p>
                            </div>
                        </div>

                        <div className="app-table-wrap">
                            <table className="app-table">
                                <thead>
                                    <tr className="text-left text-violet-700 border-b border-violet-200">
                                        <th className="py-2">Fecha</th>
                                        <th className="py-2">Entrada</th>
                                        <th className="py-2">Salida</th>
                                        <th className="py-2">Total</th>
                                        <th className="py-2">Editar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentTimeRows.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-3">
                                                <div className="app-empty-card">No hay registros recientes.</div>
                                            </td>
                                        </tr>
                                    )}
                                    {(showAllTimeRows ? recentTimeRows : recentTimeRows.slice(0, 7)).map((row) => {
                                        const isEditing = editingDateKey === row.date_key;
                                        return (
                                            <tr key={row.date_key} className="border-b border-violet-100">
                                                <td className="py-2 text-violet-900 font-semibold">{row.date_key}</td>
                                                <td className="py-2">
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            value={timeEdit.entry}
                                                            onChange={(e) => setTimeEdit((prev) => ({ ...prev, entry: e.target.value }))}
                                                            className="px-2 py-1 rounded-lg border border-violet-200"
                                                        />
                                                    ) : (row.entry || '-')} 
                                                </td>
                                                <td className="py-2">
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            value={timeEdit.exit}
                                                            onChange={(e) => setTimeEdit((prev) => ({ ...prev, exit: e.target.value }))}
                                                            className="px-2 py-1 rounded-lg border border-violet-200"
                                                        />
                                                    ) : (row.exit || '-')}
                                                </td>
                                                <td className="py-2 text-violet-900 font-bold">{formatHours(row.total || 0)}</td>
                                                <td className="py-2">
                                                    {isEditing ? (
                                                        <button
                                                            onClick={() => saveTimeRow(row)}
                                                            disabled={savingRow}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-700 text-white text-xs font-bold"
                                                        >
                                                            <Save size={12} /> Guardar
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setEditingDateKey(row.date_key);
                                                                setTimeEdit({ entry: row.entry || '', exit: row.exit || '' });
                                                            }}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold"
                                                        >
                                                            <Edit2 size={12} /> Editar
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}

                    {(!isCompact || compactSection === 'absences') && (
                    <div id="dashboard-my-requests" className={`grid grid-cols-1 ${!isCompact && canSeeTrainingsPanel ? 'lg:grid-cols-2' : ''} gap-6`}>
                        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                            <h3 className="text-base font-black text-violet-950 mb-3">{isAdmin ? 'Gestionar solicitudes' : 'Mis ausencias y vacaciones'}</h3>
                            {isAdmin ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => {
                                            setSelectedManagedRequest(null);
                                            setManageRequestsTab('pending');
                                            setShowAbsencesManageModal(true);
                                        }}
                                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900"
                                    >
                                        Pendientes ({pendingManagedRows.length})
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedManagedRequest(null);
                                            setManageRequestsTab('resolved');
                                            setShowAbsencesManageModal(true);
                                        }}
                                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900"
                                    >
                                        Aprobadas ({resolvedManagedRows.length})
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {requestPreviewRows.map((item) => (
                                        <button
                                            key={`${item.source}-${item.id}`}
                                            onClick={() => openMyRequest(item)}
                                            className="w-full text-left block p-3 rounded-xl border border-violet-100 bg-violet-50/70 text-sm"
                                        >
                                            <p className="font-bold text-violet-900">{item.source === 'meeting' ? `Reunión · ${item.title}` : `${item.title} · ${item.dateText}`}</p>
                                            <p className="text-xs text-violet-700">Estado: {item.status}</p>
                                        </button>
                                    ))}
                                    {managedRequestRows.length === 0 && (
                                        <div className="app-empty-card">No hay solicitudes para mostrar.</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {canSeeTrainingsPanel && !isCompact && (
                        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-black text-violet-950">Gestionar formaciones</h3>
                                <Link to="/trainings" className="text-xs font-bold text-violet-700">Gestionar formaciones</Link>
                            </div>
                            <div className="space-y-2">
                                {trainingRequests
                                    .filter((training) => (currentUser?.isTrainingManager || training.user_id === currentUser?.id) && training.status !== 'rejected')
                                    .slice(0, 4)
                                    .map((training) => (
                                        <Link key={training.id} to="/trainings" className="block p-3 rounded-xl border border-violet-100 bg-violet-50/70 text-sm">
                                            <p className="font-bold text-violet-900">{training.scheduled_date_key || training.requested_date_key}</p>
                                            <p className="text-xs text-violet-700">Estado: {training.status}</p>
                                        </Link>
                                    ))}
                                {trainingRequests.filter((training) => (currentUser?.isTrainingManager || training.user_id === currentUser?.id) && training.status !== 'rejected').length === 0 && (
                                    <div className="app-empty-card">No tienes formaciones pendientes.</div>
                                )}
                            </div>
                        </div>
                        )}
                    </div>
                    )}

                    {canSeeTrainingsPanel && isCompact && compactSection === 'trainings' && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm compact-card">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-black text-violet-950">Gestionar formaciones</h3>
                            <Link to="/trainings" className="text-xs font-bold text-violet-700">Gestionar formaciones</Link>
                        </div>
                        <div className="space-y-2">
                            {trainingRequests
                                .filter((training) => (currentUser?.isTrainingManager || training.user_id === currentUser?.id) && training.status !== 'rejected')
                                .slice(0, 4)
                                .map((training) => (
                                    <Link key={training.id} to="/trainings" className="block p-3 rounded-xl border border-violet-100 bg-violet-50/70 text-sm">
                                        <p className="font-bold text-violet-900">{training.scheduled_date_key || training.requested_date_key}</p>
                                        <p className="text-xs text-violet-700">Estado: {training.status}</p>
                                    </Link>
                                ))}
                            {trainingRequests.filter((training) => (currentUser?.isTrainingManager || training.user_id === currentUser?.id) && training.status !== 'rejected').length === 0 && (
                                <div className="app-empty-card">No tienes formaciones pendientes.</div>
                            )}
                        </div>
                    </div>
                    )}
                </div>

                <div className="space-y-6">
                    {(!isCompact || compactSection === 'alerts') && (
                    <div id="dashboard-inventory-panel" className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm compact-card">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-violet-950">Inventario · Visión general</h2>
                        </div>
                        <div className="flex gap-2 mb-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setInventoryPanelMode('critical');
                                    setSelectedInventoryDetail(null);
                                    setSelectedGeneralLotDetail(null);
                                }}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
                                    inventoryPanelMode === 'critical'
                                        ? 'bg-rose-600 text-white border-rose-600'
                                        : 'bg-white text-rose-700 border-rose-200'
                                }`}
                            >
                                <AlertTriangle size={14} />
                                Stock crítico
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setInventoryPanelMode('general');
                                    setSelectedInventoryDetail(null);
                                    setSelectedGeneralLotDetail(null);
                                }}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
                                    inventoryPanelMode === 'general'
                                        ? 'bg-violet-700 text-white border-violet-700'
                                        : 'bg-white text-violet-700 border-violet-200'
                                }`}
                            >
                                <Info size={14} />
                                Datos generales
                            </button>
                        </div>

                        {mountedVisualFromInventory.length === 0 &&
                        potentialVisualFromInventory.length === 0 &&
                        globalStockByProductLotFromInventory.length === 0 &&
                        canetCriticalFromInventory.length === 0 &&
                        mountedCriticalFromInventory.length === 0 &&
                        potentialCriticalFromInventory.length === 0 &&
                        caducityAlertsFromInventory.length === 0 ? (
                            <div className="app-empty-card">Sin alertas críticas de stock o caducidad por ahora.</div>
                        ) : (
                            <div className="space-y-3">
                                {inventoryPanelMode === 'critical' && mountedCriticalFromInventory.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-1.5">Stock crítico · Cajas montadas (todas las bodegas)</p>
                                        <div className="space-y-1.5">
                                            {mountedCriticalFromInventory.slice(0, 6).map((item) => (
                                                <button
                                                    key={`mounted-${item.producto}`}
                                                    type="button"
                                                    onClick={() => {
                                                        const detail =
                                                            mountedCriticalDetailsFallback.find((d) => productKey(d.producto) === productKey(item.producto)) ||
                                                            mountedCriticalDetailsFromInventory.find((d) => productKey(d.producto) === productKey(item.producto));
                                                        setSelectedInventoryDetail({
                                                            tipo: 'mounted',
                                                            producto: item.producto,
                                                            byBodega: detail?.byBodega || [],
                                                            byLote: detail?.byLote || [],
                                                        });
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border border-rose-100 bg-rose-50 hover:bg-rose-100/70"
                                                >
                                                    <p className="text-sm font-bold text-rose-900">{item.producto}</p>
                                                    <p className="text-xs text-rose-700">Stock: {item.stockTotal.toLocaleString('es-ES')} · Cobertura: {formatCoverageText(item.coberturaMeses)}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {inventoryPanelMode === 'critical' && potentialCriticalFromInventory.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-1.5">Stock crítico · Cajas potenciales</p>
                                        <div className="space-y-1.5">
                                            {potentialCriticalFromInventory.slice(0, 6).map((item) => (
                                                <button
                                                    key={`potential-${item.producto}`}
                                                    type="button"
                                                    onClick={() => {
                                                        const detail = potentialCriticalDetailsFromInventory.find((d) => productKey(d.producto) === productKey(item.producto));
                                                        setSelectedInventoryDetail({
                                                            tipo: 'potential',
                                                            producto: item.producto,
                                                            byLote: detail?.byLote || [],
                                                        });
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border border-amber-100 bg-amber-50 hover:bg-amber-100/70"
                                                >
                                                    <p className="text-sm font-bold text-amber-900">{item.producto}</p>
                                                    <p className="text-xs text-amber-700">Potencial: {item.cajasPotenciales.toLocaleString('es-ES')} · Cobertura: {formatCoverageText(item.coberturaMeses)}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {inventoryPanelMode === 'critical' && canetCriticalFromInventory.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-1.5">Stock crítico Canet</p>
                                        <div className="space-y-1.5">
                                            {canetCriticalFromInventory.slice(0, 6).map((item) => (
                                                <button
                                                    key={`canet-${item.producto}`}
                                                    type="button"
                                                    onClick={() => {
                                                        const detail = canetCriticalDetailsFromInventory.find((d) => productKey(d.producto) === productKey(item.producto));
                                                        setSelectedInventoryDetail({
                                                            tipo: 'canet',
                                                            producto: item.producto,
                                                            byLote: detail?.byLote || [],
                                                        });
                                                    }}
                                                    className="w-full text-left p-2 rounded-xl border border-rose-100 bg-rose-50 hover:bg-rose-100/70"
                                                >
                                                    <p className="text-sm font-bold text-rose-900">{item.producto}</p>
                                                    <p className="text-xs text-rose-700">Stock: {item.stockTotal.toLocaleString('es-ES')} · Cobertura: {formatCoverageText(item.coberturaMeses)}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {inventoryPanelMode === 'general' && generalStockByProduct.length > 0 && (
                                    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
                                        <p className="text-xs font-bold uppercase tracking-widest text-violet-700 mb-2">Datos generales · Stock total por producto (segmentado por lote)</p>
                                        <div className="space-y-2">
                                            {generalStockByProduct.slice(0, 6).map((row) => (
                                                <div key={`gsp-${row.producto}`}>
                                                    <div className="flex items-center justify-between text-[11px] mb-1">
                                                        <span className="font-black text-violet-900 inline-flex items-center gap-1">
                                                            <span
                                                                className="inline-block w-2.5 h-2.5 rounded-full"
                                                                style={{ background: PRODUCT_COLORS[row.producto] || '#7c3aed' }}
                                                            />
                                                            {row.producto}
                                                        </span>
                                                        <span className="font-semibold text-violet-700">{row.total.toLocaleString('es-ES')}</span>
                                                    </div>
                                                    <div className="h-3 rounded-full bg-violet-100 overflow-hidden flex">
                                                        {row.byLote.map((lot, idx) => (
                                                            <button
                                                                key={`${row.producto}-${lot.lote}`}
                                                                type="button"
                                                                title={`${row.producto} · ${lot.lote}: ${lot.total.toLocaleString('es-ES')}`}
                                                                onClick={() =>
                                                                    setSelectedGeneralLotDetail({
                                                                        producto: row.producto,
                                                                        lote: lot.lote,
                                                                        total: lot.total,
                                                                        byBodega: lot.byBodega.slice().sort((a, b) => b.cantidad - a.cantidad),
                                                                    })
                                                                }
                                                                className="h-full"
                                                                style={{
                                                                    width: `${Math.max(4, (lot.total / Math.max(1, row.total)) * 100)}%`,
                                                                    background:
                                                                        PRODUCT_LOT_PALETTES[row.producto]?.[idx % PRODUCT_LOT_PALETTES[row.producto].length] ||
                                                                        PRODUCT_COLORS[row.producto] ||
                                                                        '#7c3aed',
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {row.byBodega.slice(0, 4).map((b, idx) => (
                                                            <span key={`${row.producto}-b-${b.bodega}`} className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-violet-800 bg-white border border-violet-200">
                                                                <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: BODEGA_COLORS[idx % BODEGA_COLORS.length] }} />
                                                                {b.bodega}: {b.cantidad.toLocaleString('es-ES')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {inventoryPanelMode === 'general' && generalStockByProduct.length === 0 && (
                                    <div className="app-empty-card">
                                        No hay datos generales de inventario para mostrar todavía.
                                    </div>
                                )}

                                {caducityAlertsFromInventory.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1.5">Caducidad próxima</p>
                                        <div className="space-y-1.5">
                                            {caducityAlertsFromInventory.slice(0, 4).map((item) => (
                                                <div key={`${item.producto}-${item.lote}`} className="p-2 rounded-xl border border-amber-100 bg-amber-50">
                                                    <p className="text-sm font-bold text-amber-900">{item.producto} · {item.lote}</p>
                                                    <p className="text-xs text-amber-700">{item.days <= 0 ? 'Caducado' : `${item.days} días para caducar`} · {item.fecha}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {inventoryAlerts?.updatedAt && (
                            <p className="mt-3 text-[11px] text-violet-500">Actualizado: {formatDatePretty(new Date(inventoryAlerts.updatedAt))}</p>
                        )}
                    </div>
                    )}

                    {(!isCompact || compactSection === 'notifications') && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm compact-card">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-violet-950">Notificaciones</h2>
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new CustomEvent('open-notifications-modal'))}
                                className="text-xs font-bold text-violet-700"
                            >
                                Ver todas
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {(['all', 'tasks', 'schedule', 'meetings', 'absences', 'trainings', 'stock'] as NotificationFilter[]).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setNotificationFilter(tab)}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 ${
                                        notificationFilter === tab ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-violet-700 border-violet-200'
                                    }`}
                                >
                                    {notificationFilterLabels[tab]}
                                    {notificationCounts[tab] > 0 && (
                                        <span className={`w-4 h-4 rounded-full text-[10px] leading-4 text-center ${notificationFilter === tab ? 'bg-white text-violet-700' : 'bg-violet-700 text-white'}`}>
                                            {notificationCounts[tab]}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={markFilteredAsRead}
                            className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5"
                        >
                            <span className="w-3.5 h-3.5 rounded border border-violet-400 bg-white" />
                            Marcar filtro como leído
                        </button>

                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {compactNotifications.length > 0 ? compactNotifications.map((notification) => (
                                <div key={notification.id} className="p-3 rounded-xl border border-violet-100 bg-white">
                                    <button
                                        onClick={() => handleNotificationClick(notification)}
                                        className="w-full text-left"
                                    >
                                        <p className="text-sm text-violet-900 font-medium">{notification.message}</p>
                                        <p className="text-[11px] text-violet-500 mt-1">{formatDatePretty(new Date(notification.created_at))}</p>
                                    </button>
                                    {categorizeNotification(notification) === 'schedule' && (
                                        <div className="mt-2">
                                            <button
                                                onClick={() => {
                                                    const block = document.getElementById('dashboard-time-summary');
                                                    if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                }}
                                                className="text-xs px-2 py-1 rounded-lg border border-violet-200 text-violet-700 bg-violet-50"
                                            >
                                                Pausa / Retomar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div className="app-empty-card">No hay notificaciones pendientes.</div>
                            )}
                            {filteredNotifications.length > compactNotifications.length && (
                                <button
                                    onClick={() => window.dispatchEvent(new CustomEvent('open-notifications-modal'))}
                                    className="w-full mt-1 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-100 transition-colors"
                                >
                                    Ver {filteredNotifications.length - compactNotifications.length} mas
                                </button>
                            )}
                        </div>
                    </div>
                    )}

                    {(!isCompact || compactSection === 'pulse') && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm compact-card">
                        <h2 className="text-lg font-black text-violet-950 mb-3">Pulso del equipo</h2>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                                { emoji: '✨', label: 'Protagonista' },
                                { emoji: '🌸', label: 'Zen' },
                                { emoji: '☁️', label: 'Paciencia' },
                                { emoji: '🔥', label: 'A tope' },
                            ].map((mood) => (
                                <button
                                    key={mood.emoji}
                                    onClick={() => handleMoodSelect(mood.emoji, mood.label)}
                                    className={`px-2 py-2 rounded-xl border text-xs font-bold ${
                                        myStatusToday?.custom_emoji === mood.emoji
                                            ? 'bg-violet-700 text-white border-violet-700'
                                            : 'bg-white border-violet-200 text-violet-700'
                                    }`}
                                >
                                    <span className="mr-1">{mood.emoji}</span>
                                    {mood.label}
                                    {savingMood === mood.emoji ? ' ...' : ''}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-2">
                            {teamPulse.map((item) => (
                                <div key={item.user.id} className="p-3 rounded-2xl border border-gray-100 bg-gray-50/70 flex items-center gap-3">
                                    <UserAvatar name={item.user.name} size="sm" />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-violet-900">{item.user.name}</p>
                                        <p className="text-xs text-violet-600">
                                            {item.mood?.custom_emoji || '🙂'} {item.mood?.custom_status || (item.isActive ? 'Activo' : 'Sin estado')}
                                        </p>
                                    </div>
                                    {item.user.id !== currentUser?.id && (
                                        <button
                                            onClick={() => openDirectChat(item.user.id)}
                                            className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-violet-200 text-violet-700 hover:bg-violet-100 hover:scale-[1.03] active:scale-[0.97] transition-all"
                                            title={`Abrir chat con ${item.user.name}`}
                                        >
                                            <MessageCircle size={14} />
                                        </button>
                                    )}
                                    {item.user.id !== currentUser?.id && (
                                        <button
                                            onClick={() => handleSendCaffeineBoost(item.user.id, item.user.name)}
                                            disabled={sendingBoostTo === item.user.id}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl font-bold text-xs transition-all ${
                                                sendingBoostTo === item.user.id
                                                    ? 'bg-violet-300 text-violet-900'
                                                    : 'bg-violet-200 text-violet-800 hover:bg-violet-300 hover:scale-[1.03] active:scale-[0.98]'
                                            }`}
                                            title="Enviar chute de energía"
                                        >
                                            <Coffee size={14} />
                                            {sendingBoostTo === item.user.id ? 'Enviando...' : 'Café'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    )}

                    {(!isCompact || compactSection === 'chat') && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm compact-card">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-violet-950">Chat interno</h2>
                            <Link to="/chat" className="text-xs font-bold text-violet-700">Abrir</Link>
                        </div>
                        <div className="space-y-2">
                            {chatConversations.slice(0, 3).map((conversation) => (
                                <Link key={conversation.id} to="/chat" className="block p-2 rounded-xl border border-gray-200 hover:border-violet-200">
                                    <p className="text-sm font-bold text-gray-900 truncate">{conversation.title || (conversation.kind === 'group' ? 'Grupo' : 'Chat directo')}</p>
                                    <p className="text-xs text-gray-500 truncate">{conversation.last_message?.message || 'Sin mensajes'}</p>
                                </Link>
                            ))}
                            {chatConversations.length === 0 && (
                                <div className="app-empty-card">No tienes chats activos todavía.</div>
                            )}
                        </div>
                    </div>
                    )}
                </div>
            </div>

            {showAbsencesManageModal && (
                <div className="app-modal-overlay" onClick={() => {
                    setShowAbsencesManageModal(false);
                    setSelectedManagedRequest(null);
                }}>
                    <div className="app-modal-panel w-full max-w-[820px] rounded-2xl border border-gray-200 bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-xl font-black text-gray-900">{isAdmin ? 'Gestionar solicitudes' : 'Mis solicitudes'}</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={downloadAbsencesPdf}
                                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700"
                                >
                                    <Download size={13} />
                                    Descargar PDF
                                </button>
                                <button onClick={() => {
                                    setShowAbsencesManageModal(false);
                                    setSelectedManagedRequest(null);
                                }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                    <XCircle size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="p-3 sm:p-4 overflow-y-auto space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setManageRequestsTab('pending')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                                        manageRequestsTab === 'pending'
                                            ? 'bg-amber-600 text-white border-amber-600'
                                            : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}
                                >
                                    Pendientes ({pendingManagedRows.length})
                                </button>
                                <button
                                    onClick={() => setManageRequestsTab('resolved')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                                        manageRequestsTab === 'resolved'
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    }`}
                                >
                                    Aprobadas ({resolvedManagedRows.length})
                                </button>
                            </div>

                            <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-2 space-y-2">
                                {(manageRequestsTab === 'pending' ? pendingManagedRows : resolvedManagedRows).length === 0 ? (
                                    <p className="px-2 py-2 text-xs text-gray-500 italic">
                                        No hay solicitudes {manageRequestsTab === 'pending' ? 'pendientes' : 'aprobadas'}.
                                    </p>
                                ) : (
                                    (manageRequestsTab === 'pending' ? pendingManagedRows : resolvedManagedRows).map((request) => (
                                        <button
                                            key={`${request.source}-${request.id}`}
                                            onClick={() => openManagedRequest(request)}
                                            className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-left hover:border-violet-400 transition"
                                        >
                                            <p className="text-sm font-black text-violet-900">
                                                {request.source === 'meeting' ? 'Reunión' : request.title} · {request.source === 'meeting' ? request.title : request.dateText}
                                            </p>
                                            <p className="text-xs text-violet-700">
                                                Estado: {request.status}
                                                {isAdmin ? ` · ${USERS.find((u) => u.id === request.created_by)?.name || request.created_by}` : ''}
                                            </p>
                                        </button>
                                    ))
                                )}
                            </div>

                            {selectedManagedRequest && (
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-black text-gray-900">
                                                {selectedManagedRequest.source === 'meeting' ? 'Solicitud de reunión/sugerencia' : selectedManagedRequest.title}
                                            </p>
                                            <p className="text-xs text-gray-600">
                                                Estado: {selectedManagedRequest.status} · Persona: {USERS.find((u) => u.id === selectedManagedRequest.created_by)?.name || selectedManagedRequest.created_by}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setSelectedManagedRequest(null)}
                                            className="text-xs font-bold text-gray-500"
                                        >
                                            Cerrar
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Fecha / Reprogramación</label>
                                        <input
                                            type="date"
                                            value={manageRequestDate}
                                            onChange={(e) => setManageRequestDate(e.target.value)}
                                            disabled={!canEditOwnRequest && !isAdmin}
                                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                        />
                                    </div>

                                    {selectedManagedRequest.source === 'meeting' && (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1">Título</label>
                                            <input
                                                value={manageRequestTitle}
                                                onChange={(e) => setManageRequestTitle(e.target.value)}
                                                disabled={!canEditOwnRequest}
                                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">
                                            {selectedManagedRequest.source === 'meeting' ? 'Descripción' : 'Motivo'}
                                        </label>
                                        <textarea
                                            value={manageRequestDescription}
                                            onChange={(e) => setManageRequestDescription(e.target.value)}
                                            rows={3}
                                            disabled={!canEditOwnRequest}
                                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Comentario / respuesta</label>
                                        <textarea
                                            value={manageRequestComment}
                                            onChange={(e) => setManageRequestComment(e.target.value)}
                                            rows={2}
                                            disabled={!canEditOwnRequest && !isAdmin}
                                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                        />
                                    </div>

                                    {canEditOwnRequest ? (
                                        <FileUploader
                                            onUploadComplete={setManageRequestAttachments}
                                            existingFiles={manageRequestAttachments}
                                            folderPath={selectedManagedRequest.source === 'meeting' ? 'meetings' : 'absences'}
                                            maxSizeMB={5}
                                        />
                                    ) : (
                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                                            {manageRequestAttachments.length > 0
                                                ? `${manageRequestAttachments.length} archivo(s) adjunto(s).`
                                                : 'Sin adjuntos.'}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        {canEditOwnRequest && (
                                            <button
                                                onClick={saveManagedRequestChanges}
                                                disabled={manageSaving}
                                                className="px-3 py-2 rounded-xl bg-violet-700 text-white text-xs font-bold disabled:opacity-60"
                                            >
                                                Guardar cambios
                                            </button>
                                        )}

                                        {(isAdmin || canEditOwnRequest) && (
                                            <button
                                                onClick={deleteManagedRequest}
                                                disabled={manageSaving}
                                                className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold disabled:opacity-60"
                                            >
                                                Eliminar
                                            </button>
                                        )}

                                        {isAdmin && normStatus(selectedManagedRequest.status) === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() => resolveManagedRequest('reprogram')}
                                                    disabled={manageSaving}
                                                    className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold disabled:opacity-60"
                                                >
                                                    Reprogramar
                                                </button>
                                                <button
                                                    onClick={() => resolveManagedRequest('approve')}
                                                    disabled={manageSaving}
                                                    className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
                                                >
                                                    Aceptar
                                                </button>
                                                <button
                                                    onClick={() => resolveManagedRequest('reject')}
                                                    disabled={manageSaving}
                                                    className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-60"
                                                >
                                                    Cancelar
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showMyRequestModal && selectedMyRequest && (
                <div className="app-modal-overlay" onClick={() => {
                    setShowMyRequestModal(false);
                    setSelectedMyRequest(null);
                }}>
                    <div className="app-modal-panel w-full max-w-[640px] rounded-2xl border border-gray-200 bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900">Mi solicitud</h3>
                            <button onClick={() => {
                                setShowMyRequestModal(false);
                                setSelectedMyRequest(null);
                            }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <XCircle size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Fecha</label>
                                <input
                                    type="date"
                                    value={manageRequestDate}
                                    onChange={(e) => setManageRequestDate(e.target.value)}
                                    disabled={!canEditMyRequest}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                />
                            </div>
                            {selectedMyRequest.source === 'meeting' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Título</label>
                                    <input
                                        value={manageRequestTitle}
                                        onChange={(e) => setManageRequestTitle(e.target.value)}
                                        disabled={!canEditMyRequest}
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">{selectedMyRequest.source === 'meeting' ? 'Descripción' : 'Motivo'}</label>
                                <textarea
                                    value={manageRequestDescription}
                                    onChange={(e) => setManageRequestDescription(e.target.value)}
                                    rows={3}
                                    disabled={!canEditMyRequest}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                />
                            </div>
                            {selectedMyRequest.source !== 'training' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Comentario</label>
                                    <textarea
                                        value={manageRequestComment}
                                        onChange={(e) => setManageRequestComment(e.target.value)}
                                        rows={2}
                                        disabled={!canEditMyRequest}
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-700"
                                    />
                                </div>
                            )}

                            {canEditMyRequest ? (
                                <FileUploader
                                    onUploadComplete={setManageRequestAttachments}
                                    existingFiles={manageRequestAttachments}
                                    folderPath={selectedMyRequest.source === 'meeting' ? 'meetings' : selectedMyRequest.source === 'training' ? 'trainings' : 'absences'}
                                    maxSizeMB={5}
                                />
                            ) : (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                                    {manageRequestAttachments.length > 0
                                        ? `${manageRequestAttachments.length} archivo(s) adjunto(s).`
                                        : 'Sin adjuntos.'}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                    onClick={saveMyRequestChanges}
                                    disabled={manageSaving || !canEditMyRequest}
                                    className="px-3 py-2 rounded-xl bg-violet-700 text-white text-xs font-bold disabled:opacity-60"
                                >
                                    Guardar cambios
                                </button>
                                <button
                                    onClick={deleteMyRequest}
                                    disabled={manageSaving || !canDeleteMyRequest}
                                    className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold disabled:opacity-60"
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeRequestModal && (
                <div className="app-modal-overlay">
                    <div
                        className="app-modal-panel w-full max-w-2xl bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-6 pb-0">
                            <h3 className="text-2xl font-black text-gray-900">
                                {activeRequestModal === 'absence' && 'Solicitar ausencia'}
                                {activeRequestModal === 'vacation' && 'Solicitar vacaciones'}
                                {activeRequestModal === 'meeting' && 'Solicitar reunión/sugerencia'}
                                {activeRequestModal === 'training' && 'Solicitar formación'}
                            </h3>
                            <button onClick={closeRequestModal} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-5">
                            {isAdmin && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">Persona objetivo</label>
                                    <select
                                        value={requestTargetUserId}
                                        onChange={(e) => setRequestTargetUserId(e.target.value)}
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium"
                                    >
                                        {USERS.map((user) => (
                                            <option key={user.id} value={user.id}>{user.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">Fecha</label>
                                <input
                                    type="date"
                                    value={requestDate}
                                    onChange={(e) => setRequestDate(e.target.value)}
                                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium"
                                />
                            </div>

                            {(activeRequestModal === 'absence' || activeRequestModal === 'vacation') && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="req-is-range"
                                            checked={requestIsDateRange}
                                            onChange={(e) => setRequestIsDateRange(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300"
                                        />
                                        <label htmlFor="req-is-range" className="text-sm font-bold text-gray-900">
                                            Seleccionar rango de fechas
                                        </label>
                                    </div>

                                    {requestIsDateRange && (
                                        <div>
                                            <label className="block text-sm font-bold text-gray-900 mb-2">Fecha fin</label>
                                            <input
                                                type="date"
                                                value={requestEndDate}
                                                min={requestDate}
                                                onChange={(e) => setRequestEndDate(e.target.value)}
                                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium"
                                            />
                                        </div>
                                    )}

                                    {activeRequestModal === 'absence' && (
                                        <div>
                                            <label className="block text-sm font-bold text-gray-900 mb-2">Tipo de ausencia</label>
                                            <select
                                                value={requestAbsenceType}
                                                onChange={(e) => setRequestAbsenceType(e.target.value as 'special_permit' | 'absence')}
                                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium"
                                            >
                                                <option value="special_permit">Permiso especial</option>
                                                <option value="absence">Ausencia</option>
                                            </select>
                                        </div>
                                    )}

                                    {requestAbsenceType === 'special_permit' && (
                                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                            <div className="flex items-start gap-2 mb-2">
                                                <Info size={16} className="text-indigo-600 mt-0.5" />
                                                <p className="text-xs text-indigo-700">
                                                    Los permisos especiales pueden requerir reponer horas.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id="req-makeup"
                                                    checked={requestMakeUpHours}
                                                    onChange={(e) => setRequestMakeUpHours(e.target.checked)}
                                                    className="w-4 h-4 text-indigo-600 border-indigo-300 rounded"
                                                />
                                                <label htmlFor="req-makeup" className="text-sm font-bold text-indigo-900">
                                                    Me comprometo a reponer estas horas.
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {activeRequestModal === 'meeting' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2">Título *</label>
                                        <input
                                            type="text"
                                            value={requestTitle}
                                            onChange={(e) => setRequestTitle(e.target.value)}
                                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium"
                                            placeholder="Ej.: Reunión de seguimiento"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2">Motivo / Descripción</label>
                                        <textarea
                                            value={requestDescription}
                                            onChange={(e) => setRequestDescription(e.target.value)}
                                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium min-h-[90px]"
                                            placeholder="¿Qué quieres tratar?"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2">Franja horaria preferida</label>
                                        <select
                                            value={requestSlot}
                                            onChange={(e) => setRequestSlot(e.target.value)}
                                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium"
                                        >
                                            <option value="mañana">Mañana</option>
                                            <option value="tarde">Tarde</option>
                                            <option value="indiferente">Indiferente</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2">Participantes</label>
                                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border-2 border-gray-100 rounded-xl">
                                            {USERS.filter((u) => u.id !== currentUser?.id).map((user) => (
                                                <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={requestParticipants.includes(user.id)}
                                                        onChange={() =>
                                                            setRequestParticipants((prev) =>
                                                                prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id],
                                                            )
                                                        }
                                                        className="rounded border-gray-300"
                                                    />
                                                    <span className="text-sm font-medium text-gray-700">{user.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {(activeRequestModal === 'absence' || activeRequestModal === 'vacation' || activeRequestModal === 'training') && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        {activeRequestModal === 'training' ? 'Razón de la solicitud' : 'Motivo / Descripción *'}
                                    </label>
                                    <textarea
                                        value={requestReason}
                                        onChange={(e) => setRequestReason(e.target.value)}
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium min-h-[90px]"
                                        placeholder="Describe brevemente el motivo..."
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">Adjuntar archivos (opcional)</label>
                                <FileUploader
                                    onUploadComplete={setRequestAttachments}
                                    existingFiles={requestAttachments}
                                    folderPath={activeRequestModal === 'meeting' ? 'meetings' : activeRequestModal === 'training' ? 'trainings' : 'absences'}
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-2">
                            <button
                                onClick={closeRequestModal}
                                className="px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-bold"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={submitQuickRequest}
                                disabled={requestSubmitting}
                                className="px-3 py-2 rounded-xl bg-violet-700 text-white text-sm font-bold"
                            >
                                {requestSubmitting ? 'Enviando...' : 'Solicitar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {selectedTask && (
                <TaskDetailModal
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                />
            )}
            {(selectedInventoryDetail || selectedGeneralLotDetail) && (
                <div
                    className="fixed inset-y-0 right-0 left-0 md:left-[var(--layout-sidebar-current-width)] z-[9999] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4"
                    onClick={() => {
                    setSelectedInventoryDetail(null);
                    setSelectedGeneralLotDetail(null);
                }}
                >
                    <div
                        className="w-full max-w-[min(46rem,96vw)] rounded-2xl border border-violet-200 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-violet-100 flex items-center justify-between gap-2">
                            <p className="text-base font-black text-violet-950">
                                {selectedGeneralLotDetail
                                    ? `Detalle · ${selectedGeneralLotDetail.producto} · lote ${selectedGeneralLotDetail.lote}`
                                    : `Detalle · ${selectedInventoryDetail?.producto || ''}`}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedInventoryDetail(null);
                                    setSelectedGeneralLotDetail(null);
                                }}
                                className="text-xs font-bold text-violet-700"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                            {selectedGeneralLotDetail && (
                                <>
                                    <p className="text-sm text-violet-700">Stock lote: {selectedGeneralLotDetail.total.toLocaleString('es-ES')}</p>
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600 mb-1">Bodegas</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {selectedGeneralLotDetail.byBodega.map((b, idx) => (
                                                <span key={`${selectedGeneralLotDetail.producto}-${selectedGeneralLotDetail.lote}-${b.bodega}`} className="px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-[11px] font-semibold text-violet-800">
                                                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: BODEGA_COLORS[idx % BODEGA_COLORS.length] }} />
                                                    {b.bodega}: {b.cantidad.toLocaleString('es-ES')}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {selectedInventoryDetail && (
                                <>
                                    {selectedInventoryDetail.byBodega && selectedInventoryDetail.byBodega.length > 0 && (
                                        <div>
                                            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600 mb-1">Bodegas</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedInventoryDetail.byBodega.map((b, idx) => (
                                                    <span key={`${selectedInventoryDetail.producto}-${b.bodega}`} className="px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-[11px] font-semibold text-violet-800">
                                                        <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: BODEGA_COLORS[idx % BODEGA_COLORS.length] }} />
                                                        {b.bodega}: {b.cantidad.toLocaleString('es-ES')}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {selectedInventoryDetail.byLote.length > 0 && (
                                        <div>
                                            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600 mb-1">Lotes</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedInventoryDetail.byLote.slice(0, 20).map((l) => (
                                                    <span key={`${selectedInventoryDetail.producto}-${l.lote}`} className="px-2 py-1 rounded-full bg-white border border-violet-200 text-[11px] font-semibold text-violet-800">
                                                        {l.lote}: {l.cantidad.toLocaleString('es-ES')}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                            {!selectedGeneralLotDetail &&
                                selectedInventoryDetail &&
                                (!selectedInventoryDetail.byLote || selectedInventoryDetail.byLote.length === 0) &&
                                (!selectedInventoryDetail.byBodega || selectedInventoryDetail.byBodega.length === 0) && (
                                    <div className="app-empty-card">
                                        No hay desglose disponible para este ítem.
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
            )}
            {boostToastName && (
                <div className="fixed right-5 bottom-5 z-[80] pointer-events-none">
                    <div className="relative rounded-2xl border border-amber-200 bg-white/95 backdrop-blur px-4 py-3 shadow-2xl">
                        <div className="absolute -inset-1 rounded-2xl bg-amber-200/40 blur-md" />
                        <div className="relative flex items-center gap-2 text-sm font-black text-amber-900">
                            <Coffee size={16} className="text-amber-700" />
                            Chute enviado a {boostToastName}
                            <Sparkles size={14} className="text-amber-600 animate-pulse" />
                        </div>
                    </div>
                </div>
            )}
            {summaryModal && (
                <div className="app-modal-overlay" onClick={() => setSummaryModal(null)}>
                    <div className="app-modal-panel w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-100 p-4">
                            <h3 className="text-lg font-black text-gray-900">{summaryModal.title}</h3>
                            <button onClick={() => setSummaryModal(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <XCircle size={18} />
                            </button>
                        </div>
                        <div className="space-y-2 p-4 max-h-[60vh] overflow-y-auto">
                            {summaryModal.items.length === 0 && (
                                <div className="app-empty-card">No hay elementos para mostrar.</div>
                            )}
                            {summaryModal.kind === 'tasks' && summaryModal.items.map((task: any) => (
                                <button
                                    key={`summary-task-${task.id}`}
                                    onClick={() => {
                                        setSelectedTask(task);
                                        setSummaryModal(null);
                                    }}
                                    className="w-full rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-left hover:border-violet-400"
                                >
                                    <p className="text-sm font-black text-violet-900">{task.title}</p>
                                    <p className="text-xs text-violet-700">
                                        Vence: {task.due_date_key || (task.created_at ? toDateKey(new Date(task.created_at)) : '-')}
                                    </p>
                                </button>
                            ))}
                            {summaryModal.kind === 'meetings' && summaryModal.items.map((meeting: any) => (
                                <div key={`summary-meeting-${meeting.id}`} className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                                    <p className="text-sm font-black text-blue-900">{meeting.title || 'Reunión'}</p>
                                    <p className="text-xs text-blue-700">Fecha: {meeting.scheduled_date_key || meeting.preferred_date_key || '-'}</p>
                                    <p className="text-xs text-blue-700">
                                        Descripción:{' '}
                                        {meeting.description ? (
                                            <LinkifiedText
                                                as="span"
                                                text={meeting.description}
                                                linkClassName="underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800"
                                            />
                                        ) : '-'}
                                    </p>
                                </div>
                            ))}
                            {summaryModal.kind === 'trainings' && summaryModal.items.map((training: any) => (
                                <div key={`summary-training-${training.id}`} className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-3">
                                    <p className="text-sm font-black text-fuchsia-900">Formación</p>
                                    <p className="text-xs text-fuchsia-700">Fecha: {training.scheduled_date_key || training.requested_date_key || '-'}</p>
                                    <p className="text-xs text-fuchsia-700">
                                        Motivo:{' '}
                                        {training.reason ? (
                                            <LinkifiedText
                                                as="span"
                                                text={training.reason}
                                                linkClassName="underline decoration-dotted underline-offset-2 text-fuchsia-700 hover:text-fuchsia-800"
                                            />
                                        ) : '-'}
                                    </p>
                                </div>
                            ))}
                            {summaryModal.kind === 'absences' && summaryModal.items.map((absence: any) => (
                                <div key={`summary-absence-${absence.id}`} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                    <p className="text-sm font-black text-amber-900">{absence.personName || '-'}</p>
                                    <p className="text-xs text-amber-700">
                                        {absence.type === 'vacation' ? 'Vacaciones' : absence.type === 'special_permit' ? 'Permiso especial' : 'Ausencia'}
                                        {' · '}
                                        {absence.date_key}{absence.end_date ? ` al ${absence.end_date}` : ''}
                                    </p>
                                    <p className="text-xs text-amber-700">
                                        Motivo:{' '}
                                        {absence.reason ? (
                                            <LinkifiedText
                                                as="span"
                                                text={absence.reason}
                                                linkClassName="underline decoration-dotted underline-offset-2 text-amber-700 hover:text-amber-800"
                                            />
                                        ) : '-'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
