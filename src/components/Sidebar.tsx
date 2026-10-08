import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    AlertCircle,
    AtSign,
    CheckSquare,
    BookOpen,
    BriefcaseBusiness,
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
    ClipboardCheck,
    FolderKanban,
    Inbox,
    MessageSquareText,
    PanelsTopLeft,
    ReceiptText,
    Search,
    Boxes,
    ShieldCheck,
    ShoppingCart,
    Tags,
    Truck,
    Users,
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
import { USERS } from '../constants';
import { toDateKey } from '../utils/dateUtils';
import { calculateHours, formatHours } from '../utils/timeUtils';
import { downloadUserManualPdf } from '../utils/userManualPdf';

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

type RoleSidebarItem = {
    label: string;
    icon: any;
    path?: string;
    isActive?: (pathname: string, search: string) => boolean;
};

const commonRoleItems: RoleSidebarItem[] = [
    { path: '/inicio-roles', label: 'Mi espacio', icon: PanelsTopLeft },
    { path: '/checklist', label: 'Checklist diario', icon: ClipboardCheck },
    { path: '/tasks', label: 'Tareas', icon: CheckSquare },
    { path: '/mentions', label: 'Menciones para mí', icon: AtSign },
    { path: '/projects', label: 'Proyectos', icon: FolderKanban },
    { path: '/avisos', label: 'Avisos', icon: Bell },
    { path: '/calendar', label: 'Calendario', icon: CalendarClock },
    { path: '/time-tracking', label: 'Mi jornada', icon: Clock },
    { path: '/absences', label: 'Solicitudes', icon: Inbox },
    {
        path: '/inventory?view=canet&tab=control_stock',
        label: 'Control de stock',
        icon: Boxes,
        isActive: (pathname, search) => pathname === '/inventory' && new URLSearchParams(search).get('tab') === 'control_stock',
    },
    { path: '/operaciones-fer?view=solicitud-apoyo', label: 'Solicitud de apoyo', icon: Users },
    { path: '/folders', label: 'Documentos y recursos', icon: FileText },
];

const fallbackRoleItems: RoleSidebarItem[] = commonRoleItems;

const roleSpecificSidebarItemsByUser: Record<string, RoleSidebarItem[]> = {
    thalia: [
        { path: '/finanzas-operativas?view=promociones', label: 'Cupones y descuentos', icon: Tags },
        { path: '/finanzas-operativas?view=informes', label: 'Informes', icon: FileText },
        { path: '/formacion-ventas?view=direction', label: 'Formación', icon: BookOpen },
        { path: '/dossier-trazabilidad', label: 'Trazabilidad', icon: ShieldCheck },
        { path: '/facturacion', label: 'Facturación a pagar', icon: ReceiptText },
    ],
    itzi: [
        { path: '/finanzas-operativas?view=promociones', label: 'Cupones y descuentos', icon: Tags },
        { path: '/despachos', label: 'Despachos', icon: Truck },
        { path: '/control-operativo', label: 'Control operativo', icon: ClipboardCheck },
        { path: '/eventos-inventario', label: 'Evento inventario', icon: CalendarClock },
        { path: '/formacion-ventas?view=commercial', label: 'Cuaderno comercial', icon: MessageSquareText },
        { path: '/formacion-ventas?view=faqs', label: 'Preguntas frecuentes', icon: BookOpen },
        { path: '/finanzas-operativas?view=informes', label: 'Informes', icon: FileText },
        { path: '/projects', label: 'Crear proyecto', icon: FolderKanban },
    ],
    anabella: [
        { path: '/finanzas-operativas?view=promociones', label: 'Cupones y descuentos', icon: Tags },
        {
            path: '/inventory?view=canet',
            label: 'Stock',
            icon: Boxes,
            isActive: (pathname, search) => {
                const params = new URLSearchParams(search);
                return pathname === '/inventory' && params.get('view') === 'canet' && !params.get('tab');
            },
        },
        { path: '/control-operativo', label: 'Control operativo', icon: ClipboardCheck },
        { path: '/albaranes', label: 'Incidencias producto/lote', icon: AlertCircle },
        { path: '/despachos', label: 'Despachos', icon: Truck },
        { path: '/eventos-inventario', label: 'Evento diario inventario', icon: CalendarClock },
        { path: '/shopping', label: 'Compras', icon: ShoppingCart },
        { path: '/finanzas-operativas?view=informes', label: 'Informes', icon: FileText },
    ],
    heidy: [
        { path: '/finanzas-operativas?view=promociones', label: 'Cupones y descuentos', icon: Tags },
        { path: '/control-operativo', label: 'Control operativo', icon: ClipboardCheck },
        { path: '/eventos-inventario', label: 'Evento inventario', icon: CalendarClock },
        { path: '/facturacion', label: 'Facturación', icon: ReceiptText },
        { path: '/shopping', label: 'Compras', icon: ShoppingCart },
        { path: '/finanzas-operativas?view=informes', label: 'Informes', icon: FileText },
        { path: '/finanzas-operativas?view=costes', label: 'Proyectos costes', icon: BriefcaseBusiness },
    ],
    esteban: [
        { path: '/finanzas-operativas?view=promociones', label: 'Cupones y descuentos', icon: Tags },
        { path: '/projects', label: 'Proyectos', icon: FolderKanban },
        { path: '/operaciones-fer', label: 'Operaciones', icon: BriefcaseBusiness },
        { path: '/operaciones-fer?view=solicitud-apoyo', label: 'Solicitud de apoyo', icon: Users },
        { path: '/finanzas-operativas?view=informes', label: 'Informes', icon: FileText },
        { path: '/facturacion', label: 'Facturación', icon: ReceiptText },
        { path: '/formacion-ventas?view=active', label: 'Formaciones activas', icon: BookOpen },
    ],
    fer: [
        { path: '/finanzas-operativas?view=promociones', label: 'Cupones y descuentos', icon: Tags },
        { path: '/finanzas-operativas?view=informes', label: 'Informes', icon: FileText },
        { path: '/eventos-inventario', label: 'Evento diario inventario', icon: CalendarClock },
        { path: '/operaciones-fer?view=entregables', label: 'Entregables', icon: ClipboardCheck },
        { path: '/operaciones-fer?view=jornada', label: 'Jornada semanal', icon: CalendarClock },
    ],
};

const previewRoleToUserKey: Record<string, string> = {
    direction: 'thalia',
    sales: 'itzi',
    warehouse: 'anabella',
    finance: 'heidy',
    operations: 'esteban',
    support: 'fer',
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
    const [previewRoleKey, setPreviewRoleKey] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return window.localStorage.getItem('lunaris_role_preview');
    });
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

    const currentUserKey = (currentUser?.name || '').trim().toLowerCase();
    const effectiveUserKey = currentUser?.isAdmin && previewRoleKey
        ? previewRoleToUserKey[previewRoleKey] || currentUserKey
        : currentUserKey;
    const effectiveSidebarUser = USERS.find((user) => user.name.trim().toLowerCase() === effectiveUserKey);
    const effectiveSidebarUserId = effectiveSidebarUser?.id || currentUser?.id || '';
    const pendingTasksCount = todos.filter(t =>
        t.assigned_to?.includes(effectiveSidebarUserId) &&
        !t.completed_by?.includes(effectiveSidebarUserId)
    ).length;
    const areaNavigationItems = roleSpecificSidebarItemsByUser[effectiveUserKey] || [];
    const roleNavigationItems = (roleSpecificSidebarItemsByUser[effectiveUserKey] ? commonRoleItems : fallbackRoleItems)
        .filter((item) => (
            effectiveUserKey !== 'esteban'
            || !['Proyectos', 'Solicitud de apoyo'].includes(item.label)
        ))
        .map((item) => {
            if (item.label === 'Mi jornada' && effectiveUserKey) {
                return { ...item, path: `/time-tracking?user=${effectiveUserKey}` };
            }
            if (item.label === 'Solicitud de apoyo' && effectiveUserKey === 'fer') {
                return { ...item, label: 'Mis solicitudes' };
            }
            return item;
        });

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

    useEffect(() => {
        const handlePreviewRoleChange = () => {
            setPreviewRoleKey(window.localStorage.getItem('lunaris_role_preview'));
        };
        window.addEventListener('storage', handlePreviewRoleChange);
        window.addEventListener('lunaris-role-preview-change', handlePreviewRoleChange);
        return () => {
            window.removeEventListener('storage', handlePreviewRoleChange);
            window.removeEventListener('lunaris-role-preview-change', handlePreviewRoleChange);
        };
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
    ];

    const closeSidebarOnMobile = () => {
        if (window.innerWidth < 768) {
            onClose();
        }
    };

    const navigateSidebarItem = (path?: string) => {
        if (!path) return;
        navigate(path);
        closeSidebarOnMobile();
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

    const handleDownloadUserManual = () => {
        const manualUserName = effectiveSidebarUser?.name || currentUser?.name || 'Usuario';
        const uniqueAreaItems = Array.from(new Set(areaNavigationItems.map((item) => item.label)));
        downloadUserManualPdf({
            userKey: effectiveUserKey,
            userName: manualUserName,
            areaItems: uniqueAreaItems,
        });
        setShowUserMenu(false);
    };

    return (
        <>
            {/* Mobile backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-[890] md:hidden backdrop-blur-sm"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 h-screen bg-white shadow-2xl md:shadow-none z-[900] overflow-hidden
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
                                                type="button"
                                                key={item.label}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    if (item.onClick) item.onClick();
                                                    if (item.path) {
                                                        navigate(item.path);
                                                        closeSidebarOnMobile();
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

                                    {!isCollapsed && (
                                        <div className="px-3 py-2">
                                            <div className="h-px bg-slate-200/80 dark:bg-slate-700/70" />
                                        </div>
                                    )}

                                    {roleNavigationItems.map((item) => {
                                        const itemUrl = item.path ? new URL(item.path, window.location.origin) : null;
                                        const isActive = item.isActive
                                            ? item.isActive(location.pathname, location.search)
                                            : itemUrl
                                                ? location.pathname === itemUrl.pathname
                                                    && (itemUrl.search ? location.search === itemUrl.search : !location.search)
                                                : false;
                                        const roleBadge = item.label === 'Tareas' ? pendingTasksCount : undefined;
                                        return (
                                            <button
                                                type="button"
                                                key={`role-${item.label}`}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    navigateSidebarItem(item.path);
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
                                                        <span className="truncate">{item.label}</span>
                                                        {roleBadge !== undefined && roleBadge > 0 && (
                                                            <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-red-500 text-white text-[10px] font-black rounded-full shadow-sm animate-pulse">
                                                                {roleBadge > 99 ? '99+' : roleBadge}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}

                                    {areaNavigationItems.length > 0 && !isCollapsed && (
                                        <div className="mt-3 px-3 py-4">
                                            <div className="h-px bg-slate-200/80 dark:bg-slate-700/70" />
                                            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                                                Mi área
                                            </p>
                                        </div>
                                    )}

                                    {areaNavigationItems.map((item) => {
                                        const itemUrl = item.path ? new URL(item.path, window.location.origin) : null;
                                        const isActive = item.isActive
                                            ? item.isActive(location.pathname, location.search)
                                            : itemUrl
                                                ? location.pathname === itemUrl.pathname
                                                    && (itemUrl.search ? location.search === itemUrl.search : !location.search)
                                                : false;
                                        return (
                                            <button
                                                type="button"
                                                key={`area-${item.label}`}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    navigateSidebarItem(item.path);
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
                                                        <span className="truncate">{item.label}</span>
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
                                                        <button
                                                            onClick={handleDownloadUserManual}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
                                                        >
                                                            <FileText size={16} />
                                                            Descargar manual
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
                    className="hidden md:flex absolute -right-3 top-24 w-6 h-6 bg-white border border-violet-200 rounded-full items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-all duration-200 shadow-sm z-[901]"
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
