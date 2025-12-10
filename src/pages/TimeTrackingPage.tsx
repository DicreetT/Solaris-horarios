import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { useWorkProfile } from '../hooks/useWorkProfile';
import { USERS } from '../constants';
import { formatDatePretty, toDateKey } from '../utils/dateUtils';
import { calculateTotalHours, calculateHours } from '../utils/timeUtils';
import TimeTrackerWidget from '../components/TimeTrackerWidget';
import { Clock, History, Calendar, CheckSquare, Edit2, Save, Trash2, Shield, User as UserIcon } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

export default function TimeTrackingPage() {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.isAdmin;

    const { timeData, deleteTimeEntry, updateTimeEntry } = useTimeData();
    const { absenceRequests } = useAbsences(currentUser);
    const { userProfiles, updateProfile } = useWorkProfile();

    // UI States
    const [adminViewMode, setAdminViewMode] = useState<'table' | 'details'>('table');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ monthly_hours: 0, vacation_days_total: 0 });

    // --- Helpers ---

    const getProfile = (userId: string) => {
        return userProfiles.find(p => p.user_id === userId) || {
            monthly_hours: 0,
            vacation_days_total: 22
        };
    };

    const calculateMonthlyWorkedHours = (userId: string) => {
        const today = new Date();
        const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        let totalMinutes = 0;

        Object.values(timeData).forEach(dayData => {
            // dayData is Record<userId, TimeEntry[]>
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

        // Convert back to decimal hours for display
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

    // --- Rendering ---

    const renderUserDashboard = (userId: string) => {
        const profile = getProfile(userId);
        const workedHours = calculateMonthlyWorkedHours(userId);
        const vacationUsed = calculateVacationDaysUsed(userId);

        const remainingHours = Math.max(0, profile.monthly_hours - workedHours);
        const remainingVacation = Math.max(0, profile.vacation_days_total - vacationUsed);

        // Get recent logs for this user
        const logs: any[] = [];
        const sortedDates = Object.keys(timeData).sort().reverse();
        sortedDates.forEach(dateKey => {
            const entries = timeData[dateKey][userId] || [];
            entries.forEach(e => {
                // Add dateKey to entry object for display
                logs.push({ ...e, date_key: dateKey });
            });
        });
        const recentLogs = logs.slice(0, 10); // Show last 10

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
                                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Contratadas</p>
                                    <p className="text-2xl font-black text-gray-900">{profile.monthly_hours}h</p>
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
                                        style={{ width: `${Math.min(100, (workedHours / (profile.monthly_hours || 1)) * 100)}%` }}
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

                {/* Clock Widget */}
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-600">
                            <thead className="bg-gray-50 text-gray-900 font-bold uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Entrada</th>
                                    <th className="px-6 py-4">Salida</th>
                                    <th className="px-6 py-4">Total</th>
                                    {isAdmin && <th className="px-6 py-4">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {recentLogs.length === 0 ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-gray-400 italic">No hay registros recientes.</td></tr>
                                ) : (
                                    recentLogs.map(entry => (
                                        <tr key={entry.id} className="hover:bg-gray-50/50">
                                            <td className="px-6 py-4 font-medium">{formatDatePretty(new Date(entry.date_key))}</td>
                                            <td className="px-6 py-4">{entry.entry || '-'}</td>
                                            <td className="px-6 py-4">{entry.exit || '-'}</td>
                                            <td className="px-6 py-4 font-bold text-indigo-600">
                                                {entry.entry && entry.exit ? `${calculateHours(entry.entry, entry.exit)} h` : '-'}
                                            </td>
                                            {isAdmin && (
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => deleteTimeEntry(entry.id)} className="text-gray-400 hover:text-red-500">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
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
                                <th className="px-6 py-4 text-center">Horas Mensuales</th>
                                <th className="px-6 py-4 text-center">Trabajadas</th>
                                <th className="px-6 py-4 text-center">Pendientes</th>
                                <th className="px-6 py-4 text-center">Vacaciones Totales</th>
                                <th className="px-6 py-4 text-center">Usadas</th>
                                <th className="px-6 py-4 text-center">Restantes</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {USERS.map(user => {
                                const profile = getProfile(user.id);
                                const worked = calculateMonthlyWorkedHours(user.id);
                                const vacationUsed = calculateVacationDaysUsed(user.id);
                                const isEditing = editingProfileId === user.id;

                                return (
                                    <tr key={user.id} className="hover:bg-blue-50/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar name={user.name} size="sm" />
                                                <span className="font-bold text-gray-900">{user.name}</span>
                                            </div>
                                        </td>

                                        {/* Monthly Hours */}
                                        <td className="px-6 py-4 text-center">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    className="w-16 p-1 border rounded text-center bg-white"
                                                    value={editForm.monthly_hours}
                                                    onChange={e => setEditForm({ ...editForm, monthly_hours: parseInt(e.target.value) || 0 })}
                                                />
                                            ) : (
                                                <span className="font-mono font-bold">{profile.monthly_hours}h</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center text-indigo-600 font-bold">{worked}h</td>
                                        <td className="px-6 py-4 text-center text-orange-500 font-medium">{(profile.monthly_hours - worked).toFixed(1)}h</td>

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
                                                                monthly_hours: editForm.monthly_hours,
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
                                                                monthly_hours: profile.monthly_hours,
                                                                vacation_days_total: profile.vacation_days_total
                                                            });
                                                        }}
                                                        className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-full transition-all"
                                                        title="Editar cupos"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUserId(user.id);
                                                            setAdminViewMode('details');
                                                        }}
                                                        className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-full transition-all"
                                                        title="Ver detalles"
                                                    >
                                                        <History size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
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
                        {adminViewMode === 'details' && selectedUserId && (
                            <span className="text-gray-400 text-xl font-medium flex items-center gap-2">
                                / <UserAvatar name={USERS.find(u => u.id === selectedUserId)?.name} size="xs" />
                                {USERS.find(u => u.id === selectedUserId)?.name}
                            </span>
                        )}
                    </h1>
                    <p className="text-gray-500 mt-1">Gestión de horas y vacaciones.</p>
                </div>
                {isAdmin && (
                    <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                        <button
                            onClick={() => { setAdminViewMode('table'); setSelectedUserId(null); }}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${adminViewMode === 'table' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
                                }`}
                        >
                            Vista General
                        </button>
                        <button
                            onClick={() => { setAdminViewMode('details'); setSelectedUserId(currentUser.id); }}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${adminViewMode === 'details' && selectedUserId === currentUser.id
                                ? 'bg-gray-900 text-white shadow-md'
                                : 'text-gray-500 hover:bg-gray-50'
                                }`}
                        >
                            Mi Registro
                        </button>
                    </div>
                )}
            </div>

            {isAdmin && adminViewMode === 'table' ? (
                renderAdminTable()
            ) : (
                renderUserDashboard(selectedUserId || currentUser.id)
            )}
        </div>
    );
}
