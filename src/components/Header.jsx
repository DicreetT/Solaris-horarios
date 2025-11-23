import React from 'react';
import { Menu } from 'lucide-react';

/**
 * Header component
 * Top bar with logo, user info, and mobile menu toggle
 */
function Header({ onMenuToggle }) {
    return (
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between md:hidden sticky top-0 z-30 shadow-sm">
            {/* Mobile menu button */}
            <button
                onClick={onMenuToggle}
                className="p-2 hover:bg-gray-50 rounded-xl transition-colors duration-200 text-gray-700"
                aria-label="Toggle menu"
            >
                <Menu size={24} />
            </button>

            {/* Logo - only on mobile */}
            <div className="flex items-center gap-3">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
                    <img src="/logo.png" alt="Solaris Logo" className="h-8 w-auto object-contain relative z-10" />
                </div>
            </div>

            {/* Placeholder for spacing */}
            <div className="w-10"></div>
        </header>
    );
}

export default Header;
