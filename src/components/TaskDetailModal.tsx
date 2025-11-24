import React from 'react';
import { XCircle, Calendar, User, Users, Paperclip, CheckCircle2, Circle } from 'lucide-react';
import { Todo, Attachment } from '../types';
import { USERS } from '../constants';
import { UserAvatar } from './UserAvatar';

interface TaskDetailModalProps {
    task: Todo;
    onClose: () => void;
}

export default function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
    const creator = USERS.find((u) => u.id === task.created_by)?.name || task.created_by;

    const isCompleted = task.assigned_to.length > 0 && task.assigned_to.every((uid: string) => task.completed_by.includes(uid));

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
                                inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border
                                ${isCompleted
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-orange-50 text-orange-700 border-orange-200'}
                            `}>
                                {isCompleted ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                {isCompleted ? 'Completada' : 'Pendiente'}
                            </span>
                            {task.due_date_key && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                    <Calendar size={14} />
                                    {task.due_date_key}
                                </span>
                            )}
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                            {task.title}
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
                            {task.description || <span className="text-gray-400 italic">Sin descripción</span>}
                        </div>
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
