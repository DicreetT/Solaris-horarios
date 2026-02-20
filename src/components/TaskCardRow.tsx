import React from 'react';
import { Calendar, CheckCircle2, Circle, Users, Zap, MessageCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Todo } from '../types';
import { USERS } from '../constants';
import { UserAvatar } from './UserAvatar';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { haptics } from '../utils/haptics';
import { Celebration } from './Celebration';

import { useNotificationsContext } from '../context/NotificationsContext';
import { supabase } from '../lib/supabase';

interface TaskCardRowProps {
    todo: Todo;
    currentUser: { id: string };
    unreadCommentsCount?: number;
    onClick: (todo: Todo) => void;
    onToggle: (todo: Todo) => void;
    onMarkCommentsRead?: (todo: Todo) => void;
}

export function TaskCardRow({ todo, currentUser, unreadCommentsCount = 0, onClick, onToggle, onMarkCommentsRead }: TaskCardRowProps) {
    const { sendNudge } = useNotificationsContext();
    const queryClient = useQueryClient();
    const [showCelebration, setShowCelebration] = React.useState(false);
    const isDoneForMe = todo.completed_by.includes(currentUser.id);
    const isGloballyDone = todo.assigned_to.length > 0 && todo.assigned_to.every(uid => todo.completed_by.includes(uid));

    // Simple calculation for due date
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = todo.due_date_key ? todo.due_date_key < today : false;
    const isDueToday = todo.due_date_key === today;

    // Framer motion values for swipe-to-complete (simple version)
    const x = useMotionValue(0);
    const background = useTransform(x, [0, 100], ['#f9fafb', '#10b981']);

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        haptics.medium();
        if (!isDoneForMe) {
            setShowCelebration(true);
        }
        onToggle(todo);
    };

    const unreadLabel = unreadCommentsCount <= 2
        ? 'Nuevo comentario'
        : `${unreadCommentsCount} comentarios`;

    return (
        <div className="relative group overflow-visible">
            <Celebration isVisible={showCelebration} onComplete={() => setShowCelebration(false)} />

            <div
                onClick={() => onClick(todo)}
                className={`
          flex items-center gap-4 p-4 mb-2 rounded-2xl border transition-all cursor-pointer bg-white
          ${isDoneForMe ? 'opacity-60 border-gray-100 shadow-none grayscale' : 'border-gray-100 hover:border-primary/30 hover:shadow-md'}
        `}
            >
                {/* 1. Status Icon */}
                <button
                    onClick={handleToggle}
                    className={`
            w-8 h-8 rounded-xl flex items-center justify-center transition-all
            ${isDoneForMe
                            ? 'bg-green-100 text-green-600'
                            : (isOverdue || isDueToday) ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-gray-50 text-gray-400 hover:bg-primary/10 hover:text-primary'}
          `}
                >
                    {isDoneForMe ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>

                {/* 2. Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className={`font-bold text-gray-900 truncate ${isDoneForMe ? 'line-through text-gray-400' : ''}`}>
                            {todo.title}
                        </h3>
                        {unreadCommentsCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-black whitespace-nowrap">
                                <MessageCircle size={11} />
                                {unreadLabel}
                            </span>
                        )}
                        {(isOverdue || isDueToday) && !isDoneForMe && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-wider">
                                {isOverdue ? 'Vencida' : 'Hoy'}
                            </span>
                        )}
                        {todo.tags && todo.tags.length > 0 && (
                            <div className="flex gap-1">
                                {todo.tags.map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 rounded-md bg-primary/5 text-primary text-[10px] font-bold">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                        {todo.due_date_key && (
                            <span className={`flex items-center gap-1 ${(isOverdue || isDueToday) && !isDoneForMe ? 'text-red-500' : ''}`}>
                                <Calendar size={14} />
                                {todo.due_date_key}
                            </span>
                        )}

                        <div className="flex items-center -space-x-2">
                            {(todo.assigned_to || []).map(uid => (
                                <UserAvatar key={uid} name={USERS.find(u => u.id === uid)?.name} size="xs" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* 3. Indicators (Shock / Progress) */}
                <div className="flex items-center gap-2">
                    {/* Shocked status icon if current user is shocked */}
                    {todo.shocked_users?.includes(currentUser.id) && !isDoneForMe && (
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="w-6 h-6 flex items-center justify-center rounded-lg bg-yellow-100 text-yellow-600 shadow-sm border border-yellow-200"
                            title="¡Estás electrocutado por esta tarea! ⚡"
                        >
                            <Zap size={14} fill="currentColor" />
                        </motion.div>
                    )}

                    <span className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Progreso</span>
                        <span className="text-sm font-black text-gray-900">
                            {todo.completed_by.length}/{todo.assigned_to.length}
                        </span>
                    </span>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 ml-2">
                        {unreadCommentsCount > 0 && onMarkCommentsRead && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkCommentsRead(todo);
                                }}
                                className="px-2 py-1 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] font-black hover:bg-primary/10 transition-colors"
                                title="Marcar comentarios como leídos"
                            >
                                Marcar leído
                            </button>
                        )}
                        {/* Electrocutada Button */}
                        {!isGloballyDone && (
                            <motion.button
                                whileHover={{ scale: 1.2, rotate: 15 }}
                                whileTap={{ scale: 0.8 }}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    haptics.heavy();

                                    const peopleToNudge = todo.assigned_to.filter(uid =>
                                        !todo.completed_by.includes(uid)
                                    );

                                    if (peopleToNudge.length > 0) {
                                        await sendNudge(todo.title, peopleToNudge);

                                        // Also persist the shock state in the database to trigger Storm Mode
                                        const nextShocked = Array.from(new Set([...(todo.shocked_users || []), ...peopleToNudge]));

                                        const { error } = await supabase
                                            .from('todos')
                                            .update({ shocked_users: nextShocked })
                                            .eq('id', todo.id);

                                        if (!error) {
                                            // Force immediate update so we don't need to refresh
                                            queryClient.invalidateQueries({ queryKey: ['todos'] });
                                        }
                                    }
                                }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-yellow-400 text-black hover:bg-yellow-500 transition-colors shadow-sm"
                                title="¡Dar una electrocutada! ⚡"
                            >
                                <Zap size={14} />
                            </motion.button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
