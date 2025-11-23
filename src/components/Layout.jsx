import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ChangePasswordModal from './ChangePasswordModal';
import NotificationsModal from './NotificationsModal';

/**
 * Main layout component
 * Provides responsive layout with sidebar and header
 */
function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showNotificationsModal, setShowNotificationsModal] = useState(false);

    const handleMenuToggle = () => {
        setSidebarOpen(!sidebarOpen);
    };

    const handleCloseSidebar = () => {
        setSidebarOpen(false);
    };

    const handleToggleCollapse = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    return (
        <div className="min-h-screen flex">
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
          flex-1 flex flex-col
          transition-all duration-300
          ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}
        `}
            >
                <Header onMenuToggle={handleMenuToggle} />

                {/* Page content */}
                <main className="flex-1 p-6 md:p-10 overflow-auto">
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
        </div>
    );
}

export default Layout;
