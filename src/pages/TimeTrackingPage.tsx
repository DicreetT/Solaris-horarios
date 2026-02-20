import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { useWorkProfile } from '../hooks/useWorkProfile';
import { USERS } from '../constants';
import { formatDatePretty, toDateKey } from '../utils/dateUtils';
import { calculateTotalHours, calculateHours } from '../utils/timeUtils';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import { Clock, History, Calendar, CheckSquare, Edit2, Save, Trash2, Shield, User as UserIcon, Briefcase, AlertTriangle, Coffee } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

import { useCalendarOverrides } from '../hooks/useCalendarOverrides';

export default function TimeTrackingPage() {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.isAdmin;
    const [searchParams, setSearchParams] = useSearchParams();
    const { absenceRequests, createAbsence, deleteAbsenceByDate } = useAbsences(currentUser);
    const { userProfiles, updateProfile } = useWorkProfile();
    const { overrides: calendarOverrides } = useCalendarOverrides();

    // UI States
    const [adminViewMode, setAdminViewMode] = useState<'table' | 'details'>('table');
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

    // Month Selection State (Defaults to current month)
    const [selectedDate, setSelectedDate] = useState(new Date());
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    const { timeData, deleteTimeEntry, updateTimeEntry } = useTimeData({
        from: monthStart,
        to: monthEnd,
    });

    // Navigation Handlers
    const handlePrevMonth = () => {
        setSelectedDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(prev.getMonth() - 1);
            return newDate;
        });
    };

    const handleNextMonth = () => {
        setSelectedDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(prev.getMonth() + 1);
            return newDate;
        });
    };

    const isCurrentMonth = () => {
        const today = new Date();
        return selectedDate.getMonth() === today.getMonth() && selectedDate.getFullYear() === today.getFullYear();
    };

    // Edit Form for Profile + Adjustments
    const [editForm, setEditForm] = useState({
        weekly_hours: 0,
        vacation_days_total: 0,
        displayed_worked_hours: 0,
        displayed_vacation_used: 0
    });

    // Log Editing State (Admin only or Current Month)
    const [editingLogId, setEditingLogId] = useState<number | null>(null);
    const [logEditForm, setLogEditForm] = useState({
        entry: '',
        exit: '',
        type: 'work', // work, vacation, absence, special_permit
        resolution_type: 'makeup' // makeup, paid, deducted
    });

    useEffect(() => {
        const dateParam = searchParams.get('date');
        if (!dateParam) return;
        const parsed = new Date(`${dateParam}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
            setSelectedDate(parsed);
        }
        const cleaned = new URLSearchParams(searchParams);
        cleaned.delete('date');
        cleaned.delete('open');
        setSearchParams(cleaned, { replace: true });
    }, [searchParams, setSearchParams]);

    // --- Helpers ---

    const getProfile = (userId: string) => {
        return userProfiles.find(p => p.user_id === userId) || {
            weekly_hours: 0,
            vacation_days_total: 22,
            hours_adjustment: 0,
            vacation_adjustment: 0
        };
    };

    const consolidateDailyEntries = (entries: any[]) => {
        if (!entries || entries.length === 0) return null;
        const withEntry = entries.filter(e => !!e.entry);
        const withExit = entries.filter(e => !!e.exit);
        const base = entries[0];

        const minEntry = withEntry.length > 0
            ? withEntry.reduce((min, e) => (e.entry < min ? e.entry : min), withEntry[0].entry)
            : base.entry;
        const maxExit = withExit.length > 0
            ? withExit.reduce((max, e) => (e.exit > max ? e.exit : max), withExit[0].exit)
            : base.exit;
        const hasBreak = entries.some(e => e.status === 'break_paid' || (e.note || '').includes('PAUSA_INICIO:'));
        const status = hasBreak ? 'break_paid' : (base.status || 'present');

        return {
            ...base,
            entry: minEntry || null,
            exit: maxExit || null,
            status,
        };
    };

    // Calculate expected hours accounting for HOLIDAYS and WEEKENDS
    const calculateMonthlyExpectedHours = (userId: string, targetDate: Date) => {
        const profile = getProfile(userId);
        const dailyHours = profile.weekly_hours / 5;
        if (dailyHours === 0) return 0;

        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let workingDays = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDay = new Date(year, month, day);
            const dayOfWeek = currentDay.getDay();

            // 1. Check Weekend (0=Sun, 6=Sat)
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            // 2. Check Calendar Overrides (Holidays)
            const dateKey = toDateKey(currentDay);
            const override = calendarOverrides.find(o => o.date_key === dateKey);
            if (override?.is_non_working) continue;

            workingDays++;
        }

        return parseFloat((workingDays * dailyHours).toFixed(1));
    };

    // Calculate worked hours for a SPECIFIC month
    const calculateMonthlyWorkedHours = (userId: string, targetDate: Date) => {
        const currentMonthPrefix = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

        let totalMinutes = 0;

        // 1. Time Entries (Worked Hours)
        Object.values(timeData).forEach(dayData => {
            const userEntries = dayData[userId] || [];
            const consolidated = consolidateDailyEntries(userEntries);
            if (!consolidated) return;
            if (consolidated.date_key.startsWith(currentMonthPrefix) && consolidated.entry && consolidated.exit) {
                const hours = calculateHours(consolidated.entry, consolidated.exit);
                totalMinutes += hours * 60;
            }
        });

        // 2. Paid Special Permissions (Virtual Hours)
        const profile = getProfile(userId);
        const dailyHours = profile.weekly_hours / 5;

        absenceRequests.forEach(req => {
            if (req.created_by === userId && req.status === 'approved' && req.type === 'special_permit' && req.resolution_type === 'paid') {
                if (!req.date_key) return; // Safety check

                const startDate = new Date(req.date_key);
                if (isNaN(startDate.getTime())) return; // Safety check

                const endDate = req.end_date ? new Date(req.end_date) : new Date(req.date_key);
                if (isNaN(endDate.getTime())) return; // Safety check

                // Max loop safety (e.g. 60 days) to prevent freeze if bad data
                let loopCount = 0;
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    loopCount++;
                    if (loopCount > 60) break; // Break if range is too large to prevent crash

                    const dMonth = String(d.getMonth() + 1).padStart(2, '0');
                    const dYear = d.getFullYear();
                    const dString = `${dYear}-${dMonth}`;

                    if (dString === currentMonthPrefix) {
                        // Only count working days (Mon-Fri AND not Holiday)
                        const dayOfWeek = d.getDay();
                        const dateKey = toDateKey(d);
                        const isHoliday = calendarOverrides.some(o => o.date_key === dateKey && o.is_non_working);

                        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday) {
                            totalMinutes += dailyHours * 60;
                        }
                    }
                }
            }
        });

        return parseFloat((totalMinutes / 60).toFixed(1));
    };

    const calculateVacationDaysUsed = (userId: string) => {
        return absenceRequests
            .filter(req => req.created_by === userId && req.type === 'vacation' && req.status !== 'rejected')
            .reduce((acc, req) => {
                if (!req.end_date || req.end_date === req.date_key) return acc + 1;
                const start = new Date(req.date_key);
                const end = new Date(req.end_date);
                if (isNaN(start.getTime()) || isNaN(end.getTime())) return acc;

                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                return acc + diffDays;
            }, 0);
    };

    // --- Sub-Components ---
    // Moved DailyLogsTable outside or use directly here if we pass props.
    // For simplicity, I will use the Render Prop or just refactor renderAdminTable to use a separate component file if I could,
    // but here I will define the table rendering function *using* the props, avoiding component-inside-component.

    const renderDailyLogsTable = ({ userId, limit = 31, isEditable = false }: { userId: string, limit?: number, isEditable?: boolean }) => {
        const logs: any[] = [];
        const sortedDates = Object.keys(timeData).sort().reverse();

        // Filter by SELECTED MONTH
        const currentMonthPrefix = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

        sortedDates.forEach(dateKey => {
            if (dateKey.startsWith(currentMonthPrefix)) {
                const entries = timeData[dateKey][userId] || [];
                const consolidated = consolidateDailyEntries(entries);
                if (consolidated) logs.push({ ...consolidated, date_key: dateKey });
            }
        });
        const displayLogs = limit ? logs.slice(0, limit) : logs;

        // Permission Check: Can edit if Admin OR (User AND Current Month)
        const canEdit = isAdmin || isCurrentMonth();

        const handleSaveLog = async (id: number, dateKey: string) => {
            try {
                if (logEditForm.type === 'work') {
                    await updateTimeEntry({
                        id,
                        updates: {
                            entry: logEditForm.entry,
                            exit: logEditForm.exit,
                            status: 'present',
                            note: null
                        }
                    });
                    await deleteAbsenceByDate({ date_key: dateKey, user_id: userId });
                } else {
                    let statusLabel = 'absent';
                    if (logEditForm.type === 'vacation') statusLabel = 'vacation';
                    if (logEditForm.type === 'special_permit') statusLabel = 'special_permit';

                    await updateTimeEntry({
                        id,
                        updates: {
                            entry: null,
                            exit: null,
                            status: statusLabel,
                            note: `Admin set to ${logEditForm.type}`
                        }
                    });

                    await deleteAbsenceByDate({ date_key: dateKey, user_id: userId });

                    await createAbsence({
                        userId,
                        date_key: dateKey,
                        type: logEditForm.type as any,
                        status: 'approved',
                        resolution_type: logEditForm.type === 'special_permit' ? logEditForm.resolution_type : undefined
                    });
                }
                setEditingLogId(null);
            } catch (e) {
                console.error("Error saving log", e);
                alert("Error al guardar cambios");
            }
        };

        const getLogType = (entry: any) => {
            if (entry.status === 'break_paid') return 'break_paid';
            if (entry.status === 'vacation') return 'vacation';
            if (entry.status === 'special_permit') return 'special_permit';
            if (entry.status === 'absent') return 'absence';
            return 'work';
        };

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-900 font-bold uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4">Fecha</th>
                            <th className="px-6 py-4">Tipo / Entrada</th>
                            <th className="px-6 py-4">Detalles / Salida</th>
                            <th className="px-6 py-4">Total</th>
                            {isEditable && <th className="px-6 py-4 text-right">Acciones</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {displayLogs.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-gray-400 italic">No hay registros este mes.</td></tr>
                        ) : (
                            displayLogs.map(entry => {
                                const isEditing = editingLogId === entry.id;
                                const currentType = isEditing ? logEditForm.type : getLogType(entry);

                                return (
                                    <tr key={entry.id} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4 font-medium">{formatDatePretty(new Date(entry.date_key))}</td>

                                        <td className="px-6 py-4">
                                            {isEditing ? (
                                                <div className="flex flex-col gap-2">
                                                    <select
                                                        className="border rounded p-1 text-xs font-bold bg-gray-50"
                                                        value={logEditForm.type}
                                                        onChange={e => setLogEditForm({ ...logEditForm, type: e.target.value })}
                                                    >
                                                        <option value="work">Trabajo</option>
                                                        <option value="vacation">Vacaciones</option>
                                                        <option value="absence">Ausencia (Injust.)</option>
                                                        <option value="special_permit">Permiso Especial</option>
                                                    </select>
                                                    {logEditForm.type === 'work' && (
                                                        <input
                                                            type="time"
                                                            className="border rounded p-1 w-full"
                                                            value={logEditForm.entry}
                                                            onChange={e => setLogEditForm({ ...logEditForm, entry: e.target.value })}
                                                        />
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="font-medium text-gray-900">
                                                    {currentType === 'work' ? (entry.entry || '-') :
                                                        currentType === 'break_paid' ? <span className="text-amber-600 flex items-center gap-1"><Coffee size={14} /> Pausa</span> :
                                                        currentType === 'vacation' ? <span className="text-teal-600 flex items-center gap-1"><Calendar size={14} /> Vacaciones</span> :
                                                            currentType === 'special_permit' ? <span className="text-indigo-600 flex items-center gap-1"><Briefcase size={14} /> Permiso</span> :
                                                                <span className="text-red-500 flex items-center gap-1"><AlertTriangle size={14} /> Ausencia</span>
                                                    }
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-6 py-4">
                                            {isEditing ? (
                                                <div>
                                                    {logEditForm.type === 'work' && (
                                                        <input
                                                            type="time"
                                                            className="border rounded p-1 w-full"
                                                            value={logEditForm.exit}
                                                            onChange={e => setLogEditForm({ ...logEditForm, exit: e.target.value })}
                                                        />
                                                    )}
                                                    {logEditForm.type === 'special_permit' && (
                                                        <select
                                                            className="border rounded p-1 text-xs w-full mt-7"
                                                            value={logEditForm.resolution_type}
                                                            onChange={e => setLogEditForm({ ...logEditForm, resolution_type: e.target.value })}
                                                        >
                                                            <option value="makeup">Reponer (Deuda)</option>
                                                            <option value="paid">Pagado (Trabajado)</option>
                                                            <option value="deducted">Descontar (Ausencia)</option>
                                                        </select>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-gray-500">
                                                    {currentType === 'work' ? (entry.exit || '-') : (
                                                        <span className="text-xs italic">{entry.note || ''}</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 font-bold text-indigo-600">
                                            {!isEditing && currentType === 'work' && entry.entry && entry.exit ? `${calculateHours(entry.entry, entry.exit)} h` : '-'}
                                        </td>

                                        {isEditable && (
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleSaveLog(entry.id, entry.date_key)}
                                                            className="text-green-600 hover:bg-green-50 p-1 rounded"
                                                        >
                                                            <Save size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingLogId(null)}
                                                            className="text-gray-400 hover:bg-gray-100 p-1 rounded"
                                                        >
                                                            <Shield size={16} className="rotate-45" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    // Only show edit buttons if permitted
                                                    canEdit && (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingLogId(entry.id);
                                                                    setLogEditForm({
                                                                        entry: entry.entry || '',
                                                                        exit: entry.exit || '',
                                                                        type: getLogType(entry),
                                                                        resolution_type: 'makeup'
                                                                    });
                                                                }}
                                                                className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1 rounded"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (window.confirm('¿Borrar este registro?')) deleteTimeEntry(entry.id);
                                                                }}
                                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    )
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    // --- Rendering ---

    const renderUserDashboard = (userId: string) => {
        const profile = getProfile(userId);

        // DYNAMIC TARGET using calendar overrides
        const monthlyTarget = calculateMonthlyExpectedHours(userId, selectedDate);

        // Calculated + Adjusted (PASSED SELECTED DATE)
        const workedHoursCalculated = calculateMonthlyWorkedHours(userId, selectedDate);
        const workedHoursTotal = workedHoursCalculated + (profile.hours_adjustment || 0);

        const vacationUsedCalculated = calculateVacationDaysUsed(userId);
        const vacationUsedTotal = vacationUsedCalculated + (profile.vacation_adjustment || 0);

        const remainingHours = Math.max(0, monthlyTarget - workedHoursTotal);
        const remainingVacation = Math.max(0, profile.vacation_days_total - vacationUsedTotal);

        return (
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Hours Card */}
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-indigo-50 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2 mb-4">
                                <Clock className="text-indigo-500" /> Control Horario ({selectedDate.toLocaleString('es-ES', { month: 'long' })})
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Objetivo</p>
                                    <p className="text-2xl font-black text-gray-900">{monthlyTarget}h</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Trabajadas</p>
                                    <p className="text-2xl font-black text-indigo-600">{workedHoursTotal.toFixed(1)}h</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Pendientes</p>
                                    <p className="text-2xl font-black text-orange-500">{remainingHours.toFixed(1)}h</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min(100, (workedHoursTotal / (monthlyTarget || 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Vacation Card */}
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-teal-50 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2 mb-4">
                                <Calendar className="text-teal-500" /> Vacaciones (Año)
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Totales</p>
                                    <p className="text-2xl font-black text-gray-900">{profile.vacation_days_total}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Usadas</p>
                                    <p className="text-2xl font-black text-teal-600">{vacationUsedTotal}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Restantes</p>
                                    <p className="text-2xl font-black text-green-500">{remainingVacation}</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-teal-500 rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min(100, (vacationUsedTotal / (profile.vacation_days_total || 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tracking Widget - Only if CURRENT user and CURRENT month */}
                {userId === currentUser.id && isCurrentMonth() && (
                    <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center">
                        <h3 className="text-xl font-bold text-gray-900 mb-6">Fichar Ahora</h3>
                        <TimeTrackerWidget />
                    </div>
                )}

                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <History size={20} className="text-gray-400" /> Registro de {selectedDate.toLocaleString('es-ES', { month: 'long' })}
                        </h3>
                    </div>
                    {renderDailyLogsTable({ userId, limit: 100, isEditable: true })}
                </div>
            </div>
        );
    };

    const renderAdminTable = () => {
        return (
            <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden min-h-[400px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-900 text-white font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4">Usuario</th>
                                <th className="px-6 py-4 text-center">Horas Sem.</th>
                                <th className="px-6 py-4 text-center">Meta ({selectedDate.toLocaleString('es-ES', { month: 'short' })})</th>
                                <th className="px-6 py-4 text-center">Trabajadas</th>
                                <th className="px-6 py-4 text-center">Pendientes</th>
                                <th className="px-6 py-4 text-center">Vacaciones</th>
                                <th className="px-6 py-4 text-center">Usadas</th>
                                <th className="px-6 py-4 text-center">Restantes</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {USERS.map(user => {
                                const profile = getProfile(user.id);

                                // DYNAMIC TARGET
                                const monthlyTarget = calculateMonthlyExpectedHours(user.id, selectedDate);

                                // Updated to use SELECTED DATE
                                const workedCalculated = calculateMonthlyWorkedHours(user.id, selectedDate);
                                const workedTotal = workedCalculated + (profile.hours_adjustment || 0);


                                const vacationUsedCalculated = calculateVacationDaysUsed(user.id);
                                const vacationUsedTotal = vacationUsedCalculated + (profile.vacation_adjustment || 0);

                                const isEditing = editingProfileId === user.id;
                                const isExpanded = expandedUserId === user.id;

                                return (
                                    <React.Fragment key={user.id}>
                                        <tr className={`hover:bg-blue-50/20 transition-colors ${isExpanded ? 'bg-blue-50/10' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar name={user.name} size="sm" />
                                                    <span className="font-bold text-gray-900">{user.name}</span>
                                                </div>
                                            </td>

                                            {/* Weekly Hours */}
                                            <td className="px-6 py-4 text-center">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        className="w-16 p-1 border rounded text-center bg-white border-blue-400"
                                                        value={editForm.weekly_hours}
                                                        onChange={e => setEditForm({ ...editForm, weekly_hours: parseInt(e.target.value) || 0 })}
                                                    />
                                                ) : (
                                                    <span className="font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">{profile.weekly_hours}h</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-center text-gray-500 font-medium">{monthlyTarget}h</td>

                                            {/* Worked Hours (Now Editable via Adjustment) */}
                                            <td className="px-6 py-4 text-center text-indigo-600 font-bold">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        className="w-20 p-1 border rounded text-center bg-white border-blue-400"
                                                        value={editForm.displayed_worked_hours}
                                                        onChange={e => setEditForm({ ...editForm, displayed_worked_hours: parseFloat(e.target.value) || 0 })}
                                                    />
                                                ) : (
                                                    <span>{workedTotal.toFixed(1)}h</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-center text-orange-500 font-medium">
                                                {(monthlyTarget - workedTotal).toFixed(1)}h
                                            </td>

                                            {/* Vacation Total */}
                                            <td className="px-6 py-4 text-center border-l border-gray-100">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        className="w-16 p-1 border rounded text-center bg-white border-blue-400"
                                                        value={editForm.vacation_days_total}
                                                        onChange={e => setEditForm({ ...editForm, vacation_days_total: parseInt(e.target.value) || 0 })}
                                                    />
                                                ) : (
                                                    <span className="font-mono font-bold">{profile.vacation_days_total}</span>
                                                )}
                                            </td>

                                            {/* Vacation Used (Now Editable via Adjustment) */}
                                            <td className="px-6 py-4 text-center text-teal-600 font-bold">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        className="w-16 p-1 border rounded text-center bg-white border-blue-400"
                                                        value={editForm.displayed_vacation_used}
                                                        onChange={e => setEditForm({ ...editForm, displayed_vacation_used: parseInt(e.target.value) || 0 })}
                                                    />
                                                ) : (
                                                    <span>{vacationUsedTotal}</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-center text-green-600 font-medium">{profile.vacation_days_total - vacationUsedTotal}</td>

                                            <td className="px-6 py-4 text-center">
                                                {isEditing ? (
                                                    <button
                                                        onClick={() => {
                                                            // Calculate adjustments
                                                            const newHoursAdjustment = editForm.displayed_worked_hours - workedCalculated;
                                                            const newVacationAdjustment = editForm.displayed_vacation_used - vacationUsedCalculated;

                                                            updateProfile({
                                                                userId: user.id, updates: {
                                                                    weekly_hours: editForm.weekly_hours,
                                                                    vacation_days_total: editForm.vacation_days_total,
                                                                    hours_adjustment: newHoursAdjustment,
                                                                    vacation_adjustment: newVacationAdjustment
                                                                }
                                                            });
                                                            setEditingProfileId(null);
                                                        }}
                                                        className="text-green-600 hover:bg-green-50 p-2 rounded-full"
                                                    >
                                                        <Save size={18} />
                                                    </button>
                                                ) : (
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setEditingProfileId(user.id);
                                                                setEditForm({
                                                                    weekly_hours: profile.weekly_hours,
                                                                    vacation_days_total: profile.vacation_days_total,
                                                                    displayed_worked_hours: parseFloat(workedTotal.toFixed(1)),
                                                                    displayed_vacation_used: vacationUsedTotal
                                                                });
                                                            }}
                                                            className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-full transition-all"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                                                            className={`p-2 rounded-full transition-all ${isExpanded
                                                                ? 'text-indigo-600 bg-indigo-100 rotate-180'
                                                                : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                                                                }`}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={9} className="bg-gray-50/50 p-6 shadow-inner">
                                                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                                                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                                            <Clock size={18} className="text-gray-400" />
                                                            Registro de {selectedDate.toLocaleString('es-ES', { month: 'long' })}: {user.name}
                                                        </h4>
                                                        {renderDailyLogsTable({ userId: user.id, limit: 31, isEditable: true })}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-6xl mx-auto pb-20">
            <div className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        Registro Horario
                        {adminViewMode === 'details' && !isAdmin && (
                            <span className="text-gray-400 text-xl font-medium flex items-center gap-2">
                                / <UserIcon size={20} /> Mi Registro
                            </span>
                        )}
                    </h1>
                    <p className="text-gray-500 mt-1">Gestión de horas y vacaciones.</p>
                </div>

                {/* Month Selector */}
                <div className="flex items-center gap-4 bg-white p-2 rounded-full shadow-sm border border-gray-200">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <span className="font-bold text-gray-800 w-32 text-center capitalize">
                        {selectedDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                </div>
            </div>

            {isAdmin ? renderAdminTable() : renderUserDashboard(currentUser.id)}
        </div>
    );
}
