import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';
import { toDateKey, formatDatePretty } from '../utils/dateUtils';
import { Plus, Trash2, Save, CheckSquare, Settings, Calendar, User as UserIcon, Loader } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

type ChecklistTask = {
    id: string;
    text: string;
    completed: boolean;
    source?: 'template' | 'personal';
    created_at?: string;
};

export default function DailyChecklistPage() {
    const { currentUser } = useAuth();
    const [viewMode, setViewMode] = useState<'daily' | 'templates' | 'history'>('daily');
    const [selectedUserForTemplate, setSelectedUserForTemplate] = useState(USERS[0]?.id || '');
    const [templateTasks, setTemplateTasks] = useState<{ id: string; text: string }[]>([]);
    const [dailyTasks, setDailyTasks] = useState<ChecklistTask[]>([]);
    const [dailyTaskDraft, setDailyTaskDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    // For Admin History Filter
    const [historyFilterDate, setHistoryFilterDate] = useState(toDateKey(new Date()));
    const [historyFilterUser, setHistoryFilterUser] = useState('all');

    const isAdmin = currentUser?.isAdmin;
    const todayKey = toDateKey(new Date());

    useEffect(() => {
        if (viewMode === 'templates') {
            const targetUser = isAdmin ? selectedUserForTemplate : currentUser?.id;
            if (targetUser) fetchTemplate(targetUser);
        } else if (viewMode === 'daily') {
            fetchDailyChecklist();
        } else if (viewMode === 'history') {
            fetchHistory();
        }
    }, [viewMode, selectedUserForTemplate, historyFilterDate, historyFilterUser, currentUser]);

    // --- Template Management ---
    async function fetchTemplate(userId: string) {
        setLoading(true);
        const { data, error } = await supabase
            .from('checklist_templates')
            .select('tasks')
            .eq('user_id', userId)
            .single();

        if (data) {
            setTemplateTasks(data.tasks || []);
        } else {
            setTemplateTasks([]);
        }
        setLoading(false);
    }

    async function saveTemplate() {
        if (!currentUser) return;
        setSaving(true);

        const targetUserId = isAdmin ? selectedUserForTemplate : currentUser.id;

        const { error } = await supabase
            .from('checklist_templates')
            .upsert({
                user_id: targetUserId,
                tasks: templateTasks,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error(error);
            alert('Error guardando plantilla');
        } else {
            alert('Lista guardada correctamente');
            // If editing own list, refresh daily view logic if needed? 
            // Actually daily view fetches on mode switch.
        }
        setSaving(false);
    }

    function addTemplateTask() {
        const text = prompt("Nombre de la nueva tarea:");
        if (text) {
            setTemplateTasks([...templateTasks, { id: crypto.randomUUID(), text }]);
        }
    }

    function removeTemplateTask(taskId: string) {
        if (confirm('¿Eliminar tarea?')) {
            setTemplateTasks(templateTasks.filter(t => t.id !== taskId));
        }
    }

    // --- Daily Checklist (User) ---
    async function fetchDailyChecklist() {
        if (!currentUser) return;
        setLoading(true);

        // 1. Fetch BOTH template and daily data needed for merging
        const [{ data: dailyData }, { data: templateData }] = await Promise.all([
            supabase
                .from('daily_checklists')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('date_key', todayKey)
                .single(),
            supabase
                .from('checklist_templates')
                .select('tasks')
                .eq('user_id', currentUser.id)
                .single()
        ]);

        let tasksToShow: ChecklistTask[] = [];

        const savedHistory = Array.isArray(dailyData?.history) ? dailyData.history : [];
        const completionMap = new Map<string, boolean>();
        savedHistory.forEach((t: any) => {
            completionMap.set(t.id, !!t.completed);
        });

        if (templateData?.tasks) {
            // Always respect the template structure, while preserving today's progress.
            tasksToShow = templateData.tasks.map((t: any) => ({
                ...t,
                source: 'template',
                completed: completionMap.has(t.id) ? completionMap.get(t.id) || false : false
            }));
        }

        const personalTasks = savedHistory
            .filter((t: any) => t?.source === 'personal' || String(t?.id || '').startsWith('personal-'))
            .map((t: any) => ({
                id: t.id || crypto.randomUUID(),
                text: String(t.text || '').trim(),
                completed: !!t.completed,
                source: 'personal' as const,
                created_at: t.created_at
            }))
            .filter((t: ChecklistTask) => t.text.length > 0);

        tasksToShow = [...tasksToShow, ...personalTasks];

        setDailyTasks(tasksToShow);
        setLoading(false);
    }

    async function saveDailyProgress() {
        if (!currentUser) return;
        setSaving(true);

        const { error } = await supabase
            .from('daily_checklists')
            .upsert({
                user_id: currentUser.id,
                date_key: todayKey,
                history: dailyTasks,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,date_key' });

        if (error) alert('Error al guardar el día');
        else alert('¡Progreso diario guardado!');
        setSaving(false);
    }

    function toggleTask(taskId: string) {
        setDailyTasks(dailyTasks.map(t =>
            t.id === taskId ? { ...t, completed: !t.completed } : t
        ));
    }

    function addDailyTask() {
        const text = dailyTaskDraft.trim();
        if (!text) return;
        setDailyTasks([
            ...dailyTasks,
            {
                id: `personal-${crypto.randomUUID()}`,
                text,
                completed: false,
                source: 'personal',
                created_at: new Date().toISOString()
            }
        ]);
        setDailyTaskDraft('');
    }

    function removeDailyTask(taskId: string) {
        const task = dailyTasks.find(t => t.id === taskId);
        if (!task || task.source !== 'personal') return;
        if (confirm('¿Quitar esta tarea personal del día?')) {
            setDailyTasks(dailyTasks.filter(t => t.id !== taskId));
        }
    }

    // --- History (View) ---
    async function fetchHistory() {
        if (!currentUser) return;
        setLoading(true);

        let query = supabase
            .from('daily_checklists')
            .select('*')
            .order('date_key', { ascending: false });

        if (!isAdmin) {
            query = query.eq('user_id', currentUser.id);
        } else {
            if (historyFilterUser !== 'all') {
                query = query.eq('user_id', historyFilterUser);
            }
        }

        const { data } = await query;
        setHistory(data || []);
        setLoading(false);
    }


    return (
        <div className="max-w-5xl mx-auto pb-20">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-[var(--color-text)]">Check-list Diario ✅</h1>
                    <p className="text-gray-500">Organiza y registra tus tareas diarias.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-200 w-fit mb-8">
                <button
                    onClick={() => setViewMode('daily')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'daily' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                >
                    <CheckSquare size={16} />
                    Mi Día
                </button>
                <button
                    onClick={() => setViewMode('history')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'history' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                >
                    <Calendar size={16} />
                    Historial
                </button>
                <button
                    onClick={() => setViewMode('templates')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'templates' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                >
                    <Settings size={16} />
                    {isAdmin ? 'Gestionar Plantillas (Admin)' : 'Editar mi lista'}
                </button>
            </div>

            {/* Content Areas */}
            <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden min-h-[400px]">

                {/* --- DAILY VIEW --- */}
                {viewMode === 'daily' && (
                    <div className="p-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                                    {formatDatePretty(new Date())}
                                </span>
                            </h2>
                            <button
                                onClick={saveDailyProgress}
                                disabled={saving}
                                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-green-200 active:scale-95"
                            >
                                <Save size={18} />
                                {saving ? 'Guardando...' : 'Guardar Día'}
                            </button>
                        </div>

                        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                            <p className="text-xs font-black uppercase tracking-widest text-blue-700">Añadir algo de hoy</p>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input
                                    value={dailyTaskDraft}
                                    onChange={(event) => setDailyTaskDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            addDailyTask();
                                        }
                                    }}
                                    placeholder="Ej: Revisar stock físico, llamar proveedor, subir albarán..."
                                    className="min-h-11 flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-950"
                                />
                                <button
                                    type="button"
                                    onClick={addDailyTask}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800"
                                >
                                    <Plus size={16} />
                                    Añadir
                                </button>
                            </div>
                            <p className="mt-2 text-xs font-semibold text-blue-700">
                                Estas tareas se guardan solo en tu checklist de hoy; no cambian tu plantilla recurrente.
                            </p>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader className="animate-spin text-gray-400" /></div>
                        ) : dailyTasks.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                <p className="text-gray-400 font-medium">No tienes tareas asignadas para hoy.</p>
                                <button
                                    onClick={() => fetchDailyChecklist()}
                                    className="mt-4 text-primary font-bold hover:underline"
                                >
                                    Recargar tareas
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {dailyTasks.map(task => (
                                    <div
                                        key={task.id}
                                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${task.completed
                                            ? 'bg-gray-50 border-gray-200'
                                            : 'bg-green-50 border-green-200 hover:border-green-300 shadow-sm'
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleTask(task.id)}
                                            className={`w-6 h-6 rounded-lg border-2 flex shrink-0 items-center justify-center transition-colors ${task.completed ? 'bg-gray-400 border-gray-400 text-white' : 'border-green-500 bg-white text-transparent'
                                                }`}
                                            aria-label={task.completed ? 'Marcar como pendiente' : 'Marcar como completada'}
                                        >
                                            <CheckSquare size={14} fill="currentColor" className={task.completed ? 'text-white' : 'text-green-500 opacity-0'} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleTask(task.id)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <span className={`text-lg font-medium transition-colors ${task.completed ? 'text-gray-400 line-through' : 'text-green-900'}`}>
                                                {task.text}
                                            </span>
                                            {task.source === 'personal' && (
                                                <span className="ml-2 inline-flex rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700">
                                                    Personal
                                                </span>
                                            )}
                                        </button>
                                        {task.source === 'personal' && (
                                            <button
                                                type="button"
                                                onClick={() => removeDailyTask(task.id)}
                                                className="rounded-lg p-2 text-gray-300 transition hover:bg-red-50 hover:text-red-600"
                                                title="Quitar tarea personal"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TEMPLATES VIEW --- */}
                {viewMode === 'templates' && (
                    <div className="p-8">
                        <div className="flex flex-col sm:flex-row gap-6 mb-8">
                            {isAdmin && (
                                <div className="w-full sm:w-1/3">
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Seleccionar Usuario</label>
                                    <div className="space-y-2">
                                        {USERS.map(user => (
                                            <button
                                                key={user.id}
                                                onClick={() => setSelectedUserForTemplate(user.id)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selectedUserForTemplate === user.id
                                                    ? 'border-primary bg-primary/5 shadow-md'
                                                    : 'border-transparent hover:bg-gray-50'
                                                    }`}
                                            >
                                                <UserAvatar name={user.name} size="sm" />
                                                <span className="font-bold text-gray-700">{user.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-900">
                                        {isAdmin
                                            ? `Tareas asignadas a ${USERS.find(u => u.id === selectedUserForTemplate)?.name}`
                                            : 'Mis tareas diarias recurrentes'}
                                    </h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={addTemplateTask}
                                            className="p-2 bg-white text-blue-600 rounded-lg shadow-sm hover:bg-blue-50 border border-gray-200 transition-colors"
                                            title="Añadir tarea"
                                        >
                                            <Plus size={18} />
                                        </button>
                                        <button
                                            onClick={saveTemplate}
                                            className="px-4 py-2 bg-gray-900 text-white rounded-lg shadow-md hover:bg-black transition-colors font-bold text-sm"
                                        >
                                            {saving ? '...' : 'Guardar Cambios'}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {templateTasks.length === 0 ? (
                                        <p className="text-sm text-gray-400 italic text-center py-4">Este usuario no tiene tareas definidas.</p>
                                    ) : (
                                        templateTasks.map((task, idx) => (
                                            <div key={task.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                                <span className="text-gray-400 font-mono text-xs w-6">#{idx + 1}</span>
                                                <input
                                                    type="text"
                                                    value={task.text}
                                                    onChange={(e) => {
                                                        const newText = e.target.value;
                                                        setTemplateTasks(templateTasks.map(t => t.id === task.id ? { ...t, text: newText } : t));
                                                    }}
                                                    className="flex-1 text-sm font-medium text-gray-700 bg-transparent focus:outline-none border-b border-transparent focus:border-blue-300"
                                                />
                                                <button
                                                    onClick={() => removeTemplateTask(task.id)}
                                                    className="text-gray-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- HISTORY VIEW --- */}
                {viewMode === 'history' && (
                    <div className="p-0">
                        {isAdmin && (
                            <div className="p-4 bg-gray-50 border-b border-gray-200 flex gap-4 overflow-x-auto">
                                <select
                                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium"
                                    value={historyFilterUser}
                                    onChange={(e) => setHistoryFilterUser(e.target.value)}
                                >
                                    <option value="all">Todos los usuarios</option>
                                    {USERS.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-gray-50 text-gray-900 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Fecha</th>
                                        <th className="px-6 py-4">Usuario</th>
                                        <th className="px-6 py-4">Progreso</th>
                                        <th className="px-6 py-4">Tareas Completadas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr><td colSpan={4} className="p-8 text-center"><Loader className="animate-spin inline" /></td></tr>
                                    ) : history.length === 0 ? (
                                        <tr><td colSpan={4} className="p-8 text-center text-gray-400 italic">No hay registros guardados.</td></tr>
                                    ) : (
                                        history.map(record => {
                                            const user = USERS.find(u => u.id === record.user_id);
                                            const tasks = record.history || [];
                                            const completedTasks = tasks.filter((t: any) => t.completed);
                                            const pendingTasks = tasks.filter((t: any) => !t.completed);
                                            const totalCount = tasks.length;
                                            const completedCount = completedTasks.length;
                                            const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                                            const isIncomplete = totalCount > 0 && completedCount < totalCount;

                                            return (
                                                <tr key={record.id} className={`transition-colors ${isIncomplete ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-blue-50/30'}`}>
                                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                                        {formatDatePretty(new Date(record.date_key))}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <UserAvatar name={user?.name} size="xs" />
                                                            <span className="font-bold">{user?.name || 'Usuario desconocido'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${percentage === 100 ? 'bg-green-500' : 'bg-red-500'}`}
                                                                    style={{ width: `${percentage}%` }}
                                                                />
                                                            </div>
                                                            <span className={`text-xs font-bold ${isIncomplete ? 'text-red-700' : 'text-gray-700'}`}>
                                                                {percentage}%
                                                            </span>
                                                            {isIncomplete && (
                                                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                                                                    {pendingTasks.length} pendiente(s)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="space-y-1">
                                                            {tasks.length === 0 ? <span className="text-xs text-gray-400">Sin tareas</span> :
                                                                tasks.map((t: any) => (
                                                                    <div key={t.id} className="flex items-center gap-2">
                                                                        <div
                                                                            className={`w-2 h-2 rounded-full ${t.completed ? 'bg-green-500' : 'bg-red-500'}`}
                                                                        />
                                                                        <span className={`text-xs ${t.completed ? 'text-gray-700 font-medium' : 'text-red-700 font-black'}`}>
                                                                            {t.text}
                                                                            {t.source === 'personal' ? ' · personal' : ''}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
