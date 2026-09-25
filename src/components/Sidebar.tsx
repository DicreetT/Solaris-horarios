import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    CheckSquare,
    FileText,
    LogOut,
    Lock,
    Bell,
    Briefcase,
    CalendarClock,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Search,
    Boxes,
    Wrench,
    ClipboardCheck,
    X
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { RoleBadge } from './RoleBadge';
import { SidebarMoodBackground } from './SidebarMoodBackground';
import { FileUploader, Attachment } from './FileUploader';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import { useDailyStatus } from '../hooks/useDailyStatus';
import { useTodos } from '../hooks/useTodos';
import { useTimeData } from '../hooks/useTimeData';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { CARLOS_EMAIL } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { calculateHours, formatHours } from '../utils/timeUtils';

type UserLaborDocumentProfile = {
    contract: Attachment[];
    medical: Attachment[];
    payroll: Attachment[];
    updatedAt?: string;
};

type UserLaborDocumentsState = {
    profiles: Record<string, UserLaborDocumentProfile>;
};

const EMPTY_LABOR_DOCUMENT_PROFILE: UserLaborDocumentProfile = {
    contract: [],
    medical: [],
    payroll: [],
};

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

    const { todos } = useTodos(currentUser);
    const { dailyStatuses } = useDailyStatus(currentUser);
    const todayKey = toDateKey(new Date());
    const myStatusToday = dailyStatuses.find(s => s.user_id === currentUser?.id && s.date_key === todayKey);

    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showLaborCard, setShowLaborCard] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const userMenuRef = useRef(null);
    const currentMonthStart = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }, []);
    const currentMonthEnd = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }, []);
    const { timeData } = useTimeData({ from: currentMonthStart, to: currentMonthEnd });
    const [laborDocuments, setLaborDocuments] = useSharedJsonState<UserLaborDocumentsState>(
        'user_labor_documents_v1',
        { profiles: {} },
    );

    const isRestrictedUser = !!currentUser?.isRestricted || (currentUser?.email || '').toLowerCase() === CARLOS_EMAIL;
    const unreadCount = notifications.filter((n) => !n.read).length;
    const currentLaborProfile = currentUser
        ? laborDocuments.profiles[currentUser.id] || EMPTY_LABOR_DOCUMENT_PROFILE
        : EMPTY_LABOR_DOCUMENT_PROFILE;
    const monthHours = useMemo(() => {
        if (!currentUser) return 0;
        const monthPrefix = toDateKey(currentMonthStart).slice(0, 7);
        return Object.entries(timeData).reduce((total, [dateKey, dayData]) => {
            if (!dateKey.startsWith(monthPrefix)) return total;
            const entries = dayData[currentUser.id] || [];
            return total + entries.reduce((sum, entry) => sum + calculateHours(entry.entry, entry.exit), 0);
        }, 0);
    }, [currentMonthStart, currentUser, timeData]);

    // --- BADGE CALCULATIONS ---

    // 1. Tasks: Assigned to me AND incomplete
    const pendingTasksCount = todos.filter(t =>
        t.assigned_to?.includes(currentUser?.id || '') &&
        !t.completed_by?.includes(currentUser?.id || '')
    ).length;

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

    interface NavigationItem {
        label: string;
        icon: any; // Using any for Lucide icon to avoid complex type matching
        path?: string;
        show?: boolean;
        onClick?: () => void;
        shortcut?: string;
        badge?: number;
        isAdminItem?: boolean;
        isActive?: (pathname: string, search: string) => boolean;
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
            path: '/tasks',
            label: 'Tareas',
            icon: CheckSquare,
            show: true,
            badge: pendingTasksCount
        },
        {
            path: '/inventory',
            label: 'Inventario',
            icon: Boxes,
            show: true,
            isActive: (pathname, search) => pathname === '/inventory' && !new URLSearchParams(search).get('tab'),
        },
        {
            path: '/inventory?view=canet&tab=control_stock',
            label: 'Control stock',
            icon: Wrench,
            show: true,
            isActive: (pathname, search) => pathname === '/inventory' && new URLSearchParams(search).get('tab') === 'control_stock',
        },
        {
            path: '/control-operativo',
            label: 'Control operativo',
            icon: ClipboardCheck,
            show: true,
        },
        {
            path: '/despachos',
            label: 'Despachos',
            icon: FileText,
            show: !isRestrictedUser,
        },
    ];

    const handleNavigation = (path: string) => {
        navigate(path);
        // Close sidebar on mobile after navigation
        if (window.innerWidth < 768) {
            onClose();
        }
    };

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        setShowUserMenu(false);
        try {
            await logout();
            navigate('/login', { replace: true });
        } finally {
            setIsLoggingOut(false);
        }
    };

    const updateLaborDocuments = (section: keyof UserLaborDocumentProfile, files: Attachment[]) => {
        if (!currentUser || section === 'updatedAt') return;
        setLaborDocuments((prev) => {
            const base = prev || { profiles: {} };
            const profile = base.profiles[currentUser.id] || EMPTY_LABOR_DOCUMENT_PROFILE;
            return {
                ...base,
                profiles: {
                    ...base.profiles,
                    [currentUser.id]: {
                        ...profile,
                        [section]: files,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        });
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
          fixed top-0 left-0 h-screen bg-white shadow-2xl md:shadow-none z-[260] overflow-hidden
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
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/60';

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
                                        <div className="p-2 bg-gradient-to-tr from-teal-700 to-slate-700 rounded-xl shadow-lg">
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
                                        const isActive = item.isActive
                                            ? item.isActive(location.pathname, location.search)
                                            : item.path
                                                ? location.pathname === item.path
                                                : false;
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
                                                        ? 'bg-gradient-to-r from-teal-700 via-teal-700 to-slate-700 text-white shadow-md'
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
                                        <div
                                            className={`w-full flex items-center gap-2 p-2 rounded-xl border transition-all duration-200 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-100 dark:border-gray-700 hover:border-blue-200 hover:shadow-md`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowUserMenu(false);
                                                    setShowLaborCard(true);
                                                }}
                                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                                aria-label="Abrir ficha laboral"
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
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowUserMenu(!showUserMenu)}
                                                className="rounded-lg p-1 text-gray-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-700"
                                                aria-label="Abrir menú de usuario"
                                            >
                                                <ChevronDown size={16} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>

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
                                                            disabled={isLoggingOut}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                        >
                                                            <LogOut size={16} />
                                                            {isLoggingOut ? 'Cerrando...' : 'Cerrar sesión'}
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
                    className="hidden md:flex absolute -right-3 top-24 w-6 h-6 bg-white border border-violet-200 rounded-full items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-all duration-200 shadow-sm z-[261]"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </aside >

            <AnimatePresence>
                {showLaborCard && currentUser && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[420] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
                        onClick={() => setShowLaborCard(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 18, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 18, scale: 0.98 }}
                            className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <UserAvatar name={currentUser.name} size="md" />
                                    <div>
                                        <p className="text-lg font-black text-slate-950 dark:text-white">{currentUser.name}</p>
                                        <p className="text-sm font-semibold text-slate-500 dark:text-gray-400">{currentUser.email}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowLaborCard(false)}
                                    className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"
                                    aria-label="Cerrar ficha laboral"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                                    <div className="mb-2 flex items-center gap-2">
                                        <Briefcase size={16} className="text-teal-700" />
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">Contrato de trabajo</h3>
                                    </div>
                                    <FileUploader
                                        folderPath={`user-labor-documents/${currentUser.id}/contract`}
                                        existingFiles={currentLaborProfile.contract}
                                        onUploadComplete={(files) => updateLaborDocuments('contract', files)}
                                        compact
                                        maxSizeMB={20}
                                    />
                                </section>

                                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                                    <div className="mb-2 flex items-center gap-2">
                                        <CalendarClock size={16} className="text-teal-700" />
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">Citas médicas empresa</h3>
                                    </div>
                                    <FileUploader
                                        folderPath={`user-labor-documents/${currentUser.id}/medical`}
                                        existingFiles={currentLaborProfile.medical}
                                        onUploadComplete={(files) => updateLaborDocuments('medical', files)}
                                        compact
                                        maxSizeMB={20}
                                    />
                                </section>

                                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                                    <div className="mb-2 flex items-center gap-2">
                                        <FileText size={16} className="text-teal-700" />
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">Nóminas y comprobantes</h3>
                                    </div>
                                    <FileUploader
                                        folderPath={`user-labor-documents/${currentUser.id}/payroll`}
                                        existingFiles={currentLaborProfile.payroll}
                                        onUploadComplete={(files) => updateLaborDocuments('payroll', files)}
                                        compact
                                        maxSizeMB={20}
                                    />
                                </section>

                                <section className="rounded-2xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-900/60 dark:bg-teal-950/30">
                                    <div className="mb-3 flex items-center gap-2">
                                        <Clock size={16} className="text-teal-700" />
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">Resumen jornada del mes</h3>
                                    </div>
                                    <div className="rounded-2xl bg-white p-4 text-center shadow-sm dark:bg-gray-900">
                                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Horas registradas</p>
                                        <p className="mt-1 text-3xl font-black text-teal-700">{formatHours(monthHours)}</p>
                                        <p className="mt-2 text-xs font-semibold text-slate-500">
                                            {currentMonthStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                                        </p>
                                    </div>
                                </section>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </>
    );
}

export default Sidebar;
