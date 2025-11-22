import React, { useState, useEffect } from 'react';
import { USERS } from '../constants';
import { toDateKey, formatDatePretty, formatTimeNow } from '../utils/dateUtils';
import { getStatusBadgeProps } from '../utils/statusUtils';

/**
 * Panel día: vista admin o vista usuario normal
 */
export default function DayDetail({
    user,
    date,
    data,
    onMarkEntry,
    onMarkExit,
    onMarkAbsent,
    onRequestVacation,
    onApproveVacation,
    onUpdateNote,
    isAdminView,
    isTrainingManager,
    canRequestTraining,
    trainingRequestsForDay,
    onCreateTrainingRequest,
    onAcceptTraining,
    onRescheduleTraining,
    onAddTrainingComment,
    meetingRequestsForUser,
    onCreateMeetingRequest,
    absenceRequestsForDay,
    onCreateAbsenceRequest,
    onDeleteTrainingRequest,
    onDeleteMeetingRequest,
    onDeleteAbsenceRequest,
    onCancelVacationRequest,
}) {
    const [messageDrafts, setMessageDrafts] = useState({});
    const [meetingFormOpen, setMeetingFormOpen] = useState(false);
    const [meetingTitle, setMeetingTitle] = useState("");
    const [meetingDescription, setMeetingDescription] = useState("");
    const [meetingPreferredSlot, setMeetingPreferredSlot] =
        useState("indiferente");
    const [meetingParticipants, setMeetingParticipants] = useState(() =>
        user.id === "thalia" ? ["thalia"] : [user.id, "thalia"]
    );

    useEffect(() => {
        setMeetingParticipants(
            user.id === "thalia" ? ["thalia"] : [user.id, "thalia"]
        );
    }, [user.id]);

    if (!date) {
        return (
            <div className="day-card">
                <h3>Sin día seleccionado</h3>
                <p className="small-muted">
                    Elige un día del calendario para ver o registrar información.
                </p>
            </div>
        );
    }

    const key = toDateKey(date);
    const byDay = data[key] || {};

    function sendMessage(requestId) {
        const text = messageDrafts[requestId] || "";
        if (!text.trim()) return;
        onAddTrainingComment(requestId, text);
        setMessageDrafts((prev) => ({ ...prev, [requestId]: "" }));
    }

    function handleToggleParticipant(id) {
        setMeetingParticipants((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    function handleMeetingSubmit(e) {
        e.preventDefault();
        const title = meetingTitle.trim();
        if (!title || meetingParticipants.length === 0) return;
        const payload = {
            title,
            description: meetingDescription.trim(),
            preferredDateKey: toDateKey(date),
            preferredSlot: meetingPreferredSlot,
            participants: meetingParticipants,
        };
        onCreateMeetingRequest(payload);
        setMeetingTitle("");
        setMeetingDescription("");
        setMeetingPreferredSlot("indiferente");
        setMeetingFormOpen(false);
        setMeetingParticipants(
            user.id === "thalia" ? ["thalia"] : [user.id, "thalia"]
        );
    }

    function handleSpecialAbsence() {
        const motivo = window.prompt(
            "Describe brevemente el motivo del permiso especial para este día:"
        );
        if (!motivo || !motivo.trim()) return;
        onCreateAbsenceRequest(motivo.trim());
    }

    // Vista ADMIN (Anabella gestionando fichajes)
    if (isAdminView) {
        return (
            <div className="day-card">
                <h3>Resumen del día</h3>
                <div className="day-date">{formatDatePretty(date)}</div>

                {USERS.map((u) => {
                    const record = byDay[u.id] || {};
                    const statusProps = getStatusBadgeProps(record.status);
                    return (
                        <div
                            key={u.id}
                            style={{
                                borderTop: "1px solid #eee",
                                paddingTop: 6,
                                marginTop: 6,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <strong>{u.name}</strong>
                                {statusProps && (
                                    <div className={"status-tag " + statusProps.className}>
                                        {statusProps.label}
                                    </div>
                                )}
                            </div>
                            <div className="field-label">Entrada</div>
                            <div className="field-value">
                                {record.entry || (
                                    <span className="small-muted">No registrada</span>
                                )}
                            </div>
                            <div className="field-label">Salida</div>
                            <div className="field-value">
                                {record.exit || (
                                    <span className="small-muted">No registrada</span>
                                )}
                            </div>
                            {record.note && (
                                <>
                                    <div className="field-label">Nota</div>
                                    <div className="field-value">{record.note}</div>
                                </>
                            )}
                            {record.status === "vacation-request" && (
                                <div style={{ marginTop: 4 }}>
                                    <button
                                        type="button"
                                        className="btn btn-small btn-primary"
                                        onClick={() => onApproveVacation(u.id)}
                                    >
                                        Aprobar vacaciones
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                <p className="small-muted" style={{ marginTop: 8 }}>
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
        <div className="day-card">
            <h3>{user.name}</h3>
            <div className="day-date">{formatDatePretty(date)}</div>

            {statusProps && (
                <div className={"status-tag " + statusProps.className}>
                    {statusProps.label}
                </div>
            )}

            {/* Panel de formación */}
            {isTrainingManager ? (
                <div className="training-panel">
                    <strong>Solicitudes de formación</strong>
                    {trainingRequestsForDay.length === 0 ? (
                        <p className="small-muted">
                            No hay solicitudes de formación para este día.
                        </p>
                    ) : (
                        trainingRequestsForDay.map((req) => {
                            const person = USERS.find((u) => u.id === req.userId);
                            const comments = req.comments || [];
                            return (
                                <div key={req.id} className="training-item">
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <span>
                                            <strong>{person?.name || req.userId}</strong>
                                        </span>
                                        <span className="badge-info">
                                            {req.status === "pending" && "Pendiente"}
                                            {req.status === "accepted" && "Aceptada"}
                                            {req.status === "rescheduled" && "Reprogramada"}
                                        </span>
                                    </div>

                                    {req.status === "rescheduled" &&
                                        req.scheduledDateKey !== req.requestedDateKey && (
                                            <p className="small-muted">
                                                Reprogramada para el día {req.scheduledDateKey}.
                                            </p>
                                        )}

                                    {/* Chat formación (Esteban) */}
                                    <div className="training-chat">
                                        <div className="training-messages">
                                            {comments.length === 0 && (
                                                <p className="small-muted">
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
                                                            "training-message " + (isMe ? "me" : "other")
                                                        }
                                                    >
                                                        <div
                                                            className={
                                                                "training-bubble " + (isMe ? "me" : "other")
                                                            }
                                                        >
                                                            <strong>{author?.name || c.by}</strong>
                                                            <br />
                                                            {c.text}
                                                        </div>
                                                        <div className="training-meta">{c.at}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="training-input-row">
                                            <input
                                                type="text"
                                                className="input"
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
                                                className="btn btn-small"
                                                onClick={() => sendMessage(req.id)}
                                            >
                                                Enviar
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                        <button
                                            type="button"
                                            className="btn btn-small"
                                            onClick={() => onAcceptTraining(req.id)}
                                        >
                                            Aceptar
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-small btn-ghost"
                                            onClick={() => onRescheduleTraining(req.id)}
                                        >
                                            Reprogramar
                                        </button>
                                        {req.userId === user.id && (
                                            <button
                                                type="button"
                                                className="btn btn-small btn-danger"
                                                onClick={() => onDeleteTrainingRequest(req.id)}
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
                    <div className="training-panel">
                        <strong>Formación en servicios digitales</strong>
                        {myTrainingForDay.length === 0 ? (
                            <>
                                <p className="small-muted">
                                    Puedes solicitar una formación para este día. Esteban revisará
                                    y la aceptará o te propondrá otra fecha.
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-small"
                                    onClick={onCreateTrainingRequest}
                                >
                                    Solicitar formación
                                </button>
                            </>
                        ) : (
                            myTrainingForDay.map((req) => {
                                const comments = req.comments || [];
                                return (
                                    <div key={req.id} className="training-item">
                                        <p className="small-muted">
                                            Has solicitado formación para este día.
                                        </p>
                                        <p className="small-muted">
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
                                            className="btn btn-small btn-danger"
                                            style={{ marginTop: 6 }}
                                            onClick={() => onDeleteTrainingRequest(req.id)}
                                        >
                                            Eliminar solicitud
                                        </button>

                                        {/* Chat formación (persona solicitante) */}
                                        <div className="training-chat">
                                            <div className="training-messages">
                                                {comments.length === 0 && (
                                                    <p className="small-muted">
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
                                                                "training-message " + (isMe ? "me" : "other")
                                                            }
                                                        >
                                                            <div
                                                                className={
                                                                    "training-bubble " +
                                                                    (isMe ? "me" : "other")
                                                                }
                                                            >
                                                                <strong>{author?.name || c.by}</strong>
                                                                <br />
                                                                {c.text}
                                                            </div>
                                                            <div className="training-meta">{c.at}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="training-input-row">
                                                <input
                                                    type="text"
                                                    className="input"
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
                                                    className="btn btn-small"
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
            <div className="panel" style={{ marginTop: 8 }}>
                <strong>Reuniones generales</strong>
                <p className="field-note">
                    Solicita una reunión contigo, con Thalia o con varias personas del
                    equipo.
                </p>

                {!meetingFormOpen ? (
                    <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => setMeetingFormOpen(true)}
                    >
                        Solicitar reunión
                    </button>
                ) : (
                    <form onSubmit={handleMeetingSubmit} style={{ marginTop: 6 }}>
                        <div className="field-label">Título</div>
                        <input
                            className="input"
                            value={meetingTitle}
                            onChange={(e) => setMeetingTitle(e.target.value)}
                            placeholder="Ej.: Reunión de seguimiento, dudas de proyecto..."
                            required
                        />

                        <div className="field-label">Motivo / descripción</div>
                        <textarea
                            className="note-input"
                            value={meetingDescription}
                            onChange={(e) => setMeetingDescription(e.target.value)}
                            placeholder="¿Qué quieres tratar en la reunión?"
                        />

                        <div className="field-label">Franja horaria preferida</div>
                        <select
                            className="input"
                            value={meetingPreferredSlot}
                            onChange={(e) => setMeetingPreferredSlot(e.target.value)}
                        >
                            <option value="mañana">Mañana</option>
                            <option value="tarde">Tarde</option>
                            <option value="indiferente">Indiferente</option>
                        </select>

                        <div className="field-label">Personas que deberían estar</div>
                        <div className="todo-assignees">
                            {USERS.map((u) => (
                                <label key={u.id} className="todo-assignee-pill">
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
                            className="btn btn-small btn-primary"
                            style={{ marginTop: 6 }}
                        >
                            Enviar solicitud
                        </button>
                        <button
                            type="button"
                            className="btn btn-small btn-ghost"
                            style={{ marginTop: 6, marginLeft: 6 }}
                            onClick={() => setMeetingFormOpen(false)}
                        >
                            Cancelar
                        </button>
                    </form>
                )}

                {meetingRequestsForUser && meetingRequestsForUser.length > 0 && (
                    <>
                        <div className="field-label" style={{ marginTop: 8 }}>
                            Tus solicitudes de reunión
                        </div>
                        {meetingRequestsForUser.map((m) => (
                            <div key={m.id} className="small-muted" style={{ marginTop: 2 }}>
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
                                        className="btn btn-small btn-danger"
                                        style={{ marginLeft: 6 }}
                                        onClick={() => onDeleteMeetingRequest(m.id)}
                                    >
                                        Eliminar
                                    </button>
                                )}
                            </div>
                        ))}
                    </>
                )}
            </div>

            <div style={{ marginTop: 6 }}>
                <div className="field-label">Entrada</div>
                <div className="field-value">
                    {record.entry || (
                        <span className="small-muted">No registrada</span>
                    )}
                </div>

                <div className="field-label">Salida</div>
                <div className="field-value">
                    {record.exit || <span className="small-muted">No registrada</span>}
                </div>
            </div>

            <div style={{ marginTop: 6 }}>
                <div className="field-label">Nota / motivo (opcional)</div>
                <textarea
                    className="note-input"
                    value={record.note || ""}
                    onChange={(e) => onUpdateNote(e.target.value)}
                    placeholder="Ej.: cita médica, visita familiar, retraso por tráfico…"
                />
            </div>

            <div className="buttons-column">
                <button
                    className="btn btn-primary btn-full"
                    type="button"
                    onClick={onMarkEntry}
                >
                    Fichar entrada ({formatTimeNow()})
                </button>
                <button className="btn btn-full" type="button" onClick={onMarkExit}>
                    Fichar salida ({formatTimeNow()})
                </button>

                <div className="panel">
                    <strong>Ausencias y vacaciones</strong>
                    <p className="field-note">
                        Úsalo para días completos. Si solo fue media jornada, explícalo en
                        la nota.
                    </p>
                    <div className="flex-row">
                        <button
                            className="btn btn-small"
                            type="button"
                            onClick={onMarkAbsent}
                        >
                            Marcar ausencia
                        </button>
                        <button
                            className="btn btn-small"
                            type="button"
                            onClick={onRequestVacation}
                        >
                            Solicitar vacaciones
                        </button>
                    </div>

                    {record.status === "vacation-request" && (
                        <button
                            type="button"
                            className="btn btn-small btn-ghost"
                            style={{ marginTop: 6, width: "100%" }}
                            onClick={onCancelVacationRequest}
                        >
                            Cancelar solicitud de vacaciones
                        </button>
                    )}

                    <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        style={{ marginTop: 6, width: "100%" }}
                        onClick={handleSpecialAbsence}
                    >
                        Solicitar permiso especial a Thalia
                    </button>

                    {absenceRequestsForDay && absenceRequestsForDay.length > 0 && (
                        <div className="small-muted" style={{ marginTop: 4 }}>
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
                                    <div className="small-muted">
                                        Motivo: {r.reason}
                                    </div>
                                    {r.createdBy === user.id && (
                                        <button
                                            type="button"
                                            className="btn btn-small btn-danger"
                                            style={{ marginTop: 6 }}
                                            onClick={() => onDeleteAbsenceRequest(r.id)}
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
