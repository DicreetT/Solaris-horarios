import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { USERS } from '../constants';

interface HeartbeatOrbProps {
    user: any;
    isActive: boolean;
}

const HeartbeatOrb: React.FC<HeartbeatOrbProps> = ({ user, isActive }) => {
    // Fixed deterministic position based on user ID to avoid jumping stars
    const pos = useMemo(() => {
        const hash = user.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
        return {
            x: (hash * 17) % 80 + 10,
            y: (hash * 31) % 80 + 10,
            delay: (hash % 50) / 10,
            duration: 15 + (hash % 15)
        };
    }, [user.id]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{
                opacity: isActive ? 1 : 0.4,
                scale: isActive ? [1, 1.2, 1] : 1,
                x: [0, 10, -5, 0],
                y: [0, -10, 5, 0]
            }}
            transition={{
                opacity: { duration: 2 },
                x: { duration: pos.duration, repeat: Infinity, ease: "easeInOut" },
                y: { duration: pos.duration * 0.8, repeat: Infinity, ease: "easeInOut" }
            }}
            className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2"
            style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
            }}
        >
            {/* Celestial Glow */}
            <motion.div
                animate={{
                    scale: isActive ? [1, 2, 1] : [1, 1.2, 1],
                    opacity: isActive ? [0.6, 0.9, 0.6] : [0.3, 0.5, 0.3]
                }}
                transition={{ duration: isActive ? 1.5 : 4, repeat: Infinity }}
                className={`
                    w-16 h-16 rounded-full blur-2xl
                    ${isActive ? 'bg-orange-400 shadow-[0_0_40px_rgba(251,146,60,0.4)]' : 'bg-primary/30'}
                `}
            />

            {/* Core Star */}
            <motion.div
                animate={isActive ? {
                    scale: [1, 1.5, 1],
                    boxShadow: [
                        "0 0 10px rgba(251,146,60,0.5)",
                        "0 0 25px rgba(251,146,60,0.9)",
                        "0 0 10px rgba(251,146,60,0.5)"
                    ]
                } : {}}
                transition={{ duration: 1, repeat: Infinity }}
                className={`
                    absolute w-2 h-2 rounded-full
                    ${isActive ? 'bg-white' : 'bg-white/40'}
                `}
            />

            {/* User Identification in the Stars */}
            <motion.div
                animate={{ opacity: isActive ? 1 : 0.4 }}
                className="absolute top-6 flex flex-col items-center pointer-events-none"
            >
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                    {user.name}
                </span>
                {isActive && (
                    <span className="text-[8px] font-bold text-orange-300 animate-pulse tracking-widest mt-0.5">
                        EN LÍNEA
                    </span>
                )}
            </motion.div>
        </motion.div>
    );
};

interface TeamHeartbeatProps {
    activeUsers: string[];
}

export const TeamHeartbeat: React.FC<TeamHeartbeatProps> = ({ activeUsers }) => {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden select-none z-0">
            {/* Space Window Mask */}
            <div className="absolute inset-0 bg-[#020617]/50" />

            {/* Nebulas and Cosmic Clouds */}
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_40%,#312e81_0%,transparent_50%)]" />
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_70%_60%,#4c1d95_0%,transparent_50%)]" />

            {/* Room lighting projection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-black/20" />

            {USERS.map(user => (
                <HeartbeatOrb
                    key={user.id}
                    user={user}
                    isActive={activeUsers.includes(user.id)}
                />
            ))}

            {/* Background Background Stars (Deep Cosmos) */}
            {[...Array(50)].map((_, i) => (
                <motion.div
                    key={`bg-star-${i}`}
                    initial={{ opacity: Math.random() }}
                    animate={{ opacity: [0.1, 0.4, 0.1] }}
                    transition={{ duration: 5 + Math.random() * 5, repeat: Infinity }}
                    className="absolute w-px h-px bg-white/40 rounded-full"
                    style={{
                        top: `${Math.random() * 100}%`,
                        left: `${Math.random() * 100}%`
                    }}
                />
            ))}
        </div>
    );
};
