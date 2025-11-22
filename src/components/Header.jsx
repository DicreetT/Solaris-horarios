import React from 'react';
import { Menu } from 'lucide-react';

/**
 * Header component
 * Top bar with logo, user info, and mobile menu toggle
 */
function Header({ onMenuToggle }) {
    return (
        <header className="bg-card border-b-2 border-border px-4 py-3 flex items-center justify-between md:hidden sticky top-0 z-30">
            {/* Mobile menu button */}
            <button
                onClick={onMenuToggle}
                className="p-2 hover:bg-[#fff8ee] rounded-lg transition-colors duration-200"
                aria-label="Toggle menu"
            >
                <Menu size={24} />
            </button>

            {/* Logo and title - only on mobile */}
            <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Solaris Logo" className="h-8 w-auto object-contain" />
            </div>

            {/* Placeholder for spacing or mobile actions if needed */}
            <div className="w-10"></div>
        </header>
    );
}

export default Header;
