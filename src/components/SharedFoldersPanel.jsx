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
        <div className="panel" style={{ marginTop: 8 }}>
            <strong>Carpetas compartidas</strong>
            <p className="field-note">
                Accesos directos a las carpetas de Google Drive relacionadas con tu
                trabajo. El puntito indica que alguien marcó que hay algo nuevo. 🔔
            </p>
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 6,
                }}
            >
                {foldersForUser.map((folder) => {
                    const auth = folderUpdates[folder.id]?.author || null;
                    const hasUpdate = !!folderUpdates[folder.id];
                    return (
                        <div
                            key={folder.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-small btn-ghost"
                                onClick={() => onOpenFolder(folder)}
                            >
                                <span style={{ marginRight: 4 }}>{folder.emoji}</span>
                                {folder.label}
                                {hasUpdate && (
                                    <span
                                        style={{
                                            display: "inline-block",
                                            width: 8,
                                            height: 8,
                                            borderRadius: "999px",
                                            background: "#a855f7",
                                            marginLeft: 6,
                                        }}
                                    />
                                )}
                            </button>
                            {hasUpdate && (
                                <span className="small-muted">
                                    (Marcado como nuevo
                                    {auth ? ` por ${auth}` : ""})
                                </span>
                            )}
                            {currentUser.id === "thalia" && (
                                <button
                                    type="button"
                                    className="btn btn-tiny btn-ghost"
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
