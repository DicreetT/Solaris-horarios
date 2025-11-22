import React from 'react';
import { toDateKey } from '../utils/dateUtils';

/**
 * Calendario mensual
 */
export default function CalendarGrid({
    monthDate,
    selectedDate,
    userId,
    data,
    onChangeMonth,
    onSelectDate,
    isAdminView,
    trainingRequests,
    currentUser,
}) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7; // Lunes = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const isSameDate = (d1, d2) =>
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

    const weeks = [];
    let currentDay = 1 - firstWeekday;
    while (currentDay <= daysInMonth) {
        const row = [];
        for (let i = 0; i < 7; i++) {
            if (currentDay < 1 || currentDay > daysInMonth) {
                row.push(null);
            } else {
                const date = new Date(year, month, currentDay);
                row.push(date);
            }
            currentDay++;
        }
        weeks.push(row);
    }

    const dayNames = ["L", "M", "X", "J", "V", "S", "D"];

    const getDotsForDay = (date) => {
        const key = toDateKey(date);
        const byDay = data[key];
        const dots = [];

        // 1. Formación
        let hasTraining = false;
        if (currentUser?.id === "thalia") {
            // Thalia ve sus propias formaciones (si tuviera)
            if (
                trainingRequests.some(
                    (r) => r.userId === currentUser.id && r.scheduledDateKey === key
                )
            ) {
                hasTraining = true;
            }
        } else if (currentUser?.isTrainingManager) {
            // Esteban ve TODAS las formaciones
            if (trainingRequests.some((r) => r.scheduledDateKey === key)) {
                hasTraining = true;
            }
        } else {
            // Usuario normal ve sus formaciones
            if (
                trainingRequests.some(
                    (r) => r.userId === userId && r.scheduledDateKey === key
                )
            ) {
                hasTraining = true;
            }
        }
        if (hasTraining) dots.push("training");

        // 2. Estado (Ausencia, Vacaciones, Presencia)
        const record = byDay?.[userId];
        if (record) {
            if (record.status === "absent") dots.push("absent");
            else if (
                record.status === "vacation" ||
                record.status === "vacation-request"
            )
                dots.push("vacation");
            else if (record.entry || record.exit || record.status === "present")
                dots.push("present");
        }

        return dots;
    };

    return (
        <div className="rounded-2xl border-2 border-border bg-card p-3">
            <div className="flex justify-between items-center gap-2 mb-2">
                <button
                    type="button"
                    className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                    onClick={() => onChangeMonth(new Date(year, month - 1, 1))}
                >
                    ←
                </button>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 700 }}>
                        {monthDate.toLocaleDateString("es-ES", {
                            month: "long",
                            year: "numeric",
                        })}
                    </div>
                    <div className="text-xs text-[#666]">
                        Toca un día para ver o editar sus datos.
                    </div>
                </div>
                <button
                    type="button"
                    className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                    onClick={() => onChangeMonth(new Date(year, month + 1, 1))}
                >
                    →
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-xs">
                {dayNames.map((n) => (
                    <div key={n} className="text-center font-semibold">
                        {n}
                    </div>
                ))}
                {weeks.map((week, wi) =>
                    week.map((date, di) => {
                        if (!date) {
                            return <div key={`${wi}-${di}`} className="h-[34px] rounded-[10px] bg-transparent border-none cursor-default flex items-center justify-center relative" />;
                        }

                        const isToday = isSameDate(date, today);
                        const isSelected = selectedDate && isSameDate(date, selectedDate);
                        const dots = getDotsForDay(date);

                        return (
                            <button
                                key={`${wi}-${di}`}
                                type="button"
                                className={
                                    "h-[34px] rounded-[10px] border border-[#ccc] bg-white flex items-center justify-center cursor-pointer relative" +
                                    (isToday ? " border-primary-dark font-bold shadow-[0_0_0_2px_rgba(255,153,51,0.4)]" : "") +
                                    (isSelected ? " bg-primary border-border" : "")
                                }
                                onClick={() => onSelectDate(date)}
                            >
                                {date.getDate()}
                                <div className="absolute bottom-[3px] right-[3px] flex gap-[2px]">
                                    {dots.map((dot, i) => {
                                        let badgeClass = "w-1.5 h-1.5 rounded-full bg-[#22c55e]";
                                        if (dot === "absent") badgeClass += " bg-[#ef4444]";
                                        if (dot === "vacation") badgeClass += " bg-[#3b82f6]";
                                        if (dot === "training") badgeClass += " bg-[#a855f7]";
                                        // present is default green
                                        return <span key={i} className={badgeClass} />;
                                    })}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
