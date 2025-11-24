import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { useTimeData } from '../hooks/useTimeData';
import { useNotificationsContext } from '../context/NotificationsContext';
import { USERS } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { Plus, UserX, Calendar, MessageSquare, Trash2, XCircle, CheckCircle, Clock } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { RoleBadge } from '../components/RoleBadge';

/**
 * Absences page
 * Allows users to create and manage their own absence requests
 * Admin view to approve/reject absence requests
 */
function AbsencesPage() {
    const { currentUser } = useAuth();
    const { absenceRequests, createAbsence, updateAbsenceStatus, deleteAbsence } = useAbsences(currentUser);
    const { createTimeEntry } = useTimeData();
    const { addNotification } = useNotificationsContext();
    const [showModal, setShowModal] = useState(false);
    const [absenceType, setAbsenceType] = useState('vacation');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [reason, setReason] = useState('');

    const isAdmin = currentUser?.isAdmin;
    const selectedDateKey = toDateKey(selectedDate);

    // Admin view - all requests sorted by creation date
    const sortedRequests = [...absenceRequests].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // User view - all their requests sorted by date
    const userAbsences = absenceRequests
        .filter((r) => r.created_by === currentUser.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    async function handleUpdateStatus(id: number, updates: any) {
        try {
            await updateAbsenceStatus({ id, ...updates });
        } catch (e) {
            console.error("Unexpected error updating absence status", e);
        }
    }

    function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        setSelectedDate(new Date(e.target.value + 'T00:00:00'));
    }

    async function handleCreateAbsence(e: React.FormEvent) {
        e.preventDefault();
        if (!reason.trim()) return;

        try {
            // Create the absence request
            const finalReason = reason.trim();
            await createAbsence({
                reason: finalReason,
                date_key: selectedDateKey,
                type: absenceType as 'vacation' | 'absence'
            });

            // Update the time entry with the appropriate status
            // Create a time entry with the appropriate status
            if (absenceType === 'vacation') {
                createTimeEntry({
                    date: selectedDate,
                    userId: currentUser.id,
                    entry: null,
                    exit: null,
                    status: 'vacation-request',
                    note: 'Solicitud de vacaciones'
                });
            } else if (absenceType === 'absence') {
                createTimeEntry({
                    date: selectedDate,
                    userId: currentUser.id,
                    entry: null,
                    exit: null,
                    status: 'absent',
                    note: 'Ausencia registrada'
                });
            }

            const typeLabel = absenceType === 'vacation' ? 'vacaciones' : 'un permiso especial';
            await addNotification({ message: `Has solicitado ${typeLabel} para el día ${selectedDateKey}.` });
            setShowModal(false);
            setReason('');
            setAbsenceType('vacation');
            setSelectedDate(new Date());
        } catch (e) {
            console.error('Unexpected error creating absence_request', e);
        }
    }

    async function handleDeleteAbsence(id: number) {
        try {
            await deleteAbsence(id);
            await addNotification({ message: 'Solicitud de permiso eliminada.' });
        } catch (e) {
            console.error("Unexpected error deleting absence", e);
        }
    }

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-purple-600">
                        <UserX size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Ausencias
                        </h1>
                        <p className="text-gray-500 font-medium">
                            {isAdmin
                                ? 'Gestiona las solicitudes de permisos y ausencias del equipo'
                                : 'Gestiona tus solicitudes de vacaciones y permisos'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95"
                >
                    <Plus size={20} />
                    Solicitar permiso
                </button>
            </div>

            {/* User view - absence requests (shown for all users) */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Tus solicitudes</h2>
                    <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                        {userAbsences.length} {userAbsences.length === 1 ? 'solicitud' : 'solicitudes'}
                    </span>
                </div>

                <div className="p-6">
                    {userAbsences.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <UserX size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">No tienes solicitudes de permisos o ausencias.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {userAbsences.map((r) => (
                                <div
                                    key={r.id}
                                    className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-purple-200 hover:shadow-md transition-all duration-200"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-bold text-gray-900">
                                                    {r.type === 'vacation' ? 'Vacaciones' : 'Ausencia'} - {r.date_key}
                                                </h3>
                                                <span className={`
                                                    inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                    ${r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                    ${r.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                    ${r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                                `}>
                                                    {r.status === 'pending' && <Clock size={12} />}
                                                    {r.status === 'approved' && <CheckCircle size={12} />}
                                                    {r.status === 'rejected' && <XCircle size={12} />}
                                                    {r.status === 'pending' && "Pendiente"}
                                                    {r.status === 'approved' && "Aprobado"}
                                                    {r.status === 'rejected' && "Rechazado"}
                                                </span>
                                            </div>

                                            <p className="text-gray-600 text-sm mb-3">
                                                <span className="font-bold text-gray-700">Motivo:</span> {r.reason}
                                            </p>

                                            {r.response_message && (
                                                <div className="mt-3 flex items-start gap-2 text-sm bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                    <MessageSquare size={16} className="text-gray-400 mt-0.5 shrink-0" />
                                                    <span className="text-gray-600"><span className="font-bold text-gray-700">Nota:</span> {r.response_message}</span>
                                                </div>
                                            )}

                                            <div className="text-xs text-gray-400 mt-3">
                                                Solicitado el {new Date(r.created_at).toLocaleString("es-ES", {
                                                    dateStyle: "short",
                                                    timeStyle: "short",
                                                })}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleDeleteAbsence(r.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                            title="Eliminar solicitud"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Admin view - all requests (Admin only) */}
            {isAdmin && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-purple-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-900">Panel de administración</h2>
                            <RoleBadge role="admin" size="sm" />
                        </div>
                    </div>

                    <div className="p-6">
                        {sortedRequests.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">No hay solicitudes de permisos especiales por ahora.</p>
                        ) : (
                            <div className="space-y-4">
                                {sortedRequests.map((r) => {
                                    const creator = USERS.find((u) => u.id === r.created_by);
                                    return (
                                        <div
                                            key={r.id}
                                            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar name={creator?.name} size="sm" />
                                                    <div>
                                                        <p className="font-bold text-gray-900">{creator?.name || r.created_by}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(r.created_at).toLocaleString("es-ES", {
                                                                dateStyle: "short",
                                                                timeStyle: "short",
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`
                                                    inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                    ${r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                    ${r.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                    ${r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                                `}>
                                                    {r.status === 'pending' && "Pendiente"}
                                                    {r.status === 'approved' && "Aprobado"}
                                                    {r.status === 'rejected' && "Rechazado"}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 mb-2">
                                                <Calendar size={16} className="text-gray-400" />
                                                <span className="font-bold text-gray-900">
                                                    {r.type === 'vacation' ? 'Vacaciones' : 'Ausencia'} - {r.date_key}
                                                </span>
                                            </div>

                                            <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                <span className="font-bold text-gray-700 block mb-1">Motivo:</span>
                                                {r.reason}
                                            </p>

                                            {r.status === "pending" && (
                                                <div className="flex gap-2 pt-3 border-t border-gray-100">
                                                    <button
                                                        type="button"
                                                        className="flex-1 py-2 px-3 rounded-xl bg-green-50 text-green-700 font-bold text-xs hover:bg-green-100 transition-colors border border-green-200"
                                                        onClick={() => {
                                                            const msg = window.prompt(
                                                                "Nota para la persona (opcional):",
                                                                ""
                                                            );
                                                            handleUpdateStatus(r.id, {
                                                                status: "approved",
                                                                response_message: msg || "",
                                                            });
                                                        }}
                                                    >
                                                        Aprobar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex-1 py-2 px-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs hover:bg-red-100 transition-colors border border-red-200"
                                                        onClick={() => {
                                                            const msg = window.prompt(
                                                                "Motivo del rechazo (opcional):",
                                                                ""
                                                            );
                                                            handleUpdateStatus(r.id, {
                                                                status: "rejected",
                                                                response_message: msg || "",
                                                            });
                                                        }}
                                                    >
                                                        Rechazar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Absence creation modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-[popIn_0.2s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Solicitar ausencia</h2>
                            <button
                                type="button"
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                                onClick={() => setShowModal(false)}
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        <p className="text-gray-500 mb-6 font-medium">
                            Solicita vacaciones o un permiso especial.
                        </p>

                        <form onSubmit={handleCreateAbsence} className="space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">
                                    Fecha
                                </label>
                                <input
                                    type="date"
                                    value={selectedDateKey}
                                    onChange={handleDateChange}
                                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">
                                    Tipo de ausencia
                                </label>
                                <select
                                    value={absenceType}
                                    onChange={(e) => setAbsenceType(e.target.value)}
                                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium bg-white focus:border-primary focus:outline-none transition-colors"
                                >
                                    <option value="vacation">Vacaciones</option>
                                    <option value="absence">Ausencia / Permiso especial</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">
                                    Motivo / Descripción *
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Describe brevemente el motivo..."
                                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium resize-y min-h-[80px] focus:border-primary focus:outline-none transition-colors"
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95"
                                >
                                    Solicitar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AbsencesPage;
