import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { USERS } from '../constants';
import { formatDatePretty, toDateKey } from '../utils/dateUtils';
import { getStatusBadgeProps } from '../utils/statusUtils';
import { calculateHours, formatHours, calculateTotalHours } from '../utils/timeUtils';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import { Trash2 } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

/**
 * Time Tracking page
 * Shows user's time entries with notes and total hours
 * Admin view for Thalia to see all users' time tracking with totals
 */
function TimeTrackingPage() {
    const { currentUser } = useAuth();
    const { timeData, updateTimeEntry, deleteTimeEntry } = useTimeData();

    const isAdmin = currentUser?.isAdmin;

    // Get all dates with time data, sorted descending
    const allDates = Object.keys(timeData).sort().reverse();

    // User's own dates
    const userDates = allDates.filter(dateKey => {
        const dayData = timeData[dateKey];
        return dayData[currentUser.id] && dayData[currentUser.id].length > 0;
    });

    async function handleUpdateNote(entryId, note, entry, exit) {
        try {
            const updates = { note };
            if (entry !== undefined) updates.entry = entry;
            if (exit !== undefined) updates.exit = exit;

            await updateTimeEntry({
                id: entryId,
                updates,
            });
        } catch (e) {
            console.error('Error updating note:', e);
        }
    }

    async function handleDeleteEntry(entryId) {
        if (!window.confirm('¿Eliminar este fichaje?')) return;

        try {
            await deleteTimeEntry(entryId);
        } catch (e) {
            console.error('Error deleting entry:', e);
        }
    }

    return (
        <div className="max-w-6xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Registro de Horario</h1>
                <p className="text-[#666]">
                    {isAdmin
                        ? 'Gestiona el registro horario del equipo'
                        : 'Gestiona tu registro de entrada y salida'}
                </p>
            </div>

            {/* Time tracker widget */}
            <div className="mb-6">
                <TimeTrackerWidget showEntries={true} />
            </div>

            {/* User view - own time tracking */}
            {!isAdmin && (
                <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_rgba(0,0,0,0.2)] p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4">Historial de registros</h2>

                    {userDates.length === 0 ? (
                        <p className="text-sm text-[#666] italic">
                            No tienes registros de horario aún.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {userDates.map((dateKey) => {
                                const entries = timeData[dateKey][currentUser.id];
                                const date = new Date(dateKey + 'T00:00:00');
                                const totalHours = calculateTotalHours(entries);

                                return (
                                    <div
                                        key={dateKey}
                                        className="bg-[#fafaf9] border-2 border-border rounded-xl p-4"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <strong className="text-sm">{formatDatePretty(date)}</strong>
                                                <div className="text-xs text-[#666] mt-1">
                                                    Total trabajado: <strong className="text-primary">{formatHours(totalHours)}</strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Individual entries */}
                                        <div className="space-y-3">
                                            {entries.map((entry, idx) => {
                                                const statusProps = getStatusBadgeProps(entry.status);
                                                const hours = calculateHours(entry.entry, entry.exit);

                                                return (
                                                    <div
                                                        key={entry.id}
                                                        className="bg-white border border-[#e5e7eb] rounded-lg p-3"
                                                    >
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-semibold text-[#888]">
                                                                    Fichaje #{idx + 1}
                                                                </span>
                                                                {statusProps && (
                                                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-border ${statusProps.className}`}>
                                                                        {statusProps.label}
                                                                    </div>
                                                                )}
                                                                {entry.exit && hours > 0 && (
                                                                    <span className="text-xs text-[#666]">
                                                                        ({formatHours(hours)})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3 mb-2">
                                                            <div>
                                                                <div className="text-xs font-semibold text-[#666] mb-1">Entrada</div>
                                                                <div className="text-sm font-mono text-gray-700">
                                                                    {entry.entry || <span className="text-xs text-[#666]">No registrada</span>}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-semibold text-[#666] mb-1">Salida</div>
                                                                <div className="text-sm font-mono text-gray-700">
                                                                    {entry.exit || <span className="text-xs text-[#666] italic">Activo...</span>}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {entry.note && (
                                                            <div className="mt-2 pt-2 border-t border-gray-100">
                                                                <div className="text-xs font-semibold text-[#666] mb-1">Nota</div>
                                                                <div className="text-sm text-gray-600 italic">
                                                                    "{entry.note}"
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Admin view - all users' time tracking (Admin only) */}
            {isAdmin && (
                <div className="bg-card p-6 rounded-[24px] shadow-lg border-2 border-border">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="text-lg font-bold">Panel de administración</div>
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded border border-amber-200 font-bold">
                            ADMIN
                        </span>
                    </div>
                    <div className="text-sm text-[#444] mb-4 leading-relaxed">
                        Registro horario de todo el equipo. Se muestra el total de horas trabajadas y todos los fichajes por fecha.
                    </div>

                    {allDates.length === 0 ? (
                        <p className="text-xs text-[#666]">No hay registros de horario por ahora.</p>
                    ) : (
                        allDates.map((dateKey) => {
                            const dayData = timeData[dateKey];
                            const date = new Date(dateKey + 'T00:00:00');
                            const usersWithData = USERS.filter(u => dayData[u.id] && dayData[u.id].length > 0);

                            if (usersWithData.length === 0) return null;

                            return (
                                <div
                                    key={dateKey}
                                    className="border-t border-[#e5e7eb] pt-3 mt-3"
                                >
                                    <strong className="text-sm">{formatDatePretty(date)}</strong>

                                    <div className="mt-2 space-y-2">
                                        {usersWithData.map((user) => {
                                            const entries = dayData[user.id];
                                            const totalHours = calculateTotalHours(entries);

                                            // Build time spans string
                                            const timeSpans = entries
                                                .filter(e => e.entry && e.exit)
                                                .map(e => `${e.entry}-${e.exit}`)
                                                .join(', ');

                                            return (
                                                <div
                                                    key={user.id}
                                                    className="bg-[#fafaf9] rounded-lg p-3 border border-[#e5e7eb]"
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <UserAvatar name={user.name} size="xs" />
                                                                <strong className="text-sm">{user.name}</strong>
                                                            </div>
                                                            <span className="text-sm text-[#666] ml-2">
                                                                {formatHours(totalHours)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {timeSpans && (
                                                        <div className="text-xs text-[#666] mb-1">
                                                            <span className="font-semibold">Fichajes:</span> {timeSpans}
                                                        </div>
                                                    )}

                                                    {/* Show individual entries with notes */}
                                                    <div className="mt-2 space-y-1">
                                                        {entries.map((entry, idx) => {
                                                            const statusProps = getStatusBadgeProps(entry.status);

                                                            return (
                                                                <div key={entry.id} className="text-xs">
                                                                    <span className="text-[#888]">#{idx + 1}:</span>
                                                                    {' '}
                                                                    {entry.entry || '—'} → {entry.exit || <span className="italic">activo</span>}
                                                                    {statusProps && (
                                                                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${statusProps.className}`}>
                                                                            {statusProps.label}
                                                                        </span>
                                                                    )}
                                                                    {entry.note && (
                                                                        <div className="text-[#666] ml-3 mt-0.5">
                                                                            💬 {entry.note}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

export default TimeTrackingPage;

