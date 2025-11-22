import React from 'react';
import { USERS } from '../constants';

/**
 * Modal admin de solicitudes de reunión (solo Thalia)
 * Tabla: meeting_requests
 */
export default function MeetingAdminModal({
    meetingRequests,
    onClose,
    onUpdateMeetingStatus,
}) {
    const sorted = [...meetingRequests].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
            <div className="bg-card p-6 rounded-[24px] w-[90%] max-w-[500px] shadow-lg border-2 border-border animate-[popIn_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
                <div className="text-lg font-bold mb-2">Solicitudes de reunión</div>
                <div className="text-sm text-[#444] mb-4 leading-relaxed">
                    Aquí ves todas las solicitudes de reunión del equipo. Puedes marcarlas
                    como programadas o rechazarlas dejando un comentario.
                </div>

                {sorted.length === 0 ? (
                    <p className="text-xs text-[#666]">No hay solicitudes de reunión por ahora.</p>
                ) : (
                    sorted.map((m) => {
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
                                <div className="text-xs text-[#666]">
                                    Solicitada por {creator?.name || m.createdBy} el{" "}
                                    {new Date(m.createdAt).toLocaleString("es-ES", {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                    })}
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
                                                onUpdateMeetingStatus(m.id, {
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
                                                onUpdateMeetingStatus(m.id, {
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

                <div
                    className="flex flex-row items-center gap-2 mt-2 justify-end"
                >
                    <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={onClose}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
