export function getStatusBadgeProps(status) {
    if (status === "absent")
        return { label: "Ausencia", className: "bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]" };
    if (status === "vacation")
        return { label: "Vacaciones", className: "bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]" };
    if (status === "vacation-request")
        return { label: "Vacaciones (pendiente)", className: "bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]" };
    if (status === "present")
        return { label: "Presente", className: "bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]" };
    return null;
}
