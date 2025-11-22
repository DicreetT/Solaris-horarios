import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { USERS } from '../constants';
import TodoModal from '../components/TodoModal';

/**
 * Tasks page
 * Dedicated page for todo list management
 * Shows regular tasks for all users, plus admin panel for Thalia
 */
function TasksPage() {
    const { currentUser } = useAuth();
    const { todos, toggleTodoCompleted, deleteTodo } = useTodos(currentUser);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [filterUser, setFilterUser] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");

    const isAdmin = currentUser?.isAdmin;

    // Tasks for current user
    const tasksForMe = todos.filter(
        (t) =>
            t.assignedTo.includes(currentUser.id) &&
            !t.completedBy.includes(currentUser.id)
    );
    const tasksCreatedByMe = todos.filter(
        (t) => t.createdBy === currentUser.id && !t.assignedTo.includes(currentUser.id)
    );

    // Filter todos for admin view
    const filteredTodos = todos.filter((t) => {
        if (filterUser !== "all") {
            const isAssigned = t.assignedTo.includes(filterUser);
            const isCreated = t.createdBy === filterUser;
            if (!isAssigned && !isCreated) return false;
        }
        if (filterStatus === "completed") {
            const allDone =
                t.assignedTo.length > 0 &&
                t.assignedTo.every((uid) => t.completedBy.includes(uid));
            if (!allDone) return false;
        }
        if (filterStatus === "pending") {
            const allDone =
                t.assignedTo.length > 0 &&
                t.assignedTo.every((uid) => t.completedBy.includes(uid));
            if (allDone) return false;
        }
        return true;
    });

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
            <div key={todo.id} className="bg-[#fafaf9] border-2 border-border rounded-xl p-3 hover:bg-[#fff8ee] transition-colors">
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isDoneForMe}
                        onChange={() => toggleTodoCompleted(todo.id)}
                        className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#222]">
                            {todo.title}
                            {allDone && (
                                <span className="inline-block bg-[#dcfce7] text-[#166534] text-[0.65rem] px-1.5 py-[1px] rounded-full ml-2 font-normal border border-[#86efac]">
                                    ✓ Todo el equipo ha completado esta tarea
                                </span>
                            )}
                        </div>
                        {todo.description && (
                            <div className="text-xs text-[#666] mt-1">{todo.description}</div>
                        )}
                        <div className="text-[0.65rem] text-[#888] mt-1">
                            Creada por {creator?.name || todo.createdBy}
                            {" · Para: "}
                            {assignees || "—"}
                            {todo.dueDateKey && <> · 📅 {todo.dueDateKey}</>}
                        </div>
                    </div>
                    {todo.createdBy === currentUser.id && (
                        <button
                            type="button"
                            className="rounded-full border-2 border-[#fecaca] px-2.5 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-[#fee2e2] text-[#b91c1c] hover:bg-[#fecaca] transition-colors"
                            onClick={(e) => {
                                e.preventDefault();
                                deleteTodo(todo.id);
                            }}
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
        <div className="max-w-6xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Mis Tareas</h1>
                    <p className="text-[#666]">Gestiona tus tareas y asignaciones</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="rounded-full border-2 border-border px-4 py-2.5 text-sm font-semibold cursor-pointer inline-flex items-center gap-2 bg-primary text-white hover:bg-primary-dark transition-colors shadow-[2px_2px_0_rgba(0,0,0,0.2)]"
                >
                    ✨ Crear nueva tarea
                </button>
            </div>

            {/* Tasks for me */}
            <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_rgba(0,0,0,0.2)] p-6 mb-6">
                <h2 className="text-lg font-bold mb-4 border-b-2 border-border pb-2">Tareas para ti</h2>
                {tasksForMe.length === 0 ? (
                    <p className="text-sm text-[#666] italic">
                        No tienes tareas pendientes. ¡Buen trabajo! 🎉
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {tasksForMe.map((t) => renderTodoRow(t))}
                    </div>
                )}
            </div>

            {/* Tasks created by me */}
            <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_rgba(0,0,0,0.2)] p-6 mb-6">
                <h2 className="text-lg font-bold mb-4 border-b-2 border-border pb-2">Tareas que has creado</h2>
                {tasksCreatedByMe.length === 0 ? (
                    <p className="text-sm text-[#666] italic">
                        Aún no has creado tareas solo para otras personas.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {tasksCreatedByMe.map((t) => renderTodoRow(t))}
                    </div>
                )}
            </div>

            {/* Admin panel - only for Admins */}
            {isAdmin && (
                <div className="bg-card border-2 border-border rounded-[20px] shadow-[4px_4px_0_rgba(0,0,0,0.2)] p-6">
                    <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-2">
                        <h2 className="text-lg font-bold">Panel de Administración de Tareas</h2>
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded border border-amber-200 font-bold">
                            ADMIN
                        </span>
                    </div>
                    <p className="text-sm text-[#666] mb-4">Visión global de todas las tareas creadas y su estado</p>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <select
                            className="flex-1 rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit bg-white hover:bg-[#fff8ee] transition-colors"
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                        >
                            <option value="all">Todos los usuarios</option>
                            {USERS.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name}
                                </option>
                            ))}
                        </select>
                        <select
                            className="flex-1 rounded-[10px] border-2 border-border p-2.5 text-sm font-inherit bg-white hover:bg-[#fff8ee] transition-colors"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="all">Todos los estados</option>
                            <option value="pending">Pendientes</option>
                            <option value="completed">Completadas</option>
                        </select>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b-2 border-border text-left">
                                    <th className="p-3 font-semibold">Tarea</th>
                                    <th className="p-3 font-semibold">Creada por</th>
                                    <th className="p-3 font-semibold">Asignada a</th>
                                    <th className="p-3 font-semibold">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTodos.map((t) => {
                                    const creator = USERS.find((u) => u.id === t.createdBy)?.name || t.createdBy;
                                    const assignees = t.assignedTo
                                        .map((uid) => USERS.find((u) => u.id === uid)?.name || uid)
                                        .join(", ");

                                    const isCompleted =
                                        t.assignedTo.length > 0 &&
                                        t.assignedTo.every((uid) => t.completedBy.includes(uid));

                                    return (
                                        <tr key={t.id} className="border-b border-[#eee] hover:bg-[#fff8ee] transition-colors">
                                            <td className="p-3">
                                                <strong className="block">{t.title}</strong>
                                                {t.description && <div className="text-xs text-[#666] mt-1">{t.description}</div>}
                                                {t.dueDateKey && <div className="text-xs text-[#666] mt-1">📅 {t.dueDateKey}</div>}
                                            </td>
                                            <td className="p-3">{creator}</td>
                                            <td className="p-3">{assignees || "—"}</td>
                                            <td className="p-3">
                                                {isCompleted ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-[#dcfce7] text-[#166534] border border-[#86efac]">
                                                        ✓ Completada
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-[#fff7ed] text-[#9a3412] border border-[#fed7aa]">
                                                        ⏳ Pendiente
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredTodos.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-[#666]">
                                            No hay tareas que coincidan con los filtros.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create Task Modal */}
            {showCreateModal && (
                <TodoModal onClose={() => setShowCreateModal(false)} />
            )}
        </div>
    );
}

export default TasksPage;
