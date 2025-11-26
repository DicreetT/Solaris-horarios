import React, { useState } from 'react';
import { XCircle, Calendar, User, Users, Paperclip, Clock, MessageSquare, Send, Shield } from 'lucide-react';
import { Meeting, Attachment, Comment } from '../types';
import { USERS } from '../constants';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useMeetings } from '../hooks/useMeetings';
import { FileUploader } from './FileUploader';

interface MeetingDetailModalProps {
    meeting: Meeting;
    onClose: () => void;
}

export default function MeetingDetailModal({ meeting, onClose }: MeetingDetailModalProps) {
    const { currentUser } = useAuth();
    const { addComment } = useMeetings(currentUser);
    const [newComment, setNewComment] = useState('');
    const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const creator = USERS.find((u) => u.id === meeting.created_by)?.name || meeting.created_by;

    // Determine status color and label
    const getStatusInfo = (status: string) => {
        switch (status) {
            case 'scheduled':
                return { color: 'bg-green-100 text-green-700', label: 'Programada' };
            case 'pending':
                return { color: 'bg-amber-100 text-amber-700', label: 'Pendiente' };
            case 'rejected':
                return { color: 'bg-red-100 text-red-700', label: 'Rechazada' };
            default:
                return { color: 'bg-gray-100 text-gray-700', label: status };
        }
    };

    const statusInfo = getStatusInfo(meeting.status);

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() && newAttachments.length === 0) return;

        setIsSubmitting(true);
        try {
            await addComment({
                meetingId: meeting.id,
                text: newComment,
                attachments: newAttachments
            });
            setNewComment('');
            setNewAttachments([]);
        } catch (error) {
            console.error('Error adding comment:', error);
            alert('Error al enviar el comentario');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full animate-[popIn_0.2s_ease-out] max-h-[90vh] overflow-y-auto custom-scrollbar"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-2">
                            <span className={`
                                inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
                                ${statusInfo.color}
                            `}>
                                {statusInfo.label}
                            </span>
                            {meeting.scheduled_date_key && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                                    <Calendar size={14} />
                                    {meeting.scheduled_date_key}
                                </span>
                            )}
                            {meeting.scheduled_time && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                                    <Clock size={14} />
                                    {meeting.scheduled_time}
                                </span>
                            )}
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                            {meeting.title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors shrink-0"
                        onClick={onClose}
                    >
                        <XCircle size={24} />
                    </button>
                </div>

                <div className="space-y-8">
                    {/* Description */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Descripción</h3>
                        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {meeting.description || <span className="text-gray-400 italic">Sin descripción</span>}
                        </div>
                    </div>

                    {/* Attachments */}
                    {meeting.attachments && meeting.attachments.length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                                <Paperclip size={16} />
                                Archivos adjuntos
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {meeting.attachments.map((file: Attachment, idx: number) => (
                                    <a
                                        key={idx}
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-md transition-all group"
                                    >
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                                            <Paperclip size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{file.name}</p>
                                            <p className="text-xs text-gray-500">Click para ver</p>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* People */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-gray-100">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                                <User size={16} />
                                Organizada por
                            </h3>
                            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                <UserAvatar name={creator} size="sm" />
                                <span className="font-bold text-gray-900">{creator}</span>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                                <Users size={16} />
                                Participantes
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {meeting.participants.map((uid: string) => {
                                    const u = USERS.find(user => user.id === uid);
                                    return (
                                        <div
                                            key={uid}
                                            className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white border-gray-200 text-gray-700"
                                        >
                                            <UserAvatar name={u?.name || uid} size="xs" className="w-5 h-5" />
                                            <span className="text-sm font-medium">{u?.name || uid}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Comments Section */}
                    <div className="pt-6 border-t border-gray-100">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider flex items-center gap-2">
                            <MessageSquare size={16} />
                            Comentarios ({meeting.comments?.length || 0})
                        </h3>

                        {/* Comments List */}
                        <div className="space-y-4 mb-6">
                            {meeting.comments && meeting.comments.length > 0 ? (
                                meeting.comments.map((comment: Comment) => {
                                    const commentUser = USERS.find(u => u.id === comment.user_id);
                                    const isMe = comment.user_id === currentUser?.id;

                                    return (
                                        <div key={comment.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                            <UserAvatar name={commentUser?.name || comment.user_id} size="sm" className="mt-1" />
                                            <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                                                <div className={`
                                                    p-4 rounded-2xl text-sm
                                                    ${isMe
                                                        ? 'bg-primary text-white rounded-tr-none'
                                                        : 'bg-gray-100 text-gray-800 rounded-tl-none'}
                                                `}>
                                                    <p className="whitespace-pre-wrap">{comment.text}</p>

                                                    {/* Comment Attachments */}
                                                    {comment.attachments && comment.attachments.length > 0 && (
                                                        <div className="mt-3 space-y-2">
                                                            {comment.attachments.map((att, idx) => (
                                                                <a
                                                                    key={idx}
                                                                    href={att.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={`
                                                                        flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-colors
                                                                        ${isMe
                                                                            ? 'bg-white/20 hover:bg-white/30 text-white'
                                                                            : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}
                                                                    `}
                                                                >
                                                                    <Paperclip size={12} />
                                                                    <span className="truncate max-w-[150px]">{att.name}</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-xs text-gray-400 mt-1 px-1">
                                                    {new Date(comment.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                    <p className="text-gray-400 text-sm">No hay comentarios aún. ¡Sé el primero!</p>
                                </div>
                            )}
                        </div>

                        {/* Add Comment Form */}
                        <form onSubmit={handleAddComment} className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                            <div className="mb-3">
                                <textarea
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Escribe un comentario..."
                                    className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                                    rows={3}
                                />
                            </div>

                            <div className="mb-4">
                                <FileUploader
                                    onUploadComplete={setNewAttachments}
                                    existingFiles={newAttachments}
                                    maxSizeMB={5}
                                />
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || (!newComment.trim() && newAttachments.length === 0)}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <span className="animate-pulse">Enviando...</span>
                                    ) : (
                                        <>
                                            <Send size={16} />
                                            Enviar respuesta
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
