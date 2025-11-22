import React, { useState } from 'react';
import { USERS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../hooks/useTodos';

export default function AdminDashboard({ onClose }) {
    const { currentUser } = useAuth();
    const { todos } = useTodos(currentUser);

    const [filterUser, setFilterUser] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");

    const filteredTodos = todos.filter((t) => {
        if (filterUser !== "all") {
            const isAssigned = t.assignedTo.includes(filterUser);
            const isCreated = t.createdBy === filterUser;
            if (!isAssigned && !isCreated) return false;
        }
        if (filterStatus === "completed") {
            // Consideramos completada si TODOS los asignados la han completado
            const allDone =
                t.assignedTo.length > 0 &&
                t.assignedTo.every((uid) => t.completedBy.includes(uid));
            if (!allDone) return false;
        }
        if (filterStatus === "pending") {
            const allDone =
                t.assignedTo.length > 0 &&
                t.assignedTo.every((uid) => t.completedBy.includes(uid));
            if (allDone) return false;
        }
        return true;
    });

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
            <div className="bg-card p-6 rounded-[24px] w-[90%] max-w-[800px] shadow-lg border-2 border-border animate-[popIn_0.2s_ease-out]">
                <div className="flex flex-row items-center gap-2 justify-between">
                    <h2 className="text-lg font-bold mb-2">Panel de Administración de Tareas</h2>
                    <button className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <p className="text-sm text-[#444] mb-4 leading-relaxed">
                    Visión global de todas las tareas creadas y su estado.
                </p>

                <div className="flex flex-row items-center gap-2 mb-3">
                    <select
                        className="w-full rounded-[10px] border border-[#ccc] p-2 text-sm font-inherit"
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                    >
                        <option value="all">Todos los usuarios</option>
                        {USERS.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.name}
                            </option>
                        ))}
                    </select>
                    <select
                        className="w-full rounded-[10px] border border-[#ccc] p-2 text-sm font-inherit"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Todos los estados</option>
                        <option value="pending">Pendientes</option>
                        <option value="completed">Completadas</option>
                    </select>
                </div>

                <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                                <th style={{ padding: 8 }}>Tarea</th>
                                <th style={{ padding: 8 }}>Creada por</th>
                                <th style={{ padding: 8 }}>Asignada a</th>
                                <th style={{ padding: 8 }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTodos.map((t) => {
                                const creator = USERS.find((u) => u.id === t.createdBy)?.name || t.createdBy;
                                const assignees = t.assignedTo
                                    .map((uid) => USERS.find((u) => u.id === uid)?.name || uid)
                                    .join(", ");

                                const isCompleted =
                                    t.assignedTo.length > 0 &&
                                    t.assignedTo.every((uid) => t.completedBy.includes(uid));

                                return (
                                    <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                                        <td style={{ padding: 8 }}>
                                            <strong>{t.title}</strong>
                                            {t.description && <div className="text-xs text-[#666]">{t.description}</div>}
                                            {t.dueDateKey && <div className="text-xs text-[#666]">Fecha: {t.dueDateKey}</div>}
                                        </td>
                                        <td style={{ padding: 8 }}>{creator}</td>
                                        <td style={{ padding: 8 }}>{assignees}</td>
                                        <td style={{ padding: 8 }}>
                                            {isCompleted ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[0.7rem] bg-[#dcfce7] text-[#166534]">
                                                    Completada
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[0.7rem] bg-[#fff7ed] text-[#9a3412]">
                                                    Pendiente
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredTodos.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#666" }}>
                                        No hay tareas que coincidan con los filtros.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
