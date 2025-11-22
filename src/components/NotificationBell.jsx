import React, { useState } from 'react';

/**
 * Notificaciones con Supabase
 * Tabla: notifications
 * Campos: id, user_id, message, created_at, read (bool)
 */
export default function NotificationBell({ notifications, onMarkAllRead }) {
    const [open, setOpen] = useState(false);

    const unreadCount = notifications.filter((n) => !n.read).length;

    function toggleOpen() {
        const next = !open;
        setOpen(next);
        if (!open) {
            onMarkAllRead();
        }
    }

    return (
        <div style={{ position: "relative", display: "inline-block" }}>
            <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={toggleOpen}
            >
                🔔 Notificaciones
                {unreadCount > 0 && ` (${unreadCount})`}
            </button>

            {open && (
                <div className="notification-panel">
                    {notifications.length === 0 ? (
                        <div className="small-muted" style={{ padding: 6 }}>
                            No tienes notificaciones todavía.
                        </div>
                    ) : (
                        notifications.slice(0, 30).map((n) => (
                            <div key={n.id} className="notification-row">
                                <div>{n.message}</div>
                                <div className="small-muted">
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
