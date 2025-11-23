import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';


/**
 * Notificaciones con Supabase
 * Tabla: notifications
 * Campos: id, user_id, message, created_at, read (bool)
 */
export default function NotificationBell({ placement = 'bottom-right', fullWidth = false }) {
    const { currentUser } = useAuth();
    const { notifications, markAllAsRead } = useNotifications(currentUser);
    const [open, setOpen] = useState(false);

    const unreadCount = notifications.filter((n) => !n.read).length;

    function toggleOpen() {
        const next = !open;
        setOpen(next);
        if (!open) {
            markAllAsRead();
        }
    }

    // Determine dropdown position classes
    const dropdownClasses = {
        'bottom-right': 'top-[calc(100%+12px)] right-0 origin-top-right',
        'top-right': 'bottom-[calc(100%+12px)] left-0 origin-bottom-left',
        'top-left': 'bottom-[calc(100%+12px)] right-0 origin-bottom-right',
    };

    const positionClass = dropdownClasses[placement] || dropdownClasses['bottom-right'];

    return (
        <div className={`relative ${fullWidth ? 'block' : 'inline-block'}`}>
            <button
                type="button"
                className={`
                    group relative flex items-center justify-center gap-2.5 
                    rounded-xl border-2 border-transparent 
                    transition-all duration-200 ease-out
                    ${open ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100 text-gray-600'}
                    ${fullWidth ? 'w-full py-2 px-3' : 'p-2'}
                `}
                onClick={toggleOpen}
            >
                <div className="relative">
                    <span className="text-lg">🔔</span>
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
                            {unreadCount}
                        </span>
                    )}
                </div>

                {fullWidth && (
                    <span className={`text-xs font-bold ${open ? 'text-primary' : 'text-gray-700'}`}>
                        Notificaciones
                    </span>
                )}
            </button>

            {open && (
                <>
                    {/* Backdrop for mobile to close on click outside */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

                    <div className={`
                        absolute ${positionClass} z-50 
                        w-[320px] max-h-[400px] overflow-hidden
                        bg-white/95 backdrop-blur-xl 
                        border border-gray-200/50 
                        rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)]
                        animate-in fade-in zoom-in-95 duration-200
                        flex flex-col
                    `}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-sm font-bold text-gray-900">Notificaciones</h3>
                            {unreadCount > 0 && (
                                <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                    {unreadCount} nuevas
                                </span>
                            )}
                        </div>

                        <div className="overflow-y-auto flex-1 p-2 space-y-1">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <span className="text-2xl mb-2 opacity-50">🔕</span>
                                    <p className="text-xs text-gray-500 font-medium">
                                        No tienes notificaciones
                                    </p>
                                </div>
                            ) : (
                                notifications.slice(0, 30).map((n) => (
                                    <div
                                        key={n.id}
                                        className="group flex flex-col gap-1 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                                    >
                                        <p className="text-xs text-gray-700 leading-relaxed font-medium">
                                            {n.message}
                                        </p>
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            {new Date(n.createdAt).toLocaleString("es-ES", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit"
                                            })}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>


                    </div>
                </>
            )}
        </div>
    );
}


