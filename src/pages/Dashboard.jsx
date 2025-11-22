import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckSquare, Calendar as CalendarIcon, Users, Clock, BookOpen, AlertCircle } from 'lucide-react';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { UserAvatar } from '../components/UserAvatar';
import { useTraining } from '../hooks/useTraining';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import { toDateKey, formatDatePretty } from '../utils/dateUtils';
import { calculateTotalHours, formatHours } from '../utils/timeUtils';

/**
 * Dashboard page
 * Home page with quick stats and recent activity
 */
function Dashboard() {
    const { currentUser } = useAuth();
    const { data: todos } = useTodos(currentUser?.id);
    const { data: meetings } = useMeetings(currentUser?.id);
    const { timeData } = useTimeData();
    const { trainingRequests } = useTraining(currentUser);

    const [todayStats, setTodayStats] = useState({
        hoursLogged: 0,
        isTrackingActive: false,
        openTodosCount: 0,
        upcomingMeetings: [],
        upcomingTrainings: []
    });

    const [dueTodayTodos, setDueTodayTodos] = useState([]);

    useEffect(() => {
        if (!currentUser) return;

        const now = new Date();
        const todayKey = toDateKey(now);

        // 1. Calculate hours logged today & tracking status
        const todayEntries = timeData[todayKey]?.[currentUser.id] || [];
        const hoursLogged = calculateTotalHours(todayEntries);
        const isTrackingActive = todayEntries.some(e => e.entry && !e.exit);

        // 2. Open Todos (Total pending)
        const openTodos = todos?.filter(t => !t.completed) || [];
        const openTodosCount = openTodos.length;

        // 3. Upcoming Meetings (Next 7 days, approved)
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcomingMeetings = meetings?.filter(m => {
            const meetingDate = new Date(m.date);
            return meetingDate >= now && meetingDate <= weekFromNow && m.status === 'approved';
        }).sort((a, b) => new Date(a.date) - new Date(b.date)) || [];

        // 4. Upcoming Trainings (Pending or Approved, future)
        const upcomingTrainings = trainingRequests?.filter(t => {
            const date = t.scheduledDateKey ? new Date(t.scheduledDateKey) : new Date(t.requestedDateKey);
            return date >= now && (t.status === 'pending' || t.status === 'approved');
        }).sort((a, b) => {
            const dateA = a.scheduledDateKey ? new Date(a.scheduledDateKey) : new Date(a.requestedDateKey);
            const dateB = b.scheduledDateKey ? new Date(b.scheduledDateKey) : new Date(b.requestedDateKey);
            return dateA - dateB;
        }) || [];

        // 5. Todos Due Today
        const dueToday = openTodos.filter(t => t.dueDate === todayKey);

        setTodayStats({
            hoursLogged,
            isTrackingActive,
            openTodosCount,
            upcomingMeetings,
            upcomingTrainings
        });

        setDueTodayTodos(dueToday);

    }, [currentUser, todos, meetings, timeData, trainingRequests]);

    return (
        <div className="max-w-6xl">
            {/* Welcome section */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <UserAvatar name={currentUser?.name} size="md" />
                    <h1 className="text-2xl font-bold">
                        ¡Hola, {currentUser?.name}! 👋
                    </h1>
                </div>
                <p className="text-black/70 font-medium">
                    {new Date().toLocaleDateString('es-ES', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}
                </p>
            </div>

            {/* Time tracker widget */}
            <div className="mb-6">
                <TimeTrackerWidget showEntries={false} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Today's Status Summary */}
                <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_#000000] p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Clock className="text-primary" />
                        Estado de hoy
                    </h2>

                    {/* Hours & Active Status */}
                    <div className="flex items-center justify-between bg-[#fafaf9] p-4 rounded-xl border border-[#e5e7eb] mb-6">
                        <div>
                            <p className="text-sm text-[#666] mb-1">Horas registradas</p>
                            <p className="text-2xl font-bold text-primary">{formatHours(todayStats.hoursLogged)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-[#666] mb-1">Estado</p>
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${todayStats.isTrackingActive
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                                }`}>
                                <div className={`w-2 h-2 rounded-full ${todayStats.isTrackingActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                                {todayStats.isTrackingActive ? 'Activo' : 'Inactivo'}
                            </div>
                        </div>
                    </div>

                    {/* Open Items List */}
                    <div className="space-y-4">
                        {/* Todos Summary */}
                        <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <CheckSquare size={18} />
                                </div>
                                <div>
                                    <p className="font-medium">Tareas pendientes</p>
                                    <p className="text-xs text-[#666]">{todayStats.openTodosCount} tareas sin completar</p>
                                </div>
                            </div>
                            <Link to="/tasks" className="text-sm font-semibold text-primary hover:underline">
                                Ver todas
                            </Link>
                        </div>

                        {/* Meetings Summary */}
                        <div className="border-t border-dashed border-gray-200 pt-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Users size={16} className="text-[#666]" />
                                <h3 className="text-sm font-semibold text-[#444]">Próximas reuniones</h3>
                            </div>
                            {todayStats.upcomingMeetings.length > 0 ? (
                                <div className="space-y-2">
                                    {todayStats.upcomingMeetings.slice(0, 3).map(m => (
                                        <div key={m.id} className="text-sm flex justify-between items-center">
                                            <span className="truncate flex-1 pr-2">{m.title}</span>
                                            <span className="text-xs text-[#666] whitespace-nowrap">
                                                {formatDatePretty(new Date(m.date))}
                                            </span>
                                        </div>
                                    ))}
                                    <Link to="/meetings" className="block text-xs text-primary hover:underline mt-1">
                                        Ver todas las reuniones →
                                    </Link>
                                </div>
                            ) : (
                                <p className="text-xs text-[#666] italic">No hay reuniones próximas.</p>
                            )}
                        </div>

                        {/* Trainings Summary */}
                        <div className="border-t border-dashed border-gray-200 pt-4">
                            <div className="flex items-center gap-2 mb-3">
                                <BookOpen size={16} className="text-[#666]" />
                                <h3 className="text-sm font-semibold text-[#444]">Formaciones pendientes</h3>
                            </div>
                            {todayStats.upcomingTrainings.length > 0 ? (
                                <div className="space-y-2">
                                    {todayStats.upcomingTrainings.slice(0, 3).map(t => (
                                        <div key={t.id} className="text-sm flex justify-between items-center">
                                            <span className="truncate flex-1 pr-2">Solicitud de formación</span>
                                            <span className="text-xs text-[#666] whitespace-nowrap">
                                                {formatDatePretty(new Date(t.scheduledDateKey || t.requestedDateKey))}
                                            </span>
                                        </div>
                                    ))}
                                    <Link to="/trainings" className="block text-xs text-primary hover:underline mt-1">
                                        Ver formaciones →
                                    </Link>
                                </div>
                            ) : (
                                <p className="text-xs text-[#666] italic">No hay formaciones pendientes.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Due Today */}
                <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_#000000] p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-600">
                        <AlertCircle size={24} />
                        Para hoy
                    </h2>

                    {dueTodayTodos.length > 0 ? (
                        <div className="space-y-3">
                            {dueTodayTodos.map(todo => (
                                <div key={todo.id} className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                                    <div className="mt-0.5">
                                        <div className="w-5 h-5 rounded border-2 border-red-300 bg-white" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{todo.text}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                                Vence hoy
                                            </span>
                                            {todo.priority === 'high' && (
                                                <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                                                    Alta prioridad
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <Link to="/tasks" className="block text-center text-sm font-semibold text-primary hover:underline mt-4">
                                Ir a Mis Tareas →
                            </Link>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <CheckSquare size={32} />
                            </div>
                            <p className="text-gray-900 font-medium">¡Todo al día!</p>
                            <p className="text-sm text-[#666]">No tienes tareas que venzan hoy.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;

