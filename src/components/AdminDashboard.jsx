import React, { useState } from 'react';
import { USERS } from '../constants';

export default function AdminDashboard({ todos, onClose }) {
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
        <div className="dialog-backdrop">
            <div className="dialog-paper" style={{ maxWidth: "800px" }}>
                <div className="flex-row">
                    <h2 className="dialog-title">Panel de Administración de Tareas</h2>
                    <button className="btn btn-small btn-ghost" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <p className="dialog-text">
                    Visión global de todas las tareas creadas y su estado.
                </p>

                <div className="flex-row" style={{ marginBottom: 12 }}>
                    <select
                        className="input"
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
                        className="input"
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
                                            {t.description && <div className="small-muted">{t.description}</div>}
                                            {t.dueDateKey && <div className="small-muted">Fecha: {t.dueDateKey}</div>}
                                        </td>
                                        <td style={{ padding: 8 }}>{creator}</td>
                                        <td style={{ padding: 8 }}>{assignees}</td>
                                        <td style={{ padding: 8 }}>
                                            {isCompleted ? (
                                                <span className="tag" style={{ background: "#dcfce7", color: "#166534" }}>
                                                    Completada
                                                </span>
                                            ) : (
                                                <span className="tag" style={{ background: "#fff7ed", color: "#9a3412" }}>
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
