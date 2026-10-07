import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DayDetailsModal from '../components/DayDetailsModal';
import TaskDetailModal from '../components/TaskDetailModal';
import CalendarGrid from '../components/CalendarGrid';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useAbsences } from '../hooks/useAbsences';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { toDateKey } from '../utils/dateUtils';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, UserX, Palmtree, Users, GraduationCap, Lock, Sun, AlertCircle, CheckSquare, X } from 'lucide-react';
import { useCalendarOverrides } from '../hooks/useCalendarOverrides';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { USERS } from '../constants';
import { Todo } from '../types';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import { FileUploader, Attachment } from '../components/FileUploader';
import LinkifiedText from '../components/LinkifiedText';

/**
 * Calendar page
 * Weekly calendar command center with quick actions
 */
function CalendarPage() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const getWeekStart = (date: Date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diffToMonday);
        d.setHours(0, 0, 0, 0);
        return d;
    };
    const addDays = (date: Date, days: number) => {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
    };

    const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
    const [monthDate, setMonthDate] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [showDayDetails, setShowDayDetails] = useState(false);
    const [expandedTasksByDay, setExpandedTasksByDay] = useState<Record<string, boolean>>({});
    const [selectedTask, setSelectedTask] = useState<Todo | null>(null);
    const [activeRequestModal, setActiveRequestModal] = useState<'absence' | 'vacation' | 'meeting' | 'training' | null>(null);
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
    const [requestTargetUserId, setRequestTargetUserId] = useState('');
    const [requestSubmitting, setRequestSubmitting] = useState(false);
    const [eventModal, setEventModal] = useState<{
        type: 'meetings' | 'absences' | 'trainings';
        title: string;
        items: any[];
    } | null>(null);
    const [selectedEventItem, setSelectedEventItem] = useState<any | null>(null);
    const weekEnd = addDays(weekStart, 6);
    const monthStart = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), [monthDate]);
    const monthEnd = useMemo(() => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0), [monthDate]);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart],
    );
    const workDays = weekDays.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
    const nonWorkDays = weekDays.filter((d) => d.getDay() === 0 || d.getDay() === 6);
    const todayKey = toDateKey(new Date());

    const { timeData } = useTimeData({
        from: monthStart,
        to: monthEnd,
    });
    const { trainingRequests, createTrainingRequest } = useTraining(currentUser);
    const { absenceRequests, createAbsence } = useAbsences(currentUser);
    const { todos } = useTodos(currentUser);
    const { meetingRequests, createMeeting } = useMeetings(currentUser);
    const { overrides, toggleDayStatus } = useCalendarOverrides();
    const { calendarEvents } = useCalendarEvents();
    const [togglingDays, setTogglingDays] = useState<Record<string, boolean>>({});
    const handleDateClick = (date: Date) => {
        setSelectedDate(date);
        setShowDayDetails(true);
    };

    const getDayEvents = (day: Date | null) => {
        if (!day || !currentUser) return null;
        const dKey = toDateKey(day);
        const dayData = timeData[dKey] || {};
        const myRecord = dayData[currentUser.id]?.[0];
        const isAdmin = currentUser?.isAdmin;
        const override = overrides.find(o => o.date_key === dKey);
        const absences = absenceRequests.filter(
            r => {
                const start = r.date_key;
                const end = r.end_date || r.date_key;
                return dKey >= start && dKey <= end &&
                    r.status !== 'rejected' &&
                    (isAdmin || r.created_by === currentUser.id);
            }
        );
        const trainings = trainingRequests.filter(
            r => (r.scheduled_date_key === dKey || (!r.scheduled_date_key && r.requested_date_key === dKey)) &&
                r.status !== 'rejected' &&
                (isAdmin || currentUser?.isTrainingManager || r.user_id === currentUser.id)
        );
        const allTasks = todos.filter(
            t => t.due_date_key === dKey &&
                (isAdmin || t.assigned_to.includes(currentUser.id))
        );
        const tasks = allTasks.filter(
            t => !t.completed_by.includes(currentUser.id)
        );
        const meetings = meetingRequests.filter(
            m => m.scheduled_date_key === dKey &&
                m.status === 'scheduled' &&
                (isAdmin || m.participants?.includes(currentUser.id) || m.created_by === currentUser.id)
        );

        return {
            timeEntry: myRecord?.entry ? myRecord : null,
            absences,
            trainings,
            tasks,
            allTasks,
            meetings,
            isAdmin,
            isTrainingManager: currentUser?.isTrainingManager,
            override // Pass override info
        };
    };

    const openRequestModal = (type: 'absence' | 'vacation' | 'meeting' | 'training', date: Date) => {
        setActiveRequestModal(type);
        setRequestDate(toDateKey(date));
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

    const closeRequestModal = () => setActiveRequestModal(null);

    const submitRequest = async () => {
        if (!currentUser || !activeRequestModal) return;
        setRequestSubmitting(true);
        try {
            if (activeRequestModal === 'absence' || activeRequestModal === 'vacation') {
                if (!requestReason.trim()) {
                    window.alert('Escribe un motivo.');
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
            if (activeRequestModal === 'meeting') {
                if (!requestTitle.trim() || !requestDescription.trim()) {
                    window.alert('Completa título y descripción.');
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
                emitSuccessFeedback('Solicitud de reunión creada con éxito.');
            }
            if (activeRequestModal === 'training') {
                if (!requestReason.trim()) {
                    window.alert('Escribe el motivo de la formación.');
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
            closeRequestModal();
        } catch (error: any) {
            window.alert(error?.message || 'No se pudo enviar la solicitud.');
        } finally {
            setRequestSubmitting(false);
        }
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Buenos dias';
        if (hour < 20) return 'Buenas tardes';
        return 'Buenas noches';
    };
    const workdayToneClasses = [
        'bg-[#fcf9ff] border-[#eee4fb]',
        'bg-[#f7f1ff] border-[#e8dcfb]',
        'bg-[#f2e9ff] border-[#e2d3fb]',
        'bg-[#ecdeff] border-[#dcc9fb]',
        'bg-[#e6d4ff] border-[#d6bffb]',
    ];

    const getTeamStatus = (day: Date) => {
        const dKey = toDateKey(day);
        const approvedAbsences = absenceRequests.filter((r) => {
            if (r.status !== 'approved') return false;
            const start = r.date_key;
            const end = r.end_date || r.date_key;
            return dKey >= start && dKey <= end;
        });
        const absentUserIds = new Set(approvedAbsences.map((r) => r.created_by));
        const activeNowCount = Object.values(timeData[dKey] || {}).filter((entries: any) =>
            (entries || []).some((e: any) => e.entry && !e.exit),
        ).length;
        return {
            absencesCount: absentUserIds.size,
            availableCount: Math.max(0, USERS.length - absentUserIds.size),
            activeNowCount,
        };
    };

    const todayTeam = getTeamStatus(new Date());

    const openEventListModal = (type: 'meetings' | 'absences' | 'trainings', day: Date, items: any[]) => {
        if (!items.length) return;
        setSelectedEventItem(null);
        setEventModal({
            type,
            title:
                type === 'meetings'
                    ? `Reuniones · ${toDateKey(day)}`
                    : type === 'trainings'
                        ? `Formaciones · ${toDateKey(day)}`
                        : `Ausencias/Vacaciones · ${toDateKey(day)}`,
            items,
        });
    };

    return (
        <div className="calendar-page mx-auto flex h-[calc(100vh-5rem)] max-w-7xl flex-col">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-sm">
                        <CalendarIcon size={30} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-normal text-slate-950">Calendario mensual</h1>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                            {getGreeting()}, {currentUser?.name}. Vista limpia del mes para ausencias, avisos, tareas y reuniones.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard?section=time#time-summary')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        <Clock size={16} />
                        Jornada
                    </button>
                    <button
                        type="button"
                        onClick={() => openRequestModal('absence', selectedDate || new Date())}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        <UserX size={16} />
                        Ausencia
                    </button>
                    <button
                        type="button"
                        onClick={() => openRequestModal('vacation', selectedDate || new Date())}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        <Palmtree size={16} />
                        Vacaciones
                    </button>
                    <button
                        type="button"
                        onClick={() => openRequestModal('meeting', selectedDate || new Date())}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        <Users size={16} />
                        Reunión
                    </button>
                </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-wide text-slate-500">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        <Sun size={14} />
                        Hoy: {todayTeam.absencesCount === 0 ? 'equipo completo' : `${todayTeam.absencesCount} ausencia(s)`}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        <Clock size={14} />
                        {todayTeam.activeNowCount} activo(s) ahora
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                        <span className="h-2 w-2 rounded-full bg-rose-400" />
                        Avisos
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                        <span className="h-2 w-2 rounded-full bg-violet-400" />
                        Ausencias
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        Tareas
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        Reuniones/formación
                    </span>
                </div>
            </div>

            <div className="min-h-0 flex-1 pb-4">
                <CalendarGrid
                    monthDate={monthDate}
                    selectedDate={selectedDate || new Date()}
                    onChangeMonth={setMonthDate}
                    onSelectDate={handleDateClick}
                    overrides={overrides}
                />
            </div>

            {showDayDetails && (
                <DayDetailsModal
                    date={selectedDate}
                    events={getDayEvents(selectedDate)}
                    onClose={() => setShowDayDetails(false)}
                    onToggleDayStatus={toggleDayStatus}
                />
            )}
            {selectedTask && (
                <TaskDetailModal
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                />
            )}
            {eventModal && (
                <div className="app-modal-overlay" onClick={() => {
                    setEventModal(null);
                    setSelectedEventItem(null);
                }}>
                    <div
                        className="app-modal-panel w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-100 p-4">
                            <h3 className="text-lg font-black text-gray-900">{eventModal.title}</h3>
                            <button
                                onClick={() => {
                                    setEventModal(null);
                                    setSelectedEventItem(null);
                                }}
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-3 p-4">
                            <div className="space-y-2">
                                {eventModal.items.map((item: any, idx: number) => (
                                    <button
                                        key={`${eventModal.type}-${item.id || idx}`}
                                        onClick={() => setSelectedEventItem(item)}
                                        className="w-full rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-left text-sm hover:border-violet-400"
                                    >
                                        <p className="font-bold text-violet-900">
                                            {eventModal.type === 'meetings'
                                                ? (item.title || 'Reunión')
                                                : eventModal.type === 'trainings'
                                                    ? 'Formación'
                                                    : (item.type === 'vacation' ? 'Vacaciones' : 'Ausencia')}
                                        </p>
                                        <p className="text-xs text-violet-700">
                                            {eventModal.type === 'meetings'
                                                ? (item.scheduled_date_key || item.preferred_date_key || '-')
                                                : eventModal.type === 'trainings'
                                                    ? (item.scheduled_date_key || item.requested_date_key || '-')
                                                    : `${item.date_key}${item.end_date ? ` al ${item.end_date}` : ''}`}
                                        </p>
                                        {eventModal.type === 'absences' && (
                                            <p className="text-[11px] text-violet-700">
                                                {USERS.find((u) => u.id === item.created_by)?.name || item.created_by || 'Sin persona'}
                                            </p>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {selectedEventItem && (
                                <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                                    {eventModal.type === 'meetings' && (
                                        <div className="space-y-1">
                                            <p className="font-black text-gray-900">{selectedEventItem.title || 'Reunión'}</p>
                                            <p className="text-gray-700">Fecha: {selectedEventItem.scheduled_date_key || selectedEventItem.preferred_date_key || '-'}</p>
                                            <p className="text-gray-700">
                                                Descripción:{' '}
                                                {selectedEventItem.description ? (
                                                    <LinkifiedText
                                                        as="span"
                                                        text={selectedEventItem.description}
                                                        linkClassName="underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800"
                                                    />
                                                ) : '-'}
                                            </p>
                                        </div>
                                    )}
                                    {eventModal.type === 'trainings' && (
                                        <div className="space-y-1">
                                            <p className="font-black text-gray-900">Formación</p>
                                            <p className="text-gray-700">Fecha: {selectedEventItem.scheduled_date_key || selectedEventItem.requested_date_key || '-'}</p>
                                            <p className="text-gray-700">
                                                Motivo:{' '}
                                                {selectedEventItem.reason ? (
                                                    <LinkifiedText
                                                        as="span"
                                                        text={selectedEventItem.reason}
                                                        linkClassName="underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800"
                                                    />
                                                ) : '-'}
                                            </p>
                                            <p className="text-gray-700">Estado: {selectedEventItem.status || '-'}</p>
                                        </div>
                                    )}
                                    {eventModal.type === 'absences' && (
                                        <div className="space-y-1">
                                            <p className="font-black text-gray-900">{selectedEventItem.type === 'vacation' ? 'Vacaciones' : 'Ausencia'}</p>
                                            <p className="text-gray-700">
                                                Persona: {USERS.find((u) => u.id === selectedEventItem.created_by)?.name || selectedEventItem.created_by || '-'}
                                            </p>
                                            <p className="text-gray-700">Fecha: {selectedEventItem.date_key}{selectedEventItem.end_date ? ` al ${selectedEventItem.end_date}` : ''}</p>
                                            <p className="text-gray-700">
                                                Motivo:{' '}
                                                {selectedEventItem.reason ? (
                                                    <LinkifiedText
                                                        as="span"
                                                        text={selectedEventItem.reason}
                                                        linkClassName="underline decoration-dotted underline-offset-2 text-blue-700 hover:text-blue-800"
                                                    />
                                                ) : '-'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {activeRequestModal && (
                <div className="app-modal-overlay" onClick={closeRequestModal}>
                    <div className="app-modal-panel w-full max-w-2xl bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 pb-0">
                            <h3 className="text-2xl font-black text-gray-900">
                                {activeRequestModal === 'absence' && 'Solicitar ausencia'}
                                {activeRequestModal === 'vacation' && 'Solicitar vacaciones'}
                                {activeRequestModal === 'meeting' && 'Solicitar reunión/sugerencia'}
                                {activeRequestModal === 'training' && 'Solicitar formación'}
                            </h3>
                            <button onClick={closeRequestModal} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-5">
                            {currentUser?.isAdmin && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">Persona objetivo</label>
                                    <select
                                        value={requestTargetUserId}
                                        onChange={(e) => setRequestTargetUserId(e.target.value)}
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium text-gray-900"
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
                                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium text-gray-900"
                                />
                            </div>

                            {(activeRequestModal === 'absence' || activeRequestModal === 'vacation') && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="calendar-req-is-range"
                                            checked={requestIsDateRange}
                                            onChange={(e) => setRequestIsDateRange(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300"
                                        />
                                        <label htmlFor="calendar-req-is-range" className="text-sm font-bold text-gray-900">
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
                                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium text-gray-900"
                                            />
                                        </div>
                                    )}
                                    {activeRequestModal === 'absence' && (
                                        <div>
                                            <label className="block text-sm font-bold text-gray-900 mb-2">Tipo de ausencia</label>
                                            <select
                                                value={requestAbsenceType}
                                                onChange={(e) => setRequestAbsenceType(e.target.value as 'special_permit' | 'absence')}
                                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium text-gray-900"
                                            >
                                                <option value="special_permit">Permiso especial</option>
                                                <option value="absence">Ausencia</option>
                                            </select>
                                        </div>
                                    )}
                                    {requestAbsenceType === 'special_permit' && (
                                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                            <div className="flex items-start gap-2 mb-2">
                                                <p className="text-xs text-indigo-700">
                                                    Los permisos especiales pueden requerir reponer horas.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id="calendar-req-makeup"
                                                    checked={requestMakeUpHours}
                                                    onChange={(e) => setRequestMakeUpHours(e.target.checked)}
                                                    className="w-4 h-4 text-indigo-600 border-indigo-300 rounded"
                                                />
                                                <label htmlFor="calendar-req-makeup" className="text-sm font-bold text-indigo-900">
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
                                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium text-gray-900"
                                            placeholder="Ej.: Reunión de seguimiento"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2">Motivo / Descripción</label>
                                        <textarea
                                            value={requestDescription}
                                            onChange={(e) => setRequestDescription(e.target.value)}
                                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium min-h-[90px] text-gray-900"
                                            placeholder="¿Qué quieres tratar?"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-2">Franja horaria preferida</label>
                                        <select
                                            value={requestSlot}
                                            onChange={(e) => setRequestSlot(e.target.value)}
                                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium text-gray-900"
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
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium min-h-[90px] text-gray-900"
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
                                onClick={submitRequest}
                                disabled={requestSubmitting}
                                className="px-3 py-2 rounded-xl bg-violet-700 text-white text-sm font-bold"
                            >
                                {requestSubmitting ? 'Enviando...' : 'Solicitar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CalendarPage;
