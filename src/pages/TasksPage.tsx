import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { USERS } from '../constants';
import TodoModal from '../components/TodoModal';
import { UserAvatar } from '../components/UserAvatar';
import { RoleBadge } from '../components/RoleBadge';
import {
    CheckSquare,
    Plus,
    Trash2,
    Calendar,
    Filter,
    CheckCircle2,
    Circle,
    LayoutGrid,
    LayoutGrid,
    List,
    Paperclip
} from 'lucide-react';

/**
 * Tasks page
 * Modern, card-based todo list management
 */
function TasksPage() {
    const { currentUser } = useAuth();
    const { todos, toggleTodo, deleteTodo } = useTodos(currentUser);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [filterUser, setFilterUser] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");

    const isAdmin = currentUser?.isAdmin;

    // Tasks for current user
    const tasksForMe = todos.filter(
        (t) =>
            t.assigned_to.includes(currentUser.id) &&
            !t.completed_by.includes(currentUser.id)
    );
    const completedTasksForMe = todos.filter(
        (t) =>
            t.assigned_to.includes(currentUser.id) &&
            t.completed_by.includes(currentUser.id)
    );

    const tasksCreatedByMe = todos.filter((t) => {
        const isCompleted = t.assigned_to.length > 0 &&
            t.assigned_to.every((uid: string) => t.completed_by.includes(uid));
        return t.created_by === currentUser.id && !isCompleted;
    });



    // Filter todos for admin view
    const filteredTodos = todos.filter((t) => {
        if (filterUser !== "all") {
            const isAssigned = t.assigned_to.includes(filterUser);
            const isCreated = t.created_by === filterUser;
            if (!isAssigned && !isCreated) return false;
        }
        if (filterStatus === "completed") {
            const allDone =
                t.assigned_to.length > 0 &&
                t.assigned_to.every((uid: string) => t.completed_by.includes(uid));
            if (!allDone) return false;
        }
        if (filterStatus === "pending") {
            const allDone =
                t.assigned_to.length > 0 &&
                t.assigned_to.every((uid: string) => t.completed_by.includes(uid));
            if (allDone) return false;
        }
        return true;
    });

    const [showCompleted, setShowCompleted] = useState(false);

    function TaskCard({ todo, isMyTask }: { todo: any; isMyTask: boolean }) {
        const isDoneForMe = todo.completed_by.includes(currentUser.id);
        const allDone =
            todo.assigned_to.length > 0 &&
            todo.assigned_to.every((uid: string) => todo.completed_by.includes(uid));
        const creator = USERS.find((u) => u.id === todo.created_by);
        const assignees = todo.assigned_to
            .map((id: string) => USERS.find((u) => u.id === id)?.name || id)
            .join(", ");

        return (
            <div className={`group relative bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 ${isDoneForMe ? 'opacity-75 bg-gray-50' : ''}`}>
                <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                        onClick={() => toggleTodo(todo)}
                        className={`
                            mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0
                            ${isDoneForMe
                                ? 'bg-green-500 border-green-500 text-white'
                                : 'border-gray-300 text-transparent hover:border-green-400'
                            }
                        `}
                    >
                        <CheckCircle2 size={14} fill="currentColor" className={isDoneForMe ? 'opacity-100' : 'opacity-0'} />
                    </button>

                    <div className="flex-1 min-w-0">
                        <h3 className={`font-bold text-gray-900 mb-1 ${isDoneForMe ? 'line-through text-gray-400' : ''}`}>
                            {todo.title}
                        </h3>

                        {todo.description && (
                            <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                                {todo.description}
                            </p>
                        )}

                        {todo.attachments && todo.attachments.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {todo.attachments.map((file: any, idx: number) => (
                                    <a
                                        key={idx}
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-primary transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Paperclip size={12} />
                                        <span className="truncate max-w-[120px]">{file.name}</span>
                                    </a>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                            {/* Creator */}
                            <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                                <UserAvatar name={creator?.name} size="xs" />
                                <span className="font-medium text-gray-600">{creator?.name}</span>
                            </div>

                            {/* Assignees */}
                            <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md">
                                <div className="flex -space-x-2">
                                    {todo.assigned_to.map((uid: string) => {
                                        const u = USERS.find(user => user.id === uid);
                                        return (
                                            <div key={uid} title={u?.name || uid}>
                                                <UserAvatar name={u?.name || uid} size="xs" className="border-2 border-white w-5 h-5" />
                                            </div>
                                        );
                                    })}
                                </div>
                                <span className="font-medium text-gray-600">
                                    {todo.assigned_to.length === 1 ? 'Asignado' : 'Asignados'}
                                </span>
                            </div>

                            {/* Due Date */}
                            {todo.due_date_key && (
                                <div className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded-md font-medium">
                                    <Calendar size={12} />
                                    <span>{todo.due_date_key}</span>
                                </div>
                            )}

                            {/* All Done Badge */}
                            {allDone && (
                                <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md font-bold">
                                    ✓ Completada
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Delete Button */}
                    {todo.created_by === currentUser.id && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteTodo(todo.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Eliminar tarea"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header Section */}
            {/* Header Section */}
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-emerald-600">
                        <CheckSquare size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Mis Tareas
                        </h1>
                        <p className="text-gray-500 font-medium">
                            ¡Vamos a por ello! Tienes <span className="text-primary font-bold">{tasksForMe.length}</span> tareas pendientes.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-105 active:scale-95"
                    >
                        <Plus size={20} strokeWidth={3} />
                        <span>Nueva Tarea</span>
                    </button>
                </div>
            </div>

            {/* Tasks For Me Section */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Asignadas a mí</h2>
                    <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                        {tasksForMe.length} {tasksForMe.length === 1 ? 'tarea' : 'tareas'}
                    </span>
                </div>

                <div className="p-6">
                    {tasksForMe.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <div className="text-4xl mb-3">🎉</div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">¡Todo limpio!</h3>
                            <p className="text-gray-500 text-sm">No tienes tareas pendientes por ahora.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {tasksForMe.map((t) => <TaskCard key={t.id} todo={t} isMyTask={true} />)}
                        </div>
                    )}

                    {/* Completed Tasks Section */}
                    {completedTasksForMe.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-gray-100">
                            <button
                                onClick={() => setShowCompleted(!showCompleted)}
                                className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                <div className={`transform transition-transform ${showCompleted ? 'rotate-90' : ''}`}>
                                    ▶
                                </div>
                                <span>Ver completadas ({completedTasksForMe.length})</span>
                            </button>

                            {showCompleted && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    {completedTasksForMe.map((t) => <TaskCard key={t.id} todo={t} isMyTask={true} />)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Created By Me Section */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Creadas por mí</h2>
                    <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                        {tasksCreatedByMe.length} {tasksCreatedByMe.length === 1 ? 'tarea' : 'tareas'}
                    </span>
                </div>

                <div className="p-6">
                    {tasksCreatedByMe.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <CheckSquare size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">No has asignado tareas a otros.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {tasksCreatedByMe.map((t) => <TaskCard key={t.id} todo={t} isMyTask={false} />)}
                        </div>
                    )}
                </div>
            </div>

            {/* Admin Panel */}
            {isAdmin && (
                <div className="mt-16 bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    Panel de Administración
                                    <RoleBadge role="admin" size="xs" />
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">Supervisión global de tareas del equipo</p>
                            </div>
                            <div className="p-2 bg-white rounded-lg border border-gray-200 text-gray-400">
                                <LayoutGrid size={20} />
                            </div>
                        </div>

                        {/* Modern Filters */}
                        <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-500 font-medium">
                                <Filter size={14} />
                                <span>Filtros:</span>
                            </div>

                            <select
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                                value={filterUser}
                                onChange={(e) => setFilterUser(e.target.value)}
                            >
                                <option value="all">Todos los usuarios</option>
                                {USERS.map((u) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>

                            <select
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option value="all">Todos los estados</option>
                                <option value="pending">Pendientes</option>
                                <option value="completed">Completadas</option>
                            </select>
                        </div>
                    </div>

                    {/* Admin List */}
                    <div className="divide-y divide-gray-100">
                        {filteredTodos.map((t) => {
                            const creator = USERS.find((u) => u.id === t.created_by)?.name || t.created_by;
                            const assignees = t.assigned_to
                                .map((uid: string) => USERS.find((u) => u.id === uid)?.name || uid)
                                .join(", ");
                            const isCompleted = t.assigned_to.length > 0 && t.assigned_to.every((uid: string) => t.completed_by.includes(uid));

                            return (
                                <div key={t.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                                    <div className="flex items-start gap-4">
                                        <div className={`mt-1 w-2 h-2 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-orange-400'}`} />
                                        <div>
                                            <h4 className="font-bold text-gray-900 text-sm">{t.title}</h4>
                                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                                                <div className="flex items-center gap-1">
                                                    <span>De:</span>
                                                    <div className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded">
                                                        <UserAvatar name={creator} size="xs" className="w-4 h-4" />
                                                        <span className="font-medium">{creator}</span>
                                                    </div>
                                                </div>
                                                <span>→</span>
                                                <div className="flex items-center gap-1">
                                                    <span>Para:</span>
                                                    <div className="flex -space-x-1">
                                                        {t.assigned_to.map((uid: string) => {
                                                            const u = USERS.find(user => user.id === uid);
                                                            return (
                                                                <div key={uid} title={u?.name || uid}>
                                                                    <UserAvatar name={u?.name || uid} size="xs" className="w-4 h-4 border border-white" />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <span className="font-medium">{assignees}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {t.attachments && t.attachments.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {t.attachments.map((file: any, idx: number) => (
                                                <a
                                                    key={idx}
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Paperclip size={10} />
                                                    {file.name}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                    </div>

                    <div className="flex items-center gap-4">
                        {isCompleted ? (
                            <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold border border-green-200">
                                Completada
                            </span>
                        ) : (
                            <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200">
                                Pendiente
                            </span>
                        )}

                        <button
                            onClick={() => deleteTodo(t.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Eliminar tarea"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            );
                        })}

            {filteredTodos.length === 0 && (
                <div className="p-12 text-center text-gray-400">
                    <p>No se encontraron tareas con los filtros actuales.</p>
                </div>
            )}
        </div>
                </div >
            )
}

{/* Create Task Modal */ }
{
    showCreateModal && (
        <TodoModal onClose={() => setShowCreateModal(false)} />
    )
}
        </div >
    );
}

export default TasksPage;
