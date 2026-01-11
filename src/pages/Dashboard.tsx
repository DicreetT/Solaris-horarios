import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckSquare, Calendar as CalendarIcon, Users, Clock, BookOpen, AlertCircle, LayoutGrid, Bell } from 'lucide-react';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { UserAvatar } from '../components/UserAvatar';
import { useTraining } from '../hooks/useTraining';
import { useNotificationsContext } from '../context/NotificationsContext';
import { useDailyStatus } from '../hooks/useDailyStatus';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import DailyBriefing from '../components/DailyBriefing';
import { TeamHeartbeat } from '../components/TeamHeartbeat';
import { toDateKey, formatDatePretty } from '../utils/dateUtils';
import { calculateTotalHours, formatHours } from '../utils/timeUtils';
import { USERS } from '../constants';
import { motion } from 'framer-motion';
import { haptics } from '../utils/haptics';

/**
 * Dashboard page
 * Home page with quick stats and recent activity
 */
function Dashboard() {
    const { currentUser } = useAuth();
    const { todos } = useTodos(currentUser);
    const { meetingRequests: meetings } = useMeetings(currentUser);
    const { timeData } = useTimeData();
    const { trainingRequests } = useTraining(currentUser);
    const { notifications } = useNotificationsContext();
    const { dailyStatuses, setDailyStatus } = useDailyStatus(currentUser);

    const todayKey = toDateKey(new Date());
    const myStatusToday = dailyStatuses.find(s => s.user_id === currentUser?.id && s.date_key === todayKey);

    const [savingMood, setSavingMood] = useState<string | null>(null);

    const handleMoodSelect = async (emoji: string, label: string) => {
        if (!currentUser) return;
        setSavingMood(emoji);
        haptics.medium();
        try {
            await setDailyStatus({
                dateKey: todayKey,
                status: myStatusToday?.status || 'in_person',
                customEmoji: emoji,
                customStatus: myStatusToday?.custom_status // Preserve existing social status (e.g. 'En racha')
            });
        } finally {
            setTimeout(() => setSavingMood(null), 800); // Keep visual state for a moment
        }
    };

    const todayStats = React.useMemo(() => {
        if (!currentUser) return {
            hoursLogged: 0,
            isTrackingActive: false,
            openTodosCount: 0,
            upcomingMeetings: [],
            upcomingTrainings: []
        };

        const now = new Date();
        const todayKey = toDateKey(now);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Midnight today for comparison

        // 1. Currently Tracking
        const activeTrack = timeData[todayKey]?.[currentUser.id]?.find(entry => entry.entry && !entry.exit);
        const isTrackingActive = !!activeTrack;

        // 2. Hours Logged (today's completed time entry)
        const todayEntries = timeData[todayKey]?.[currentUser.id] || [];
        const hoursLogged = calculateTotalHours(todayEntries);

        // 3. Open Todos (assigned to current user and not completed by them)
        const openTodos = todos?.filter(
            t => t.assigned_to.includes(currentUser.id) && !t.completed_by.includes(currentUser.id)
        ) || [];
        const openTodosCount = openTodos.length;

        // 4. Upcoming Meetings (Next 7 days, approved/scheduled, INCLUDING today)
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const weekFromNowKey = toDateKey(weekFromNow);

        const upcomingMeetings = meetings?.filter(m => {
            const dateKey = m.scheduled_date_key || m.preferred_date_key;
            if (!dateKey) return false;

            // Include both 'approved' and 'scheduled' statuses
            const isValidStatus = m.status === 'scheduled';
            const isWithinRange = dateKey >= todayKey && dateKey <= weekFromNowKey;

            // Compare strings (YYYY-MM-DD) to avoid timezone issues and include today
            return isWithinRange && isValidStatus;
        }).sort((a, b) => {
            const dateA = a.scheduled_date_key || a.preferred_date_key || '';
            const dateB = b.scheduled_date_key || b.preferred_date_key || '';
            return dateA.localeCompare(dateB);
        }) || [];

        // 5. Upcoming Trainings (Pending or Approved, future, excluding today)
        const upcomingTrainings = trainingRequests?.filter(t => {
            const date = t.scheduled_date_key ? new Date(t.scheduled_date_key) : new Date(t.requested_date_key);
            return date > today && (t.status === 'pending' || t.status === 'accepted');
        }).sort((a, b) => {
            const dateA = a.scheduled_date_key ? new Date(a.scheduled_date_key) : new Date(a.requested_date_key);
            const dateB = b.scheduled_date_key ? new Date(b.scheduled_date_key) : new Date(b.requested_date_key);
            return dateA.getTime() - dateB.getTime();
        }) || [];

        return {
            hoursLogged,
            isTrackingActive,
            openTodosCount,
            upcomingMeetings,
            upcomingTrainings
        };
    }, [currentUser, todos, meetings, timeData, trainingRequests]);

    const dueTodayTodos = React.useMemo(() => {
        if (!currentUser) return [];
        const now = new Date();
        const todayKey = toDateKey(now);

        return todos?.filter(
            t => t.assigned_to.includes(currentUser.id) &&
                !t.completed_by.includes(currentUser.id) &&
                t.due_date_key === todayKey
        ) || [];
    }, [currentUser, todos]);

    // activeUsers calculation removed - moved to Layout.tsx

    return (
        <div className="max-w-6xl mx-auto pb-20 relative">
            {/* Daily Briefing Intelligence */}
            <DailyBriefing />



            {/* Mood Diary Section (Phase 6) */}
            <div className="mb-8 p-6 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-[2.5rem] border border-white shadow-sm overflow-hidden relative">
                {/* Decorative particles */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200/20 blur-[60px] rounded-full -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-200/20 blur-[60px] rounded-full -ml-16 -mb-16" />

                <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-5">
                        <motion.div
                            initial={{ scale: 0.8, rotate: -10 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="w-16 h-16 bg-white rounded-3xl shadow-xl flex items-center justify-center text-3xl shrink-0"
                        >
                            {myStatusToday?.custom_emoji || '🌈'}
                        </motion.div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 leading-tight">¿Cómo está tu clima interior hoy?</h2>
                            <p className="text-sm text-gray-500 font-medium tracking-tight">Tu equipo agradecerá saber cómo apoyarte mejor.</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3">
                        {[
                            { emoji: '✨', label: 'Protagonista', fullLabel: 'Nivel: protagonista', color: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200' },
                            { emoji: '🌸', label: 'Zen', fullLabel: 'Hoy nada me afecta', color: 'hover:bg-pink-50 hover:text-pink-700 hover:border-pink-200' },
                            { emoji: '☁️', label: 'Paciencia', fullLabel: 'Paciencia nivel experto', tooltip: 'Respira profundo y no vayas a prisión 😅', color: 'hover:bg-gray-100 hover:text-gray-700 hover:border-gray-200' },
                            { emoji: '🔥', label: 'Sin Paciencia', fullLabel: 'Modo: Sin Paciencia', color: 'hover:bg-orange-50 hover:text-orange-700 hover:border-orange-100' },
                        ].map((mood) => {
                            const isSelected = myStatusToday?.custom_emoji === mood.emoji;
                            return (
                                <motion.button
                                    key={mood.emoji}
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleMoodSelect(mood.emoji, mood.fullLabel)}
                                    title={mood.tooltip || mood.fullLabel}
                                    className={`
                                        flex flex-col items-center gap-1 px-4 py-3 border rounded-2xl shadow-sm transition-all group relative min-w-[70px]
                                        ${isSelected
                                            ? 'bg-primary text-white border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)] scale-110 z-10'
                                            : 'bg-white border-gray-100 ' + mood.color}
                                    `}
                                >
                                    <span className={`text-2xl transition-transform ${isSelected ? 'scale-125 mb-1' : 'group-hover:scale-110'}`}>{mood.emoji}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${isSelected ? 'text-white' : 'text-gray-400 group-hover:text-inherit'}`}>
                                        {mood.label}
                                    </span>
                                    {isSelected && (
                                        <>
                                            <motion.div
                                                layoutId="mood-active-glow"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: [0.2, 0.5, 0.2] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="absolute inset-0 bg-white/20 rounded-2xl blur-md pointer-events-none"
                                            />
                                            <motion.div
                                                layoutId="mood-active"
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="absolute -top-1 -right-1 w-4 h-4 bg-white text-primary rounded-full border-2 border-primary shadow-lg flex items-center justify-center overflow-hidden"
                                            >
                                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                                            </motion.div>
                                        </>
                                    )}
                                    {savingMood === mood.emoji && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, scale: 1.2 }}
                                            className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl z-20"
                                        >
                                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        </motion.div>
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Time tracker widget */}
            <div className="mb-8">
                <TimeTrackerWidget showEntries={false} />
            </div>

            {/* Notifications section */}
            <div className="mb-8 bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Bell size={24} className="text-yellow-500" />
                        Notificaciones Recientes
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Mantente al día con las últimas novedades</p>
                </div>
                <div className="p-6">
                    {(() => {
                        // Filter: only unread notifications less than 1 week old
                        const oneWeekAgo = new Date();
                        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

                        const recentUnreadNotifications = notifications?.filter(notification => {
                            const notificationDate = new Date(notification.created_at);
                            return !notification.read && notificationDate >= oneWeekAgo;
                        }) || [];

                        return recentUnreadNotifications.length > 0 ? (
                            <div className="space-y-4">
                                {recentUnreadNotifications.slice(0, 5).map(notification => ( // Show up to 5 recent notifications
                                    <div key={notification.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                        <div className="p-2 rounded-lg shrink-0 bg-blue-50 text-blue-600">
                                            <Bell size={16} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-800">{notification.message}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {formatDatePretty(new Date(notification.created_at))}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                <Link to="/notifications" className="block text-center text-sm font-bold text-blue-600 hover:text-blue-700 mt-4">
                                    Ver todas las notificaciones
                                </Link>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-400 text-sm italic">
                                No hay notificaciones recientes sin leer.
                            </div>
                        );
                    })()}
                </div>
            </div >

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Today's Status Summary */}
                <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden flex flex-col h-full">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    Estado de hoy
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">Resumen de tu actividad diaria</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 flex-1 flex flex-col gap-6">
                        {/* Hours & Active Status */}
                        <div className="flex items-center justify-between bg-gray-50 p-5 rounded-2xl border border-gray-100">
                            <div>
                                <p className="text-sm text-gray-500 font-medium mb-1">Horas registradas</p>
                                <p className="text-3xl font-black text-gray-900">{formatHours(todayStats.hoursLogged)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500 font-medium mb-1">Estado</p>
                                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${todayStats.isTrackingActive
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                    }`}>
                                    <div className={`w-2.5 h-2.5 rounded-full ${todayStats.isTrackingActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                                    {todayStats.isTrackingActive ? 'Activo' : 'Inactivo'}
                                </div>
                            </div>
                        </div>

                        {/* Open Items List */}
                        <div className="space-y-4">
                            {/* Todos Summary */}
                            <Link to="/tasks" className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                                        <CheckSquare size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900">Tareas pendientes</p>
                                        <p className="text-sm text-gray-500">{todayStats.openTodosCount} tareas sin completar</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                    →
                                </div>
                            </Link>

                            {/* Meetings Summary */}
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-gray-100"></div>
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-white px-2 text-xs text-gray-400 font-medium uppercase tracking-wider">Reuniones</span>
                                </div>
                            </div>

                            {todayStats.upcomingMeetings.length > 0 ? (
                                <div className="space-y-2">
                                    {todayStats.upcomingMeetings.slice(0, 3).map(m => (
                                        <div key={m.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                                                    <Users size={16} />
                                                </div>
                                                <span className="font-medium text-gray-700 truncate">{m.title}</span>
                                            </div>
                                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap ml-2">
                                                {formatDatePretty(new Date(m.scheduled_date_key || m.preferred_date_key))}
                                            </span>
                                        </div>
                                    ))}
                                    <Link to="/meetings" className="block text-center text-sm font-bold text-indigo-600 hover:text-indigo-700 mt-2">
                                        Ver todas las reuniones
                                    </Link>
                                </div>
                            ) : (
                                <div className="text-center py-4 text-gray-400 text-sm italic">
                                    No hay reuniones próximas
                                </div>
                            )}

                            {/* Trainings Summary */}
                            <div className="relative mt-4">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-gray-100"></div>
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-white px-2 text-xs text-gray-400 font-medium uppercase tracking-wider">Formaciones</span>
                                </div>
                            </div>

                            {todayStats.upcomingTrainings.length > 0 ? (
                                <div className="space-y-2">
                                    {todayStats.upcomingTrainings.slice(0, 3).map(t => (
                                        <div key={t.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg shrink-0">
                                                    <BookOpen size={16} />
                                                </div>
                                                <span className="font-medium text-gray-700 truncate">Solicitud de formación</span>
                                            </div>
                                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap ml-2">
                                                {formatDatePretty(new Date(t.scheduled_date_key || t.requested_date_key))}
                                            </span>
                                        </div>
                                    ))}
                                    <Link to="/trainings" className="block text-center text-sm font-bold text-purple-600 hover:text-purple-700 mt-2">
                                        Ver formaciones
                                    </Link>
                                </div>
                            ) : (
                                <div className="text-center py-4 text-gray-400 text-sm italic">
                                    No hay formaciones pendientes
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Absences & Due Today */}
                <div className="flex flex-col gap-8 h-full">
                    {/* Absences Card (Team Pulse) */}
                    <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden flex flex-col relative z-20">
                        <div className="p-4 border-b border-gray-100 bg-orange-50/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        Pulso del Equipo
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1">Cómo se siente el equipo hoy</p>
                                </div>
                            </div>


                        </div>
                        <div className="p-4">
                            {(() => {
                                const todayKey = toDateKey(new Date());
                                const { absenceRequests } = useAbsences(currentUser);
                                const { dailyStatuses } = useDailyStatus(currentUser);

                                // Show EVERYONE from the USERS constant for a true collective board
                                const teamItems = USERS.map(user => {
                                    const userId = user.id;
                                    const absence = absenceRequests.find(a => {
                                        if (a.status !== 'approved') return false;
                                        const start = a.date_key;
                                        const end = a.end_date || a.date_key;
                                        return a.created_by === userId && todayKey >= start && todayKey <= end;
                                    });
                                    const statusRow = dailyStatuses.find(s => s.user_id === userId && s.date_key === todayKey);

                                    // Check if user is actively clocked in right now
                                    const todayData = timeData[todayKey] || {};
                                    const userEntries = todayData[userId] || [];
                                    const isActive = userEntries.some(e => e.entry && !e.exit);

                                    let label = '';
                                    let style = '';

                                    if (absence) {
                                        if (absence.type === 'vacation') {
                                            label = 'Vacaciones';
                                            style = 'bg-purple-100 text-purple-700 border-purple-200';
                                        } else {
                                            label = 'Ausencia';
                                            style = 'bg-amber-100 text-amber-700 border-amber-200';
                                        }
                                    } else if (statusRow?.status === 'remote') {
                                        label = 'Remoto';
                                        style = 'bg-blue-50 text-blue-700 border-blue-100';
                                    } else if (isActive) {
                                        label = 'Activo';
                                        style = 'bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse';
                                    } else {
                                        label = 'Desconectado';
                                        style = 'bg-gray-50 text-gray-400 border-gray-100 opacity-60';
                                    }

                                    return { userId, user, label, style, statusRow, isActive };
                                }).sort((a, b) => {
                                    // Sort by active/status visibility
                                    if (a.isActive && !b.isActive) return -1;
                                    if (!a.isActive && b.isActive) return 1;
                                    return a.user.name.localeCompare(b.user.name);
                                });

                                return (
                                    <div className="space-y-2">
                                        {teamItems.length > 0 ? (
                                            teamItems.map((item: any) => {
                                                const moodColors: Record<string, string> = {
                                                    '☀️': 'from-yellow-50 to-orange-50 border-yellow-100',
                                                    '⛅': 'from-blue-50 to-indigo-50 border-blue-100',
                                                    '☁️': 'from-gray-50 to-slate-100 border-gray-200',
                                                    '🌧️': 'from-indigo-50 to-blue-100 border-indigo-200',
                                                    '⚡': 'from-purple-50 to-fuchsia-100 border-purple-200'
                                                };
                                                const isRestricted = item.statusRow?.custom_status?.toLowerCase().includes('comiendo') ||
                                                    item.statusRow?.custom_status?.toLowerCase().includes('ocupado') ||
                                                    item.statusRow?.custom_status?.toLowerCase().includes('concentrado');

                                                const bgStyle = isRestricted
                                                    ? 'from-red-50 to-orange-50 border-red-200 ring-2 ring-red-100 ring-offset-2'
                                                    : item.statusRow?.custom_emoji ? moodColors[item.statusRow.custom_emoji] : 'from-gray-50 to-white border-gray-100';

                                                return (
                                                    <motion.div
                                                        key={item.userId}
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: item.isActive || item.statusRow ? 1 : 0.6, x: 0 }}
                                                        whileHover={{ scale: 1.02, x: 4 }}
                                                        className={`flex items-center gap-4 p-4 rounded-[2rem] bg-gradient-to-br border shadow-sm transition-all ${bgStyle} relative overflow-hidden`}
                                                    >
                                                        {isRestricted && (
                                                            <div className="absolute top-0 right-0 p-2 opacity-10">
                                                                <AlertCircle size={48} className="text-red-500" />
                                                            </div>
                                                        )}
                                                        <div className="relative">
                                                            <UserAvatar name={item.user.name} size="md" />
                                                            {item.isActive && (
                                                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center">
                                                                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                                                                </div>
                                                            )}
                                                            {item.statusRow?.custom_emoji && (
                                                                <motion.span
                                                                    animate={{ y: [0, -4, 0] }}
                                                                    transition={{ repeat: Infinity, duration: 2 }}
                                                                    className="absolute -top-3 -right-3 text-2xl drop-shadow-md"
                                                                >
                                                                    {item.statusRow.custom_emoji}
                                                                </motion.span>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <p className={`font-black tracking-tight leading-tight ${item.isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                                                                    {item.user.name}
                                                                </p>
                                                                {isRestricted && (
                                                                    <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${item.style} shadow-sm`}>
                                                                    {item.label}
                                                                </span>
                                                                {item.statusRow?.custom_status && (
                                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${isRestricted ? 'bg-red-100/50 text-red-700 border-red-200' : 'bg-white/50 text-gray-600 border-white/50'}`}>
                                                                        "{item.statusRow.custom_status}"
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center py-10 text-gray-400 text-sm italic">
                                                <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-gray-200">
                                                    <Users size={32} />
                                                </div>
                                                Nadie ha compartido su estado hoy todavía.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Due Today Card */}
                    <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden flex flex-col flex-1">
                        <div className="p-6 border-b border-gray-100 bg-red-50/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        Para hoy
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">Tareas que vencen hoy</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 flex-1">
                            {dueTodayTodos.length > 0 ? (
                                <div className="space-y-3">
                                    {dueTodayTodos.map(todo => (
                                        <div key={todo.id} className="flex items-start gap-4 p-4 bg-white border border-red-100 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                                            <div className="mt-1">
                                                <div className="w-6 h-6 rounded-full border-2 border-red-200 bg-red-50 flex items-center justify-center group-hover:border-red-400 transition-colors">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-900 mb-1 truncate">{todo.title}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
                                                        VENCE HOY
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <Link to="/tasks" className="block text-center w-full py-3 mt-6 bg-gray-50 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-colors">
                                        Ir a Mis Tareas
                                    </Link>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                                    <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-6">
                                        <CheckSquare size={40} />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-900 mb-2">¡Todo al día!</h3>
                                    <p className="text-gray-500 max-w-xs mx-auto">
                                        No tienes tareas que venzan hoy. ¡Disfruta de tu día! 🌟
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
