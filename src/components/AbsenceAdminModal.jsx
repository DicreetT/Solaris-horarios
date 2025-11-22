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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
            <div className="bg-card p-6 rounded-[24px] w-[90%] max-w-[500px] shadow-lg border-2 border-border animate-[popIn_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
                <div className="text-lg font-bold mb-2">Permisos de ausencia</div>
                <div className="text-sm text-[#444] mb-4 leading-relaxed">
                    Aquí ves las solicitudes de permisos especiales (más allá de las
                    vacaciones). Puedes aprobar o rechazar dejando un comentario.
                </div>

                {sorted.length === 0 ? (
                    <p className="text-xs text-[#666]">
                        No hay solicitudes de permisos especiales por ahora.
                    </p>
                ) : (
                    sorted.map((r) => {
                        const creator = USERS.find((u) => u.id === r.createdBy);
                        return (
                            <div
                                key={r.id}
                                className="border-t border-[#e5e7eb] pt-1.5 mt-1.5"
                            >
                                <strong>Permiso para el día {r.dateKey}</strong>
                                <div className="text-xs text-[#666]">
                                    Solicitado por {creator?.name || r.createdBy} el{" "}
                                    {new Date(r.createdAt).toLocaleString("es-ES", {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                    })}
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
                                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
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
