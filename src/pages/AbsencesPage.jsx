import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { useTimeData } from '../hooks/useTimeData';
import { useNotifications } from '../hooks/useNotifications';
import { USERS } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { Plus } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

/**
 * Absences page
 * Allows users to create and manage their own absence requests
 * Admin view for Thalia to approve/reject absence requests
 */
function AbsencesPage() {
    const { currentUser } = useAuth();
    const { absenceRequests, createAbsence, updateAbsenceStatus, deleteAbsence } = useAbsences(currentUser);
    const { updateTimeEntry } = useTimeData();
    const { addNotification } = useNotifications();
    const [showModal, setShowModal] = useState(false);
    const [absenceType, setAbsenceType] = useState('vacation');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [reason, setReason] = useState('');

    const isAdmin = currentUser?.isAdmin;
    const selectedDateKey = toDateKey(selectedDate);

    // Admin view - all requests sorted by creation date
    const sortedRequests = [...absenceRequests].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // User view - all their requests sorted by date
    const userAbsences = absenceRequests
        .filter((r) => r.createdBy === currentUser.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    async function handleUpdateStatus(id, updates) {
        try {
            await updateAbsenceStatus({ id, ...updates });
        } catch (e) {
            console.error("Unexpected error updating absence status", e);
        }
    }

    function handleDateChange(e) {
        setSelectedDate(new Date(e.target.value + 'T00:00:00'));
    }

    async function handleCreateAbsence(e) {
        e.preventDefault();
        if (!reason.trim()) return;

        try {
            // Create the absence request
            await createAbsence({ reason: reason.trim(), dateKey: selectedDateKey });

            // Update the time entry with the appropriate status
            if (absenceType === 'vacation') {
                updateTimeEntry({
                    date: selectedDate,
                    userId: currentUser.id,
                    updater: (r) => ({
                        ...r,
                        status: 'vacation-request',
                    })
                });
            } else if (absenceType === 'absent') {
                updateTimeEntry({
                    date: selectedDate,
                    userId: currentUser.id,
                    updater: (r) => ({
                        ...r,
                        status: 'absent',
                    })
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

    async function handleDeleteAbsence(id) {
        try {
            await deleteAbsence(id);
            await addNotification({ message: 'Solicitud de permiso eliminada.' });
        } catch (e) {
            console.error("Unexpected error deleting absence", e);
        }
    }



    return (
        <div className="max-w-6xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Permisos y Ausencias</h1>
                <p className="text-[#666]">
                    {isAdmin
                        ? 'Gestiona todas las solicitudes de permisos y ausencias del equipo'
                        : 'Gestiona tus solicitudes de vacaciones y permisos especiales'}
                </p>
            </div>

            {/* User view - absence requests (shown for all users) */}
            <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_rgba(0,0,0,0.2)] p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Tus solicitudes</h2>
                    <button
                        onClick={() => setShowModal(true)}
                        className="rounded-full border-2 border-border px-4 py-2.5 text-sm font-semibold cursor-pointer inline-flex items-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors shadow-[2px_2px_0_rgba(0,0,0,0.2)]"
                    >
                        <Plus size={16} />
                        Solicitar permiso
                    </button>
                </div>

                {userAbsences.length === 0 ? (
                    <p className="text-sm text-[#666] italic">
                        No tienes solicitudes de permisos o ausencias.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {userAbsences.map((r) => (
                            <div
                                key={r.id}
                                className="bg-[#fafaf9] border-2 border-border rounded-xl p-3"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <strong className="text-sm">Permiso para el día {r.dateKey}</strong>
                                        <div className="text-xs text-[#666] mt-1">
                                            Motivo: {r.reason}
                                        </div>
                                        <div className="text-xs text-[#666] mt-1">
                                            Estado:{" "}
                                            <strong>
                                                {r.status === "pending" && "Pendiente"}
                                                {r.status === "approved" && "Aprobado"}
                                                {r.status === "rejected" && "Rechazado"}
                                            </strong>
                                            {r.responseMessage && ` · Nota: ${r.responseMessage}`}
                                        </div>
                                        <div className="text-xs text-[#888] mt-1">
                                            Solicitado el{" "}
                                            {new Date(r.createdAt).toLocaleString("es-ES", {
                                                dateStyle: "short",
                                                timeStyle: "short",
                                            })}
                                        </div>
                                    </div>
                                    {r.status === 'pending' && (
                                        <button
                                            type="button"
                                            className="rounded-full border-2 border-[#fecaca] px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] hover:bg-[#fecaca] transition-colors"
                                            onClick={() => handleDeleteAbsence(r.id)}
                                            title="Eliminar solicitud"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Admin view - all requests (Admin only) */}
            {isAdmin && (
                <div className="bg-card p-6 rounded-[24px] shadow-lg border-2 border-border">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="text-lg font-bold">Permisos de ausencia</div>
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded border border-amber-200 font-bold">
                            ADMIN
                        </span>
                    </div>
                    <div className="text-sm text-[#444] mb-4 leading-relaxed">
                        Aquí ves las solicitudes de permisos especiales (más allá de las
                        vacaciones). Puedes aprobar o rechazar dejando un comentario.
                    </div>

                    {sortedRequests.length === 0 ? (
                        <p className="text-xs text-[#666]">
                            No hay solicitudes de permisos especiales por ahora.
                        </p>
                    ) : (
                        sortedRequests.map((r) => {
                            const creator = USERS.find((u) => u.id === r.createdBy);
                            return (
                                <div
                                    key={r.id}
                                    className="border-t border-[#e5e7eb] pt-1.5 mt-1.5"
                                >
                                    <strong>Permiso para el día {r.dateKey}</strong>
                                    <div className="text-xs text-[#666] flex items-center gap-1 mt-1">
                                        <span>Solicitado por</span>
                                        <div className="flex items-center gap-1">
                                            <UserAvatar name={creator?.name} size="xs" />
                                            <strong>{creator?.name || r.createdBy}</strong>
                                        </div>
                                        <span>el {new Date(r.createdAt).toLocaleString("es-ES", {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                        })}</span>
                                    </div>
                                    <div className="text-xs text-[#666] mt-0.5">
                                        Motivo: {r.reason}
                                    </div>
                                    <div className="text-xs text-[#666] mt-0.5">
                                        Estado:{" "}
                                        <strong>
                                            {r.status === "pending" && "Pendiente"}
                                            {r.status === "approved" && "Aprobado"}
                                            {r.status === "rejected" && "Rechazado"}
                                        </strong>
                                        {r.responseMessage && ` · Nota: ${r.responseMessage}`}
                                    </div>

                                    {r.status === "pending" && (
                                        <div className="flex gap-1.5 mt-1">
                                            <button
                                                type="button"
                                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-white hover:bg-[#f3f4f6]"
                                                onClick={() => {
                                                    const msg = window.prompt(
                                                        "Nota para la persona (opcional):",
                                                        ""
                                                    );
                                                    handleUpdateStatus(r.id, {
                                                        status: "approved",
                                                        responseMessage: msg || "",
                                                    });
                                                }}
                                            >
                                                Aprobar
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                                                onClick={() => {
                                                    const msg = window.prompt(
                                                        "Motivo del rechazo (opcional):",
                                                        ""
                                                    );
                                                    handleUpdateStatus(r.id, {
                                                        status: "rejected",
                                                        responseMessage: msg || "",
                                                    });
                                                }}
                                            >
                                                Rechazar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Absence creation modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-card border-2 border-border rounded-[20px] shadow-lg p-6 max-w-md w-full animate-[popIn_0.2s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold">Solicitar permiso o ausencia</h2>
                            <button
                                type="button"
                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5 hover:bg-[#fff8ee] transition-colors"
                                onClick={() => setShowModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-sm text-[#666] mb-4 leading-relaxed">
                            Solicita vacaciones o un permiso especial. Selecciona la fecha, el tipo y describe el motivo.
                        </p>

                        <form onSubmit={handleCreateAbsence}>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold mb-2">
                                    Fecha
                                </label>
                                <input
                                    type="date"
                                    value={selectedDateKey}
                                    onChange={handleDateChange}
                                    className="w-full rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit bg-white focus:border-primary focus:outline-none"
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-semibold mb-2">
                                    Tipo de ausencia
                                </label>
                                <select
                                    value={absenceType}
                                    onChange={(e) => setAbsenceType(e.target.value)}
                                    className="w-full rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit bg-white focus:border-primary focus:outline-none"
                                >
                                    <option value="vacation">Vacaciones</option>
                                    <option value="absent">Ausencia / Permiso especial</option>
                                </select>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-semibold mb-2">
                                    Motivo / Descripción *
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Describe brevemente el motivo de tu ausencia..."
                                    className="w-full rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit resize-y min-h-[80px] focus:border-primary focus:outline-none"
                                    required
                                />
                            </div>

                            <div className="flex gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="rounded-full border-2 border-border px-4 py-2 text-sm font-semibold cursor-pointer bg-white hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-full border-2 border-border px-4 py-2 text-sm font-semibold cursor-pointer bg-primary text-white hover:bg-primary-dark transition-colors shadow-[2px_2px_0_rgba(0,0,0,0.2)]"
                                >
                                    ✨ Solicitar
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


