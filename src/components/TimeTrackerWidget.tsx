import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { useNotificationsContext } from '../context/NotificationsContext';
import { formatTimeNow, toDateKey } from '../utils/dateUtils';
import { Clock, Play, Square, Edit2, Trash2, Timer, Info } from 'lucide-react';

/**
 * Shared time tracker widget for clocking in/out
 * Modern, sleek, and compact design with inline editing
 */
export default function TimeTrackerWidget({ date = new Date(), showEntries = false }) {
    const { currentUser } = useAuth();
    const { timeData, createTimeEntry, updateTimeEntry, deleteTimeEntry } = useTimeData();
    const { addNotification } = useNotificationsContext();

    const { absenceRequests } = useAbsences(currentUser);

    const targetDate = date;
    const dateKey = toDateKey(targetDate);

    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const [isEditing, setIsEditing] = useState(false);

    // Get today's time entries for current user
    const userEntries = timeData[dateKey]?.[currentUser?.id] || [];

    // Check for approved absence for today
    const activeAbsence = absenceRequests.find(
        (r: any) => r.created_by === currentUser?.id &&
            r.date_key === dateKey &&
            r.status === 'approved'
    );

    // Find the active entry (has entry but no exit)
    const activeEntry = userEntries.find(e => e.entry && !e.exit);
    const isClocked = !!activeEntry;

    // Calculate elapsed time if clocked in
    useEffect(() => {
        if (!isClocked || !activeEntry?.entry) {
            setElapsedTime('00:00:00');
            return;
        }

        const calculateElapsed = () => {
            const entryTime = new Date(`1970-01-01T${activeEntry.entry}`);
            const now = new Date();
            const currentTime = new Date(`1970-01-01T${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);

            const diff = currentTime.getTime() - entryTime.getTime();
            if (diff < 0) return; // Prevent negative time if system clock drifts slightly

            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            setElapsedTime(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        };

        calculateElapsed();
        const interval = setInterval(calculateElapsed, 1000);
        return () => clearInterval(interval);
    }, [isClocked, activeEntry?.entry]);

    async function handleMarkEntry() {
        try {
            await createTimeEntry({
                date: targetDate,
                userId: currentUser.id,
                entry: formatTimeNow(),
                exit: null,
                status: 'present',
                note: '',
            });
            addNotification({ message: `Has fichado tu entrada (${formatTimeNow()}).` });
        } catch (e) {
            console.error('Error creating entry:', e);
        }
    }

    async function handleMarkExit() {
        if (!activeEntry) return;
        try {
            await updateTimeEntry({
                id: activeEntry.id,
                updates: { exit: formatTimeNow() },
            });
            addNotification({ message: `Has fichado tu salida (${formatTimeNow()}). ¡Hasta luego! 🌙` });
        } catch (e) {
            console.error('Error updating entry:', e);
        }
    }

    async function handleDeleteEntry(entryId: number) {
        if (!window.confirm('¿Estás seguro de que quieres eliminar este fichaje?')) return;
        try {
            await deleteTimeEntry(entryId);
            addNotification({ message: 'Fichaje eliminado correctamente.' });
        } catch (e) {
            console.error('Error deleting entry:', e);
            addNotification({ message: 'Error al eliminar el fichaje.', type: 'error' });
        }
    }

    async function handleUpdateTime(entryId: number, field: string, value: string) {
        try {
            await updateTimeEntry({
                id: entryId,
                updates: { [field]: value },
            });
        } catch (e) {
            console.error('Error updating time:', e);
        }
    }

    async function handleUpdateNote(entryId: number, note: string) {
        try {
            await updateTimeEntry({
                id: entryId,
                updates: { note },
            });
        } catch (e) {
            console.error('Error updating note:', e);
        }
    }

    return (
        <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-visible">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            Registro de Jornada
                            <div className="relative group">
                                <Info
                                    size={18}
                                    className="text-gray-400 hover:text-primary cursor-help transition-colors"
                                />
                                <div className="absolute left-0 top-full mt-2 w-80 bg-gray-900 text-white text-xs rounded-xl p-4 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[9999] pointer-events-none">
                                    <div className="space-y-2">
                                        <p className="font-bold text-sm mb-2">¿Cómo funciona el registro de tiempo?</p>
                                        <p>Para rastrear el tiempo puedes iniciar el seguimiento haciendo clic en <span className="font-bold text-primary-light">este botón aquí</span>. A partir de ese momento, el seguimiento del tiempo está en marcha.</p>
                                        <p>Si quieres hacer una pausa (para almorzar, por ejemplo) puedes detenerlo y volverlo a iniciar más tarde.</p>
                                        <p>Durante el día también es posible modificar o eliminar entradas de tiempo y agregar notas en la página <span className="font-bold text-primary-light">Registra Horario</span>.</p>
                                    </div>
                                    <div className="absolute -top-2 left-4 w-4 h-4 bg-gray-900 transform rotate-45"></div>
                                </div>
                            </div>
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            {activeAbsence
                                ? (activeAbsence.type === 'vacation' ? 'Disfrutando de vacaciones' : 'Ausencia justificada')
                                : (isClocked ? 'Jornada en curso' : 'Jornada pausada')
                            }
                        </p>
                    </div>
                </div>

                {activeAbsence ? (
                    <div className={`flex flex-col items-center justify-center py-8 rounded-2xl border-2 border-dashed ${activeAbsence.type === 'vacation'
                        ? 'bg-purple-50 border-purple-200 text-purple-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                        <div className="text-3xl mb-2">
                            {activeAbsence.type === 'vacation' ? '🌴' : '🤒'}
                        </div>
                        <h3 className="text-xl font-bold mb-1">
                            {activeAbsence.type === 'vacation' ? 'Vacaciones' : 'Ausencia'}
                        </h3>
                        <p className="text-sm font-medium opacity-80 max-w-md text-center px-4">
                            {activeAbsence.reason || 'No se requiere fichaje para este día.'}
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                        {/* Clock Display */}
                        <div className="flex items-center gap-4">
                            <div className={`text-5xl font-black tracking-tighter font-mono ${isClocked ? 'text-gray-900' : 'text-gray-300'
                                }`}>
                                {elapsedTime}
                            </div>
                            {isClocked && (
                                <div className="flex flex-col">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mb-1" />
                                    <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Activo</span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={isClocked ? handleMarkExit : handleMarkEntry}
                            className={`
                                group relative overflow-hidden rounded-2xl px-8 py-4 font-bold text-base transition-all duration-300 shadow-lg active:scale-95 flex items-center gap-3 w-full sm:w-auto justify-center
                                ${isClocked
                                    ? 'bg-white border-2 border-red-100 text-red-600 hover:border-red-200 hover:bg-red-50 shadow-red-100'
                                    : 'bg-primary text-white hover:bg-primary-dark shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5'}
                            `}
                        >
                            {isClocked ? (
                                <>
                                    <Square size={18} fill="currentColor" />
                                    <span>Finalizar Jornada</span>
                                </>
                            ) : (
                                <>
                                    <Play size={18} fill="currentColor" />
                                    <span>Iniciar Jornada</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Entries List */}
            {showEntries && userEntries.length > 0 && (
                <div className="bg-white">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Clock size={12} />
                            Historial de hoy
                        </span>
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className={`p-2 rounded-lg transition-colors ${isEditing
                                ? 'bg-primary/10 text-primary'
                                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                                }`}
                            title="Editar fichajes"
                        >
                            <Edit2 size={14} />
                        </button>
                    </div>

                    <div className="divide-y divide-gray-100">
                        {userEntries.map((entry, index) => (
                            <div key={entry.id} className="px-6 py-4 hover:bg-gray-50 transition-colors group">
                                <div className="flex items-start gap-4">
                                    <div className="mt-2 w-2 h-2 rounded-full bg-gray-200 group-hover:bg-primary transition-colors" />

                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {/* Times */}
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-400 font-bold mb-1">ENTRADA</span>
                                                {isEditing ? (
                                                    <input
                                                        type="time"
                                                        className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 w-24 transition-all"
                                                        value={entry.entry || ''}
                                                        onChange={(e) => handleUpdateTime(entry.id, 'entry', e.target.value)}
                                                    />
                                                ) : (
                                                    <span className="font-mono font-bold text-gray-700 text-lg">{entry.entry || '--:--'}</span>
                                                )}
                                            </div>
                                            <div className="h-8 w-px bg-gray-200 rotate-12 mx-2" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-400 font-bold mb-1">SALIDA</span>
                                                {isEditing ? (
                                                    <input
                                                        type="time"
                                                        className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 w-24 transition-all"
                                                        value={entry.exit || ''}
                                                        onChange={(e) => handleUpdateTime(entry.id, 'exit', e.target.value)}
                                                    />
                                                ) : (
                                                    <span className={`font-mono font-bold text-lg ${!entry.exit ? 'text-green-600 animate-pulse' : 'text-gray-700'}`}>
                                                        {entry.exit || 'Activo'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Note */}
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1">
                                                {isEditing || entry.note ? (
                                                    <input
                                                        type="text"
                                                        placeholder="Añadir nota..."
                                                        className="w-full bg-transparent text-sm text-gray-600 placeholder-gray-400 focus:outline-none border-b border-transparent focus:border-gray-200 py-1 transition-colors"
                                                        value={entry.note || ''}
                                                        onChange={(e) => handleUpdateNote(entry.id, e.target.value)}
                                                    />
                                                ) : (
                                                    <div className="h-6" />
                                                )}
                                            </div>

                                            {/* Delete Button */}
                                            {isEditing && (
                                                <button
                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    title="Eliminar fichaje"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}


