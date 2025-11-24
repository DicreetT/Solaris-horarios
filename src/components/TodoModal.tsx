import React, { useState } from 'react';
import { USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { XCircle, CheckSquare } from 'lucide-react';
import { FileUploader, Attachment } from './FileUploader';

/**
 * Modal To-Do Creation
 * Simplified modal for creating new tasks only
 */
export default function TodoModal({ onClose }: { onClose: () => void }) {
    const { currentUser } = useAuth();
    const { createTodo } = useTodos(currentUser);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [assignedIds, setAssignedIds] = useState([currentUser.id]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    const handleToggleAssignee = (id: string) => {
        setAssignedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || assignedIds.length === 0) return;

        try {
            await createTodo({
                title: trimmedTitle,
                description: description.trim(),
                dueDateKey: dueDate || null,
                assignedTo: assignedIds,
                attachments,
            });

            setTitle("");
            setDescription("");
            setDueDate("");
            setAssignedIds([currentUser.id]);
            setAttachments([]);

            // Close modal after successful creation
            onClose();
        } catch (e) {
            console.error("Unexpected error creating todo", e);
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-[popIn_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Crear nueva tarea</h2>
                    <button
                        type="button"
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                        onClick={onClose}
                    >
                        <XCircle size={24} />
                    </button>
                </div>

                <p className="text-gray-500 mb-6 font-medium">
                    Crea tareas, asígnalas a tus compañeros y marca cada una cuando esté hecha.
                    Cuando todas las personas asignadas la marcan, la tarea se considera completada por el equipo. ✨
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                            Título de la tarea *
                        </label>
                        <input
                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ej.: Revisar manual de acogida, preparar informe, etc."
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                            Descripción (opcional)
                        </label>
                        <textarea
                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium resize-y min-h-[80px] focus:border-primary focus:outline-none transition-colors"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detalles, pasos, enlaces…"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                            Fecha objetivo (opcional)
                        </label>
                        <input
                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                            Asignar a
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {USERS.map((u) => (
                                <label
                                    key={u.id}
                                    className={`
                                        inline-flex items-center gap-2 px-3 py-2 rounded-xl
                                        text-xs font-medium cursor-pointer
                                        transition-all
                                        ${assignedIds.includes(u.id)
                                            ? 'bg-primary/10 text-primary border-2 border-primary'
                                            : 'bg-white border-2 border-gray-100 text-gray-700 hover:border-gray-200'
                                        }
                                    `}
                                >
                                    <input
                                        type="checkbox"
                                        checked={assignedIds.includes(u.id)}
                                        onChange={() => handleToggleAssignee(u.id)}
                                        className="sr-only"
                                    />
                                    {assignedIds.includes(u.id) && <CheckSquare size={14} />}
                                    {u.name}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                            Adjuntar archivos
                        </label>
                        <FileUploader
                            onUploadComplete={setAttachments}
                            existingFiles={attachments}
                            folderPath="todos"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95"
                        >
                            ✨ Crear tarea
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
