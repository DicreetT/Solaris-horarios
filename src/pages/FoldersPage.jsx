import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useFolderUpdates } from '../hooks/useFolderUpdates';
import { DRIVE_FOLDERS } from '../constants';
import { Folder, ExternalLink, Bell } from 'lucide-react';

function FoldersPage() {
    const { currentUser } = useAuth();
    const { folderUpdates } = useFolderUpdates(currentUser);

    // Filter folders for current user
    const foldersForUser = DRIVE_FOLDERS.filter((f) =>
        f.users.includes(currentUser?.id)
    );

    function handleOpenFolder(folder) {
        window.open(folder.link, "_blank");
    }



    return (
        <div className="max-w-6xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Carpetas Compartidas</h1>
                <p className="text-[#666]">
                    Acceso directo a las carpetas de Google Drive compartidas contigo.
                </p>
            </div>

            {foldersForUser.length === 0 ? (
                <div className="bg-card border-2 border-border rounded-[20px] p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Folder size={32} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-bold mb-2">No tienes carpetas compartidas</h3>
                    <p className="text-[#666]">
                        Actualmente no tienes acceso a ninguna carpeta compartida.
                        <br />
                        Si crees que esto es un error, contacta con administración.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {foldersForUser.map((folder) => {
                        const updateInfo = folderUpdates[folder.id];
                        const hasUpdate = !!updateInfo;
                        const author = updateInfo?.author;

                        return (
                            <div
                                key={folder.id}
                                className="bg-card border-2 border-border rounded-[20px] p-6 shadow-[4px_4px_0_rgba(0,0,0,0.2)] hover:translate-y-[-2px] transition-transform relative group"
                            >
                                {/* Update Indicator Badge */}
                                {hasUpdate && (
                                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full text-xs font-medium border border-purple-200 animate-pulse">
                                        <Bell size={12} fill="currentColor" />
                                        <span>Novedades</span>
                                    </div>
                                )}

                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 bg-[#fff8ee] rounded-xl flex items-center justify-center text-2xl border-2 border-[#ffe0b2]">
                                        {folder.emoji}
                                    </div>

                                    {/* Admin Toggle Action - REMOVED as per request */}
                                </div>

                                <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                                    {folder.label}
                                </h3>

                                {hasUpdate && author && (
                                    <p className="text-xs text-purple-600 mb-4 font-medium">
                                        Marcado por {author}
                                    </p>
                                )}

                                <button
                                    onClick={() => handleOpenFolder(folder)}
                                    className="w-full mt-2 bg-white border-2 border-border text-gray-700 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95"
                                >
                                    <span>Abrir en Drive</span>
                                    <ExternalLink size={16} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default FoldersPage;
