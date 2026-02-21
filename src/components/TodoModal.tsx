import React, { useState } from 'react';
import { USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { XCircle, CheckSquare, Tag, Plus, X } from 'lucide-react';
import { FileUploader, Attachment } from './FileUploader';

export default function TodoModal({ onClose }: { onClose: () => void }) {
    const { currentUser } = useAuth();
    const { createTodo } = useTodos(currentUser);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [assignedIds, setAssignedIds] = useState([currentUser.id]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    // Tag State
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");

    const handleToggleAssignee = (id: string) => {
        setAssignedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
        if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !tagInput.trim()) return;
        e.preventDefault();
        const newTag = tagInput.trim();
        if (!tags.includes(newTag)) {
            setTags([...tags, newTag]);
        }
        setTagInput("");
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e) e.preventDefault();

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
                tags
            });
            onClose();
        } catch (error: any) {
            console.error('Error creating todo:', error);
            alert(`Error al crear la tarea: ${error.message || 'Error desconocido'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="app-modal-overlay"
            onClick={onClose}
        >
            <div
                className="app-modal-panel bg-white rounded-3xl shadow-2xl max-w-md w-full animate-[popIn_0.2s_ease-out] flex flex-col overflow-hidden"
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
                    Organiza el trabajo del equipo. Añade etiquetas para categorizar fácilmente.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5 custom-scrollbar">
                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">
                                Título de la tarea *
                            </label>
                            <input
                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors !text-black"
                                style={{ color: '#000000' }}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ej.: Revisar inventario mensual"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">
                                Etiquetas / Categorías
                            </label>
                            <div className="flex gap-2 mb-2">
                                <input
                                    className="flex-1 rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors !text-black"
                                    style={{ color: '#000000' }}
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleAddTag}
                                    placeholder="Ej.: Ventas, Urgente... (Enter para añadir)"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddTag}
                                    className="p-3 bg-gray-100 rounded-xl text-gray-600 hover:bg-gray-200"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {tags.map(tag => (
                                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
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
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">
                                Descripción (opcional)
                            </label>
                            <textarea
                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium bg-white !text-black resize-y min-h-[80px] focus:border-primary focus:outline-none transition-colors"
                                style={{ color: '#000000' }}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Detalles, pasos, enlaces…"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">
                                Fecha objetivo
                            </label>
                            <input
                                className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-medium focus:border-primary focus:outline-none transition-colors !text-black"
                                style={{ color: '#000000' }}
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
