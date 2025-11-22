import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';

/**
 * Notificaciones con Supabase
 * Tabla: notifications
 * Campos: id, user_id, message, created_at, read (bool)
 */
export default function NotificationBell() {
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

    return (
        <div className="relative inline-block">
            <button
                type="button"
                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                onClick={toggleOpen}
            >
                🔔 Notificaciones
                {unreadCount > 0 && ` (${unreadCount})`}
            </button>

            {open && (
                <div className="absolute top-[calc(100%+8px)] right-0 w-[300px] max-h-[300px] overflow-y-auto bg-card border-2 border-border rounded-2xl shadow-[6px_6px_0_rgba(0,0,0,0.2)] z-50 p-2">
                    {notifications.length === 0 ? (
                        <div className="text-xs text-[#666] p-1.5">
                            No tienes notificaciones todavía.
                        </div>
                    ) : (
                        notifications.slice(0, 30).map((n) => (
                            <div key={n.id} className="border-b border-[#eee] py-2 last:border-b-0">
                                <div>{n.message}</div>
                                <div className="text-xs text-[#666]">
                                    {new Date(n.createdAt).toLocaleString("es-ES", {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
