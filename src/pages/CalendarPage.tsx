import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DayDetailsModal from '../components/DayDetailsModal';
import TaskDetailModal from '../components/TaskDetailModal';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useAbsences } from '../hooks/useAbsences';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { toDateKey } from '../utils/dateUtils';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, UserX, Palmtree, Users, GraduationCap, Lock, Sun, AlertCircle, CheckSquare } from 'lucide-react';
import { useCalendarOverrides } from '../hooks/useCalendarOverrides';
import { USERS } from '../constants';
import { Todo } from '../types';

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
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [showDayDetails, setShowDayDetails] = useState(false);
    const [expandedTasksByDay, setExpandedTasksByDay] = useState<Record<string, boolean>>({});
    const [selectedTask, setSelectedTask] = useState<Todo | null>(null);
    const weekEnd = addDays(weekStart, 6);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart],
    );
    const workDays = weekDays.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
    const nonWorkDays = weekDays.filter((d) => d.getDay() === 0 || d.getDay() === 6);
    const todayKey = toDateKey(new Date());

    const { timeData } = useTimeData({
        from: weekStart,
        to: weekEnd,
    });
    const { trainingRequests } = useTraining(currentUser);
    const { absenceRequests } = useAbsences(currentUser);
    const { todos } = useTodos(currentUser);
    const { meetingRequests } = useMeetings(currentUser);
    const { overrides, toggleDayStatus } = useCalendarOverrides();
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

    const openQuickAction = (path: string, date: Date, extra: Record<string, string> = {}) => {
        const params = new URLSearchParams({
            date: toDateKey(date),
            open: '1',
            ...extra,
        });
        navigate(`${path}?${params.toString()}`);
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

    return (
        <div className="max-w-7xl mx-auto h-[calc(100vh-5rem)] flex flex-col">
            <div className="mb-6 flex items-center gap-4">
                <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-primary">
                    <CalendarIcon size={32} />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                        Calendario Semanal
                    </h1>
                    <p className="text-gray-500 font-medium">
                        {getGreeting()}, {currentUser?.name}. Centro diario de trabajo con enfoque operativo.
                    </p>
                </div>
            </div>

            <div className="mb-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="inline-flex items-center gap-2 font-bold text-sky-900">
                        <Sun size={16} />
                        Estado de hoy
                    </span>
                    {todayTeam.absencesCount === 0 ? (
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                            Equipo completo
                        </span>
                    ) : (
                        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">
                            {todayTeam.absencesCount} ausencia(s) hoy
                        </span>
                    )}
                    <span className="px-3 py-1 rounded-full bg-white/80 border border-sky-200 text-sky-800 font-semibold">
                        {todayTeam.activeNowCount} activos ahora
                    </span>
                </div>
            </div>

            <div className="mb-4 bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <button
                    onClick={() => setWeekStart(prev => addDays(prev, -7))}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                    <ChevronLeft size={18} />
                </button>
                <p className="font-bold text-gray-800 text-sm md:text-base">
                    {weekStart.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - {weekEnd.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                <button
                    onClick={() => setWeekStart(prev => addDays(prev, 7))}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pb-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4">
                    {workDays.map((day, index) => {
                        const dayKey = toDateKey(day);
                        const events = getDayEvents(day);
                        const team = getTeamStatus(day);
                        const override = overrides.find((o) => o.date_key === dayKey);
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        const isNonWorking = override ? override.is_non_working : isWeekend;
                        const isToday = dayKey === todayKey;
                        const isPast = dayKey < todayKey;
                        const isFuture = dayKey > todayKey;
                        const dayTaskCount = events?.tasks.length || 0;
                        const dayTaskTotal = events?.allTasks.length || 0;
                        const meetingsCount = events?.meetings.length || 0;
                        const trainingsCount = events?.trainings.length || 0;
                        const vacationsCount = (events?.absences || []).filter((a) => a.type === 'vacation').length;
                        const absencesCount = (events?.absences || []).filter((a) => a.type !== 'vacation').length;
                        const toneClass = workdayToneClasses[Math.min(index, workdayToneClasses.length - 1)];
                        return (
                            <div
                                key={dayKey}
                                className={`
                                    rounded-3xl border p-4 shadow-sm flex flex-col gap-4 min-h-[340px] transition-all
                                    ${isToday ? 'border-primary/60 ring-2 ring-primary/25 bg-white' : toneClass}
                                    ${isPast ? 'opacity-70 saturate-75' : ''}
                                    ${isFuture ? 'opacity-90' : ''}
                                `}
                            >
                                <button
                                    onClick={() => handleDateClick(day)}
                                    className="text-left"
                                >
                                    <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">
                                        {day.toLocaleDateString('es-ES', { weekday: 'short' })}
                                    </p>
                                    <p className={`text-3xl font-black ${isToday ? 'text-primary' : 'text-gray-900'}`}>
                                        {day.toLocaleDateString('es-ES', { day: '2-digit' })}
                                    </p>
                                    {isToday && (
                                        <p className="text-xs font-bold text-primary uppercase tracking-widest mt-1">Hoy</p>
                                    )}
                                </button>

                                {currentUser?.isAdmin && (
                                    <div className="self-start flex items-center gap-1.5">
                                        <button
                                            disabled={!!togglingDays[dayKey]}
                                            onClick={async () => {
                                                setTogglingDays((prev) => ({ ...prev, [dayKey]: true }));
                                                try {
                                                    await toggleDayStatus(day, false);
                                                } finally {
                                                    setTogglingDays((prev) => ({ ...prev, [dayKey]: false }));
                                                }
                                            }}
                                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                                !isNonWorking
                                                    ? 'bg-amber-100 border-amber-300 text-amber-800'
                                                    : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50'
                                            }`}
                                        >
                                            Laborable
                                        </button>
                                        <button
                                            disabled={!!togglingDays[dayKey]}
                                            onClick={async () => {
                                                setTogglingDays((prev) => ({ ...prev, [dayKey]: true }));
                                                try {
                                                    await toggleDayStatus(day, true);
                                                } finally {
                                                    setTogglingDays((prev) => ({ ...prev, [dayKey]: false }));
                                                }
                                            }}
                                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                                isNonWorking
                                                    ? 'bg-red-100 border-red-200 text-red-700'
                                                    : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                                            }`}
                                        >
                                            No laborable
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-2 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (dayTaskCount === 0) return;
                                            setExpandedTasksByDay((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
                                        }}
                                        className={`rounded-xl border p-2 text-left transition-all ${
                                            dayTaskCount > 0
                                                ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                                                : dayTaskTotal === 0
                                                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                                    : (isPast || isToday)
                                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                                        : 'bg-amber-50/70 border-amber-200 text-amber-700 hover:bg-amber-100'
                                        }`}
                                    >
                                        <p className="font-bold inline-flex items-center gap-1">
                                            <CheckSquare size={12} />
                                            Tareas
                                        </p>
                                        <p className="mt-1 font-semibold">
                                            {dayTaskCount > 0
                                                ? `${dayTaskCount} pendiente(s)`
                                                : dayTaskTotal === 0
                                                    ? 'No hay tareas'
                                                    : (isPast || isToday)
                                                        ? 'Todo al día'
                                                        : 'Tareas programadas'}
                                        </p>
                                        {dayTaskCount > 0 && (
                                            <p className="mt-1 text-[11px] font-bold underline">
                                                {expandedTasksByDay[dayKey] ? 'Ocultar detalle' : 'Ver tareas pendientes'}
                                            </p>
                                        )}
                                    </button>
                                    {dayTaskCount > 0 && expandedTasksByDay[dayKey] && (
                                        <div className="rounded-xl border border-amber-200 bg-white p-2 space-y-1">
                                            {events?.tasks.slice(0, 4).map((task) => (
                                                <button
                                                    key={task.id}
                                                    onClick={() => setSelectedTask(task)}
                                                    className="w-full text-left text-[11px] font-semibold text-amber-900 hover:underline"
                                                >
                                                    • {task.title}
                                                </button>
                                            ))}
                                            {dayTaskCount > 4 && (
                                                <button
                                                    onClick={() => navigate('/tasks')}
                                                    className="text-[11px] font-bold text-amber-800 underline"
                                                >
                                                    Ver todas en tareas
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {meetingsCount > 0 && (
                                        <button
                                            onClick={() => openQuickAction('/meetings', day)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                                        >
                                            <Users size={12} />
                                            Reunion {meetingsCount}
                                        </button>
                                    )}
                                    {trainingsCount > 0 && (
                                        <button
                                            onClick={() => openQuickAction('/trainings', day)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                                        >
                                            <GraduationCap size={12} />
                                            Formacion {trainingsCount}
                                        </button>
                                    )}
                                    {vacationsCount > 0 && (
                                        <button
                                            onClick={() => openQuickAction('/absences', day, { type: 'vacation' })}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                        >
                                            <Palmtree size={12} />
                                            Vacaciones {vacationsCount}
                                        </button>
                                    )}
                                    {absencesCount > 0 && (
                                        <button
                                            onClick={() => openQuickAction('/absences', day, { type: 'absence' })}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                                        >
                                            <AlertCircle size={12} />
                                            Ausencias {absencesCount}
                                        </button>
                                    )}
                                </div>

                                <div className="text-xs">
                                    {team.absencesCount === 0 ? (
                                        <p className="inline-flex px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold">Equipo completo</p>
                                    ) : (
                                        <p className="inline-flex px-2 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold">
                                            {team.absencesCount} ausencia(s)
                                        </p>
                                    )}
                                </div>

                                <div className="mt-auto space-y-2">
                                    <button
                                        onClick={() => openQuickAction('/time-tracking', day)}
                                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-sm font-black bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border border-indigo-200 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                    >
                                        <Clock size={16} />
                                        Fichar Jornada
                                    </button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => openQuickAction('/absences', day, { type: 'absence' })}
                                            className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                        >
                                            <UserX size={12} />
                                            Solicitar Ausencia
                                        </button>
                                        <button
                                            onClick={() => openQuickAction('/absences', day, { type: 'vacation' })}
                                            className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                        >
                                            <Palmtree size={12} />
                                            Solicitar Vacaciones
                                        </button>
                                        <button
                                            onClick={() => openQuickAction('/meetings', day)}
                                            className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                        >
                                            <Users size={12} />
                                            Solicitar Reunion
                                        </button>
                                        <button
                                            onClick={() => openQuickAction('/trainings', day)}
                                            className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                        >
                                            <GraduationCap size={12} />
                                            Solicitar Formacion
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {nonWorkDays.map((day) => {
                        const dayKey = toDateKey(day);
                        const isToday = dayKey === todayKey;
                        return (
                            <div
                                key={dayKey}
                                className={`rounded-xl border bg-gray-50 p-2.5 flex items-center justify-between ${isToday ? 'border-primary/40' : 'border-gray-200'} opacity-80`}
                            >
                                <div>
                                    <p className="text-xs uppercase tracking-wider font-bold text-gray-500">
                                        {day.toLocaleDateString('es-ES', { weekday: 'long' })}
                                    </p>
                                    <p className="text-base font-black text-gray-700">
                                        {day.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                    </p>
                                    <p className="text-xs text-gray-500 font-medium">Dia no laboral</p>
                                </div>
                                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-200 text-gray-600 text-xs font-bold">
                                    <Lock size={12} />
                                    Bloqueado
                                </div>
                            </div>
                        );
                    })}
                </div>
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
        </div>
    );
}

export default CalendarPage;
