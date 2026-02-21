import { USERS } from '../constants';
import { TimeEntry } from '../types';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { useMeetings } from '../hooks/useMeetings';
import { useTimeData } from '../hooks/useTimeData';
import { useTodos } from '../hooks/useTodos';
import { useTraining } from '../hooks/useTraining';
import { FileText, Download } from 'lucide-react';
import { useState } from 'react';
import RoleBadge from './RoleBadge';
import { openPrintablePdfReport } from '../utils/pdfReport';

export default function GlobalExportPanel() {
    const { currentUser: user } = useAuth();
    const { trainingRequests } = useTraining(user);
    const { meetingRequests } = useMeetings(user);
    const { absenceRequests } = useAbsences(user);
    const { todos } = useTodos(user);

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
        if (!entry || !exit) return '';
        const [h1, m1] = entry.split(':').map(Number);
        const [h2, m2] = exit.split(':').map(Number);
        const total = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
        return total.toFixed(2);
    }

    const cmpEs = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });

    const safeDate = (value?: string | null) => {
        if (!value) return '';
        const onlyDate = `${value}`.slice(0, 10);
        return onlyDate;
    };

    function openPdf(
        title: string,
        headers: string[],
        rows: Array<Array<string | number>>,
        fileName: string,
        subtitle: string,
    ) {
        openPrintablePdfReport({
            title,
            headers,
            rows,
            fileName,
            subtitle,
        });
    }

    function exportMonthlyTimes() {
        const headers = ['Fecha', 'Persona', 'Entrada', 'Salida', 'Horas', 'Estado', 'Nota'];
        const flatRows: Array<{ persona: string; fecha: string; row: Array<string | number> }> = [];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const sortedDates = Object.keys(timeData).sort();

        const currentMonthPrefix = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

        for (const dateKey of sortedDates) {
            if (!dateKey.startsWith(currentMonthPrefix)) continue;

            const dayData = timeData[dateKey];
            for (const userId of Object.keys(dayData)) {
                const entries = dayData[userId] || [];
                entries.forEach((r: TimeEntry) => {
                    const persona = userMap[userId] || userId;
                    const row: Array<string | number> = [
                        dateKey,
                        persona,
                        r.entry || '',
                        r.exit || '',
                        (r.entry && r.exit) ? calculateHours(r.entry, r.exit) : '',
                        r.status || '',
                        (r.note || '').replace(/\n/g, ' '),
                    ];
                    flatRows.push({ persona, fecha: safeDate(dateKey), row });
                });
            }
        }

        const rows = flatRows
            .sort((a, b) => cmpEs(a.persona, b.persona) || cmpEs(a.fecha, b.fecha))
            .map((x) => x.row);

        const monthName = selectedDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        openPdf(
            `Horarios de ${monthName}`,
            headers,
            rows,
            `horarios-${monthName.replace(/ /g, '-')}.pdf`,
            `Registros del equipo para ${monthName}`,
        );
    }

    function exportTimes() {
        const headers = ['Fecha', 'Persona', 'Entrada', 'Salida', 'Estado', 'Nota'];
        const flatRows: Array<{ persona: string; fecha: string; row: Array<string | number> }> = [];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const sortedDates = Object.keys(timeData).sort();
        for (const dateKey of sortedDates) {
            const dayData = timeData[dateKey];
            for (const userId of Object.keys(dayData)) {
                const entries = dayData[userId] || [];
                const r = (entries[0] || {}) as TimeEntry;
                const persona = userMap[userId] || userId;
                flatRows.push({
                    persona,
                    fecha: safeDate(dateKey),
                    row: [
                    dateKey,
                    persona,
                    r.entry || '',
                    r.exit || '',
                    r.status || '',
                    (r.note || '').replace(/\n/g, ' '),
                    ],
                });
            }
        }
        const rows = flatRows
            .sort((a, b) => cmpEs(a.persona, b.persona) || cmpEs(a.fecha, b.fecha))
            .map((x) => x.row);
        openPdf('Histórico de horarios', headers, rows, 'lunaris-horarios.pdf', 'Exportación completa de horarios');
    }

    function exportTrainings() {
        const headers = ['ID', 'Persona', 'Fecha solicitada', 'Fecha programada', 'Estado', 'N mensajes'];
        const rows: Array<Array<string | number>> = [];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const ordered = [...trainingRequests].sort((a, b) => {
            const personaA = userMap[a.user_id] || a.user_id;
            const personaB = userMap[b.user_id] || b.user_id;
            return cmpEs(personaA, personaB) || cmpEs(safeDate(a.requested_date_key), safeDate(b.requested_date_key));
        });
        ordered.forEach((r) => {
            rows.push([
                r.id.toString(),
                userMap[r.user_id] || r.user_id,
                r.requested_date_key || '',
                r.scheduled_date_key || '',
                r.status || '',
                (r.comments || []).length.toString(),
            ]);
        });
        openPdf('Histórico de formaciones', headers, rows, 'lunaris-formaciones.pdf', 'Solicitudes y estados de formaciones');
    }

    function exportMeetings() {
        const headers = [
            'ID',
            'Creada por',
            'Fecha creación',
            'Título',
            'Descripción',
            'Fecha preferida',
            'Franja',
            'Participantes',
            'Estado',
            'Fecha programada',
            'Nota respuesta',
        ];
        const rows: Array<Array<string | number>> = [];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const ordered = [...meetingRequests].sort((a, b) => {
            const personaA = userMap[a.created_by] || a.created_by;
            const personaB = userMap[b.created_by] || b.created_by;
            return cmpEs(personaA, personaB) || cmpEs(safeDate(a.created_at), safeDate(b.created_at));
        });
        ordered.forEach((m) => {
            const participantsNames = (m.participants || [])
                .map((id: string) => userMap[id] || id)
                .join(' / ');
            rows.push([
                m.id.toString(),
                userMap[m.created_by] || m.created_by,
                m.created_at || '',
                m.title || '',
                (m.description || '').replace(/\n/g, ' '),
                m.preferred_date_key || '',
                m.preferred_slot || '',
                participantsNames,
                m.status || '',
                m.scheduled_date_key || '',
                (m.response_message || '').replace(/\n/g, ' '),
            ]);
        });
        openPdf('Histórico de reuniones', headers, rows, 'lunaris-reuniones.pdf', 'Reuniones creadas, participantes y estados');
    }

    function exportAbsences() {
        const headers = ['Solicitud ID', 'Persona', 'Fecha permiso', 'Motivo', 'Estado', 'Nota respuesta', 'Fecha solicitud'];
        const rows: Array<Array<string | number>> = [];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const ordered = [...absenceRequests].sort((a, b) => {
            const personaA = userMap[a.created_by] || a.created_by;
            const personaB = userMap[b.created_by] || b.created_by;
            return cmpEs(personaA, personaB) || cmpEs(safeDate(a.date_key), safeDate(b.date_key));
        });
        ordered.forEach((r) => {
            rows.push([
                r.id.toString(),
                userMap[r.created_by] || r.created_by,
                r.date_key || '',
                (r.reason || '').replace(/\n/g, ' '),
                r.status || '',
                (r.response_message || '').replace(/\n/g, ' '),
                r.created_at || '',
            ]);
        });
        openPdf('Histórico de permisos especiales', headers, rows, 'lunaris-permisos-especiales.pdf', 'Ausencias y permisos registrados');
    }

    function exportTodos() {
        const headers = ['ID', 'Título', 'Descripción', 'Creada por', 'Asignada a', 'Fecha creación', 'Fecha objetivo', 'Completada por'];
        const rows: Array<Array<string | number>> = [];
        const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));
        const ordered = [...todos].sort((a, b) => {
            const personaA = userMap[a.created_by] || a.created_by;
            const personaB = userMap[b.created_by] || b.created_by;
            return cmpEs(personaA, personaB) || cmpEs(safeDate(a.created_at), safeDate(b.created_at));
        });
        ordered.forEach((t) => {
            const assignedNames = (t.assigned_to || [])
                .map((id: string) => userMap[id] || id)
                .join(' / ');
            const completedNames = (t.completed_by || [])
                .map((id: string) => userMap[id] || id)
                .join(' / ');
            rows.push([
                t.id,
                t.title || '',
                (t.description || '').replace(/\n/g, ' '),
                userMap[t.created_by] || t.created_by,
                assignedNames,
                t.created_at || '',
                t.due_date_key || '',
                completedNames,
            ]);
        });
        openPdf('Histórico de tareas', headers, rows, 'lunaris-tareas.pdf', 'Listado de tareas con asignaciones y estados');
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
        </>
    );
}
