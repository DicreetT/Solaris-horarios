import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { useWorkProfile } from '../hooks/useWorkProfile';
import { USERS } from '../constants';
import { formatDatePretty, toDateKey } from '../utils/dateUtils';
import { calculateTotalHours, calculateHours } from '../utils/timeUtils';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import { Clock, History, Calendar, CheckSquare, Edit2, Save, Trash2, Shield, User as UserIcon, Briefcase, AlertTriangle } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

export default function TimeTrackingPage() {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.isAdmin;

    const { timeData, deleteTimeEntry, updateTimeEntry } = useTimeData();
    const { absenceRequests, createAbsence, deleteAbsenceByDate } = useAbsences(currentUser);
    const { userProfiles, updateProfile } = useWorkProfile();

    // UI States
    const [adminViewMode, setAdminViewMode] = useState<'table' | 'details'>('table');
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null); // For Admin expandable row
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ weekly_hours: 0, vacation_days_total: 0 });

    // Log Editing State (Admin only)
    const [editingLogId, setEditingLogId] = useState<number | null>(null);
    const [logEditForm, setLogEditForm] = useState({
        entry: '',
        exit: '',
        type: 'work', // work, vacation, absence, special_permit
        resolution_type: 'makeup' // makeup, paid, deducted
    });

    // --- Helpers ---

    const getProfile = (userId: string) => {
        return userProfiles.find(p => p.user_id === userId) || {
            weekly_hours: 0,
            vacation_days_total: 22
        };
    };

    const calculateMonthlyWorkedHours = (userId: string) => {
        const today = new Date();
        const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        let totalMinutes = 0;

        // 1. Time Entries (Worked Hours)
        Object.values(timeData).forEach(dayData => {
            const userEntries = dayData[userId] || [];
            userEntries.forEach(entry => {
                if (entry.date_key.startsWith(currentMonthPrefix)) {
                    if (entry.entry && entry.exit) {
                        const hours = calculateHours(entry.entry, entry.exit);
                        totalMinutes += hours * 60;
                    }
                }
            });
        });

        // 2. Paid Special Permissions (Virtual Hours)
        const profile = getProfile(userId);
        const dailyHours = profile.weekly_hours / 5;

        absenceRequests.forEach(req => {
            if (req.created_by === userId && req.status === 'approved' && req.type === 'special_permit' && req.resolution_type === 'paid') {
                const startDate = new Date(req.date_key);
                const endDate = req.end_date ? new Date(req.end_date) : new Date(req.date_key);

                // Iterate days in range
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const dMonth = String(d.getMonth() + 1).padStart(2, '0');
                    const dYear = d.getFullYear();
                    const dString = `${dYear}-${dMonth}`;

                    if (dString === currentMonthPrefix) {
                        // Only count weekdays (Mon-Fri) for paid leave typically
                        const dayOfWeek = d.getDay();
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                return acc + diffDays;
            }, 0);
    };

    // --- Sub-Components ---

    const DailyLogsTable = ({ userId, limit = 10, isEditable = false }: { userId: string, limit?: number, isEditable?: boolean }) => {
        // Get sorted logs
        const logs: any[] = [];
        const sortedDates = Object.keys(timeData).sort().reverse();
        sortedDates.forEach(dateKey => {
            const entries = timeData[dateKey][userId] || [];
            entries.forEach(e => logs.push({ ...e, date_key: dateKey }));
        });
        const displayLogs = limit ? logs.slice(0, limit) : logs;

        const handleSaveLog = async (id: number, dateKey: string) => {
            try {
                if (logEditForm.type === 'work') {
                    // Update Time Entry
                    await updateTimeEntry({
                        id,
                        updates: {
                            entry: logEditForm.entry,
                            exit: logEditForm.exit,
                            status: 'present', // Reset status
                            note: null
                        }
                    });

                    // Cleanup any Absence Request for this day
                    await deleteAbsenceByDate({ date_key: dateKey, user_id: userId });

                } else {
                    // Convert to Absence/Vacation
                    // 1. Update Time Entry to be empty/placeholder
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

                    // 2. Create/Overlap Absence Request
                    // First delete existing to avoid dupes on this day
                    await deleteAbsenceByDate({ date_key: dateKey, user_id: userId });

                    // Create new Approved Absence
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
            // Helper to determine initial type state from entry status
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
                            {/* If editing and not work, merge columns? No, simpler to keep structure */}
                            <th className="px-6 py-4">Tipo / Entrada</th>
                            <th className="px-6 py-4">Detalles / Salida</th>
                            <th className="px-6 py-4">Total</th>
                            {isEditable && <th className="px-6 py-4 text-right">Acciones</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {displayLogs.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-gray-400 italic">No hay registros recientes.</td></tr>
                        ) : (
                            displayLogs.map(entry => {
                                const isEditing = editingLogId === entry.id;
                                const currentType = isEditing ? logEditForm.type : getLogType(entry);

                                return (
                                    <tr key={entry.id} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4 font-medium">{formatDatePretty(new Date(entry.date_key))}</td>

                                        {/* Column 2: Type Selector OR Entry Time */}
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
                                                        currentType === 'vacation' ? <span className="text-teal-600 flex items-center gap-1"><Calendar size={14} /> Vacaciones</span> :
                                                            currentType === 'special_permit' ? <span className="text-indigo-600 flex items-center gap-1"><Briefcase size={14} /> Permiso</span> :
                                                                <span className="text-red-500 flex items-center gap-1"><AlertTriangle size={14} /> Ausencia</span>
                                                    }
                                                </div>
                                            )}
                                        </td>

                                        {/* Column 3: Resolution Details OR Exit Time */}
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
                                                            className="border rounded p-1 text-xs w-full mt-7" // Align with the type select above visually
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
                                                        /* Maybe show absence details? */
                                                        <span className="text-xs italic">{entry.note || ''}</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* Total Duration */}
                                        <td className="px-6 py-4 font-bold text-indigo-600">
                                            {!isEditing && currentType === 'work' && entry.entry && entry.exit ? `${calculateHours(entry.entry, entry.exit)} h` : '-'}
                                        </td>

                                        {/* Actions */}
                                        {isEditable && (
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleSaveLog(entry.id, entry.date_key)}
                                                            className="text-green-600 hover:bg-green-50 p-1 rounded"
                                                            title="Guardar"
                                                        >
                                                            <Save size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingLogId(null)}
                                                            className="text-gray-400 hover:bg-gray-100 p-1 rounded"
                                                            title="Cancelar"
                                                        >
                                                            <Shield size={16} className="rotate-45" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setEditingLogId(entry.id);
                                                                setLogEditForm({
                                                                    entry: entry.entry || '',
                                                                    exit: entry.exit || '',
                                                                    type: getLogType(entry),
                                                                    resolution_type: 'makeup' // Default
                                                                });
                                                            }}
                                                            className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1 rounded"
                                                            title="Editar Registro"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm('¿Borrar este registro?')) deleteTimeEntry(entry.id);
                                                            }}
                                                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
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
        const monthlyTarget = profile.weekly_hours * 4;
        const workedHours = calculateMonthlyWorkedHours(userId);
        const vacationUsed = calculateVacationDaysUsed(userId);

        const remainingHours = Math.max(0, monthlyTarget - workedHours);
        const remainingVacation = Math.max(0, profile.vacation_days_total - vacationUsed);

        return (
            <div className="space-y-8">
                {/* Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Hours Card */}
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-indigo-50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-10 -mt-10 opacity-50" />
                        <div className="relative z-10">
                            <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2 mb-4">
                                <Clock className="text-indigo-500" />
                                Control Horario (Mes)
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Objetivo ({profile.weekly_hours}h/sem)</p>
                                    <p className="text-2xl font-black text-gray-900">{monthlyTarget}h</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Trabajadas</p>
                                    <p className="text-2xl font-black text-indigo-600">{workedHours}h</p>
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
                                        style={{ width: `${Math.min(100, (workedHours / (monthlyTarget || 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Vacation Card */}
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-teal-50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full -mr-10 -mt-10 opacity-50" />
                        <div className="relative z-10">
                            <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2 mb-4">
                                <Calendar className="text-teal-500" />
                                Vacaciones (Año)
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Totales</p>
                                    <p className="text-2xl font-black text-gray-900">{profile.vacation_days_total}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Usadas</p>
                                    <p className="text-2xl font-black text-teal-600">{vacationUsed}</p>
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
                                        style={{ width: `${Math.min(100, (vacationUsed / (profile.vacation_days_total || 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Clock Widget for Current User ONLY */}
                {userId === currentUser.id && (
                    <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center">
                        <h3 className="text-xl font-bold text-gray-900 mb-6">Fichar Ahora</h3>
                        <TimeTrackerWidget />
                    </div>
                )}

                {/* Recent Logs Table */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <History size={20} className="text-gray-400" />
                            Historial Reciente
                        </h3>
                    </div>
                    {/* User sees their logs READ ONLY */}
                    <DailyLogsTable userId={userId} limit={10} isEditable={false} />
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
                                <th className="px-6 py-4 text-center">Horas Semanales</th>
                                <th className="px-6 py-4 text-center">Objetivo Mes (x4)</th>
                                <th className="px-6 py-4 text-center">Trabajadas Mes</th>
                                <th className="px-6 py-4 text-center">Pendientes Mes</th>
                                <th className="px-6 py-4 text-center">Vacaciones</th>
                                <th className="px-6 py-4 text-center">Usadas</th>
                                <th className="px-6 py-4 text-center">Restantes</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {USERS.map(user => {
                                const profile = getProfile(user.id);
                                const monthlyTarget = profile.weekly_hours * 4;
                                const worked = calculateMonthlyWorkedHours(user.id);
                                const vacationUsed = calculateVacationDaysUsed(user.id);
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

                                            {/* Weekly Hours (Editable) */}
                                            <td className="px-6 py-4 text-center">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        className="w-16 p-1 border rounded text-center bg-white"
                                                        value={editForm.weekly_hours}
                                                        onChange={e => setEditForm({ ...editForm, weekly_hours: parseInt(e.target.value) || 0 })}
                                                    />
                                                ) : (
                                                    <span className="font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">{profile.weekly_hours}h</span>
                                                )}
                                            </td>

                                            {/* Monthly Target (Calculated) */}
                                            <td className="px-6 py-4 text-center text-gray-500 font-medium">{monthlyTarget}h</td>

                                            <td className="px-6 py-4 text-center text-indigo-600 font-bold">{worked}h</td>

                                            {/* Pending */}
                                            <td className="px-6 py-4 text-center text-orange-500 font-medium">
                                                {(monthlyTarget - worked).toFixed(1)}h
                                            </td>

                                            {/* Vacation Days */}
                                            <td className="px-6 py-4 text-center border-l border-gray-100">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        className="w-16 p-1 border rounded text-center bg-white"
                                                        value={editForm.vacation_days_total}
                                                        onChange={e => setEditForm({ ...editForm, vacation_days_total: parseInt(e.target.value) || 0 })}
                                                    />
                                                ) : (
                                                    <span className="font-mono font-bold">{profile.vacation_days_total}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center text-teal-600 font-bold">{vacationUsed}</td>
                                            <td className="px-6 py-4 text-center text-green-600 font-medium">{profile.vacation_days_total - vacationUsed}</td>

                                            <td className="px-6 py-4 text-center">
                                                {isEditing ? (
                                                    <button
                                                        onClick={() => {
                                                            updateProfile({
                                                                userId: user.id, updates: {
                                                                    weekly_hours: editForm.weekly_hours,
                                                                    vacation_days_total: editForm.vacation_days_total
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
                                                                    vacation_days_total: profile.vacation_days_total
                                                                });
                                                            }}
                                                            className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-full transition-all"
                                                            title="Editar cupos"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                                                            className={`p-2 rounded-full transition-all ${isExpanded
                                                                    ? 'text-indigo-600 bg-indigo-100 rotate-180'
                                                                    : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                                                                }`}
                                                            title={isExpanded ? "Ocultar Jornadas" : "Ver Jornadas"}
                                                        >
                                                            {/* Chevron or similar icon to indicate expansion */}
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
                                                            Registro de Jornadas: {user.name}
                                                        </h4>
                                                        {/* Admin sees EDITABLE logs here */}
                                                        <DailyLogsTable userId={user.id} limit={31} isEditable={true} />
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
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        Registro Horario
                        {adminViewMode === 'details' && adminViewMode === 'details' && !isAdmin && (
                            // Only show subtitle if user is viewing their own details. 
                            <span className="text-gray-400 text-xl font-medium flex items-center gap-2">
                                / <UserIcon size={20} /> Mi Registro
                            </span>
                        )}
                    </h1>
                    <p className="text-gray-500 mt-1">Gestión de horas y vacaciones.</p>
                </div>
                {/* User actions or Admin Toggles */}
            </div>

            {isAdmin ? (
                // Admin always sees the powerful Table View which now expands
                renderAdminTable()
            ) : (
                // Users see their personal dashboard
                renderUserDashboard(currentUser.id)
            )}
        </div>
    );
}
