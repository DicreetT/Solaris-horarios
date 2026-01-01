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
import { toDateKey, formatDatePretty } from '../utils/dateUtils';
import { calculateTotalHours, formatHours } from '../utils/timeUtils';
import { USERS } from '../constants';

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

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Welcome section */}
            <div className="mb-8">
                <div className="flex items-center gap-4 mb-2">
                    <UserAvatar name={currentUser?.name} size="lg" />
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            ¡Hola, {currentUser?.name}! 👋
                        </h1>
                        <p className="text-gray-500 font-medium text-lg">
                            {new Date().toLocaleDateString('es-ES', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
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
            </div>

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
                    {/* Absences Card */}
                    <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-gray-100 bg-orange-50/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        Equipo ausente hoy
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">Personas que no están disponibles hoy</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6">
                            {(() => {
                                const todayKey = toDateKey(new Date());
                                const { absenceRequests } = useAbsences(currentUser);
                                const { dailyStatuses } = useDailyStatus(currentUser);

                                // 1. Absences filter (with range support)
                                const todaysAbsences = absenceRequests?.filter(r => {
                                    if (r.status !== 'approved') return false;
                                    const start = r.date_key;
                                    const end = r.end_date || r.date_key;
                                    return todayKey >= start && todayKey <= end;
                                }) || [];

                                // 2. Daily Status filter (Remote/Not in person)
                                const todaysRemote = dailyStatuses?.filter(s =>
                                    s.date_key === todayKey && s.status === 'remote'
                                ) || [];

                                // Combine and unique by user ID
                                const absentUserIds = new Set([
                                    ...todaysAbsences.map(a => a.created_by),
                                    ...todaysRemote.map(s => s.user_id)
                                ]);

                                const absentItems = Array.from(absentUserIds).map(userId => {
                                    const user = USERS.find(u => u.id === userId);
                                    if (!user) return null;

                                    // Determine reason/label
                                    const absence = todaysAbsences.find(a => a.created_by === userId);
                                    const remote = todaysRemote.find(s => s.user_id === userId);

                                    let label = 'Ausente';
                                    let style = 'bg-amber-100 text-amber-700 border-amber-200';

                                    if (absence) {
                                        if (absence.type === 'vacation') {
                                            label = 'Vacaciones';
                                            style = 'bg-purple-100 text-purple-700 border-purple-200';
                                        } else {
                                            label = 'Ausencia / Baja';
                                        }
                                    } else if (remote) {
                                        label = 'No Presencial';
                                        style = 'bg-gray-100 text-gray-700 border-gray-200';
                                    }

                                    return { userId, user, label, style };
                                }).filter(Boolean); // Filter out nulls from missing users

                                return absentItems.length > 0 ? (
                                    <div className="space-y-3">
                                        {absentItems.map((item: any) => (
                                            <div key={item.userId} className="flex items-center gap-4 p-3 rounded-xl bg-orange-50/30 border border-orange-100">
                                                <UserAvatar name={item.user.name} size="md" />
                                                <div>
                                                    <p className="font-bold text-gray-900">{item.user.name}</p>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${item.style}`}>
                                                        {item.label}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-gray-400 text-sm italic">
                                        <div className="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Users size={24} />
                                        </div>
                                        Todo el equipo está disponible hoy.
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
