import React from 'react';
import { USERS } from '../constants';

/**
 * Modal admin de permisos de ausencia (solo Thalia)
 * Tabla: absence_requests
 */
export default function AbsenceAdminModal({
    absenceRequests,
    onClose,
    onUpdateAbsenceStatus,
}) {
    const sorted = [...absenceRequests].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return (
        <div className="dialog-backdrop">
            <div className="dialog-paper">
                <div className="dialog-title">Permisos de ausencia</div>
                <div className="dialog-text">
                    Aquí ves las solicitudes de permisos especiales (más allá de las
                    vacaciones). Puedes aprobar o rechazar dejando un comentario.
                </div>

                {sorted.length === 0 ? (
                    <p className="small-muted">
                        No hay solicitudes de permisos especiales por ahora.
                    </p>
                ) : (
                    sorted.map((r) => {
                        const creator = USERS.find((u) => u.id === r.createdBy);
                        return (
                            <div
                                key={r.id}
                                style={{
                                    borderTop: "1px solid #e5e7eb",
                                    paddingTop: 6,
                                    marginTop: 6,
                                }}
                            >
                                <strong>Permiso para el día {r.dateKey}</strong>
                                <div className="small-muted">
                                    Solicitado por {creator?.name || r.createdBy} el{" "}
                                    {new Date(r.createdAt).toLocaleString("es-ES", {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                    })}
                                </div>
                                <div className="small-muted" style={{ marginTop: 2 }}>
                                    Motivo: {r.reason}
                                </div>
                                <div className="small-muted" style={{ marginTop: 2 }}>
                                    Estado:{" "}
                                    <strong>
                                        {r.status === "pending" && "Pendiente"}
                                        {r.status === "approved" && "Aprobado"}
                                        {r.status === "rejected" && "Rechazado"}
                                    </strong>
                                    {r.responseMessage && ` · Nota: ${r.responseMessage}`}
                                </div>

                                {r.status === "pending" && (
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
                                            onClick={() => {
                                                const msg = window.prompt(
                                                    "Nota para la persona (opcional):",
                                                    ""
                                                );
                                                onUpdateAbsenceStatus(r.id, {
                                                    status: "approved",
                                                    responseMessage: msg || "",
                                                });
                                            }}
                                        >
                                            Aprobar
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-small btn-ghost"
                                            onClick={() => {
                                                const msg = window.prompt(
                                                    "Motivo del rechazo (opcional):",
                                                    ""
                                                );
                                                onUpdateAbsenceStatus(r.id, {
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
