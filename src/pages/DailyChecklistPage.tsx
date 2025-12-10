import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';
import { toDateKey, formatDatePretty } from '../utils/dateUtils';
import { Plus, Trash2, Save, CheckSquare, Settings, Calendar, User as UserIcon, Loader } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

export default function DailyChecklistPage() {
    const { currentUser } = useAuth();
    const [viewMode, setViewMode] = useState<'daily' | 'templates' | 'history'>('daily');
    const [selectedUserForTemplate, setSelectedUserForTemplate] = useState(USERS[0]?.id || '');
    const [templateTasks, setTemplateTasks] = useState<{ id: string; text: string }[]>([]);
    const [dailyTasks, setDailyTasks] = useState<{ id: string; text: string; completed: boolean }[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    // For Admin History Filter
    const [historyFilterDate, setHistoryFilterDate] = useState(toDateKey(new Date()));
    const [historyFilterUser, setHistoryFilterUser] = useState('all');

    const isAdmin = currentUser?.isAdmin;
    const todayKey = toDateKey(new Date());

    useEffect(() => {
        if (viewMode === 'templates' && isAdmin) {
            fetchTemplate(selectedUserForTemplate);
        } else if (viewMode === 'daily') {
            fetchDailyChecklist();
        } else if (viewMode === 'history') {
            fetchHistory();
        }
    }, [viewMode, selectedUserForTemplate, historyFilterDate, historyFilterUser, currentUser]);

    // --- Template Management (Admin) ---
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
        setSaving(true);
        const { error } = await supabase
            .from('checklist_templates')
            .upsert({
                user_id: selectedUserForTemplate,
                tasks: templateTasks,
                updated_at: new Date().toISOString()
            });

        if (error) alert('Error guardando plantilla');
        else alert('Plantilla guardada correctamente');
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

        // 1. Try to get existing daily record
        const { data: dailyData } = await supabase
            .from('daily_checklists')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('date_key', todayKey)
            .single();

        if (dailyData) {
            setDailyTasks(dailyData.history || []);
        } else {
            // 2. If not exists, load from template
            const { data: templateData } = await supabase
                .from('checklist_templates')
                .select('tasks')
                .eq('user_id', currentUser.id)
                .single();

            if (templateData?.tasks) {
                setDailyTasks(templateData.tasks.map((t: any) => ({ ...t, completed: false })));
            } else {
                setDailyTasks([]);
            }
        }
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
            }, { onConflict: 'user_id, date_key' });

        if (error) alert('Error al guardar el día');
        else alert('¡Progreso diario guardado!');
        setSaving(false);
    }

    function toggleTask(taskId: string) {
        setDailyTasks(dailyTasks.map(t =>
            t.id === taskId ? { ...t, completed: !t.completed } : t
        ));
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
            if (historyFilterDate) {
                // Optional: filter by date if selected, currently showing all or matching date
                // query = query.eq('date_key', historyFilterDate); 
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
                    <h1 className="text-3xl font-black text-gray-900">Check-list Diario ✅</h1>
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
                {isAdmin && (
                    <button
                        onClick={() => setViewMode('templates')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'templates' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        <Settings size={16} />
                        Gestionar Plantillas (Admin)
                    </button>
                )}
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

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader className="animate-spin text-gray-400" /></div>
                        ) : dailyTasks.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                <p className="text-gray-400 font-medium">No tienes tareas asignadas para hoy.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {dailyTasks.map(task => (
                                    <div
                                        key={task.id}
                                        onClick={() => toggleTask(task.id)}
                                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${task.completed
                                                ? 'bg-green-50 border-green-200 opacity-60'
                                                : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm'
                                            }`}
                                    >
                                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'
                                            }`}>
                                            {task.completed && <CheckSquare size={14} />}
                                        </div>
                                        <span className={`text-lg font-medium ${task.completed ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                                            {task.text}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TEMPLATES VIEW (ADMIN) --- */}
                {viewMode === 'templates' && isAdmin && (
                    <div className="p-8">
                        <div className="flex flex-col sm:flex-row gap-6 mb-8">
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

                            <div className="flex-1 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-900">Tareas asignadas</h3>
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
                                        <th className="px-6 py-4">Detalles</th>
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
                                            const completedCount = tasks.filter((t: any) => t.completed).length;
                                            const totalCount = tasks.length;
                                            const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                                            return (
                                                <tr key={record.id} className="hover:bg-blue-50/30 transition-colors">
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
                                                                    className={`h-full rounded-full ${percentage === 100 ? 'bg-green-500' : 'bg-primary'}`}
                                                                    style={{ width: `${percentage}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs font-bold">{percentage}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <details className="group cursor-pointer">
                                                            <summary className="list-none text-xs font-bold text-gray-400 hover:text-primary transition-colors flex items-center gap-1">
                                                                Ver tareas
                                                            </summary>
                                                            <div className="absolute mt-2 z-10 w-64 p-4 bg-white rounded-xl shadow-xl border border-gray-100 hidden group-open:block">
                                                                {tasks.map((t: any) => (
                                                                    <div key={t.id} className="flex items-center gap-2 mb-1">
                                                                        {t.completed ? <CheckSquare size={12} className="text-green-500" /> : <div className="w-3 h-3 border border-gray-300 rounded-sm" />}
                                                                        <span className={`text-xs ${t.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{t.text}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
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
