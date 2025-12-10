import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAbsences } from '../hooks/useAbsences';
import { useTimeData } from '../hooks/useTimeData';
import { useNotificationsContext } from '../context/NotificationsContext';
import { USERS } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { Plus, UserX, Calendar, MessageSquare, Trash2, XCircle, CheckCircle, Clock, Paperclip, AlertCircle, Info, CheckSquare, Edit2 } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { RoleBadge } from '../components/RoleBadge';
import { FileUploader, Attachment } from '../components/FileUploader';

/**
 * Absences page
 * Allows users to create and manage their own absence requests
 * Admin view to approve/reject absence requests
 */
function AbsencesPage() {
    const { currentUser } = useAuth();
    const { absenceRequests, createAbsence, updateAbsence, updateAbsenceStatus, deleteAbsence } = useAbsences(currentUser);
    const { createTimeEntry } = useTimeData();
    const { addNotification } = useNotificationsContext();
    const [showModal, setShowModal] = useState(false);

    // Form States
    const [absenceType, setAbsenceType] = useState('vacation');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [isDateRange, setIsDateRange] = useState(false);
    const [reason, setReason] = useState('');
    const [makeUpHours, setMakeUpHours] = useState(false); // New: User preference
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [replyingId, setReplyingId] = useState<number | null>(null);
    const [replyText, setReplyText] = useState('');

    // Admin Decision State
    const [adminDecision, setAdminDecision] = useState<Record<number, string>>({}); // { requestId: 'makeup' | 'paid' | 'deducted' }

    const isAdmin = currentUser?.isAdmin;
    const selectedDateKey = toDateKey(selectedDate);
    const endDateKey = endDate ? toDateKey(endDate) : null;

    // Admin view - all requests sorted by creation date
    const sortedRequests = [...absenceRequests].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // User view - all their requests sorted by date
    const userAbsences = absenceRequests
        .filter((r) => r.created_by === currentUser.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    async function handleUpdateStatus(id: number, status: 'approved' | 'rejected', message: string, resolutionType?: string) {
        try {
            await updateAbsenceStatus({
                id,
                status,
                response_message: message,
                resolution_type: resolutionType
            });
            await addNotification({ message: `Solicitud ${status === 'approved' ? 'aprobada' : 'rechazada'} correctamente.` });
        } catch (e) {
            console.error("Unexpected error updating absence status", e);
            alert("Error al actualizar estado");
        }
    }

    function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        setSelectedDate(new Date(e.target.value + 'T00:00:00'));
    }

    function handleEndDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        setEndDate(new Date(e.target.value + 'T00:00:00'));
    }

    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleCreateAbsence(e?: React.FormEvent | React.MouseEvent) {
        if (e) e.preventDefault();

        if (!reason.trim()) {
            alert('Por favor, indica el motivo de la ausencia.');
            return;
        }

        if (isDateRange && !endDate) {
            alert('Por favor, selecciona una fecha de fin.');
            return;
        }

        if (isDateRange && endDate && endDate < selectedDate) {
            alert('La fecha de fin no puede ser anterior a la fecha de inicio.');
            return;
        }

        setIsSubmitting(true);
        try {
            const finalReason = reason.trim();
            const payload = {
                reason: finalReason,
                date_key: selectedDateKey,
                end_date: isDateRange ? endDateKey : null,
                type: absenceType as 'vacation' | 'absence' | 'special_permit',
                makeUpHours: absenceType === 'special_permit' ? makeUpHours : false, // Send preference
                attachments: attachments
            };

            if (editingId) {
                await updateAbsence({ id: editingId, ...payload }); // Backend needs to support mapping makeUpHours -> makeup_preference
                await addNotification({ message: 'Solicitud actualizada correctamente.' });
            } else {
                await createAbsence(payload);

                // Create time entries logic (simplified logging)
                if (absenceType === 'vacation') {
                    createTimeEntry({
                        date: selectedDate,
                        userId: currentUser.id,
                        entry: null,
                        exit: null,
                        status: 'vacation-request',
                        note: 'Solicitud de vacaciones'
                    });
                } else if (absenceType === 'absence' || absenceType === 'special_permit') {
                    createTimeEntry({
                        date: selectedDate,
                        userId: currentUser.id,
                        entry: null,
                        exit: null,
                        status: 'absent',
                        note: absenceType === 'special_permit' ? 'Permiso especial' : 'Ausencia registrada'
                    });
                }

                let typeLabel = 'ausencia';
                if (absenceType === 'vacation') typeLabel = 'vacaciones';
                else if (absenceType === 'special_permit') typeLabel = 'un permiso especial';
                const dateMsg = isDateRange ? `del ${selectedDateKey} al ${endDateKey}` : `para el día ${selectedDateKey}`;
                await addNotification({ message: `Has solicitado ${typeLabel} ${dateMsg}.` });
            }

            setShowModal(false);
            resetForm();
        } catch (e: any) {
            console.error('Unexpected error creating/updating absence_request', e);
            alert(`Error al procesar la solicitud: ${e.message || 'Error desconocido'}`);
        } finally {
            setIsSubmitting(false);
        }
    }

    function resetForm() {
        setReason('');
        setAbsenceType('vacation');
        setSelectedDate(new Date());
        setEndDate(null);
        setIsDateRange(false);
        setAttachments([]);
        setEditingId(null);
        setMakeUpHours(false);
    }

    function handleEdit(request: any) {
        setEditingId(request.id);
        setReason(request.reason);
        setAbsenceType(request.type);
        setSelectedDate(new Date(request.date_key));
        setMakeUpHours(request.makeup_preference || false); // Load preference
        if (request.end_date) {
            setEndDate(new Date(request.end_date));
            setIsDateRange(true);
        } else {
            setEndDate(null);
            setIsDateRange(false);
        }
        setAttachments(request.attachments || []);
        setShowModal(true);
    }

    async function handleDeleteAbsence(id: number) {
        if (!window.confirm('¿Seguro que quieres eliminar esta solicitud?')) return;
        try {
            await deleteAbsence(id);
            await addNotification({ message: 'Solicitud de permiso eliminada.' });
        } catch (e) {
            console.error("Unexpected error deleting absence", e);
        }
    }

    async function handleReply(id: number) {
        if (!replyText.trim()) return;
        try {
            await updateAbsence({ id, response_message: replyText });

            const request = absenceRequests.find(r => r.id === id);
            if (request && request.created_by) {
                await addNotification({
                    message: `Tienes una nueva respuesta en tu solicitud de ausencia: "${replyText}"`,
                    userId: request.created_by
                });
            }

            setReplyingId(null);
            setReplyText('');
            await addNotification({ message: 'Respuesta enviada.' });
        } catch (e) {
            console.error("Unexpected error replying to absence", e);
            alert("Error al enviar la respuesta");
        }
    }

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-purple-600">
                        <UserX size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Ausencias
                        </h1>
                        <p className="text-gray-500 font-medium">
                            {isAdmin
                                ? 'Gestiona las solicitudes de permisos y ausencias del equipo'
                                : 'Gestiona tus solicitudes de vacaciones y permisos'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95"
                >
                    <Plus size={20} />
                    Solicitar permiso
                </button>
            </div>

            {/* User view - absence requests (shown for all users) */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Tus solicitudes</h2>
                    <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                        {userAbsences.length} {userAbsences.length === 1 ? 'solicitud' : 'solicitudes'}
                    </span>
                </div>

                <div className="p-6">
                    {userAbsences.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <UserX size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">No tienes solicitudes de permisos o ausencias.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {userAbsences.map((r) => (
                                <div
                                    key={r.id}
                                    className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-purple-200 hover:shadow-md transition-all duration-200"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-bold text-gray-900">
                                                    {r.type === 'vacation' ? 'Vacaciones' : (r.type === 'special_permit' ? 'Permiso especial' : 'Ausencia')} - {r.date_key} {r.end_date ? ` al ${r.end_date}` : ''}
                                                </h3>
                                                <span className={`
                                                    inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                    ${r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                    ${r.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                    ${r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                                `}>
                                                    {r.status === 'pending' && <Clock size={12} />}
                                                    {r.status === 'approved' && <CheckCircle size={12} />}
                                                    {r.status === 'rejected' && <XCircle size={12} />}
                                                    {r.status === 'pending' && "Pendiente"}
                                                    {r.status === 'approved' && "Aprobado"}
                                                    {r.status === 'rejected' && "Rechazado"}
                                                </span>
                                            </div>

                                            {r.type === 'special_permit' && r.makeup_preference && (
                                                <div className="mb-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md inline-block">
                                                    Has solicitado reponer horas
                                                </div>
                                            )}

                                            <p className="text-gray-600 text-sm mb-3">
                                                <span className="font-bold text-gray-700">Motivo:</span> {r.reason}
                                            </p>

                                            {r.attachments && r.attachments.length > 0 && (
                                                <div className="mb-3 flex flex-wrap gap-2">
                                                    {r.attachments.map((file: Attachment, idx: number) => (
                                                        <a
                                                            key={idx}
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary hover:underline bg-gray-50 px-2 py-1 rounded border border-gray-100"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Paperclip size={10} />
                                                            {file.name}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}

                                            {r.response_message && (
                                                <div className="mt-3 flex items-start gap-2 text-sm bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                    <MessageSquare size={16} className="text-gray-400 mt-0.5 shrink-0" />
                                                    <span className="text-gray-600"><span className="font-bold text-gray-700">Nota:</span> {r.response_message}</span>
                                                </div>
                                            )}

                                            <div className="text-xs text-gray-400 mt-3">
                                                Solicitado el {new Date(r.created_at).toLocaleString("es-ES", {
                                                    dateStyle: "short",
                                                    timeStyle: "short",
                                                })}
                                            </div>
                                        </div>

                                        {/* User actions: Edit/Delete only if Pending */}
                                        {r.status === 'pending' && (
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => handleEdit(r)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                                    title="Editar solicitud"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAbsence(r.id)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                    title="Eliminar solicitud"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Admin view - all requests (Admin only) */}
            {isAdmin && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-purple-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-900">Panel de administración</h2>
                            <RoleBadge role="admin" size="sm" />
                        </div>
                    </div>

                    <div className="p-6">
                        {sortedRequests.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">No hay solicitudes de permisos especiales por ahora.</p>
                        ) : (
                            <div className="space-y-4">
                                {sortedRequests.map((r) => {
                                    const creator = USERS.find((u) => u.id === r.created_by);
                                    // Determine default decision based on user preference if not set
                                    const currentDecision = adminDecision[r.id] || (r.makeup_preference ? 'makeup' : 'deducted');

                                    return (
                                        <div
                                            key={r.id}
                                            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar name={creator?.name} size="sm" />
                                                    <div>
                                                        <p className="font-bold text-gray-900">{creator?.name || r.created_by}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(r.created_at).toLocaleString("es-ES", {
                                                                dateStyle: "short",
                                                                timeStyle: "short",
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`
                                                        inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                                        ${r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                                        ${r.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                        ${r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                                    `}>
                                                        {r.status === 'pending' && "Pendiente"}
                                                        {r.status === 'approved' && "Aprobado"}
                                                        {r.status === 'rejected' && "Rechazado"}
                                                    </span>

                                                    {/* Admin Edit/Delete Actions */}
                                                    <div className="flex items-center gap-1 ml-2">
                                                        <button
                                                            onClick={() => handleEdit(r)}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Editar solicitud"
                                                        >
                                                            <MessageSquare size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteAbsence(r.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Eliminar solicitud"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 mb-2">
                                                <Calendar size={16} className="text-gray-400" />
                                                <span className="font-bold text-gray-900">
                                                    {r.type === 'vacation' ? 'Vacaciones' : (r.type === 'special_permit' ? 'Permiso especial' : 'Ausencia')} - {r.date_key} {r.end_date ? ` al ${r.end_date}` : ''}
                                                </span>
                                            </div>

                                            {r.type === 'special_permit' && (
                                                <div className="mb-2">
                                                    {r.makeup_preference ? (
                                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit">
                                                            <Clock size={12} /> Usuario solicita reponer horas
                                                        </span>
                                                    ) : (
                                                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold w-fit">
                                                            Usuario no solicita reponer horas
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                <span className="font-bold text-gray-700 block mb-1">Motivo:</span>
                                                {r.reason}
                                            </p>

                                            {r.attachments && r.attachments.length > 0 && (
                                                <div className="mb-3 flex flex-wrap gap-2">
                                                    {r.attachments.map((file: Attachment, idx: number) => (
                                                        <a
                                                            key={idx}
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary hover:underline bg-gray-50 px-2 py-1 rounded border border-gray-100"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Paperclip size={10} />
                                                            {file.name}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Resolution Message if approved */}
                                            {r.status === 'approved' && r.resolution_type && (
                                                <div className="mb-3 flex items-center gap-2 text-sm bg-green-50 p-2 rounded-lg border border-green-100 text-green-800">
                                                    <CheckCircle size={14} />
                                                    <span className="font-bold text-xs uppercase tracking-wide">Resolución:</span>
                                                    {r.resolution_type === 'makeup' && "Debe Reponer Horas"}
                                                    {r.resolution_type === 'paid' && "Cuenta como Trabajado (Pago)"}
                                                    {r.resolution_type === 'deducted' && "Ausencia (Descuenta)"}
                                                </div>
                                            )}

                                            {r.status === "pending" && r.type === 'special_permit' && (
                                                <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Decisión administrativa</p>
                                                    <div className="space-y-2">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name={`resolution-${r.id}`}
                                                                checked={currentDecision === 'makeup'}
                                                                onChange={() => setAdminDecision({ ...adminDecision, [r.id]: 'makeup' })}
                                                                className="text-primary focus:ring-primary"
                                                            />
                                                            <span className="text-sm text-gray-700">Reponer horas (Queda debiendo)</span>
                                                        </label>
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name={`resolution-${r.id}`}
                                                                checked={currentDecision === 'paid'}
                                                                onChange={() => setAdminDecision({ ...adminDecision, [r.id]: 'paid' })}
                                                                className="text-primary focus:ring-primary"
                                                            />
                                                            <span className="text-sm text-gray-700">Cuenta como trabajada (Pagado)</span>
                                                        </label>
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name={`resolution-${r.id}`}
                                                                checked={currentDecision === 'deducted'}
                                                                onChange={() => setAdminDecision({ ...adminDecision, [r.id]: 'deducted' })}
                                                                className="text-primary focus:ring-primary"
                                                            />
                                                            <span className="text-sm text-gray-700">Ausencia normal (Sin sueldo)</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}

                                            {r.status === "pending" && (
                                                <div className="flex gap-2 pt-3 border-t border-gray-100">
                                                    <button
                                                        type="button"
                                                        className="flex-1 py-2 px-3 rounded-xl bg-green-50 text-green-700 font-bold text-xs hover:bg-green-100 transition-colors border border-green-200"
                                                        onClick={() => {
                                                            const decision = (r.type === 'special_permit') ? (adminDecision[r.id] || (r.makeup_preference ? 'makeup' : 'deducted')) : undefined;
                                                            const msg = window.prompt(
                                                                "Nota para la persona (opcional):",
                                                                ""
                                                            );
                                                            handleUpdateStatus(r.id, "approved", msg || "", decision);
                                                        }}
                                                    >
                                                        Aprobar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex-1 py-2 px-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs hover:bg-red-100 transition-colors border border-red-200"
                                                        onClick={() => {
                                                            const msg = window.prompt(
                                                                "Motivo del rechazo (opcional):",
                                                                ""
                                                            );
                                                            handleUpdateStatus(r.id, "rejected", msg || "");
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

            {/* Absence creation modal */}
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
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                {editingId ? 'Editar solicitud' : 'Solicitar ausencia'}
                            </h2>
                            <button
                                type="button"
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                                onClick={() => setShowModal(false)}
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        <p className="text-gray-500 px-6 mb-6 font-medium shrink-0 pt-4">
                            Solicita vacaciones o un permiso especial.
                        </p>

                        <form onSubmit={(e) => { e.preventDefault(); handleCreateAbsence(); }} className="flex flex-col flex-1 min-h-0">
                            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5 custom-scrollbar">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Fecha
                                    </label>
                                    <input
                                        type="date"
                                        value={selectedDateKey}
                                        onChange={handleDateChange}
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <input
                                            type="checkbox"
                                            id="isDateRange"
                                            checked={isDateRange}
                                            onChange={(e) => setIsDateRange(e.target.checked)}
                                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                        />
                                        <label htmlFor="isDateRange" className="text-sm font-bold text-gray-900 select-none cursor-pointer">
                                            Seleccionar rango de fechas
                                        </label>
                                    </div>

                                    {isDateRange && (
                                        <div>
                                            <label className="block text-sm font-bold text-gray-900 mb-2">
                                                Fecha fin
                                            </label>
                                            <input
                                                type="date"
                                                value={endDateKey || ''}
                                                onChange={handleEndDateChange}
                                                min={selectedDateKey}
                                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Tipo de ausencia
                                    </label>
                                    <select
                                        value={absenceType}
                                        onChange={(e) => setAbsenceType(e.target.value)}
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium bg-white focus:border-primary focus:outline-none transition-colors"
                                    >
                                        <option value="vacation">Vacaciones</option>
                                        <option value="special_permit">Permiso especial</option>
                                        <option value="absence">Ausencia</option>
                                    </select>
                                </div>

                                {absenceType === 'special_permit' && (
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                        <div className="flex items-start gap-2 mb-2">
                                            <Info size={16} className="text-indigo-600 mt-0.5" />
                                            <p className="text-xs text-indigo-700">
                                                Los permisos especiales pueden requerir reponer horas.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="makeUpHours"
                                                checked={makeUpHours}
                                                onChange={(e) => setMakeUpHours(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
                                            />
                                            <label htmlFor="makeUpHours" className="text-sm font-bold text-indigo-900 select-none cursor-pointer">
                                                Me comprometo a reponer estas horas.
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Motivo / Descripción *
                                    </label>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Describe brevemente el motivo..."
                                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium resize-y min-h-[80px] focus:border-primary focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">
                                        Adjuntar archivos (opcional)
                                    </label>
                                    <FileUploader
                                        onUploadComplete={setAttachments}
                                        existingFiles={attachments}
                                        folderPath="absences"
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
                                    onClick={handleCreateAbsence}
                                    disabled={isSubmitting}
                                    className={`flex-1 py-3 rounded-xl bg-primary text-white font-bold transition-all shadow-lg shadow-primary/25 cursor-pointer
                                        ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-dark hover:scale-105 active:scale-95'}
                                    `}
                                >
                                    {isSubmitting ? 'Guardando...' : (editingId ? 'Guardar cambios' : 'Solicitar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AbsencesPage;
