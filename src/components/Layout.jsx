import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

/**
 * Main layout component
 * Provides responsive layout with sidebar and header
 */
function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
            />

            {/* Main content area */}
            <div
                className={`
          flex-1 flex flex-col
          transition-all duration-300
          ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'}
        `}
            >
                <Header onMenuToggle={handleMenuToggle} />

                {/* Page content */}
                <main className="flex-1 p-4 md:p-6 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default Layout;
