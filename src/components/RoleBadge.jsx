import React from 'react';
import { Shield, GraduationCap } from 'lucide-react';

/**
 * RoleBadge component
 * Displays role badges for admin and training manager
 */
export function RoleBadge({ role, size = 'sm', className = '' }) {
    const configs = {
        admin: {
            label: 'ADMIN',
            icon: Shield,
            className: 'bg-amber-100 text-amber-700 border-amber-200'
        },
        trainingManager: {
            label: 'FORMADOR',
            icon: GraduationCap,
            className: 'bg-blue-100 text-blue-700 border-blue-200'
        }
    };

    const config = configs[role];
    if (!config) return null;

    const Icon = config.icon;

    const sizeClasses = {
        xs: 'text-[9px] px-1.5 py-0.5',
        sm: 'text-[10px] px-2 py-0.5',
        md: 'text-xs px-2.5 py-1'
    };

    return (
        <span className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider ${config.className} ${sizeClasses[size]} ${className}`}>
            <Icon size={size === 'xs' ? 10 : size === 'sm' ? 12 : 14} />
            {config.label}
        </span>
    );
}

export default RoleBadge;
