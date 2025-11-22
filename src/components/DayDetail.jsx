import React, { useState, useEffect } from 'react';
import { USERS } from '../constants';
import { toDateKey, formatDatePretty, formatTimeNow } from '../utils/dateUtils';
import { getStatusBadgeProps } from '../utils/statusUtils';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useMeetings } from '../hooks/useMeetings';
import { useAbsences } from '../hooks/useAbsences';
import { useNotifications } from '../hooks/useNotifications';

/**
 * Panel día: vista admin o vista usuario normal
 */
export default function DayDetail({
    date,
    isAdminView,
}) {
    const { currentUser: user } = useAuth();
    const { timeData, updateTimeEntry } = useTimeData();
    const {
        trainingRequests,
        createTrainingRequest,
        addTrainingComment,
        updateTrainingStatus,
        deleteTrainingRequest
    } = useTraining(user);
    const {
        meetingRequests,
        createMeeting,
        deleteMeeting
    } = useMeetings(user);
    const {
        absenceRequests,
        createAbsence,
        deleteAbsence
    } = useAbsences(user);
    const { addNotification } = useNotifications(user);

    const [messageDrafts, setMessageDrafts] = useState({});
    const [meetingFormOpen, setMeetingFormOpen] = useState(false);
    const [meetingTitle, setMeetingTitle] = useState("");
    const [meetingDescription, setMeetingDescription] = useState("");
    const [meetingPreferredSlot, setMeetingPreferredSlot] =
        useState("indiferente");
    const [meetingParticipants, setMeetingParticipants] = useState(() =>
        user?.id === "thalia" ? ["thalia"] : [user?.id, "thalia"]
    );

    useEffect(() => {
        if (user) {
            setMeetingParticipants(
                user.id === "thalia" ? ["thalia"] : [user.id, "thalia"]
            );
        }
    }, [user?.id]);

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

    // Derived state
    const isTrainingManager = !!user.isTrainingManager;
    const canRequestTraining = !isTrainingManager;

    const trainingRequestsForDay = trainingRequests.filter(
        (r) => r.scheduledDateKey === key
    );

    const meetingRequestsForUser = meetingRequests.filter(
        (m) =>
            m.createdBy === user.id ||
            (m.participants || []).includes(user.id)
    );

    const absenceRequestsForDay = absenceRequests.filter(
        (r) => r.createdBy === user.id && r.dateKey === key
    );

    // Handlers
    function updateRecord(userId, updater) {
        updateTimeEntry({ date, userId, updater });
    }

    function handleMarkEntry() {
        updateRecord(user.id, (r) => ({
            ...r,
            entry: formatTimeNow(),
            status: "present",
        }));
        addNotification({ message: `Has fichado tu entrada (${formatTimeNow()}).` });
    }

    function handleMarkExit() {
        updateRecord(user.id, (r) => ({
            ...r,
            exit: formatTimeNow(),
            status: r.status || "present",
        }));
        addNotification({ message: `Has fichado tu salida (${formatTimeNow()}). ¡Hasta luego! 🌙` });
    }

    function handleMarkAbsent() {
        updateRecord(user.id, (r) => ({
            ...r,
            status: "absent",
        }));
    }

    function handleRequestVacation() {
        updateRecord(user.id, (r) => ({
            ...r,
            status: "vacation-request",
        }));
    }

    function handleApproveVacation(userId) {
        updateRecord(userId, (r) => ({
            ...r,
            status: "vacation",
        }));
    }

    function handleUpdateNote(note) {
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

    async function handleCreateTrainingRequest() {
        // Evitar duplicados en el mismo día
        const already = trainingRequests.find(
            (r) => r.userId === user.id && r.scheduledDateKey === key
        );
        if (already) return;

        try {
            await createTrainingRequest({ dateKey: key });
            await addNotification({ message: `Has solicitado formación para el día ${key}.` });
        } catch (e) {
            console.error("Unexpected error creating training_request", e);
        }
    }

    async function handleAcceptTraining(id) {
        try {
            await updateTrainingStatus({ id, status: "accepted" });
        } catch (e) {
            console.error("Unexpected error updating training_request status", e);
        }
    }

    async function handleRescheduleTraining(id) {
        const req = trainingRequests.find((r) => r.id === id);
        if (!req) return;
        const current = req.scheduledDateKey || req.requestedDateKey;
        const newDateStr = window.prompt(
            "Escribe la nueva fecha en formato AAAA-MM-DD",
            current
        );
        if (!newDateStr) return;

        try {
            await updateTrainingStatus({
                id,
                status: "rescheduled",
                scheduledDateKey: newDateStr,
            });
        } catch (e) {
            console.error("Unexpected error rescheduling training_request", e);
        }
    }

    async function sendMessage(requestId) {
        const text = messageDrafts[requestId] || "";
        if (!text.trim()) return;

        try {
            await addTrainingComment({ requestId, text: text.trim() });
            setMessageDrafts((prev) => ({ ...prev, [requestId]: "" }));
        } catch (e) {
            console.error("Unexpected error updating training_request comments", e);
        }
    }

    function handleToggleParticipant(id) {
        setMeetingParticipants((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    async function handleMeetingSubmit(e) {
        e.preventDefault();
        const title = meetingTitle.trim();
        if (!title || meetingParticipants.length === 0) return;

        try {
            await createMeeting({
                title,
                description: meetingDescription.trim(),
                preferredDateKey: key,
                preferredSlot: meetingPreferredSlot,
                participants: meetingParticipants,
            });

            setMeetingTitle("");
            setMeetingDescription("");
            setMeetingPreferredSlot("indiferente");
            setMeetingFormOpen(false);
            setMeetingParticipants(
                user.id === "thalia" ? ["thalia"] : [user.id, "thalia"]
            );
        } catch (e) {
            console.error("Unexpected error creating meeting_request", e);
        }
    }

    async function handleSpecialAbsence() {
        const motivo = window.prompt(
            "Describe brevemente el motivo del permiso especial para este día:"
        );
        if (!motivo || !motivo.trim()) return;

        try {
            await createAbsence({ reason: motivo.trim(), dateKey: key });
            await addNotification({ message: `Has solicitado un permiso especial para el día ${key}.` });
        } catch (e) {
            console.error("Unexpected error creating absence_request", e);
        }
    }

    // Vista ADMIN (Anabella gestionando fichajes)
    if (isAdminView) {
        return (
            <div className="rounded-2xl border-2 border-border bg-card p-3">
                <h3>Resumen del día</h3>
                <div className="text-xs text-[#666] mb-2">{formatDatePretty(date)}</div>

                {USERS.map((u) => {
                    const record = byDay[u.id] || {};
                    const statusProps = getStatusBadgeProps(record.status);
                    return (
                        <div
                            key={u.id}
                            className="border-t border-[#eee] pt-1.5 mt-1.5"
                        >
                            <div
                                className="flex justify-between items-center"
                            >
                                <strong>{u.name}</strong>
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
    const record = byDay[user.id] || {};
    const statusProps = getStatusBadgeProps(record.status);

    // Formación
    const myTrainingForDay = trainingRequestsForDay.filter(
        (req) => req.userId === user.id
    );

    return (
        <div className="rounded-2xl border-2 border-border bg-card p-3">
            <h3>{user.name}</h3>
            <div className="text-xs text-[#666] mb-2">{formatDatePretty(date)}</div>

            {statusProps && (
                <div className={"inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-xs border border-border mb-1.5 " + statusProps.className}>
                    {statusProps.label}
                </div>
            )}

            {/* Panel de formación */}
            {isTrainingManager ? (
                <div className="mt-2 p-2 rounded-xl border border-dashed border-[#a855f7] bg-[#faf5ff] text-xs">
                    <strong>Solicitudes de formación</strong>
                    {trainingRequestsForDay.length === 0 ? (
                        <p className="text-xs text-[#666]">
                            No hay solicitudes de formación para este día.
                        </p>
                    ) : (
                        trainingRequestsForDay.map((req) => {
                            const person = USERS.find((u) => u.id === req.userId);
                            const comments = req.comments || [];
                            return (
                                <div key={req.id} className="border-t border-[#e5e7eb] pt-1 mt-1">
                                    <div
                                        className="flex justify-between"
                                    >
                                        <span>
                                            <strong>{person?.name || req.userId}</strong>
                                        </span>
                                        <span className="inline-flex items-center px-2 py-[2px] rounded-full border border-border text-[0.7rem] bg-[#eef2ff] mt-1">
                                            {req.status === "pending" && "Pendiente"}
                                            {req.status === "accepted" && "Aceptada"}
                                            {req.status === "rescheduled" && "Reprogramada"}
                                        </span>
                                    </div>

                                    {req.status === "rescheduled" &&
                                        req.scheduledDateKey !== req.requestedDateKey && (
                                            <p className="text-xs text-[#666]">
                                                Reprogramada para el día {req.scheduledDateKey}.
                                            </p>
                                        )}

                                    {/* Chat formación (Esteban) */}
                                    <div className="mt-1.5 rounded-[10px] border border-[#e5e7eb] bg-white p-1.5 max-h-[180px] flex flex-col gap-1">
                                        <div className="flex-1 overflow-y-auto pr-1">
                                            {comments.length === 0 && (
                                                <p className="text-xs text-[#666]">
                                                    Aún no hay mensajes. Puedes escribir para coordinar la
                                                    hora o el contenido de la formación.
                                                </p>
                                            )}
                                            {comments.map((c, idx) => {
                                                const isMe = c.by === user.id;
                                                const author = USERS.find((u) => u.id === c.by);
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={
                                                            "flex flex-col mb-1 " + (isMe ? "items-end" : "items-start")
                                                        }
                                                    >
                                                        <div
                                                            className={
                                                                "inline-block px-2 py-1.5 rounded-[10px] border border-border text-xs max-w-full " + (isMe ? "bg-[#dcfce7] self-end" : "bg-[#eef2ff]")
                                                            }
                                                        >
                                                            <strong>{author?.name || c.by}</strong>
                                                            <br />
                                                            {c.text}
                                                        </div>
                                                        <div className="text-[0.65rem] text-[#666] mt-[2px]">{c.at}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="flex gap-1 mt-1">
                                            <input
                                                type="text"
                                                className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-sm font-inherit"
                                                placeholder="Escribe un mensaje..."
                                                value={messageDrafts[req.id] || ""}
                                                onChange={(e) =>
                                                    setMessageDrafts((prev) => ({
                                                        ...prev,
                                                        [req.id]: e.target.value,
                                                    }))
                                                }
                                            />
                                            <button
                                                type="button"
                                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5"
                                                onClick={() => sendMessage(req.id)}
                                            >
                                                Enviar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-1.5 mt-1.5">
                                        <button
                                            type="button"
                                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5"
                                            onClick={() => handleAcceptTraining(req.id)}
                                        >
                                            Aceptar
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                                            onClick={() => handleRescheduleTraining(req.id)}
                                        >
                                            Reprogramar
                                        </button>
                                        {req.userId === user.id && (
                                            <button
                                                type="button"
                                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] border-[#fecaca] hover:bg-[#fecaca]"
                                                onClick={() => deleteTrainingRequest(req.id)}
                                            >
                                                Eliminar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                canRequestTraining && (
                    <div className="mt-2 p-2 rounded-xl border border-dashed border-[#a855f7] bg-[#faf5ff] text-xs">
                        <strong>Formación en servicios digitales</strong>
                        {myTrainingForDay.length === 0 ? (
                            <>
                                <p className="text-xs text-[#666]">
                                    Puedes solicitar una formación para este día. Esteban revisará
                                    y la aceptará o te propondrá otra fecha.
                                </p>
                                <button
                                    type="button"
                                    className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5"
                                    onClick={handleCreateTrainingRequest}
                                >
                                    Solicitar formación
                                </button>
                            </>
                        ) : (
                            myTrainingForDay.map((req) => {
                                const comments = req.comments || [];
                                return (
                                    <div key={req.id} className="border-t border-[#e5e7eb] pt-1 mt-1">
                                        <p className="text-xs text-[#666]">
                                            Has solicitado formación para este día.
                                        </p>
                                        <p className="text-xs text-[#666]">
                                            Estado:{" "}
                                            <strong>
                                                {req.status === "pending" &&
                                                    "Pendiente de respuesta"}
                                                {req.status === "accepted" && "Aceptada"}
                                                {req.status === "rescheduled" &&
                                                    `Reprogramada para el día ${req.scheduledDateKey}`}
                                            </strong>
                                        </p>
                                        <button
                                            type="button"
                                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] border-[#fecaca] hover:bg-[#fecaca] mt-1.5"
                                            onClick={() => deleteTrainingRequest(req.id)}
                                        >
                                            Eliminar solicitud
                                        </button>

                                        {/* Chat formación (persona solicitante) */}
                                        <div className="mt-1.5 rounded-[10px] border border-[#e5e7eb] bg-white p-1.5 max-h-[180px] flex flex-col gap-1">
                                            <div className="flex-1 overflow-y-auto pr-1">
                                                {comments.length === 0 && (
                                                    <p className="text-xs text-[#666]">
                                                        Puedes escribir a Esteban para acordar la hora o
                                                        detalles de la formación.
                                                    </p>
                                                )}
                                                {comments.map((c, idx) => {
                                                    const isMe = c.by === user.id;
                                                    const author = USERS.find((u) => u.id === c.by);
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={
                                                                "flex flex-col mb-1 " + (isMe ? "items-end" : "items-start")
                                                            }
                                                        >
                                                            <div
                                                                className={
                                                                    "inline-block px-2 py-1.5 rounded-[10px] border border-border text-xs max-w-full " +
                                                                    (isMe ? "bg-[#dcfce7] self-end" : "bg-[#eef2ff]")
                                                                }
                                                            >
                                                                <strong>{author?.name || c.by}</strong>
                                                                <br />
                                                                {c.text}
                                                            </div>
                                                            <div className="text-[0.65rem] text-[#666] mt-[2px]">{c.at}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex gap-1 mt-1">
                                                <input
                                                    type="text"
                                                    className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-sm font-inherit"
                                                    placeholder="Escribe un mensaje..."
                                                    value={messageDrafts[req.id] || ""}
                                                    onChange={(e) =>
                                                        setMessageDrafts((prev) => ({
                                                            ...prev,
                                                            [req.id]: e.target.value,
                                                        }))
                                                    }
                                                />
                                                <button
                                                    type="button"
                                                    className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5"
                                                    onClick={() => sendMessage(req.id)}
                                                >
                                                    Enviar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )
            )}

            {/* Panel de reuniones generales */}
            <div className="rounded-xl border border-dashed border-[#bbb] p-2 mt-2 bg-[#fffdf6] text-xs">
                <strong>Reuniones generales</strong>
                <p className="text-xs text-[#666]">
                    Solicita una reunión contigo, con Thalia o con varias personas del
                    equipo.
                </p>

                {!meetingFormOpen ? (
                    <button
                        type="button"
                        className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5"
                        onClick={() => setMeetingFormOpen(true)}
                    >
                        Solicitar reunión
                    </button>
                ) : (
                    <form onSubmit={handleMeetingSubmit} className="mt-1.5">
                        <div className="text-xs font-semibold mt-1">Título</div>
                        <input
                            className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-sm font-inherit"
                            value={meetingTitle}
                            onChange={(e) => setMeetingTitle(e.target.value)}
                            placeholder="Ej.: Reunión de seguimiento, dudas de proyecto..."
                            required
                        />

                        <div className="text-xs font-semibold mt-1">Motivo / descripción</div>
                        <textarea
                            className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-[0.85rem] font-inherit resize-y min-h-[40px] max-h-[120px]"
                            value={meetingDescription}
                            onChange={(e) => setMeetingDescription(e.target.value)}
                            placeholder="¿Qué quieres tratar en la reunión?"
                        />

                        <div className="text-xs font-semibold mt-1">Franja horaria preferida</div>
                        <select
                            className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-sm font-inherit"
                            value={meetingPreferredSlot}
                            onChange={(e) => setMeetingPreferredSlot(e.target.value)}
                        >
                            <option value="mañana">Mañana</option>
                            <option value="tarde">Tarde</option>
                            <option value="indiferente">Indiferente</option>
                        </select>

                        <div className="text-xs font-semibold mt-1">Personas que deberían estar</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {USERS.map((u) => (
                                <label key={u.id} className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full border border-[#e5e7eb] bg-white text-[0.75rem]">
                                    <input
                                        type="checkbox"
                                        checked={meetingParticipants.includes(u.id)}
                                        onChange={() => handleToggleParticipant(u.id)}
                                    />
                                    {u.name}
                                </label>
                            ))}
                        </div>

                        <button
                            type="submit"
                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark mt-1.5"
                        >
                            Enviar solicitud
                        </button>
                        <button
                            type="button"
                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5 mt-1.5 ml-1.5"
                            onClick={() => setMeetingFormOpen(false)}
                        >
                            Cancelar
                        </button>
                    </form>
                )}

                {meetingRequestsForUser && meetingRequestsForUser.length > 0 && (
                    <>
                        <div className="text-xs font-semibold mt-1" style={{ marginTop: 8 }}>
                            Tus solicitudes de reunión
                        </div>
                        {meetingRequestsForUser.map((m) => (
                            <div key={m.id} className="text-xs text-[#666]" style={{ marginTop: 2 }}>
                                • {m.title} —{" "}
                                {m.status === "pending" && "Pendiente de revisión"}
                                {m.status === "scheduled" &&
                                    `Programada (fecha preferida: ${m.preferredDateKey})`}
                                {m.status === "rejected" &&
                                    `Rechazada${m.responseMessage ? `: ${m.responseMessage}` : ""
                                    }`}
                                {m.createdBy === user.id && (
                                    <button
                                        type="button"
                                        className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] border-[#fecaca] hover:bg-[#fecaca] ml-1.5"
                                        onClick={() => deleteMeeting(m.id)}
                                    >
                                        Eliminar
                                    </button>
                                )}
                            </div>
                        ))}
                    </>
                )}
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
                    className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-[0.85rem] font-inherit resize-y min-h-[40px] max-h-[120px]"
                    value={record.note || ""}
                    onChange={(e) => handleUpdateNote(e.target.value)}
                    placeholder="Ej.: cita médica, visita familiar, retraso por tráfico…"
                />
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
                <button
                    className="rounded-full border-2 border-border px-3.5 py-2 text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark w-full justify-center"
                    type="button"
                    onClick={handleMarkEntry}
                >
                    Fichar entrada ({formatTimeNow()})
                </button>
                <button className="rounded-full border-2 border-border px-3.5 py-2 text-sm font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5 w-full justify-center" type="button" onClick={handleMarkExit}>
                    Fichar salida ({formatTimeNow()})
                </button>

                <div className="rounded-xl border border-dashed border-[#bbb] p-2 mt-1.5 bg-[#fffdf6] text-xs">
                    <strong>Ausencias y vacaciones</strong>
                    <p className="text-xs text-[#666]">
                        Úsalo para días completos. Si solo fue media jornada, explícalo en
                        la nota.
                    </p>
                    <div className="flex items-center justify-between gap-2.5">
                        <button
                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5"
                            type="button"
                            onClick={handleMarkAbsent}
                        >
                            Marcar ausencia
                        </button>
                        <button
                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5"
                            type="button"
                            onClick={handleRequestVacation}
                        >
                            Solicitar vacaciones
                        </button>
                    </div>

                    {record.status === "vacation-request" && (
                        <button
                            type="button"
                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5 w-full mt-1.5"
                            onClick={handleCancelVacationRequest}
                        >
                            Cancelar solicitud de vacaciones
                        </button>
                    )}

                    <button
                        type="button"
                        className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5 w-full mt-1.5"
                        onClick={handleSpecialAbsence}
                    >
                        Solicitar permiso especial a Thalia
                    </button>

                    {absenceRequestsForDay && absenceRequestsForDay.length > 0 && (
                        <div className="text-xs text-[#666]" style={{ marginTop: 4 }}>
                            {absenceRequestsForDay.map((r) => (
                                <div key={r.id}>
                                    Has solicitado un permiso especial para este día. Estado:{" "}
                                    <strong>
                                        {r.status === "pending" && "Pendiente"}
                                        {r.status === "approved" && "Aprobado"}
                                        {r.status === "rejected" && "Rechazado"}
                                    </strong>
                                    {r.responseMessage &&
                                        ` · Mensaje de Thalia: ${r.responseMessage}`}
                                    <div className="text-xs text-[#666]">
                                        Motivo: {r.reason}
                                    </div>
                                    {r.createdBy === user.id && (
                                        <button
                                            type="button"
                                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] border-[#fecaca] hover:bg-[#fecaca] mt-1.5"
                                            onClick={() => deleteAbsence(r.id)}
                                        >
                                            Eliminar
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
