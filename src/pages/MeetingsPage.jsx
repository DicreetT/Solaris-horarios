import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMeetings } from '../hooks/useMeetings';
import { USERS } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { Plus } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

/**
 * Meetings page
 * Shows user's meeting requests and allows creating new ones via modal
 * Admin panel for Thalia to manage all requests
 */
function MeetingsPage() {
    const { currentUser } = useAuth();
    const { meetingRequests, createMeeting, updateMeetingStatus, deleteMeeting } = useMeetings(currentUser);

    const [showModal, setShowModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [meetingTitle, setMeetingTitle] = useState('');
    const [meetingDescription, setMeetingDescription] = useState('');
    const [meetingPreferredSlot, setMeetingPreferredSlot] = useState('indiferente');
    const [meetingParticipants, setMeetingParticipants] = useState(() =>
        currentUser?.isAdmin ? [currentUser.id] : [currentUser?.id, 'thalia']
    );

    const isAdmin = currentUser?.isAdmin;
    const selectedDateKey = toDateKey(selectedDate);

    // User's meetings sorted by creation date
    const userMeetings = meetingRequests
        .filter((m) => m.createdBy === currentUser.id || (m.participants || []).includes(currentUser.id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // All meetings for admin view
    const sortedRequests = [...meetingRequests].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    function handleDateChange(e) {
        setSelectedDate(new Date(e.target.value + 'T00:00:00'));
    }

    function handleToggleParticipant(id) {
        setMeetingParticipants((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    async function handleCreateMeeting(e) {
        e.preventDefault();
        const title = meetingTitle.trim();
        if (!title || meetingParticipants.length === 0) return;

        try {
            await createMeeting({
                title,
                description: meetingDescription.trim(),
                preferredDateKey: selectedDateKey,
                preferredSlot: meetingPreferredSlot,
                participants: meetingParticipants,
            });

            setMeetingTitle('');
            setMeetingDescription('');
            setMeetingPreferredSlot('indiferente');
            setMeetingParticipants(
                currentUser.isAdmin ? [currentUser.id] : [currentUser.id, 'thalia']
            );
            setSelectedDate(new Date());
            setShowModal(false);
        } catch (e) {
            console.error('Unexpected error creating meeting_request', e);
        }
    }

    async function handleUpdateStatus(id, updates) {
        try {
            await updateMeetingStatus({ id, ...updates });
        } catch (e) {
            console.error("Unexpected error updating meeting status", e);
        }
    }

    async function handleDeleteMeeting(id) {
        try {
            await deleteMeeting(id);
        } catch (e) {
            console.error("Unexpected error deleting meeting", e);
        }
    }

    return (
        <div className="max-w-6xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Reuniones</h1>
                <p className="text-[#666]">
                    {isAdmin
                        ? 'Gestiona las solicitudes de reunión del equipo'
                        : 'Gestiona tus solicitudes de reunión'}
                </p>
            </div>

            {/* User view - meetings list */}
            <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_rgba(0,0,0,0.2)] p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Tus solicitudes de reunión</h2>
                    <button
                        onClick={() => setShowModal(true)}
                        className="rounded-full border-2 border-border px-4 py-2.5 text-sm font-semibold cursor-pointer inline-flex items-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors shadow-[2px_2px_0_rgba(0,0,0,0.2)]"
                    >
                        <Plus size={16} />
                        Solicitar reunión
                    </button>
                </div>

                {userMeetings.length === 0 ? (
                    <p className="text-sm text-[#666] italic">
                        No tienes solicitudes de reunión.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {userMeetings.map((m) => {
                            const participantsNames = (m.participants || [])
                                .map((id) => USERS.find((u) => u.id === id)?.name || id)
                                .join(", ");

                            return (
                                <div
                                    key={m.id}
                                    className="bg-[#fafaf9] border-2 border-border rounded-xl p-3"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <strong className="text-sm">{m.title}</strong>
                                            {m.description && (
                                                <div className="text-xs text-[#666] mt-1">
                                                    Motivo: {m.description}
                                                </div>
                                            )}
                                            <div className="text-xs text-[#666] mt-1">
                                                Fecha preferida: {m.preferredDateKey} · Franja: {m.preferredSlot}
                                            </div>
                                            <div className="text-xs text-[#666] mt-1">
                                                Participantes: {participantsNames || "—"}
                                            </div>
                                            <div className="text-xs text-[#666] mt-1">
                                                Estado:{" "}
                                                <strong>
                                                    {m.status === "pending" && "Pendiente"}
                                                    {m.status === "scheduled" && "Programada"}
                                                    {m.status === "rejected" && "Rechazada"}
                                                </strong>
                                                {m.responseMessage && ` · Nota: ${m.responseMessage}`}
                                            </div>
                                            <div className="text-xs text-[#888] mt-1">
                                                Solicitado el{" "}
                                                {new Date(m.createdAt).toLocaleString("es-ES", {
                                                    dateStyle: "short",
                                                    timeStyle: "short",
                                                })}
                                            </div>
                                        </div>
                                        {m.status === 'pending' && m.createdBy === currentUser.id && (
                                            <button
                                                type="button"
                                                className="rounded-full border-2 border-[#fecaca] px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] hover:bg-[#fecaca] transition-colors"
                                                onClick={() => handleDeleteMeeting(m.id)}
                                                title="Eliminar solicitud"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Admin view - all requests (Admin only) */}
            {isAdmin && (
                <div className="bg-card p-6 rounded-[24px] shadow-lg border-2 border-border">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="text-lg font-bold">Panel de administración</div>
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded border border-amber-200 font-bold">
                            ADMIN
                        </span>
                    </div>
                    <div className="text-sm text-[#444] mb-4 leading-relaxed">
                        Aquí ves todas las solicitudes de reunión del equipo. Puedes marcarlas
                        como programadas o rechazarlas dejando un comentario.
                    </div>

                    {sortedRequests.length === 0 ? (
                        <p className="text-xs text-[#666]">No hay solicitudes de reunión por ahora.</p>
                    ) : (
                        sortedRequests.map((m) => {
                            const creator = USERS.find((u) => u.id === m.createdBy);
                            const participantsNames = (m.participants || [])
                                .map((id) => USERS.find((u) => u.id === id)?.name || id)
                                .join(", ");

                            return (
                                <div
                                    key={m.id}
                                    className="border-t border-[#e5e7eb] pt-1.5 mt-1.5"
                                >
                                    <strong>{m.title}</strong>
                                    <div className="text-xs text-[#666] flex items-center gap-1 mt-1">
                                        <span>Solicitada por</span>
                                        <div className="flex items-center gap-1">
                                            <UserAvatar name={creator?.name} size="xs" />
                                            <strong>{creator?.name || m.createdBy}</strong>
                                        </div>
                                        <span>el {new Date(m.createdAt).toLocaleString("es-ES", {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                        })}</span>
                                    </div>
                                    {m.description && (
                                        <div className="text-xs text-[#666] mt-0.5">
                                            Motivo: {m.description}
                                        </div>
                                    )}
                                    <div className="text-xs text-[#666]">
                                        Fecha preferida: {m.preferredDateKey} · Franja:{" "}
                                        {m.preferredSlot}
                                    </div>
                                    <div className="text-xs text-[#666]">
                                        Participantes: {participantsNames || "—"}
                                    </div>
                                    <div className="text-xs text-[#666] mt-0.5">
                                        Estado:{" "}
                                        <strong>
                                            {m.status === "pending" && "Pendiente"}
                                            {m.status === "scheduled" && "Programada"}
                                            {m.status === "rejected" && "Rechazada"}
                                        </strong>
                                        {m.responseMessage && ` · Nota: ${m.responseMessage}`}
                                    </div>

                                    {m.status === "pending" && (
                                        <div className="flex gap-1.5 mt-1">
                                            <button
                                                type="button"
                                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-white hover:bg-[#f3f4f6]"
                                                onClick={() =>
                                                    handleUpdateStatus(m.id, {
                                                        status: "scheduled",
                                                        scheduledDateKey: m.preferredDateKey,
                                                    })
                                                }
                                            >
                                                Marcar como programada
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                                                onClick={() => {
                                                    const msg = window.prompt(
                                                        "Motivo del rechazo (opcional):",
                                                        ""
                                                    );
                                                    handleUpdateStatus(m.id, {
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

            {/* Meeting creation modal */}
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
                            <h2 className="text-xl font-bold">Solicitar reunión</h2>
                            <button
                                type="button"
                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5 hover:bg-[#fff8ee] transition-colors"
                                onClick={() => setShowModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-sm text-[#666] mb-4 leading-relaxed">
                            Solicita una reunión con personas del equipo. Selecciona la fecha preferida, franja horaria y participantes.
                        </p>

                        <form onSubmit={handleCreateMeeting}>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold mb-2">
                                    Fecha preferida
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
                                    Título *
                                </label>
                                <input
                                    type="text"
                                    value={meetingTitle}
                                    onChange={(e) => setMeetingTitle(e.target.value)}
                                    placeholder="Ej.: Reunión de seguimiento, dudas de proyecto..."
                                    className="w-full rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit bg-white focus:border-primary focus:outline-none"
                                    required
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-semibold mb-2">
                                    Motivo / Descripción
                                </label>
                                <textarea
                                    value={meetingDescription}
                                    onChange={(e) => setMeetingDescription(e.target.value)}
                                    placeholder="¿Qué quieres tratar en la reunión?"
                                    className="w-full rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit resize-y min-h-[60px] focus:border-primary focus:outline-none"
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-semibold mb-2">
                                    Franja horaria preferida
                                </label>
                                <select
                                    value={meetingPreferredSlot}
                                    onChange={(e) => setMeetingPreferredSlot(e.target.value)}
                                    className="w-full rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit bg-white focus:border-primary focus:outline-none"
                                >
                                    <option value="mañana">Mañana</option>
                                    <option value="tarde">Tarde</option>
                                    <option value="indiferente">Indiferente</option>
                                </select>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-semibold mb-2">
                                    Personas que deberían estar *
                                </label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {USERS.map((u) => (
                                        <label key={u.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-border bg-white text-xs cursor-pointer hover:bg-[#f3f4f6]">
                                            <input
                                                type="checkbox"
                                                checked={meetingParticipants.includes(u.id)}
                                                onChange={() => handleToggleParticipant(u.id)}
                                            />
                                            {u.name}
                                        </label>
                                    ))}
                                </div>
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
                                    ✨ Solicitar reunión
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MeetingsPage;

