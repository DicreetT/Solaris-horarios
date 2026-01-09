import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Calendar,
    CheckSquare,
    Users,
    UserX,
    GraduationCap,
    Clock,
    FileText,
    Folder,
    LogOut,
    Lock,
    Bell,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ShoppingBag,
    ClipboardCheck
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { RoleBadge } from './RoleBadge';
import NotificationBell from './NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useNotificationsContext } from '../context/NotificationsContext';
import { useShoppingList } from '../hooks/useShoppingList';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useAbsences } from '../hooks/useAbsences';
import { useTraining } from '../hooks/useTraining';
import { DRIVE_FOLDERS, ESTEBAN_ID } from '../constants';

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
    const { notifications } = useNotificationsContext();

    // Data hooks for badges
    const { shoppingItems } = useShoppingList(currentUser);
    const { todos } = useTodos(currentUser);
    const { meetingRequests } = useMeetings(currentUser);
    const { absenceRequests } = useAbsences(currentUser);
    const { trainingRequests } = useTraining(currentUser);

    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef(null);

    const isAdmin = currentUser?.isAdmin;
    const isTrainingManager = currentUser?.isTrainingManager;
    const unreadCount = notifications.filter((n) => !n.read).length;

    // --- BADGE CALCULATIONS ---

    // 1. Tasks: Assigned to me AND incomplete
    const pendingTasksCount = todos.filter(t =>
        t.assigned_to?.includes(currentUser?.id || '') &&
        !t.completed_by?.includes(currentUser?.id || '')
    ).length;

    // 2. Meetings: I am a participant AND status is not rejected (pending or scheduled)
    // Note: You might want to filter only future meetings or pending ones. 
    // For now, "active" implies not rejected.
    const activeMeetingsCount = meetingRequests.filter(m =>
        m.participants?.includes(currentUser?.id || '') &&
        m.status !== 'rejected' &&
        m.status !== 'completed'
    ).length;

    // 3. Absences:
    // If Admin: All pending requests.
    // If User: My pending requests.
    // Note: useAbsences hook already filters non-admin data to (my requests OR approved).
    // So for non-admin, just filtering 'pending' should only show my pending ones (since approved aren't pending).
    const pendingAbsencesCount = absenceRequests.filter(a => a.status === 'pending').length;

    // 4. Trainings:
    // If Training Manager: All pending requests.
    // If User: My pending requests. (Hook returns all for manager, filtered for user usually? 
    // Let's check hook: useTraining seems to return ALL for everyone? No, allowed to filter?
    // Looking at useTraining: "const { data, error } = await supabase.from('training_requests').select('*');" -> It fetches ALL.
    // So we must filter by user if not manager.
    const pendingTrainingsCount = trainingRequests.filter(t => {
        if (t.status !== 'pending') return false;
        if (isTrainingManager) return true; // Manager sees all pending
        return t.user_id === currentUser?.id; // User sees only theirs
    }).length;

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

    const navigationItems = [
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
            show: true
        },
        {
            path: '/meetings',
            label: 'Reuniones/Sugerencias',
            icon: Users,
            show: true
        },
        {
            path: '/absences',
            label: 'Ausencias',
            icon: UserX,
            show: true
        },
        {
            path: '/trainings',
            label: 'Formaciones',
            icon: GraduationCap,
            show: true
        },
        {
            path: '/time-tracking',
            label: 'Registro Horario',
            icon: Clock,
            show: true
        },
        {
            path: '/checklist',
            label: 'Check-list Diario',
            icon: ClipboardCheck,
            show: true
        },
        {
            path: '/shopping',
            label: 'Lista de Compras',
            icon: ShoppingBag,
            show: true
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
          fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50
          transition-all duration-300 ease-in-out flex flex-col shadow-2xl md:shadow-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-20' : 'md:w-64'}
          w-64
        `}
            >
                {/* Logo area */}
                <div className="h-20 flex items-center justify-center border-b border-gray-100">
                    <div className={`flex items-center transition-all duration-300 ${isCollapsed ? 'scale-90' : ''}`}>
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
                            <img
                                src="/logo_text_trans.png"
                                alt="Lunaris Logo"
                                className="h-20 w-auto relative z-10 object-contain"
                            />
                        </div>
                    </div>
                </div>

                {/* Navigation items */}
                <nav className="flex-1 p-4 overflow-y-auto space-y-1">
                    {navigationItems
                        .filter(item => item.show)
                        .map(item => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;

                            return (
                                <button
                                    key={item.path}
                                    onClick={() => handleNavigation(item.path)}
                                    className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-xl
                    transition-all duration-200 group relative overflow-hidden
                    ${isActive
                                            ? 'bg-primary text-white shadow-lg shadow-primary/25'
                                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                        }
                                    ${isCollapsed ? 'justify-center px-2' : ''}
                  `}
                                    title={isCollapsed ? item.label : ''}
                                >
                                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                    {!isCollapsed && (
                                        <div className="flex items-center gap-2 flex-1">
                                            <span className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                                            {item.isAdminItem && <RoleBadge role="admin" size="xs" />}

                                            {/* Badges */}
                                            {item.path === '/tasks' && pendingTasksCount > 0 && (
                                                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm">
                                                    {pendingTasksCount}
                                                </span>
                                            )}
                                            {item.path === '/meetings' && activeMeetingsCount > 0 && (
                                                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm">
                                                    {activeMeetingsCount}
                                                </span>
                                            )}
                                            {item.path === '/absences' && pendingAbsencesCount > 0 && (
                                                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm">
                                                    {pendingAbsencesCount}
                                                </span>
                                            )}
                                            {item.path === '/trainings' && pendingTrainingsCount > 0 && (
                                                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm">
                                                    {pendingTrainingsCount}
                                                </span>
                                            )}
                                            {item.path === '/shopping' && pendingShoppingCount > 0 && (
                                                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm">
                                                    {pendingShoppingCount}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {isCollapsed && (
                                        <>
                                            {item.path === '/tasks' && pendingTasksCount > 0 && (
                                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></div>
                                            )}
                                            {item.path === '/meetings' && activeMeetingsCount > 0 && (
                                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></div>
                                            )}
                                            {item.path === '/absences' && pendingAbsencesCount > 0 && (
                                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></div>
                                            )}
                                            {item.path === '/trainings' && pendingTrainingsCount > 0 && (
                                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></div>
                                            )}
                                            {item.path === '/shopping' && pendingShoppingCount > 0 && (
                                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></div>
                                            )}
                                        </>
                                    )}
                                    {isActive && !isCollapsed && (
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white/20 rounded-l-full" />
                                    )}
                                </button>
                            );
                        })}
                </nav>

                {/* User Info, Notifications, Logout */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    {!isCollapsed ? (
                        <div className="relative" ref={userMenuRef}>
                            {/* User Profile Button */}
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="w-full bg-white rounded-2xl p-3 border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative shrink-0">
                                        <UserAvatar name={currentUser?.name} size="sm" />
                                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                                        {unreadCount > 0 && (
                                            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
                                                {unreadCount}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden text-left">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <p className="text-sm font-bold truncate text-gray-900">{currentUser?.name}</p>
                                            {currentUser?.isAdmin && <RoleBadge role="admin" size="xs" />}
                                            {currentUser?.isTrainingManager && <RoleBadge role="trainingManager" size="xs" />}
                                        </div>
                                        <p className="text-xs text-gray-500 truncate font-medium">{currentUser?.email}</p>
                                    </div>
                                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                                </div>
                            </button>

                            {/* Dropdown Menu */}
                            {showUserMenu && (
                                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="p-2">
                                        <button
                                            onClick={() => {
                                                setShowUserMenu(false);
                                                onOpenNotificationsModal();
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-all group"
                                        >
                                            <div className="relative">
                                                <Bell size={18} className="text-gray-400 group-hover:text-primary" />
                                                {unreadCount > 0 && (
                                                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-2 ring-white">
                                                        {unreadCount}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-sm font-medium flex-1">Notificaciones</span>
                                            {unreadCount > 0 && (
                                                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </button>
                                        <div className="h-px bg-gray-100 my-1"></div>
                                        <button
                                            onClick={() => {
                                                setShowUserMenu(false);
                                                onOpenPasswordModal();
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-all group"
                                        >
                                            <Lock size={18} className="text-gray-400 group-hover:text-primary" />
                                            <span className="text-sm font-medium">Cambiar contraseña</span>
                                        </button>
                                        <div className="h-px bg-gray-100 my-1"></div>
                                        <button
                                            onClick={() => {
                                                setShowUserMenu(false);
                                                handleLogout();
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 text-gray-700 hover:text-red-600 transition-all group"
                                        >
                                            <LogOut size={18} className="text-gray-400 group-hover:text-red-600" />
                                            <span className="text-sm font-medium">Cerrar sesión</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <UserAvatar name={currentUser?.name} size="sm" />
                            <div className="w-8 h-px bg-gray-200" />
                            <NotificationBell placement="bottom-right" />
                            <button
                                onClick={handleLogout}
                                className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors duration-200"
                                title="Cerrar sesión"
                            >
                                <LogOut size={20} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Desktop collapse toggle */}
                <button
                    onClick={onToggleCollapse}
                    className="hidden md:flex absolute -right-3 top-24 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-all duration-200 shadow-sm z-50"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </aside>
        </>
    );
}

export default Sidebar;
