import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import TodoModal from '../components/TodoModal';
import TaskDetailModal from '../components/TaskDetailModal';
import { Todo } from '../types';
import { TaskSection } from '../components/TaskSection';
import { TaskCardRow } from '../components/TaskCardRow';
import { CheckSquare, Plus, UserCheck, Shield, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { USERS } from '../constants';

function TasksPage() {
    const { currentUser } = useAuth();
    const { todos, toggleTodo } = useTodos(currentUser);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Todo | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    // Auto-open task if task ID is in URL
    useEffect(() => {
        const taskId = searchParams.get('task');
        if (taskId && todos.length > 0) {
            const task = todos.find(t => t.id.toString() === taskId);
            if (task) {
                openTaskDetail(task);
                // Clear the param after opening to avoid re-opening on manual close if needed? 
                // Or keep it. Usually clear is better to keep URL clean.
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('task');
                setSearchParams(newParams, { replace: true });
            }
        }
    }, [searchParams, todos, setSearchParams]);

    const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'today' | 'pending' | 'completed'>('pending');
    const [assignedToFilter, setAssignedToFilter] = useState<string>('all');
    const [assignedByFilter, setAssignedByFilter] = useState<string>('all');
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [titleSearch, setTitleSearch] = useState('');
    const [commentSeenVersion, setCommentSeenVersion] = useState(0);

    const isAdmin = currentUser?.isAdmin;

    const getSeenStorageKey = (taskId: number) => `task-comments-seen:${currentUser.id}:${taskId}`;
    const getLatestForeignCommentAt = (task: Todo): string | null => {
        const foreignComments = (task.comments || []).filter((c: any) => c.user_id !== currentUser.id);
        if (foreignComments.length === 0) return null;
        return foreignComments.reduce((max: string, c: any) => (c.created_at > max ? c.created_at : max), foreignComments[0].created_at);
    };

    // Seed initial "seen" baseline so old comments do not appear as new.
    // Only new comments posted after this baseline will trigger unread state.
    useEffect(() => {
        todos.forEach((task) => {
            const key = getSeenStorageKey(task.id);
            const existing = localStorage.getItem(key);
            if (existing) return;
            const latest = getLatestForeignCommentAt(task);
            if (latest) {
                localStorage.setItem(key, latest);
            }
        });
    }, [todos, currentUser.id]);

    const unreadCommentsByTask = useMemo(() => {
        const map = new Map<number, number>();
        todos.forEach((task) => {
            const seenAt = localStorage.getItem(getSeenStorageKey(task.id)) || '';
            const unread = (task.comments || []).filter((c: any) => c.user_id !== currentUser.id && c.created_at > seenAt).length;
            map.set(task.id, unread);
        });
        return map;
    }, [todos, currentUser.id, commentSeenVersion]);

    const markTaskCommentsAsSeen = (task: Todo) => {
        const latest = getLatestForeignCommentAt(task);
        if (!latest) return;
        const key = getSeenStorageKey(task.id);
        const seenAt = localStorage.getItem(key) || '';
        if (latest <= seenAt) return;
        localStorage.setItem(key, latest);
        setCommentSeenVersion((v) => v + 1);
    };

    const openTaskDetail = (task: Todo) => {
        markTaskCommentsAsSeen(task);
        setSelectedTask(task);
    };

    // --- Sorting Logic ---
    const getTaskPriority = (t: Todo) => {
        const isDoneForMe = t.completed_by.includes(currentUser.id);
        const isAssignedToMe = t.assigned_to.includes(currentUser.id);

        // If it's assigned to me and I'm done, it's low priority (3)
        if (isAssignedToMe && isDoneForMe) return 3;

        // If it's NOT assigned to me but it's globally done, it's low priority
        const isGloballyDone = t.assigned_to.length > 0 && t.assigned_to.every(uid => t.completed_by.includes(uid));
        if (!isAssignedToMe && isGloballyDone) return 3;

        if (t.due_date_key) {
            const today = new Date().toISOString().split('T')[0];
            // Only show as urgent (1) if I haven't finished it yet
            if (t.due_date_key <= today && (!isAssignedToMe || !isDoneForMe)) return 1;
        }
        return 2;
    };

    const sortTasks = (taskList: Todo[]) => {
        return [...taskList].sort((a, b) => {
            const pA = getTaskPriority(a);
            const pB = getTaskPriority(b);
            if (pA !== pB) return pA - pB;

            // Secondary: Date
            if (a.due_date_key && b.due_date_key) return a.due_date_key.localeCompare(b.due_date_key);
            if (a.due_date_key) return -1;
            if (b.due_date_key) return 1;

            // Tertiary: Created At
            return b.created_at.localeCompare(a.created_at);
        });
    };

    const sortTasksForView = (taskList: Todo[]) => {
        const sorted = sortTasks(taskList);
        if (taskTypeFilter !== 'pending') return sorted;

        const getLatestUnreadTs = (task: Todo) => {
            const seenAt = localStorage.getItem(getSeenStorageKey(task.id)) || '';
            const unread = (task.comments || [])
                .filter((c: any) => c.user_id !== currentUser.id && c.created_at > seenAt)
                .map((c: any) => new Date(c.created_at).getTime());
            if (unread.length === 0) return 0;
            return Math.max(...unread);
        };

        return [...sorted].sort((a, b) => {
            const unreadA = (unreadCommentsByTask.get(a.id) || 0) > 0;
            const unreadB = (unreadCommentsByTask.get(b.id) || 0) > 0;
            if (unreadA !== unreadB) return unreadA ? -1 : 1;
            if (unreadA && unreadB) {
                return getLatestUnreadTs(b) - getLatestUnreadTs(a);
            }
            return 0;
        });
    };

    // --- Filtering Logic ---
    const filterByCurrentCriteria = (t: Todo) => {
        const isDoneForMe = t.completed_by.includes(currentUser.id);
        const isAssignedToMe = t.assigned_to.includes(currentUser.id);

        // For filtering purposes, we consider "Done" if the current user finished their part
        // OR if they are the creator and EVERYONE finished (global done)
        const isGloballyDone = t.assigned_to.length > 0 && t.assigned_to.every(uid => t.completed_by.includes(uid));

        // Done logic: 
        // - If assigned: when I complete it.
        // - If only creator (not assigned): when everyone completes it.
        const isRelevantDone = isAssignedToMe ? isDoneForMe : isGloballyDone;
        const hasUnreadComments = (unreadCommentsByTask.get(t.id) || 0) > 0;
        const today = new Date().toISOString().split('T')[0];
        const isOverdue = t.due_date_key ? t.due_date_key <= today : false;

        switch (taskTypeFilter) {
            case 'today':
                return isOverdue && !isRelevantDone;
            case 'pending':
                if (isRelevantDone && !hasUnreadComments) return false;
                break;
            case 'completed':
                if (!isRelevantDone || hasUnreadComments) return false;
                break;
            case 'all':
            default:
                break;
        }

        if (assignedToFilter === 'me' && !isAssignedToMe) return false;
        if (assignedToFilter !== 'all' && assignedToFilter !== 'me' && !t.assigned_to.includes(assignedToFilter)) return false;

        if (assignedByFilter === 'me' && t.created_by !== currentUser.id) return false;
        if (assignedByFilter !== 'all' && assignedByFilter !== 'me' && t.created_by !== assignedByFilter) return false;

        if (monthFilter !== 'all') {
            if (!t.due_date_key || !t.due_date_key.startsWith(monthFilter)) return false;
        }

        const query = titleSearch.trim().toLowerCase();
        if (query && !t.title.toLowerCase().includes(query)) return false;

        return true;
    };

    // --- Derived Lists ---
    const lists = useMemo(() => {
        // Base filter
        const base = todos.filter(filterByCurrentCriteria);

        // 1. Assigned to Me
        const assigned = sortTasksForView(base.filter(t => t.assigned_to.includes(currentUser.id)));

        // 2. Created by Me (Exclude those assigned to me to avoid duplication in view? 
        // Request says "Tareas creadas por mi". Typically if I create and assign to self, it appears in both? 
        // Let's keep it in both sections as they have different contexts, OR filter out. 
        // User didn't specify duplication handling. Let's keep distinct sets logic if possible 
        // or just show all my created ones in "Created".
        const created = sortTasksForView(base.filter(t => t.created_by === currentUser.id));

        // 3. Admin View (All tasks)
        // Only relevant if Admin
        const all = isAdmin ? sortTasksForView(base) : [];

        return { assigned, created, all };
    }, [todos, taskTypeFilter, assignedToFilter, assignedByFilter, monthFilter, titleSearch, currentUser.id, isAdmin, unreadCommentsByTask]);

    const monthOptions = useMemo(() => {
        const unique = Array.from(new Set(
            todos
                .map((t) => t.due_date_key || '')
                .filter(Boolean)
                .map((d) => d.slice(0, 7)),
        )).sort();
        return unique;
    }, [todos]);

    // Counts for badges
    // We want the counts to reflect the *current* filter state? or global state?
    // Usually section counts reflect what's inside.

    return (
        <div className="max-w-5xl mx-auto pb-20 space-y-8 animate-in fade-in duration-500">
            {/* Header & Main Action */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-[var(--color-text)] tracking-tight flex items-center gap-3">
                        <CheckSquare className="text-primary" size={28} />
                        Mis Tareas
                    </h1>
                    <p className="text-[var(--color-text)] opacity-70 font-medium">
                        Gestiona y organiza tus pendientes.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                >
                    <Plus size={20} strokeWidth={3} />
                    Nueva Tarea
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de tarea</label>
                    <select
                        value={taskTypeFilter}
                        onChange={(e) => setTaskTypeFilter(e.target.value as 'all' | 'today' | 'pending' | 'completed')}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold bg-white"
                    >
                        <option value="all">Todas</option>
                        <option value="today">Vencen hoy / vencidas</option>
                        <option value="pending">Pendientes</option>
                        <option value="completed">Completadas</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Asignada a</label>
                    <select
                        value={assignedToFilter}
                        onChange={(e) => setAssignedToFilter(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold bg-white"
                    >
                        <option value="all">Cualquiera</option>
                        <option value="me">A mí</option>
                        {USERS.map((u) => (
                            <option key={`to-${u.id}`} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Asignada por</label>
                    <select
                        value={assignedByFilter}
                        onChange={(e) => setAssignedByFilter(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold bg-white"
                    >
                        <option value="all">Cualquiera</option>
                        <option value="me">Por mí</option>
                        {USERS.map((u) => (
                            <option key={`by-${u.id}`} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mes</label>
                    <select
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold bg-white"
                    >
                        <option value="all">Todos los meses</option>
                        {monthOptions.map((m) => (
                            <option key={m} value={m}>
                                {new Date(`${m}-01T00:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar por título</label>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={titleSearch}
                            onChange={(e) => setTitleSearch(e.target.value)}
                            placeholder="Ej. pedido, factura..."
                            className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-sm font-medium"
                        />
                    </div>
                </div>
            </div>

            {/* Sections */}
            <div className="space-y-2">

                {/* 1. Assigned to Me */}
                <TaskSection
                    title="Asignadas a mí"
                    count={lists.assigned.length}
                    defaultOpen={true}
                    icon={<UserCheck size={20} className="text-blue-500" />}
                >
                    <AnimatePresence mode="popLayout">
                        {lists.assigned.length > 0 ? (
                            lists.assigned.map(task => (
                                <motion.div
                                    key={task.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <TaskCardRow
                                        todo={task}
                                        currentUser={currentUser}
                                        unreadCommentsCount={unreadCommentsByTask.get(task.id) || 0}
                                        onClick={openTaskDetail}
                                        onToggle={toggleTodo}
                                        onMarkCommentsRead={markTaskCommentsAsSeen}
                                    />
                                </motion.div>
                            ))
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="p-8 text-center bg-gray-50/50 dark:bg-white/5 rounded-xl border border-dashed border-gray-200 dark:border-white/10"
                            >
                                <p className="text-gray-400 dark:text-gray-500 text-sm italic">No tienes tareas asignadas con este filtro.</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </TaskSection>

                {/* 2. Created by Me */}
                <TaskSection
                    title="Creadas por mí"
                    count={lists.created.length}
                    defaultOpen={false}
                    icon={<Plus size={20} className="text-purple-500" />}
                >
                    <AnimatePresence mode="popLayout">
                        {lists.created.length > 0 ? (
                            lists.created.map(task => (
                                <motion.div
                                    key={task.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <TaskCardRow
                                        todo={task}
                                        currentUser={currentUser}
                                        unreadCommentsCount={unreadCommentsByTask.get(task.id) || 0}
                                        onClick={openTaskDetail}
                                        onToggle={toggleTodo}
                                        onMarkCommentsRead={markTaskCommentsAsSeen}
                                    />
                                </motion.div>
                            ))
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="p-8 text-center bg-gray-50/50 dark:bg-white/5 rounded-xl border border-dashed border-gray-200 dark:border-white/10"
                            >
                                <p className="text-gray-400 dark:text-gray-500 text-sm italic">No has creado tareas con este filtro.</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </TaskSection>

                {/* 3. Admin View (All) */}
                {
                    isAdmin && (
                        <TaskSection
                            title="Todas las tareas del equipo"
                            count={lists.all.length}
                            defaultOpen={false}
                            icon={<Shield size={20} className="text-orange-500" />}
                        >
                            <AnimatePresence mode="popLayout">
                                {lists.all.length > 0 ? (
                                    lists.all.map(task => (
                                        <motion.div
                                            key={task.id}
                                            layout
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <TaskCardRow
                                                todo={task}
                                                currentUser={currentUser}
                                                unreadCommentsCount={unreadCommentsByTask.get(task.id) || 0}
                                                onClick={openTaskDetail}
                                                onToggle={toggleTodo}
                                                onMarkCommentsRead={markTaskCommentsAsSeen}
                                            />
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center bg-gray-50/50 dark:bg-white/5 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
                                        <p className="text-gray-400 dark:text-gray-500 text-sm italic">No hay tareas en el sistema.</p>
                                    </div>
                                )}
                            </AnimatePresence>
                        </TaskSection>
                    )}
            </div>

            {/* Modals */}
            <AnimatePresence>
                {showCreateModal && (
                    <TodoModal onClose={() => setShowCreateModal(false)} />
                )}
                {selectedTask && (
                    <TaskDetailModal
                        task={selectedTask}
                        onClose={() => {
                            setSelectedTask(null);
                        }}
                    />
                )}
            </AnimatePresence>
        </div >
    );
}

export default TasksPage;
