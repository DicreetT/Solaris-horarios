import { USERS } from '../constants';
import { TimeEntry, Training } from '../types';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { useMeetings } from '../hooks/useMeetings';
import { useTimeData } from '../hooks/useTimeData';
import { useTodos } from '../hooks/useTodos';
import { useTraining } from '../hooks/useTraining';
import { FileText, Download, XCircle, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import RoleBadge from './RoleBadge';

export default function GlobalExportPanel() {
    const { currentUser: user } = useAuth();
    const { trainingRequests } = useTraining(user);
    const { meetingRequests } = useMeetings(user);
    const { absenceRequests } = useAbsences(user);
    const { todos } = useTodos(user);

    const [showDialog, setShowDialog] = useState(false);
    const [csvGenerated, setCsvGenerated] = useState("");
    const [fileName, setFileName] = useState("export.csv");
    const [title, setTitle] = useState("Exportar CSV");
    const [copied, setCopied] = useState(false);

    // Month Selector State
    const [selectedDate, setSelectedDate] = useState(new Date());
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    const { timeData } = useTimeData({
        from: monthStart,
        to: monthEnd,
    });

    const handlePrevMonth = () => {
        setSelectedDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(prev.getMonth() - 1);
            return newDate;
        });
    };

    const handleNextMonth = () => {
        setSelectedDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(prev.getMonth() + 1);
            return newDate;
        });
    };

    function calculateHours(entry: string, exit: string) {
        if (!entry || !exit) return "";
        const [h1, m1] = entry.split(':').map(Number);
        const [h2, m2] = exit.split(':').map(Number);
        const total = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
        return total.toFixed(2);
    }

    function exportMonthlyTimes() {
        const rows = [["Fecha", "Persona", "Entrada", "Salida", "Horas", "Estado", "Nota"]];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const sortedDates = Object.keys(timeData).sort();

        const currentMonthPrefix = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

        for (const dateKey of sortedDates) {
            if (!dateKey.startsWith(currentMonthPrefix)) continue;

            const dayData = timeData[dateKey];
            for (const userId of Object.keys(dayData)) {
                const entries = dayData[userId] || [];
                // Typically one main entry per day, but handle list if cleaner
                entries.forEach((r: TimeEntry) => {
                    rows.push([
                        dateKey,
                        userMap[userId] || userId,
                        r.entry || "",
                        r.exit || "",
                        (r.entry && r.exit) ? calculateHours(r.entry, r.exit) : "",
                        r.status || "",
                        (r.note || "").replace(/\n/g, " "),
                    ]);
                });
            }
        }
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");

        const monthName = selectedDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        showCsv(csv, `horarios-${monthName.replace(/ /g, '-')}.csv`, `Exportar Horarios (${monthName})`);
    }

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

    function copyToClipboard() {
        navigator.clipboard.writeText(csvGenerated);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function showCsv(csv: string, name: string, dialogTitle: string) {
        setCsvGenerated(csv);
        setFileName(name);
        setTitle(dialogTitle);
        setShowDialog(true);
        setCopied(false);
    }

    function exportTimes() {
        const rows = [["Fecha", "Persona", "Entrada", "Salida", "Estado", "Nota"]];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const sortedDates = Object.keys(timeData).sort();
        for (const dateKey of sortedDates) {
            const dayData = timeData[dateKey];
            for (const userId of Object.keys(dayData)) {
                const entries = dayData[userId] || [];
                const r = (entries[0] || {}) as TimeEntry;
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
        showCsv(csv, "lunaris-horarios.csv", "Exportar horarios");
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
                r.id.toString(),
                userMap[r.user_id] || r.user_id,
                r.requested_date_key || "",
                r.scheduled_date_key || "",
                r.status || "",
                (r.comments || []).length.toString(),
            ]);
        });
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");
        showCsv(csv, "lunaris-formaciones.csv", "Exportar formaciones");
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
                .map((id: string) => userMap[id] || id)
                .join(" / ");
            rows.push([
                m.id.toString(),
                userMap[m.created_by] || m.created_by,
                m.created_at || "",
                m.title || "",
                (m.description || "").replace(/\n/g, " "),
                m.preferred_date_key || "",
                m.preferred_slot || "",
                participantsNames,
                m.status || "",
                m.scheduled_date_key || "",
                (m.response_message || "").replace(/\n/g, " "),
            ]);
        });
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(",")
            )
            .join("\n");
        showCsv(csv, "lunaris-reuniones.csv", "Exportar reuniones");
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
                r.id.toString(),
                userMap[r.created_by] || r.created_by,
                r.date_key || "",
                (r.reason || "").replace(/\n/g, " "),
                r.status || "",
                (r.response_message || "").replace(/\n/g, " "),
                r.created_at || "",
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
            "lunaris-permisos-especiales.csv",
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
            const assignedNames = (t.assigned_to || [])
                .map((id: string) => userMap[id] || id)
                .join(" / ");
            const completedNames = (t.completed_by || [])
                .map((id: string) => userMap[id] || id)
                .join(" / ");
            rows.push([
                t.id,
                t.title || "",
                (t.description || "").replace(/\n/g, " "),
                userMap[t.created_by] || t.created_by,
                assignedNames,
                t.created_at || "",
                t.due_date_key || "",
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
        showCsv(csv, "lunaris-tareas.csv", "Exportar tareas (To-Do)");
    }

    return (
        <>
            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-gray-900">Panel de descargas</h2>
                        <RoleBadge role="admin" size="sm" />
                    </div>
                </div>

                <div className="p-8">
                    {/* --- MONTHLY EXPORTS SECTION --- */}
                    <div className="mb-12 bg-indigo-50/50 rounded-3xl p-6 border border-indigo-100">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl border border-indigo-200">
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                                        Reportes Mensuales
                                    </h3>
                                    <p className="text-gray-500 text-sm leading-relaxed max-w-md">
                                        Selecciona el mes para descargar el registro horario detallado de todo el equipo correspondiente a ese periodo.
                                    </p>
                                </div>
                            </div>

                            {/* Month Selector */}
                            <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-indigo-200">
                                <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                </button>
                                <span className="font-bold text-gray-800 w-32 text-center capitalize">
                                    {selectedDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                                </span>
                                <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="w-full md:w-auto flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                            onClick={exportMonthlyTimes}
                        >
                            <Download size={20} />
                            <span>Descargar Horarios de {selectedDate.toLocaleString('es-ES', { month: 'long' })}</span>
                        </button>
                    </div>

                    <div className="border-t border-gray-100 my-8"></div>

                    {/* --- GLOBAL EXPORTS SECTION --- */}
                    <div className="flex items-start gap-4 mb-8">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">
                                Descarga Global (Histórico Completo)
                            </h3>
                            <p className="text-gray-500 leading-relaxed text-sm">
                                Descarga todo el histórico de datos acumulados desde el inicio.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <button
                            type="button"
                            className="group flex items-center justify-between p-4 rounded-2xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md transition-all duration-200 bg-white"
                            onClick={exportTimes}
                        >
                            <span className="font-bold text-gray-700 group-hover:text-amber-800">Horarios (Todos)</span>
                            <Download size={18} className="text-gray-400 group-hover:text-amber-600" />
                        </button>

                        <button
                            type="button"
                            className="group flex items-center justify-between p-4 rounded-2xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md transition-all duration-200 bg-white"
                            onClick={exportTrainings}
                        >
                            <span className="font-bold text-gray-700 group-hover:text-amber-800">Formaciones</span>
                            <Download size={18} className="text-gray-400 group-hover:text-amber-600" />
                        </button>

                        <button
                            type="button"
                            className="group flex items-center justify-between p-4 rounded-2xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md transition-all duration-200 bg-white"
                            onClick={exportMeetings}
                        >
                            <span className="font-bold text-gray-700 group-hover:text-amber-800">Reuniones</span>
                            <Download size={18} className="text-gray-400 group-hover:text-amber-600" />
                        </button>

                        <button
                            type="button"
                            className="group flex items-center justify-between p-4 rounded-2xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md transition-all duration-200 bg-white"
                            onClick={exportAbsences}
                        >
                            <span className="font-bold text-gray-700 group-hover:text-amber-800">Permisos especiales</span>
                            <Download size={18} className="text-gray-400 group-hover:text-amber-600" />
                        </button>

                        <button
                            type="button"
                            className="group flex items-center justify-between p-4 rounded-2xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md transition-all duration-200 bg-white"
                            onClick={exportTodos}
                        >
                            <span className="font-bold text-gray-700 group-hover:text-amber-800">Tareas (To-Do)</span>
                            <Download size={18} className="text-gray-400 group-hover:text-amber-600" />
                        </button>
                    </div>
                </div>
            </div>

            {showDialog && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
                    onClick={() => setShowDialog(false)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full animate-[popIn_0.2s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
                            <button
                                type="button"
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                                onClick={() => setShowDialog(false)}
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        <p className="text-gray-500 mb-4 font-medium">
                            Vista previa del archivo CSV. Puedes copiar el contenido o descargarlo directamente.
                        </p>

                        <div className="relative mb-6">
                            <textarea
                                readOnly
                                className="w-full rounded-xl border-2 border-gray-100 p-4 text-xs font-mono text-gray-600 bg-gray-50 resize-y min-h-[150px] focus:outline-none"
                                value={csvGenerated}
                            />
                            <button
                                onClick={copyToClipboard}
                                className="absolute top-2 right-2 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors text-gray-500"
                                title="Copiar al portapapeles"
                            >
                                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowDialog(false)}
                                className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                Cerrar
                            </button>
                            <button
                                type="button"
                                onClick={downloadCsv}
                                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Download size={18} />
                                Descargar archivo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
