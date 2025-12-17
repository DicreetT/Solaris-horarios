import React from 'react';
import { Calendar, CheckCircle2, Circle, User, Users } from 'lucide-react';
import { Todo } from '../types';
import { USERS } from '../constants';
import { UserAvatar } from './UserAvatar';

interface TaskCardRowProps {
    todo: Todo;
    currentUser: { id: string };
    onClick: (todo: Todo) => void;
    onToggle: (todo: Todo) => void;
}

export function TaskCardRow({ todo, currentUser, onClick, onToggle }: TaskCardRowProps) {
    const isDone = todo.assigned_to.length > 0 && todo.assigned_to.every(uid => todo.completed_by.includes(uid));
    const isOverdue = todo.due_date_key && new Date(todo.due_date_key) < new Date(new Date().toDateString()) && !isDone;
    const isDueToday = todo.due_date_key === new Date().toISOString().split('T')[0] && !isDone;
    const isUrgent = isOverdue || isDueToday;

    const creator = USERS.find(u => u.id === todo.created_by);
    const assignedUsers = todo.assigned_to.map(uid => USERS.find(u => u.id === uid)).filter(Boolean);

    // Color logic
    const getStatusColor = () => {
        if (isDone) return 'text-green-500 bg-green-50 border-green-200';
        if (isUrgent) return 'text-red-500 bg-red-50 border-red-200';
        return 'text-gray-400 bg-white border-gray-300 hover:border-primary';
    };

    return (
        <div
            onClick={() => onClick(todo)}
            className={`
                group relative flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md
                ${isDone ? 'bg-gray-50/50 border-gray-100 opacity-60' : 'bg-white border-gray-100 hover:border-primary/30'}
                ${isUrgent ? 'border-l-4 border-l-red-500' : ''}
            `}
        >
            {/* Status Toggle */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (todo.assigned_to.includes(currentUser.id)) {
                        onToggle(todo);
                    }
                }}
                className={`
                    shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                    ${isDone
                        ? 'bg-green-500 border-green-500 text-white'
                        : (isUrgent ? 'border-red-400 text-transparent hover:bg-green-50 hover:border-green-400 hover:text-green-400' : 'border-gray-300 text-transparent hover:border-green-500 hover:text-green-500')
                    }
                `}
                disabled={!todo.assigned_to.includes(currentUser.id)}
                title={isDone ? "Completada" : "Marcar como hecha"}
            >
                <CheckCircle2 size={14} fill={isDone ? "currentColor" : "none"} />
            </button>

            {/* Title & Creator */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <h3 className={`font-bold text-gray-900 truncate ${isDone ? 'line-through text-gray-500' : ''}`}>
                        {todo.title}
                    </h3>
                    {todo.tags?.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 uppercase tracking-wider hidden sm:inline-block">
                            {tag}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                        <User size={10} />
                        De: <span className="font-medium text-gray-600">{creator?.name || 'Desconocido'}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                        <Users size={10} />
                        Para: <span className="font-medium text-gray-600">{assignedUsers.map(u => u?.name).join(', ')}</span>
                    </span>
                </div>
            </div>

            {/* Date Badge */}
            {todo.due_date_key && (
                <div className={`
                    shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5
                    ${isDone
                        ? 'bg-gray-100 text-gray-400'
                        : (isUrgent ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600')
                    }
                `}>
                    <Calendar size={12} />
                    {new Date(todo.due_date_key).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </div>
            )}
        </div>
    );
}
