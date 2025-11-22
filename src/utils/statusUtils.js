export function getStatusBadgeProps(status) {
    if (status === "absent")
        return { label: "Ausencia", className: "status-absent" };
    if (status === "vacation")
        return { label: "Vacaciones", className: "status-vacation" };
    if (status === "vacation-request")
        return { label: "Vacaciones (pendiente)", className: "status-vacation" };
    if (status === "present")
        return { label: "Presente", className: "status-present" };
    return null;
}
