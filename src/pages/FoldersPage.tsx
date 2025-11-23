import React from 'react';
import { useAuth } from '../context/AuthContext';
import { DRIVE_FOLDERS } from '../constants';
import { Folder, ExternalLink } from 'lucide-react';

/**
 * Folders page
 * Shows shared Google Drive folders
 */
function FoldersPage() {
    const { currentUser } = useAuth();

    // Filter folders for current user
    const foldersForUser = DRIVE_FOLDERS.filter((f) =>
        f.users.includes(currentUser?.id)
    );

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-primary">
                        <Folder size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Carpetas Compartidas
                        </h1>
                        <p className="text-gray-500 font-medium">
                            Acceso directo a la documentación y recursos del equipo
                        </p>
                    </div>
                </div>
            </div>

            {/* Folders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {foldersForUser.map((folder) => {
                    return (
                        <a
                            key={folder.id}
                            href={folder.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative bg-white rounded-3xl border-2 border-gray-100 shadow-lg overflow-hidden hover:border-primary/30 hover:shadow-xl transition-all duration-200 flex flex-col"
                        >
                            <div className="p-6 flex-1 flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                                    <span className="text-3xl">{folder.emoji}</span>
                                </div>

                                <h3 className="text-xl font-bold text-gray-900 mb-2">
                                    {folder.label}
                                </h3>

                                <p className="text-gray-500 text-sm leading-relaxed mb-6 font-medium">
                                    {folder.description}
                                </p>

                                <div className="mt-auto flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 px-4 py-2.5 rounded-xl group-hover:bg-primary group-hover:text-white transition-all">
                                    Abrir carpeta <ExternalLink size={16} />
                                </div>
                            </div>
                        </a>
                    );
                })}
            </div>

            {foldersForUser.length === 0 && (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                    <Folder size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">No tienes carpetas compartidas asignadas.</p>
                </div>
            )}
        </div>
    );
}

export default FoldersPage;
