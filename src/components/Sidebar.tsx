import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Calendar,
    CheckSquare,
    MessageCircle,
    FileText,
    Folder,
    LogOut,
    Lock,
    Bell,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ShoppingBag,
    Search,
    Boxes
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { RoleBadge } from './RoleBadge';
import { SidebarMoodBackground } from './SidebarMoodBackground';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import { useDailyStatus } from '../hooks/useDailyStatus';
import { useShoppingList } from '../hooks/useShoppingList';
import { useTodos } from '../hooks/useTodos';
import { DRIVE_FOLDERS, ESTEBAN_ID } from '../constants';
import { toDateKey } from '../utils/dateUtils';

/**
 * Sidebar navigation component
 * Responsive sidebar with collapse/expand functionality
 * Mobile: Overlay mode with backdrop
 * Desktop: Persistent sidebar with collapse toggle
 */
interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onOpenPasswordModal: () => void;
    onOpenNotificationsModal: () => void;
}

function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, onOpenPasswordModal, onOpenNotificationsModal }: SidebarProps) {
    const { currentUser, logout } = useAuth();
    const {
        notifications
    } = useNotificationsContext();
    const { theme, toggleTheme } = useTheme();

    // Data hooks for badges
    const { shoppingItems } = useShoppingList(currentUser);
    const { todos } = useTodos(currentUser);
    const { dailyStatuses } = useDailyStatus(currentUser);
    const todayKey = toDateKey(new Date());
    const myStatusToday = dailyStatuses.find(s => s.user_id === currentUser?.id && s.date_key === todayKey);

    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef(null);

    const isAdmin = !!currentUser?.isAdmin;
    const unreadCount = notifications.filter((n) => !n.read).length;

    // --- BADGE CALCULATIONS ---

    // 1. Tasks: Assigned to me AND incomplete
    const pendingTasksCount = todos.filter(t =>
        t.assigned_to?.includes(currentUser?.id || '') &&
        !t.completed_by?.includes(currentUser?.id || '')
    ).length;

    // 5. Shopping: Esteban sees unpurchased items
    const pendingShoppingCount = (currentUser?.id === ESTEBAN_ID)
        ? shoppingItems.filter(item => !item.is_purchased).length
        : 0;

    // Close user menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Check if user has any shared folders
    const hasSharedFolders = DRIVE_FOLDERS.some(f => f.users.includes(currentUser?.id));

    interface NavigationItem {
        label: string;
        icon: any; // Using any for Lucide icon to avoid complex type matching
        path?: string;
        show?: boolean;
        onClick?: () => void;
        shortcut?: string;
        badge?: number;
        isAdminItem?: boolean;
    }

    const navigationItems: NavigationItem[] = [
        {
            label: 'Buscar...',
            icon: Search,
            show: true,
            onClick: () => window.dispatchEvent(new CustomEvent('toggle-search')),
            shortcut: '⌘K'
        },
        {
            path: '/dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            show: true
        },
        {
            path: '/calendar',
            label: 'Calendario',
            icon: Calendar,
            show: true
        },
        {
            path: '/tasks',
            label: 'Tareas',
            icon: CheckSquare,
            show: true,
            badge: pendingTasksCount
        },
        {
            path: '/chat',
            label: 'Chat',
            icon: MessageCircle,
            show: true,
        },
        {
            path: '/shopping',
            label: 'Lista de Compras',
            icon: ShoppingBag,
            show: true,
            badge: pendingShoppingCount
        },
        {
            path: '/inventory',
            label: 'Inventario Canet',
            icon: Boxes,
            show: true,
        },
        {
            path: '/inventory-facturacion',
            label: 'Inventario Huarte',
            icon: Boxes,
            show: true,
        },
        {
            path: '/exports',
            label: 'Exportaciones',
            icon: FileText,
            show: isAdmin,
            isAdminItem: true
        },
        {
            path: '/folders',
            label: 'Carpetas',
            icon: Folder,
            show: hasSharedFolders
        }
    ];

    const handleNavigation = (path: string) => {
        navigate(path);
        // Close sidebar on mobile after navigation
        if (window.innerWidth < 768) {
            onClose();
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <>
            {/* Mobile backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 h-screen bg-white shadow-2xl md:shadow-none z-50 overflow-hidden
          transition-all duration-300 ease-in-out flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-20' : 'md:w-64'}
          w-64
        `}
            >
                {/* Dynamic Style Logic */}
                {(() => {
                    const currentEmoji = myStatusToday?.custom_emoji;
                    // Moods predefined in SidebarMoodBackground are currently ALL Light-ish backgrounds.
                    // So if a mood is active, we should force Dark Text to ensure contrast.
                    const supportedMoods = ['✨', '🌸', '☁️', '🔥'];
                    const isMoodActive = supportedMoods.includes(currentEmoji || '');

                    // If Mood is active, use a dark text color (ignoring dark mode).
                    // If Mood is NOT active, use adaptive text (Dark on Light, Light on Dark).
                    const textColor = isMoodActive
                        ? 'text-gray-900 font-medium' // Moods need strong contrast
                        : 'text-gray-600 dark:text-gray-300';

                    const hoverBg = isMoodActive
                        ? 'hover:bg-white/40' // Glassy hover for moods
                        : 'hover:bg-purple-50 dark:hover:bg-purple-900/20';

                    const sidebarBg = isMoodActive
                        ? 'bg-white' // Background behind mood (invisible mostly)
                        : 'bg-white dark:bg-[#1C1926]'; // Default sidebar backgrounds

                    return (
                        <>
                            {/* Background Layer */}
                            <div className={`absolute inset-0 transition-colors duration-300 ${sidebarBg}`}>
                                <SidebarMoodBackground emoji={currentEmoji} />
                            </div>

                            {/* Sidebar Content */}
                            <div className="relative z-10 flex flex-col h-full w-full">
                                {/* Logo Area */}
                                <div className="p-6 flex justify-center items-center shrink-0">
                                    {!isCollapsed ? (
                                        <div className="flex flex-col items-center w-full">
                                            <img
                                                src="/logo_text_trans.png"
                                                alt="Lunaris Logo"
                                                className="h-28 w-auto object-contain drop-shadow-md transition-transform duration-300 hover:scale-105"
                                            />
                                        </div>
                                    ) : (
                                        <div className="p-2 bg-gradient-to-tr from-primary to-purple-600 rounded-xl shadow-lg">
                                            <img
                                                src="/logo.png"
                                                alt="L"
                                                className="w-8 h-8 object-contain brightness-0 invert"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Navigation */}
                                <nav className="flex-1 px-4 py-2 space-y-1.5 overflow-y-auto relative scrollbar-hide">
                                    {navigationItems.filter(item => item.show !== false).map((item) => {
                                        const isActive = item.path ? location.pathname === item.path : false;
                                        return (
                                            <button
                                                key={item.label}
                                                onClick={() => {
                                                    if (item.onClick) item.onClick();
                                                    if (item.path) {
                                                        navigate(item.path);
                                                        if (window.innerWidth < 768) onClose();
                                                    }
                                                }}
                                                className={`
                                                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden
                                                    ${isActive
                                                        ? 'bg-gradient-to-r from-primary to-purple-600 text-white shadow-md'
                                                        : `${textColor} ${hoverBg} hover:shadow-sm`
                                                    }
                                                `}
                                            >
                                                <item.icon
                                                    size={20}
                                                    className={`
                                                        transition-transform duration-300 group-hover:scale-110 relative z-10
                                                        ${isActive ? 'text-white' : (isMoodActive ? 'text-gray-800' : 'text-gray-400 dark:text-gray-500') + ' group-hover:text-primary'}
                                                    `}
                                                />

                                                {!isCollapsed && (
                                                    <div className="flex-1 flex items-center justify-between text-sm font-bold relative z-10">
                                                        <span>{item.label}</span>
                                                        {item.shortcut && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isActive ? 'bg-white/20 border-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}>
                                                                {item.shortcut}
                                                            </span>
                                                        )}
                                                        {item.badge !== undefined && item.badge > 0 && (
                                                            <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-red-500 text-white text-[10px] font-black rounded-full shadow-sm animate-pulse">
                                                                {item.badge > 99 ? '99+' : item.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </nav>

                                {/* User Profile (Footer) */}
                                <div className="p-4 border-t border-gray-100/10 shrink-0">
                                    <div className="relative" ref={userMenuRef}>
                                        <button
                                            onClick={() => setShowUserMenu(!showUserMenu)}
                                            className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all duration-200 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-100 dark:border-gray-700 hover:border-blue-200 hover:shadow-md`}
                                        >
                                            <UserAvatar name={currentUser?.name || 'User'} size="sm" />
                                            {!isCollapsed && (
                                                <div className="flex-1 min-w-0 text-left">
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-sm font-black truncate ${isMoodActive ? 'text-gray-900' : 'text-gray-900 dark:text-white'}`}>{currentUser?.name}</p>
                                                        {currentUser?.isAdmin && <RoleBadge role="admin" size="xs" />}
                                                        {currentUser?.isTrainingManager && !currentUser?.isAdmin && <RoleBadge role="trainingManager" size="xs" />}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-xs truncate font-medium ${isMoodActive ? 'text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>{currentUser?.email}</p>
                                                    </div>
                                                </div>
                                            )}
                                            <ChevronDown size={16} className={`text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                                        </button>

                                        <AnimatePresence>
                                            {showUserMenu && !isCollapsed && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    className="absolute bottom-full left-0 w-full mb-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50"
                                                >
                                                    <div className="p-1">
                                                        <button
                                                            onClick={() => {
                                                                setShowUserMenu(false);
                                                                onOpenNotificationsModal();
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
                                                        >
                                                            <div className="relative">
                                                                <Bell size={16} />
                                                                {unreadCount > 0 && (
                                                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                                                                )}
                                                            </div>
                                                            Notificaciones
                                                            {unreadCount > 0 && <span className="ml-auto bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{unreadCount}</span>}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setShowUserMenu(false);
                                                                onOpenPasswordModal();
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
                                                        >
                                                            <Lock size={16} />
                                                            Cambiar contraseña
                                                        </button>
                                                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                                                        <div className="px-3 py-2 flex items-center justify-between">
                                                            <span className="text-xs font-bold text-gray-400 uppercase">Tema</span>
                                                            <button
                                                                onClick={toggleTheme}
                                                                className={`
                                                                    w-10 h-6 rounded-full transition-colors flex items-center px-1
                                                                    ${theme === 'dark' ? 'bg-gray-800 border border-gray-600' : 'bg-gray-200'}
                                                                `}
                                                            >
                                                                <motion.div
                                                                    layout
                                                                    className="w-4 h-4 bg-white rounded-full shadow-sm"
                                                                />
                                                            </button>
                                                        </div>
                                                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                                                        <button
                                                            onClick={handleLogout}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                                        >
                                                            <LogOut size={16} />
                                                            Cerrar sesión
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </>
                    );
                })()}

                {/* Desktop collapse toggle */}
                <button
                    onClick={onToggleCollapse}
                    className="hidden md:flex absolute -right-3 top-24 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-all duration-200 shadow-sm z-50"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </aside >

        </>
    );
}

export default Sidebar;
