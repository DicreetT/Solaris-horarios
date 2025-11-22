import React from 'react';
import { toDateKey } from '../utils/dateUtils';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useAuth } from '../context/AuthContext';

/**
 * Calendario mensual
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

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Lunes=0

    const monthName = monthDate.toLocaleString("es-ES", { month: "long" });
    const capitalizedMonth =
        monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const handlePrevMonth = () => {
        onChangeMonth(new Date(year, month - 1, 1));
    };
    const handleNextMonth = () => {
        onChangeMonth(new Date(year, month + 1, 1));
    };

    const daysArray = [];
    for (let i = 0; i < startDayOfWeek; i++) {
        daysArray.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        daysArray.push(new Date(year, month, i));
    }

    return (
        <div className="bg-white rounded-2xl border-2 border-border p-4 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <button
                    className="w-8 h-8 rounded-full border border-border bg-white text-[#555] cursor-pointer hover:bg-bg flex items-center justify-center"
                    onClick={handlePrevMonth}
                >
                    &lt;
                </button>
                <h2 className="text-lg font-bold text-primary-dark m-0">
                    {capitalizedMonth} {year}
                </h2>
                <button
                    className="w-8 h-8 rounded-full border border-border bg-white text-[#555] cursor-pointer hover:bg-bg flex items-center justify-center"
                    onClick={handleNextMonth}
                >
                    &gt;
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                    <div key={d} className="text-xs font-bold text-[#888] uppercase">
                        {d}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1 flex-1 auto-rows-fr">
                {daysArray.map((d, idx) => {
                    if (!d) return <div key={idx} />;
                    const dKey = toDateKey(d);
                    const isSelected =
                        selectedDate && toDateKey(selectedDate) === dKey;
                    const isToday = toDateKey(new Date()) === dKey;

                    // Datos del día
                    const dayData = timeData[dKey] || {};
                    // Si es admin, vemos si ALGUIEN ha fichado
                    // Si es usuario, vemos SU fichaje
                    let hasEntry = false;
                    let hasExit = false;
                    let isAbsent = false;
                    let isVacation = false;

                    if (isAdminView) {
                        // Admin ve "algo" si hay algún registro
                        const userIds = Object.keys(dayData);
                        if (userIds.length > 0) {
                            // Podríamos refinar: pintar si TODOS han fichado, o si ALGUIEN...
                            // De momento: si hay algún dato, marcamos
                            hasEntry = userIds.some((uid) => dayData[uid].entry);
                        }
                    } else if (currentUser) {
                        const myRecord = dayData[currentUser.id];
                        if (myRecord) {
                            hasEntry = !!myRecord.entry;
                            hasExit = !!myRecord.exit;
                            if (myRecord.status === "absent") isAbsent = true;
                            if (myRecord.status === "vacation") isVacation = true;
                        }
                    }

                    // Formación (punto azul)
                    // Si es admin, ve todas. Si es usuario, ve las suyas.
                    const hasTraining = trainingRequests.some(
                        (r) =>
                            r.scheduledDateKey === dKey &&
                            r.status !== "cancelled" &&
                            r.status !== "rejected" &&
                            (isAdminView || r.userId === currentUser?.id)
                    );

                    return (
                        <div
                            key={dKey}
                            onClick={() => onSelectDate(d)}
                            className={`
                                relative flex flex-col items-center justify-center rounded-lg cursor-pointer text-sm min-h-[40px] transition-colors
                                ${isSelected ? "bg-primary text-primary-dark font-bold border-2 border-primary-dark" : "bg-white text-[#333] border border-transparent hover:bg-bg"}
                                ${isToday && !isSelected ? "font-bold text-primary-dark border border-primary" : ""}
                            `}
                        >
                            <span>{d.getDate()}</span>

                            {/* Indicadores (puntitos) */}
                            <div className="flex gap-0.5 mt-0.5 justify-center">
                                {isAbsent && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" title="Ausente" />
                                )}
                                {isVacation && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" title="Vacaciones" />
                                )}
                                {hasTraining && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Formación" />
                                )}
                                {!isAbsent && !isVacation && hasEntry && (
                                    <div
                                        className={`w-1.5 h-1.5 rounded-full ${hasExit ? "bg-green-500" : "bg-orange-400"}`}
                                        title={hasExit ? "Jornada completa" : "En curso"}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
