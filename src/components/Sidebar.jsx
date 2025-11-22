import React from 'react';
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
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import { DRIVE_FOLDERS } from '../constants';

/**
 * Sidebar navigation component
 * Responsive sidebar with collapse/expand functionality
 * Mobile: Overlay mode with backdrop
 * Desktop: Persistent sidebar with collapse toggle
 */
function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const isThalia = currentUser?.id === 'thalia';
    const isAdmin = currentUser?.isAdmin;
    const canAdminHours = currentUser?.canAdminHours;

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
            label: 'Reuniones',
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

    const handleNavigation = (path) => {
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
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 h-full bg-card border-r-2 border-border z-50
          transition-all duration-300 ease-in-out flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-16' : 'md:w-60'}
          w-60
        `}
            >
                {/* Logo area */}
                <div className="p-4 flex items-center justify-center border-b-2 border-border h-16">
                    <img
                        src="/logo.png"
                        alt="Solaris Logo"
                        className={`${isCollapsed ? 'h-8 w-8' : 'h-10 w-auto'} object-contain transition-all duration-300`}
                    />
                </div>

                {/* Navigation items */}
                <nav className="flex-1 p-2 overflow-y-auto">
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
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1
                    transition-colors duration-200
                    ${isActive
                                            ? 'bg-primary text-white border-2 border-border'
                                            : 'hover:bg-[#fff8ee] border-2 border-transparent'
                                        }
                                    ${isCollapsed ? 'justify-center' : ''}
                  `}
                                    title={isCollapsed ? item.label : ''}
                                >
                                    <Icon size={20} />
                                    {!isCollapsed && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">{item.label}</span>
                                            {item.isAdminItem && (
                                                <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 font-bold flex items-center gap-1">
                                                    ADMIN
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                </nav>

                {/* User Info, Notifications, Logout */}
                <div className="p-3 border-t-2 border-border bg-card">
                    {!isCollapsed ? (
                        <div className="space-y-3">
                            {/* User Profile & Badges */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center font-extrabold bg-[radial-gradient(circle_at_top,#fff2cc,#ffb347)] text-sm shrink-0 shadow-sm">
                                    {currentUser?.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold truncate text-gray-800">{currentUser?.name}</p>
                                        {/* Role Badges */}
                                        <div className="flex gap-1">
                                            {isAdmin && (
                                                <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded-md border border-amber-200 font-bold tracking-wider">
                                                    ADMIN
                                                </span>
                                            )}
                                            {currentUser?.isTrainingManager && (
                                                <span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded-md border border-blue-200 font-bold tracking-wider">
                                                    FORMACIÓN
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate font-medium">{currentUser?.email}</p>
                                </div>
                            </div>

                            {/* Actions Stack */}
                            <div className="space-y-2 pt-2">
                                <div className="w-full">
                                    <NotificationBell placement="top-right" fullWidth />
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-center gap-2 p-2 rounded-xl hover:bg-red-50 text-red-600 border-2 border-transparent hover:border-red-100 transition-all duration-200 group"
                                    title="Cerrar sesión"
                                >
                                    <LogOut size={18} className="group-hover:scale-110 transition-transform" />
                                    <span className="text-xs font-bold">Cerrar sesión</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            {/* Collapsed View */}
                            <div className="w-8 h-8 rounded-full border-2 border-border flex items-center justify-center font-extrabold bg-[radial-gradient(circle_at_top,#fff2cc,#ffb347)] text-xs">
                                {currentUser?.name?.charAt(0).toUpperCase()}
                            </div>

                            <div className="relative">
                                {/* Simplified notification dot for collapsed state could be added here, 
                                    but for now just the bell icon if we want, or rely on the expanded view. 
                                    Actually, let's show the bell icon. */}
                                <NotificationBell placement="top-right" />
                                {/* Note: NotificationBell text might be too wide for collapsed sidebar. 
                                    We might need to adjust NotificationBell to be icon-only if collapsed, 
                                    but I didn't add that prop. Let's just show the avatar and logout for now 
                                    to keep it simple, or maybe just the avatar. 
                                    The user asked to "move logout and user info together and add notifications".
                                    In collapsed mode, space is tight. 
                                    Let's just show the logout button.
                                */}
                            </div>

                            <button
                                onClick={handleLogout}
                                className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors duration-200"
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
                    className="hidden md:flex absolute -right-3 top-20 w-6 h-6 bg-card border-2 border-border rounded-full items-center justify-center hover:bg-primary hover:text-white transition-colors duration-200"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </aside>
        </>
    );
}

export default Sidebar;
