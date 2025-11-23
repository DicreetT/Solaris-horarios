import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { USERS } from '../constants';
import { formatDatePretty, toDateKey } from '../utils/dateUtils';
import { getStatusBadgeProps } from '../utils/statusUtils';
import { calculateHours, formatHours, calculateTotalHours } from '../utils/timeUtils';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import { Clock, History, User } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { RoleBadge } from '../components/RoleBadge';

/**
 * Time Tracking page
 * Shows user's time entries with notes and total hours
 * Admin view to see all users' time tracking with totals
 */
function TimeTrackingPage() {
    const { currentUser } = useAuth();
    const { timeData } = useTimeData();
    const { absenceRequests } = useAbsences(currentUser);

    const isAdmin = currentUser?.isAdmin;

    // Get all dates with time data or absences, sorted descending
    const allDates = Array.from(new Set([
        ...Object.keys(timeData),
        ...absenceRequests.map(r => r.date_key)
    ])).sort().reverse();

    // Filter out absence-related statuses from time entries as they are now handled by absenceRequests
    const ABSENCE_STATUSES = ['vacation', 'absent', 'vacation-request'];
    const filterTimeEntries = (entries: any[]) => {
        return entries.filter(e => !ABSENCE_STATUSES.includes(e.status));
    };

    // User's own dates
    const userDates = allDates.filter(dateKey => {
        const dayData = timeData[dateKey];
        const userEntries = dayData?.[currentUser.id] || [];
        const validEntries = filterTimeEntries(userEntries);
        const hasTimeEntries = validEntries.length > 0;
        const hasAbsence = absenceRequests.some(r => r.created_by === currentUser.id && r.date_key === dateKey);
        return hasTimeEntries || hasAbsence;
    });

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-indigo-600">
                        <Clock size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Registro Horario
                        </h1>
                        <p className="text-gray-500 font-medium">
                            {isAdmin
                                ? 'Gestiona el registro horario del equipo'
                                : 'Gestiona tu registro de entrada y salida'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Time tracker widget */}
            <div className="mb-8">
                <TimeTrackerWidget showEntries={true} />
            </div>

            {/* User view - own time tracking */}
            {!isAdmin && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden mb-8">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <History size={20} className="text-gray-400" />
                            <h2 className="text-xl font-bold text-gray-900">Historial de registros</h2>
                        </div>
                    </div>

                    <div className="p-6">
                        {userDates.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                <Clock size={48} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">No tienes registros de horario aún.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {userDates.map((dateKey) => {
                                    const rawEntries = timeData[dateKey]?.[currentUser.id] || [];
                                    const entries = filterTimeEntries(rawEntries);
                                    const absence = absenceRequests.find(r => r.created_by === currentUser.id && r.date_key === dateKey);
                                    const date = new Date(dateKey + 'T00:00:00');
                                    const totalHours = calculateTotalHours(entries);

                                    return (
                                        <div
                                            key={dateKey}
                                            className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md transition-all duration-200"
                                        >
                                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-50">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold text-sm">
                                                        {formatDatePretty(date)}
                                                    </div>
                                                    {absence && (
                                                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${absence.type === 'vacation'
                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                            : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                            {absence.type === 'vacation' ? 'Vacaciones' : 'Ausencia'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm font-medium text-gray-600">
                                                    {!absence && (
                                                        <>Total: <span className="text-indigo-600 font-bold text-lg ml-1">{formatHours(totalHours)}</span></>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Individual entries */}
                                            <div className="space-y-3">
                                                {entries.map((entry: any, idx: number) => {
                                                    const hours = calculateHours(entry.entry, entry.exit);
                                                    const isToday = dateKey === toDateKey(new Date());
                                                    const isIncomplete = !entry.exit;

                                                    return (
                                                        <div
                                                            key={entry.id}
                                                            className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-[120px]">
                                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                                    #{idx + 1}
                                                                </span>
                                                                {isIncomplete && (
                                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border ${isToday
                                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                                        : 'bg-red-50 text-red-700 border-red-200'
                                                                        }`}>
                                                                        {isToday ? 'Activo' : 'Incompleto'}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="flex-1 grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Entrada</span>
                                                                    <span className="font-mono font-bold text-gray-700">
                                                                        {entry.entry || <span className="text-gray-400">-</span>}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Salida</span>
                                                                    <span className="font-mono font-bold text-gray-700">
                                                                        {entry.exit || (isToday ? <span className="text-green-600 italic">En curso...</span> : <span className="text-red-400">-</span>)}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {entry.exit && hours > 0 && (
                                                                <div className="text-right sm:text-left">
                                                                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Duración</span>
                                                                    <span className="font-mono font-medium text-gray-600">{formatHours(hours)}</span>
                                                                </div>
                                                            )}

                                                            {entry.note && (
                                                                <div className="w-full sm:w-auto sm:flex-1 sm:text-right text-sm text-gray-500 italic border-t sm:border-t-0 border-gray-200 pt-2 sm:pt-0 mt-1 sm:mt-0">
                                                                    "{entry.note}"
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {entries.length === 0 && absence && (
                                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center text-gray-500 italic text-sm">
                                                        {absence.reason || (absence.type === 'vacation' ? 'Vacaciones registradas' : 'Ausencia registrada')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Admin view - all users' time tracking (Admin only) */}
            {isAdmin && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-900">Panel de administración</h2>
                            <RoleBadge role="admin" size="sm" />
                        </div>
                    </div>

                    <div className="p-6">
                        <p className="text-gray-500 mb-6 font-medium">
                            Registro horario de todo el equipo. Se muestra el total de horas trabajadas y todos los fichajes por fecha.
                        </p>

                        {allDates.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                <Clock size={48} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">No hay registros de horario por ahora.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {allDates.map((dateKey) => {
                                    const dayData = timeData[dateKey] || {};
                                    const date = new Date(dateKey + 'T00:00:00');

                                    // Get users who have either time entries OR absences for this day
                                    const usersWithActivity = USERS.filter(u => {
                                        const userEntries = dayData[u.id] || [];
                                        const validEntries = filterTimeEntries(userEntries);
                                        const hasEntries = validEntries.length > 0;
                                        const hasAbsence = absenceRequests.some(r => r.created_by === u.id && r.date_key === dateKey);
                                        return hasEntries || hasAbsence;
                                    });

                                    if (usersWithActivity.length === 0) return null;

                                    return (
                                        <div key={dateKey} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-bold text-gray-700 flex items-center gap-2">
                                                <Clock size={16} className="text-gray-400" />
                                                {formatDatePretty(date)}
                                            </div>

                                            <div className="divide-y divide-gray-100">
                                                {usersWithActivity.map((user) => {
                                                    const rawEntries = dayData[user.id] || [];
                                                    const entries = filterTimeEntries(rawEntries);
                                                    const absence = absenceRequests.find(r => r.created_by === user.id && r.date_key === dateKey);
                                                    const totalHours = calculateTotalHours(entries);

                                                    return (
                                                        <div key={user.id} className="p-4 hover:bg-gray-50 transition-colors">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                                                                <div className="flex items-center gap-3">
                                                                    <UserAvatar name={user.name} size="sm" />
                                                                    <div>
                                                                        <div className="font-bold text-gray-900 flex items-center gap-2">
                                                                            {user.name}
                                                                            {absence && (
                                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${absence.type === 'vacation'
                                                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                                    }`}>
                                                                                    {absence.type === 'vacation' ? 'Vacaciones' : 'Ausencia'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500 font-medium">
                                                                            {!absence && (
                                                                                <>Total: <span className="text-indigo-600">{formatHours(totalHours)}</span></>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Show individual entries with notes */}
                                                            <div className="pl-11 space-y-1">
                                                                {entries.map((entry: any, idx: number) => {
                                                                    const isToday = dateKey === toDateKey(new Date());
                                                                    const isIncomplete = !entry.exit;

                                                                    return (
                                                                        <div key={entry.id} className="text-xs flex items-center gap-2 flex-wrap">
                                                                            <span className="text-gray-400 font-medium">#{idx + 1}</span>
                                                                            <span className="font-mono text-gray-700">
                                                                                {entry.entry || '—'} → {entry.exit || (isToday ? <span className="text-green-600 italic">activo</span> : <span className="text-red-400">-</span>)}
                                                                            </span>
                                                                            {isIncomplete && (
                                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${isToday
                                                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                                                    : 'bg-red-50 text-red-700 border-red-200'
                                                                                    }`}>
                                                                                    {isToday ? 'Activo' : 'Incompleto'}
                                                                                </span>
                                                                            )}
                                                                            {entry.note && (
                                                                                <span className="text-gray-500 italic border-l border-gray-300 pl-2 ml-1">
                                                                                    {entry.note}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                                {entries.length === 0 && absence && (
                                                                    <div className="text-xs text-gray-500 italic">
                                                                        {absence.reason || (absence.type === 'vacation' ? 'Vacaciones registradas' : 'Ausencia registrada')}
                                                                    </div>
                                                                )}
                                                            </div>
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
                </div>
            )}
        </div>
    );
}

export default TimeTrackingPage;

