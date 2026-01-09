import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMeetings } from '../hooks/useMeetings';
import { USERS } from '../constants';
import { Meeting } from '../types';
import MeetingDetailModal from '../components/MeetingDetailModal';
import { toDateKey, isWeekend } from '../utils/dateUtils';
import { Plus, Users, Calendar, Clock, CheckCircle, XCircle, Trash2, MessageSquare, Paperclip } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { RoleBadge } from '../components/RoleBadge';
import { FileUploader, Attachment } from '../components/FileUploader';
import { useNotificationsContext } from '../context/NotificationsContext';

/**
 * Meetings page
 * Shows user's meeting requests and allows creating new ones via modal
 * Admin panel to manage all requests
 */
function MeetingsPage() {
    const { currentUser } = useAuth();
    const { meetingRequests, createMeeting, updateMeetingStatus, deleteMeeting } = useMeetings(currentUser);
    const { addNotification } = useNotificationsContext();

    const [showModal, setShowModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [meetingTitle, setMeetingTitle] = useState('');
    const [meetingDescription, setMeetingDescription] = useState('');
    const [meetingPreferredSlot, setMeetingPreferredSlot] = useState('indiferente');
    const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
    const [meetingAttachments, setMeetingAttachments] = useState<Attachment[]>([]);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

    const isAdmin = currentUser?.isAdmin;
    const selectedDateKey = toDateKey(selectedDate);

    // User's meetings sorted by creation date
    const userMeetings = meetingRequests
        .filter((m) => m.created_by === currentUser.id || (m.participants || []).includes(currentUser.id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // All meetings for admin view
    const sortedRequests = [...meetingRequests].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        const date = new Date(e.target.value + 'T00:00:00');
        if (isWeekend(date)) {
            alert('No se pueden programar reuniones los fines de semana.');
            return;
        }
        setSelectedDate(date);
    }

    function handleToggleParticipant(id: string) {
        setSelectedParticipants((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleCreateMeeting(e?: React.FormEvent | React.MouseEvent) {
        if (e) e.preventDefault();
        console.log("handleCreateMeeting called");

        const title = meetingTitle.trim();
        const description = meetingDescription.trim();

        if (!title || !description) {
            alert('Por favor, completa todos los campos obligatorios.');
            return;
        }

        setIsSubmitting(true);
        try {
            await createMeeting({
                title,
                description,
                preferred_date_key: selectedDateKey,
                preferred_slot: meetingPreferredSlot,
                participants: selectedParticipants,
                attachments: meetingAttachments
            });

            await addNotification({ message: `Reunión "${title}" programada para el ${selectedDateKey}.` });
            setShowModal(false);
            setMeetingTitle('');
            setMeetingDescription('');
            setMeetingPreferredSlot('indiferente');
            setSelectedParticipants([]);
            setMeetingAttachments([]);
        } catch (error: any) {
            console.error('Error creating meeting:', error);
            alert(`Error al crear la reunión: ${error.message || 'Error desconocido'}`);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-indigo-600">
                        <Users size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Reuniones/Sugerencias
                        </h1>
                        <p className="text-gray-500 font-medium">
                            {isAdmin
                                ? 'Gestiona las solicitudes de reunión del equipo'
                                : 'Gestiona tus solicitudes de reunión'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95"
                >
                    <Plus size={20} />
                    Solicitar reunión
                </button>
            </div>

            {/* User view - meetings list */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Tus solicitudes</h2>
                    <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                        {userMeetings.length} {userMeetings.length === 1 ? 'solicitud' : 'solicitudes'}
                    </span>
                </div>

                <div className="p-6">
                    {userMeetings.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <Users size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">No tienes solicitudes de reunión.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {userMeetings.map((m) => {
                                const participantsNames = (m.participants || [])
                                    .map((id: string) => USERS.find((u) => u.id === id)?.name || id)
                                    .join(", ");

                                return (
                                    <div
                                        key={m.id}
                                        className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md transition-all duration-200 cursor-pointer"
                                        onClick={() => setSelectedMeeting(m)}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="text-lg font-bold text-gray-900 truncate">{m.title}</h3>
                                                    <span className={`
                                                        inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                        ${m.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                        ${m.status === 'scheduled' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                        ${m.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                                        ${m.status === 'completed' ? 'bg-gray-100 text-gray-600 border-gray-200 line-through' : ''}
                                                    `}>
                                                        {m.status === 'pending' && <Clock size={12} />}
                                                        {m.status === 'scheduled' && <CheckCircle size={12} />}
                                                        {m.status === 'rejected' && <XCircle size={12} />}
                                                        {m.status === 'completed' && <CheckCircle size={12} />}
                                                        {m.status === 'pending' && "Pendiente"}
                                                        {m.status === 'scheduled' && "Programada"}
                                                        {m.status === 'rejected' && "Rechazada"}
                                                        {m.status === 'completed' && "Realizada"}
                                                    </span>
                                                </div>

                                                {m.description && (
                                                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                                                        {m.description}
                                                    </p>
                                                )}

                                                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                                    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                                                        <Calendar size={14} className="text-gray-400" />
                                                        <span className="font-medium">Pref: {m.preferred_date_key} ({m.preferred_slot})</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                                                        <Users size={14} className="text-gray-400" />
                                                        <div className="flex items-center gap-1">
                                                            {(m.participants || []).map((pid: string) => {
                                                                const p = USERS.find(u => u.id === pid);
                                                                return (
                                                                    <div key={pid} className="flex items-center gap-1" title={p?.name || pid}>
                                                                        <UserAvatar name={p?.name || pid} size="xs" />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                {m.response_message && (
                                                    <div className="mt-3 flex items-start gap-2 text-sm bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                        <MessageSquare size={16} className="text-gray-400 mt-0.5 shrink-0" />
                                                        <span className="text-gray-600"><span className="font-bold text-gray-700">Nota:</span> {m.response_message}</span>
                                                    </div>
                                                )}

                                                {m.attachments && m.attachments.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {m.attachments.map((file, idx) => (
                                                            <a
                                                                key={idx}
                                                                href={file.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-primary transition-colors"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <Paperclip size={12} />
                                                                <span className="truncate max-w-[150px]">{file.name}</span>
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}

                                            </div>

                                            {m.created_by === currentUser.id && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteMeeting(m.id); }}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                    title="Eliminar solicitud"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Admin view - all requests (Admin only) */}
            {isAdmin && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-900">Panel de administración</h2>
                            <RoleBadge role="admin" size="sm" />
                        </div>
                    </div>

                    <div className="p-6">
                        {sortedRequests.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">No hay solicitudes de reunión por ahora.</p>
                        ) : (
                            <div className="space-y-4">
                                {sortedRequests.map((m) => {
                                    const creator = USERS.find((u) => u.id === m.created_by);
                                    const participantsNames = (m.participants || [])
                                        .map((id: string) => USERS.find((u) => u.id === id)?.name || id)
                                        .join(", ");

                                    return (
                                        <div
                                            key={m.id}
                                            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors"
                                            onClick={() => setSelectedMeeting(m)}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar name={creator?.name} size="sm" />
                                                    <div>
                                                        <p className="font-bold text-gray-900">{creator?.name || m.created_by}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(m.created_at).toLocaleString("es-ES", {
                                                                dateStyle: "short",
                                                                timeStyle: "short",
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`
                                                    inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                    ${m.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                    ${m.status === 'scheduled' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                    ${m.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                                    ${m.status === 'completed' ? 'bg-gray-100 text-gray-600 border-gray-200' : ''}
                                                `}>
                                                    {m.status === 'pending' && "Pendiente"}
                                                    {m.status === 'scheduled' && "Programada"}
                                                    {m.status === 'rejected' && "Rechazada"}
                                                    {m.status === 'completed' && "Realizada"}
                                                </span>
                                            </div>

                                            <h3 className="font-bold text-gray-900 mb-1">{m.title}</h3>
                                            {m.description && (
                                                <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                    <span className="font-bold text-gray-700 block mb-1">Descripción:</span>
                                                    {m.description || 'Sin descripción'}
                                                </p>
                                            )}

                                            {m.attachments && m.attachments.length > 0 && (
                                                <div className="mb-3 flex flex-wrap gap-2">
                                                    {m.attachments.map((file, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-primary transition-colors"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Paperclip size={12} />
                                                            <span className="truncate max-w-[150px]">{file.name}</span>
                                                        </a>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 mb-4">
                                                <div>
                                                    <span className="font-bold text-gray-700 block mb-0.5">Fecha preferida</span>
                                                    {m.preferred_date_key} ({m.preferred_slot})
                                                </div>
                                                <div>
                                                    <span className="font-bold text-gray-700 block mb-0.5">Participantes</span>
                                                    {participantsNames || "—"}
                                                </div>
                                            </div>

                                            {m.status === "scheduled" && (
                                                <div className="flex gap-2 pt-3 border-t border-gray-100">
                                                    <button
                                                        type="button"
                                                        className="flex-1 py-2 px-3 rounded-xl bg-gray-50 text-gray-700 font-bold text-xs hover:bg-gray-100 transition-colors border border-gray-200 flex items-center justify-center gap-2"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateMeetingStatus({
                                                                id: m.id,
                                                                status: "completed",
                                                            });
                                                        }}
                                                    >
                                                        <CheckCircle size={14} />
                                                        Marcar como Realizada
                                                    </button>
                                                </div>
                                            )}

                                            {m.status === "pending" && (
                                                <div className="flex gap-2 pt-3 border-t border-gray-100">
                                                    <button
                                                        type="button"
                                                        className="flex-1 py-2 px-3 rounded-xl bg-green-50 text-green-700 font-bold text-xs hover:bg-green-100 transition-colors border border-green-200"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateMeetingStatus({
                                                                id: m.id,
                                                                status: "scheduled",
                                                                scheduled_date_key: m.preferred_date_key,
                                                            });
                                                        }}
                                                    >
                                                        Aceptar y Programar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex-1 py-2 px-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs hover:bg-red-100 transition-colors border border-red-200"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const msg = window.prompt(
                                                                "Motivo del rechazo (opcional):",
                                                                ""
                                                            );
                                                            updateMeetingStatus({
                                                                id: m.id,
                                                                status: "rejected",
                                                                response_message: msg || "",
                                                            });
                                                        }}
                                                    >
                                                        Rechazar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Meeting creation modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl max-w-md w-full animate-[popIn_0.2s_ease-out] max-h-[90vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-6 pb-0 shrink-0">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Solicitar reunión</h2>
                            <button
                                type="button"
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                                onClick={() => setShowModal(false)}
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        <p className="text-gray-500 px-6 mb-6 font-medium shrink-0">
                            Solicita una reunión con personas del equipo.
                        </p>

                        <form onSubmit={(e) => { e.preventDefault(); handleCreateMeeting(); }} className="flex flex-col flex-1 min-h-0">
                            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5 custom-scrollbar">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Fecha preferida
                                    </label>
                                    <input
                                        type="date"
                                        value={selectedDateKey}
                                        onChange={handleDateChange}
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Título *
                                    </label>
                                    <input
                                        type="text"
                                        value={meetingTitle}
                                        onChange={(e) => setMeetingTitle(e.target.value)}
                                        placeholder="Ej.: Reunión de seguimiento..."
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Motivo / Descripción
                                    </label>
                                    <textarea
                                        value={meetingDescription}
                                        onChange={(e) => setMeetingDescription(e.target.value)}
                                        placeholder="¿Qué quieres tratar en la reunión?"
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium resize-y min-h-[80px] focus:border-primary focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Franja horaria preferida
                                    </label>
                                    <select
                                        value={meetingPreferredSlot}
                                        onChange={(e) => setMeetingPreferredSlot(e.target.value)}
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium bg-white focus:border-primary focus:outline-none transition-colors"
                                    >
                                        <option value="mañana">Mañana</option>
                                        <option value="tarde">Tarde</option>
                                        <option value="indiferente">Indiferente</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Participantes
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border-2 border-gray-100 rounded-xl">
                                        {USERS.filter(u => u.id !== currentUser.id).map(user => (
                                            <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedParticipants.includes(user.id)}
                                                    onChange={() => handleToggleParticipant(user.id)}
                                                    className="rounded border-gray-300 text-primary focus:ring-primary"
                                                />
                                                <span className="text-sm font-medium text-gray-700">{user.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Adjuntar archivos
                                    </label>
                                    <FileUploader
                                        onUploadComplete={setMeetingAttachments}
                                        existingFiles={meetingAttachments}
                                        folderPath="meetings"
                                    />
                                </div>

                            </div>

                            <div className="flex gap-3 p-6 border-t border-gray-100 bg-white shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateMeeting}
                                    disabled={isSubmitting}
                                    className={`flex-1 py-3 rounded-xl bg-primary text-white font-bold transition-all shadow-lg shadow-primary/25 cursor-pointer
                                        ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-dark hover:scale-105 active:scale-95'}
                                    `}
                                >
                                    {isSubmitting ? 'Solicitando...' : 'Solicitar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Meeting Details Modal */}
            {selectedMeeting && (
                <MeetingDetailModal
                    meeting={selectedMeeting}
                    onClose={() => setSelectedMeeting(null)}
                />
            )}
        </div>
    );
}

export default MeetingsPage;
