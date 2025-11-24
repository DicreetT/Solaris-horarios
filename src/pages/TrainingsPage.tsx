import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTraining } from '../hooks/useTraining';
import { useNotificationsContext } from '../context/NotificationsContext';
import { USERS } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { Plus, GraduationCap, Calendar, MessageCircle, Trash2, XCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
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
    const { addNotification } = useNotificationsContext();

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showModal, setShowModal] = useState(false);
    const [messageDrafts, setMessageDrafts] = useState<Record<number, string>>({});

    const isTrainingManager = !!currentUser?.isTrainingManager;
    const selectedDateKey = toDateKey(selectedDate);

    // Admin view - all requests sorted by creation date
    const sortedRequests = [...trainingRequests].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // User view - all their requests sorted by date
    const userRequests = trainingRequests
        .filter((r) => r.user_id === currentUser.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        setSelectedDate(new Date(e.target.value + 'T00:00:00'));
    }

    async function handleCreateTrainingRequest() {
        // Check for existing request on the same day
        const already = trainingRequests.find(
            (r) => r.user_id === currentUser.id && r.scheduled_date_key === selectedDateKey
        );
        if (already) {
            alert('Ya tienes una solicitud de formación para este día.');
            return;
        }

        try {
            await createTrainingRequest({
                requested_date_key: selectedDateKey,
                comments: ''
            });
            await addNotification({
                message: `Has solicitado formación para el día ${selectedDateKey}.`
            });
            setShowModal(false);
        } catch (e) {
            console.error('Unexpected error creating training_request', e);
        }
    }

    async function handleAcceptTraining(id: number) {
        try {
            await updateTrainingStatus({ id, status: 'accepted' });
        } catch (e) {
            console.error('Unexpected error updating training_request status', e);
        }
    }

    async function handleRescheduleTraining(id: number) {
        const req = trainingRequests.find((r) => r.id === id);
        if (!req) return;

        const current = req.scheduled_date_key || req.requested_date_key;

        const newDateStr = window.prompt(
            'Escribe la nueva fecha en formato AAAA-MM-DD',
            current
        );
        if (!newDateStr) return;

        try {
            await updateTrainingStatus({
                id,
                status: 'rescheduled',
                scheduled_date_key: newDateStr
            });
        } catch (e) {
            console.error('Unexpected error rescheduling training_request', e);
        }
    }

    async function sendMessage(requestId: number) {
        const text = messageDrafts[requestId] || '';
        if (!text.trim()) return;

        try {
            await addTrainingComment({ requestId, text: text.trim() });
            setMessageDrafts((prev) => ({ ...prev, [requestId]: '' }));
        } catch (e) {
            console.error('Unexpected error updating training_request comments', e);
        }
    }

    async function handleDeleteTraining(id: number) {
        try {
            await deleteTrainingRequest(id);
            await addNotification({ message: 'Solicitud de formación eliminada.' });
        } catch (e) {
            console.error('Unexpected error deleting training', e);
        }
    }

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-blue-600">
                        <GraduationCap size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Formaciones
                        </h1>
                        <p className="text-gray-500 font-medium">
                            {isTrainingManager
                                ? 'Gestiona las solicitudes de formación del equipo'
                                : 'Solicita sesiones de formación con Esteban'}
                        </p>
                    </div>
                </div>
                {!isTrainingManager && (
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95"
                    >
                        <Plus size={20} />
                        Solicitar formación
                    </button>
                )}
            </div>

            {/* User view - training requests and create button */}
            {!isTrainingManager && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden mb-8">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Tus solicitudes</h2>
                        <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                            {userRequests.length} {userRequests.length === 1 ? 'solicitud' : 'solicitudes'}
                        </span>
                    </div>

                    <div className="p-6">
                        {userRequests.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                <GraduationCap size={48} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">No tienes solicitudes de formación.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {userRequests.map((req) => {
                                    const comments = req.comments || [];
                                    return (
                                        <div
                                            key={req.id}
                                            className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-blue-200 hover:shadow-md transition-all duration-200"
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="text-lg font-bold text-gray-900">
                                                            Formación para el día {req.scheduled_date_key || req.requested_date_key}
                                                        </h3>
                                                        <span className={`
                                                            inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                            ${req.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                            ${req.status === 'accepted' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                            ${req.status === 'rescheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                                                        `}>
                                                            {req.status === 'pending' && <Clock size={12} />}
                                                            {req.status === 'accepted' && <CheckCircle size={12} />}
                                                            {req.status === 'rescheduled' && <RefreshCw size={12} />}
                                                            {req.status === 'pending' && 'Pendiente'}
                                                            {req.status === 'accepted' && 'Aceptada'}
                                                            {req.status === 'rescheduled' && 'Reprogramada'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteTraining(req.id)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                    title="Eliminar solicitud"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>

                                            {/* Chat Section */}
                                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                                                <div className="flex items-center gap-2 mb-3 text-sm font-bold text-gray-700">
                                                    <MessageCircle size={16} />
                                                    Chat con Esteban
                                                </div>

                                                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                                    {comments.length === 0 && (
                                                        <p className="text-sm text-gray-400 italic text-center py-2">
                                                            No hay mensajes. Escribe para coordinar detalles.
                                                        </p>
                                                    )}
                                                    {comments.map((c: any, idx: number) => {
                                                        const isMe = c.by === currentUser.id;
                                                        const author = USERS.find((u) => u.id === c.by);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                                                            >
                                                                <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                                    {!isMe && <UserAvatar name={author?.name || c.by} size="xs" />}
                                                                    <div
                                                                        className={`
                                                                            px-3 py-2 rounded-2xl text-sm max-w-[85%]
                                                                            ${isMe
                                                                                ? 'bg-blue-100 text-blue-900 rounded-tr-none'
                                                                                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'
                                                                            }
                                                                        `}
                                                                    >
                                                                        {!isMe && (
                                                                            <div className="text-xs font-bold text-gray-500 mb-1">
                                                                                {author?.name || c.by}
                                                                            </div>
                                                                        )}
                                                                        {c.text}
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] text-gray-400 mt-1 px-1">
                                                                    {c.at}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        className="flex-1 rounded-xl border border-gray-200 p-2.5 text-sm focus:border-primary focus:outline-none transition-colors"
                                                        placeholder="Escribe un mensaje..."
                                                        value={messageDrafts[req.id] || ''}
                                                        onChange={(e) =>
                                                            setMessageDrafts((prev) => ({
                                                                ...prev,
                                                                [req.id]: e.target.value,
                                                            }))
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') sendMessage(req.id);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => sendMessage(req.id)}
                                                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-sm"
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
                </div>
            )}

            {/* Training Manager view (Esteban only) */}
            {isTrainingManager && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-blue-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-900">Panel de administración</h2>
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded border border-blue-200 font-bold">
                                MANAGER
                            </span>
                        </div>
                    </div>

                    <div className="p-6">
                        {sortedRequests.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">No hay solicitudes de formación por ahora.</p>
                        ) : (
                            <div className="space-y-4">
                                {sortedRequests.map((req) => {
                                    const person = USERS.find((u) => u.id === req.user_id);
                                    const comments = req.comments || [];
                                    return (
                                        <div key={req.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar name={person?.name} size="md" />
                                                    <div>
                                                        <h3 className="font-bold text-gray-900 text-lg">{person?.name || req.user_id}</h3>
                                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                                            <Calendar size={14} />
                                                            <span>Solicita: <strong>{req.requested_date_key}</strong></span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className={`
                                                    inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                    ${req.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                    ${req.status === 'accepted' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                    ${req.status === 'rescheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                                                `}>
                                                    {req.status === 'pending' && 'Pendiente'}
                                                    {req.status === 'accepted' && 'Aceptada'}
                                                    {req.status === 'rescheduled' && 'Reprogramada'}
                                                </span>
                                            </div>

                                            {req.status === 'rescheduled' &&
                                                req.scheduled_date_key !== req.requested_date_key && (
                                                    <div className="mb-4 bg-blue-50 text-blue-800 text-sm px-3 py-2 rounded-lg border border-blue-100 flex items-center gap-2">
                                                        <RefreshCw size={14} />
                                                        Reprogramada para el día <strong>{req.scheduled_date_key}</strong>
                                                    </div>
                                                )}

                                            {/* Chat Section */}
                                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-4">
                                                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                                    {comments.length === 0 && (
                                                        <p className="text-sm text-gray-400 italic text-center py-2">
                                                            No hay mensajes.
                                                        </p>
                                                    )}
                                                    {comments.map((c: any, idx: number) => {
                                                        const isMe = c.by === currentUser.id;
                                                        const author = USERS.find((u) => u.id === c.by);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                                                            >
                                                                <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                                    {!isMe && <UserAvatar name={author?.name || c.by} size="xs" />}
                                                                    <div
                                                                        className={`
                                                                            px-3 py-2 rounded-2xl text-sm max-w-[85%]
                                                                            ${isMe
                                                                                ? 'bg-blue-100 text-blue-900 rounded-tr-none'
                                                                                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'
                                                                            }
                                                                        `}
                                                                    >
                                                                        {!isMe && (
                                                                            <div className="text-xs font-bold text-gray-500 mb-1">
                                                                                {author?.name || c.by}
                                                                            </div>
                                                                        )}
                                                                        {c.text}
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] text-gray-400 mt-1 px-1">
                                                                    {c.at}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        className="flex-1 rounded-xl border border-gray-200 p-2.5 text-sm focus:border-primary focus:outline-none transition-colors"
                                                        placeholder="Escribe un mensaje..."
                                                        value={messageDrafts[req.id] || ''}
                                                        onChange={(e) =>
                                                            setMessageDrafts((prev) => ({
                                                                ...prev,
                                                                [req.id]: e.target.value,
                                                            }))
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') sendMessage(req.id);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => sendMessage(req.id)}
                                                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-sm"
                                                    >
                                                        Enviar
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 pt-2 border-t border-gray-100">
                                                <button
                                                    onClick={() => handleAcceptTraining(req.id)}
                                                    className="flex-1 py-2 px-3 rounded-xl bg-green-50 text-green-700 font-bold text-xs hover:bg-green-100 transition-colors border border-green-200"
                                                >
                                                    Aceptar
                                                </button>
                                                <button
                                                    onClick={() => handleRescheduleTraining(req.id)}
                                                    className="flex-1 py-2 px-3 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs hover:bg-blue-100 transition-colors border border-blue-200"
                                                >
                                                    Reprogramar
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTraining(req.id)}
                                                    className="flex-1 py-2 px-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs hover:bg-red-100 transition-colors border border-red-200"
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Training creation modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-[popIn_0.2s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Solicitar formación</h2>
                            <button
                                type="button"
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                                onClick={() => setShowModal(false)}
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        <p className="text-gray-500 mb-6 font-medium">
                            Solicita una formación con Esteban. Él revisará tu solicitud.
                        </p>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-gray-900 mb-2">Fecha deseada</label>
                            <input
                                type="date"
                                value={selectedDateKey}
                                onChange={handleDateChange}
                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                            />
                        </div>

                        <div className="mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                            <div className="text-blue-500 shrink-0 mt-0.5">
                                <Clock size={20} />
                            </div>
                            <p className="text-sm text-blue-800 font-medium">
                                La hora exacta se coordinará con Esteban mediante el chat una vez aceptada la solicitud.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateTrainingRequest}
                                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95"
                            >
                                Solicitar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TrainingsPage;
