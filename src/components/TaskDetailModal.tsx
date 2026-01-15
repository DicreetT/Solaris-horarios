import React, { useState } from 'react';
import { XCircle, Calendar, User, Users, Paperclip, CheckCircle2, Circle, MessageSquare, Send, Tag, Plus, X } from 'lucide-react';
import { Todo, Attachment, Comment } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { USERS } from '../constants';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { FileUploader } from './FileUploader';
import { Celebration } from './Celebration';
import { haptics } from '../utils/haptics';

interface TaskDetailModalProps {
    task: Todo;
    onClose: () => void;
}

export default function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
    const { currentUser } = useAuth();
    const { addComment, updateTodo, toggleTodo } = useTodos(currentUser);
    const [newComment, setNewComment] = useState('');
    const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);

    // Edit States
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(task.title);
    const [editDescription, setEditDescription] = useState(task.description || '');
    const [editTags, setEditTags] = useState<string[]>(task.tags || []);
    const [tagInput, setTagInput] = useState("");

    const creator = USERS.find((u) => u.id === task.created_by)?.name || task.created_by;
    const isDoneForMe = task.completed_by.includes(currentUser.id);
    const isGloballyDone = task.assigned_to.length > 0 && task.assigned_to.every((uid: string) => task.completed_by.includes(uid));

    // Main badge/button state reflects the current user
    const isCompleted = isDoneForMe;

    // Tag Helpers
    const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
        if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !tagInput.trim()) return;
        e.preventDefault();
        const newTag = tagInput.trim();
        if (!editTags.includes(newTag)) {
            setEditTags([...editTags, newTag]);
        }
        setTagInput("");
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setEditTags(editTags.filter(t => t !== tagToRemove));
    };

    // Color Helper (duplicated from TasksPage, ideally in utils but okay here)
    const getTagColor = (tag: string) => {
        const colors = [
            'bg-blue-100 text-blue-700 border-blue-200',
            'bg-green-100 text-green-700 border-green-200',
            'bg-purple-100 text-purple-700 border-purple-200',
            'bg-orange-100 text-orange-700 border-orange-200',
            'bg-pink-100 text-pink-700 border-pink-200',
            'bg-indigo-100 text-indigo-700 border-indigo-200',
            'bg-teal-100 text-teal-700 border-teal-200',
            'bg-yellow-100 text-yellow-800 border-yellow-200',
            'bg-gray-100 text-gray-700 border-gray-200',
            'bg-red-100 text-red-700 border-red-200',
        ];
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    };

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() && newAttachments.length === 0) return;

        setIsSubmitting(true);
        try {
            await addComment({
                todoId: task.id,
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

    const handleSaveEdit = async () => {
        if (!editTitle.trim()) return;
        try {
            await updateTodo({
                id: task.id,
                updates: {
                    title: editTitle,
                    description: editDescription,
                    tags: editTags
                }
            });
            setIsEditing(false);
        } catch (error) {
            console.error('Error updating todo:', error);
            alert('Error al actualizar la tarea');
        }
    };

    const handleToggleStatus = async () => {
        try {
            if (task.assigned_to.includes(currentUser.id)) {
                haptics.medium();
                const wasDone = isDoneForMe;
                await toggleTodo(task);
                if (!wasDone) {
                    setShowCelebration(true);
                }
            } else {
                alert("Solo los asignados pueden cambiar el estado.");
            }
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar border border-white/20"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <div className="relative">
                                <Celebration
                                    isVisible={showCelebration}
                                    onComplete={() => setShowCelebration(false)}
                                />
                                <button
                                    onClick={handleToggleStatus}
                                    disabled={!task.assigned_to.includes(currentUser.id)}
                                    className={`
                                        inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all
                                        ${isCompleted
                                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                            : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}
                                        ${!task.assigned_to.includes(currentUser.id) ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}
                                    `}
                                >
                                    {isCompleted ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                    {isCompleted ? 'Mi parte: Terminada' : 'Mi parte: Pendiente'}
                                </button>
                            </div>
                            {task.due_date_key && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                    <Calendar size={14} />
                                    {task.due_date_key}
                                </span>
                            )}

                            {/* Tags View (Non-Edit) */}
                            {!isEditing && task.tags && task.tags.map(tag => (
                                <span key={tag} className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getTagColor(tag)}`}>
                                    {tag}
                                </span>
                            ))}
                        </div>

                        {isEditing ? (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="w-full text-2xl font-black text-gray-900 tracking-tight leading-tight border-b-2 border-primary focus:outline-none bg-transparent"
                                    autoFocus
                                />
                                {/* Tags Edit */}
                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Etiquetas</label>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            className="flex-1 rounded-lg border border-gray-200 p-2 text-sm focus:border-primary focus:outline-none"
                                            value={tagInput}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={handleAddTag}
                                            placeholder="Añadir etiqueta..."
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddTag}
                                            className="p-2 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {editTags.map(tag => (
                                            <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg border border-gray-200">
                                                {tag}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveTag(tag)}
                                                    className="hover:text-red-500"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight group flex items-start gap-2">
                                {task.title}
                                {task.created_by === currentUser.id && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-primary mt-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    </button>
                                )}
                            </h2>
                        )}
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
                        {isEditing ? (
                            <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="w-full bg-gray-50 rounded-2xl p-5 border border-gray-100 text-gray-700 whitespace-pre-wrap leading-relaxed focus:outline-none focus:border-primary min-h-[100px]"
                            />
                        ) : (
                            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {task.description || <span className="text-gray-400 italic">Sin descripción</span>}
                            </div>
                        )}

                        {isEditing && (
                            <div className="flex gap-2 mt-3 justify-end">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditTitle(task.title);
                                        setEditDescription(task.description || '');
                                        setEditTags(task.tags || []);
                                    }}
                                    className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors"
                                >
                                    Guardar
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Attachments */}
                    {task.attachments && task.attachments.length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                                <Paperclip size={16} />
                                Archivos adjuntos
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {task.attachments.map((file: Attachment, idx: number) => (
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
                                Creada por
                            </h3>
                            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                <UserAvatar name={creator} size="sm" />
                                <span className="font-bold text-gray-900">{creator}</span>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                                <Users size={16} />
                                Asignada a
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {task.assigned_to.map((uid: string) => {
                                    const u = USERS.find(user => user.id === uid);
                                    const isDone = task.completed_by.includes(uid);
                                    return (
                                        <div
                                            key={uid}
                                            className={`
                                                flex items-center gap-2 px-3 py-2 rounded-xl border transition-all
                                                ${isDone
                                                    ? 'bg-green-50 border-green-200 text-green-900'
                                                    : 'bg-white border-gray-200 text-gray-700'}
                                            `}
                                        >
                                            <UserAvatar name={u?.name || uid} size="xs" className="w-5 h-5" />
                                            <span className="text-sm font-medium">{u?.name || uid}</span>
                                            {isDone && <CheckCircle2 size={14} className="text-green-600 ml-1" />}
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
                            Comentarios ({task.comments?.length || 0})
                        </h3>

                        {/* Comments List */}
                        <div className="space-y-4 mb-6">
                            {task.comments && task.comments.length > 0 ? (
                                task.comments.map((comment: Comment) => {
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
                                    className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm !text-black dark:text-black dark:bg-white dark:border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                                    style={{ color: '#000000' }}
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
            </motion.div>
        </motion.div>
    );
}
