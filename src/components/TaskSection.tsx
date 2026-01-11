import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TaskSectionProps {
    title: string;
    count: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
    icon?: React.ReactNode;
}

export function TaskSection({ title, count, defaultOpen = false, children, icon }: TaskSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    if (count === 0 && !isOpen) return null; // Optional: hide empty sections completely? Or just show empty state inside? 
    // Let's show header even if empty to be explicit, but maybe opacity lowered.

    return (
        <div className="mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 rounded-xl border border-gray-100 dark:border-white/10 transition-all mb-2 group"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${isOpen ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-white/20'}`}>
                        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>

                    <div className="flex items-center gap-2">
                        {icon}
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h2>
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300 text-xs font-bold">
                            {count}
                        </span>
                    </div>
                </div>
            </button>

            {isOpen && (
                <div className="pl-2 md:pl-4 space-y-2 animate-[fadeIn_0.2s_ease-out]">
                    {children}
                </div>
            )}
        </div>
    );
}
