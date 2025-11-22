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
            <div key={todo.id} className="todo-row">
                <label className="todo-main">
                    <input
                        type="checkbox"
                        checked={isDoneForMe}
                        onChange={() => onToggleTodoCompleted(todo.id)}
                    />
                    <div className="todo-text">
                        <div className="todo-title">
                            {todo.title}
                            {allDone && (
                                <span className="todo-pill-done">
                                    ✓ Todo el equipo ha completado esta tarea
                                </span>
                            )}
                        </div>
                        {todo.description && (
                            <div className="todo-desc small-muted">{todo.description}</div>
                        )}
                        <div className="todo-meta small-muted">
                            Creada por {creator?.name || todo.createdBy}
                            {" · Para: "}
                            {assignees || "—"}
                            {todo.dueDateKey && <> · Fecha objetivo: {todo.dueDateKey}</>}
                        </div>
                    </div>
                    {todo.createdBy === currentUser.id && (
                        <button
                            type="button"
                            className="btn btn-small btn-danger"
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
        <div className="dialog-backdrop">
            <div className="dialog-paper">
                <div className="dialog-title">To-Do List de {currentUser.name}</div>
                <div className="dialog-text">
                    Crea tareas, asígnalas a tus compis y marca cada una cuando esté
                    hecha. Cuando todas las personas asignadas la marcan, la tarea se
                    considera completada por el equipo. ✨
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="todo-form-row">
                        <label className="field-label">Título de la tarea</label>
                        <input
                            className="input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ej.: Revisar manual de acogida, preparar informe, etc."
                            required
                        />
                    </div>

                    <div className="todo-form-row">
                        <label className="field-label">Descripción (opcional)</label>
                        <textarea
                            className="note-input"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detalles, pasos, enlaces…"
                        />
                    </div>

                    <div className="todo-form-row">
                        <label className="field-label">Fecha objetivo (opcional)</label>
                        <input
                            className="input"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>

                    <div className="todo-form-row">
                        <label className="field-label">Asignar a</label>
                        <div className="todo-assignees">
                            {USERS.map((u) => (
                                <label key={u.id} className="todo-assignee-pill">
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
                        className="btn btn-small btn-primary"
                        style={{ marginTop: 4 }}
                    >
                        Crear tarea
                    </button>
                </form>

                <div className="todo-section-title">Tareas para ti</div>
                {tasksForMe.length === 0 ? (
                    <p className="todo-empty">
                        No tienes tareas pendientes. ¡Buen trabajo!
                    </p>
                ) : (
                    <div className="todo-list">
                        {tasksForMe.map((t) => renderTodoRow(t))}
                    </div>
                )}

                <div className="todo-section-title">Tareas que has creado</div>
                {tasksCreatedByMe.length === 0 ? (
                    <p className="todo-empty">
                        Aún no has creado tareas solo para otras personas.
                    </p>
                ) : (
                    <div className="todo-list">
                        {tasksCreatedByMe.map((t) => renderTodoRow(t))}
                    </div>
                )}

                <div
                    className="flex-row"
                    style={{ marginTop: 10, justifyContent: "flex-end" }}
                >
                    <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={onClose}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
