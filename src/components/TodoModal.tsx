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

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e) e.preventDefault();
        console.log("handleSubmit called");

        if (!title.trim()) {
            alert('Por favor, escribe un título para la tarea.');
            return;
        }

        setIsSubmitting(true);
        try {
            await createTodo({
                title: title.trim(),
                description: description.trim(),
                dueDateKey: dueDate || null,
                assignedTo: assignedIds,
                attachments,
            });
            onClose();
            setTitle("");
            setDescription("");
            setDueDate("");
            setAssignedIds([currentUser.id]);
            setAttachments([]);
        } catch (error: any) {
            console.error('Error creating todo:', error);
            alert(`Error al crear la tarea: ${error.message || 'Error desconocido'}`);
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
                className="bg-white rounded-3xl shadow-2xl max-w-md w-full animate-[popIn_0.2s_ease-out] max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 pb-0 shrink-0">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Crear nueva tarea</h2>
                    <button
                        type="button"
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                        onClick={onClose}
                    >
                        <XCircle size={24} />
                    </button>
                </div>

                <p className="text-gray-500 px-6 mb-6 font-medium shrink-0 pt-4">
                    Crea tareas, asígnalas a tus compañeros y marca cada una cuando esté hecha.
                    Cuando todas las personas asignadas la marcan, la tarea se considera completada por el equipo. ✨
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5 custom-scrollbar">
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

                    </div>

                    <div className="flex gap-3 p-6 border-t border-gray-100 bg-white shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className={`flex-1 py-3 rounded-xl bg-primary text-white font-bold transition-all shadow-lg shadow-primary/25 cursor-pointer
                            ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-dark hover:scale-105 active:scale-95'}
                        `}
                        >
                            {isSubmitting ? 'Creando...' : '✨ Crear tarea'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
