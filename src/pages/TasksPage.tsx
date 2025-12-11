import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { USERS } from '../constants';
import TodoModal from '../components/TodoModal';
import TaskDetailModal from '../components/TaskDetailModal';
import { Todo } from '../types';
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
    List,
    Paperclip,
    Tag,
    Search,
    X
} from 'lucide-react';

/**
 * Tasks page
 * Modern, card-based todo list management
 */
function TasksPage() {
    const { currentUser } = useAuth();
    const { todos, toggleTodo, deleteTodo } = useTodos(currentUser);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Todo | null>(null);

    // Filters
    const [filterDate, setFilterDate] = useState("");
    const [filterCreator, setFilterCreator] = useState("all");
    const [filterAssignee, setFilterAssignee] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all"); // 'all', 'pending', 'completed'
    const [filterTags, setFilterTags] = useState<string[]>([]); // Array of selected tags
    const [searchQuery, setSearchQuery] = useState("");

    // View Mode for Non-Admins
    const [activeTab, setActiveTab] = useState<'all' | 'assigned' | 'created' | 'completed'>('assigned');
    const isAdmin = currentUser?.isAdmin;

    // --- Helpers ---

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

    // Get all unique tags from all todos for filter dropdown
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        todos.forEach(t => t.tags?.forEach((tag: string) => tags.add(tag)));
        return Array.from(tags).sort();
    }, [todos]);

    // Sorting helper
    const sortTasksByDate = (taskList: Todo[]) => {
        return [...taskList].sort((a, b) => {
            if (!a.due_date_key) return 1; // No date goes last
            if (!b.due_date_key) return -1;
            return a.due_date_key.localeCompare(b.due_date_key);
        });
    };

    // Global Filter Logic
    const matchesFilters = (t: Todo) => {
        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
        }

        // Date Filter (Creation Date)
        if (filterDate) {
            const createdDate = t.created_at.split('T')[0];
            if (createdDate !== filterDate) return false;
        }

        // Creator Filter
        if (filterCreator !== "all") {
            if (t.created_by !== filterCreator) return false;
        }

        // Assignee Filter
        if (filterAssignee !== "all") {
            if (!t.assigned_to.includes(filterAssignee)) return false;
        }

        // Tag Filter
        if (filterTags.length > 0) {
            if (!t.tags || t.tags.length === 0) return false;
            // Matches if task has ALL selected tags (AND logic) or ANY? Usually OR for tags filtering in simple UIs, or AND.
            // Let's go with OR (matches any of the selected tags).
            const hasTag = filterTags.some(tag => t.tags?.includes(tag));
            if (!hasTag) return false;
        }

        return true;
    };

    // --- Task Card Component ---
    const TaskCard = ({ todo }: { todo: Todo }) => {
        const isDone = todo.assigned_to.length > 0 && todo.assigned_to.every(uid => todo.completed_by.includes(uid));
        const creator = USERS.find((u) => u.id === todo.created_by);
        const isAssignedToMe = todo.assigned_to.includes(currentUser.id);
        const isDoneByMe = todo.completed_by.includes(currentUser.id);

        return (
            <div
                onClick={() => setSelectedTask(todo)}
                className={`
                    group relative bg-white rounded-2xl p-5 border transition-all cursor-pointer shadow-sm hover:shadow-md
                    ${isDone ? 'border-gray-100 bg-gray-50/50 opacity-75' : 'border-gray-200 hover:border-blue-300'}
                `}
            >
                {/* Header: Badges & Status */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-wrap gap-2">
                        {todo.tags && todo.tags.length > 0 ? (
                            todo.tags.map(tag => (
                                <span key={tag} className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getTagColor(tag)}`}>
                                    {tag}
                                </span>
                            ))
                        ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-gray-50 text-gray-400 border-gray-100">
                                General
                            </span>
                        )}
                    </div>

                    {todo.due_date_key && (
                        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${isDone ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-600'}`}>
                            <Calendar size={12} />
                            <span>{todo.due_date_key}</span>
                        </div>
                    )}
                </div>

                {/* Title & Desc */}
                <div className="mb-4">
                    <h3 className={`font-bold text-gray-900 text-lg leading-snug mb-1 ${isDone ? 'line-through text-gray-400' : ''}`}>
                        {todo.title}
                    </h3>
                    {todo.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">
                            {todo.description}
                        </p>
                    )}
                </div>

                {/* Metadata & Actions */}
                <div className="flex items-end justify-between pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-3">
                        {/* Assignees */}
                        <div className="flex -space-x-2">
                            {todo.assigned_to.map((uid: string) => {
                                const u = USERS.find(user => user.id === uid);
                                const userDone = todo.completed_by.includes(uid);
                                return (
                                    <div key={uid} className="relative z-0 group/avatar">
                                        <UserAvatar name={u?.name || uid} size="xs" className={`w-7 h-7 border-2 border-white ${userDone ? 'opacity-50 grayscale' : ''}`} />
                                        {userDone && <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border border-white z-10"><CheckCircle2 size={8} className="text-white" /></div>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Creator (if different from single assignee or always show) */}
                        <div className="text-xs text-gray-400 flex flex-col">
                            <span className="text-[10px] uppercase font-bold">Creado por</span>
                            <span>{creator?.name || 'Desconocido'}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Attachments */}
                        {todo.attachments && todo.attachments.length > 0 && (
                            <div className="flex items-center gap-1 text-gray-400 bg-gray-50 px-2 py-1 rounded-lg" title={`${todo.attachments.length} adjuntos`}>
                                <Paperclip size={14} />
                                <span className="text-xs font-medium">{todo.attachments.length}</span>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 ml-2">
                            {isAssignedToMe && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTodo(todo);
                                    }}
                                    className={`
                                        p-2 rounded-xl border transition-all shadow-sm
                                        ${isDoneByMe
                                            ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                                            : 'bg-white border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-500'}
                                    `}
                                    title={isDoneByMe ? "Marcar como pendiente" : "Marcar como completada"}
                                >
                                    {isDoneByMe ? <CheckCircle2 size={18} fill="currentColor" className="text-green-500" /> : <Circle size={18} />}
                                </button>
                            )}

                            {todo.created_by === currentUser.id && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm('¿Borrar tarea?')) deleteTodo(todo.id);
                                    }}
                                    className="p-2 rounded-xl bg-white border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-all shadow-sm opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- Derived Lists ---

    // For non-admin view primarily, but admin sees everything.
    // Let's unify Logic:
    // If Admin: show all filtered by default? No, Admin also needs "My Tasks".
    // Let's implement Tabs for everyone.
    // 1. "Mis Tareas" (Assigned to me)
    // 2. "Creadas por mí"
    // 3. "Todas" (Admin Only or Team View)
    // Actually simplicity:
    // If Admin: Tabs = "Todo el Equipo", "Mis Tareas", "Creadas por mí".
    // If User: Tabs = "Mis Tareas", "Creadas por mí".

    const filteredTodos = useMemo(() => {
        return todos.filter(t => matchesFilters(t));
    }, [todos, filterDate, filterCreator, filterAssignee, filterTags, searchQuery]);

    const lists = useMemo(() => {
        const assigned = sortTasksByDate(filteredTodos.filter(t => t.assigned_to.includes(currentUser.id) && !t.completed_by.includes(currentUser.id)));
        const created = sortTasksByDate(filteredTodos.filter(t => t.created_by === currentUser.id));

        // Completed Tasks (Assigned to me, but completed)
        const completed = sortTasksByDate(filteredTodos.filter(t => t.assigned_to.includes(currentUser.id) && t.completed_by.includes(currentUser.id)));

        // Admin: All Pending
        const allPending = sortTasksByDate(filteredTodos.filter(t => {
            const isCompleted = t.assigned_to.length > 0 && t.assigned_to.every((uid: string) => t.completed_by.includes(uid));
            return !isCompleted;
        }));

        return { assigned, created, completed, allPending };
    }, [filteredTodos, currentUser.id]);


    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header Section */}
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <CheckSquare className="text-primary" size={32} />
                        Gestión de Tareas
                    </h1>
                    <p className="text-gray-500 font-medium mt-1">
                        Organiza, colabora y cumple objetivos.
                    </p>
                </div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-105 active:scale-95"
                >
                    <Plus size={20} strokeWidth={3} />
                    <span>Nueva Tarea</span>
                </button>
            </div>

            {/* Controls Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-8">
                {/* Top Row: Tabs & Search */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                        {(isAdmin
                            ? ['all', 'assigned', 'created', 'completed']
                            : ['assigned', 'created', 'completed']
                        ).map((tab) => {
                            const labels: Record<string, string> = {
                                all: 'Todo el Equipo',
                                assigned: 'Mis Tareas',
                                created: 'Creadas por mí',
                                completed: 'Historial'
                            };
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`
                                        px-4 py-2 rounded-lg text-sm font-bold transition-all
                                        ${(isAdmin ? (activeTab === 'all' && tab === 'all') || activeTab === tab : activeTab === tab)
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
                                    `}
                                >
                                    {labels[tab]}
                                </button>
                            );
                        })}
                    </div>

                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar tareas..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-primary rounded-xl text-sm font-medium transition-all outline-none"
                        />
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider mr-2">
                        <Filter size={14} /> Filtros:
                    </div>

                    {/* Tag Filter */}
                    <div className="flex items-center gap-2">
                        {allTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => {
                                    setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                                }}
                                className={`
                                    px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1
                                    ${filterTags.includes(tag)
                                        ? `${getTagColor(tag)} ring-2 ring-offset-1 ring-gray-200`
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}
                                `}
                            >
                                <Tag size={12} />
                                {tag}
                            </button>
                        ))}
                    </div>

                    <div className="h-6 w-px bg-gray-200 mx-2" />

                    {/* Select Filters */}
                    <select
                        value={filterAssignee}
                        onChange={(e) => setFilterAssignee(e.target.value)}
                        className="px-3 py-1.5 bg-gray-50 border-transparent hover:bg-white border hover:border-gray-200 rounded-lg text-xs font-bold text-gray-600 cursor-pointer outline-none"
                    >
                        <option value="all">Cualquier responsable</option>
                        {USERS.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>

                    {(filterTags.length > 0 || filterAssignee !== 'all' || filterCreator !== 'all' || filterDate || searchQuery) && (
                        <button
                            onClick={() => {
                                setFilterTags([]);
                                setFilterAssignee('all');
                                setFilterCreator('all');
                                setFilterDate('');
                                setSearchQuery('');
                            }}
                            className="ml-auto text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
                        >
                            <X size={12} /> Limpiar
                        </button>
                    )}
                </div>
            </div>

            {/* Grid Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {(() => {
                    let displayList: Todo[] = [];
                    // Logic to select list based on tab
                    if (isAdmin && activeTab === 'all' as any) {
                        displayList = lists.allPending; // Admin View of Team
                    } else if (activeTab === 'assigned') {
                        displayList = lists.assigned;
                    } else if (activeTab === 'created') {
                        displayList = lists.created;
                    } else if (activeTab === 'completed') {
                        displayList = lists.completed;
                    } else {
                        // Default fallback
                        displayList = lists.assigned;
                    }

                    if (displayList.length === 0) {
                        return (
                            <div className="col-span-full py-16 text-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
                                <div className="inline-flex p-4 bg-white rounded-full shadow-sm mb-4">
                                    <List className="text-gray-300" size={32} />
                                </div>
                                <h3 className="text-gray-900 font-bold text-lg mb-1">No hay tareas aquí</h3>
                                <p className="text-gray-500 text-sm">
                                    {activeTab === 'completed' ? 'Aún no has completado tareas.' : '¡Todo está limpio! Crea una nueva tarea para empezar.'}
                                </p>
                            </div>
                        );
                    }

                    return displayList.map(task => (
                        <TaskCard key={task.id} todo={task} />
                    ));
                })()}
            </div>

            {/* Create Task Modal */}
            {showCreateModal && (
                <TodoModal onClose={() => setShowCreateModal(false)} />
            )}

            {/* Task Detail Modal */}
            {selectedTask && (
                <TaskDetailModal
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                />
            )}
        </div>
    );
}

export default TasksPage;
