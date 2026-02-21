import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ChangePasswordModal from './ChangePasswordModal';
import NotificationsModal from './NotificationsModal';
import SearchPalette from './SearchPalette';
import { CaffeineOverlay } from './CaffeineOverlay';

import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { useTodos } from '../hooks/useTodos';
import { useTimeData } from '../hooks/useTimeData';
import { StormOverlay } from './StormOverlay';
import { TeamHeartbeat } from './TeamHeartbeat';
import { useDailyStatus } from '../hooks/useDailyStatus';
import { toDateKey } from '../utils/dateUtils';
import { useNotificationsContext } from '../context/NotificationsContext';
import { useDailyTeamGreeting } from '../hooks/useDailyTeamGreeting';
import GlobalSuccessToast from './GlobalSuccessToast';

/**
 * Main layout component
 * Provides responsive layout with sidebar and header
 */
function Layout() {
    const { currentUser } = useAuth();
    useRealtime(currentUser);
    useDailyTeamGreeting(currentUser);
    const { todos } = useTodos(currentUser);
    const { timeData } = useTimeData();
    const { dailyStatuses } = useDailyStatus(currentUser);
    const { notifications } = useNotificationsContext();
    const navigate = useNavigate();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showNotificationsModal, setShowNotificationsModal] = useState(false);
    const [pendingCaffeine, setPendingCaffeine] = useState<Array<{ id: number; senderName: string }>>([]);
    const [activeCaffeine, setActiveCaffeine] = useState<{ id: number; senderName: string } | null>(null);

    const timeOfDay = React.useMemo(() => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 11) return 'sunrise';
        if (hour >= 11 && hour < 18) return 'day';
        if (hour >= 18 && hour < 21) return 'sunset';
        return 'night';
    }, []);



    React.useEffect(() => {
        document.documentElement.setAttribute('data-time', timeOfDay);

        // Automatically activate dark mode at night
        if (timeOfDay === 'night') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [timeOfDay]);

    React.useEffect(() => {
        const openNotifications = () => setShowNotificationsModal(true);
        window.addEventListener('open-notifications-modal', openNotifications);
        return () => window.removeEventListener('open-notifications-modal', openNotifications);
    }, []);

    React.useEffect(() => {
        if (!currentUser) return;
        const storageKey = `caffeine-overlay-seen:${currentUser.id}`;
        const saved = localStorage.getItem(storageKey);
        let parsed: number[] = [];
        try {
            parsed = saved ? JSON.parse(saved) : [];
        } catch {
            parsed = [];
        }
        const seenIds = new Set<number>(parsed);

        const newlyDetected = notifications
            .filter((n) => !n.read && n.type === 'recognition' && !seenIds.has(n.id))
            .map((n) => {
                const match = (n.message || '').match(/^(.+?)\s+reconoce tu esfuerzo/i);
                return {
                    id: n.id,
                    senderName: match?.[1] || 'Tu equipo',
                };
            });

        if (newlyDetected.length === 0) return;

        newlyDetected.forEach((n) => seenIds.add(n.id));
        localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIds)));
        setPendingCaffeine((prev) => [...prev, ...newlyDetected]);
    }, [notifications, currentUser]);

    React.useEffect(() => {
        if (activeCaffeine || pendingCaffeine.length === 0) return;
        const [next, ...rest] = pendingCaffeine;
        setActiveCaffeine(next);
        setPendingCaffeine(rest);
    }, [pendingCaffeine, activeCaffeine]);

    // Calculate if storm mode should be active and which tasks trigger it
    const { isStormActive, shockedTasks } = React.useMemo(() => {
        if (!currentUser || !todos) return { isStormActive: false, shockedTasks: [] };

        // Storm is active if I have a task assigned to me that I haven't completed AND I've been 'shocked' for it
        const tasks = todos.filter(t => {
            const isAssigned = (t.assigned_to || []).includes(currentUser.id);
            const isCompleted = (t.completed_by || []).includes(currentUser.id);
            const isShocked = (t.shocked_users || []).includes(currentUser.id);
            return isAssigned && !isCompleted && isShocked;
        });

        const active = tasks.length > 0;

        if (active) {
            console.log('⚡ STORM MODE ACTIVATED for user:', currentUser.id);
        }

        return { isStormActive: active, shockedTasks: tasks };
    }, [currentUser, todos]);

    const activeUsers = React.useMemo(() => {
        const todayKey = toDateKey(new Date());
        const todayData = timeData[todayKey] || {};
        return Object.keys(todayData).filter(userId => {
            const entries = todayData[userId] || [];
            return entries.some(e => e.entry && !e.exit);
        });
    }, [timeData]);

    const handleMenuToggle = () => {
        setSidebarOpen(!sidebarOpen);
    };

    const handleCloseSidebar = () => {
        setSidebarOpen(false);
    };

    const handleToggleCollapse = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    const handleTaskClick = (taskId: number) => {
        navigate(`/tasks?task=${taskId}`);
    };

    return (
        <StormOverlay
            isActive={isStormActive}
            shockedTasks={shockedTasks}
            onTaskClick={handleTaskClick}
        >
            <div className="h-screen flex relative overflow-hidden bg-bg dark:text-gray-100 transition-colors duration-500">
                {/* Sidebar */}
                <Sidebar
                    isOpen={sidebarOpen}
                    onClose={handleCloseSidebar}
                    isCollapsed={sidebarCollapsed}
                    onToggleCollapse={handleToggleCollapse}
                    onOpenPasswordModal={() => setShowPasswordModal(true)}
                    onOpenNotificationsModal={() => setShowNotificationsModal(true)}
                />

                {/* Main content area */}
                <div
                    className={`
                        flex-1 flex flex-col min-w-0
                        transition-all duration-300
                        ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}
                    `}
                >
                    <Header onMenuToggle={handleMenuToggle} />

                    {/* Page content */}
                    <main className="flex-1 p-4 md:p-8 overflow-y-auto relative z-10">
                        <Outlet />
                    </main>
                </div>

                {/* Modals */}
                <ChangePasswordModal
                    isOpen={showPasswordModal}
                    onClose={() => setShowPasswordModal(false)}
                />

                <NotificationsModal
                    isOpen={showNotificationsModal}
                    onClose={() => setShowNotificationsModal(false)}
                />

                <SearchPalette />

                {activeCaffeine && (
                    <CaffeineOverlay
                        senderName={activeCaffeine.senderName}
                        onComplete={() => setActiveCaffeine(null)}
                    />
                )}

                <GlobalSuccessToast />
            </div>
        </StormOverlay>
    );
}

export default Layout;
