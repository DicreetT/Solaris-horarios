import React, { useState } from 'react';
import { USERS } from '../constants';

/**
 * Panel global de exportaciones (solo Thalia)
 */
export default function GlobalExportPanel({
    timeData,
    trainingRequests,
    meetingRequests,
    absenceRequests,
    todos,
}) {
    const [showDialog, setShowDialog] = useState(false);
    const [csvGenerated, setCsvGenerated] = useState("");
    const [fileName, setFileName] = useState("export.csv");
    const [title, setTitle] = useState("Exportar CSV");

    function downloadCsv() {
        const blob = new Blob([csvGenerated], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function showCsv(csv, name, dialogTitle) {
        setCsvGenerated(csv);
        setFileName(name);
        setTitle(dialogTitle);
        setShowDialog(true);
    }

    function exportTimes() {
        const rows = [["Fecha", "Persona", "Entrada", "Salida", "Estado", "Nota"]];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const sortedDates = Object.keys(timeData).sort();
        for (const dateKey of sortedDates) {
            const dayData = timeData[dateKey];
            for (const userId of Object.keys(dayData)) {
                const r = dayData[userId];
                rows.push([
                    dateKey,
                    userMap[userId] || userId,
                    r.entry || "",
                    r.exit || "",
                    r.status || "",
                    (r.note || "").replace(/\n/g, " "),
                ]);
            }
        }
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");
        showCsv(csv, "solaris-horarios.csv", "Exportar horarios");
    }

    function exportTrainings() {
        const rows = [
            [
                "ID",
                "Persona",
                "Fecha_solicitada",
                "Fecha_programada",
                "Estado",
                "N_mensajes",
            ],
        ];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        trainingRequests.forEach((r) => {
            rows.push([
                r.id,
                userMap[r.userId] || r.userId,
                r.requestedDateKey || "",
                r.scheduledDateKey || "",
                r.status || "",
                (r.comments || []).length,
            ]);
        });
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");
        showCsv(csv, "solaris-formaciones.csv", "Exportar formaciones");
    }

    function exportMeetings() {
        const rows = [
            [
                "ID",
                "Creada_por",
                "Fecha_creación",
                "Título",
                "Descripción",
                "Fecha_preferida",
                "Franja",
                "Participantes",
                "Estado",
                "Fecha_programada",
                "Nota_respuesta",
            ],
        ];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        meetingRequests.forEach((m) => {
            const participantsNames = (m.participants || [])
                .map((id) => userMap[id] || id)
                .join(" / ");
            rows.push([
                m.id,
                userMap[m.createdBy] || m.createdBy,
                m.createdAt || "",
                m.title || "",
                (m.description || "").replace(/\n/g, " "),
                m.preferredDateKey || "",
                m.preferredSlot || "",
                participantsNames,
                m.status || "",
                m.scheduledDateKey || "",
                (m.responseMessage || "").replace(/\n/g, " "),
            ]);
        });
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");
        showCsv(csv, "solaris-reuniones.csv", "Exportar reuniones");
    }

    function exportAbsences() {
        const rows = [
            [
                "ID",
                "Persona",
                "Fecha_permiso",
                "Motivo",
                "Estado",
                "Nota_respuesta",
                "Fecha_solicitud",
            ],
        ];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        absenceRequests.forEach((r) => {
            rows.push([
                r.id,
                userMap[r.createdBy] || r.createdBy,
                r.dateKey || "",
                (r.reason || "").replace(/\n/g, " "),
                r.status || "",
                (r.responseMessage || "").replace(/\n/g, " "),
                r.createdAt || "",
            ]);
        });
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");
        showCsv(
            csv,
            "solaris-permisos-especiales.csv",
            "Exportar permisos especiales"
        );
    }

    function exportTodos() {
        const rows = [
            [
                "ID",
                "Título",
                "Descripción",
                "Creada_por",
                "Asignada_a",
                "Fecha_creación",
                "Fecha_objetivo",
                "Completada_por",
            ],
        ];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        todos.forEach((t) => {
            const assignedNames = (t.assignedTo || [])
                .map((id) => userMap[id] || id)
                .join(" / ");
            const completedNames = (t.completedBy || [])
                .map((id) => userMap[id] || id)
                .join(" / ");
            rows.push([
                t.id,
                t.title || "",
                (t.description || "").replace(/\n/g, " "),
                userMap[t.createdBy] || t.createdBy,
                assignedNames,
                t.createdAt || "",
                t.dueDateKey || "",
                completedNames,
            ]);
        });
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");
        showCsv(csv, "solaris-tareas.csv", "Exportar tareas (To-Do)");
    }

    return (
        <>
            <div className="export-box" style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Panel de descargas (Thalia)
                </div>
                <p className="small-muted">
                    Descarga en CSV todo lo que ocurre en Solaris: horarios, formaciones,
                    reuniones, permisos y tareas. Ideal para auditoría o informes. ✨
                </p>
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 6,
                    }}
                >
                    <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={exportTimes}
                    >
                        Horarios
                    </button>
                    <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={exportTrainings}
                    >
                        Formaciones
                    </button>
                    <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={exportMeetings}
                    >
                        Reuniones
                    </button>
                    <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={exportAbsences}
                    >
                        Permisos especiales
                    </button>
                    <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={exportTodos}
                    >
                        Tareas (To-Do)
                    </button>
                </div>
            </div>

            {showDialog && (
                <div className="dialog-backdrop">
                    <div className="dialog-paper">
                        <div className="dialog-title">{title}</div>
                        <div className="dialog-text">
                            Toca “Descargar” para guardar el archivo. Si quieres verlo primero
                            o copiar/pegar datos, puedes usar el cuadro de abajo.
                        </div>
                        <textarea
                            readOnly
                            className="note-input"
                            style={{ maxHeight: 150 }}
                            value={csvGenerated}
                        />
                        <div
                            className="flex-row"
                            style={{ marginTop: 8, justifyContent: "flex-end" }}
                        >
                            <button
                                type="button"
                                className="btn btn-small btn-ghost"
                                onClick={() => setShowDialog(false)}
                            >
                                Cerrar
                            </button>
                            <button
                                type="button"
                                className="btn btn-small btn-primary"
                                onClick={downloadCsv}
                            >
                                Descargar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
