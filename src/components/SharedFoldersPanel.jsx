import React from 'react';
import { DRIVE_FOLDERS } from '../constants';

/**
 * Panel de carpetas compartidas (Drive) con notificaciones internas
 * Tabla: folder_updates
 * Campos: id, folder_id, author, at (timestamp)
 */
export default function SharedFoldersPanel({
    currentUser,
    folderUpdates,
    onOpenFolder,
    onMarkFolderUpdated,
}) {
    const foldersForUser = DRIVE_FOLDERS.filter((f) =>
        f.users.includes(currentUser.id)
    );

    if (foldersForUser.length === 0) return null;

    return (
        <div className="rounded-xl border border-dashed border-[#bbb] p-2 mt-2 bg-[#fffdf6] text-xs">
            <strong>Carpetas compartidas</strong>
            <p className="text-xs text-[#666]">
                Accesos directos a las carpetas de Google Drive relacionadas con tu
                trabajo. El puntito indica que alguien marcó que hay algo nuevo. 🔔
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
                {foldersForUser.map((folder) => {
                    const auth = folderUpdates[folder.id]?.author || null;
                    const hasUpdate = !!folderUpdates[folder.id];
                    return (
                        <div
                            key={folder.id}
                            className="flex items-center gap-1"
                        >
                            <button
                                type="button"
                                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                                onClick={() => onOpenFolder(folder)}
                            >
                                <span className="mr-1">{folder.emoji}</span>
                                {folder.label}
                                {hasUpdate && (
                                    <span
                                        className="inline-block w-2 h-2 rounded-full bg-[#a855f7] ml-1.5"
                                    />
                                )}
                            </button>
                            {hasUpdate && (
                                <span className="text-xs text-[#666]">
                                    (Marcado como nuevo
                                    {auth ? ` por ${auth}` : ""})
                                </span>
                            )}
                            {currentUser.id === "thalia" && (
                                <button
                                    type="button"
                                    className="rounded-full border-2 border-border px-1.5 py-0.5 text-[0.65rem] font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1"
                                    title="Marcar / desmarcar novedades"
                                    onClick={() => onMarkFolderUpdated(folder.id)}
                                >
                                    {hasUpdate ? "✓" : "★"}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
