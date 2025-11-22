import React, { useState } from 'react';
import { USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';

/**
 * Modal To-Do Creation
 * Simplified modal for creating new tasks only
 */
export default function TodoModal({ onClose }) {
    const { currentUser } = useAuth();
    const { createTodo } = useTodos(currentUser);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [assignedIds, setAssignedIds] = useState([currentUser.id]);

    function handleToggleAssigned(id) {
        setAssignedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || assignedIds.length === 0) return;

        try {
            await createTodo({
                title: trimmedTitle,
                description: description.trim(),
                dueDateKey: dueDate || null,
                assignedTo: assignedIds,
            });

            setTitle("");
            setDescription("");
            setDueDate("");
            setAssignedIds([currentUser.id]);

            // Close modal after successful creation
            onClose();
        } catch (e) {
            console.error("Unexpected error creating todo", e);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
            <div
                className="bg-card p-6 rounded-[24px] w-[90%] max-w-[500px] shadow-lg border-2 border-border animate-[popIn_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Crear nueva tarea</h2>
                    <button
                        type="button"
                        className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5 hover:bg-[#fff8ee] transition-colors"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>

                <p className="text-sm text-[#444] mb-4 leading-relaxed">
                    Crea tareas, asígnalas a tus compañeros y marca cada una cuando esté hecha.
                    Cuando todas las personas asignadas la marcan, la tarea se considera completada por el equipo. ✨
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1">Título de la tarea</label>
                        <input
                            className="w-full rounded-[10px] border-2 border-border p-2 text-sm font-inherit focus:border-primary focus:outline-none"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ej.: Revisar manual de acogida, preparar informe, etc."
                            required
                        />
                    </div>

                    <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1">Descripción (opcional)</label>
                        <textarea
                            className="w-full rounded-[10px] border-2 border-border p-2 text-sm font-inherit resize-y min-h-[60px] focus:border-primary focus:outline-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detalles, pasos, enlaces…"
                        />
                    </div>

                    <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1">Fecha objetivo (opcional)</label>
                        <input
                            className="w-full rounded-[10px] border-2 border-border p-2 text-sm font-inherit focus:border-primary focus:outline-none"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-xs font-semibold mb-2">Asignar a</label>
                        <div className="flex flex-wrap gap-2">
                            {USERS.map((u) => (
                                <label key={u.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-border bg-white text-xs cursor-pointer hover:bg-[#fff8ee] transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={assignedIds.includes(u.id)}
                                        onChange={() => handleToggleAssigned(u.id)}
                                    />
                                    {u.name}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            className="rounded-full border-2 border-border px-4 py-2 text-sm font-semibold cursor-pointer bg-transparent hover:bg-[#fff8ee] transition-colors"
                            onClick={onClose}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="rounded-full border-2 border-border px-4 py-2 text-sm font-semibold cursor-pointer bg-primary text-white hover:bg-primary-dark transition-colors shadow-[2px_2px_0_rgba(0,0,0,0.2)]"
                        >
                            ✨ Crear tarea
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
