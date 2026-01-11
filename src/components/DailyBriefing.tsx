import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useDailyStatus } from '../hooks/useDailyStatus';
import { useAbsences } from '../hooks/useAbsences';
import { toDateKey } from '../utils/dateUtils';
import { USERS, ESTEBAN_ID } from '../constants';
import { motion } from 'framer-motion';
import { Sparkles, Users, Coffee } from 'lucide-react';

export default function DailyBriefing() {
    const { currentUser } = useAuth();
    const { todos } = useTodos(currentUser);
    const { meetingRequests } = useMeetings(currentUser);
    const { dailyStatuses, setDailyStatus } = useDailyStatus(currentUser);
    const { absenceRequests } = useAbsences(currentUser);

    const briefing = React.useMemo(() => {
        if (!currentUser) return null;

        const todayKey = toDateKey(new Date());

        // 1. My tasks due today
        const myTasksToday = todos.filter(t =>
            t.due_date_key === todayKey &&
            t.assigned_to.includes(currentUser.id) &&
            !t.completed_by.includes(currentUser.id)
        );

        // 2. My meetings today
        const myMeetingsToday = meetingRequests.filter(m =>
            m.scheduled_date_key === todayKey &&
            m.status === 'scheduled' &&
            (m.created_by === currentUser.id || m.participants.includes(currentUser.id))
        );

        // 3. Who is present/remote/absent today
        const teamInPerson = dailyStatuses.filter(s => s.date_key === todayKey && s.status === 'in_person');
        const teamRemote = dailyStatuses.filter(s => s.date_key === todayKey && s.status === 'remote');
        const teamAbsent = absenceRequests.filter(r =>
            r.status === 'approved' &&
            todayKey >= r.date_key &&
            todayKey <= (r.end_date || r.date_key)
        );

        const estebanStatus = dailyStatuses.find(s => s.user_id === ESTEBAN_ID && s.date_key === todayKey);
        const estebanPresent = estebanStatus?.status === 'in_person';

        // 4. Generate greeting
        const hour = new Date().getHours();
        let greeting = "¡Buenos días";
        if (hour >= 13) greeting = "¡Buenas tardes";
        if (hour >= 20) greeting = "¡Buenas noches";

        // 5. Build summary message
        let statusMessage = "";
        if (myTasksToday.length > 0) {
            statusMessage += `Tienes **${myTasksToday.length} ${myTasksToday.length === 1 ? 'tarea' : 'tareas'}** pendientes para hoy. `;
        } else {
            statusMessage += "No tienes tareas que venzan hoy, ¡muy bien! ";
        }

        if (myMeetingsToday.length > 0) {
            statusMessage += `Hay **${myMeetingsToday.length} ${myMeetingsToday.length === 1 ? 'reunión agendada' : 'reuniones agendadas'}**. `;
        }

        let presenceMessage = "";
        if (estebanPresent) {
            presenceMessage = "Esteban ya está en la nave. ";
        } else if (estebanStatus?.status === 'remote') {
            presenceMessage = "Esteban está teletrabajando hoy. ";
        }

        const personCount = teamInPerson.length;
        if (personCount > 1) {
            presenceMessage += `Hay **${personCount} personas** en la oficina ahora mismo.`;
        }

        return {
            greeting: `${greeting}, ${currentUser.name.split(' ')[0]}!`,
            message: statusMessage,
            presence: presenceMessage
        };
    }, [currentUser, todos, meetingRequests, dailyStatuses, absenceRequests]);

    if (!briefing) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-white to-primary/10 border border-primary/10 rounded-[2rem] p-8 shadow-sm mb-8"
        >
            <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                <Sparkles size={120} className="text-primary rotate-12" />
            </div>

            <div className="relative z-10">
                <h3 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                    {briefing.greeting}
                </h3>

                <div className="space-y-4 max-w-2xl">
                    <p className="text-xl text-gray-600 font-medium leading-relaxed">
                        {briefing.message.split('**').map((part, i) =>
                            i % 2 === 1 ? <span key={i} className="text-primary font-black">{part}</span> : part
                        )}
                    </p>

                    {(briefing.presence) && (
                        <div className="flex items-center gap-3 py-3 px-5 bg-white/60 backdrop-blur-sm border border-white rounded-2xl w-fit shadow-inner">
                            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                                <Users size={20} />
                            </div>
                            <p className="text-gray-600 font-bold truncate">
                                {briefing.presence}
                            </p>
                        </div>
                    )}
                </div>

                {/* Moods Selection */}
                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-wrap items-center gap-4">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">¿Cómo vas hoy?</span>
                    <div className="flex flex-wrap items-center gap-2">
                        {[
                            { label: '🔥 En racha', emoji: '🔥', status: 'En racha' },
                            { label: '☕ Pausa', emoji: '☕', status: 'Pausa' },
                            { label: '📵 Concentrado', emoji: '📵', status: 'Concentrado' },
                            { label: '✅ Disponible', emoji: '✅', status: 'Disponible' },
                            { label: '🥘 Comiendo', emoji: '🥘', status: 'Comiendo' }
                        ].map((item) => {
                            const todayKey = toDateKey(new Date());
                            const myStatus = dailyStatuses.find(s => s.user_id === currentUser.id && s.date_key === todayKey);
                            const isActive = myStatus?.custom_status === item.status;

                            return (
                                <button
                                    key={item.label}
                                    onClick={async () => {
                                        try {
                                            const currentBaseStatus = myStatus?.status || 'in_person';
                                            await setDailyStatus({
                                                dateKey: todayKey,
                                                status: currentBaseStatus,
                                                customStatus: `${item.emoji} ${item.status}`, // Include emoji in text for display
                                                customEmoji: myStatus?.custom_emoji // Preserve existing weather background
                                            });
                                            if (window.navigator?.vibrate) window.navigator.vibrate(10);
                                        } catch (e) {
                                            console.error(e);
                                        }
                                    }}
                                    className={`
                                        px-3 py-1.5 rounded-full border text-xs font-bold transition-all shadow-sm
                                        ${isActive
                                            ? "bg-primary text-white border-primary scale-105 shadow-md"
                                            : "bg-white border-gray-100 text-gray-600 hover:border-primary hover:text-primary"
                                        }
                                    `}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
