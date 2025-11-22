import React, { useState } from 'react';
import { USERS } from '../constants';
import { useTimeData } from '../hooks/useTimeData';

/**
 * Herramientas de Admin para exportar CSV (Anabella, registro horario)
 */
export default function AdminExportView() {
    const { timeData: data } = useTimeData();
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
            <div className="mt-4 p-4 bg-[#fff8ee] border border-dashed border-[#ffb347] rounded-2xl">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Herramientas de Admin
                </div>
                <p className="text-xs text-[#666] mb-2">
                    Aquí puedes descargar todo el historial en formato CSV (se abre en
                    Excel / Google Sheets).
                </p>
                <button
                    type="button"
                    className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark"
                    onClick={buildCsv}
                >
                    Descargar CSV
                </button>
            </div>

            {showDialog && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
                    <div className="bg-card p-6 rounded-[24px] w-[90%] max-w-[400px] shadow-lg border-2 border-border animate-[popIn_0.2s_ease-out]">
                        <div className="text-lg font-bold mb-2">Exportar CSV</div>
                        <div className="text-sm text-[#444] mb-4 leading-relaxed">
                            Toca “Descargar” para guardar el archivo. Si quieres verlo
                            primero, puedes copiarlo desde el cuadro de abajo.
                        </div>
                        <textarea
                            readOnly
                            className="w-full rounded-[10px] border border-[#ccc] p-2 text-sm font-inherit resize-y min-h-[60px]"
                            style={{ maxHeight: 150 }}
                            value={csvGenerated}
                        />
                        <div
                            className="flex flex-row items-center gap-2 mt-2 justify-end"
                        >
                            <button
                                type="button"
                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                                onClick={() => setShowDialog(false)}
                            >
                                Cerrar
                            </button>
                            <button
                                type="button"
                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark"
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
