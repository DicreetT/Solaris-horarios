import React, { useState } from 'react';
import { USERS } from '../constants';

/**
 * Herramientas de Admin para exportar CSV (Anabella, registro horario)
 */
export default function AdminExportView({ data }) {
    const [showDialog, setShowDialog] = useState(false);
    const [csvGenerated, setCsvGenerated] = useState("");

    function buildCsv() {
        const rows = [["Fecha", "Persona", "Entrada", "Salida", "Estado", "Nota"]];

        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));

        const sortedDates = Object.keys(data).sort();
        for (const dateKey of sortedDates) {
            const dayData = data[dateKey];
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

        setCsvGenerated(csv);
        setShowDialog(true);
    }

    function downloadCsv() {
        const blob = new Blob([csvGenerated], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "solaris-horarios.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return (
        <>
            <div className="export-box">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Herramientas de Admin
                </div>
                <p className="small-muted">
                    Aquí puedes descargar todo el historial en formato CSV (se abre en
                    Excel / Google Sheets).
                </p>
                <button
                    type="button"
                    className="btn btn-small btn-primary"
                    onClick={buildCsv}
                >
                    Descargar CSV
                </button>
            </div>

            {showDialog && (
                <div className="dialog-backdrop">
                    <div className="dialog-paper">
                        <div className="dialog-title">Exportar CSV</div>
                        <div className="dialog-text">
                            Toca “Descargar” para guardar el archivo. Si quieres verlo
                            primero, puedes copiarlo desde el cuadro de abajo.
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
