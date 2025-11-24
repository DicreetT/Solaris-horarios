import React from 'react';
import { formatDatePretty } from '../utils/dateUtils';

interface Badge {
    type: string;
    label: string;
    color: string;
    icon: React.ReactNode;
    detail?: string;
}

interface DayHoverCardProps {
    date: Date;
    badges: Badge[];
}

export default function DayHoverCard({ date, badges }: DayHoverCardProps) {
    return (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 hidden group-hover:block animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-4 relative">
                {/* Arrow */}
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white drop-shadow-sm"></div>

                {/* Header */}
                <div className="mb-3 border-b border-gray-50 pb-2">
                    <h4 className="font-bold text-gray-900 text-sm capitalize">
                        {date.toLocaleDateString('es-ES', { weekday: 'long' })}
                    </h4>
                    <p className="text-xs text-gray-500 font-medium">
                        {formatDatePretty(date)}
                    </p>
                </div>

                {/* Content */}
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {badges.length > 0 ? (
                        badges.map((badge, idx) => (
                            <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                <div className={`mt-0.5 p-1 rounded-md ${badge.color} bg-opacity-20`}>
                                    {badge.icon}
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-gray-800 leading-tight mb-0.5">
                                        {badge.label}
                                    </p>
                                    {badge.detail && (
                                        <p className="text-[10px] text-gray-500 leading-tight line-clamp-2">
                                            {badge.detail}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-xs text-gray-400 italic text-center py-2">
                            Sin eventos registrados
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
