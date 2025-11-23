import React from 'react';
import { useNavigate } from 'react-router-dom';
import { toDateKey } from '../utils/dateUtils';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon, BookOpen, AlertCircle, ExternalLink, CheckSquare, Users } from 'lucide-react';

/**
 * Calendario mensual rediseñado
 * - Ocupa todo el alto disponible
 * - Muestra badges en lugar de puntos
 * - Tooltip con detalles al hacer hover
 */
export default function CalendarGrid({
    monthDate,
    selectedDate,
    onChangeMonth,
    onSelectDate,
    isAdminView,
}: {
    monthDate: Date;
    selectedDate: Date;
    onChangeMonth: (date: Date) => void;
    onSelectDate: (date: Date) => void;
    isAdminView?: boolean;
}) {
    const { currentUser } = useAuth();
    const { timeData } = useTimeData();
    const { trainingRequests } = useTraining(currentUser);
    const { absenceRequests } = useAbsences(currentUser);
    const { todos } = useTodos(currentUser);
    const { meetingRequests } = useMeetings(currentUser);
    const navigate = useNavigate();

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Lunes=0

    const monthName = monthDate.toLocaleString("es-ES", { month: "long" });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const handlePrevMonth = () => onChangeMonth(new Date(year, month - 1, 1));
    const handleNextMonth = () => onChangeMonth(new Date(year, month + 1, 1));

    // Generar array de días con relleno inicial
    const daysArray = Array(startDayOfWeek).fill(null);
    for (let i = 1; i <= daysInMonth; i++) {
        daysArray.push(new Date(year, month, i));
    }

    // Relleno final para completar la cuadrícula (opcional, para que quede cuadrado)
    const remainingCells = 42 - daysArray.length; // 6 filas * 7 columnas
    for (let i = 0; i < remainingCells; i++) {
        daysArray.push(null);
    }

    return (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xl h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50 shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-black text-gray-900 capitalize tracking-tight flex items-center gap-2">
                        {capitalizedMonth}
                        <span className="text-gray-400 font-medium text-xl">{year}</span>
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        className="w-10 h-10 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 flex items-center justify-center transition-all shadow-sm"
                        onClick={handlePrevMonth}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        className="w-10 h-10 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 flex items-center justify-center transition-all shadow-sm"
                        onClick={handleNextMonth}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 border-b border-gray-100 bg-white shrink-0">
                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d) => (
                    <div key={d} className="py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {d.substring(0, 3)}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0 bg-gray-50/30">
                {daysArray.map((d, idx) => {
                    if (!d) return <div key={idx} className="bg-gray-50/30 border-b border-r border-gray-100" />;

                    const dKey = toDateKey(d);
                    const isSelected = selectedDate && toDateKey(selectedDate) === dKey;
                    const isToday = toDateKey(new Date()) === dKey;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                    // --- DATA GATHERING ---
                    const dayData = timeData[dKey] || {};
                    let myRecord = null;

                    if (isAdminView) {
                        // En vista admin, podríamos mostrar resumen global
                    } else if (currentUser) {
                        myRecord = dayData[currentUser.id]?.[0];
                    }

                    // Absences (Vacations / Special Permissions)
                    const myAbsence = absenceRequests.find(
                        r => r.date_key === dKey &&
                            r.created_by === currentUser?.id &&
                            r.status !== 'rejected'
                    );

                    // Trainings (including rescheduled)
                    const myTraining = trainingRequests.find(
                        r => (r.scheduled_date_key === dKey || (!r.scheduled_date_key && r.requested_date_key === dKey)) &&
                            r.user_id === currentUser?.id &&
                            r.status !== 'rejected'
                    );

                    // Tasks (Todos) - Due Date
                    const myTasks = todos.filter(
                        t => t.due_date_key === dKey && !t.completed_by.includes(currentUser?.id)
                    );

                    // Meetings - Scheduled Date
                    const myMeetings = meetingRequests.filter(
                        m => m.scheduled_date_key === dKey && m.status === 'approved'
                    );

                    // Determine badges to show
                    const badges = [];

                    // 1. Absence / Vacation
                    if (myAbsence) {
                        // Infer type from reason or default to absence since DB doesn't have type
                        const isVacation = myAbsence.reason?.includes('[Vacaciones]') || myAbsence.reason?.toLowerCase().includes('vacaciones');
                        badges.push({
                            type: isVacation ? 'vacation' : 'absence',
                            label: isVacation ? 'Vacaciones' : 'Ausencia',
                            color: 'bg-purple-50 text-purple-700 border-purple-100',
                            icon: <CalendarIcon size={10} />,
                            detail: myAbsence.reason,
                            link: '/absences'
                        });
                    } else if (myRecord?.status === 'vacation') {
                        badges.push({
                            type: 'vacation',
                            label: 'Vacaciones',
                            color: 'bg-purple-50 text-purple-700 border-purple-100',
                            icon: <CalendarIcon size={10} />,
                            detail: 'Vacaciones registradas',
                            link: '/absences'
                        });
                    } else if (myRecord?.status === 'absent') {
                        badges.push({
                            type: 'absence',
                            label: 'Ausente',
                            color: 'bg-red-50 text-red-700 border-red-100',
                            icon: <AlertCircle size={10} />,
                            detail: 'Ausencia registrada',
                            link: '/absences'
                        });
                    }

                    // 2. Training
                    if (myTraining) {
                        badges.push({
                            type: 'training',
                            label: 'Formación',
                            color: 'bg-blue-50 text-blue-700 border-blue-100',
                            icon: <BookOpen size={10} />,
                            detail: myTraining.comments?.[0]?.text || 'Entrenamiento',
                            link: '/trainings'
                        });
                    }

                    // 3. Meetings
                    myMeetings.forEach(meeting => {
                        badges.push({
                            type: 'meeting',
                            label: meeting.scheduled_time ? `${meeting.scheduled_time} Reunión` : 'Reunión',
                            color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
                            icon: <Users size={10} />,
                            detail: meeting.title,
                            link: '/meetings'
                        });
                    });

                    // 4. Tasks
                    if (myTasks.length > 0) {
                        badges.push({
                            type: 'task',
                            label: `${myTasks.length} Tarea${myTasks.length > 1 ? 's' : ''}`,
                            color: 'bg-amber-50 text-amber-700 border-amber-100',
                            icon: <CheckSquare size={10} />,
                            detail: myTasks.map(t => t.title).join(', '),
                            link: '/tasks'
                        });
                    }

                    // 5. Work Entry
                    if (myRecord?.entry) {
                        const exit = myRecord.exit;
                        badges.push({
                            type: 'work',
                            label: exit ? `${myRecord.entry} - ${exit}` : `${myRecord.entry} - ...`,
                            color: exit ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100',
                            icon: <Clock size={10} />,
                            detail: myRecord.note || (exit ? 'Jornada finalizada' : 'Jornada en curso'),
                            link: '/time-tracking'
                        });
                    }

                    return (
                        <div
                            key={dKey}
                            onClick={() => onSelectDate(d)}
                            className={`
                                group relative flex flex-col p-2 border-b border-r border-gray-100 transition-all cursor-pointer overflow-hidden
                                ${isSelected
                                    ? "bg-primary/5 shadow-inner"
                                    : "bg-white hover:bg-gray-50"
                                }
                                ${isToday && !isSelected ? "bg-blue-50/30" : ""}
                            `}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`
                                    text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-colors
                                    ${isToday
                                        ? "bg-primary text-white shadow-md shadow-primary/30"
                                        : isSelected
                                            ? "text-primary bg-primary/10"
                                            : isWeekend
                                                ? "text-red-400"
                                                : "text-gray-700"
                                    }
                                `}>
                                    {d.getDate()}
                                </span>
                            </div>

                            {/* Badges Container */}
                            <div className="flex flex-col gap-1 overflow-y-auto no-scrollbar flex-1">
                                {badges.map((badge, i) => (
                                    <div
                                        key={i}
                                        className={`
                                            flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold truncate
                                            ${badge.color}
                                        `}
                                    >
                                        <span className="shrink-0 opacity-70">{badge.icon}</span>
                                        <span className="truncate flex-1">{badge.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
