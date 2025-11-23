import React from 'react';

/**
 * Reusable User Avatar component
 * Generates a DiceBear avatar based on the user's name
 */
interface UserAvatarProps {
    name?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export function UserAvatar({ name, size = 'md', className = '' }: UserAvatarProps) {
    const seed = encodeURIComponent(name || 'User');
    const avatarUrl = `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;

    const sizes = {
        xs: 'w-6 h-6 text-xs',
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
        xl: 'w-16 h-16 text-xl'
    };

    const sizeClass = sizes[size] || sizes.md;

    return (
        <img
            src={avatarUrl}
            alt={`${name}'s avatar`}
            className={`rounded-full bg-white border border-border shadow-sm object-cover shrink-0 ${sizeClass} ${className}`}
        />
    );
}
