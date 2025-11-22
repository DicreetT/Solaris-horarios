import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTraining } from '../hooks/useTraining';
import { useNotifications } from '../hooks/useNotifications';
import { USERS } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { Plus } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

/**
 * Trainings page
 * Allows users to request training sessions with date and time
 * Training manager (Esteban) can review, accept, or reschedule requests
 */
function TrainingsPage() {
    const { currentUser } = useAuth();
    const {
        trainingRequests,
        createTrainingRequest,
        addTrainingComment,
        updateTrainingStatus,
        deleteTrainingRequest
    } = useTraining(currentUser);
    const { addNotification } = useNotifications(currentUser);

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showModal, setShowModal] = useState(false);
    const [messageDrafts, setMessageDrafts] = useState({});

    const isTrainingManager = !!currentUser?.isTrainingManager;
    const selectedDateKey = toDateKey(selectedDate);

    // Admin view - all requests sorted by creation date
    const sortedRequests = [...trainingRequests].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // User view - all their requests sorted by date
    const userRequests = trainingRequests
        .filter((r) => r.userId === currentUser.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    function handleDateChange(e) {
        setSelectedDate(new Date(e.target.value + 'T00:00:00'));
    }

    async function handleCreateTrainingRequest() {
        // Check for existing request on the same day
        const already = trainingRequests.find(
            (r) => r.userId === currentUser.id && r.scheduledDateKey === selectedDateKey
        );
        if (already) {
            alert('Ya tienes una solicitud de formación para este día.');
            return;
        }

        try {
            await createTrainingRequest({
                dateKey: selectedDateKey
            });
            await addNotification({
                message: `Has solicitado formación para el día ${selectedDateKey}.`
            });
            setShowModal(false);
        } catch (e) {
            console.error('Unexpected error creating training_request', e);
        }
    }

    async function handleAcceptTraining(id) {
        try {
            await updateTrainingStatus({ id, status: 'accepted' });
        } catch (e) {
            console.error('Unexpected error updating training_request status', e);
        }
    }

    async function handleRescheduleTraining(id) {
        const req = trainingRequests.find((r) => r.id === id);
        if (!req) return;

        const current = req.scheduledDateKey || req.requestedDateKey;

        const newDateStr = window.prompt(
            'Escribe la nueva fecha en formato AAAA-MM-DD',
            current
        );
        if (!newDateStr) return;

        try {
            await updateTrainingStatus({
                id,
                status: 'rescheduled',
                scheduledDateKey: newDateStr
            });
        } catch (e) {
            console.error('Unexpected error rescheduling training_request', e);
        }
    }

    async function sendMessage(requestId) {
        const text = messageDrafts[requestId] || '';
        if (!text.trim()) return;

        try {
            await addTrainingComment({ requestId, text: text.trim() });
            setMessageDrafts((prev) => ({ ...prev, [requestId]: '' }));
        } catch (e) {
            console.error('Unexpected error updating training_request comments', e);
        }
    }

    async function handleDeleteTraining(id) {
        try {
            await deleteTrainingRequest(id);
            await addNotification({ message: 'Solicitud de formación eliminada.' });
        } catch (e) {
            console.error('Unexpected error deleting training', e);
        }
    }

    return (
        <div className="max-w-6xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Formación en Servicios Digitales</h1>
                <p className="text-[#666]">
                    {isTrainingManager
                        ? 'Gestiona las solicitudes de formación del equipo'
                        : 'Solicita sesiones de formación con Esteban'}
                </p>
            </div>

            {/* User view - training requests and create button */}
            {!isTrainingManager && (
                <>
                    {/* Training requests list */}
                    <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_rgba(0,0,0,0.2)] p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold">Tus solicitudes de formación</h2>
                            <button
                                onClick={() => setShowModal(true)}
                                className="rounded-full border-2 border-border px-4 py-2.5 text-sm font-semibold cursor-pointer inline-flex items-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors shadow-[2px_2px_0_rgba(0,0,0,0.2)]"
                            >
                                <Plus size={16} />
                                Solicitar formación
                            </button>
                        </div>

                        {userRequests.length === 0 ? (
                            <p className="text-sm text-[#666] italic">
                                No tienes solicitudes de formación.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {userRequests.map((req) => {
                                    const comments = req.comments || [];
                                    return (
                                        <div
                                            key={req.id}
                                            className="bg-[#faf5ff] border-2 border-border rounded-xl p-3"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <strong className="text-sm">
                                                        Formación para el día {req.scheduledDateKey}
                                                    </strong>
                                                    <div className="text-xs text-[#666] mt-1">
                                                        Estado:{' '}
                                                        <strong>
                                                            {req.status === 'pending' && 'Pendiente de respuesta'}
                                                            {req.status === 'accepted' && 'Aceptada'}
                                                            {req.status === 'rescheduled' &&
                                                                `Reprogramada para el día ${req.scheduledDateKey}`}
                                                        </strong>
                                                    </div>
                                                </div>
                                                {req.status === 'pending' && (
                                                    <button
                                                        type="button"
                                                        className="rounded-full border-2 border-[#fecaca] px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] hover:bg-[#fecaca] transition-colors"
                                                        onClick={() => handleDeleteTraining(req.id)}
                                                        title="Eliminar solicitud"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>

                                            {/* Chat */}
                                            <div className="mt-1.5 rounded-[10px] border border-[#e5e7eb] bg-white p-1.5 max-h-[180px] flex flex-col gap-1">
                                                <div className="flex-1 overflow-y-auto pr-1">
                                                    {comments.length === 0 && (
                                                        <p className="text-xs text-[#666]">
                                                            Puedes escribir a Esteban para acordar la hora o detalles de
                                                            la formación.
                                                        </p>
                                                    )}
                                                    {comments.map((c, idx) => {
                                                        const isMe = c.by === currentUser.id;
                                                        const author = USERS.find((u) => u.id === c.by);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={
                                                                    'flex flex-col mb-1 ' +
                                                                    (isMe ? 'items-end' : 'items-start')
                                                                }
                                                            >
                                                                <div
                                                                    className={
                                                                        'inline-block px-2 py-1.5 rounded-[10px] border border-border text-xs max-w-full ' +
                                                                        (isMe ? 'bg-[#dcfce7] self-end' : 'bg-[#eef2ff]')
                                                                    }
                                                                >
                                                                    <div className="flex items-center gap-1 mb-0.5">
                                                                        <UserAvatar name={author?.name} size="xs" />
                                                                        <strong>{author?.name || c.by}</strong>
                                                                    </div>
                                                                    <br />
                                                                    {c.text}
                                                                </div>
                                                                <div className="text-[0.65rem] text-[#666] mt-[2px]">
                                                                    {c.at}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex gap-1 mt-1">
                                                    <input
                                                        type="text"
                                                        className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-sm font-inherit"
                                                        placeholder="Escribe un mensaje..."
                                                        value={messageDrafts[req.id] || ''}
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
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Training Manager view (Esteban only) */}
            {isTrainingManager && (
                <div className="bg-card p-6 rounded-[24px] shadow-lg border-2 border-border">
                    <div className="text-lg font-bold mb-2">Solicitudes de formación</div>
                    <div className="text-sm text-[#444] mb-4 leading-relaxed">
                        Aquí ves las solicitudes de formación del equipo. Puedes aceptar, reprogramar
                        o coordinar detalles mediante el chat.
                    </div>

                    {sortedRequests.length === 0 ? (
                        <p className="text-xs text-[#666]">
                            No hay solicitudes de formación por ahora.
                        </p>
                    ) : (
                        sortedRequests.map((req) => {
                            const person = USERS.find((u) => u.id === req.userId);
                            const comments = req.comments || [];
                            return (
                                <div key={req.id} className="border-t border-[#e5e7eb] pt-1.5 mt-1.5">
                                    <div className="flex justify-between">
                                        <span className="flex items-center gap-2">
                                            <UserAvatar name={person?.name} size="sm" />
                                            <strong>{person?.name || req.userId}</strong>
                                        </span>
                                        <span className="inline-flex items-center px-2 py-[2px] rounded-full border border-border text-[0.7rem] bg-[#eef2ff] mt-1">
                                            {req.status === 'pending' && 'Pendiente'}
                                            {req.status === 'accepted' && 'Aceptada'}
                                            {req.status === 'rescheduled' && 'Reprogramada'}
                                        </span>
                                    </div>

                                    <div className="text-xs text-[#666] mt-0.5">
                                        Fecha solicitada: {req.requestedDateKey}
                                    </div>

                                    {req.status === 'rescheduled' &&
                                        req.scheduledDateKey !== req.requestedDateKey && (
                                            <p className="text-xs text-[#666]">
                                                Reprogramada para el día {req.scheduledDateKey}
                                            </p>
                                        )}

                                    {/* Chat */}
                                    <div className="mt-1.5 rounded-[10px] border border-[#e5e7eb] bg-white p-1.5 max-h-[180px] flex flex-col gap-1">
                                        <div className="flex-1 overflow-y-auto pr-1">
                                            {comments.length === 0 && (
                                                <p className="text-xs text-[#666]">
                                                    Aún no hay mensajes. Puedes escribir para coordinar la hora o el
                                                    contenido de la formación.
                                                </p>
                                            )}
                                            {comments.map((c, idx) => {
                                                const isMe = c.by === currentUser.id;
                                                const author = USERS.find((u) => u.id === c.by);
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={
                                                            'flex flex-col mb-1 ' + (isMe ? 'items-end' : 'items-start')
                                                        }
                                                    >
                                                        <div
                                                            className={
                                                                'inline-block px-2 py-1.5 rounded-[10px] border border-border text-xs max-w-full ' +
                                                                (isMe ? 'bg-[#dcfce7] self-end' : 'bg-[#eef2ff]')
                                                            }
                                                        >
                                                            <div className="flex items-center gap-1 mb-0.5">
                                                                <UserAvatar name={author?.name} size="xs" />
                                                                <strong>{author?.name || c.by}</strong>
                                                            </div>
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
                                                value={messageDrafts[req.id] || ''}
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
                                        <button
                                            type="button"
                                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] border-[#fecaca] hover:bg-[#fecaca]"
                                            onClick={() => handleDeleteTraining(req.id)}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Training creation modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-card border-2 border-border rounded-[20px] shadow-lg p-6 max-w-md w-full animate-[popIn_0.2s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold">Solicitar sesión de formación</h2>
                            <button
                                type="button"
                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5 hover:bg-[#fff8ee] transition-colors"
                                onClick={() => setShowModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-sm text-[#666] mb-4 leading-relaxed">
                            Solicita una formación con Esteban. Él revisará tu solicitud y la aceptará o te propondrá otra fecha.
                        </p>

                        <div className="mb-4">
                            <label className="block text-sm font-semibold mb-2">Fecha</label>
                            <input
                                type="date"
                                value={selectedDateKey}
                                onChange={handleDateChange}
                                className="w-full rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit bg-white focus:border-primary focus:outline-none"
                            />
                        </div>

                        <div className="mb-4">
                            <p className="text-sm text-[#666]">
                                💡 La hora exacta se coordinará con Esteban mediante el chat una vez aceptada la solicitud.
                            </p>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="rounded-full border-2 border-border px-4 py-2 text-sm font-semibold cursor-pointer bg-white hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateTrainingRequest}
                                className="rounded-full border-2 border-border px-4 py-2 text-sm font-semibold cursor-pointer bg-primary text-white hover:bg-primary-dark transition-colors shadow-[2px_2px_0_rgba(0,0,0,0.2)]"
                            >
                                ✨ Solicitar formación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TrainingsPage;
