import React from 'react';

/**
 * Reusable User Avatar component
 * Uses themed handcrafted avatars per known user with fallback.
 */
interface UserAvatarProps {
    name?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const normalizeName = (name?: string) =>
    (name || 'user')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const themedAvatarSvg = (name?: string) => {
    const n = normalizeName(name);
    let emoji = '🐾';
    let bgA = '#ddd6fe';
    let bgB = '#a78bfa';

    if (n.includes('esteban')) {
        emoji = '🦁';
        bgA = '#fde68a';
        bgB = '#f59e0b';
    } else if (n.includes('anabela') || n.includes('anabella')) {
        emoji = '🐈‍⬛';
        bgA = '#f3f4f6';
        bgB = '#9ca3af';
    } else if (n.includes('fer')) {
        emoji = '🐸';
        bgA = '#dcfce7';
        bgB = '#22c55e';
    } else if (n.includes('itzi') || n.includes('ichi')) {
        emoji = '🦌';
        bgA = '#fef9c3';
        bgB = '#fde68a';
    } else if (n.includes('thalia')) {
        emoji = '🦋';
        bgA = '#fbcfe8';
        bgB = '#f472b6';
    } else if (n.includes('heidy') || n.includes('heidi')) {
        emoji = '🕊️';
        bgA = '#e0f2fe';
        bgB = '#7dd3fc';
    }

    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
    <clipPath id="clip"><circle cx="40" cy="40" r="39"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="80" height="80" fill="url(#g)" />
    <circle cx="40" cy="40" r="28" fill="#ffffffcc" />
    <text x="40" y="49" text-anchor="middle" font-size="30" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji">${emoji}</text>
  </g>
</svg>`;
};

export function UserAvatar({ name, size = 'md', className = '' }: UserAvatarProps) {
    const avatarSvg = themedAvatarSvg(name);
    const avatarUrl = `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg)}`;

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
            alt={`Avatar de ${name || 'usuario'}`}
            className={`rounded-full bg-white border border-border shadow-sm object-cover shrink-0 ${sizeClass} ${className}`}
        />
    );
}
