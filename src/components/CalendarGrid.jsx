import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toDateKey } from '../utils/dateUtils';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { formatHours } from '../utils/timeUtils';
import { ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon, BookOpen, AlertCircle, ExternalLink } from 'lucide-react';

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
}) {
    const { currentUser } = useAuth();
    const { timeData } = useTimeData();
    const { trainingRequests } = useTraining(currentUser);
    const { absenceRequests } = useAbsences(currentUser);
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
        <div className="bg-card rounded-2xl border-2 border-border p-4 shadow-[4px_4px_0_#000000] h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <button
                    className="w-9 h-9 rounded-full border-2 border-border bg-white text-black hover:bg-[#fff8ee] flex items-center justify-center transition-colors"
                    onClick={handlePrevMonth}
                >
                    <ChevronLeft size={20} />
                </button>
                <h2 className="text-xl font-bold text-black m-0 capitalize">
                    {capitalizedMonth} <span className="text-gray-500">{year}</span>
                </h2>
                <button
                    className="w-9 h-9 rounded-full border-2 border-border bg-white text-black hover:bg-[#fff8ee] flex items-center justify-center transition-colors"
                    onClick={handleNextMonth}
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center shrink-0">
                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d) => (
                    <div key={d} className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {d.substring(0, 3)}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 grid-rows-6 gap-2 flex-1 min-h-0">
                {daysArray.map((d, idx) => {
                    if (!d) return <div key={idx} className="bg-transparent" />;

                    const dKey = toDateKey(d);
                    const isSelected = selectedDate && toDateKey(selectedDate) === dKey;
                    const isToday = toDateKey(new Date()) === dKey;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                    // --- DATA GATHERING ---
                    const dayData = timeData[dKey] || {};
                    let myRecord = null;
                    let otherUsersCount = 0;

                    if (isAdminView) {
                        // En vista admin, podríamos mostrar resumen global
                        // Por ahora simplificamos: mostramos si hay actividad general
                        const userIds = Object.keys(dayData);
                        otherUsersCount = userIds.length;
                    } else if (currentUser) {
                        myRecord = dayData[currentUser.id];
                    }

                    // Absences (Vacations / Special Permissions)
                    // Check absence requests for this day
                    const myAbsence = absenceRequests.find(
                        r => r.dateKey === dKey &&
                            r.createdBy === currentUser?.id &&
                            r.status !== 'rejected'
                    );

                    // Trainings
                    const myTraining = trainingRequests.find(
                        r => (r.scheduledDateKey === dKey || (!r.scheduledDateKey && r.requestedDateKey === dKey)) &&
                            r.userId === currentUser?.id &&
                            r.status !== 'cancelled' &&
                            r.status !== 'rejected'
                    );

                    // Determine badges to show
                    const badges = [];

                    // 1. Absence / Vacation
                    if (myAbsence) {
                        badges.push({
                            type: myAbsence.type === 'vacation' ? 'vacation' : 'absence',
                            label: myAbsence.type === 'vacation' ? 'Vacaciones' : 'Ausencia',
                            color: 'bg-purple-100 text-purple-700 border-purple-200',
                            icon: <CalendarIcon size={10} />,
                            detail: myAbsence.reason,
                            link: '/absences'
                        });
                    } else if (myRecord?.status === 'vacation') {
                        badges.push({
                            type: 'vacation',
                            label: 'Vacaciones',
                            color: 'bg-purple-100 text-purple-700 border-purple-200',
                            icon: <CalendarIcon size={10} />,
                            detail: 'Vacaciones registradas',
                            link: '/absences'
                        });
                    } else if (myRecord?.status === 'absent') {
                        badges.push({
                            type: 'absence',
                            label: 'Ausente',
                            color: 'bg-red-100 text-red-700 border-red-200',
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
                            color: 'bg-blue-100 text-blue-700 border-blue-200',
                            icon: <BookOpen size={10} />,
                            detail: myTraining.status === 'pending' ? 'Solicitud pendiente' : 'Formación programada',
                            link: '/trainings'
                        });
                    }

                    // 3. Work Entry
                    if (myRecord?.entry) {
                        const exit = myRecord.exit;
                        badges.push({
                            type: 'work',
                            label: exit ? `${myRecord.entry} - ${exit}` : `${myRecord.entry} - ...`,
                            color: exit ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200',
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
                                group relative flex flex-col p-1.5 rounded-xl border-2 transition-all cursor-pointer overflow-visible
                                ${isSelected
                                    ? "bg-[#fff8ee] border-primary shadow-[2px_2px_0_#A3C538] z-10"
                                    : "bg-white border-transparent hover:border-border hover:shadow-sm hover:z-10"
                                }
                                ${isToday && !isSelected ? "border-primary/50 bg-primary/5" : ""}
                            `}
                        >
                            <span className={`
                                text-sm font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full
                                ${isToday ? "bg-primary text-white" : isWeekend ? "text-red-400" : "text-gray-700"}
                            `}>
                                {d.getDate()}
                            </span>

                            {/* Badges Container */}
                            <div className="flex flex-col gap-1 overflow-y-auto no-scrollbar">
                                {badges.map((badge, i) => (
                                    <div
                                        key={i}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (badge.link) navigate(badge.link);
                                        }}
                                        className={`
                                            flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity
                                            ${badge.color}
                                        `}
                                    >
                                        <span className="shrink-0">{badge.icon}</span>
                                        <span className="truncate flex-1">{badge.label}</span>
                                        {badge.link && <ExternalLink size={8} className="shrink-0 opacity-50" />}
                                    </div>
                                ))}
                            </div>

                            {/* Hover Tooltip */}
                            {badges.length > 0 && (
                                <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-48 bg-black/90 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                                    <div className="font-bold border-b border-white/20 pb-1 mb-1 text-center">
                                        {d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}
                                    </div>
                                    <div className="space-y-1.5">
                                        {badges.map((badge, i) => (
                                            <div key={i} className="flex flex-col">
                                                <div className="flex items-center gap-1.5 font-semibold text-gray-200">
                                                    {badge.icon}
                                                    <span>{badge.label}</span>
                                                </div>
                                                {badge.detail && (
                                                    <span className="text-gray-400 pl-4 leading-tight">
                                                        {badge.detail}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {/* Arrow */}
                                    <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-black/90"></div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
