import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GlobalExportPanel from '../components/GlobalExportPanel';
import { Download } from 'lucide-react';

/**
 * Exports page
 * Global exports and shared folders (Admin only)
 */
function ExportsPage() {
    const { currentUser } = useAuth();

    // Only Admins can access this page
    if (!currentUser?.isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-amber-600">
                        <Download size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Exportaciones
                        </h1>
                        <p className="text-gray-500 font-medium">
                            Exporta datos y accede a carpetas compartidas
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {/* Global export panel */}
                <GlobalExportPanel />
            </div>
        </div>
    );
}

export default ExportsPage;
