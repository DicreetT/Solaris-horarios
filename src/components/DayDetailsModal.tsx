import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, Clock, Calendar, BookOpen, CheckSquare, Users, AlertCircle, ExternalLink, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USERS, ESTEBAN_ID } from '../constants';
import MeetingDetailModal from './MeetingDetailModal';
import TaskDetailModal from './TaskDetailModal';

/**
 * Modal that shows detailed information about a specific day
 * Displays all events, tasks, meetings, absences, and time entries for that day
 * Includes quick action links to navigate to relevant pages
 */
import { useDailyStatus } from '../hooks/useDailyStatus';
import { Absence, Training, Meeting, Todo, TimeEntry, DailyStatus } from '../types';

interface DayDetailsModalProps {
    date: Date;
    events: {
        absences: Absence[];
        trainings: Training[];
        meetings: Meeting[];
        tasks: Todo[];
        timeEntry: TimeEntry | null;
        isAdmin?: boolean;
        isTrainingManager?: boolean;
    };
    onClose: () => void;
}

export default function DayDetailsModal({ date, events, onClose }: DayDetailsModalProps) {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [selectedTask, setSelectedTask] = useState<Todo | null>(null);

    // Daily Status Logic
    const { dailyStatuses, setDailyStatus } = useDailyStatus(currentUser);
    const dateKey = date ? date.toISOString().split('T')[0] : '';
    const currentStatus = dailyStatuses.find(s => s.user_id === currentUser?.id && s.date_key === dateKey);

    const onSetStatus = async (status: 'in_person' | 'remote') => {
        try {
            await setDailyStatus({ dateKey, status });
        } catch (error) {
            console.error("Error setting status:", error);
            alert("Error al actualizar el estado");
        }
    };

    if (!date || !events) return null;

    const hasAnyEvents = events.absences.length > 0 ||
        events.trainings.length > 0 ||
        events.meetings.length > 0 ||
        events.tasks.length > 0 ||
        events.timeEntry;

    const formattedDate = new Date(date).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const handleNavigate = (path: string) => {
        navigate(path);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden animate-[popIn_0.2s_ease-out] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight capitalize">
                            {formattedDate}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                        >
                            <XCircle size={24} />
                        </button>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">
                        {hasAnyEvents ? 'Detalles de actividad del día' : 'No hay eventos para este día'}
                    </p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {!hasAnyEvents ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-20 h-20 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mb-4">
                                <Calendar size={40} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Día libre</h3>
                            <p className="text-sm text-gray-500 max-w-sm">
                                No hay eventos, tareas o registros programados para este día.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Time Entry Section */}
                            {events.timeEntry && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                            <Clock size={16} className="text-green-600" />
                                            Registro Horario
                                        </h3>
                                        <button
                                            onClick={() => handleNavigate('/time-tracking')}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            Ver detalles
                                            <ExternalLink size={12} />
                                        </button>
                                    </div>
                                    <div className={`p-4 rounded-xl border ${events.timeEntry.exit
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-orange-50 border-orange-200'
                                        }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-bold text-gray-900">
                                                {events.timeEntry.entry} - {events.timeEntry.exit || '...'}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${events.timeEntry.exit
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-orange-100 text-orange-700'
                                                }`}>
                                                {events.timeEntry.exit ? 'Finalizado' : 'En curso'}
                                            </span>
                                        </div>
                                        {events.timeEntry.note && (
                                            <p className="text-xs text-gray-600 mt-2">{events.timeEntry.note}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Absences Section */}
                            {events.absences.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                            <AlertCircle size={16} className="text-purple-600" />
                                            Ausencias
                                        </h3>
                                        <button
                                            onClick={() => handleNavigate('/absences')}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            Gestionar
                                            <ExternalLink size={12} />
                                        </button>
                                    </div>
                                    {events.absences.map((absence) => {
                                        const user = USERS.find(u => u.id === absence.created_by);
                                        const isOtherUser = events.isAdmin && absence.created_by !== currentUser?.id;
                                        const isVacation = absence.type === 'vacation';
                                        const displayReason = absence.reason;

                                        return (
                                            <div key={absence.id} className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-gray-900">
                                                            {isVacation ? 'Vacaciones' : 'Ausencia'}
                                                        </span>
                                                        {isOtherUser && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                                                                <Shield size={10} />
                                                                {user?.name || 'Usuario'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${absence.status === 'approved' ? 'bg-green-100 text-green-700' :
                                                        absence.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        {absence.status === 'approved' ? 'Aprobado' :
                                                            absence.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600">{displayReason}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Trainings Section */}
                            {events.trainings.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                            <BookOpen size={16} className="text-blue-600" />
                                            Formaciones
                                        </h3>
                                        <button
                                            onClick={() => handleNavigate('/trainings')}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            Ver todas
                                            <ExternalLink size={12} />
                                        </button>
                                    </div>
                                    {events.trainings.map((training) => {
                                        const user = USERS.find(u => u.id === training.user_id);
                                        const isOtherUser = (events.isAdmin || events.isTrainingManager) && training.user_id !== currentUser?.id;
                                        const isAdminView = events.isAdmin && training.user_id !== currentUser?.id;
                                        const isTrainingManagerView = events.isTrainingManager && !events.isAdmin && training.user_id !== currentUser?.id;
                                        return (
                                            <div key={training.id} className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-gray-900">Formación</span>
                                                        {isAdminView && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                                                                <Shield size={10} />
                                                                Admin: {user?.name || 'Usuario'}
                                                            </span>
                                                        )}
                                                        {isTrainingManagerView && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1">
                                                                <Shield size={10} />
                                                                {user?.name || 'Usuario'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${training.status === 'accepted' ? 'bg-green-100 text-green-700' :
                                                        training.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                            training.status === 'rescheduled' ? 'bg-purple-100 text-purple-700' :
                                                                'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {training.status === 'accepted' ? 'Aprobado' :
                                                            training.status === 'pending' ? 'Pendiente' :
                                                                training.status === 'rescheduled' ? 'Reprogramada' :
                                                                    training.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600">
                                                    {training.status === 'pending' ? 'Solicitud pendiente de aprobación' :
                                                        training.status === 'rescheduled' ? 'Formación reprogramada' :
                                                            'Formación programada'}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Meetings Section */}
                            {events.meetings.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                            <Users size={16} className="text-indigo-600" />
                                            Reuniones
                                        </h3>
                                        <button
                                            onClick={() => handleNavigate('/meetings')}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            Ver todas
                                            <ExternalLink size={12} />
                                        </button>
                                    </div>
                                    {events.meetings.map((meeting) => {
                                        const user = USERS.find(u => u.id === meeting.created_by);
                                        const isOtherUser = events.isAdmin && meeting.created_by !== currentUser?.id;
                                        return (
                                            <div
                                                key={meeting.id}
                                                className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 cursor-pointer hover:bg-indigo-100 transition-colors"
                                                onClick={() => setSelectedMeeting(meeting)}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <span className="text-sm font-bold text-gray-900 truncate">{meeting.title}</span>
                                                        {isOtherUser && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1 shrink-0">
                                                                <Shield size={10} />
                                                                {user?.name || 'Usuario'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {meeting.scheduled_time && (
                                                        <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-full shrink-0 ml-2">
                                                            {meeting.scheduled_time}
                                                        </span>
                                                    )}
                                                </div>
                                                {meeting.description && (
                                                    <p className="text-xs text-gray-600">{meeting.description}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Tasks Section */}
                            {events.tasks.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                            <CheckSquare size={16} className="text-amber-600" />
                                            Tareas pendientes ({events.tasks.length})
                                        </h3>
                                        <button
                                            onClick={() => handleNavigate('/tasks')}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            Gestionar tareas
                                            <ExternalLink size={12} />
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {events.tasks.map((task) => {
                                            const creator = USERS.find(u => u.id === task.created_by);
                                            const isOtherUser = events.isAdmin && task.created_by !== currentUser?.id;
                                            return (
                                                <div
                                                    key={task.id}
                                                    className="p-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                                                    onClick={() => setSelectedTask(task)}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <CheckSquare size={14} className="text-amber-600 mt-0.5 shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <p className="text-sm font-bold text-gray-900 truncate">{task.title}</p>
                                                                {isOtherUser && (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1 shrink-0">
                                                                        <Shield size={10} />
                                                                        {creator?.name || 'Usuario'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {task.description && (
                                                                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
            {selectedMeeting && (
                <MeetingDetailModal
                    meeting={selectedMeeting}
                    onClose={() => setSelectedMeeting(null)}
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
