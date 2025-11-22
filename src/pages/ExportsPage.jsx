import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GlobalExportPanel from '../components/GlobalExportPanel';

/**
 * Exports page
 * Global exports and shared folders (Thalia only)
 */
function ExportsPage() {
    const { currentUser } = useAuth();

    // Only Admins can access this page
    if (!currentUser?.isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="max-w-6xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Exportaciones</h1>
                <p className="text-[#666]">Exporta datos y accede a carpetas compartidas</p>
            </div>

            <div className="space-y-4">
                {/* Global export panel */}
                <GlobalExportPanel />
            </div>
        </div>
    );
}

export default ExportsPage;
