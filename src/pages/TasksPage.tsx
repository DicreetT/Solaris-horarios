import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import TodoModal from '../components/TodoModal';
import TaskDetailModal from '../components/TaskDetailModal';
import { Todo } from '../types';
import { TaskSection } from '../components/TaskSection';
import { TaskCardRow } from '../components/TaskCardRow';
import { CheckSquare, Plus, CheckCircle2, Circle, AlertCircle, UserCheck, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
                setSelectedTask(task);
                // Clear the param after opening to avoid re-opening on manual close if needed? 
                // Or keep it. Usually clear is better to keep URL clean.
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('task');
                setSearchParams(newParams, { replace: true });
            }
        }
    }, [searchParams, todos, setSearchParams]);

    // Determines which "Top Level" filters are active
    // "today" includes overdue implicitly for urgency
    const [filterStatus, setFilterStatus] = useState<'all' | 'today' | 'pending' | 'completed'>('all');

    const isAdmin = currentUser?.isAdmin;

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

    // --- Filtering Logic ---
    const filterByTopBar = (t: Todo) => {
        const isDoneForMe = t.completed_by.includes(currentUser.id);
        const isAssignedToMe = t.assigned_to.includes(currentUser.id);
        const isCreator = t.created_by === currentUser.id;

        // For filtering purposes, we consider "Done" if the current user finished their part
        // OR if they are the creator and EVERYONE finished (global done)
        const isGloballyDone = t.assigned_to.length > 0 && t.assigned_to.every(uid => t.completed_by.includes(uid));

        // Done logic: 
        // - If assigned: when I complete it.
        // - If only creator (not assigned): when everyone completes it.
        const isRelevantDone = isAssignedToMe ? isDoneForMe : isGloballyDone;

        const today = new Date().toISOString().split('T')[0];
        const isOverdue = t.due_date_key ? t.due_date_key <= today : false;

        switch (filterStatus) {
            case 'today':
                return isOverdue && !isRelevantDone;
            case 'pending':
                return !isRelevantDone;
            case 'completed':
                return isRelevantDone;
            case 'all':
            default:
                return !isRelevantDone;
        }
    };

    // --- Derived Lists ---
    const lists = useMemo(() => {
        // Base filter
        const base = todos.filter(filterByTopBar);

        // 1. Assigned to Me
        const assigned = sortTasks(base.filter(t => t.assigned_to.includes(currentUser.id)));

        // 2. Created by Me (Exclude those assigned to me to avoid duplication in view? 
        // Request says "Tareas creadas por mi". Typically if I create and assign to self, it appears in both? 
        // Let's keep it in both sections as they have different contexts, OR filter out. 
        // User didn't specify duplication handling. Let's keep distinct sets logic if possible 
        // or just show all my created ones in "Created".
        const created = sortTasks(base.filter(t => t.created_by === currentUser.id));

        // 3. Admin View (All tasks)
        // Only relevant if Admin
        const all = isAdmin ? sortTasks(base) : [];

        return { assigned, created, all };
    }, [todos, filterStatus, currentUser.id, isAdmin]);

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

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${filterStatus === 'all' ? 'bg-gray-800 text-white border-gray-800 dark:bg-white dark:text-gray-900 dark:border-white' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/10'}`}
                >
                    Todas
                </button>
                <button
                    onClick={() => setFilterStatus('today')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${filterStatus === 'today' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/10'}`}
                >
                    <AlertCircle size={14} />
                    Vencen Hoy
                </button>
                <button
                    onClick={() => setFilterStatus('pending')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${filterStatus === 'pending' ? 'bg-white border-primary text-primary ring-2 ring-primary/10 dark:bg-primary/20 dark:border-primary/50' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/10'}`}
                >
                    <Circle size={14} />
                    Pendientes
                </button>
                <button
                    onClick={() => setFilterStatus('completed')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${filterStatus === 'completed' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/10'}`}
                >
                    <CheckCircle2 size={14} />
                    Completadas
                </button>
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
                                        onClick={setSelectedTask}
                                        onToggle={toggleTodo}
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
                                        onClick={setSelectedTask}
                                        onToggle={toggleTodo}
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
                                                onClick={setSelectedTask}
                                                onToggle={toggleTodo}
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
                        onClose={() => setSelectedTask(null)}
                    />
                )}
            </AnimatePresence>
        </div >
    );
}

export default TasksPage;
