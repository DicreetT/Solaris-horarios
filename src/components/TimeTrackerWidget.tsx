import React, { useRef, useState, useEffect } from 'react';
import { ESTEBAN_ID } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useTimeData } from '../hooks/useTimeData';
import { useAbsences } from '../hooks/useAbsences';
import { useDailyStatus } from '../hooks/useDailyStatus';
import { useNotificationsContext } from '../context/NotificationsContext';
import { formatTimeNow, toDateKey, isWeekend } from '../utils/dateUtils';
import { Clock, Play, Square, Edit2, Trash2, Timer, Info, Users, CheckSquare, XCircle, Coffee } from 'lucide-react';

const ITZI_ID = 'cb5d2e6e-9046-4b22-b509-469076999d78';
const ANABELLA_ID = '6bafcb97-6a1b-4224-adbb-1340b86ffeb9';
const FER_ID = '4ca49a9d-7ee5-4b54-8e93-bc4833de549a';

type BreakPolicy = {
    startAfterMinutes: number;
    breakMinutes: number;
    label: string;
};

const BREAK_POLICIES: Record<string, BreakPolicy> = {
    [ESTEBAN_ID]: {
        startAfterMinutes: 240, // 4h after entry
        breakMinutes: 90,
        label: 'Comida',
    },
    [ITZI_ID]: {
        startAfterMinutes: 240, // 4h after entry
        breakMinutes: 90,
        label: 'Comida',
    },
    [ANABELLA_ID]: {
        startAfterMinutes: 150, // 2h30m after entry
        breakMinutes: 10,
        label: 'Pausa cafe',
    },
    [FER_ID]: {
        startAfterMinutes: 150, // 2h30m after entry
        breakMinutes: 10,
        label: 'Pausa cafe',
    },
};

const minutesSinceTime = (entry: string | null | undefined): number => {
    if (!entry) return 0;
    const [hours, minutes] = entry.split(':').map(Number);
    const now = new Date();
    const entryDate = new Date();
    entryDate.setHours(hours, minutes, 0, 0);
    let diffMinutes = Math.floor((now.getTime() - entryDate.getTime()) / 60000);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    return diffMinutes;
};

/**
 * Shared time tracker widget for clocking in/out
 * Modern, sleek, and compact design with inline editing
 */
export default function TimeTrackerWidget({ date = new Date(), showEntries = false }) {
    const { currentUser } = useAuth();
    const { timeData, createTimeEntry, updateTimeEntry, deleteTimeEntry } = useTimeData();
    const { addNotification } = useNotificationsContext();

    const { absenceRequests } = useAbsences(currentUser);
    const { dailyStatuses, setDailyStatus } = useDailyStatus(currentUser);

    const targetDate = date;
    const dateKey = toDateKey(targetDate);
    const breakPolicy = currentUser ? BREAK_POLICIES[currentUser.id] : undefined;

    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const [isEditing, setIsEditing] = useState(false);
    const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
    const [reminderType, setReminderType] = useState<'start_break' | 'resume_break' | null>(null);
    const announcedReminderRef = useRef<string | null>(null);

    // Daily Status Logic for Esteban
    const currentStatus = dailyStatuses.find(s => s.user_id === currentUser?.id && s.date_key === dateKey);
    const onSetStatus = async (status: 'in_person' | 'remote') => {
        try {
            await setDailyStatus({ dateKey, status });
            addNotification({ message: status === 'in_person' ? 'Has confirmado tu asistencia presencial.' : 'Has confirmado que no asistirás presencialmente.' });
        } catch (error) {
            console.error("Error setting status:", error);
            alert(`Error al actualizar el estado: ${(error as Error).message}`);
        }
    };

    // Get today's time entries for current user
    const userEntries = timeData[dateKey]?.[currentUser?.id] || [];

    // Check for approved absence for today
    const activeAbsence = absenceRequests.find(
        (r: any) => r.created_by === currentUser?.id &&
            r.date_key === dateKey &&
            r.status === 'approved'
    );

    // Active records:
    // Keep a single daily active session entry to avoid duplicated rows per day.
    const activeEntry = userEntries.find(e => e.entry && !e.exit);
    const isOnBreak = activeEntry?.status === 'break_paid';
    const isClocked = !!activeEntry && !isOnBreak;
    const hasActiveSession = !!activeEntry;
    const hasBreakLoggedToday = userEntries.some(
        (e) => e.status === 'break_paid' || (e.note || '').includes('PAUSA_INICIO:'),
    );

    // Calculate elapsed time for active work or break session
    useEffect(() => {
        const sessionEntry = activeEntry?.entry;
        if (!sessionEntry) {
            setElapsedTime('00:00:00');
            return;
        }

        const calculateElapsed = () => {
            const entryTime = new Date(`1970-01-01T${sessionEntry}`);
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
    }, [activeEntry?.entry]);

    useEffect(() => {
        if (!breakPolicy || activeAbsence || isWeekend(targetDate)) {
            setReminderType(null);
            return;
        }

        if (snoozedUntil && Date.now() < snoozedUntil) {
            return;
        }

        if (isOnBreak) {
            const breakMinutes = minutesSinceTime(activeEntry?.entry);
            if (breakMinutes >= breakPolicy.breakMinutes) {
                setReminderType('resume_break');
                return;
            }
        }

        if (isClocked && !hasBreakLoggedToday) {
            const workedMinutes = minutesSinceTime(activeEntry?.entry);
            if (workedMinutes >= breakPolicy.startAfterMinutes) {
                setReminderType('start_break');
                return;
            }
        }

        setReminderType(null);
    }, [
        breakPolicy,
        activeAbsence,
        targetDate,
        snoozedUntil,
        isOnBreak,
        isClocked,
        hasBreakLoggedToday,
        activeEntry?.entry,
    ]);

    useEffect(() => {
        if (!currentUser || !reminderType || !breakPolicy) return;
        const reminderKey = `${currentUser.id}:${dateKey}:${reminderType}`;
        if (announcedReminderRef.current === reminderKey) return;
        announcedReminderRef.current = reminderKey;

        if (reminderType === 'start_break') {
            addNotification({
                message: `Sugerencia: es buen momento para iniciar tu pausa de ${breakPolicy.breakMinutes} minutos (${breakPolicy.label}).`,
            });
        } else {
            addNotification({
                message: `Tu pausa recomendada de ${breakPolicy.breakMinutes} minutos ha terminado. Puedes retomar jornada.`,
            });
        }
    }, [currentUser, reminderType, breakPolicy, dateKey, addNotification]);

    async function handleMarkEntry() {
        if (activeEntry) return;
        const now = formatTimeNow();
        try {
            const primaryTodayEntry = userEntries[0];
            if (primaryTodayEntry) {
                await updateTimeEntry({
                    id: primaryTodayEntry.id,
                    updates: {
                        entry: now,
                        exit: null,
                        status: 'present',
                        note: primaryTodayEntry.note || '',
                    },
                });
            } else {
                await createTimeEntry({
                    date: targetDate,
                    userId: currentUser.id,
                    entry: now,
                    exit: null,
                    status: 'present',
                    note: '',
                });
            }
            addNotification({ message: `Has fichado tu entrada (${now}).` });
        } catch (e) {
            console.error('Error creating entry:', e);
        }
    }

    async function handleStartBreak() {
        if (!activeEntry || isOnBreak) return;
        const now = formatTimeNow();
        try {
            const currentNote = activeEntry.note || '';
            await updateTimeEntry({
                id: activeEntry.id,
                updates: {
                    status: 'break_paid',
                    note: `${currentNote}${currentNote ? ' | ' : ''}PAUSA_INICIO:${now}`,
                },
            });
            addNotification({ message: `Pausa iniciada (${now}).` });
            setReminderType(null);
        } catch (e) {
            console.error('Error starting break:', e);
        }
    }

    async function handleResumeFromBreak() {
        if (!activeEntry || !isOnBreak) return;
        const now = formatTimeNow();
        try {
            const currentNote = activeEntry.note || '';
            await updateTimeEntry({
                id: activeEntry.id,
                updates: {
                    status: 'present',
                    note: `${currentNote}${currentNote ? ' | ' : ''}PAUSA_FIN:${now}`,
                },
            });
            addNotification({ message: `Jornada retomada (${now}).` });
            setReminderType(null);
        } catch (e) {
            console.error('Error resuming from break:', e);
        }
    }

    async function handleMarkExit() {
        if (!activeEntry) return;
        const now = formatTimeNow();
        try {
            await updateTimeEntry({
                id: activeEntry.id,
                updates: { exit: now, status: isOnBreak ? 'present' : activeEntry.status },
            });
            addNotification({ message: `Has fichado tu salida (${now}). ¡Hasta luego! 🌙` });
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

    const isAdmin = currentUser?.isAdmin;

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
                                : isOnBreak
                                    ? 'Pausa activa (tiempo incluido en jornada)'
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
                ) : isWeekend(targetDate) ? (
                    <div className="flex flex-col items-center justify-center py-8 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400">
                        <div className="text-3xl mb-2">🏖️</div>
                        <h3 className="text-xl font-bold mb-1">Fin de semana</h3>
                        <p className="text-sm font-medium opacity-80">No se trabaja hoy.</p>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                        {reminderType && breakPolicy && (
                            <div className="w-full mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
                                <div>
                                    <p className="text-sm font-bold text-amber-800">
                                        {reminderType === 'start_break' ? 'Sugerencia de pausa' : 'Hora de retomar'}
                                    </p>
                                    <p className="text-sm text-amber-700">
                                        {reminderType === 'start_break'
                                            ? `Te recomendamos iniciar tu ${breakPolicy.label.toLowerCase()} (${breakPolicy.breakMinutes} min).`
                                            : `Ya pasaron ${breakPolicy.breakMinutes} minutos. Puedes retomar jornada cuando quieras.`}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {reminderType === 'start_break' ? (
                                        <button
                                            onClick={handleStartBreak}
                                            className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors"
                                        >
                                            Iniciar pausa
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleResumeFromBreak}
                                            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
                                        >
                                            Retomar jornada
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setSnoozedUntil(Date.now() + 10 * 60 * 1000);
                                            setReminderType(null);
                                        }}
                                        className="px-4 py-2 rounded-xl border border-amber-300 text-amber-700 text-sm font-bold hover:bg-amber-100 transition-colors"
                                    >
                                        Posponer 10 min
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Clock Display */}
                        <div className="flex items-center gap-4">
                            <div className={`text-5xl font-black tracking-tighter font-mono ${hasActiveSession ? 'text-gray-900' : 'text-gray-300'
                                }`}>
                                {elapsedTime}
                            </div>
                            {hasActiveSession && (
                                <div className="flex flex-col">
                                    <span className={`w-2 h-2 rounded-full animate-pulse mb-1 ${isOnBreak ? 'bg-amber-500' : 'bg-green-500'}`} />
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isOnBreak ? 'text-amber-600' : 'text-green-600'}`}>
                                        {isOnBreak ? 'Pausa' : 'Activo'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {isOnBreak ? (
                            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                                <button
                                    onClick={handleResumeFromBreak}
                                    className="group relative overflow-hidden rounded-2xl px-6 py-4 font-bold text-base transition-all duration-300 shadow-lg active:scale-95 flex items-center justify-center gap-3 w-full sm:w-auto bg-primary text-white hover:bg-primary-dark shadow-primary/30 hover:shadow-primary/50"
                                >
                                    <Play size={18} fill="currentColor" />
                                    <span>Retomar Jornada</span>
                                </button>
                                <button
                                    onClick={handleMarkExit}
                                    className="group relative overflow-hidden rounded-2xl px-6 py-4 font-bold text-base transition-all duration-300 shadow-lg active:scale-95 flex items-center justify-center gap-3 w-full sm:w-auto bg-red-50 text-red-600 border-2 border-red-100 hover:bg-red-100 hover:border-red-200"
                                >
                                    <Square size={18} fill="currentColor" />
                                    <span>Finalizar Jornada</span>
                                </button>
                            </div>
                        ) : isClocked ? (
                            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                                <button
                                    onClick={handleStartBreak}
                                    className="group relative overflow-hidden rounded-2xl px-6 py-4 font-bold text-base transition-all duration-300 shadow-lg active:scale-95 flex items-center justify-center gap-3 w-full sm:w-auto bg-amber-100 text-amber-700 hover:bg-amber-200 hover:shadow-amber-100"
                                >
                                    <Coffee size={18} />
                                    <span>Pausar (Comida)</span>
                                </button>
                                <button
                                    onClick={handleMarkExit}
                                    className="group relative overflow-hidden rounded-2xl px-6 py-4 font-bold text-base transition-all duration-300 shadow-lg active:scale-95 flex items-center justify-center gap-3 w-full sm:w-auto bg-red-50 text-red-600 border-2 border-red-100 hover:bg-red-100 hover:border-red-200"
                                >
                                    <Square size={18} fill="currentColor" />
                                    <span>Finalizar Jornada</span>
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleMarkEntry}
                                className="group relative overflow-hidden rounded-2xl px-8 py-4 font-bold text-base transition-all duration-300 shadow-lg active:scale-95 flex items-center gap-3 w-full sm:w-auto justify-center bg-primary text-white hover:bg-primary-dark shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5"
                            >
                                <Play size={18} fill="currentColor" />
                                <span>Iniciar Jornada</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Esteban's Presence Control */}
            {currentUser?.id === ESTEBAN_ID && (
                <div className="px-6 py-4 bg-teal-50/50 border-t border-gray-100">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-teal-100 text-teal-700 rounded-lg">
                                <Users size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Mi Presencia</h3>
                                <p className="text-xs text-gray-500">¿Vas a ir presencialmente a la nave hoy?</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onSetStatus('in_person')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${currentStatus?.status === 'in_person'
                                    ? 'bg-teal-600 text-white shadow-md'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                <CheckSquare size={14} />
                                Sí, iré
                            </button>
                            <button
                                onClick={() => onSetStatus('remote')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${currentStatus?.status === 'remote'
                                    ? 'bg-gray-600 text-white shadow-md'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                <XCircle size={14} />
                                No iré
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Entries List */}
            {showEntries && userEntries.length > 0 && (
                <div className="bg-white">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Clock size={12} />
                            Historial de hoy
                        </span>
                        {isAdmin && (
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
                        )}
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
                                                {isEditing && isAdmin ? (
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
                                                {isEditing && isAdmin ? (
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
                                                <div className="mb-1">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${entry.status === 'break_paid'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-gray-100 text-gray-600'
                                                            }`}
                                                    >
                                                        {entry.status === 'break_paid' ? 'Pausa' : 'Trabajo'}
                                                    </span>
                                                </div>
                                                {isEditing && isAdmin ? (
                                                    <input
                                                        type="text"
                                                        placeholder="Añadir nota..."
                                                        className="w-full bg-transparent text-sm text-gray-600 placeholder-gray-400 focus:outline-none border-b border-transparent focus:border-gray-200 py-1 transition-colors"
                                                        value={entry.note || ''}
                                                        onChange={(e) => handleUpdateNote(entry.id, e.target.value)}
                                                    />
                                                ) : (
                                                    <div className="text-sm text-gray-500 italic">
                                                        {entry.note}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Delete Button */}
                                            {isEditing && isAdmin && (
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
