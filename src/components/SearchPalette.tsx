import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, X, MapPin, CheckSquare, Users, FileText, Boxes } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { useAuth } from '../context/AuthContext';
import { USERS } from '../constants';

const SearchPalette: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { todos } = useTodos(currentUser);

    const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                toggleOpen();
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        const handleCustomToggle = () => toggleOpen();
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('toggle-search', handleCustomToggle);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('toggle-search', handleCustomToggle);
        };
    }, [isOpen, toggleOpen]);

    const { meetingRequests } = useMeetings(currentUser);

    const navigationLinks = [
        { label: 'Calendario', path: '/calendar', icon: MapPin },
        { label: 'Tareas', path: '/tasks', icon: CheckSquare },
        { label: 'Reuniones', path: '/meetings', icon: Users },
        { label: 'Inventario Canet', path: '/inventory', icon: Boxes },
        { label: 'Inventario Huarte', path: '/inventory-facturacion', icon: Boxes },
        { label: 'Exportaciones', path: '/exports', icon: FileText },
    ];

    const results = query ? [
        ...navigationLinks.filter(link => link.label.toLowerCase().includes(query.toLowerCase())),
        ...todos.filter(todo => todo.title.toLowerCase().includes(query.toLowerCase())).map(t => ({
            label: t.title,
            path: `/tasks?task=${t.id}`,
            icon: CheckSquare,
            isTodo: true
        })),
        ...meetingRequests.filter(meeting => meeting.title.toLowerCase().includes(query.toLowerCase())).map(m => ({
            label: m.title,
            path: `/meetings?meeting=${m.id}`,
            icon: Users,
            isMeeting: true
        })),
        ...USERS.filter(user => user.name.toLowerCase().includes(query.toLowerCase())).map(u => ({
            label: u.name,
            path: '/dashboard',
            icon: Users,
            isUser: true
        }))
    ].slice(0, 8) : navigationLinks;

    const handleSelect = (path: string) => {
        navigate(path);
        setIsOpen(false);
        setQuery('');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 sm:px-6 md:px-8">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="w-full max-w-xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden relative z-10"
                    >
                        <div className="p-4 border-b border-border flex items-center gap-3">
                            <Search className="text-gray-400" size={20} />
                            <input
                                autoFocus
                                className="flex-1 bg-transparent border-none outline-none text-text placeholder:text-gray-400 text-base"
                                placeholder="Busca tareas, personas, páginas..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-400">
                                <span>ESC</span>
                            </div>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto p-2">
                            {results.length > 0 ? (
                                <div className="space-y-1">
                                    {results.map((result, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSelect(result.path)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 text-text group transition-all"
                                        >
                                            <result.icon size={18} className="text-gray-400 group-hover:text-primary" />
                                            <span className="text-sm font-medium">{result.label}</span>
                                            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Command size={14} className="text-gray-300" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-12 text-center">
                                    <p className="text-gray-400 text-sm">No se encontraron resultados para "{query}"</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SearchPalette;
