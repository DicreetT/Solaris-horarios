import React from 'react';

/**
 * Reusable User Avatar component
 * Generates a DiceBear avatar based on the user's name
 */
export function UserAvatar({ name, size = 'sm', className = '' }) {
    const seed = encodeURIComponent(name || 'User');
    const avatarUrl = `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;

    const sizeClasses = {
        xs: 'w-5 h-5',
        sm: 'w-8 h-8',
        md: 'w-10 h-10',
        lg: 'w-12 h-12',
        xl: 'w-16 h-16'
    };

    return (
        <img
            src={avatarUrl}
            alt={`${name}'s avatar`}
            className={`rounded-full bg-white border border-border shadow-sm object-cover shrink-0 ${sizeClasses[size]} ${className}`}
        />
    );
}
