import React from 'react';
import { useNavigate } from 'react-router-dom';
import { toDateKey } from '../utils/dateUtils';
import { USERS, ESTEBAN_ID } from '../constants';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useDailyStatus } from '../hooks/useDailyStatus';
import { ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon, BookOpen, AlertCircle, CheckSquare, Users, XCircle, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarOverride } from '../hooks/useCalendarOverrides';
import { useCalendarEvents } from '../hooks/useCalendarEvents';

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
    overrides = []
}: {
    monthDate: Date;
    selectedDate: Date;
    onChangeMonth: (date: Date) => void;
    onSelectDate: (date: Date) => void;
    overrides?: CalendarOverride[];
}) {
    const { currentUser } = useAuth();
    const isAdminView = currentUser?.isAdmin;
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const { timeData } = useTimeData({
        from: monthStart,
        to: monthEnd,
    });
    const { trainingRequests } = useTraining(currentUser);
    const { absenceRequests } = useAbsences(currentUser);
    const { todos } = useTodos(currentUser);
    const { meetingRequests } = useMeetings(currentUser);
    const { dailyStatuses } = useDailyStatus(currentUser);
    const { calendarEvents } = useCalendarEvents();
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
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xl h-full flex flex-col overflow-hidden ring-1 ring-gray-100">
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
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 shrink-0">
                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d) => (
                    <div key={d} className="py-4 text-center text-xs font-black text-gray-500 uppercase tracking-widest">
                        {d.substring(0, 3)}
                    </div>
                ))}
            </div>

            {/* Calendar Grid Container with Transitions */}
            <div className="flex-1 relative overflow-hidden bg-gray-50/30">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={monthDate.toISOString()}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="grid grid-cols-7 auto-rows-fr h-full bg-gray-200/50 gap-px overflow-y-auto no-scrollbar"
                    >
                        {daysArray.map((d, idx) => {
                            if (!d) return <div key={idx} className="bg-gray-50/30 aspect-square" />;

                            const dKey = toDateKey(d);
                            const isSelected = selectedDate && toDateKey(selectedDate) === dKey;
                            const isToday = toDateKey(new Date()) === dKey;
                            const isOriginalWeekend = d.getDay() === 0 || d.getDay() === 6;

                            const override = overrides.find(o => o.date_key === dKey);
                            const isNonWorking = override ? override.is_non_working : isOriginalWeekend;
                            const isClickable = isAdminView || !isNonWorking;

                            const dayEvents = calendarEvents.filter(e => e.date_key === dKey);
                            const dayData = timeData[dKey] || {};
                            let workEntries: { userId: string; record: any }[] = [];

                            if (isAdminView) {
                                Object.entries(dayData).forEach(([userId, records]) => {
                                    if (records && records.length > 0) {
                                        workEntries.push({ userId, record: records[0] });
                                    }
                                });
                            } else if (currentUser) {
                                const myRecord = dayData[currentUser.id]?.[0];
                                if (myRecord) {
                                    workEntries.push({ userId: currentUser.id, record: myRecord });
                                }
                            }

                            const relevantAbsences = absenceRequests.filter(r => {
                                if (r.status === 'rejected') return false;
                                const start = r.date_key;
                                const end = r.end_date || r.date_key;
                                if (dKey < start || dKey > end) return false;
                                if (isAdminView) return true;
                                if (r.created_by === currentUser?.id) return true;
                                if (r.status === 'approved') return true;
                                return false;
                            });

                            const relevantTrainings = trainingRequests.filter(r => {
                                const targetDate = r.scheduled_date_key || r.requested_date_key;
                                const isDateMatch = targetDate === dKey;
                                const isUserMatch = isAdminView || r.user_id === currentUser?.id;
                                return isDateMatch && isUserMatch && r.status !== 'rejected';
                            });

                            const myTasks = todos.filter(
                                t => t.due_date_key === dKey && !t.completed_by.includes(currentUser?.id)
                            );

                            const myMeetings = meetingRequests.filter(m => {
                                const isDateMatch = m.scheduled_date_key === dKey && m.status === 'scheduled';
                                if (!isDateMatch) return false;
                                if (isAdminView) return true;
                                const isCreator = m.created_by === currentUser?.id;
                                const isParticipant = m.participants?.includes(currentUser?.id || '');
                                return isCreator || isParticipant;
                            });

                            const badges = [];

                            relevantAbsences.forEach(absence => {
                                const isVacation = absence.reason?.includes('[Vacaciones]') || absence.reason?.toLowerCase().includes('vacaciones') || absence.type === 'vacation';
                                const user = USERS.find(u => u.id === absence.created_by);
                                const showName = isAdminView || (absence.created_by !== currentUser?.id);
                                const labelPrefix = showName && user ? `${user.name}: ` : '';

                                badges.push({
                                    type: isVacation ? 'vacation' : 'absence',
                                    label: `${labelPrefix}${isVacation ? 'Vacaciones' : 'Ausencia'}`,
                                    color: isVacation
                                        ? 'bg-purple-50 text-purple-700 border-purple-100'
                                        : 'bg-red-50 text-red-700 border-red-100',
                                    icon: isVacation ? <CalendarIcon size={10} /> : <AlertCircle size={10} />,
                                    detail: absence.reason
                                });
                            });

                            relevantTrainings.forEach(training => {
                                const user = USERS.find(u => u.id === training.user_id);
                                const labelPrefix = isAdminView && user ? `${user.name}: ` : '';
                                badges.push({
                                    type: 'training',
                                    label: `${labelPrefix}Formación`,
                                    color: 'bg-blue-50 text-blue-700 border-blue-100',
                                    icon: <BookOpen size={10} />,
                                    detail: training.comments?.[0]?.text || 'Entrenamiento'
                                });
                            });

                            myMeetings.forEach(meeting => {
                                const user = USERS.find(u => u.id === meeting.created_by);
                                const labelPrefix = isAdminView && user ? `${user.name}: ` : '';
                                badges.push({
                                    type: 'meeting',
                                    label: `${labelPrefix}${meeting.scheduled_time ? meeting.scheduled_time + ' ' : ''}${meeting.title}`,
                                    color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
                                    icon: <Users size={10} />,
                                    detail: meeting.description || meeting.title
                                });
                            });

                            if (myTasks.length > 0) {
                                badges.push({
                                    type: 'task',
                                    label: `${myTasks.length} Tarea${myTasks.length > 1 ? 's' : ''}`,
                                    color: 'bg-amber-50 text-amber-700 border-amber-100',
                                    icon: <CheckSquare size={10} />,
                                    detail: myTasks.map(t => t.title).join(', ')
                                });
                            }

                            workEntries.forEach(({ userId, record }) => {
                                if (record?.entry) {
                                    const exit = record.exit;
                                    const user = USERS.find(u => u.id === userId);
                                    const labelPrefix = isAdminView && user ? `${user.name}: ` : '';
                                    badges.push({
                                        type: 'work',
                                        label: `${labelPrefix}${record.entry} - ${exit || '...'}`,
                                        color: exit ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100',
                                        icon: <Clock size={10} />,
                                        detail: record.note || (exit ? 'Jornada finalizada' : 'Jornada en curso')
                                    });
                                }
                            });

                            const estebanStatus = dailyStatuses.find(s => s.date_key === dKey && s.user_id === ESTEBAN_ID);
                            const isEstebanPresent = estebanStatus?.status === 'in_person';
                            const isEstebanRemote = estebanStatus?.status === 'remote';

                            return (
                                <motion.div
                                    key={dKey}
                                    whileHover={{ y: isNonWorking ? 0 : -2 }}
                                    onClick={() => isClickable && onSelectDate(d)}
                                    className={`
                                        group relative flex flex-col p-3 transition-all min-h-[120px] outline-none
                                        ${isSelected
                                            ? "bg-primary/[0.08] ring-2 ring-primary ring-inset z-20 shadow-lg shadow-primary/10"
                                            : isNonWorking
                                                ? "bg-gray-100/50 cursor-not-allowed text-gray-400"
                                                : "bg-white/80 dark:bg-card/80 backdrop-blur-sm hover:bg-white dark:hover:bg-card hover:shadow-xl hover:z-10 cursor-pointer"
                                        }
                                        ${isToday && !isSelected ? "bg-primary/[0.02]" : ""}
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-1 shrink-0">
                                        <span className={`
                                            text-sm font-bold w-9 h-9 flex items-center justify-center rounded-2xl transition-all
                                            ${isToday
                                                ? "bg-primary text-white shadow-lg shadow-primary/40 ring-4 ring-primary/20 scale-105"
                                                : isSelected
                                                    ? "text-primary bg-primary/10 font-black shadow-inner"
                                                    : isNonWorking
                                                        ? "text-gray-400/60"
                                                        : "text-gray-700 dark:text-gray-300"
                                            }
                                        `}>
                                            {d.getDate()}
                                        </span>
                                        {estebanStatus && (
                                            <div className="flex items-center -space-x-1">
                                                {isEstebanPresent && (
                                                    <div title="Esteban presencial" className="w-2.5 h-2.5 rounded-full bg-teal-500 ring-2 ring-white"></div>
                                                )}
                                                {isEstebanRemote && (
                                                    <div title="Esteban remoto/no presencial" className="w-2.5 h-2.5 rounded-full bg-gray-400 ring-2 ring-white"></div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1 overflow-y-auto no-scrollbar flex-1 min-h-0">
                                        {badges.slice(0, 4).map((badge, i) => (
                                            <div
                                                key={i}
                                                className={`
                                                    flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[9px] font-black shrink-0 shadow-sm backdrop-blur-md transition-transform group-hover:scale-[1.02]
                                                    ${badge.color.replace('bg-', 'bg-opacity-80 bg-')}
                                                `}
                                            >
                                                <span className="shrink-0 opacity-70">{badge.icon}</span>
                                                <span className="truncate flex-1 uppercase tracking-tight">{badge.label}</span>
                                            </div>
                                        ))}
                                        {badges.length > 4 && (
                                            <div className="text-[9px] font-bold text-gray-400 text-center py-0.5">
                                                +{badges.length - 4} más
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
