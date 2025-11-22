import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useNotifications } from '../hooks/useNotifications';
import { formatTimeNow, toDateKey } from '../utils/dateUtils';
import { Clock, Play, Square, Edit2, Trash2 } from 'lucide-react';

/**
 * Shared time tracker widget for clocking in/out
 * Modern, sleek, and compact design with inline editing
 */
function TimeTrackerWidget({ date, showEntries = true }) {
    const { currentUser } = useAuth();
    const { timeData, createTimeEntry, updateTimeEntry, deleteTimeEntry } = useTimeData();
    const { addNotification } = useNotifications();

    const targetDate = date || new Date();
    const dateKey = toDateKey(targetDate);

    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const [isEditing, setIsEditing] = useState(false);

    // Get today's time entries for current user
    const userEntries = timeData[dateKey]?.[currentUser?.id] || [];

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

            const diff = currentTime - entryTime;
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

    async function handleDeleteEntry(entryId) {
        if (!window.confirm('¿Estás seguro de que quieres eliminar este fichaje?')) return;
        try {
            await deleteTimeEntry(entryId);
            addNotification({ message: 'Fichaje eliminado correctamente.' });
        } catch (e) {
            console.error('Error deleting entry:', e);
            addNotification({ message: 'Error al eliminar el fichaje.', type: 'error' });
        }
    }

    async function handleUpdateTime(entryId, field, value) {
        try {
            await updateTimeEntry({
                id: entryId,
                updates: { [field]: value },
            });
        } catch (e) {
            console.error('Error updating time:', e);
        }
    }

    async function handleUpdateNote(entryId, note) {
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
        <div className="bg-card rounded-[20px] border-2 border-border shadow-[4px_4px_0_#000000] overflow-hidden">
            {/* Header & Main Action */}
            <div className="p-5 flex items-center justify-between border-b-2 border-border">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all duration-300 ${isClocked ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                        <Clock size={20} className={isClocked ? 'animate-pulse' : ''} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 leading-tight">Registro Horario</h3>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                            {isClocked ? 'Jornada en curso' : 'Jornada pausada'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {isClocked && (
                        <div className="text-right hidden sm:block">
                            <div className="text-2xl font-mono font-bold text-gray-900 tracking-tight leading-none">
                                {elapsedTime}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-green-600 mt-1">
                                Tiempo transcurrido
                            </div>
                        </div>
                    )}

                    <button
                        onClick={isClocked ? handleMarkExit : handleMarkEntry}
                        className={`
                            relative overflow-hidden group rounded-xl px-6 py-2.5 font-bold text-sm transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 flex items-center gap-2
                            ${isClocked
                                ? 'bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200'
                                : 'bg-primary text-white hover:bg-primary-dark border-2 border-transparent'}
                        `}
                    >
                        {isClocked ? (
                            <>
                                <Square size={16} fill="currentColor" />
                                <span>Finalizar</span>
                            </>
                        ) : (
                            <>
                                <Play size={16} fill="currentColor" />
                                <span>Iniciar</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Entries List */}
            {showEntries && userEntries.length > 0 && (
                <div>
                    <div className="px-5 py-3 border-b-2 border-border flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fichajes de hoy</span>
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className={`p-1.5 rounded-lg transition-colors ${isEditing ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                            title="Editar fichajes"
                        >
                            <Edit2 size={14} />
                        </button>
                    </div>

                    <div className="divide-y-2 divide-border">
                        {userEntries.map((entry, index) => (
                            <div key={entry.id} className="px-5 py-3 hover:bg-primary/5 transition-colors group">
                                <div className="flex items-start gap-4">
                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-primary transition-colors" />

                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* Times */}
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-400 font-medium mb-0.5">ENTRADA</span>
                                                {isEditing ? (
                                                    <input
                                                        type="time"
                                                        className="bg-white border-2 border-border rounded-lg px-1.5 py-0.5 text-xs font-medium focus:border-primary focus:outline-none w-20"
                                                        value={entry.entry || ''}
                                                        onChange={(e) => handleUpdateTime(entry.id, 'entry', e.target.value)}
                                                    />
                                                ) : (
                                                    <span className="font-mono font-medium text-gray-700">{entry.entry || '--:--'}</span>
                                                )}
                                            </div>
                                            <span className="text-gray-300 mt-3">→</span>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-400 font-medium mb-0.5">SALIDA</span>
                                                {isEditing ? (
                                                    <input
                                                        type="time"
                                                        className="bg-white border-2 border-border rounded-lg px-1.5 py-0.5 text-xs font-medium focus:border-primary focus:outline-none w-20"
                                                        value={entry.exit || ''}
                                                        onChange={(e) => handleUpdateTime(entry.id, 'exit', e.target.value)}
                                                    />
                                                ) : (
                                                    <span className={`font-mono font-medium ${!entry.exit ? 'text-green-600 animate-pulse' : 'text-gray-700'}`}>
                                                        {entry.exit || 'Activo'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Note */}
                                        <div className="flex-1 flex items-center gap-2">
                                            <div className="flex-1">
                                                {isEditing || entry.note ? (
                                                    <input
                                                        type="text"
                                                        placeholder="Añadir nota..."
                                                        className="w-full bg-transparent text-xs text-gray-600 placeholder-gray-400 focus:outline-none border-b border-transparent focus:border-gray-200 py-1 transition-colors"
                                                        value={entry.note || ''}
                                                        onChange={(e) => handleUpdateNote(entry.id, e.target.value)}
                                                    />
                                                ) : (
                                                    <div className="h-6" /> // Spacer
                                                )}
                                            </div>

                                            {/* Delete Button */}
                                            {isEditing && (
                                                <button
                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar fichaje"
                                                >
                                                    <Trash2 size={14} />
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

export default TimeTrackerWidget;
