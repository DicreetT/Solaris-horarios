import React, { useState } from 'react';
import { USERS } from '../constants';

/**
 * Modal To-Do List
 */
export default function TodoModal({
    currentUser,
    todos,
    onClose,
    onCreateTodo,
    onToggleTodoCompleted,
    onDeleteTodo,
}) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [assignedIds, setAssignedIds] = useState([currentUser.id]);

    function handleToggleAssigned(id) {
        setAssignedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    function handleSubmit(e) {
        e.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || assignedIds.length === 0) return;

        onCreateTodo({
            title: trimmedTitle,
            description: description.trim(),
            dueDateKey: dueDate || null,
            assignedTo: assignedIds,
        });

        setTitle("");
        setDescription("");
        setDueDate("");
        setAssignedIds([currentUser.id]);
    }

    const tasksForMe = todos.filter(
        (t) =>
            t.assignedTo.includes(currentUser.id) &&
            !t.completedBy.includes(currentUser.id)
    );
    const tasksCreatedByMe = todos.filter(
        (t) => t.createdBy === currentUser.id && !t.assignedTo.includes(currentUser.id)
    );

    function renderTodoRow(todo) {
        const isDoneForMe = todo.completedBy.includes(currentUser.id);
        const allDone =
            todo.assignedTo.length > 0 &&
            todo.assignedTo.every((uid) => todo.completedBy.includes(uid));
        const creator = USERS.find((u) => u.id === todo.createdBy);
        const assignees = todo.assignedTo
            .map((id) => USERS.find((u) => u.id === id)?.name || id)
            .join(", ");

        return (
            <div key={todo.id} className="bg-[#fafaf9] border border-[#e5e7eb] rounded-xl p-2">
                <label className="flex items-start gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isDoneForMe}
                        onChange={() => onToggleTodoCompleted(todo.id)}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#222]">
                            {todo.title}
                            {allDone && (
                                <span className="inline-block bg-[#dcfce7] text-[#166534] text-[0.65rem] px-1.5 py-[1px] rounded-full ml-2 font-normal">
                                    ✓ Todo el equipo ha completado esta tarea
                                </span>
                            )}
                        </div>
                        {todo.description && (
                            <div className="text-xs text-[#666] mt-0.5">{todo.description}</div>
                        )}
                        <div className="text-[0.65rem] text-[#888] mt-1">
                            Creada por {creator?.name || todo.createdBy}
                            {" · Para: "}
                            {assignees || "—"}
                            {todo.dueDateKey && <> · Fecha objetivo: {todo.dueDateKey}</>}
                        </div>
                    </div>
                    {todo.createdBy === currentUser.id && (
                        <button
                            type="button"
                            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] border-[#fecaca] hover:bg-[#fecaca]"
                            onClick={() => onDeleteTodo(todo.id)}
                            title="Eliminar tarea"
                        >
                            ✕
                        </button>
                    )}
                </label>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
            <div className="bg-card p-6 rounded-[24px] w-[90%] max-w-[500px] shadow-lg border-2 border-border animate-[popIn_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
                <div className="text-lg font-bold mb-2">To-Do List de {currentUser.name}</div>
                <div className="text-sm text-[#444] mb-4 leading-relaxed">
                    Crea tareas, asígnalas a tus compis y marca cada una cuando esté
                    hecha. Cuando todas las personas asignadas la marcan, la tarea se
                    considera completada por el equipo. ✨
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1">Título de la tarea</label>
                        <input
                            className="w-full rounded-[10px] border border-[#ccc] p-2 text-sm font-inherit"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ej.: Revisar manual de acogida, preparar informe, etc."
                            required
                        />
                    </div>

                    <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1">Descripción (opcional)</label>
                        <textarea
                            className="w-full rounded-[10px] border border-[#ccc] p-2 text-sm font-inherit resize-y min-h-[60px]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detalles, pasos, enlaces…"
                        />
                    </div>

                    <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1">Fecha objetivo (opcional)</label>
                        <input
                            className="w-full rounded-[10px] border border-[#ccc] p-2 text-sm font-inherit"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>

                    <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1">Asignar a</label>
                        <div className="flex flex-wrap gap-1">
                            {USERS.map((u) => (
                                <label key={u.id} className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full border border-[#e5e7eb] bg-white text-[0.75rem]">
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

                    <button
                        type="submit"
                        className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark"
                        style={{ marginTop: 4 }}
                    >
                        Crear tarea
                    </button>
                </form>

                <div className="text-sm font-bold mt-4 mb-2 border-b border-[#eee] pb-1">Tareas para ti</div>
                {tasksForMe.length === 0 ? (
                    <p className="text-xs text-[#666] italic">
                        No tienes tareas pendientes. ¡Buen trabajo!
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {tasksForMe.map((t) => renderTodoRow(t))}
                    </div>
                )}

                <div className="text-sm font-bold mt-4 mb-2 border-b border-[#eee] pb-1">Tareas que has creado</div>
                {tasksCreatedByMe.length === 0 ? (
                    <p className="text-xs text-[#666] italic">
                        Aún no has creado tareas solo para otras personas.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {tasksCreatedByMe.map((t) => renderTodoRow(t))}
                    </div>
                )}

                <div
                    className="flex flex-row items-center gap-2 mt-2 justify-end"
                >
                    <button
                        type="button"
                        className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                        onClick={onClose}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
