import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
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
import { USERS } from '../constants';
import { formatDatePretty, toDateKey } from '../utils/dateUtils';
import { calculateHours, formatHours } from '../utils/timeUtils';
import { openPrintablePdfReport } from '../utils/pdfReport';
import { supabase } from '../lib/supabase';
import { FileUploader, Attachment } from '../components/FileUploader';
import TaskDetailModal from '../components/TaskDetailModal';
import { Todo } from '../types';

type NotificationFilter = 'all' | 'tasks' | 'schedule' | 'meetings' | 'absences' | 'trainings';
type QuickRequestType = 'absence' | 'vacation' | 'meeting' | 'training' | null;
type InventoryAlertsSummary = {
    updatedAt?: string;
    criticalProducts?: Array<{ producto: string; stockTotal: number; coberturaMeses: number }>;
    caducity?: Array<{ producto: string; lote: string; fecha: string; days: number }>;
};

const INVENTORY_ALERTS_KEY = 'inventory_alerts_summary_v1';

const notificationFilterLabels: Record<NotificationFilter, string> = {
    all: 'Todas',
    tasks: 'Tareas',
    schedule: 'Horario',
    meetings: 'Reuniones',
    absences: 'Ausencias',
    trainings: 'Formaciones',
};

function Dashboard() {
    const { currentUser } = useAuth();
    const isAdmin = !!currentUser?.isAdmin;
    const navigate = useNavigate();
    const location = useLocation();
    const { todos } = useTodos(currentUser);
    const { meetingRequests, createMeeting } = useMeetings(currentUser);
    const { trainingRequests, createTrainingRequest } = useTraining(currentUser);
    const { absenceRequests, createAbsence, updateAbsenceStatus, deleteAbsence } = useAbsences(currentUser);
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
    const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlertsSummary | null>(null);
    const [showAbsencesManageModal, setShowAbsencesManageModal] = useState(false);
    const [expandedAbsenceId, setExpandedAbsenceId] = useState<number | null>(null);

    useEffect(() => {
        const loadAlerts = () => {
            try {
                const raw = window.localStorage.getItem(INVENTORY_ALERTS_KEY);
                setInventoryAlerts(raw ? JSON.parse(raw) : null);
            } catch {
                setInventoryAlerts(null);
            }
        };

        loadAlerts();

        const onStorage = (event: StorageEvent) => {
            if (event.key !== INVENTORY_ALERTS_KEY) return;
            try {
                setInventoryAlerts(event.newValue ? JSON.parse(event.newValue) : null);
            } catch {
                setInventoryAlerts(null);
            }
        };

        const onFocus = () => loadAlerts();
        const onVisibility = () => {
            if (!document.hidden) loadAlerts();
        };

        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

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
                if (a.status !== 'approved') return false;
                const start = a.date_key;
                const end = a.end_date || a.date_key;
                return end >= weekStartKey && start <= weekEndKey;
            }),
        [absenceRequests, weekStartKey, weekEndKey],
    );

    const summaryTextLines = useMemo(() => {
        const lines: string[] = [];

        if (dueTodayTodos.length > 0) {
            lines.push(`Hoy tienes ${dueTodayTodos.length} tarea(s) que vencen.`);
        } else {
            lines.push('Hoy no tienes tareas que venzan.');
        }
        lines.push(`Tareas pendientes totales: ${pendingTodos.length}.`);

        const todayMeetings = weeklyMeetings.filter((m) => (m.scheduled_date_key || m.preferred_date_key) === todayKey);
        if (todayMeetings.length > 0) {
            lines.push(`Hoy tienes ${todayMeetings.length} reunión(es).`);
        } else if (weeklyMeetings.length > 0) {
            const nextMeeting = weeklyMeetings
                .slice()
                .sort((a, b) => `${a.scheduled_date_key || a.preferred_date_key}`.localeCompare(`${b.scheduled_date_key || b.preferred_date_key}`))[0];
            const nextDate = nextMeeting.scheduled_date_key || nextMeeting.preferred_date_key;
            lines.push(`Recuerda: tienes reunión el ${nextDate}.`);
        }

        const todayTrainings = weeklyTrainings.filter((t) => (t.scheduled_date_key || t.requested_date_key) === todayKey);
        if (todayTrainings.length > 0) {
            lines.push(`Hoy tienes ${todayTrainings.length} formación(es).`);
        } else if (weeklyTrainings.length > 0) {
            const nextTraining = weeklyTrainings
                .slice()
                .sort((a, b) => `${a.scheduled_date_key || a.requested_date_key}`.localeCompare(`${b.scheduled_date_key || b.requested_date_key}`))[0];
            const nextDate = nextTraining.scheduled_date_key || nextTraining.requested_date_key;
            lines.push(`Recuerda: tienes formación el ${nextDate}.`);
        }

        if (weeklyAbsences.length === 0) {
            lines.push('Esta semana no hay ausencias.');
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
                lines.push(`Hoy está(n) ausente(s): ${names}.`);
            } else {
                const nextAbsence = weeklyAbsences
                    .slice()
                    .sort((a, b) => a.date_key.localeCompare(b.date_key))[0];
                const name = USERS.find((u) => u.id === nextAbsence.created_by)?.name || 'Compañera/o';
                lines.push(`Recuerda: ${name} estará ausente el ${nextAbsence.date_key}.`);
            }
        }

        return lines;
    }, [dueTodayTodos.length, pendingTodos.length, weeklyMeetings, weeklyTrainings, weeklyAbsences, todayKey]);

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

    const handleNotificationClick = (notification: any) => {
        void markAsRead(notification.id);
        const category = categorizeNotification(notification);
        if (category === 'tasks') {
            const task = todos.find((t) => {
                const title = t.title.toLowerCase();
                const message = `${notification.message || ''}`.toLowerCase();
                return message.includes(title);
            });
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
    };

    const markFilteredAsRead = async () => {
        if (notificationFilter === 'all') {
            await markAllAsRead();
            return;
        }
        await Promise.all(filteredNotifications.map((n: any) => markAsRead(n.id)));
    };

    const openRequestModal = (type: QuickRequestType) => {
        setActiveRequestModal(type);
        setRequestDate(todayKey);
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
                });
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
            }
            closeRequestModal();
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
    };

    const handleResolveAbsence = async (id: number, status: 'approved' | 'rejected', resolutionType?: string) => {
        const note = window.prompt('Nota para la solicitud (opcional):', '') || '';
        await updateAbsenceStatus({
            id,
            status,
            response_message: note,
            resolution_type: resolutionType,
        });
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
    const caducityAlertsFromInventory = inventoryAlerts?.caducity || [];

    return (
        <div className="max-w-7xl mx-auto pb-16 space-y-6">
            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
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
                    {summaryTextLines.map((line, idx) => (
                        <p key={idx} className="text-sm text-gray-700">{line}</p>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
                <div className="space-y-6">
                    <TimeTrackerWidget showEntries={false} />

                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-violet-950">Eventos del día</h2>
                            <span className="text-xs font-bold text-violet-600">{todayEvents.length} evento(s)</span>
                        </div>
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (!eventDraft.trim() || !currentUser) return;
                                await createEvent({
                                    date_key: todayKey,
                                    title: eventDraft.trim(),
                                    description: null,
                                    created_by: currentUser.id,
                                });
                                setEventDraft('');
                            }}
                            className="flex gap-2 mb-3"
                        >
                            <input
                                value={eventDraft}
                                onChange={(e) => setEventDraft(e.target.value)}
                                className="flex-1 border border-violet-200 rounded-xl px-3 py-2 text-sm"
                                placeholder="Ej: Hoy llega Solar Vital"
                            />
                            <button className="px-3 py-2 bg-violet-700 text-white rounded-xl text-sm font-bold">
                                Añadir
                            </button>
                        </form>
                        <div className="space-y-2">
                            {todayEvents.length > 0 ? todayEvents.map((event) => (
                                <div key={event.id} className="p-3 rounded-xl border border-violet-100 bg-violet-50 text-sm font-medium text-violet-900">
                                    {event.title}
                                </div>
                            )) : <p className="text-sm text-violet-600 italic">Aún no hay eventos para hoy.</p>}
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
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
                                        const block = document.getElementById('dashboard-time-summary');
                                        if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }}
                                    className="sm:col-span-2 p-3 rounded-xl border border-violet-300 bg-violet-700 hover:bg-violet-800 text-white flex items-center justify-center gap-2 text-sm font-black"
                                >
                                    <Clock3 size={16} />
                                    Registro horario y edición
                                </button>
                            </div>
                        </div>

                    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-black text-violet-950">Check-list diario</h3>
                            <div className="text-xs font-bold text-violet-700">
                                {checklistDone}/{checklistTasks.length} completadas {checklistSaving ? '· guardando...' : ''}
                            </div>
                        </div>
                        {checklistLoading ? (
                            <p className="text-sm text-violet-600">Cargando checklist...</p>
                        ) : checklistTasks.length === 0 ? (
                            <p className="text-sm text-violet-600 italic">No tienes tareas en tu checklist de hoy.</p>
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

                    <div id="dashboard-time-summary" className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
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

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
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
                                            <td colSpan={5} className="py-3 text-violet-600 italic">No hay registros recientes.</td>
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

                    <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
                        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-black text-violet-950">{isAdmin ? 'Ausencias del equipo' : 'Mis ausencias y vacaciones'}</h3>
                                <button
                                    onClick={() => {
                                        setExpandedAbsenceId(null);
                                        setShowAbsencesManageModal(true);
                                    }}
                                    className="text-xs font-bold text-violet-700"
                                >
                                    Gestionar
                                </button>
                            </div>
                            <div className="space-y-2">
                                {managedAbsenceRows
                                    .slice(0, 4)
                                    .map((absence) => (
                                        <button key={absence.id} onClick={() => {
                                            setExpandedAbsenceId(absence.id);
                                            setShowAbsencesManageModal(true);
                                        }} className="w-full text-left block p-3 rounded-xl border border-violet-100 bg-violet-50/70 text-sm">
                                            <p className="font-bold text-violet-900">{absence.type === 'vacation' ? 'Vacaciones' : absence.type === 'special_permit' ? 'Permiso especial' : 'Ausencia'} · {absence.date_key}</p>
                                            <p className="text-xs text-violet-700">Estado: {absence.status}{isAdmin ? ` · ${USERS.find((u) => u.id === absence.created_by)?.name || absence.created_by}` : ''}</p>
                                        </button>
                                    ))}
                                {managedAbsenceRows.length === 0 && (
                                    <p className="text-sm text-violet-600 italic">No hay ausencias para mostrar.</p>
                                )}
                            </div>
                        </div>

                        {isAdmin && (
                        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-black text-violet-950">Formaciones</h3>
                                <Link to="/trainings" className="text-xs font-bold text-violet-700">Gestionar</Link>
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
                                    <p className="text-sm text-violet-600 italic">No tienes formaciones pendientes.</p>
                                )}
                            </div>
                        </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-violet-950">Alertas de inventario</h2>
                            <Link to="/inventory" className="text-xs font-bold text-violet-700">Abrir inventario</Link>
                        </div>
                        {criticalProductsFromInventory.length === 0 && caducityAlertsFromInventory.length === 0 ? (
                            <p className="text-sm text-violet-600 italic">Sin alertas críticas de stock o caducidad por ahora.</p>
                        ) : (
                            <div className="space-y-3">
                                {criticalProductsFromInventory.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-1.5">Stock crítico</p>
                                        <div className="space-y-1.5">
                                            {criticalProductsFromInventory.slice(0, 4).map((item) => (
                                                <div key={item.producto} className="p-2 rounded-xl border border-rose-100 bg-rose-50">
                                                    <p className="text-sm font-bold text-rose-900">{item.producto}</p>
                                                    <p className="text-xs text-rose-700">Stock: {item.stockTotal.toLocaleString('es-ES')} · Cobertura: {item.coberturaMeses.toFixed(2)} meses</p>
                                                </div>
                                            ))}
                                        </div>
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

                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
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
                            {(['all', 'tasks', 'schedule', 'meetings', 'absences', 'trainings'] as NotificationFilter[]).map((tab) => (
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
                                <p className="text-sm text-violet-600 italic">No hay notificaciones pendientes.</p>
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

                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
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

                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
                        <h2 className="text-lg font-black text-violet-950 mb-3">Accesos rápidos</h2>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <Link to="/tasks" className="p-3 rounded-xl border border-violet-200 text-violet-800 font-bold hover:bg-violet-50 hover:-translate-y-0.5 transition-all">Tareas</Link>
                            <Link to="/calendar" className="p-3 rounded-xl border border-violet-200 text-violet-800 font-bold hover:bg-violet-50 hover:-translate-y-0.5 transition-all">Calendario</Link>
                            <Link to="/shopping" className="p-3 rounded-xl border border-violet-200 text-violet-800 font-bold hover:bg-violet-50 hover:-translate-y-0.5 transition-all">Compras</Link>
                            <Link to="/folders" className="p-3 rounded-xl border border-violet-200 text-violet-800 font-bold hover:bg-violet-50 hover:-translate-y-0.5 transition-all">Carpetas</Link>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
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
                                <p className="text-sm text-gray-500 italic">No tienes chats activos todavía.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showAbsencesManageModal && (
                <div className="fixed inset-0 z-[220] bg-black/45 backdrop-blur-sm flex items-center justify-center p-2 sm:p-3 md:pl-64" onClick={() => {
                    setShowAbsencesManageModal(false);
                    setExpandedAbsenceId(null);
                }}>
                    <div className="w-full max-w-[820px] max-h-[80vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-xl font-black text-gray-900">{isAdmin ? 'Gestionar ausencias y vacaciones' : 'Mis ausencias y vacaciones'}</h3>
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
                                    setExpandedAbsenceId(null);
                                }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                    <XCircle size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="p-3 sm:p-4 overflow-y-auto space-y-3">
                            {managedAbsenceRows.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">No hay registros de ausencias.</p>
                            ) : managedAbsenceRows.map((absence: any) => {
                                const ownerName = USERS.find((u) => u.id === absence.created_by)?.name || absence.created_by;
                                const canDelete = isAdmin || (absence.created_by === currentUser?.id && absence.status === 'pending');
                                const isExpanded = expandedAbsenceId === absence.id;
                                return (
                                    <div key={absence.id} className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <button
                                                onClick={() => setExpandedAbsenceId((prev) => (prev === absence.id ? null : absence.id))}
                                                className="flex-1 text-left"
                                            >
                                                <p className="text-sm font-black text-violet-900">
                                                    {absence.type === 'vacation' ? 'Vacaciones' : absence.type === 'special_permit' ? 'Permiso especial' : 'Ausencia'} · {absence.date_key}{absence.end_date ? ` al ${absence.end_date}` : ''}
                                                </p>
                                                <p className="text-xs text-violet-700">
                                                    {isAdmin ? `${ownerName} · ` : ''}Estado: {absence.status}{absence.resolution_type ? ` · ${absence.resolution_type}` : ''}
                                                </p>
                                            </button>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => setExpandedAbsenceId((prev) => (prev === absence.id ? null : absence.id))}
                                                    className="px-2 py-1 rounded-lg border border-violet-200 bg-white text-violet-700 text-xs font-bold"
                                                >
                                                    {isExpanded ? 'Ocultar' : 'Ver'}
                                                </button>
                                                {canDelete && (
                                                    <button
                                                        onClick={async () => {
                                                            const ok = window.confirm('¿Eliminar esta solicitud?');
                                                            if (!ok) return;
                                                            await deleteAbsence(absence.id);
                                                        }}
                                                        className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold"
                                                    >
                                                        Eliminar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <>
                                                <p className="mt-2 text-sm text-gray-700"><span className="font-bold">Motivo:</span> {absence.reason || '-'}</p>

                                                {isAdmin && absence.status === 'pending' && (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {absence.type === 'special_permit' ? (
                                                            <>
                                                                <button onClick={() => handleResolveAbsence(absence.id, 'approved', 'makeup')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Aprobar · Reponer horas</button>
                                                                <button onClick={() => handleResolveAbsence(absence.id, 'approved', 'paid')} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold">Aprobar · Cuenta trabajada</button>
                                                                <button onClick={() => handleResolveAbsence(absence.id, 'approved', 'deducted')} className="px-3 py-1.5 rounded-lg bg-emerald-400 text-white text-xs font-bold">Aprobar · Ausencia normal</button>
                                                            </>
                                                        ) : (
                                                            <button onClick={() => handleResolveAbsence(absence.id, 'approved')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Aprobar</button>
                                                        )}
                                                        <button onClick={() => handleResolveAbsence(absence.id, 'rejected')} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold">Rechazar</button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {activeRequestModal && (
                <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div
                        className="w-full max-w-2xl bg-white rounded-3xl border border-gray-200 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
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
        </div>
    );
}

export default Dashboard;
