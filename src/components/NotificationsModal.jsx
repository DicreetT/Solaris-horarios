import React from 'react';
import { X, Bell, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';

/**
 * NotificationsModal component
 * Full-page modal showing all notifications with scroll view
 */
export default function NotificationsModal({ isOpen, onClose }) {
    const { currentUser } = useAuth();
    const { notifications, markAsRead } = useNotifications(currentUser);

    const unreadCount = notifications.filter((n) => !n.read).length;

    const handleNotificationClick = async (notification) => {
        if (!notification.read) {
            await markAsRead(notification.id);
        }
    };

    if (!isOpen) return null;

    // Separate unread and read notifications
    const unreadNotifications = notifications.filter((n) => !n.read);
    const readNotifications = notifications.filter((n) => n.read);

    const renderNotification = (n, isUnread) => {
        const createdDate = new Date(n.createdAt);
        const now = new Date();
        const diffMs = now - createdDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        let timeAgo = '';
        if (diffMins < 1) timeAgo = 'Ahora';
        else if (diffMins < 60) timeAgo = `Hace ${diffMins} min`;
        else if (diffHours < 24) timeAgo = `Hace ${diffHours}h`;
        else timeAgo = `Hace ${diffDays}d`;

        return (
            <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`group relative flex gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${isUnread
                    ? 'bg-primary/5 border-primary/30 hover:border-primary/40 shadow-sm'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                    }`}
            >
                {/* Unread indicator */}
                {isUnread && (
                    <div className="absolute top-4 left-4 w-2.5 h-2.5 rounded-full bg-primary shadow-lg shadow-primary/50"></div>
                )}

                {/* Icon */}
                <div className={`flex-shrink-0 ${isUnread ? 'ml-4' : ''}`}>
                    <div className={`p-2.5 rounded-xl ${isUnread ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-400'}`}>
                        <Bell size={20} />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className={`text-sm mb-2 ${isUnread ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>
                        {n.message}
                    </p>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 font-medium">{timeAgo}</span>
                        {!isUnread && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                                <Check size={12} />
                                <span>Leída</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* New badge for unread */}
                {isUnread && (
                    <div className="flex-shrink-0">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-primary text-white uppercase tracking-wider">
                            Nueva
                        </span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                                <Bell size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Notificaciones</h2>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {notifications.length} {notifications.length === 1 ? 'notificación' : 'notificaciones'}
                                    {unreadCount > 0 && (
                                        <span className="ml-2 text-primary font-semibold">
                                            · {unreadCount} {unreadCount === 1 ? 'nueva' : 'nuevas'}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Notifications List */}
                <div className="flex-1 overflow-y-auto p-6">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="p-6 bg-gray-50 rounded-full mb-4">
                                <Bell size={48} className="text-gray-300" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">No hay notificaciones</h3>
                            <p className="text-sm text-gray-500 max-w-sm">
                                Cuando recibas notificaciones, aparecerán aquí
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Unread Notifications */}
                            {unreadNotifications.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent"></div>
                                        <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                                            Nuevas ({unreadNotifications.length})
                                        </h3>
                                        <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent"></div>
                                    </div>
                                    <div className="space-y-3">
                                        {unreadNotifications.map((n) => renderNotification(n, true))}
                                    </div>
                                </div>
                            )}

                            {/* Read Notifications */}
                            {readNotifications.length > 0 && (
                                <div>
                                    {unreadNotifications.length > 0 && (
                                        <div className="flex items-center gap-2 mb-3 mt-6">
                                            <div className="h-px flex-1 bg-gray-200"></div>
                                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                Anteriores ({readNotifications.length})
                                            </h3>
                                            <div className="h-px flex-1 bg-gray-200"></div>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        {readNotifications.map((n) => renderNotification(n, false))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
