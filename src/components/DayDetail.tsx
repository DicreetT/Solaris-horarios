import React, { useState, useEffect } from 'react';
import { USERS } from '../constants';
import { toDateKey, formatDatePretty, formatTimeNow } from '../utils/dateUtils';
import { getStatusBadgeProps } from '../utils/statusUtils';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useNotificationsContext } from '../context/NotificationsContext';
import { useAbsences } from '../hooks/useAbsences';
import { UserAvatar } from './UserAvatar';
import { TimeEntry } from '../types';

/**
 * Panel día: vista admin o vista usuario normal
 */
interface DayDetailProps {
    date: Date | null;
    isAdminView: boolean;
}

export default function DayDetail({
    date,
    isAdminView,
}: DayDetailProps) {
    const { currentUser: user } = useAuth();
    const { timeData, updateTimeEntry } = useTimeData();
    const { updateAbsenceStatus } = useAbsences(user);
    const { addNotification } = useNotificationsContext();

    const [messageDrafts, setMessageDrafts] = useState({});



    if (!date || !user) {
        return (
            <div className="rounded-2xl border-2 border-border bg-card p-3">
                <h3>Sin día seleccionado</h3>
                <p className="text-xs text-[#666]">
                    Elige un día del calendario para ver o registrar información.
                </p>
            </div>
        );
    }

    const key = toDateKey(date);
    const byDay = timeData[key] || {};



    // Handlers
    // Handlers
    function updateRecord(userId: string, updater: (r: TimeEntry) => Partial<TimeEntry>) {
        if (!date) return;
        const key = toDateKey(date);
        const dayEntries = timeData[key]?.[userId] || [];
        const record = dayEntries[0];

        if (!record) {
            console.error("Cannot update record: no entry found for user", userId);
            return;
        }

        const updates = updater(record);
        // Filter out null values to match Partial<TimeEntry> where properties are optional but not null (except where explicitly nullable)
        // Actually TimeEntry has nullable fields, so it's fine.
        // We need to cast updates to the specific type expected by updateTimeEntry if needed, 
        // but Partial<TimeEntry> should be compatible with Partial<{ entry: string; ... }> roughly.
        // Let's be specific for updateTimeEntry which expects specific fields.
        // The hook defines: updates: Partial<{ entry: string; exit: string; status: string; note: string }>

        const validUpdates: any = {};
        if (updates.entry !== undefined) validUpdates.entry = updates.entry;
        if (updates.exit !== undefined) validUpdates.exit = updates.exit;
        if (updates.status !== undefined) validUpdates.status = updates.status;
        if (updates.note !== undefined) validUpdates.note = updates.note;

        updateTimeEntry({ id: record.id, updates: validUpdates });
    }

    const handleApproveVacation = async (userId: string) => {
        // We need to find the absence request for this user and date.
        // This is complex because we don't have the absence ID here directly from timeData.
        // timeData stores 'vacation-request' status but maybe not the absence ID.
        // For now, I will just define the function to satisfy the usage, 
        // but log an error or TODO.
        console.error("handleApproveVacation not fully implemented - missing absence ID");
    };

    function handleUpdateNote(note: string) {
        updateRecord(user.id, (r) => ({
            ...r,
            note,
        }));
    }

    function handleCancelVacationRequest() {
        updateRecord(user.id, (r) => ({
            ...r,
            status: null,
        }));
    }







    // Vista ADMIN (Anabella gestionando fichajes)
    if (isAdminView) {
        return (
            <div className="rounded-2xl border-2 border-border bg-card p-3">
                <h3>Resumen del día</h3>
                <div className="text-xs text-[#666] mb-2">{formatDatePretty(date)}</div>

                {USERS.map((u) => {
                    const dayEntries = byDay[u.id] || [];
                    const record: TimeEntry = dayEntries[0] || {} as TimeEntry;
                    const statusProps = getStatusBadgeProps(record.status);
                    return (
                        <div
                            key={u.id}
                            className="border-t border-[#eee] pt-1.5 mt-1.5"
                        >
                            <div
                                className="flex justify-between items-center"
                            >
                                <div className="flex items-center gap-2">
                                    <UserAvatar name={u.name} size="xs" />
                                    <strong>{u.name}</strong>
                                </div>
                                {statusProps && (
                                    <div className={"inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-xs border border-border mb-1.5 " + statusProps.className}>
                                        {statusProps.label}
                                    </div>
                                )}
                            </div>
                            <div className="text-xs font-semibold mt-1">Entrada</div>
                            <div className="text-sm mb-1">
                                {record.entry || (
                                    <span className="text-xs text-[#666]">No registrada</span>
                                )}
                            </div>
                            <div className="text-xs font-semibold mt-1">Salida</div>
                            <div className="text-sm mb-1">
                                {record.exit || (
                                    <span className="text-xs text-[#666]">No registrada</span>
                                )}
                            </div>
                            {record.note && (
                                <>
                                    <div className="text-xs font-semibold mt-1">Nota</div>
                                    <div className="text-sm mb-1">{record.note}</div>
                                </>
                            )}
                            {record.status === "vacation-request" && (
                                <div className="mt-1">
                                    <button
                                        type="button"
                                        className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark"
                                        onClick={() => handleApproveVacation(u.id)}
                                    >
                                        Aprobar vacaciones
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                <p className="text-xs text-[#666] mt-2">
                    Los cambios de entrada/salida, ausencias y notas los hace cada persona
                    desde su propio usuario. Aquí solo puedes aprobar vacaciones y
                    revisar.
                </p>
            </div>
        );
    }

    // Vista USUARIO normal
    const myEntries = byDay[user.id] || [];
    const record: TimeEntry = myEntries[0] || {} as TimeEntry;
    const statusProps = getStatusBadgeProps(record.status);

    return (
        <div className="rounded-2xl border-2 border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
                <UserAvatar name={user.name} size="sm" />
                <h3 className="font-bold">{user.name}</h3>
            </div>
            <div className="text-xs text-[#666] mb-2">{formatDatePretty(date)}</div>

            {statusProps && (
                <div className={"inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-xs border border-border mb-1.5 " + statusProps.className}>
                    {statusProps.label}
                </div>
            )}

            {/* Note about meetings */}
            <div className="rounded-xl border border-dashed border-[#bbb] p-3 mt-2 bg-[#fffdf6] text-xs">
                <strong className="block mb-1">💼 Gestionar reuniones</strong>
                <p className="text-xs text-[#666]">
                    Para solicitar reuniones, visita la página de{" "}
                    <a href="/meetings" className="text-primary font-semibold underline">
                        Reuniones
                    </a>
                    {" "}donde podrás crear y gestionar tus solicitudes.
                </p>
            </div>

            <div className="mt-1.5">
                <div className="text-xs font-semibold mt-1">Entrada</div>
                <div className="text-sm mb-1">
                    {record.entry || (
                        <span className="text-xs text-[#666]">No registrada</span>
                    )}
                </div>

                <div className="text-xs font-semibold mt-1">Salida</div>
                <div className="text-sm mb-1">
                    {record.exit || <span className="text-xs text-[#666]">No registrada</span>}
                </div>
            </div>

            <div className="mt-1.5">
                <div className="text-xs font-semibold mt-1">Nota / motivo (opcional)</div>
                <textarea
                    className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-[0.85rem] font-inherit bg-white !text-black resize-y min-h-[40px] max-h-[120px]"
                    value={record.note || ""}
                    onChange={(e) => handleUpdateNote(e.target.value)}
                    placeholder="Ej.: cita médica, visita familiar, retraso por tráfico…"
                    style={{ color: '#000000' }}
                />
            </div>

            {/* Note about absences */}
            <div className="rounded-xl border border-dashed border-[#bbb] p-3 mt-2 bg-[#e0f2fe] text-xs">
                <strong className="block mb-1">💡 Gestionar ausencias</strong>
                <p className="text-xs text-[#666]">
                    Para solicitar ausencias o vacaciones, visita la página de {" "}
                    <a href="/absences" className="text-primary font-semibold underline">
                        Permisos de Ausencia
                    </a>
                    {" "} donde podrás seleccionar la fecha y crear tu solicitud.
                </p>
            </div>

            {/* Note about time tracking */}
            <div className="rounded-xl border border-dashed border-[#bbb] p-3 mt-2 bg-[#fff8ee] text-xs">
                <strong className="block mb-1">🕒 Gestionar registro de horario</strong>
                <p className="text-xs text-[#666]">
                    Para fichar tu entrada/salida y gestionar tus registros,
                    visita la página de {" "}
                    <a href="/time-tracking" className="text-primary font-semibold underline">
                        Registro de Horario
                    </a>.
                </p>
            </div>
        </div>
    );
}
