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
        <div className="dialog-backdrop">
            <div className="dialog-paper">
                <div className="dialog-title">Solicitudes de reunión</div>
                <div className="dialog-text">
                    Aquí ves todas las solicitudes de reunión del equipo. Puedes marcarlas
                    como programadas o rechazarlas dejando un comentario.
                </div>

                {sorted.length === 0 ? (
                    <p className="small-muted">No hay solicitudes de reunión por ahora.</p>
                ) : (
                    sorted.map((m) => {
                        const creator = USERS.find((u) => u.id === m.createdBy);
                        const participantsNames = (m.participants || [])
                            .map((id) => USERS.find((u) => u.id === id)?.name || id)
                            .join(", ");

                        return (
                            <div
                                key={m.id}
                                style={{
                                    borderTop: "1px solid #e5e7eb",
                                    paddingTop: 6,
                                    marginTop: 6,
                                }}
                            >
                                <strong>{m.title}</strong>
                                <div className="small-muted">
                                    Solicitada por {creator?.name || m.createdBy} el{" "}
                                    {new Date(m.createdAt).toLocaleString("es-ES", {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                    })}
                                </div>
                                {m.description && (
                                    <div className="small-muted" style={{ marginTop: 2 }}>
                                        Motivo: {m.description}
                                    </div>
                                )}
                                <div className="small-muted">
                                    Fecha preferida: {m.preferredDateKey} · Franja:{" "}
                                    {m.preferredSlot}
                                </div>
                                <div className="small-muted">
                                    Participantes: {participantsNames || "—"}
                                </div>
                                <div className="small-muted" style={{ marginTop: 2 }}>
                                    Estado:{" "}
                                    <strong>
                                        {m.status === "pending" && "Pendiente"}
                                        {m.status === "scheduled" && "Programada"}
                                        {m.status === "rejected" && "Rechazada"}
                                    </strong>
                                    {m.responseMessage && ` · Nota: ${m.responseMessage}`}
                                </div>

                                {m.status === "pending" && (
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 6,
                                            marginTop: 4,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-small"
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
                                            className="btn btn-small btn-ghost"
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
                    className="flex-row"
                    style={{ marginTop: 10, justifyContent: "flex-end" }}
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
